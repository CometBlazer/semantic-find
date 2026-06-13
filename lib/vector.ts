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

// ============================================================
// Hybrid fusion: weighted Reciprocal Rank Fusion (RRF)
// ============================================================
// Why RRF instead of blending the raw scores?
//   Cosine (~0.3–0.6 here) and keyword scores live on totally
//   different scales, so adding them lets whichever has bigger
//   numbers dominate. RRF throws the magnitudes away and fuses
//   by RANK POSITION instead, which needs no normalization and
//   stays stable even with only a handful of chunks.
//
//   For each list, a chunk at rank r contributes weight/(k + r).
//   A chunk's final score is the sum of those contributions over
//   every list it appears in — so chunks ranked highly by BOTH
//   the keyword and semantic rankers rise to the top.
//
// Tuning knobs:
//   - semanticWeight / keywordWeight: relative trust in each
//     signal. Equal (1/1) is neutral. Raise keywordWeight to make
//     exact-term matches matter more; raise semanticWeight to
//     favour meaning/paraphrase.
//   - RRF_K: smoothing. Larger k flattens the advantage of being
//     rank #1 vs #2 vs #3 (60 is the literature default). Smaller
//     k makes the very top of each list count for much more.
// ============================================================

export const RRF_K = 60;

/** One ranked list going into the fusion: chunk indices, best first. */
export interface RankedList {
  /** Chunk indices in rank order (index 0 = best). */
  order: number[];
  /** How much this list counts toward the fused score. */
  weight: number;
}

export interface FusedResult {
  index: number;
  /** Fused RRF score (small positive numbers; only order matters). */
  score: number;
  /** Per-list ranks for debugging/UI. undefined = absent from that list. */
  semanticRank?: number;
  keywordRank?: number;
}

/**
 * Fuse any number of ranked lists with weighted RRF and return the
 * top `k`. A chunk need not appear in every list — semantic-only
 * and keyword-only matches both still place.
 */
export function reciprocalRankFusion(
  lists: { name: "semantic" | "keyword"; list: RankedList }[],
  k = 5,
  rrfK = RRF_K
): FusedResult[] {
  const acc = new Map<number, FusedResult>();

  for (const { name, list } of lists) {
    list.order.forEach((chunkIndex, rank) => {
      const contribution = list.weight / (rrfK + rank);
      const existing =
        acc.get(chunkIndex) ?? ({ index: chunkIndex, score: 0 } as FusedResult);
      existing.score += contribution;
      if (name === "semantic") existing.semanticRank = rank;
      else existing.keywordRank = rank;
      acc.set(chunkIndex, existing);
    });
  }

  return [...acc.values()].sort((a, b) => b.score - a.score).slice(0, k);
}