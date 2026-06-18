// ============================================================
// lib/embedding.worker.ts
// ============================================================
// Runs the entire transformers.js pipeline OFF the main thread.
// The model is loaded here, every embed happens here, and only
// plain data crosses the worker boundary — so typing in the UI
// never janks on tokenization, tensor setup, or the forward pass,
// even on the WASM/CPU path.
//
// Protocol (main thread <-> worker), all messages carry an `id`
// so the client can match replies to requests:
//
//   → { id, type: "load" }
//   ← { id, type: "progress", status, file?, progress? }   (repeated)
//   ← { id, type: "ready", device }
//
//   → { id, type: "embedOne", text }
//   ← { id, type: "vector", buffer }            (buffer transferred)
//
//   → { id, type: "embedMany", texts }
//   ← { id, type: "embedProgress", done, total } (repeated)
//   ← { id, type: "vectors", buffers, dims }      (buffers transferred)
//
//   ← { id, type: "error", message }              (on any failure)
//
// Vectors are returned as transferred ArrayBuffers (zero-copy),
// re-wrapped as Float32Array on the other side.
// ============================================================

import {
  pipeline,
  env,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";

export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

env.allowLocalModels = false;

type Device = "webgpu" | "wasm";

let extractor: FeatureExtractionPipeline | null = null;
let device: Device = "wasm";

async function createExtractor(
  onProgress: (p: { status: string; file?: string; progress?: number }) => void
) {
  const progress_callback = (p: {
    status: string;
    file?: string;
    progress?: number;
  }) => {
    if (p.status === "progress" || p.status === "downloading") {
      onProgress({ status: "downloading", file: p.file, progress: p.progress });
    }
  };

  const hasWebGPU =
    typeof navigator !== "undefined" && "gpu" in navigator;

  if (hasWebGPU) {
    try {
      const ex = await pipeline("feature-extraction", MODEL_ID, {
        device: "webgpu",
        dtype: "fp32",
        progress_callback,
      });
      device = "webgpu";
      return ex;
    } catch (err) {
      // navigator.gpu can exist while adapter/shader init still fails;
      // WASM works everywhere.
      console.warn("[worker] WebGPU init failed, falling back to WASM:", err);
    }
  }

  const ex = await pipeline("feature-extraction", MODEL_ID, {
    device: "wasm",
    dtype: "q8",
    progress_callback,
  });
  device = "wasm";
  return ex;
}

async function embedOne(text: string): Promise<Float32Array> {
  const out = await extractor!(text, { pooling: "mean", normalize: true });
  return Float32Array.from(out.data as Float32Array);
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as {
    id: number;
    type: "load" | "embedOne" | "embedMany";
    text?: string;
    texts?: string[];
  };
  const { id, type } = msg;

  try {
    if (type === "load") {
      if (!extractor) {
        extractor = await createExtractor((p) =>
          (self as unknown as Worker).postMessage({ id, type: "progress", ...p })
        );
      }
      (self as unknown as Worker).postMessage({ id, type: "ready", device });
      return;
    }

    if (type === "embedOne") {
      const vec = await embedOne(msg.text!);
      // Transfer the underlying buffer — no copy.
      (self as unknown as Worker).postMessage(
        { id, type: "vector", buffer: vec.buffer },
        { transfer: [vec.buffer] }
      );
      return;
    }

    if (type === "embedMany") {
      const texts = msg.texts!;
      const vectors: Float32Array[] = [];
      for (let i = 0; i < texts.length; i++) {
        vectors.push(await embedOne(texts[i]));
        (self as unknown as Worker).postMessage({
          id,
          type: "embedProgress",
          done: i + 1,
          total: texts.length,
        });
      }
      const dims = vectors.length ? vectors[0].length : 0;
      const buffers = vectors.map((v) => v.buffer);
      (self as unknown as Worker).postMessage(
        { id, type: "vectors", buffers, dims },
        { transfer: buffers }
      );
      return;
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id,
      type: "error",
      message: err instanceof Error ? err.message : "worker error",
    });
  }
};