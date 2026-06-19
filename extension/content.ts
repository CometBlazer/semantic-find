// ============================================================
// extension/content.ts
// ============================================================
// The content script: the only piece that touches the host page. It
//   - builds a Shadow-DOM overlay so the host page's CSS can't break
//     it and our CSS can't leak onto the page,
//   - extracts page text into a PageIndex on first open,
//   - runs hybrid search (substring + keyword now, semantic when the
//     model is ready) with debounced input,
//   - scrolls to + highlights the chosen result on the real page.
//
// Plain DOM, no React: smaller bundle, nothing to hydrate, and one
// less way for a host page to interfere. Everything degrades — if the
// embedding model never loads, literal + keyword search still work.
// ============================================================

import { extractBlocks, type ExtractResult } from "./extractor";
import { PageIndex, type SearchResult } from "./extension-search";
import { highlightElement, clearHighlights } from "./highlighter";
import {
  runLiveFind,
  clearLiveFind,
  setCurrentMatch,
  nextMatch,
  prevMatch,
  currentMatchIndex,
} from "./live-find";
import { loadModel, embedText, embedChunks, MODEL_ID } from "./embedding-client";
import { PROVENANCE_META, PROVENANCE_ORDER, type Provenance } from "../lib/provenance";
import { loadEmbeddings, saveEmbeddings } from "../lib/cache";
import type { Chunk } from "../lib/chunk";
// Bundled as a string by esbuild's `text` loader and injected into the
// shadow root — page CSS can't reach (or break) the overlay UI.
import overlayCss from "./overlay.css";

const ROOT_ID = "semantic-find-extension-root";
const SEARCH_DEBOUNCE_MS = 120;
const SEMANTIC_DEBOUNCE_MS = 200;

// ---- Per-page state (built lazily on first open) -------------
let page: PageIndex | null = null;
let extraction: ExtractResult | null = null;
let modelState: "idle" | "loading" | "ready" | "failed" = "idle";

// ---- Overlay DOM handles -------------------------------------
let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let els: {
  panel: HTMLElement;
  input: HTMLInputElement;
  status: HTMLElement;
  meta: HTMLElement;
  list: HTMLElement;
  filters: HTMLElement;
} | null = null;

let isOpen = false;
let activeIdx = 0;
let lastResults: SearchResult[] = [];
let lastQuery = "";
const visibleTags: Record<Provenance, boolean> = {
  exact: true,
  close: true,
  related: true,
  loose: true,
};
let searchTimer: number | undefined;
let semanticTimer: number | undefined;
let searchSeq = 0;
let debugOn = false;
// Count of exact on-page occurrences from the last live (Ctrl+F) scan.
let lastLiteralCount = 0;
// Which edge the overlay docks to; toggled by the ⇄ header button so it
// can be moved off whatever it's covering.
let side: "right" | "left" = "right";
// Per-category result counts shown on the filter chips.
const filterCountEls: Partial<Record<Provenance, HTMLElement>> = {};

// =============================================================
// Overlay construction (Shadow DOM)
// =============================================================
async function ensureOverlay(): Promise<void> {
  if (host) return;

  host = document.createElement("div");
  host.id = ROOT_ID;
  shadow = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  // Some SPAs (e.g. claude.ai) attach GLOBAL keyboard handlers to
  // document/window that "type to focus" their own composer or fire
  // shortcuts. Keyboard events are composed:true, so a keystroke in our
  // shadow-DOM input bubbles out into the host page and triggers those
  // handlers — which steal the character into their text box even though
  // our input has focus. Stop overlay-originated key/input events from
  // escaping the host. These run in the BUBBLE phase (default), so our
  // own input + onInputKeyDown have already handled the event by the time
  // we halt it; we only prevent it reaching the page's listeners. We do
  // NOT preventDefault, so typing into our input still works normally.
  const swallow = (e: Event) => e.stopPropagation();
  for (const type of ["keydown", "keypress", "keyup", "beforeinput", "input"]) {
    host.addEventListener(type, swallow);
  }

  // Inject the overlay stylesheet into the shadow root. It's bundled
  // into content.js as text (esbuild `text` loader), so there's no
  // fetch to be blocked and no host-page CSS bleed. content_scripts
  // CSS (highlight.css) styles the PAGE, not this shadow root.
  const style = document.createElement("style");
  style.textContent = overlayCss;
  shadow.appendChild(style);

  const panel = h("div", "sf-ext-overlay");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Semantic Find");

  const header = h("div", "sf-ext-head");
  const title = h("span", "sf-ext-title", "Semantic Find");
  const status = h("span", "sf-ext-status");
  const move = h("button", "sf-ext-move", "⇄");
  move.setAttribute("aria-label", "Move to other side");
  move.title =
    "Move the panel to the other side (Alt+Shift+← / Alt+Shift+→)";
  move.addEventListener("click", () => toggleSide());
  const dbg = h("button", "sf-ext-dbg", "🐞");
  dbg.setAttribute("aria-label", "Toggle debug info");
  dbg.title = "Toggle debug info (chunk/anchor/block mapping)";
  dbg.addEventListener("click", () => {
    debugOn = !debugOn;
    dbg.classList.toggle("sf-ext-dbg-on", debugOn);
    renderResults(lastResults);
  });
  const close = h("button", "sf-ext-close", "✕");
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", () => closeOverlay());
  header.append(title, status, move, dbg, close);

  const input = document.createElement("input");
  input.className = "sf-ext-input";
  input.type = "text";
  input.placeholder = "Find on page — words, fragments, typos, or meaning";
  input.setAttribute("aria-label", "Search query");
  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onInputKeyDown);

  const meta = h("div", "sf-ext-meta");
  const list = h("ul", "sf-ext-results");
  const filters = h("div", "sf-ext-filters");

  panel.append(header, input, meta, filters, list);
  shadow.append(panel);

  els = { panel, input, status, meta, list, filters };
  buildFilters();
  applySide();
}

function applySide(): void {
  els?.panel.classList.toggle("sf-ext-left", side === "left");
}

function setSide(next: "right" | "left"): void {
  side = next;
  applySide();
}

function toggleSide(): void {
  setSide(side === "right" ? "left" : "right");
}

function h(tag: string, className: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function buildFilters(): void {
  if (!els) return;
  els.filters.replaceChildren();
  for (const tag of PROVENANCE_ORDER) {
    const label = h("label", "sf-ext-filter");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = visibleTags[tag];
    box.addEventListener("change", () => {
      visibleTags[tag] = box.checked;
      renderResults(lastResults);
    });
    const dot = h("span", `sf-ext-dot ${PROVENANCE_META[tag].className}`);
    const count = h("span", "sf-ext-filter-count", "0");
    filterCountEls[tag] = count;
    label.append(
      box,
      dot,
      document.createTextNode(PROVENANCE_META[tag].label),
      count
    );
    els.filters.append(label);
  }
}

/** Per-category breakdown shown on the filter chips. Counts come from the
 *  full result set (not the visible subset) so a hidden category still
 *  shows how many it's hiding. */
function updateFilterCounts(results: SearchResult[]): void {
  const counts: Record<Provenance, number> = {
    exact: 0,
    close: 0,
    related: 0,
    loose: 0,
  };
  for (const r of results) counts[r.provenance]++;
  for (const tag of PROVENANCE_ORDER) {
    const el = filterCountEls[tag];
    if (el) el.textContent = String(counts[tag]);
  }
}

// =============================================================
// Open / close
// =============================================================
async function openOverlay(): Promise<void> {
  await ensureOverlay();
  if (!els) return;
  isOpen = true;
  els.panel.classList.add("sf-ext-open");
  els.input.focus();
  els.input.select();

  if (!page) await indexPage();
  // Re-run whatever is in the box (handles re-open with prior query).
  if (els.input.value.trim()) scheduleSearch();
}

function closeOverlay(): void {
  isOpen = false;
  clearHighlights();
  clearLiveFind();
  if (els) els.panel.classList.remove("sf-ext-open");
}

// The open shortcut (and toolbar icon) never CLOSES the overlay — only
// Escape or the ✕ button does. When it's already open, re-focus and
// select the query so the user can immediately type the next search.
function activateOverlay(): void {
  if (isOpen) {
    els?.input.focus();
    els?.input.select();
  } else {
    void openOverlay();
  }
}

// =============================================================
// Page indexing + model warm-up
// =============================================================
async function indexPage(): Promise<void> {
  setStatus("Reading page…");
  extraction = extractBlocks(document);
  page = new PageIndex(extraction.blocks);

  if (page.chunkCount === 0) {
    setStatus("No readable text found on this page.");
    return;
  }
  setStatus(`${page.chunkCount} sections indexed`);

  // Semantic is a background upgrade — never blocks literal search.
  void warmSemantic();
}

async function warmSemantic(): Promise<void> {
  if (!page || modelState === "loading" || modelState === "ready") return;
  modelState = "loading";

  const cacheKey = `${MODEL_ID}::${location.origin}${location.pathname}::${page.textHash}`;

  try {
    const cached = await loadEmbeddings(cacheKey);
    if (cached && cached.length === page.chunkCount) {
      page.setVectors(cached);
      modelState = "ready";
      setStatus(`${page.chunkCount} sections · semantic ready (cached)`);
      // Chunk vectors are cached, but embedding the QUERY still needs the
      // model — warm it in the background so the first search isn't slow.
      void loadModel().catch(() => {});
      if (isOpen && lastQuery) scheduleSearch();
      return;
    }

    setStatus("Loading semantic model…");
    await loadModel((p) => {
      if (typeof p.progress === "number") {
        setStatus(`Loading model… ${Math.round(p.progress)}%`);
      }
    });

    setStatus("Indexing page for meaning…");
    const vectors = await embedChunks(
      page.chunks.map((c) => c.text),
      (done, total) => setStatus(`Indexing… ${done}/${total}`)
    );
    page.setVectors(vectors);
    void saveEmbeddings(cacheKey, vectors);
    modelState = "ready";
    setStatus(`${page.chunkCount} sections · semantic ready`);
    if (isOpen && lastQuery) scheduleSearch();
  } catch (err) {
    modelState = "failed";
    // DOMExceptions/ErrorEvents stringify to "[object DOMException]" and
    // hide the cause — pull out name + message so the console is useful.
    console.warn(
      "[semantic-find] semantic model unavailable:",
      describeError(err),
      err
    );
    setStatus("Semantic model failed — literal & keyword search only");
  }
}

// =============================================================
// Search (debounced; literal first, semantic upgrade after)
// =============================================================
function onInput(): void {
  scheduleSearch();
}

function scheduleSearch(): void {
  window.clearTimeout(searchTimer);
  window.clearTimeout(semanticTimer);
  searchTimer = window.setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
}

async function runSearch(): Promise<void> {
  if (!page || !els) return;
  const query = els.input.value;
  lastQuery = query;
  const seq = ++searchSeq;

  // Pass 0: true Ctrl+F. Scan the LIVE DOM and highlight EVERY exact
  // occurrence — uncapped, ungated, occurrence-level — then jump to the
  // first. Independent of the chunk snapshot, so it can't go stale or be
  // ranked away. (No-op for queries not literally present, e.g. semantic
  // paraphrases, which the ranked list below handles.)
  lastLiteralCount = runLiveFind(query.trim());
  if (lastLiteralCount > 0) setCurrentMatch(0);

  // Pass 1: instant ranked list, no embedding (semantic discovery).
  const fast = page.search(query, null);
  if (seq === searchSeq) {
    lastResults = fast.results;
    activeIdx = 0;
    renderMeta(fast);
    renderResults(fast.results);
  }

  // Pass 2: semantic upgrade, slightly longer debounce + async embed.
  if (modelState === "ready" && page.hasVectors && query.trim()) {
    window.clearTimeout(semanticTimer);
    semanticTimer = window.setTimeout(async () => {
      try {
        const qVec = await embedText(query.trim());
        if (seq !== searchSeq) return; // user kept typing
        const full = page!.search(query, qVec);
        lastResults = full.results;
        renderMeta(full);
        renderResults(full.results);
      } catch (err) {
        console.warn("[semantic-find] query embed failed:", describeError(err), err);
      }
    }, SEMANTIC_DEBOUNCE_MS);
  }
}

// =============================================================
// Rendering
// =============================================================
function visibleResults(): SearchResult[] {
  return lastResults.filter((r) => visibleTags[r.provenance]);
}

function renderMeta(out: {
  totalOccurrences: number;
  literalChunkCount: number;
  results: SearchResult[];
}): void {
  if (!els) return;
  const q = els.input.value.trim();
  if (!q) {
    els.meta.textContent = "";
    return;
  }
  const parts: string[] = [];
  // Exact, live-DOM occurrence readout (Ctrl+F style): "3/12 exact on page".
  if (lastLiteralCount > 0) {
    const pos = currentMatchIndex() >= 0 ? `${currentMatchIndex() + 1}/` : "";
    parts.push(
      `${pos}${lastLiteralCount} exact match${lastLiteralCount === 1 ? "" : "es"} on page`
    );
  } else {
    parts.push("no exact matches on page");
  }
  parts.push(`${out.results.length} result${out.results.length === 1 ? "" : "s"}`);
  els.meta.textContent = parts.join(" · ");
}

/** Refresh just the meta line after the current match changes (Enter /
 *  Shift+Enter cycling) without re-running the whole search. */
function refreshMeta(): void {
  renderMeta({
    totalOccurrences: 0,
    literalChunkCount: 0,
    results: lastResults,
  });
}

function renderResults(results: SearchResult[]): void {
  if (!els || !page) return;
  updateFilterCounts(results);
  els.list.replaceChildren();
  const shown = results.filter((r) => visibleTags[r.provenance]);

  if (els.input.value.trim() && shown.length === 0) {
    els.list.append(h("li", "sf-ext-empty", "No results."));
    return;
  }

  shown.forEach((r, i) => {
    const chunk = page!.chunks[r.index];
    const li = h("li", "sf-ext-result");
    if (i === activeIdx) li.classList.add("sf-ext-active");
    li.dataset.idx = String(i);

    const tag = h("span", `sf-ext-tag ${PROVENANCE_META[r.provenance].className}`,
      PROVENANCE_META[r.provenance].label);
    const head = h("span", "sf-ext-result-head", chunk.heading || "(section)");
    const snippet = h("p", "sf-ext-snippet", snippetFor(chunk.text, els!.input.value));

    li.append(tag, head, snippet);
    if (debugOn) li.append(buildDebug(r, chunk));
    li.addEventListener("click", () => {
      activeIdx = i;
      jumpTo(i);
      markActive();
    });
    els!.list.append(li);
  });
}

/** Per-result diagnostics: the exact chunk/anchor/block mapping and a
 *  preview of the element we'd actually scroll to, so a "wrong section"
 *  jump is visible at a glance. Toggled by the 🐞 button. */
function buildDebug(r: SearchResult, chunk: Chunk): HTMLElement {
  const target = resolveChunkTarget(chunk, els?.input.value ?? "");
  const elPreview = target.el
    ? `«${(target.el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80)}»`
    : "(element not found)";
  const lines = [
    `chunk id   : ${r.index}`,
    `anchor id  : ${chunk.anchorId}`,
    `target id  : ${target.blockId}${target.matched ? " (query match)" : " (anchor fallback)"}`,
    `block ids  : ${chunk.blockIds.join(", ")}`,
    `cosine/rrf : ${r.cosine.toFixed(3)} / ${r.score.toFixed(4)}`,
    `element    : ${elPreview}`,
    `snippet    : ${snippetFor(chunk.text, els?.input.value ?? "").slice(0, 80)}`,
  ];
  return h("pre", "sf-ext-debug", lines.join("\n"));
}

function snippetFor(text: string, query: string): string {
  const q = query.trim().toLowerCase();
  const flat = text.replace(/\s+/g, " ").trim();
  if (q) {
    const at = flat.toLowerCase().indexOf(q);
    if (at > 40) {
      const start = Math.max(0, at - 40);
      return "…" + flat.slice(start, start + 180);
    }
  }
  return flat.slice(0, 180) + (flat.length > 180 ? "…" : "");
}

function markActive(): void {
  if (!els) return;
  const items = els.list.querySelectorAll(".sf-ext-result");
  items.forEach((el, i) =>
    el.classList.toggle("sf-ext-active", i === activeIdx)
  );
  const active = items[activeIdx] as HTMLElement | undefined;
  active?.scrollIntoView({ block: "nearest" });
}

function setStatus(text: string): void {
  if (els) els.status.textContent = text;
}

/** DOMException/ErrorEvent print as "[object …]" by default, swallowing
 *  the actual cause. Extract a human-readable "Name: message" string. */
function describeError(err: unknown): string {
  if (err instanceof Error || err instanceof DOMException) {
    return `${err.name}: ${err.message}`;
  }
  if (err && typeof err === "object") {
    const e = err as { name?: string; message?: string };
    if (e.name || e.message) return `${e.name ?? "Error"}: ${e.message ?? ""}`;
  }
  return String(err);
}

// =============================================================
// Jump to result on the real page
// =============================================================

/**
 * Map a chunk back to the DOM element to scroll to. A chunk can span
 * several paragraphs (~150 words), and the result snippet usually shows
 * the block where the query matched — NOT necessarily the chunk's first
 * block. So we scroll to the first block whose element actually contains
 * the literal query; only if none does (e.g. a semantic-only match with
 * no shared words) do we fall back to the chunk's anchor block.
 *
 * Every id here (chunk.anchorId, chunk.blockIds) is the SAME id used as
 * the key in extraction.elementById, because both come from the one
 * blocks array produced by extractor.ts and consumed by lib/chunk.ts.
 */
function resolveChunkTarget(
  chunk: Chunk,
  needle: string
): { el: Element | null; blockId: string; matched: boolean } {
  const n = needle.trim().toLowerCase();
  if (n && extraction) {
    for (const id of chunk.blockIds) {
      const el = extraction.elementById.get(id);
      if (el && (el.textContent ?? "").toLowerCase().includes(n)) {
        return { el, blockId: id, matched: true };
      }
    }
  }
  const el = extraction?.elementById.get(chunk.anchorId) ?? null;
  return { el, blockId: chunk.anchorId, matched: false };
}

function jumpTo(visibleIdx: number): void {
  if (!page || !extraction) return;
  const r = visibleResults()[visibleIdx];
  if (!r) return;
  const chunk = page.chunks[r.index];
  const needle = els?.input.value ?? "";
  const target = resolveChunkTarget(chunk, needle);

  console.debug("[semantic-find] jump", {
    chunkId: r.index,
    anchorId: chunk.anchorId,
    targetBlockId: target.blockId,
    matchedBlock: target.matched,
    blockIds: chunk.blockIds,
    provenance: r.provenance,
    cosine: Number(r.cosine.toFixed(3)),
    elementText: target.el
      ? (target.el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120)
      : null,
    snippet: snippetFor(chunk.text, needle),
  });

  // Halo the element to show WHERE the chunk is. We deliberately don't
  // pass the needle: live-find.ts already highlights every literal
  // occurrence page-wide via the CSS Highlight API, so there's no need to
  // mutate the page DOM with <mark> wrappers (which break on SPA pages).
  if (target.el) highlightElement(target.el);
}

// =============================================================
// Keyboard
// =============================================================
function onInputKeyDown(e: KeyboardEvent): void {
  const shown = visibleResults();
  if (e.key === "Escape") {
    e.preventDefault();
    closeOverlay();
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIdx = Math.min(activeIdx + 1, Math.max(0, shown.length - 1));
    markActive();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIdx = Math.max(activeIdx - 1, 0);
    markActive();
  } else if (e.key === "Enter") {
    e.preventDefault();
    // Ctrl+F semantics: Enter / Shift+Enter cycle through every exact
    // on-page match. With no exact matches, fall back to jumping to the
    // selected ranked result.
    if (lastLiteralCount > 0) {
      if (e.shiftKey) prevMatch();
      else nextMatch();
      refreshMeta();
    } else if (shown.length) {
      jumpTo(activeIdx);
    }
  }
}

// Cmd/Ctrl+K focuses the input ONLY when the overlay is already open
// (the build doc warns against using it as the global trigger because
// host pages hijack it). The global open is Alt+Shift+K, handled both
// by the background command and the capture listener below.
window.addEventListener(
  "keydown",
  (e) => {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      activateOverlay();
    } else if (e.altKey && e.shiftKey && e.key === "ArrowLeft") {
      // Dock the panel to the left edge.
      e.preventDefault();
      setSide("left");
    } else if (e.altKey && e.shiftKey && e.key === "ArrowRight") {
      // Dock the panel to the right edge.
      e.preventDefault();
      setSide("right");
    } else if (isOpen && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      els?.input.focus();
      els?.input.select();
    }
  },
  true
);

// =============================================================
// Message from the background service worker (toolbar / command)
// =============================================================
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "TOGGLE_SEMANTIC_FIND") activateOverlay();
});
