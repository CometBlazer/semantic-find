# Design notes

The interesting part of Semantic Find is *how the signals combine*. This
document goes deeper than the [README](../README.md): the ranking algorithm, the
gate-vs-rank split, the scoring model, and the per-surface tuning knobs.

All three surfaces (the `/` document finder, the `/inbox` email search, and the
Chrome extension) run the **same** core: every query is ranked three ways
independently, fused with weighted Reciprocal Rank Fusion, gated for
eligibility, and each survivor is tagged by provenance.

## The three signals

**1. Substring (literal Ctrl+F)** — `lib/substring.ts`. A raw, case-insensitive
`indexOf` scan over the original text. This is the one signal that matches
*characters*, not tokens, so it finds the "f" inside "offline" or the "grea"
inside "aggregate", which no token-based engine can. It keeps the core
find-in-page promise alive: if the string is literally on the page, it **will**
surface.

**2. Keyword (lexical)** — `lib/minisearch-lexical.ts`. MiniSearch does exact,
**prefix**, and **fuzzy** matching in a single pass. Query terms are lowercased,
stopword-filtered, and lightly stemmed ("refunds" → "refund"); fuzzy is enabled
only for terms ≥ 4 characters (typo tolerance, "refnd" → "refund") and prefix is
always on ("refun" → "refund"). Per item it also reports whether the match was
exact/prefix or **fuzzy-only**, which drives the provenance tag.

**3. Semantic** — `lib/embedding*.ts` + `lib/vector.ts`. The query is embedded
with the same MiniLM pipeline as the content, then ranked by cosine similarity.
Catches paraphrase and meaning ("can I take my notes elsewhere?" → the
*Exporting* section) even with zero shared words.

## Fusion: weighted Reciprocal Rank Fusion (RRF)

The ranked lists are merged with **weighted RRF** rather than by adding their raw
scores. Cosine similarity (clustered ~0.3–0.6 for this model), keyword scores,
and substring counts live on completely different scales, so a naïve sum lets
whichever number is bigger dominate. RRF throws the magnitudes away and fuses by
**rank position** — each list contributes `weight / (k + rank)` per item, summed
across lists. No score normalization, stable with only a handful of items, and it
rewards content that *several* rankers like. It's the same fusion method
Elasticsearch, OpenSearch, Chroma, MongoDB, and pgvector ship as their default
hybrid mode.

The substring list is fused with a **deliberately low weight** (≈0.3 vs 1.0
semantic / 0.9 keyword). Substring is an *eligibility* signal, not a relevance
one: a one-character query matches almost everything, so if it ranked strongly
the top of the list would flood with whatever item has the most of that letter.
Low weight lets it keep the Ctrl+F promise (everything containing the string
stays findable) while semantic meaning still decides the **order**.

## Gate and order are two separate jobs

- **The gate decides what shows.** An item is eligible if it has a substring hit
  **OR** a keyword hit **OR** its cosine clears a low absolute floor
  (`LOOSE_FLOOR`). The substring/keyword arms keep literal and exact-term queries
  from ever being blanked out by a cold embedder; the cosine arm lets pure-meaning
  matches through. Semantic-only results are further split by `RELATED_FLOOR`:
  above it they're tagged *Related*, below it *Loosely related*.
- **RRF decides the order** of whatever's eligible. So "keyword priority" isn't a
  weight tweak — it's the gate rule that a lexical or literal hit makes an item
  eligible regardless of cosine, while semantic meaning still leads the ranking.

The mental model: **rank with RRF, gate with substring/keyword/cosine.**

## Absolute scoring and the "no results" case

RRF gives a great *ordering*, but its scores are **relative** — they depend on
list lengths and corpus size, so the same number means different things for
different queries. That's a problem for two things: showing an honest match %,
and deciding when a query matches *nothing*. The fix is to keep RRF for ordering
but use **raw cosine similarity** — which is absolute and comparable across
queries — for judgment:

- **The displayed % and the relevance meter** come from each result's raw cosine,
  so a strong match reads ~70% and a weak one ~20%, instead of the top result
  always being "100%" by construction.
- **The no-match gate**: an item below `LOOSE_FLOOR` with no keyword or substring
  hit is dropped. The lexical/literal arms are the escape hatch so a legitimate
  exact-term query the embedder underrates is never blanked out. `LOOSE_FLOOR` is
  intentionally low (0.15); the real quality signal for semantic-only results is
  the *Related* vs *Loosely related* split at `RELATED_FLOOR` (0.4). When a query
  clears no signal at all, the result list simply comes back empty.

## Provenance tags

Each surfaced result carries a colored tag derived purely from *which* signals
fired (`lib/provenance.ts`), so the list explains itself:

- **Exact** — the query appears literally (substring hit) or an exact/prefix
  keyword term matched. High confidence; your actual characters/words are there.
- **Close** — no exact hit, but MiniSearch's fuzzy matcher fired (a typo was
  corrected, "refnd" → "refund").
- **Related** — no lexical hit; the item surfaced because its *meaning* is a
  confident semantic match (cosine ≥ `RELATED_FLOOR`).
- **Loosely related** — no lexical hit; weak but real semantic signal
  (`LOOSE_FLOOR` ≤ cosine < `RELATED_FLOOR`). Surfaced but visibly demoted.

Precedence is Exact > Close > Related > Loosely related, so an item that's both a
literal hit and a fuzzy-only keyword match reads as Exact. In the document finder
and the extension the tags double as filter checkboxes; the inbox shows them as
labels.

## How the document finder is wired

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
  ├─► KEYWORD:   lib/minisearch-lexical.ts ──► exact + prefix + fuzzy ──► ranked list
  └─► SEMANTIC:  same pipeline ──► lib/vector.ts cosine scan ──► ranked list
      ▼
  lib/vector.ts reciprocalRankFusion(semantic, keyword, substring)
      │   weighted by trust (semantic 1.0 / keyword 0.9 / substring 0.3)
      ▼
  gate: keep items with a substring hit OR keyword hit OR cosine ≥ floor
      ▼
  classify each survivor: Exact / Close / Related / Loosely related
      ▼
click / Enter ──► scrollIntoView(anchorId) + <mark> matched keywords
```

The `/inbox` demo is the same engine with one difference: the unit is **one email
= one vector** (emails are short, well under the model's context window), so
ranking returns whole emails rather than chunks. `lib/email.ts` decides what text
represents each email for embedding vs. keyword matching (author name/email and
tags are folded into the searchable text, so "refund info from Bob" softly favors
Bob's mail without a hard `from:` filter), and adds a **Best match / Most recent**
sort toggle.

## How the core maps to the extension

The `/lib` core is framework-free, so the extension imports it verbatim. What
changes:

- **Real DOM instead of `sampleDocument`.** `extension/extractor.ts` walks every
  block-level element's flow text into the same `Block[]`/`Chunk[]` shape the
  chunker already understands.
- **Semantic is optional.** `extension/extension-search.ts` wraps the core in a
  `PageIndex` class; if the model never loads (CSP, offline, asset missing),
  search still runs on substring + keyword alone so find-in-page never breaks.
- **The model runs in an offscreen document, not the content script.** A content
  script lives in the host page's origin, so a worker spawned there is bound by
  the page's CSP and locked-down sites block the model download. The service
  worker creates an offscreen document (extension origin) that owns the embedding
  worker; the content side talks to it over a Port.
- **Shadow-DOM overlay + a live-DOM Ctrl+F layer.** On top of the ranked search,
  `extension/live-find.ts` highlights every exact match via the CSS Custom
  Highlight API — no DOM mutation, so it survives React/SPA re-renders.

Full details are in [`extension/README.md`](../extension/README.md).

## Tuning knobs

All adjustable without touching logic:

- **RRF weights** (`SemanticFindUI.tsx`, `EmailSearchDemo.tsx`,
  `extension/extension-search.ts`) — relative trust in each signal. Raise keyword
  to make exact-term matches win more, raise semantic to favor meaning, keep
  substring low (≈0.3) so a literal fragment stays findable without dominating.
- **`isLiteralFragment` threshold** (`lib/substring.ts`, ≤ 3 chars) — when the UI
  foregrounds the Ctrl+F count and switches to substring highlighting.
- **`RRF_K`** (`lib/vector.ts`, default 60) — smoothing. Lower (~20) makes the very
  top of each list count for much more; raise to flatten rank #1 vs #5.
- **`LOOSE_FLOOR`** (default 0.15) — the low safety net. A semantic-only result
  below this with no lexical hit is dropped. Keep it low; the quality split is
  handled by `RELATED_FLOOR`.
- **`RELATED_FLOOR`** (default 0.4) — the confident-vs-weak split for
  semantic-only results. Good matches sit ~0.4–0.6.
- **Fuzzy floor** (`lib/minisearch-lexical.ts`) — MiniSearch fuzzy is enabled only
  for terms ≥ 4 chars, at edit distance ≈ 0.2 × term length.
- **`RECENT_RELEVANCE_FLOOR`** (`lib/email.ts`) — how relevant an email must be to
  survive the "Most recent" sort.
- **`STOPWORDS`** (`lib/minisearch-lexical.ts`) — what counts as query noise.

## Other key decisions

- **Substring matches characters; everything else matches tokens.** MiniSearch
  (even with prefix and fuzzy) only ever matches whole words after stemming, so it
  can't find a fragment inside a word. The raw `indexOf` pass is the only signal
  that can, kept at low RRF weight so it gates without dominating.
- **Exact-vs-fuzzy is inferred, not given.** MiniSearch doesn't label a match as
  fuzzy; `lib/minisearch-lexical.ts` derives it by checking whether any matched
  *document* term starts with the *query* term (exact/prefix) or only resembles it
  (fuzzy). That single bit drives the Exact/Close tag split.
- **Normalized embeddings** (`pooling: "mean", normalize: true`) make the dot
  product equal cosine similarity; `lib/vector.ts` still computes norms defensively
  so it's correct for any input.
- **Brute force is the right call** at this scale: a few dozen 384-dim vectors scan
  in microseconds. An ANN index would be pure overhead. (The practical ceiling is
  *indexing* time and memory, not search.)
- **IndexedDB over localStorage**: Float32Arrays round-trip as ArrayBuffers via
  structured clone; localStorage would force JSON strings and hit its ~5 MB cap.
- **Off the main thread**: the document finder and the extension run the pipeline
  in a Web Worker, returning vectors as transferred (zero-copy) ArrayBuffers, so
  typing never janks even on the WASM/CPU path.
- **Two layers of caching**: transformers.js caches the *model weights* in Cache
  Storage automatically; the app additionally caches the *computed vectors* in
  IndexedDB, so a reload skips both download and indexing.
