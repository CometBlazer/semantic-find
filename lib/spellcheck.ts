// ============================================================
// lib/spellcheck.ts
// ============================================================
// Local "did you mean?" — no model, no network, no word list.
// The dictionary IS the corpus: every word across all indexed
// emails. A query word is a correctable TYPO only if some corpus
// word sits within a small edit distance of it; otherwise it's
// left alone (real-but-rare word) or the whole query reads as
// GIBBERISH (nothing close to anything).
//
// This is purely lexical (letter-level edit distance). It fixes
// "kingdo" -> "kingdom" and rejects "aw;foijasd", but it can't
// catch "their" -> "there" (both real words). That semantic class
// of error needs query logs we don't have; corpus-dictionary
// correction is the achievable, fully-local 90%.
//
// Framework-free like lib/keyword.ts — same code could run in the
// Chrome-extension content script later.
// ============================================================

// ---- Vocabulary ----------------------------------------------

export interface Vocabulary {
  /** word -> number of occurrences across the corpus. */
  counts: Map<string, number>;
  /** All words, grouped by length, for cheap length-windowed search. */
  byLength: Map<number, string[]>;
}

/** Lowercase word tokens; keep letters and digits, drop the rest.
 *  Mirrors the tokenizer feel in lib/keyword.ts but WITHOUT stemming
 *  — spell-check must compare against real surface words, not stems. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Build the vocabulary from the corpus texts (pass the same email
 * texts you embed/keyword-search, e.g. the keyword texts so author
 * names and tags are spell-correctable too). One pass, cheap.
 */
export function buildVocabulary(texts: string[]): Vocabulary {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const w of words(text)) {
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  const byLength = new Map<number, string[]>();
  for (const w of counts.keys()) {
    const len = w.length;
    const bucket = byLength.get(len);
    if (bucket) bucket.push(w);
    else byLength.set(len, [w]);
  }
  return { counts, byLength };
}

// ---- Edit distance -------------------------------------------

/**
 * Damerau-Levenshtein distance (Optimal String Alignment variant)
 * with an early-exit cap. Unlike plain Levenshtein, a transposition
 * of two adjacent characters counts as ONE edit, not two — which
 * matters a lot for spell-check because transpositions ("refnud"
 * for "refund", "deplyo" for "deploy") are among the most common
 * typos. As soon as a whole row exceeds `max`, we bail and return
 * max+1, so comparisons against far-off words abort almost instantly.
 */
function boundedDamerau(a: string, b: string, max: number): number {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;

  // Three rolling rows: prev2 (i-2), prev (i-1), curr (i).
  let prev2 = new Array<number>(lb + 1).fill(0);
  let prev = new Array<number>(lb + 1);
  let curr = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cb = b.charCodeAt(j - 1);
      const cost = ca === cb ? 0 : 1;
      let v = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
      // Transposition: a[i-1] a[i-2] swapped vs b[j-2] b[j-1].
      if (
        i > 1 &&
        j > 1 &&
        ca === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === cb
      ) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1; // whole row already too far
    // rotate rows
    const tmp = prev2;
    prev2 = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[lb];
}

// ---- Correction policy ---------------------------------------

/** Words this short are skipped: too many real words sit within
 *  distance 1 of each other ("cat"/"car"/"can"), so "correcting"
 *  them does more harm than good. */
const MIN_LEN_TO_CORRECT = 4;

/** Edit-distance budget scaled to word length: short words get 1,
 *  longer words get 2. A 3-letter word at distance 2 is a different
 *  word; an 11-letter word at distance 2 is plainly a typo. */
function maxDistanceFor(len: number): number {
  return len >= 8 ? 2 : 1;
}

/**
 * Find the best correction for a single word, or null if it's
 * already known, too short to touch, or nothing is close enough
 * (the gibberish case). Among candidates at equal distance, the
 * more frequent corpus word wins.
 */
function correctWord(word: string, vocab: Vocabulary): string | null {
  if (vocab.counts.has(word)) return null; // already a real word
  if (word.length < MIN_LEN_TO_CORRECT) return null;
  // Pure-digit / mostly-symbol leftovers aren't worth correcting.
  if (!/\p{L}/u.test(word)) return null;

  const max = maxDistanceFor(word.length);
  let best: string | null = null;
  let bestDist = max + 1;
  let bestCount = -1;

  // Only vocab words whose length is within `max` of ours can be
  // within edit distance `max` — search just those buckets.
  for (let len = word.length - max; len <= word.length + max; len++) {
    const bucket = vocab.byLength.get(len);
    if (!bucket) continue;
    for (const cand of bucket) {
      const d = boundedDamerau(word, cand, max);
      if (d > max) continue;
      const count = vocab.counts.get(cand) ?? 0;
      // Prefer smaller distance; break ties by corpus frequency.
      if (d < bestDist || (d === bestDist && count > bestCount)) {
        best = cand;
        bestDist = d;
        bestCount = count;
      }
    }
  }
  return best;
}

export interface Correction {
  /** The query rewritten with corrected words. */
  corrected: string;
  /** True if any word was actually changed. */
  changed: boolean;
  /** Per-word [original, corrected] pairs that differed. */
  edits: Array<{ from: string; to: string }>;
}

/**
 * Correct a whole query word-by-word against the corpus vocabulary.
 *
 * Returns the (possibly identical) corrected string plus what
 * changed. Gibberish words have no near vocab match, so they're
 * left untouched and simply flow through to the no-match gate —
 * which is exactly what we want: "aw;foijasd" stays "aw;foijasd"
 * and finds nothing, while "united kingdo" becomes "united kingdom".
 *
 * Punctuation/spacing in the original query isn't perfectly
 * preserved (we re-join on single spaces), which is fine for a
 * search box where the query is just terms.
 */
export function correctQuery(query: string, vocab: Vocabulary): Correction {
  const toks = query.split(/\s+/).filter(Boolean);
  const edits: Array<{ from: string; to: string }> = [];

  const correctedToks = toks.map((tok) => {
    // Preserve surrounding punctuation, correct the word core only.
    const m = tok.match(/^(\P{L}*)(.*?)(\P{L}*)$/u);
    if (!m) return tok;
    const [, pre, core, post] = m;
    if (!core) return tok;

    const lower = core.toLowerCase();
    const fix = correctWord(lower, vocab);
    if (!fix || fix === lower) return tok;

    edits.push({ from: core, to: fix });
    return pre + fix + post;
  });

  const corrected = correctedToks.join(" ");
  return { corrected, changed: edits.length > 0, edits };
}