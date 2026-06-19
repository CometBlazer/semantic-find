// ============================================================
// extension/live-find.ts
// ============================================================
// True Ctrl+F for EXACT matches.
//
// extension-search.ts ranks a one-time chunk SNAPSHOT — great for finding
// by MEANING, but for literal find-in-page it has three problems vs the
// browser's own find bar: the snapshot goes stale on SPAs (Gmail renders
// more after you open the finder), literal hits get gated/ranked/capped,
// and results are chunk-level, not occurrence-level.
//
// This module is the fix: it scans the LIVE DOM on every query and marks
// EVERY occurrence of the raw query string — exhaustively, instantly,
// uncapped, ungated — exactly like Ctrl+F. It runs alongside (not instead
// of) the semantic pipeline; the ranking algorithm is untouched.
//
// Highlighting uses the CSS Custom Highlight API (`CSS.highlights` +
// `Range`), which paints ranges WITHOUT mutating the page DOM. That's
// essential: on React/SPA pages (Gmail, claude.ai) injecting <mark> tags
// fights the framework's reconciler and gets wiped — and it's far faster.
// Clearing is just dropping the highlight; nothing to unwind.
// ============================================================

// `Highlight` is a browser global (Chrome 105+); declare it for the type
// checker (esbuild strips this; the runtime object is real).
declare const Highlight: { new (...ranges: Range[]): unknown };

interface HighlightRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}

const HL_ALL = "sf-find"; // every match — styled via ::highlight(sf-find)
const HL_CURRENT = "sf-find-current"; // the active match
const OVERLAY_ID = "semantic-find-extension-root";
const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TEXTAREA", "SELECT", "OPTION",
]);

let ranges: Range[] = [];
let current = -1;

function registry(): HighlightRegistry | null {
  const css = CSS as unknown as { highlights?: HighlightRegistry };
  return css.highlights ?? null;
}

function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.visibility === "collapse"
  ) {
    return false;
  }
  // No box at all => not rendered (covers ancestor display:none too).
  return el.getClientRects().length > 0;
}

/** Drop all live-find highlighting. Cheap — no DOM to restore. */
export function clearLiveFind(): void {
  const reg = registry();
  if (reg) {
    reg.delete(HL_ALL);
    reg.delete(HL_CURRENT);
  }
  ranges = [];
  current = -1;
}

/**
 * Re-scan the live DOM and highlight every exact (case-insensitive)
 * occurrence of `query`. Returns the match count. Does NOT scroll — call
 * setCurrentMatch() to jump to one.
 */
export function runLiveFind(query: string): number {
  clearLiveFind();
  const reg = registry();
  const needle = query.trim();
  if (!reg || !needle || !document.body) return 0;

  const lower = needle.toLowerCase();
  const len = needle.length;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const value = node.nodeValue;
      const parent = node.parentElement;
      if (!value || !parent) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest(`#${OVERLAY_ID}`)) return NodeFilter.FILTER_REJECT;
      // Cheap text test before the (pricier) layout/visibility check.
      if (!value.toLowerCase().includes(lower)) return NodeFilter.FILTER_REJECT;
      if (!isVisible(parent)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const found: Range[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? "";
    const lowerText = text.toLowerCase();
    let from = 0;
    for (;;) {
      const at = lowerText.indexOf(lower, from);
      if (at === -1) break;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + len);
      found.push(range);
      from = at + len; // non-overlapping
    }
  }

  ranges = found;
  if (ranges.length) reg.set(HL_ALL, new Highlight(...ranges));
  return ranges.length;
}

/** Make match `index` (wraps around) the current one: emphasize it and
 *  scroll it into view if off-screen. */
export function setCurrentMatch(index: number): void {
  const reg = registry();
  const n = ranges.length;
  if (!reg || n === 0) return;
  current = ((index % n) + n) % n;
  reg.set(HL_CURRENT, new Highlight(ranges[current]));

  const range = ranges[current];
  const rect = range.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const onScreen = rect.top >= 0 && rect.bottom <= vh;
  if (!onScreen) {
    range.startContainer.parentElement?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }
}

export function nextMatch(): void {
  setCurrentMatch(current + 1);
}

export function prevMatch(): void {
  setCurrentMatch(current - 1);
}

export function matchCount(): number {
  return ranges.length;
}

/** 0-based index of the current match, or -1 when there are none. */
export function currentMatchIndex(): number {
  return current;
}

/** Whether the browser supports the CSS Custom Highlight API at all. */
export function liveFindSupported(): boolean {
  return registry() !== null;
}
