// ============================================================
// lib/provenance.ts
// ============================================================
// Decides which colored tag a result carries, based on WHICH
// signals fired AND how strong the semantic match is. No ranking
// here — just classification. Kept separate so the rule is
// obvious and unit-testable.
//
//   "exact"   — the query appears literally (substring hit) OR an
//               exact/prefix keyword token matched. Highest
//               confidence; the user's actual characters/words are
//               in this chunk.
//   "close"   — no exact hit, but MiniSearch's fuzzy matcher fired
//               (a typo correction). "refnd" -> "refund".
//   "related" — no lexical hit, but the meaning is a CONFIDENT
//               match (cosine >= RELATED_FLOOR).
//   "loose"   — no lexical hit, and the meaning is only a WEAK
//               match (LOOSE_FLOOR <= cosine < RELATED_FLOOR).
//               Shown but clearly demoted: "legal" / "corporate"
//               in a corpus that never says those words land here.
//
// Anything below LOOSE_FLOOR with no lexical/substring hit never
// reaches this function — it's gated out upstream (the gibberish
// case). Precedence is exact > close > related > loose: a literal
// or exact-keyword hit is "exact" no matter how weak its cosine.
// ============================================================

export type Provenance = "exact" | "close" | "related" | "loose";

export interface ProvenanceInputs {
  /** Did the raw query string appear literally in this chunk? */
  hasSubstring: boolean;
  /** Did MiniSearch match any term here via exact/prefix (not fuzzy)? */
  hasExactKeyword: boolean;
  /** Did MiniSearch match here ONLY via fuzzy (typo) correction? */
  hasFuzzyKeyword: boolean;
  /** Raw cosine similarity for this chunk (drives related-vs-loose). */
  cosine: number;
}

export interface ProvenanceThresholds {
  /** cosine >= this with no lexical hit => "related" (confident). */
  relatedFloor: number;
  /** cosine in [looseFloor, relatedFloor) with no lexical hit => "loose". */
  looseFloor: number;
}

export function classify(
  inp: ProvenanceInputs,
  thresholds: ProvenanceThresholds
): Provenance {
  if (inp.hasSubstring || inp.hasExactKeyword) return "exact";
  if (inp.hasFuzzyKeyword) return "close";
  // Semantic-only: split by strength.
  if (inp.cosine >= thresholds.relatedFloor) return "related";
  return "loose";
}

/** Human-facing label + a stable className suffix for styling. */
export const PROVENANCE_META: Record<
  Provenance,
  { label: string; className: string }
> = {
  exact: { label: "Exact match", className: "sf-tag-exact" },
  close: { label: "Close match", className: "sf-tag-close" },
  related: { label: "Related", className: "sf-tag-related" },
  loose: { label: "Loosely related", className: "sf-tag-loose" },
};

/** Stable display order for the filter checkboxes + any legend. */
export const PROVENANCE_ORDER: Provenance[] = [
  "exact",
  "close",
  "related",
  "loose",
];