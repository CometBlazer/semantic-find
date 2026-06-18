// ============================================================
// extension/embedding.worker.ts
// ============================================================
// Extension twin of lib/embedding.worker.ts. Same protocol, same
// model — but two differences that matter inside an MV3 extension:
//
//   1. WASM is loaded LOCALLY. ONNX Runtime would normally fetch its
//      .wasm from a CDN, which MV3's CSP treats as remote code and
//      blocks. We point env.backends.onnx.wasm.wasmPaths at files
//      bundled under the extension (assets/wasm/), passed in by the
//      content script via chrome.runtime.getURL on "load".
//   2. Model WEIGHTS are still fetched from the Hugging Face Hub on
//      first use (data, not code — allowed via host_permissions) and
//      cached by the browser. Bundling weights locally is a later,
//      optional step (see extension/README.md).
//
// A worker spawned from a content script has no chrome.* API, hence
// the wasmBase is handed in rather than computed here.
//
// Protocol (mirrors lib/embedding.worker.ts):
//   → { id, type: "load", wasmBase }
//   ← { id, type: "progress", status, file?, progress? }   (repeated)
//   ← { id, type: "ready", device }
//   → { id, type: "embedOne", text }   ← { id, type: "vector", buffer }
//   → { id, type: "embedMany", texts } ← { id, type: "vectors", buffers, dims }
//   ← { id, type: "error", message }
// ============================================================

import {
  pipeline,
  env,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

type Device = "webgpu" | "wasm";

let extractor: FeatureExtractionPipeline | null = null;
let device: Device = "wasm";

function configureEnv(wasmBase: string) {
  // Weights come from the Hub (data); runtime WASM is local (code).
  env.allowRemoteModels = true;
  env.allowLocalModels = false;
  if (wasmBase) {
    // Trailing slash matters: ORT appends the file name.
    env.backends.onnx.wasm.wasmPaths = wasmBase.endsWith("/")
      ? wasmBase
      : `${wasmBase}/`;
  }
  // Threads need cross-origin isolation we can't guarantee on every
  // host page; single-threaded WASM is the safe default.
  env.backends.onnx.wasm.numThreads = 1;
}

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

  // WebGPU is unavailable in workers on most setups; go straight to
  // WASM, which is the reliable path inside an extension worker.
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
    wasmBase?: string;
  };
  const { id, type } = msg;
  const post = (m: Record<string, unknown>, transfer?: Transferable[]) =>
    (self as unknown as Worker).postMessage({ id, ...m }, transfer ?? []);

  try {
    if (type === "load") {
      if (!extractor) {
        configureEnv(msg.wasmBase ?? "");
        extractor = await createExtractor((p) => post({ type: "progress", ...p }));
      }
      post({ type: "ready", device });
      return;
    }

    if (type === "embedOne") {
      const vec = await embedOne(msg.text!);
      post({ type: "vector", buffer: vec.buffer }, [vec.buffer]);
      return;
    }

    if (type === "embedMany") {
      const texts = msg.texts!;
      const vectors: Float32Array[] = [];
      for (let i = 0; i < texts.length; i++) {
        vectors.push(await embedOne(texts[i]));
        post({ type: "embedProgress", done: i + 1, total: texts.length });
      }
      const dims = vectors.length ? vectors[0].length : 0;
      const buffers = vectors.map((v) => v.buffer);
      post({ type: "vectors", buffers, dims }, buffers);
      return;
    }
  } catch (err) {
    post({
      type: "error",
      message: err instanceof Error ? err.message : "worker error",
    });
  }
};
