// ============================================================
// next.config.ts
// ============================================================
// @huggingface/transformers ships optional Node-only backends
// (onnxruntime-node, sharp). We only ever run it in the browser,
// so we alias those out of the webpack graph to avoid build
// errors / accidental server bundling.
//
// If you run `next dev --turbopack`, the webpack() hook is ignored;
// `serverExternalPackages` below covers Turbopack, and because the
// library is only imported inside a client component behind a
// dynamic ssr:false boundary, the server never touches it anyway.
// ============================================================

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Never try to bundle transformers.js for the server runtime.
  serverExternalPackages: ["@huggingface/transformers"],

  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // Node-only optional deps — not needed in the browser build.
      "onnxruntime-node$": false,
      sharp$: false,
    };
    return config;
  },
};

export default nextConfig;
