# Best Match Search Plan (two-list hybrid)

**Model:** rank with RRF, judge with cosine. Two ranked lists — semantic and
lexical — fused by rank position, gated for "no results."

## Chunking
- Split essay into ~100–250 word chunks.
- Natural boundaries: never mid-sentence, prefer paragraph breaks, keep a heading
  attached to the text below it.
- Stable ID per chunk; store original text for highlight + navigation.

## List 1 — Semantic
- Embed every chunk once (MiniLM, mean-pooled, normalized); cache vectors.
- At search time embed the full query, cosine vs every chunk.
- Produces the semantic ranked list **and** the raw cosine per chunk (reused
  for the gate and the displayed match %).

## List 2 — Lexical (MiniSearch owns all of it)
One engine for exact + prefix + fuzzy — no separate hand-rolled keyword pass.
- Index each chunk as one MiniSearch document.
- Query config:
  - `processTerm`: lowercase, drop stopwords (`the, a, an, about, where, is, of`),
    light stem (`refunds→refund`, `policies→policy`).
  - `prefix: true` — "refund" matches "refunds"/"refunding".
  - `fuzzy: 0.2` (fractional) **with a floor**: no fuzzy for terms < 4 chars.
    Fractional fuzziness scales tolerance to length — ~1 edit on 4–6 letter
    words, ~2 on longer ones, so transpositions in real words ("reciept"→
    "receipt", length 7) are caught without loosening short tokens.
  - `boost: { }` left default.
- Produces one lexical ranked list (exact, prefix, and fuzzy hits combined) with
  a per-chunk MiniSearch score and the matched terms (for highlighting).

## Fusion — weighted RRF
- Merge the two lists by **rank position**, never raw scores.
- `score(chunk) = Σ  weight_list / (RRF_K + rank_in_list)`
- **Weights:** semantic `1.0`, lexical `0.9`. (Semantic ≥ lexical — this is a
  meaning-first tool. Starting points, tune on real queries.)
- **RRF_K:** `60`.

## No-match gate
Show a chunk only if **either**:
- its cosine ≥ `NO_MATCH_FLOOR` (`0.28`), **or**
- it has a lexical hit (exact, prefix, or qualifying fuzzy).

Applied **per chunk**, so it both trims the weak tail *and* yields "no results"
when nothing clears it. The OR keeps exact-term and typo matches that the
embedder underrates.

A fuzzy hit only counts toward the gate if it's **confident**: MiniSearch match
on a term ≥ 4 chars within the fractional-fuzzy budget. Same definition reused
for highlighting confidence.

## Sort & display (Best mode)
- Order final results by **fused RRF score**.
- Show per-result **match %** and the relevance spine from **raw cosine**
  (absolute, comparable across queries — not the relative RRF score).
- Use the matched lexical terms for highlighting + "why this matched."

## Highlighting
- Highlight exact + prefix matches in the original text (`refund` → `refunds`).
- Highlight fuzzy matches only when confident (same rule as the gate).

## Tuning knobs
| Knob | Default | Effect |
|---|---|---|
| RRF weights | sem 1.0 / lex 0.9 | trust meaning vs exact terms |
| `RRF_K` | 60 | lower = top ranks dominate more |
| `NO_MATCH_FLOOR` | 0.28 | cosine cut for gate + tail trim |
| MiniSearch `fuzzy` | 0.2 | typo tolerance (length-scaled) |
| min fuzzy length | 4 | shorter tokens never fuzzy-matched |

## Worked example — `"refnd policy"`
- **Semantic:** finds refund/return/reimbursement chunks by meaning.
- **Lexical (MiniSearch):** "policy" exact; "refnd" fuzzy-matches "refund".
- **RRF:** the true refund-policy chunk is ranked by both lists → top.
- **Gate:** unrelated "policy"-only chunks lacking semantic support, and weak
  semantic chunks below 0.28 with no lexical hit, are dropped — not shown merely
  for being "best available."