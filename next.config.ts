// ============================================================
// next.config.ts
// ============================================================
// @huggingface/transformers ships optional Node-only backends
// (onnxruntime-node, sharp). We only run it in the browser, so we
// alias those out. Next.js 16 defaults to Turbopack, which ignores
// the webpack() hook — configure resolveAlias under turbopack.
// ============================================================

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@huggingface/transformers"],

  turbopack: {
    resolveAlias: {
      // Node-only optional deps — stub them out in the browser build.
      "onnxruntime-node": { browser: "./empty-module.ts" },
      sharp: { browser: "./empty-module.ts" },
    },
  },
};

export default nextConfig;