# Semantic Find — fully local "superpowered Ctrl+F"

Natural-language **hybrid search** running **entirely in the browser** — no
backend, no API keys, no data leaving the device. It combines meaning-based
(semantic) retrieval with classic keyword matching, so a query like *"the part
about cancelling"* finds the right content even when it's phrased with
completely different words, while an exact term like *"refund"* still lights up
wherever it literally appears.

The project ships **two demos on the same search engine**:

- **`/`** — a "superpowered Ctrl+F" overlay over one long document. Type a
  meaning, jump to the matching paragraph, see keywords highlighted.
- **`/inbox`** — searching and filtering a **stack of emails**. A prominent
  search bar filters many email JSON blocks down to the matches, with a
  Best-match / Most-recent toggle, expandable cards, and a relevance spine.

Both reuse the exact same ranking core; only the data shape and UI differ.

- Next.js App Router + TypeScript
- `@huggingface/transformers` (transformers.js) with **Xenova/all-MiniLM-L6-v2**
- `feature-extraction` embeddings only — no text generation, no chat, no RAG
- **Hybrid ranking**: keyword (lexical) + semantic, fused with weighted
  Reciprocal Rank Fusion (RRF)
- **Absolute-cosine scoring**: an honest per-result match %, plus a "no results"
  gate for arbitrary queries
- Brute-force cosine similarity (the right call at this scale)
- Stopword-stripped keyword extraction + live match highlighting
- IndexedDB cache for computed embeddings
- WebGPU when available, WASM fallback
- **Zero** backend API routes, zero API keys. The only network request is the
  one-time download of the model weights (~25 MB), which the browser caches.

## Run it

```bash
npm install
npm run dev
# / for the document finder, /inbox for the email search
```

To start from a fresh app and copy files over:

```bash
npx create-next-app@latest semantic-find --typescript --app --no-tailwind --eslint --src-dir=false --import-alias "@/*"
cd semantic-find
npm install @huggingface/transformers
```

If you're on Next.js 16 (Turbopack default), the bundler config lives under
`turbopack.resolveAlias` in `next.config.ts`, which stubs out the Node-only
`onnxruntime-node` and `sharp` deps in the browser build. The library is only
imported behind an `ssr: false` boundary, so the server never touches it either
way.

## Files

Shared search core (no React, no Next.js — pure TypeScript, portable straight
into a Chrome extension):

| File | What it is |
|------|-----------|
| `lib/chunk.ts` | Document model + 100–200-word chunker |
| `lib/vector.ts` | Cosine similarity, top-k, **weighted RRF fusion** |
| `lib/keyword.ts` | Keyword extraction (stopwords + stemming) + lexical scoring |
| `lib/embedding.ts` | transformers.js pipeline, WebGPU→WASM |
| `lib/cache.ts` | IndexedDB embedding cache |

Demo 1 — document finder (`/`):

| File | What it is |
|------|-----------|
| `components/sampleDocument.ts` | The long demo document |
| `components/SemanticFindDemo.tsx` | Overlay UI + orchestration |
| `app/page.tsx` | Client page, `dynamic(..., { ssr: false })` |

Demo 2 — email inbox (`/inbox`):

| File | What it is |
|------|-----------|
| `lib/email.ts` | Email → searchable-text adapter + Best/Recent sort |
| `components/sampleEmails.ts` | Email corpus #1 (Lumenote support world) |
| `components/sampleEmailsWork.ts` | Email corpus #2 (a generic work inbox) |
| `components/EmailSearchDemo.tsx` | Search bar, result cards, inline expand |
| `app/inbox/page.tsx` | Client page, `dynamic(..., { ssr: false })` |
| `app/inbox/inbox.css` | Self-contained inbox styling (`ib-` prefixed) |

## The search algorithm

The interesting part is *how the signals combine*. Every query is ranked two
ways independently, then fused.

**1. Semantic.** The query is embedded with the same MiniLM pipeline as the
content, then ranked by cosine similarity. Catches paraphrase and meaning
("can I take my notes elsewhere?" → the *Exporting* section / email) even with
zero shared words.

**2. Keyword.** The query is tokenized, stopwords are dropped ("where", "the",
"part", "about"…), the remaining content words are lightly stemmed ("refunds" →
"refund"), and matched against the content. Catches exact terms the embedder
might underrate.

### Fusion: weighted Reciprocal Rank Fusion (RRF)

The two ranked lists are merged with **weighted RRF** rather than by adding
their raw scores. The reason: cosine similarity (clustered ~0.3–0.6 for this
model) and keyword scores live on completely different scales, so a naïve sum
lets whichever number is bigger dominate. RRF throws the magnitudes away and
fuses by **rank position** — each list contributes `weight / (k + rank)` per
item, summed across lists. No score normalization, stable with only a handful
of items, and it rewards content that *both* rankers like. It's the same fusion
method Elasticsearch, OpenSearch, Chroma, MongoDB and pgvector ship as their
default hybrid mode.

### Absolute scoring and the "no results" gate

RRF gives a great *ordering* but its scores are **relative** — they depend on
list lengths and corpus size, so the same number means different things for
different queries. That's a problem for two things: showing an honest match %,
and deciding when a query matches *nothing*.

The fix is to keep RRF for ordering but use **raw cosine similarity** — which is
absolute and comparable across queries — for judgment:

- **The displayed % and the relevance spine** come from each result's raw cosine,
  so a strong match reads ~70% and a weak one ~20%, instead of the top result
  always being "100%" by construction.
- **The no-match gate**: if the best email's cosine is below an absolute floor
  *and* no keyword landed, the query is treated as matching nothing (e.g.
  *"Elon Musk"* in a support inbox → "no results"). The keyword half is an escape
  hatch so a legitimate exact-term query the embedder underrates is never blanked
  out.

The mental model: **rank with RRF, judge with cosine.** Ordering decides the
list; cosine decides "is this real" and "how strong."

### Highlighting

Matched keywords are wrapped in `<mark>` — in bodies, subjects, headings, and
snippets. Matching is on word *prefix* (`\brefund\w*`) so the stemmed keyword
"refund" still highlights "refunds" and "refunding" in the raw text.

## The email inbox (`/inbox`)

The same engine, but the unit is **one email = one vector** (emails are short,
well under the model's context window), so ranking returns whole emails.

**Soft author search.** A query like *"refund info from Bob"* needs no special
parsing or hard filter. The author's name and email are folded into each email's
searchable text (`lib/email.ts`), so Bob's emails — and ones mentioning Bob —
naturally rank up through the normal hybrid pipeline. It's a soft signal, not a
filter; a hard `from:` filter could be layered on later.

**Tags are searchable too.** Each email's tags are included in both the embedded
and keyword text, so searching *"security"* or *"urgent"* leans toward
tagged emails — again softly, as one signal among the body text rather than an
authoritative filter.

**Best vs Recent.** Two sort modes:

- **Best match** — straight RRF relevance order.
- **Most recent** — among emails that clear a relevance floor (a fraction of the
  top score), sorted newest-first. When the most relevant email is also the
  newest, the two modes coincide — which is expected, not a bug. The floor lives
  in `lib/email.ts` (`RECENT_RELEVANCE_FLOOR`); lower it for a more
  date-driven feel, raise it to behave more like Best.

**The cards.** Results render as a stack of cards. The signature element is the
**relevance spine** — a vertical bar down each card's left edge whose height
encodes that email's match strength (driven by the absolute cosine), so the
stack literally shows you where the signal is. Click a card to **expand it in
place** and read the full email with keywords highlighted; click again to
collapse.

**Two corpora.** A masthead toggle switches between the Lumenote support world
and an unrelated startup work inbox. Each gets its own cache key, so flipping
between them re-indexes once, then loads instantly.

## Tuning knobs

All adjustable without touching logic:

- **RRF weights** (`EmailSearchDemo.tsx` / `SemanticFindDemo.tsx`, the two
  `weight:` values) — relative trust in keyword vs semantic. Raise the keyword
  weight to make exact-term matches win more; raise the semantic weight to favour
  meaning.
- **`RRF_K`** (`lib/vector.ts`, default `60`) — smoothing. Lower (~20) makes the
  very top of each list count for much more; raise to flatten rank #1 vs #5.
- **`NO_MATCH_FLOOR`** (`lib/email.ts`) — absolute cosine below which a query
  with no keyword hit is treated as matching nothing. Good matches sit ~0.4–0.6,
  nonsense ~0.05–0.2, so ~0.25–0.3 lands in the valley.
- **`RECENT_RELEVANCE_FLOOR`** (`lib/email.ts`) — how relevant an email must be
  to survive the "Most recent" sort.
- **`STOPWORDS`** (`lib/keyword.ts`) — what counts as query noise.
- **Keyword gate** (`.filter(s => s.hits > 0)`) — keyword-only-if-present.
  Loosen if you want keyword presence to be a soft boost rather than a
  requirement for the lexical list.

## How it works (document demo)

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
  lib/vector.ts reciprocalRankFusion(semantic, keyword) ──► fused, scored by cosine
      ▼
click / Enter ──► scrollIntoView(anchorId)
              ──► highlight chunk's paragraphs + <mark> matched keywords
```

### Other key decisions

- **Normalized embeddings** (`pooling: "mean", normalize: true`) make the dot
  product equal cosine similarity; `lib/vector.ts` still computes norms
  defensively so it's correct for any input.
- **Brute force is the right call** at this scale: a few dozen 384-dim vectors
  scan in microseconds. An ANN index would be pure overhead. (Search latency
  stays fine into the hundreds of thousands; the practical ceiling is *indexing*
  time and memory, not search — precompute embeddings offline to push past it.)
- **IndexedDB over localStorage**: Float32Arrays round-trip as ArrayBuffers via
  structured clone; localStorage would force JSON strings and hit its ~5 MB cap
  quickly.
- **Query and content must share one model.** Vectors are only comparable within
  a single embedding space, so the query is embedded with the exact same
  pipeline instance.
- **Two layers of caching**: transformers.js caches the *model weights* in Cache
  Storage automatically; the app additionally caches the *computed vectors* in
  IndexedDB, so a reload skips both download and indexing. (The instantiated
  pipeline itself can't survive a tab close — only a service worker can keep one
  warm across tabs while the browser process lives.)

Shortcuts (document demo): **⌘K / Ctrl+K** opens the finder, **↑/↓** move through
results, **Enter** jumps to the top match, **Esc** closes.

## Turning this into a Chrome extension

The core was split with this in mind: `lib/chunk.ts`, `lib/vector.ts`,
`lib/keyword.ts`, `lib/cache.ts`, `lib/embedding.ts` and `lib/email.ts` have no
React or Next.js imports, so they move to an extension unchanged — the whole
hybrid pipeline, RRF fusion, cosine scoring and all. What changes is where the
text comes from and where the UI lives.

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

**2. Replace `sampleDocument` with the real DOM.** Walk the page instead of a
static block array:

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

- *Simplest*: run transformers.js inside the content script. Bundle it and host
  the WASM/ONNX files inside the extension via `web_accessible_resources`,
  pointing `env.localModelPath` / `env.backends.onnx.wasm.wasmPaths` at
  `chrome.runtime.getURL(...)` so nothing is fetched from the network at all.
- *Better*: run the model in an **offscreen document** or service worker and
  message embeddings back. The page's main thread never blocks on inference, one
  model instance serves every tab, and strict-CSP pages can't interfere.

**4. UI.** The overlay becomes a Shadow DOM root injected by the content script
(so the host page's CSS can't bleed in), with the same input → debounce →
embed → keyword-extract → RRF-fuse → highlight flow. "Jump to result" becomes
`element.scrollIntoView()` plus a temporary highlight class on the stored
elements.

**5. Caching per page.** Keep the IndexedDB cache but key it by
`modelId + location.href + hash(pageText)`, so revisiting an unchanged article
is instant while edits invalidate cleanly.

The pieces that *don't* change at all: chunking, keyword extraction, cosine
ranking, RRF fusion, the absolute-cosine scoring, top-k, the cache format, and
the embedding pipeline itself.