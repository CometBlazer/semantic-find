# Semantic Find — a fully local "superpowered Ctrl+F"

Natural-language search over a page's text, running **entirely in the browser**:

- Next.js App Router + TypeScript
- `@huggingface/transformers` (transformers.js) with **Xenova/all-MiniLM-L6-v2**
- `feature-extraction` embeddings only — no text generation, no chat, no RAG
- Brute-force cosine similarity over ~150-word chunks
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

## Option B — init your own app and copy files over (recommended for you)

```bash
npx create-next-app@latest semantic-find --typescript --app --no-tailwind --eslint --src-dir=false --import-alias "@/*"
cd semantic-find
npm install @huggingface/transformers
```

Then copy the files in this order (each file has a `// ====` heading comment
naming its path, so you can paste with confidence):

| # | File | What it is | Replaces existing? |
|---|------|-----------|--------------------|
| 1 | `next.config.ts` | Keeps transformers.js Node-only deps out of the bundle | yes |
| 2 | `lib/chunk.ts` | Document model + 100–200-word chunker (pure TS) | new |
| 3 | `lib/vector.ts` | Cosine similarity + top-k (pure TS) | new |
| 4 | `lib/cache.ts` | IndexedDB embedding cache (pure TS) | new |
| 5 | `lib/embedding.ts` | transformers.js pipeline, WebGPU→WASM | new |
| 6 | `components/sampleDocument.ts` | The long demo document | new |
| 7 | `components/SemanticFindDemo.tsx` | All UI + orchestration ("use client") | new |
| 8 | `app/globals.css` | Document + overlay styling | yes |
| 9 | `app/layout.tsx` | Root layout + fonts | yes |
| 10 | `app/page.tsx` | Client page with `dynamic(..., { ssr: false })` | yes |

Files 2–6 have no React imports, so they compile the moment you paste them;
the app only changes behaviour at steps 8–10.

If you use Turbopack (`next dev --turbopack`), it still works: the webpack
hook is skipped, but the library is only imported behind the `ssr: false`
boundary so the server never touches it.

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
query ──► same pipeline ──► lib/vector.ts topK() cosine scan ──► top 5
      ▼
click result ──► scrollIntoView(anchorId) + highlight chunk's paragraphs
```

Key decisions, briefly:

- **Normalized embeddings** (`pooling: "mean", normalize: true`) make the dot
  product equal to cosine similarity; `lib/vector.ts` still computes norms
  defensively so it's correct for any input.
- **Brute force is the right call** at this scale: a few dozen 384-dim vectors
  scan in microseconds. An ANN index would be pure overhead.
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
alone), **↑/↓** move through results, **Enter** jumps, **Esc** closes.

## Turning this into a Chrome extension

The architecture was split with this in mind: `lib/chunk.ts`, `lib/vector.ts`,
`lib/cache.ts` and `lib/embedding.ts` have no React or Next.js imports, so they
move to an extension unchanged. What changes is where the text comes from and
where the UI lives.

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
embed → topK flow. "Jump to result" becomes
`element.scrollIntoView()` plus a temporary highlight class on the stored
elements — identical logic to the demo.

**5. Caching per page.** Keep the IndexedDB cache but key it by
`modelId + location.href + hash(pageText)`, so revisiting an unchanged article
is instant while edits invalidate cleanly. `chrome.storage.local` also works
but IndexedDB handles binary vectors more naturally.

The pieces that *don't* change at all: chunking strategy, cosine ranking,
top-k, the cache format, and the embedding pipeline itself.
