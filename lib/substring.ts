// ============================================================
// lib/substring.ts
// ============================================================
// The literal "Ctrl+F" half of search. Pure and framework-free,
// like chunk.ts / keyword.ts — so it can run in a Chrome
// extension content script later too.
//
// This is the ONE signal that matches characters, not tokens.
// MiniSearch (even with prefix + fuzzy) only ever matches whole
// words after stemming, so it can never find the "f" inside
// "offline" or the "grea" inside "aggregate". A raw indexOf scan
// can. That is what keeps the core Ctrl+F promise alive: if the
// string is literally in the text, it WILL surface — regardless
// of what the semantic ranker thinks.
//
// Two jobs:
//   1. substringHits(): which chunks contain the query as a raw
//      substring, and how many times each (for the gate + count).
//   2. totalOccurrences(): grand total across all chunks, for the
//      "N matches" Ctrl+F-style readout.
//
// Always case-insensitive. Deliberately dumb and fast: a few
// hundred chunks × a short needle is sub-millisecond.
// ============================================================

export interface SubstringHit {
  /** Index of the chunk in the chunk array. */
  index: number;
  /** How many times the needle appears in this chunk (case-insensitive). */
  count: number;
}

/** Count non-overlapping, case-insensitive occurrences of `needle`
 *  in `haystack`. indexOf-based; no regex, so the needle can contain
 *  any characters (including regex metachars like "." or "$") safely. */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let count = 0;
  let from = 0;
  for (;;) {
    const at = h.indexOf(n, from);
    if (at === -1) break;
    count++;
    from = at + n.length; // non-overlapping
  }
  return count;
}

/**
 * Scan every chunk for the raw query string. Returns one entry per
 * chunk that contains it (count > 0), in chunk order. Chunks with
 * no occurrence are omitted entirely.
 *
 * The query is used verbatim (trimmed) — we do NOT tokenize, stem,
 * or split it. "refnd policy" is searched as the literal 12-char
 * string, which is usually NOT what the user wants for multi-word
 * queries, so callers typically only lean on this for short,
 * single-token fragments. See `isLiteralQuery` below.
 */
export function substringHits(
  chunkTexts: string[],
  query: string
): SubstringHit[] {
  const needle = query.trim();
  if (!needle) return [];
  const hits: SubstringHit[] = [];
  for (let i = 0; i < chunkTexts.length; i++) {
    const count = countOccurrences(chunkTexts[i], needle);
    if (count > 0) hits.push({ index: i, count });
  }
  return hits;
}

/** Grand total of occurrences across all chunks — the "N matches"
 *  number for the Ctrl+F readout. */
export function totalOccurrences(hits: SubstringHit[]): number {
  return hits.reduce((sum, h) => sum + h.count, 0);
}

/**
 * Heuristic: is this query better served by literal substring than
 * by token search? A short, single "word" with no spaces — like
 * "f", "grea", "refn" — is a fragment the user is scrubbing for
 * character-by-character, exactly the Ctrl+F case. Multi-word or
 * longer queries are real searches where tokens + semantics should
 * lead and substring is just a safety net.
 *
 * This doesn't disable substring for long queries; it just tells
 * the UI when to FOREGROUND the Ctrl+F count vs. the ranked list.
 */
export function isLiteralFragment(query: string): boolean {
  const q = query.trim();
  return q.length > 0 && q.length <= 3 && !/\s/.test(q);
}