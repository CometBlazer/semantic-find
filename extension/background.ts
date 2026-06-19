// ============================================================
// extension/background.ts  (MV3 service worker)
// ============================================================
// Tiny by design. The service worker's only job is to turn the
// Alt+Shift+K keyboard command into a message the content script
// can act on. All real work (extraction, search, embedding) lives
// in the content script / its worker so it has direct DOM access.
//
// We also forward the toolbar-icon click to the same toggle, so the
// extension is usable even if the OS swallows the keyboard shortcut.
//
// MV3 also makes the service worker the only context that can create an
// OFFSCREEN DOCUMENT, which is where the embedding model runs (Option B).
// The model can't run in a page-origin worker: the host page's CSP blocks
// the Hugging Face download. An offscreen document runs in the extension's
// origin, so its fetch is governed by host_permissions instead. The
// content script asks us (SF_ENSURE_OFFSCREEN) to create it on demand.
// ============================================================

const TOGGLE = "TOGGLE_SEMANTIC_FIND";

// Only one offscreen document may exist per extension; dedupe concurrent
// creation so racing content scripts don't fight over it.
let creatingOffscreen: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  if (creatingOffscreen) return creatingOffscreen;
  creatingOffscreen = chrome.offscreen
    .createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification:
        "Runs the local embedding model worker in the extension's origin " +
        "so the host page's CSP can't block the model download.",
    })
    .catch((err: unknown) => {
      // A concurrent caller may have created it first — that's fine.
      if (!String((err as Error)?.message ?? err).includes("single offscreen")) {
        throw err;
      }
    })
    .finally(() => {
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
    return true; // keep the channel open for the async response
  }
});

async function toggleActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: TOGGLE });
  } catch {
    // No content script on this tab (e.g. chrome:// pages, the Web
    // Store, or a tab loaded before install). Nothing we can do —
    // swallow so the worker doesn't log an unhandled rejection.
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-semantic-find") void toggleActiveTab();
});

// Clicking the toolbar icon toggles too (no popup is declared).
chrome.action?.onClicked.addListener(() => void toggleActiveTab());
