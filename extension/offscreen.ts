// ============================================================
// extension/offscreen.ts
// ============================================================
// Stub for the "Option B" model runtime (see offscreen.html). The
// current shipping path is Option A: embedding.worker.ts spawned from
// the content script via embedding-client.ts. This file exists so the
// upgrade is a wiring exercise, not a rewrite.
//
// To activate Option B:
//   1. manifest.json: add "offscreen" to permissions.
//   2. background.ts: chrome.offscreen.createDocument({ url:
//      "offscreen.html", reasons: ["WORKERS"], justification: ... }).
//   3. Route content -> background -> here, owning the Transformers.js
//      pipeline (reuse the protocol from embedding.worker.ts).
// ============================================================

export {};

// Intentionally empty for now. The offscreen document loads but does
// no work until the routing above is implemented.
console.debug("[semantic-find] offscreen document ready (Option B not wired)");
