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
import { loadModel, embedText, embedChunks, MODEL_ID } from "./embedding-client";
import { PROVENANCE_META, PROVENANCE_ORDER, type Provenance } from "../lib/provenance";
import { loadEmbeddings, saveEmbeddings } from "../lib/cache";

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

// =============================================================
// Overlay construction (Shadow DOM)
// =============================================================
async function ensureOverlay(): Promise<void> {
  if (host) return;

  host = document.createElement("div");
  host.id = ROOT_ID;
  shadow = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  // Pull the bundled stylesheet into the shadow root. content_scripts
  // CSS lands on the page document and does NOT pierce shadow DOM, so
  // we inject the same file's text here for the overlay UI itself.
  const style = document.createElement("style");
  try {
    style.textContent = await fetch(chrome.runtime.getURL("overlay.css")).then(
      (r) => r.text()
    );
  } catch {
    /* overlay still works unstyled if the fetch is blocked */
  }
  shadow.appendChild(style);

  const panel = h("div", "sf-ext-overlay");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Semantic Find");

  const header = h("div", "sf-ext-head");
  const title = h("span", "sf-ext-title", "Semantic Find");
  const status = h("span", "sf-ext-status");
  const close = h("button", "sf-ext-close", "✕");
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", () => closeOverlay());
  header.append(title, status, close);

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
    label.append(box, dot, document.createTextNode(PROVENANCE_META[tag].label));
    els.filters.append(label);
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
  if (els) els.panel.classList.remove("sf-ext-open");
}

function toggleOverlay(): void {
  if (isOpen) closeOverlay();
  else void openOverlay();
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
    console.warn("[semantic-find] semantic model unavailable:", err);
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

  // Pass 1: instant, no embedding. Guarantees Ctrl+F responsiveness.
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
        console.warn("[semantic-find] query embed failed:", err);
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
  if (out.totalOccurrences > 0) {
    parts.push(
      `${out.totalOccurrences} literal match${out.totalOccurrences === 1 ? "" : "es"} across ${out.literalChunkCount} section${out.literalChunkCount === 1 ? "" : "s"}`
    );
  }
  parts.push(`${out.results.length} result${out.results.length === 1 ? "" : "s"}`);
  els.meta.textContent = parts.join(" · ");
}

function renderResults(results: SearchResult[]): void {
  if (!els || !page) return;
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
    li.addEventListener("click", () => {
      activeIdx = i;
      jumpTo(i);
      markActive();
    });
    els!.list.append(li);
  });
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

// =============================================================
// Jump to result on the real page
// =============================================================
function jumpTo(visibleIdx: number): void {
  if (!page || !extraction) return;
  const r = visibleResults()[visibleIdx];
  if (!r) return;
  const chunk = page.chunks[r.index];
  const el = extraction.elementById.get(chunk.anchorId);
  if (el) highlightElement(el, els?.input.value);
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
    if (shown.length) jumpTo(activeIdx);
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
      toggleOverlay();
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
  if (message?.type === "TOGGLE_SEMANTIC_FIND") toggleOverlay();
});
