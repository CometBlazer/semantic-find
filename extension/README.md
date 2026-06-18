# Semantic Find — Chrome Extension

A local, semantic, fuzzy, substring-powered find-in-page tool. Same
search core as the Next.js demo (`/lib`), running over the **real DOM**
of whatever page you're on. No backend, no API keys, no analytics.

## How it relates to the Next.js app

The extension reuses the shared search core verbatim:

| Shared (`/lib`)            | Role                                   |
| -------------------------- | -------------------------------------- |
| `chunk.ts`                 | group blocks into embeddable chunks    |
| `substring.ts`             | literal Ctrl+F character scan          |
| `minisearch-lexical.ts`    | exact / prefix / fuzzy token search    |
| `vector.ts`                | cosine + weighted RRF fusion           |
| `provenance.ts`            | Exact / Close / Related / Loose tags   |
| `cache.ts`                 | IndexedDB embedding cache              |

Extension-only code lives in `/extension`:

| File                   | Role                                                  |
| ---------------------- | ----------------------------------------------------- |
| `manifest.json`        | MV3 manifest (`Alt+Shift+K` command)                  |
| `background.ts`        | command/icon toggle + creates the offscreen document   |
| `content.ts`           | Shadow-DOM overlay + wiring (runs on the page)         |
| `overlay.css`          | overlay UI styles + on-page highlight styles           |
| `extractor.ts`         | reads real page text into blocks + element map         |
| `highlighter.ts`       | scrolls to + highlights the chosen result (reversible) |
| `extension-search.ts`  | hybrid search orchestration (semantic optional)        |
| `embedding.worker.ts`  | transformers.js pipeline, local WASM                   |
| `embedding-client.ts`  | content-side port to the offscreen model host          |
| `offscreen.{html,ts}`  | extension-origin host that owns the embedding worker   |

## Build

```bash
npm run build:extension      # one-shot → dist-extension/
npm run watch:extension      # rebuild on change
```

Output lands in `dist-extension/` (this is the unpacked extension):

```
dist-extension/
  manifest.json
  background.js
  content.js
  embedding.worker.js
  overlay.css
  offscreen.html
  offscreen.js
  assets/wasm/ort-wasm-simd-threaded.jsep.wasm
```

## Load it in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select the `dist-extension` folder.
5. Open any normal webpage (not `chrome://` pages or the Web Store —
   extensions can't run there).
6. Press **Alt+Shift+K**. The overlay opens top-right.

If the shortcut does nothing, another extension/app may own it. Set it
at `chrome://extensions/shortcuts` → *Semantic Find* → *Open Semantic
Find* → `Alt+Shift+K`. You can also click the toolbar icon to toggle.

## Try these queries

| Query                        | What it exercises                          |
| ---------------------------- | ------------------------------------------ |
| `f`                          | one-char literal substring (always works)  |
| `grea`                       | mid-word fragment (`great`, `aggregate`)   |
| `refund`                     | exact token                                |
| `refun`                      | prefix token                               |
| `refnd`                      | fuzzy / typo → tagged **Close**            |
| `the part about cancelling`  | semantic paraphrase → **Related**/**Loose**|

`Esc` closes · `↑`/`↓` move selection · `Enter` jumps to the selected
result · clicking a result jumps + highlights it on the page.

## What works today

- Shadow-DOM overlay isolated from host-page CSS.
- Real DOM extraction with hidden/trivial filtering and de-duplication
  of nested containers.
- Substring + MiniSearch lexical/fuzzy search (no model needed).
- Weighted RRF fusion + eligibility gate + provenance tags.
- Optional semantic search via local embeddings, with IndexedDB cache
  keyed per page (`model + url + textHash`).
- Scroll-to + on-page highlight (element halo + reversible literal
  `<mark>`s), cleaned up on close / query change.
- Graceful degradation: if the model fails to load, literal + keyword
  search still work.

## Model & WASM notes

- The ONNX Runtime **WASM** is bundled locally (`assets/wasm/`) and
  `embedding.worker.ts` points `wasmPaths` at it, so no remote runtime
  *code* is fetched (MV3 forbids that).
- The **model weights** (`Xenova/all-MiniLM-L6-v2`, ~25 MB quantized)
  are still downloaded from the Hugging Face Hub on first semantic use,
  then cached by the browser. This is data, not code, and is allowed by
  the `<all_urls>` host permission. To go fully offline, bundle the
  weights under `assets/models/Xenova/all-MiniLM-L6-v2/` and set
  `env.allowRemoteModels = false` + `env.localModelPath` in the worker.

## Known limitations / next steps

- Model runtime uses **Option B**: the embedding worker is spawned by an
  **offscreen document** (`offscreen.{html,ts}`), created on demand by the
  service worker. This is required because a worker spawned from the
  content script runs in the **host page's origin**, where the page's CSP
  (`connect-src`) blocks the Hugging Face model download. The offscreen
  document runs in the extension's origin, so its fetch is governed by
  `host_permissions` instead. Extension pages also need `'wasm-unsafe-eval'`
  in the manifest CSP to compile the ONNX Runtime WASM.
- Extraction is a single pass over block elements; very app-like SPAs or
  canvas-rendered pages may yield little text. Mozilla Readability could
  be added later for article-mode extraction.
- No debug panel for raw cosine/RRF scores yet (the demo has one).
- Not yet manually verified inside Chrome — see the testing checklist in
  `docs/claude/build-extention.md`.
