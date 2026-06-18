// ============================================================
// lib/keyword.ts
// IT IS NOW DEAD CODE, CAN BE DELETED. The keyword half of hybrid search is now in lib/minisearch-lexical.ts, which uses a proper inverted index and is much faster.
// ============================================================
// The lexical (keyword) half of hybrid search. Pure and
// framework-free, like chunk.ts — so it can also run inside a
// Chrome extension content script later.
//
// Two jobs:
//   1. extractKeywords(): turn a natural-language query
//      ("where does it talk about refunds?") into content terms
//      (["refund"]) by dropping stopwords and punctuation.
//   2. keywordScores(): score every chunk by how many query
//      terms it contains, lightly weighted by term frequency.
//
// The score itself is only used to PRODUCE A RANKING — RRF in
// vector.ts ignores the magnitude and keeps only the order — so
// this stays deliberately simple (no full BM25 length math).
// ============================================================

// A compact English stopword list. Extend freely; words here are
// removed from queries before matching. Keep meaning-bearing
// words out of this list (e.g. don't add "cancel" or "data").
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "could",
  "did", "do", "does", "for", "from", "had", "has", "have", "how", "i",
  "if", "in", "into", "is", "it", "its", "me", "my", "of", "on", "or",
  "part", "say", "talk", "talks", "tell", "than", "that", "the", "their",
  "them", "then", "there", "these", "this", "to", "us", "was", "we",
  "what", "when", "where", "which", "who", "why", "will", "with", "would",
  "you", "your", "about", "want", "find", "show", "does", "happen",
  "happens", "section", "thing",
]);

/** Light stemming: fold common suffixes so "refunds"/"refunding"
 *  all match "refund". Crude on purpose — good enough for find. */
function stem(word: string): string {
  return word
    .replace(/(ization|isation)$/, "ize")
    .replace(/(ing|edly|ed|ly|ies|ied|es|s)$/, "")
    .replace(/(.)\1$/, "$1"); // collapse a trailing doubled letter
}

/** Split text into normalized, stemmed word tokens. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ") // strip punctuation, keep letters/digits
    .split(/\s+/)
    .filter(Boolean)
    .map(stem)
    .filter((w) => w.length > 1);
}

/**
 * Extract the content keywords from a query: tokenize, drop
 * stopwords. We stopword-filter the RAW words first, then stem,
 * so "cancelling" survives even though "can" is a stopword.
 */
export function extractKeywords(query: string): string[] {
  const raw = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  const kept = raw.filter((w) => w.length > 1 && !STOPWORDS.has(w)).map(stem);
  // Dedupe while preserving order.
  return [...new Set(kept)];
}

export interface KeywordScore {
  index: number;
  score: number;
  /** How many distinct query keywords appeared in this chunk. */
  hits: number;
}

/**
 * Score each chunk for the given keywords. Score = sum over
 * keywords of (1 + log(termFrequency)), so a chunk that mentions
 * a term repeatedly ranks above one that mentions it once, but
 * with diminishing returns. Chunks with zero hits score 0 and
 * are excluded from the keyword ranking entirely.
 */
export function keywordScores(
  chunkTexts: string[],
  keywords: string[]
): KeywordScore[] {
  if (keywords.length === 0) return [];
  const kwSet = new Set(keywords);

  return chunkTexts.map((text, index) => {
    const tokens = tokenize(text);
    const freq = new Map<string, number>();
    for (const t of tokens) {
      if (kwSet.has(t)) freq.set(t, (freq.get(t) ?? 0) + 1);
    }
    let score = 0;
    for (const count of freq.values()) score += 1 + Math.log(count);
    return { index, score, hits: freq.size };
  });
}