// ============================================================
// extension/offscreen.ts  (Option B model runtime)
// ============================================================
// The offscreen document is an EXTENSION-ORIGIN page, so a Worker
// spawned here runs in the extension's origin too — its Hugging Face
// fetch is governed by host_permissions, NOT the host page's Content
// Security Policy. (A worker spawned from the content script runs in the
// page's origin, where the page's CSP blocks the model download — that's
// the whole reason this document exists.)
//
// Wiring:
//   content (embedding-client.ts) --Port "sf-embed"--> here
//   here --new Worker--> embedding.worker.ts  (transformers.js pipeline)
//
// One worker per connection (per tab), torn down when the port closes.
// The protocol is embedding.worker.ts's verbatim, with one translation:
// chrome.runtime ports serialize messages as JSON, so the worker's
// transferable ArrayBuffers are unwrapped into plain number[] arrays
// before they cross the port (and rebuilt into Float32Arrays on the
// content side).
// ============================================================

const WORKER_URL = chrome.runtime.getURL("embedding.worker.js");

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "sf-embed") return;

  const worker = new Worker(WORKER_URL);

  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as {
      id: number;
      type: string;
      buffer?: ArrayBuffer;
      buffers?: ArrayBuffer[];
    };
    if (m.type === "vector") {
      port.postMessage({
        id: m.id,
        type: "vector",
        vector: Array.from(new Float32Array(m.buffer!)),
      });
    } else if (m.type === "vectors") {
      port.postMessage({
        id: m.id,
        type: "vectors",
        vectors: (m.buffers ?? []).map((b) => Array.from(new Float32Array(b))),
      });
    } else {
      // progress / embedProgress / ready / error — JSON-safe already.
      port.postMessage(m);
    }
  };

  // A worker load/parse failure carries no message id, so we can't map it
  // to one pending request — surface it as a fatal so the client rejects
  // everything in flight with the reason.
  worker.onerror = (e: ErrorEvent) => {
    port.postMessage({
      type: "fatal",
      message: e.message || "embedding worker crashed",
    });
  };

  // Inbound (load / embedOne / embedMany) carries no buffers — forward it.
  port.onMessage.addListener((msg) => worker.postMessage(msg));
  port.onDisconnect.addListener(() => worker.terminate());
});

console.debug("[semantic-find] offscreen model host ready");
