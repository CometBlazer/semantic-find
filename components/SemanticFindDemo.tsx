// ============================================================
// lib/embedding-client.ts
// ============================================================
// Main-thread façade over lib/embedding.worker.ts. Exposes the
// SAME surface the component used to import from lib/embedding.ts
// (MODEL_ID, Device, getExtractor, embedText, embedChunks) so the
// orchestration code barely changes — but every model call now
// happens in the worker, off the UI thread.
//
// "extractor" is now an opaque handle (there's no pipeline object
// on this side anymore); the component just passes it back into
// embedText/embedChunks, which ignore it and talk to the worker.
// Kept in the signature so call sites don't churn.
// ============================================================

export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

export type Device = "webgpu" | "wasm";

export interface ModelProgress {
  status: string;
  file?: string;
  progress?: number;
}

/** Opaque handle returned by getExtractor; carries nothing the
 *  caller needs to touch. */
export type ExtractorHandle = { readonly _worker: true };
const HANDLE: ExtractorHandle = { _worker: true };

// ---- Worker singleton + message routing ----------------------

let worker: Worker | null = null;
let nextId = 1;

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onProgress?: (p: ModelProgress) => void;
  onEmbedProgress?: (done: number, total: number) => void;
};
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (!worker) {
    // Next.js / modern bundlers understand this URL form and will
    // bundle the worker as a separate chunk.
    worker = new Worker(new URL("./embedding.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as {
        id: number;
        type: string;
        device?: Device;
        buffer?: ArrayBuffer;
        buffers?: ArrayBuffer[];
        dims?: number;
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
          p.resolve(
            (m.buffers ?? []).map((b) => new Float32Array(b))
          );
          break;
        case "error":
          pending.delete(m.id);
          p.reject(new Error(m.message ?? "worker error"));
          break;
      }
    };
    worker.onerror = (e) => {
      // Fail every in-flight request; the worker is unusable.
      for (const [, p] of pending) p.reject(new Error(e.message));
      pending.clear();
    };
  }
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

// ---- Public API (mirrors the old lib/embedding.ts) -----------

/** Load the model in the worker. Resolves once it's ready. The
 *  returned `extractor` is an opaque handle kept for call-site
 *  compatibility. */
export async function getExtractor(
  onProgress?: (p: ModelProgress) => void
): Promise<{ extractor: ExtractorHandle; device: Device }> {
  const { device } = await call<{ device: Device }>(
    { type: "load" },
    { onProgress }
  );
  return { extractor: HANDLE, device };
}

/** Embed a single string. The `_extractor` arg is ignored (the
 *  worker holds the real pipeline) but kept for signature parity. */
export async function embedText(
  _extractor: ExtractorHandle,
  text: string
): Promise<Float32Array> {
  return call<Float32Array>({ type: "embedOne", text });
}

/** Embed many strings sequentially in the worker, reporting
 *  per-item progress. */
export async function embedChunks(
  _extractor: ExtractorHandle,
  texts: string[],
  onProgress?: (done: number, total: number) => void
): Promise<Float32Array[]> {
  return call<Float32Array[]>(
    { type: "embedMany", texts },
    { onEmbedProgress: onProgress }
  );
}

/** Re-export for the FeatureExtractionPipeline type some call sites
 *  referenced. It's now just the opaque handle. */
export type FeatureExtractionPipeline = ExtractorHandle;