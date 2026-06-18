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
// ============================================================

const TOGGLE = "TOGGLE_SEMANTIC_FIND";

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
