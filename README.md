# Semantic Find — fully local "superpowered Ctrl+F"

Natural-language **hybrid search** running **entirely in the browser** — no
backend, no API keys, no data leaving the device. It combines meaning-based
(semantic) retrieval with classic keyword matching and a literal substring
pass, so a query like *"the part about cancelling"* finds the right content
even when it's phrased with completely different words, an exact term like
*"refund"* still lights up wherever it literally appears, and a raw fragment
like *"f"* or *"grea"* behaves like plain Ctrl+F — matching characters anywhere,
mid-word included.

The project ships **two web demos and a Chrome extension on the same embedding
+ fusion core**:

- **`/`** — a "superpowered Ctrl+F" overlay over one long document. Type a
  meaning, jump to the matching paragraph, see keywords highlighted. The
  document finder fuses **three** signals (substring + keyword + semantic) and
  tags each result by provenance (Exact / Close / Related / Loosely related).
- **`/inbox`** — searching and filtering a **stack of emails**. A prominent
  search bar filters many email JSON blocks down to the matches, with a
  Best-match / Most-recent toggle, expandable cards, a relevance spine, and a
  provenance tag (Exact / Close / Related / Loosely related) on every result.
- **`extension/`** — a real **MV3 Chrome extension** that runs the same search
  over the live DOM of any page (`Alt+Shift+K`). It adds a true live-DOM Ctrl+F
  layer on top of the ranked search, runs the embedding model in an offscreen
  document, and works offline once the model is cached. See
  [`extension/README.md`](extension/README.md) for the full writeup.

All three surfaces run the **same three-signal hybrid core** — substring +
keyword + semantic, fused with weighted RRF and labelled by provenance. The data
shape and UI differ per surface; the search brain does not.

- Next.js App Router + TypeScript
- `@huggingface/transformers` (transformers.js) with **Xenova/all-MiniLM-L6-v2**
- `feature-extraction` embeddings only — no text generation, no chat, no RAG
- **Hybrid ranking**: substring + keyword (lexical) + semantic, fused with
  weighted Reciprocal Rank Fusion (RRF) — across all three surfaces
- **Absolute-cosine scoring**: an honest per-result match %, plus a "no results"
  gate for arbitrary queries
- **Provenance tags**: every result is labelled Exact / Close / Related /
  Loosely related from which signals fired; the document finder and the
  extension add filter checkboxes to show/hide each tier
- **Off-main-thread model** (document demo + extension): the embedding pipeline
  runs in a Web Worker (and, in the extension, an offscreen document) — typing
  never janks, even on the WASM/CPU path
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

To build the Chrome extension (output lands in `dist-extension/`, load it via
`chrome://extensions` → *Load unpacked*):

```bash
npm run build:extension      # one-shot
npm run watch:extension      # rebuild on change
```

See [`extension/README.md`](extension/README.md) for loading instructions,
keyboard controls, and the offscreen-model architecture.

To start from a fresh app and copy files over:

```bash
npx create-next-app@latest semantic-find --typescript --app --no-tailwind --src-dir=false --import-alias "@/*"
cd semantic-find
npm install @huggingface/transformers minisearch
```

> The lexical half of every surface is built on **MiniSearch**, so it's a
> runtime dependency alongside transformers.js. MiniSearch ships its own type
> declarations — there's no separate `@types/minisearch` to install.

This repo's bundler config lives under `turbopack.resolveAlias` in
`next.config.ts`, which stubs out the Node-only `onnxruntime-node` and `sharp`
deps in the browser build. The library is only imported behind an `ssr: false`
boundary, so the server never touches it either way.

> **Working out of OneDrive / a synced folder?** Keep `node_modules` out of it.
> OneDrive holds file handles open inside `node_modules`, which surfaces as
> `EPERM: operation not permitted, rmdir` during `npm install` (and can leave a
> half-written dependency like `onnxruntime-node` failing its postinstall).
> Put the project somewhere unsynced (e.g. `C:\Users\you\dev\semantic-find`);
> your code lives on Git anyway.

## Files

Shared embedding + fusion core (no React, no Next.js — pure TypeScript,
portable straight into a Chrome extension):

| File | What it is |
|------|-----------|
| `lib/chunk.ts` | Document model + 100–200-word chunker |
| `lib/vector.ts` | Cosine similarity, top-k, **weighted RRF fusion** (any number of named lists) |
| `lib/embedding.ts` | transformers.js pipeline, WebGPU→WASM (used by the inbox demo) |
| `lib/embedding.worker.ts` | Web Worker: runs the transformers.js pipeline off the main thread (used by the document demo) |
| `lib/embedding-client.ts` | Main-thread façade over the worker — same API as `lib/embedding.ts` |
| `lib/cache.ts` | IndexedDB embedding cache |
| `lib/spellcheck.ts` | Corpus-based "did you mean?" — Damerau-Levenshtein over the indexed vocabulary (built, not yet wired into a demo) |

Lexical + literal + provenance layer — shared by **both** demos and the
extension (also pure TypeScript, no React):

| File | What it is |
|------|-----------|
| `lib/minisearch-lexical.ts` | MiniSearch lexical engine — exact + prefix + fuzzy in one pass, plus an exact-vs-fuzzy flag per item |
| `lib/substring.ts` | Literal "Ctrl+F" substring scan + occurrence counting |
| `lib/provenance.ts` | Classifies each result as Exact / Close / Related / Loosely related from which signals fired |

Demo 1 — document finder (`/`):

| File | What it is |
|------|-----------|
| `components/sampleDocument.ts` | The long demo document |
| `components/SemanticFindUI.tsx` | Overlay UI + orchestration; imports the worker-backed helpers from `lib/embedding-client.ts` |
| `components/SemanticFindDemo.tsx` | Compatibility copy of the worker client helper; not rendered by the route |
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

> **Note.** `lib/keyword.ts` (the old stopword + stemming keyword scorer) has
> been removed. The `/inbox` demo was its last consumer; it now ranks through
> `lib/minisearch-lexical.ts` + `lib/substring.ts` like the document finder and
> the extension, so the whole project shares one lexical path.

Chrome extension (`extension/`, MV3 — imports the shared `/lib` core verbatim;
see [`extension/README.md`](extension/README.md) for the full writeup):

| File | What it is |
|------|-----------|
| `extension/manifest.json` | MV3 manifest — `Alt+Shift+K` command, offscreen permission, `wasm-unsafe-eval` CSP |
| `extension/background.ts` | Service worker: command/icon toggle + creates the offscreen document |
| `extension/content.ts` | Shadow-DOM overlay injected into the page + all wiring |
| `extension/extractor.ts` | Walks the live DOM into blocks + an element map for jump-to |
| `extension/extension-search.ts` | `PageIndex` — the hybrid search brain (semantic optional) |
| `extension/live-find.ts` | True Ctrl+F: live-DOM exact-match highlight + cycling via the CSS Custom Highlight API |
| `extension/highlighter.ts` | Scrolls to + halos the chosen ranked result (reversible) |
| `extension/offscreen.{html,ts}` | Extension-origin host that owns the embedding worker (dodges page CSP) |
| `extension/embedding.worker.ts` | transformers.js pipeline over local WASM |
| `extension/embedding-client.ts` | Content-side port to the offscreen model host |
| `extension/{overlay,highlight}.css` | Overlay UI styles + on-page highlight styles |
| `scripts/build-extension.mjs` | esbuild bundler → `dist-extension/` (`npm run build:extension`) |

## The search algorithm (document finder)

The interesting part is *how the signals combine*. In the document finder every
query is ranked **three** ways independently, then fused — and a deliberately
simple gate decides what's even eligible to show.

**1. Substring (literal Ctrl+F).** A raw, case-insensitive `indexOf` scan over
the original chunk text (`lib/substring.ts`). This is the one signal that
matches *characters*, not tokens — so it finds the "f" inside "offline" or the
"grea" inside "aggregate", which no token-based engine can. It's what keeps the
core find-in-page promise alive: if the string is literally on the page, it
**will** surface.

**2. Keyword (lexical).** MiniSearch (`lib/minisearch-lexical.ts`) does exact,
**prefix**, and **fuzzy** matching in a single pass. Query terms are lowercased,
stopword-filtered, and lightly stemmed ("refunds" → "refund"); fuzzy is enabled
only for terms ≥ 4 characters (typo tolerance — "refnd" → "refund") and prefix
is always on ("refun" → "refund"). Per chunk it also reports whether the match
was exact/prefix or **fuzzy-only**, which drives the provenance tag.

**3. Semantic.** The query is embedded with the same MiniLM pipeline as the
content, then ranked by cosine similarity. Catches paraphrase and meaning
("can I take my notes elsewhere?" → the *Exporting* section) even with zero
shared words.

### Fusion: weighted Reciprocal Rank Fusion (RRF)

The ranked lists are merged with **weighted RRF** rather than by adding their
raw scores. The reason: cosine similarity (clustered ~0.3–0.6 for this model),
keyword scores, and substring counts live on completely different scales, so a
naïve sum lets whichever number is bigger dominate. RRF throws the magnitudes
away and fuses by **rank position** — each list contributes `weight / (k + rank)`
per item, summed across lists. No score normalization, stable with only a
handful of items, and it rewards content that *several* rankers like. It's the
same fusion method Elasticsearch, OpenSearch, Chroma, MongoDB and pgvector ship
as their default hybrid mode.

The substring list is fused in with a **deliberately low weight** (≈0.3 vs 1.0
semantic / 0.9 keyword). Substring is an *eligibility* signal, not a relevance
one: a one-character query matches almost everything, so if it ranked strongly
the top of the list would flood with whatever chunk has the most of that letter.
Low weight lets it keep the Ctrl+F promise (everything containing the string
stays findable) while semantic meaning still decides the **order**.

### Eligibility gate and ordering: two separate stages

It helps to see the gate and the ranking as distinct jobs:

- **The gate decides what shows.** A chunk is eligible if it has a substring
  hit **OR** a keyword hit **OR** its cosine clears a low absolute floor
  (`LOOSE_FLOOR`). The substring/keyword arms keep literal and exact-term
  queries from ever being blanked out by a cold embedder; the cosine arm lets
  pure-meaning matches through. Semantic-only results are further split by a
  second threshold (`RELATED_FLOOR`): above it they're tagged *Related*,
  below it *Loosely related*.
- **RRF decides the order** of whatever's eligible. So "keyword priority" isn't
  a weight tweak — it's the gate rule that a lexical or literal hit makes a chunk
  eligible regardless of cosine, while semantic meaning still leads the ranking
  among eligible results.

The mental model: **rank with RRF, gate with substring/keyword/cosine.**

### Absolute scoring and the "no results" gate

RRF gives a great *ordering* but its scores are **relative** — they depend on
list lengths and corpus size, so the same number means different things for
different queries. That's a problem for two things: showing an honest match %,
and deciding when a query matches *nothing*.

The fix is to keep RRF for ordering but use **raw cosine similarity** — which is
absolute and comparable across queries — for judgment:

- **The displayed % and the relevance meter** come from each result's raw cosine,
  so a strong match reads ~70% and a weak one ~20%, instead of the top result
  always being "100%" by construction.
- **The no-match gate**: if a chunk's cosine is below `LOOSE_FLOOR` *and* it
  has no keyword or substring hit, it's dropped. The lexical/literal arms are
  the escape hatch so a legitimate exact-term query the embedder underrates is
  never blanked out. `LOOSE_FLOOR` is intentionally low (0.15) — the real
  quality signal for semantic-only results is the *Related* vs *Loosely related*
  split at `RELATED_FLOOR` (0.4).

### Provenance tags: Exact / Close / Related

Each surfaced result carries a colored tag derived purely from *which* signals
fired for it (`lib/provenance.ts`), so the list explains itself:

- **Exact** — the query appears literally (substring hit) or an exact/prefix
  keyword term matched. High confidence; your actual characters/words are there.
- **Close** — no exact hit, but MiniSearch's fuzzy matcher fired (a typo was
  corrected, "refnd" → "refund").
- **Related** — no lexical hit; the chunk surfaced because its *meaning* is a
  confident semantic match (cosine ≥ `RELATED_FLOOR`).
- **Loosely related** — no lexical hit; weak but real semantic signal
  (`LOOSE_FLOOR` ≤ cosine < `RELATED_FLOOR`). Surfaced but visibly demoted —
  useful for single-word queries like "legal" or "corporate" that the model
  scores at a lower cosine against prose that never uses the word.

Precedence is Exact > Close > Related > Loosely related, so a chunk that's
both a literal hit and a fuzzy-only keyword match reads as Exact.

### Occurrence count

Because the substring pass counts literal hits, the finder also shows a running
**"N literal matches across M chunks"** readout, the way real Ctrl+F shows
"3 of 47". When the query is a short literal fragment (≤ 3 chars, no spaces),
body highlighting switches from the word/prefix-aware highlighter to a raw
substring highlighter so mid-word hits ("of**f**line") are marked too.

### Highlighting

Matched keywords are wrapped in `<mark>` — in bodies, headings, and snippets.
For normal queries, matching is on word *prefix* (`\brefund\w*`) so the stemmed
keyword "refund" still highlights "refunds" and "refunding". For short literal
fragments, highlighting falls back to a raw case-insensitive substring pass that
marks every occurrence, mid-word included.

## The email inbox (`/inbox`)

The same three-signal engine as the document finder — substring + MiniSearch
lexical (exact/prefix/fuzzy) + semantic, fused with weighted RRF (semantic 1.0
/ keyword 0.9 / substring 0.3) and gated/labelled by provenance — but the unit
is **one email = one vector** (emails are short, well under the model's context
window), so ranking returns whole emails. Each card carries the same Exact /
Close / Related / Loosely related tag the document finder shows.

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

- **RRF weights** (`EmailSearchDemo.tsx` / `SemanticFindUI.tsx`, the `weight:`
  values) — relative trust in each signal. In the document finder, raise the
  keyword weight to make exact-term matches win more, raise the semantic weight
  to favour meaning, and keep the **substring weight low** (≈0.3) so a literal
  fragment stays findable without dominating the order.
- **`SUBSTRING_WEIGHT`** (`SemanticFindUI.tsx` / `EmailSearchDemo.tsx`) — how much the literal Ctrl+F
  list counts toward ordering. Low by design; raise it only if you want literal
  hits to outrank meaning.
- **`isLiteralFragment` threshold** (`lib/substring.ts`, ≤ 3 chars) — when the
  UI foregrounds the Ctrl+F count and switches to substring highlighting. Raise
  it to treat longer fragments as literal scrubbing.
- **`RRF_K`** (`lib/vector.ts`, default `60`) — smoothing. Lower (~20) makes the
  very top of each list count for much more; raise to flatten rank #1 vs #5.
- **`LOOSE_FLOOR`** (`SemanticFindUI.tsx`, default 0.15) — the low safety net.
  A semantic-only result below this is dropped entirely (gibberish gate). Keep
  it low; the quality split is handled by `RELATED_FLOOR`.
- **`RELATED_FLOOR`** (`SemanticFindUI.tsx`, default 0.4) — the confident-vs-weak
  split for semantic-only results. Above this → *Related*; between this and
  `LOOSE_FLOOR` → *Loosely related*. Good matches sit ~0.4–0.6; raise toward
  0.5 for a stricter confident tier, lower if legitimate queries get demoted.
  The always-on debug readout shows raw cosines to help tune these. The inbox
  uses its own `LOOSE_FLOOR` / `RELATED_FLOOR` in `EmailSearchDemo.tsx` for the
  same gate-and-classify job; an arbitrary query that clears no signal simply
  returns an empty result list (the old explicit `NO_MATCH_FLOOR` is gone).
- **Fuzzy floor** (`lib/minisearch-lexical.ts`) — MiniSearch fuzzy is enabled
  only for terms ≥ 4 chars, at edit distance ≈ 0.2 × term length. Loosen for
  more typo tolerance, tighten to reduce false matches.
- **`RECENT_RELEVANCE_FLOOR`** (`lib/email.ts`) — how relevant an email must be
  to survive the "Most recent" sort.
- **`STOPWORDS`** (`lib/minisearch-lexical.ts`, shared by both demos) — what
  counts as query noise.

## How it works (document demo)

```
sampleDocument (headings + paragraphs, each with a stable DOM id)
      │  lib/chunk.ts — group paragraphs into ~150-word chunks,
      │                 never crossing a heading
      ▼
chunks[] ──► lib/embedding-client.ts ──► lib/embedding.worker.ts (Web Worker)
      │       ──► one Float32Array[384] per chunk (zero-copy ArrayBuffer transfer)
      │       (feature-extraction pipeline, mean pooling, normalized)
      │       cached in IndexedDB keyed by  modelId + hash(document)
      ▼
query
  ├─► SUBSTRING: lib/substring.ts raw indexOf scan ──► literal-hit list (+counts)
  │
  ├─► KEYWORD:   lib/minisearch-lexical.ts ──► exact + prefix + fuzzy ──► ranked list
  │                                            (+ exact-vs-fuzzy flag per chunk)
  │
  └─► SEMANTIC:  same pipeline ──► lib/vector.ts cosine scan ──► ranked list
      ▼
  lib/vector.ts reciprocalRankFusion(semantic, keyword, substring)
      │   weighted by trust (semantic 1.0 / keyword 0.9 / substring 0.3)
      ▼
  gate: keep chunks with a substring hit OR keyword hit OR cosine ≥ floor
      ▼
  classify each survivor: Exact / Close / Related / Loosely related   (lib/provenance.ts)
      ▼
click / Enter ──► scrollIntoView(anchorId)
              ──► highlight chunk's paragraphs + <mark> matched keywords
```

### Other key decisions

- **Substring matches characters; everything else matches tokens.** MiniSearch
  (even with prefix and fuzzy) only ever matches whole words after stemming, so
  it can't find a fragment inside a word. The raw `indexOf` pass is a separate,
  tiny signal precisely because it's the only one that can — and it's kept at
  low RRF weight so it gates without dominating.
- **Exact-vs-fuzzy is inferred, not given.** MiniSearch doesn't label a match as
  fuzzy; `lib/minisearch-lexical.ts` derives it by checking whether any matched
  *document* term starts with the *query* term (exact/prefix) or only resembles
  it (fuzzy). That single bit drives the Exact/Close tag split.
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

Shortcuts (document demo): **Alt+Shift+K** opens the finder, **↑/↓** move through
results, **Enter** jumps to the top match, **Esc** closes.

## The Chrome extension (`extension/`)

This is **built and working**, not a thought experiment — `npm run
build:extension` produces a loadable MV3 extension in `dist-extension/`. It
runs the exact same search over the live DOM of any page you're on. Full
loading instructions, keyboard controls, and WASM notes live in
[`extension/README.md`](extension/README.md); the short version of how it maps
onto this codebase:

**The shared core moves over verbatim.** `lib/chunk.ts`, `lib/vector.ts`,
`lib/minisearch-lexical.ts`, `lib/substring.ts`, `lib/provenance.ts` and
`lib/cache.ts` have no React or Next.js imports, so the extension imports them
directly — the whole hybrid pipeline, RRF fusion, substring scan, cosine
scoring, provenance classifier and cache format unchanged. `extension/extension-search.ts`
wraps them in a `PageIndex` class (the same orchestration as
`SemanticFindUI.tsx`, minus React), with one twist: **semantic is optional** —
if the model never loads (CSP, offline, asset missing), search still runs on
substring + keyword alone, so find-in-page never breaks.

**The real DOM replaces `sampleDocument`.** `extension/extractor.ts` walks every
block-level element's flow text into the same `Block[]`/`Chunk[]` shape the
chunker already understands, folding inline markup into its block so phrases
stay intact.

**The model runs in an offscreen document, not the content script.** A content
script lives in the host page's origin, so a worker spawned there is bound by
the page's CSP and locked-down sites block the model download. Instead the
service worker (`background.ts`) creates an **offscreen document**
(`offscreen.ts`, extension origin) that owns the embedding worker; the content
side talks to it over a Port (`embedding-client.ts`). The ONNX Runtime WASM is
bundled locally so no remote code is fetched (MV3 forbids that).

**The UI is a Shadow-DOM overlay** (`content.ts` + `overlay.css`) so the host
page's CSS can't bleed in. On top of the ranked search it adds a true live-DOM
**Ctrl+F layer** (`live-find.ts`) that highlights every exact match via the CSS
Custom Highlight API (no DOM mutation, survives React re-renders), plus an
element **halo** (`highlighter.ts`) for jumping to semantic-only results. The
IndexedDB cache is keyed per page (`model + url + textHash`).
