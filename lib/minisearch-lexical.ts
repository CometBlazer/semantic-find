// MiniSearch-based lexical engine: exact + prefix + fuzzy in one pass.
// Owns the stopword list, stemmer, and fuzzy floor from the spec.

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

interface LexDoc {
  id: number;
  text: string;
  heading: string;
}

export interface LexicalHit {
  index: number;
  score: number;
  /** Processed (stemmed) query terms that matched — use for highlighting. */
  terms: string[];
}

export type LexicalIndex = MiniSearch<LexDoc>;

export function buildLexicalIndex(
  chunks: { text: string; heading: string }[]
): LexicalIndex {
  const ms = new MiniSearch<LexDoc>({
    fields: ["text", "heading"],
    storeFields: [],
    processTerm: (term) => {
      const lower = term.toLowerCase();
      if (lower.length <= 1 || STOPWORDS.has(lower)) return false;
      return stem(lower);
    },
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
  return results.map((r) => ({
    index: r.id as number,
    score: r.score,
    terms: r.terms,
  }));
}
