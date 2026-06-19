# Semantic Find — a fully local "superpowered Ctrl+F"

Natural-language **hybrid search that runs entirely in the browser** — no
backend, no API keys, no data leaving the device. It blends meaning-based
(semantic) retrieval with classic keyword matching and a literal substring pass,
so *"the part about cancelling"* finds the right text even when it's worded
differently, *"refund"* still lights up wherever it literally appears, and a raw
fragment like *"grea"* behaves like plain Ctrl+F — matching mid-word, anywhere.

The same framework-free search core powers three surfaces: two Next.js demos and
a real Chrome extension.

## Demo

> Live demo coming soon. To run it yourself, see [Getting started](#getting-started).

- **`/`** — a find-in-page overlay over one long document. Type a meaning, jump
  to the matching paragraph, see keywords highlighted.
- **`/inbox`** — search a stack of emails with a Best-match / Most-recent toggle,
  expandable cards, and a relevance spine.
- **`extension/`** — an MV3 Chrome extension that runs the same search over the
  live DOM of any page (`Alt+Shift+K`).

## Features

- **Hybrid ranking** — three signals (literal substring + keyword + semantic)
  fused with weighted Reciprocal Rank Fusion (RRF).
- **Honest scoring** — a per-result match % from raw cosine similarity, plus a
  "no results" gate for arbitrary queries (instead of always-100% top hits).
- **Provenance tags** — every result is labelled *Exact / Close / Related /
  Loosely related* based on which signals fired.
- **Runs off the main thread** — the embedding model runs in a Web Worker (an
  offscreen document in the extension), so typing never janks.
- **Caching** — computed embeddings are cached in IndexedDB; the model weights
  are cached by the browser, so reloads skip both download and indexing.
- **Fully local** — the only network request is the one-time ~25 MB model
  download. WebGPU when available, WASM everywhere else.

## Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **[transformers.js](https://github.com/huggingface/transformers.js)**
  (`@huggingface/transformers`) running `Xenova/all-MiniLM-L6-v2` — 384-dim
  sentence embeddings, no text generation
- **[MiniSearch](https://github.com/lucaong/minisearch)** for exact/prefix/fuzzy
  lexical search
- **Web Workers**, **IndexedDB**, **WebGPU → WASM** fallback
- **esbuild** to bundle the Chrome extension

## How it works

Every query is ranked three ways independently, then fused:

1. **Substring** — a raw `indexOf` scan; the only signal that matches characters,
   not tokens (finds "grea" inside "aggregate").
2. **Keyword** — MiniSearch exact + prefix + fuzzy (typo-tolerant).
3. **Semantic** — cosine similarity over MiniLM embeddings (catches paraphrase).

The lists are merged with weighted RRF, which fuses by *rank position* rather
than raw score, so signals on wildly different scales combine cleanly. A separate
eligibility gate (substring **or** keyword hit **or** cosine above a floor)
decides what shows, while RRF decides the order. See
**[docs/DESIGN.md](docs/DESIGN.md)** for the full algorithm, scoring model, and
tuning knobs.

## Getting started

### Prerequisites

- Node.js 18.18+ (Node 20 LTS recommended)
- A modern browser (Chrome/Edge for the extension)

### Installation

```bash
git clone <repo-url>
cd semantic-find
npm install
```

### Running the web demos

```bash
npm run dev
# open http://localhost:3000  (document finder)
#      http://localhost:3000/inbox  (email search)
```

### Building the Chrome extension

```bash
npm run build:extension     # outputs an unpacked extension to dist-extension/
```

Then load it via `chrome://extensions` → **Load unpacked** → select
`dist-extension/`. Full instructions and keyboard controls live in
[`extension/README.md`](extension/README.md).

> **Working out of OneDrive or another synced folder?** Keep `node_modules`
> outside it — OneDrive holds file handles open inside `node_modules`, which
> surfaces as `EPERM: operation not permitted` during `npm install`.

## Usage

Open a demo, start typing, and results rank live as you type. Try a meaning
(`what happens if I cancel`), an exact term (`refund`), a typo (`refnd`), or a
short fragment (`grea`) — each takes a different path through the hybrid pipeline,
and the provenance tag on each result tells you which one fired.

Shortcuts (document finder): **Alt+Shift+K** opens the finder, **↑/↓** move
through results, **Enter** jumps to the top match, **Esc** closes.

## Project structure

```text
.
├── lib/            # framework-free search core (shared by all surfaces)
│   ├── chunk.ts            # document model + chunker
│   ├── substring.ts        # literal Ctrl+F scan
│   ├── minisearch-lexical.ts # exact/prefix/fuzzy keyword search
│   ├── vector.ts           # cosine similarity + weighted RRF fusion
│   ├── provenance.ts       # Exact / Close / Related / Loose classifier
│   ├── embedding*.ts       # transformers.js pipeline (+ Web Worker client)
│   ├── cache.ts            # IndexedDB embedding cache
│   ├── email.ts            # email → searchable-text adapter
│   └── spellcheck.ts       # corpus-based "did you mean?" (not yet wired in)
├── components/     # the two demo UIs
├── app/            # Next.js App Router pages (/ and /inbox)
├── extension/      # MV3 Chrome extension (imports lib/ verbatim)
├── docs/DESIGN.md  # deep-dive on the search algorithm
└── scripts/        # extension build script (esbuild)
```

## What I learned

- **Hybrid retrieval in practice** — why RRF beats summing raw scores, and how
  separating the *eligibility gate* from the *ranking* keeps literal find-in-page
  working while letting semantic meaning lead the order.
- **Keeping inference off the UI thread** — running transformers.js in a Web
  Worker and passing embeddings back as zero-copy transferred `ArrayBuffer`s.
- **MV3 extension constraints** — using an offscreen document to escape the host
  page's CSP for the model download, and the CSS Custom Highlight API to mark
  matches on SPA pages without DOM mutations that React would wipe.
- **Honest relevance UX** — deriving a comparable match % from absolute cosine
  rather than the relative RRF score, and gating out true non-matches.

## Future improvements

- Add automated tests for the `lib/` core (chunking, fusion, gating).
- Wire `lib/spellcheck.ts` into a "did you mean?" suggestion in the demos.
- Bundle the model weights with the extension for fully-offline use.
- Exclude page chrome (`<nav>`/`<footer>`) from the extension's semantic pass.
- Deploy a hosted live demo.

## License

No license is specified yet. Add one (e.g. MIT) before publishing if you want to
allow reuse.
