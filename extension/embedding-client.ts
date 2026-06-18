// ============================================================
// extension/embedding-client.ts
// ============================================================
// Content-script-side façade over the embedding model. Mirrors the
// public API of lib/embedding-client.ts (loadModel / embedText /
// embedChunks) so the orchestration code reads the same.
//
// The model does NOT run in the content script's worker anymore. A
// content script lives in the HOST PAGE's origin, and a worker spawned
// there is bound by the host page's Content Security Policy — which on
// locked-down sites (Wikipedia, etc.) blocks the Hugging Face model
// download outright. Instead the model runs in an OFFSCREEN DOCUMENT
// (extension origin, governed by the extension's CSP + host_permissions).
//
// Flow:
//   1. ask the service worker to create the offscreen document,
//   2. open a long-lived Port ("sf-embed") to it,
//   3. speak the embedding.worker.ts protocol over that port.
//
// chrome.runtime ports serialize as JSON, so vectors cross the port as
// plain number[] arrays (the offscreen side unwraps the worker's
// ArrayBuffers); we rebuild Float32Arrays here.
// ============================================================

export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

export interface ModelProgress {
  status: string;
  file?: string;
  progress?: number;
}

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onProgress?: (p: ModelProgress) => void;
  onEmbedProgress?: (done: number, total: number) => void;
};

let port: chrome.runtime.Port | null = null;
let portPromise: Promise<chrome.runtime.Port> | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function rejectAll(err: Error): void {
  for (const [, p] of pending) p.reject(err);
  pending.clear();
}

async function getPort(): Promise<chrome.runtime.Port> {
  if (port) return port;
  if (portPromise) return portPromise;

  portPromise = (async () => {
    // The service worker is the only context allowed to create the
    // offscreen document; make sure it exists before we connect.
    await chrome.runtime.sendMessage({ type: "SF_ENSURE_OFFSCREEN" });

    const p = chrome.runtime.connect({ name: "sf-embed" });

    p.onMessage.addListener((m: Record<string, unknown> & { id?: number; type?: string }) => {
      // Fatal worker errors carry no id — fail everything in flight.
      if (m.type === "fatal") {
        rejectAll(new Error((m.message as string) ?? "embedding worker crashed"));
        return;
      }
      const entry = pending.get(m.id as number);
      if (!entry) return;

      switch (m.type) {
        case "progress":
          entry.onProgress?.({
            status: (m.status as string) ?? "downloading",
            file: m.file as string | undefined,
            progress: m.progress as number | undefined,
          });
          break;
        case "embedProgress":
          entry.onEmbedProgress?.((m.done as number) ?? 0, (m.total as number) ?? 0);
          break;
        case "ready":
          pending.delete(m.id as number);
          entry.resolve({ device: m.device });
          break;
        case "vector":
          pending.delete(m.id as number);
          entry.resolve(Float32Array.from((m.vector as number[]) ?? []));
          break;
        case "vectors":
          pending.delete(m.id as number);
          entry.resolve(((m.vectors as number[][]) ?? []).map((v) => Float32Array.from(v)));
          break;
        case "error":
          pending.delete(m.id as number);
          entry.reject(new Error((m.message as string) ?? "model error"));
          break;
      }
    });

    p.onDisconnect.addListener(() => {
      const reason = chrome.runtime.lastError?.message ?? "offscreen model port disconnected";
      rejectAll(new Error(reason));
      // Drop the cached port so the next call re-creates the offscreen
      // document and reconnects.
      port = null;
      portPromise = null;
    });

    port = p;
    return p;
  })();

  // If setup fails, clear the memo so a later attempt can retry.
  portPromise.catch(() => {
    portPromise = null;
  });
  return portPromise;
}

function call<T>(
  message: Record<string, unknown>,
  opts?: {
    onProgress?: (p: ModelProgress) => void;
    onEmbedProgress?: (done: number, total: number) => void;
  }
): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
      onProgress: opts?.onProgress,
      onEmbedProgress: opts?.onEmbedProgress,
    });
    getPort().then(
      (p) => p.postMessage({ id, ...message }),
      (err) => {
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    );
  });
}

/** Load the model in the offscreen document. Passes the bundled WASM base
 *  (an extension-absolute URL, valid in the offscreen origin too) so ORT
 *  never reaches for remote runtime code. */
export async function loadModel(
  onProgress?: (p: ModelProgress) => void
): Promise<{ device: string }> {
  const wasmBase = chrome.runtime.getURL("assets/wasm/");
  return call<{ device: string }>({ type: "load", wasmBase }, { onProgress });
}

export async function embedText(text: string): Promise<Float32Array> {
  return call<Float32Array>({ type: "embedOne", text });
}

export async function embedChunks(
  texts: string[],
  onProgress?: (done: number, total: number) => void
): Promise<Float32Array[]> {
  return call<Float32Array[]>(
    { type: "embedMany", texts },
    { onEmbedProgress: onProgress }
  );
}
