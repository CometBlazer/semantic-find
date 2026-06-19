// extension/background.ts
var TOGGLE = "TOGGLE_SEMANTIC_FIND";
var creatingOffscreen = null;
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (creatingOffscreen) return creatingOffscreen;
  creatingOffscreen = chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: "Runs the local embedding model worker in the extension's origin so the host page's CSP can't block the model download."
  }).catch((err) => {
    if (!String(err?.message ?? err).includes("single offscreen")) {
      throw err;
    }
  }).finally(() => {
    creatingOffscreen = null;
  });
  return creatingOffscreen;
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SF_ENSURE_OFFSCREEN") {
    ensureOffscreen().then(
      () => sendResponse({ ok: true }),
      (err) => sendResponse({ ok: false, error: String(err?.message ?? err) })
    );
    return true;
  }
});
async function toggleActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: TOGGLE });
  } catch {
  }
}
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-semantic-find") void toggleActiveTab();
});
chrome.action?.onClicked.addListener(() => void toggleActiveTab());
//# sourceMappingURL=background.js.map
