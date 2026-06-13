// ============================================================
// lib/embedding.ts
// ============================================================
// All transformers.js code lives here, and this module is only
// ever imported from a client component ("use client") that is
// itself loaded with `dynamic(..., { ssr: false })`. The model
// therefore never runs — or even loads — on the Next.js server.
//
// Pipeline: feature-extraction (sentence embeddings), NOT text
// generation. The model maps text -> a 384-dim vector; nothing
// is "generated" and no external inference API is called. The
// only network traffic is the one-time download of the model
// weights (~25 MB quantized), which the library caches in the
// browser's Cache Storage for subsequent visits.
// ============================================================

import {
  pipeline,
  env,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";

/** Small, fast sentence-embedding model. 384 dimensions. */
export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

// Fetch weights from the Hugging Face Hub; don't probe for
// local model files (avoids 404 noise against /models/...).
env.allowLocalModels = false;

export type Device = "webgpu" | "wasm";

export interface ModelProgress {
  /** e.g. "downloading", "ready" */
  status: string;
  /** File currently downloading, if any. */
  file?: string;
  /** 0–100 for the current file. */
  progress?: number;
}

// ---- Singleton ------------------------------------------------
// React StrictMode mounts effects twice in dev, and the user may
// re-trigger indexing. A module-level promise guarantees the
// pipeline (and its 25 MB download) is created exactly once.
let extractorPromise: Promise<{
  extractor: FeatureExtractionPipeline;
  device: Device;
}> | null = null;

export function getExtractor(
  onProgress?: (p: ModelProgress) => void
): Promise<{ extractor: FeatureExtractionPipeline; device: Device }> {
  if (!extractorPromise) {
    extractorPromise = createExtractor(onProgress).catch((err) => {
      extractorPromise = null; // allow retry after failure
      throw err;
    });
  }
  return extractorPromise;
}

async function createExtractor(onProgress?: (p: ModelProgress) => void) {
  const progress_callback = (p: {
    status: string;
    file?: string;
    progress?: number;
  }) => {
    if (p.status === "progress" || p.status === "downloading") {
      onProgress?.({ status: "downloading", file: p.file, progress: p.progress });
    }
  };

  // Prefer WebGPU when the browser exposes it; fall back to WASM.
  // The try/catch matters: navigator.gpu can exist while adapter
  // creation or shader compilation still fails (e.g. some Linux
  // driver setups), and WASM works everywhere.
  const hasWebGPU =
    typeof navigator !== "undefined" && "gpu" in navigator;

  if (hasWebGPU) {
    try {
      const extractor = await pipeline("feature-extraction", MODEL_ID, {
        device: "webgpu",
        dtype: "fp32",
        progress_callback,
      });
      return { extractor, device: "webgpu" as const };
    } catch (err) {
      console.warn("[embedding] WebGPU init failed, falling back to WASM:", err);
    }
  }

  const extractor = await pipeline("feature-extraction", MODEL_ID, {
    device: "wasm",
    dtype: "q8", // quantized weights: smaller download, fast on CPU
    progress_callback,
  });
  return { extractor, device: "wasm" as const };
}

// ---- Embedding ------------------------------------------------

/**
 * Embed one piece of text into a unit-length Float32Array.
 *
 * `pooling: "mean"` averages the token embeddings into a single
 * sentence vector; `normalize: true` makes it unit length so a
 * dot product equals cosine similarity.
 */
export async function embedText(
  extractor: FeatureExtractionPipeline,
  text: string
): Promise<Float32Array> {
  const output = await extractor(text, { pooling: "mean", normalize: true });
  // output.data is a typed array of length 384.
  return Float32Array.from(output.data as Float32Array);
}

/**
 * Embed many chunks, one at a time, reporting progress after each.
 * Sequential (rather than one batched call) keeps peak memory low
 * and lets the UI show a real per-chunk progress bar.
 */
export async function embedChunks(
  extractor: FeatureExtractionPipeline,
  texts: string[],
  onProgress?: (done: number, total: number) => void
): Promise<Float32Array[]> {
  const vectors: Float32Array[] = [];
  for (let i = 0; i < texts.length; i++) {
    vectors.push(await embedText(extractor, texts[i]));
    onProgress?.(i + 1, texts.length);
    // Yield to the event loop so the progress bar actually paints
    // (matters most on the WASM/CPU path, which blocks the thread).
    await new Promise((r) => setTimeout(r, 0));
  }
  return vectors;
}
