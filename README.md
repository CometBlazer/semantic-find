# Semantic Find — a fully local "superpowered Ctrl+F"

Natural-language **hybrid search** over a page's text, running **entirely in the
browser**. It combines meaning-based (semantic) retrieval with classic keyword
matching, so a query like *"the part about cancelling"* finds the right section
even when it's phrased with completely different words — and an exact term like
*"refund"* still lights up wherever it literally appears.

- Next.js App Router + TypeScript
- `@huggingface/transformers` (transformers.js) with **Xenova/all-MiniLM-L6-v2**
- `feature-extraction` embeddings only — no text generation, no chat, no RAG
- **Hybrid ranking**: keyword (lexical) + semantic, fused with weighted
  Reciprocal Rank Fusion (RRF)
- Brute-force cosine similarity over ~150-word chunks
- Stopword-stripped keyword extraction + live match highlighting
- IndexedDB cache for chunk embeddings
- WebGPU when available, WASM fallback
- **Zero** backend API routes, zero API keys. The only network request is the
  one-time download of the model weights (~25 MB), which the browser caches.

## Option A — run this folder directly

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Option B — init your own app and copy files over

```bash
npx create-next-app@latest semantic-find --typescript --app --no-tailwind --eslint --src-dir=false --import-alias "@/*"
cd semantic-find
npm install @huggingface/transformers
```

Then copy the files in this order (each file has a `// ====` heading comment
naming its path, so you can paste with confidence):

| #  | File | What it is | Replaces existing? |
|----|------|-----------|--------------------|
| 1  | `next.config.ts` | Keeps transformers.js Node-only deps out of the bundle | yes |
| 2  | `lib/chunk.ts` | Document model + 100–200-word chunker (pure TS) | new |
| 3  | `lib/vector.ts` | Cosine similarity, top-k, **+ weighted RRF fusion** (pure TS) | new |
| 4  | `lib/keyword.ts` | **Keyword extraction + lexical scoring** (pure TS) | new |
| 5  | `lib/cache.ts` | IndexedDB embedding cache (pure TS) | new |
| 6  | `lib/embedding.ts` | transformers.js pipeline, WebGPU→WASM | new |
| 7  | `components/sampleDocument.ts` | The long demo document | new |
| 8  | `components/SemanticFindDemo.tsx` | All UI + orchestration ("use client") | new |
| 9  | `app/globals.css` | Document + overlay + highlight styling | yes |
| 10 | `app/layout.tsx` | Root layout + fonts | yes |
| 11 | `app/page.tsx` | Client page with `dynamic(..., { ssr: false })` | yes |

Files 2–6 have no React imports, so they compile the moment you paste them;
the app only changes behaviour at steps 9–11.

If you're on Next.js 16 (Turbopack is the default), the bundler config lives
under the `turbopack.resolveAlias` key in `next.config.ts`, which stubs out the
Node-only `onnxruntime-node` and `sharp` deps in the browser build. The library
is only imported behind the `ssr: false` boundary, so the server never touches
it either way.

## How it works

```
sampleDocument (headings + paragraphs, each with a stable DOM id)
      │  lib/chunk.ts — group paragraphs into ~150-word chunks,
      │                 never crossing a heading
      ▼
chunks[] ──► lib/embedding.ts ──► one Float32Array[384] per chunk
      │       (feature-extraction pipeline, mean pooling, normalized)
      │       cached in IndexedDB keyed by  modelId + hash(document)
      ▼
query
  ├─► SEMANTIC: same pipeline ──► lib/vector.ts cosine scan ──► ranked list
  │
  └─► KEYWORD:  lib/keyword.ts extractKeywords() (drop stopwords, stem)
      │                        keywordScores() over heading + body ──► ranked list
      ▼
  lib/vector.ts reciprocalRankFusion(semantic, keyword) ──► fused top 5
      ▼
click / Enter ──► scrollIntoView(anchorId)
              ──► highlight chunk's paragraphs + <mark> matched keywords
```

### The search algorithm: weighted Reciprocal Rank Fusion

The interesting part is *how the two signals combine*. Each query is ranked two
ways independently:

1. **Semantic** — the query is embedded with the same MiniLM pipeline as the
   chunks, then ranked by cosine similarity. Catches paraphrase and meaning
   ("can I take my notes elsewhere?" → the *Exporting and leaving* section)
   even with zero shared words.
2. **Keyword** — the query is tokenized, stopwords are dropped ("where", "the",
   "part", "about"…), and the remaining content words are lightly stemmed
   ("refunds" → "refund") and matched against each chunk's **heading + body**.
   Catches exact terms the embedder might underrate.

These two ranked lists are merged with **weighted RRF** rather than by adding
their raw scores. The reason: cosine similarity (clustered around ~0.3–0.6 for
this model) and keyword scores live on completely different scales, so a naïve
sum lets whichever number happens to be bigger dominate. RRF throws the
magnitudes away and fuses by **rank position** instead — each list contributes
`weight / (k + rank)` per chunk, summed across lists. This needs no score
normalization, stays stable with only a handful of chunks, and rewards chunks
that *both* rankers like — which is exactly the "most relevant first" behaviour
you'd expect from a good search box. It's the same fusion method Elasticsearch,
OpenSearch, Chroma, MongoDB and pgvector all ship as their default hybrid mode.

**Tuning knobs** (all adjustable without touching any logic):

- **RRF weights** (`SemanticFindDemo.tsx`, the two `weight:` values) — relative
  trust in each signal. Raise the keyword weight to make exact-term matches win
  more often; raise the semantic weight to favour meaning/paraphrase.
- **`RRF_K`** (`lib/vector.ts`, default `60`) — smoothing. Lower it (~20) to
  make the very top of each list count for much more; raise it to flatten the
  difference between rank #1 and rank #5.
- **`STOPWORDS`** (`lib/keyword.ts`) — what counts as query noise. Tuned for
  natural-language queries ("where does it *talk about*…", "*the part about*…").
- **Keyword gate** (`.filter(s => s.hits > 0)`) — currently keyword-only-if-
  present. Loosen this if you want keyword presence to be a soft boost rather
  than a hard requirement for a chunk to appear in the lexical list.

### Highlighting

When you jump to a result, the matched paragraphs are shaded and every matched
keyword is wrapped in `<mark>` — in the body, the headings, the title, and the
result snippets. Matching is done on word **prefix** (`\brefund\w*`) so the
stemmed keyword "refund" still highlights "refunds" and "refunding" in the raw
text. **Enter** always jumps to the top-ranked match; **↑/↓** move the cursor to
pick a lower one.

### Other key decisions

- **Normalized embeddings** (`pooling: "mean", normalize: true`) make the dot
  product equal to cosine similarity; `lib/vector.ts` still computes norms
  defensively so it's correct for any input.
- **Brute force is the right call** at this scale: a few dozen 384-dim vectors
  scan in microseconds. An ANN index would be pure overhead.
- **Keyword pass searches heading + body, semantic pass searches body only.**
  Headings vary per section ("Refunds", "Security"), so including them sharpens
  keyword ranking without polluting the semantic vectors with repeated text.
- **IndexedDB over localStorage**: Float32Arrays round-trip as ArrayBuffers via
  structured clone; localStorage would force JSON strings and hit its ~5 MB cap
  quickly on bigger documents.
- **Query and chunks must share one model.** Vectors are only comparable within
  a single embedding space, so the query is embedded with the exact same
  pipeline instance.
- **Two layers of caching**: transformers.js caches the *model weights* in
  Cache Storage automatically; this app additionally caches the *computed chunk
  vectors* in IndexedDB, so a reload skips both download and indexing.

Shortcuts: **⌘K / Ctrl+K** opens the finder (native Ctrl+F is deliberately left
alone), **↑/↓** move through results, **Enter** jumps to the top match, **Esc**
closes.

## Turning this into a Chrome extension

The architecture was split with this in mind: `lib/chunk.ts`, `lib/vector.ts`,
`lib/keyword.ts`, `lib/cache.ts` and `lib/embedding.ts` have no React or Next.js
imports, so they move to an extension unchanged — including the whole hybrid
ranking pipeline. What changes is where the text comes from and where the UI
lives.

**1. Manifest (MV3).** A content script plus the model files:

```json
{
  "manifest_version": 3,
  "name": "Semantic Find",
  "version": "1.0",
  "permissions": ["storage"],
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "css": ["overlay.css"]
  }],
  "commands": {
    "open-semantic-find": {
      "suggested_key": { "default": "Ctrl+Shift+F" },
      "description": "Open semantic find on this page"
    }
  }
}
```

**2. Replace `sampleDocument` with the real DOM.** Instead of a static block
array, walk the page:

```ts
const nodes = Array.from(
  document.querySelectorAll("p, li, h1, h2, h3, blockquote, td")
).filter((el) => (el.textContent ?? "").trim().split(/\s+/).length > 8);
```

Tag each element with a `data-sf-id` attribute and build the same
`Block[]`/`Chunk[]` structures — the existing chunker works as-is because it
only deals in `{ text, id }`. For cleaner extraction on article pages, run
Mozilla's Readability first and map its output back to source elements.

**3. Where the model runs.** Two options:

- *Simplest*: run transformers.js inside the content script. Bundle it
  (esbuild/Vite) and host the WASM/ONNX files inside the extension via
  `web_accessible_resources`, pointing `env.localModelPath` /
  `env.backends.onnx.wasm.wasmPaths` at `chrome.runtime.getURL(...)` so nothing
  is fetched from the network at all.
- *Better*: run the model in an **offscreen document** or service worker and
  message embeddings back. The page's main thread never blocks on inference,
  one model instance serves every tab, and strict-CSP pages can't interfere.

**4. UI.** The overlay becomes a Shadow DOM root injected by the content script
(so the host page's CSS can't bleed in), with the same input → debounce →
embed → keyword-extract → RRF-fuse → highlight flow. "Jump to result" becomes
`element.scrollIntoView()` plus a temporary highlight class on the stored
elements, and the `<mark>` keyword highlighting maps onto the real text nodes —
identical logic to the demo.

**5. Caching per page.** Keep the IndexedDB cache but key it by
`modelId + location.href + hash(pageText)`, so revisiting an unchanged article
is instant while edits invalidate cleanly. `chrome.storage.local` also works
but IndexedDB handles binary vectors more naturally.

The pieces that *don't* change at all: chunking strategy, keyword extraction,
cosine ranking, RRF fusion, top-k, the cache format, and the embedding pipeline
itself.