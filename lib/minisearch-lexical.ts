// ============================================================
// lib/minisearch-lexical.ts
// ============================================================
// MiniSearch-based lexical engine: exact + prefix + fuzzy in one
// pass. Owns the stopword list, stemmer, and fuzzy floor.
//
// Beyond a flat hit list, this now also reports — per chunk —
// whether the match was EXACT/PREFIX or only FUZZY. MiniSearch
// doesn't label that directly, but it gives us:
//   - queryTerms: the processed query terms that matched ("moto")
//   - terms:      the document terms they matched ("motorcycle")
// A query term that equals or is a PREFIX of some matched document
// term is an exact/prefix hit; if it only matched document terms it
// is NOT a prefix of, it got there by fuzzy (typo) correction.
// That single distinction drives the Exact-vs-Close provenance tag.
// ============================================================

import MiniSearch from "minisearch";

const STOPWORDS = new Set([
  "a", "an", "about", "where", "is", "of",
  "the", "and", "are", "as", "at", "be", "but", "by", "can", "could",
  "did", "do", "does", "for", "from", "had", "has", "have", "how", "i",
  "if", "in", "into", "it", "its", "me", "my", "on", "or",
  "part", "say", "talk", "talks", "tell", "than", "that", "their",
  "them", "then", "there", "these", "this", "to", "us", "was", "we",
  "what", "when", "which", "who", "why", "will", "with", "would",
  "you", "your", "want", "find", "show", "happen", "happens", "section", "thing",
]);

function stem(word: string): string {
  return word
    .replace(/(ization|isation)$/, "ize")
    .replace(/(ing|edly|ed|ly|ies|ied|es|s)$/, "")
    .replace(/(.)\1$/, "$1");
}

/** The same term processor MiniSearch uses at index + query time.
 *  Exported so callers can reproduce MiniSearch's tokenization when
 *  they need to reason about what a query term became (e.g. the
 *  exact-vs-fuzzy check below, and highlight pairing). */
export function processTerm(term: string): string | false {
  const lower = term.toLowerCase();
  if (lower.length <= 1 || STOPWORDS.has(lower)) return false;
  return stem(lower);
}

interface LexDoc {
  id: number;
  text: string;
  heading: string;
}

export interface LexicalHit {
  index: number;
  score: number;
  /** Processed (stemmed) DOCUMENT terms that matched — for highlighting. */
  terms: string[];
  /** True if at least one query term matched a doc term exactly or by prefix. */
  hasExact: boolean;
  /** True if this chunk matched ONLY via fuzzy correction (no exact/prefix). */
  fuzzyOnly: boolean;
}

export type LexicalIndex = MiniSearch<LexDoc>;

export function buildLexicalIndex(
  chunks: { text: string; heading: string }[]
): LexicalIndex {
  const ms = new MiniSearch<LexDoc>({
    fields: ["text", "heading"],
    storeFields: [],
    processTerm,
  });
  ms.addAll(chunks.map((c, id) => ({ id, text: c.text, heading: c.heading })));
  return ms;
}

export function lexicalSearch(
  index: LexicalIndex,
  query: string
): LexicalHit[] {
  const results = index.search(query, {
    prefix: true,
    // No fuzzy for terms < 4 chars; fractional 0.2 scales to length above that.
    fuzzy: (term: string) => (term.length >= 4 ? 0.2 : false),
    combineWith: "OR",
  });

  return results.map((r) => {
    // r.queryTerms: processed query terms that matched (e.g. "refnd").
    // r.terms:      document terms they matched (e.g. "refund").
    // A query term is an exact/prefix hit if some matched DOC term
    // starts with it. If none do, every match here was fuzzy.
    const queryTerms: string[] = (r.queryTerms as string[]) ?? [];
    const docTerms: string[] = (r.terms as string[]) ?? [];

    const hasExact = queryTerms.some((qt) =>
      docTerms.some((dt) => dt.startsWith(qt))
    );

    return {
      index: r.id as number,
      score: r.score,
      terms: docTerms,
      hasExact,
      fuzzyOnly: !hasExact && docTerms.length > 0,
    };
  });
}