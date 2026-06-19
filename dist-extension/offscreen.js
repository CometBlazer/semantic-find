// extension/offscreen.ts
var WORKER_URL = chrome.runtime.getURL("embedding.worker.js");
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "sf-embed") return;
  const worker = new Worker(WORKER_URL);
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "vector") {
      port.postMessage({
        id: m.id,
        type: "vector",
        vector: Array.from(new Float32Array(m.buffer))
      });
    } else if (m.type === "vectors") {
      port.postMessage({
        id: m.id,
        type: "vectors",
        vectors: (m.buffers ?? []).map((b) => Array.from(new Float32Array(b)))
      });
    } else {
      port.postMessage(m);
    }
  };
  worker.onerror = (e) => {
    port.postMessage({
      type: "fatal",
      message: e.message || "embedding worker crashed"
    });
  };
  port.onMessage.addListener((msg) => worker.postMessage(msg));
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    worker.terminate();
  });
});
console.debug("[semantic-find] offscreen model host ready");
//# sourceMappingURL=offscreen.js.map
