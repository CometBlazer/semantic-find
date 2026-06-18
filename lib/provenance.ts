// ============================================================
// lib/provenance.ts
// ============================================================
// Decides which colored tag a result carries, based purely on
// WHICH signals fired for that chunk. No ranking here — just
// classification. Kept separate so the rule is obvious and
// unit-testable.
//
//   "exact"   — the query appears literally (substring hit) OR an
//               exact keyword token matched. High confidence; the
//               user's actual characters/words are in this chunk.
//   "close"   — no exact hit, but MiniSearch's fuzzy matcher fired
//               (a typo correction). "refnd" -> "refund".
//   "related" — no lexical hit at all; this chunk only surfaced
//               because its meaning was close (cosine cleared the
//               floor). The pure-semantic case.
//
// Precedence is exact > close > related: if a chunk has both an
// exact substring hit and a fuzzy-only keyword term, it's "exact".
// ============================================================

export type Provenance = "exact" | "close" | "related";

export interface ProvenanceInputs {
  /** Did the raw query string appear literally in this chunk? */
  hasSubstring: boolean;
  /** Did MiniSearch match any term here via exact/prefix (not fuzzy)? */
  hasExactKeyword: boolean;
  /** Did MiniSearch match here ONLY via fuzzy (typo) correction? */
  hasFuzzyKeyword: boolean;
}

export function classify(inp: ProvenanceInputs): Provenance {
  if (inp.hasSubstring || inp.hasExactKeyword) return "exact";
  if (inp.hasFuzzyKeyword) return "close";
  return "related";
}

/** Human-facing label + a stable className suffix for styling. */
export const PROVENANCE_META: Record<
  Provenance,
  { label: string; className: string }
> = {
  exact: { label: "Exact match", className: "sf-tag-exact" },
  close: { label: "Close match", className: "sf-tag-close" },
  related: { label: "Related", className: "sf-tag-related" },
};