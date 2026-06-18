// ============================================================
// extension/embedding-client.ts
// ============================================================
// Content-script-side façade over embedding.worker.ts. Mirrors the
// public API of lib/embedding-client.ts (getExtractor / embedText /
// embedChunks) so the orchestration code reads the same — but the
// worker is spawned from an EXTENSION url (chrome.runtime.getURL),
// not a bundler URL, and the local WASM base is handed to it.
//
// Spawning the worker from a content script with an extension URL is
// the "Option A" runtime from the build doc: simplest path, model
// instance per tab. If a host page's CSP ever blocks this, the
// offscreen-document approach (Option B, stubbed in offscreen.ts) is
// the documented upgrade.
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

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;

  // Loaded as a module worker from the extension origin so it can
  // import the bundled transformers.js and reach the Hub via the
  // extension's host permissions.
  const url = chrome.runtime.getURL("embedding.worker.js");
  worker = new Worker(url, { type: "module" });

  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as {
      id: number;
      type: string;
      device?: string;
      buffer?: ArrayBuffer;
      buffers?: ArrayBuffer[];
      message?: string;
      status?: string;
      file?: string;
      progress?: number;
      done?: number;
      total?: number;
    };
    const p = pending.get(m.id);
    if (!p) return;

    switch (m.type) {
      case "progress":
        p.onProgress?.({
          status: m.status ?? "downloading",
          file: m.file,
          progress: m.progress,
        });
        break;
      case "embedProgress":
        p.onEmbedProgress?.(m.done ?? 0, m.total ?? 0);
        break;
      case "ready":
        pending.delete(m.id);
        p.resolve({ device: m.device });
        break;
      case "vector":
        pending.delete(m.id);
        p.resolve(new Float32Array(m.buffer!));
        break;
      case "vectors":
        pending.delete(m.id);
        p.resolve((m.buffers ?? []).map((b) => new Float32Array(b)));
        break;
      case "error":
        pending.delete(m.id);
        p.reject(new Error(m.message ?? "worker error"));
        break;
    }
  };
  worker.onerror = (e) => {
    for (const [, p] of pending) p.reject(new Error(e.message || "worker crashed"));
    pending.clear();
  };
  return worker;
}

function call<T>(
  message: Record<string, unknown>,
  opts?: {
    transfer?: Transferable[];
    onProgress?: (p: ModelProgress) => void;
    onEmbedProgress?: (done: number, total: number) => void;
  }
): Promise<T> {
  const w = getWorker();
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
      onProgress: opts?.onProgress,
      onEmbedProgress: opts?.onEmbedProgress,
    });
    w.postMessage({ id, ...message }, opts?.transfer ?? []);
  });
}

/** Load the model in the worker. Passes the bundled WASM base so ORT
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
