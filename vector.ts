// ============================================================
// lib/vector.ts
// ============================================================
// Brute-force vector search. No ANN index, no library —
// for a few dozen / few hundred chunks a plain O(n·d) scan
// over Float32Arrays finishes in well under a millisecond.
// ============================================================

/**
 * Cosine similarity between two vectors.
 *
 * Note: we request `normalize: true` from the embedding pipeline,
 * so every vector is unit length and the dot product *is* the
 * cosine. The norms are still computed here defensively so the
 * function is correct even for non-normalized inputs.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export interface Scored {
  /** Index of the chunk in the chunk array. */
  index: number;
  /** Cosine similarity in [-1, 1] (in practice ~[0, 1] for MiniLM). */
  score: number;
}

/**
 * Rank every chunk vector against the query vector and return the
 * top `k` matches, best first.
 */
export function topK(
  query: Float32Array,
  vectors: Float32Array[],
  k = 5
): Scored[] {
  const scored: Scored[] = vectors.map((v, index) => ({
    index,
    score: cosineSimilarity(query, v),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
