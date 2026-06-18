// ============================================================
// scripts/build-extension.mjs
// ============================================================
// Builds the Chrome (MV3) extension into dist-extension/ with esbuild.
// Deliberately NOT the Next.js build — the extension must not depend
// on the Next runtime. esbuild is the "acceptable" tool from the build
// doc: one small script, no config files, fast watch.
//
//   npm run build:extension     one-shot build
//   npm run watch:extension     rebuild on change
//
// Entry points and their output formats:
//   content.ts          -> content.js          (IIFE — content scripts
//                                                are classic scripts and
//                                                cannot use ES imports)
//   background.ts        -> background.js        (ESM — manifest declares
//                                                the worker type:module)
//   embedding.worker.ts  -> embedding.worker.js  (IIFE classic worker;
//                                                module workers can't be
//                                                spawned from a content
//                                                script's page origin in
//                                                MV3. This is the only
//                                                bundle pulling in
//                                                transformers.js.)
//   offscreen.ts         -> offscreen.js         (ESM — Option B stub)
//
// Static files (manifest, overlay.css, offscreen.html) and the ONNX
// Runtime .wasm are copied verbatim so the model runtime loads its
// WASM locally instead of from a CDN (MV3 forbids remote code).
// ============================================================

import * as esbuild from "esbuild";
import { rmSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const ext = resolve(root, "extension");
const out = resolve(root, "dist-extension");
const wasmOut = resolve(out, "assets/wasm");

const watch = process.argv.includes("--watch");

// transformers.js ships optional Node-only backends; stub them out for
// the browser exactly like next.config.ts does.
const EMPTY = resolve(root, "empty-module.ts");

// ORT runtime files that embedding.worker.ts points wasmPaths at. ORT
// loads the .wasm binary AND dynamically imports its .mjs JS glue from
// the same base, so BOTH must be present locally — otherwise ORT throws
// "no available backend found … Failed to fetch dynamically imported
// module … .jsep.mjs" and falls back to nothing (MV3 forbids fetching
// the runtime from a CDN).
const WASM_DIST = resolve(root, "node_modules/@huggingface/transformers/dist");
const WASM_FILES = [
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
];

/** Re-copy every static asset into dist-extension. Runs on each build
 *  so `watch` keeps the output complete. */
function copyStatic() {
  mkdirSync(wasmOut, { recursive: true });
  copyFileSync(resolve(ext, "manifest.json"), resolve(out, "manifest.json"));
  // Page-level highlight CSS is loaded onto the host document by the
  // manifest. The overlay UI CSS is NOT copied — it's bundled into
  // content.js as text and injected into the shadow root.
  copyFileSync(resolve(ext, "highlight.css"), resolve(out, "highlight.css"));
  copyFileSync(resolve(ext, "offscreen.html"), resolve(out, "offscreen.html"));

  for (const file of WASM_FILES) {
    const src = resolve(WASM_DIST, file);
    if (existsSync(src)) {
      copyFileSync(src, resolve(wasmOut, file));
    } else {
      console.warn(
        `\n[build:extension] WARNING: ${file} not found at\n  ${src}\n` +
          "Semantic search will fail to load its WASM runtime until this " +
          "file is present. Literal + keyword search still work.\n"
      );
    }
  }
}

/** esbuild plugin: copy static assets after every (re)build. */
const staticAssets = {
  name: "static-assets",
  setup(build) {
    build.onEnd((result) => {
      copyStatic();
      const errs = result.errors.length;
      const stamp = new Date().toLocaleTimeString();
      console.log(
        `[build:extension] ${stamp} ${errs ? `FAILED (${errs} errors)` : "ok"} -> dist-extension/`
      );
    });
  },
};

const shared = {
  bundle: true,
  platform: "browser",
  target: ["chrome111"],
  sourcemap: true,
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: {
    "onnxruntime-node": EMPTY,
    sharp: EMPTY,
  },
  logLevel: "info",
};

// Three configs because the output formats differ.
const configs = [
  {
    ...shared,
    entryPoints: { content: resolve(ext, "content.ts") },
    outdir: out,
    format: "iife",
    // Overlay CSS is imported as a string and injected into the shadow
    // root (content.ts), so it can't be broken by host-page styles.
    loader: { ".css": "text" },
    plugins: [staticAssets],
  },
  {
    ...shared,
    entryPoints: {
      background: resolve(ext, "background.ts"),
      offscreen: resolve(ext, "offscreen.ts"),
    },
    outdir: out,
    format: "esm",
  },
  {
    ...shared,
    entryPoints: { "embedding.worker": resolve(ext, "embedding.worker.ts") },
    outdir: out,
    // Classic worker (see embedding-client.ts): module workers can't be
    // constructed from a content script's page origin in MV3.
    format: "iife",
  },
];

async function run() {
  if (!watch) rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  if (watch) {
    const contexts = await Promise.all(configs.map((c) => esbuild.context(c)));
    await Promise.all(contexts.map((c) => c.watch()));
    console.log("[build:extension] watching for changes…");
  } else {
    await Promise.all(configs.map((c) => esbuild.build(c)));
    copyStatic();
    console.log("[build:extension] done -> dist-extension/");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
