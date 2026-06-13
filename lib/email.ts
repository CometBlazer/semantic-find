// ============================================================
// lib/email.ts
// ============================================================
// Adapter between the email corpus and the existing search core.
// The ranking code (embedding, cosine, RRF, keyword scoring) is
// reused unchanged; this file only decides:
//
//   1. what text represents each email for SEMANTIC embedding
//   2. what text represents each email for KEYWORD matching
//   3. how to sort the ranked results ("Best" vs "Recent")
//
// Design note on "from Bob": we do NOT parse the query for a hard
// author filter. Instead the author's name and email are folded
// into each email's searchable text, so a query like "refund info
// from Bob" naturally favours Bob's messages (and ones mentioning
// Bob) through the normal hybrid ranking — a soft signal, exactly
// as requested. A hard filter can be layered on later if needed.
// ============================================================

import type { Email } from "@/components/sampleEmails";
import type { FusedResult } from "@/lib/vector";

/**
 * Text fed to the embedding model for one email. We lead with the
 * subject and author (short, high-signal) and follow with the body.
 * Tags are appended as plain words so a search for "billing" leans
 * toward tagged emails without needing a separate tag index.
 */
export function emailEmbedText(email: Email): string {
  return [
    email.subject,
    `From: ${email.author.name}`,
    email.tags.join(" "),
    email.body,
  ].join("\n");
}

/**
 * Text used for KEYWORD matching. Same idea as the embed text but
 * we include the author's email address too — keyword search can
 * usefully match "bob.achebe" or a domain, which the embedder
 * would mostly ignore. Subject and author are duplicated lightly
 * (they appear once) so keyword hits there count but don't swamp
 * the body.
 */
export function emailKeywordText(email: Email): string {
  return [
    email.subject,
    email.author.name,
    email.author.email,
    email.tags.join(" "),
    email.body,
  ].join("\n");
}

// ---- Sorting the ranked results ------------------------------

export type SortMode = "best" | "recent";

/**
 * How relevant an email must be to survive the "Recent" sort.
 * In "Recent" mode we don't want to just show the newest emails
 * regardless of the query — that isn't search. So we keep only
 * results whose fused score is at least this fraction of the top
 * result's score, then sort those by time. Lower = more lenient
 * (more emails kept, closer to a pure date sort); higher = stricter
 * (only strong matches, closer to "Best"). Tune to taste.
 */
export const RECENT_RELEVANCE_FLOOR = 0.5;

/**
 * Absolute cosine floor for "does this query match anything at all?".
 * Cosine is comparable across queries (unlike the fused RRF score), so
 * if the BEST email's cosine is below this AND no keyword landed, the
 * query is treated as matching nothing ("Elon Musk" in a support inbox).
 * Tune against your corpus: good matches ~0.4–0.6, nonsense ~0.05–0.2,
 * so somewhere in the valley (~0.25–0.3) works.
 */
export const NO_MATCH_FLOOR = 0.15;

export interface RankedEmail {
  email: Email;
  /** Fused hybrid relevance score (only order is meaningful). */
  score: number;
  /** Raw cosine similarity to the query — absolute match quality,
   *  comparable across queries. Drives the % label and spine. */
  cosine: number;
  /** Original index into the corpus / vector array. */
  index: number;
}

/**
 * Turn fused ranker output into a sorted list of emails.
 *
 * - "best":   straight relevance order (what RRF already gives).
 * - "recent": keep results within RECENT_RELEVANCE_FLOOR of the
 *             best score, then sort those newest-first. When the
 *             most relevant email is also the newest, the two
 *             modes coincide — which is the behaviour you noticed.
 */
export function sortRankedEmails(
  fused: FusedResult[],
  emails: Email[],
  mode: SortMode,
  cosineByIndex: Map<number, number>
): RankedEmail[] {
  const ranked: RankedEmail[] = fused.map((r) => ({
    email: emails[r.index],
    score: r.score,
    cosine: cosineByIndex.get(r.index) ?? 0,
    index: r.index,
  }));

  if (mode === "best") return ranked;

  // recent: relevance gate, then newest-first.
  const top = ranked.length > 0 ? ranked[0].score : 0;
  const floor = top * RECENT_RELEVANCE_FLOOR;
  return ranked
    .filter((r) => r.score >= floor)
    .sort(
      (a, b) =>
        new Date(b.email.timestamp).getTime() -
        new Date(a.email.timestamp).getTime()
    );
}

/** Human-friendly relative time for the card metadata. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  const min = Math.round(diffMs / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.round(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.round(mon / 12)}y ago`;
}