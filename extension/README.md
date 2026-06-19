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

That shared core powers the **ranked** search (substring + keyword +
semantic fusion) over a one-time page snapshot. The extension adds one
thing the demo doesn't: a live-DOM **Ctrl+F layer** (`live-find.ts`) that
highlights every exact match independently of that snapshot, so literal
find always works (see *What works today*).

Extension-only code lives in `/extension`:

| File                   | Role                                                  |
| ---------------------- | ----------------------------------------------------- |
| `manifest.json`        | MV3 manifest (`Alt+Shift+K` command, offscreen + CSP)  |
| `background.ts`        | command/icon toggle + creates the offscreen document   |
| `content.ts`           | Shadow-DOM overlay + wiring (runs on the page)         |
| `overlay.css`          | overlay UI styles (injected into the shadow root)      |
| `highlight.css`        | on-page highlight styles (loaded onto the host page)   |
| `extractor.ts`         | reads ALL visible page text into blocks + element map  |
| `live-find.ts`         | true Ctrl+F: live-DOM exact match highlight + cycling   |
| `highlighter.ts`       | scrolls to + halos the chosen ranked result (reversible) |
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
  content.js              (overlay UI; overlay.css is bundled in as text)
  embedding.worker.js     (transformers.js pipeline; spawned by offscreen.js)
  offscreen.html
  offscreen.js
  highlight.css
  assets/wasm/ort-wasm-simd-threaded.jsep.wasm   (ONNX runtime binary)
  assets/wasm/ort-wasm-simd-threaded.jsep.mjs    (ONNX runtime JS glue)
```

The ONNX Runtime needs **both** its `.wasm` binary and its `.mjs` loader
present in `assets/wasm/` — it dynamically imports the `.mjs`, and without
it the model fails with "no available backend found".

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

### Controls

| Key / action            | Effect                                                |
| ----------------------- | ----------------------------------------------------- |
| `Alt+Shift+K`           | open the finder (or, if open, re-focus + select query) |
| `Esc`                   | close the finder (the only close shortcut)            |
| `Enter` / `Shift+Enter` | next / previous **exact** match (Ctrl+F-style cycling) |
| `↑` / `↓`               | move the selection in the ranked (semantic) result list |
| click a result          | jump to + highlight that ranked result                |
| `Alt+Shift+←`           | dock the panel to the **left** edge                   |
| `Alt+Shift+→`           | dock the panel to the **right** edge                  |
| `⇄` (header button)     | toggle the panel between left / right edges           |

(When a query has no exact on-page matches, `Enter` falls back to jumping
to the selected ranked result.)

The finder stays open until you press `Esc` — `Alt+Shift+K` while it's
already open just re-selects the query so you can type the next search.

The meta line shows the live **exact-match position** (e.g. `3/12 exact
matches on page`, Ctrl+F-style) alongside the **ranked result count**, and
each provenance filter chip carries a live **per-category count** (Exact /
Close / Related / Loose) so you can see the breakdown and toggle categories
on/off.

## What works today

- Shadow-DOM overlay isolated from host-page CSS, with key/input events
  contained so SPAs (e.g. claude.ai) can't steal your typing into their
  own composer.
- **True Ctrl+F for exact matches (`live-find.ts`):** a separate live-DOM
  layer scans the page on every keystroke and highlights EVERY exact
  occurrence — uncapped, ungated, occurrence-level — then auto-jumps to the
  first; `Enter`/`Shift+Enter` cycle through them. It uses the CSS Custom
  Highlight API (no DOM mutation), so it works on React/SPA pages (Gmail,
  claude.ai) where injected `<mark>` tags get wiped, and it re-scans each
  query so it never goes stale. This is independent of the ranked snapshot
  below, which guarantees the literal-find promise.
- **Whole-page extraction for ranked search:** every block-level element's
  own flow text is indexed — nav bars, headings, links, buttons, footers,
  captions, and body copy — with inline markup (`<a>`/`<span>`/…) folded
  into its block so phrases stay intact, and no duplication.
- Substring + MiniSearch lexical/fuzzy search (no model needed).
- Weighted RRF fusion + eligibility gate + provenance tags, with a total
  result count and per-category breakdown on the filter chips.
- Optional semantic search via local embeddings running in an offscreen
  document, with an IndexedDB cache keyed per page (`model + url +
  textHash`).
- Two highlight layers, both cleaned up on close / query change: exact
  matches are painted page-wide via the CSS Custom Highlight API
  (`live-find.ts`, no DOM mutation), and the chosen ranked result gets an
  element **halo** (`highlighter.ts`) to show where a semantic-only match
  lives even when it shares no words with the query.
- Movable panel (left/right via the `⇄` button or `Alt+Shift+←`/`→`) so
  results never permanently block what you're reading.
- Graceful degradation: if the model fails to load, literal + keyword
  search still work.

## Model runtime (offscreen document)

The embedding model does **not** run in the content script. A content
script lives in the **host page's origin**, so a worker spawned there is
bound by the page's Content Security Policy — and locked-down sites
(Wikipedia, etc.) block the Hugging Face model download outright. Instead:

```
content (embedding-client.ts)
   └─ asks background to create the offscreen document
   └─ opens a Port to it
offscreen.ts  (extension origin)
   └─ spawns embedding.worker.js  → transformers.js + ONNX WASM
```

Because the offscreen document runs in the **extension's origin**, the
worker's model fetch is governed by `host_permissions`, not the page CSP.
Two manifest details make this work:

- `"offscreen"` permission (the service worker creates the document).
- `content_security_policy.extension_pages` includes `'wasm-unsafe-eval'`,
  required to compile the ONNX Runtime WASM on an extension page.

Port messages are JSON-serialized, so vectors cross as plain number
arrays (rebuilt into `Float32Array`s on the content side).

## Model & WASM notes

- The ONNX Runtime is bundled locally (`assets/wasm/`) — **both** the
  `.wasm` binary and the `.mjs` JS glue it dynamically imports — and the
  worker points `wasmPaths` at them, so no remote runtime *code* is
  fetched (MV3 forbids that).
- The **model weights** (`Xenova/all-MiniLM-L6-v2`, ~25 MB quantized)
  are downloaded from the Hugging Face Hub on first semantic use, then
  cached by the browser. This is data, not code, and is allowed by the
  `<all_urls>` host permission. To go fully offline, bundle the weights
  under `assets/models/Xenova/all-MiniLM-L6-v2/` and set
  `env.allowRemoteModels = false` + `env.localModelPath` in the worker.
- During that first download transformers.js may log "Unable to determine
  content-length…" — a benign note (the HF CDN streams without a
  `Content-Length` header). The download still succeeds; the worker mutes
  just that one line so it doesn't clutter the console.

## Known limitations / next steps

- Whole-page indexing pulls in boilerplate (menus, cookie notices, "skip
  to content"), so semantic results can include low-signal sections — the
  **Loose** filter hides those. A future option could exclude obvious
  chrome (`<nav>`/`<footer>`) from the *semantic* pass while keeping it
  for literal/keyword search.
- Canvas-rendered or heavily virtualized pages may still expose little
  selectable text (same as Ctrl+F).
- The first semantic index of a large page runs the model over much more
  text now, so "Indexing… n/m" takes longer on first open (then cached).
