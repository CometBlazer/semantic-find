"use client";

// ============================================================
// components/EmailSearchDemo.tsx
// ============================================================
// A second face on the same search engine. Instead of one long
// document, we search a STACK of emails. Each email becomes one
// vector (they're short), and the existing hybrid pipeline —
// keyword extraction + semantic cosine, fused with RRF — ranks
// them. Two new UI ideas over the first demo:
//
//   • a prominent command-style search bar as the page's centre
//   • result cards you expand IN PLACE to read the full email
//     with matched keywords highlighted
//
// Plus a Best / Recent sort toggle (relevance vs newest-first)
// and a corpus switch between two unrelated sample inboxes.
//
// Reused unchanged from the first demo:
//   lib/embedding.ts  lib/vector.ts  lib/keyword.ts  lib/cache.ts
// New, email-specific:
//   lib/email.ts  components/sampleEmails*.ts
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeatureExtractionPipeline } from "@huggingface/transformers";

import {
  sampleEmails,
  LUMENOTE_INBOX_TITLE,
//   type Email,
} from "./sampleEmails";
import { sampleEmailsWork, WORK_INBOX_TITLE } from "./sampleEmailsWork";
import {
  getExtractor,
  embedChunks,
  embedText,
  MODEL_ID,
  type Device,
} from "@/lib/embedding";
import { hashText } from "@/lib/chunk";
import { loadEmbeddings, saveEmbeddings } from "@/lib/cache";
import { topK, reciprocalRankFusion, type Scored } from "@/lib/vector";
import { extractKeywords, keywordScores } from "@/lib/keyword";
import {
  emailEmbedText,
  emailKeywordText,
  sortRankedEmails,
  relativeTime,
  type SortMode,
  type RankedEmail,
} from "@/lib/email";

type Phase =
  | { name: "loading-model"; pct?: number }
  | { name: "indexing"; done: number; total: number }
  | { name: "ready"; fromCache: boolean }
  | { name: "error"; message: string };

const DEBOUNCE_MS = 220;

const CORPORA = {
  lumenote: { title: LUMENOTE_INBOX_TITLE, emails: sampleEmails },
  work: { title: WORK_INBOX_TITLE, emails: sampleEmailsWork },
} as const;
type CorpusKey = keyof typeof CORPORA;

const EXAMPLES: Record<CorpusKey, string[]> = {
  lumenote: [
    "refund info from Bob",
    "what happens to my notes if I cancel",
    "is my data used to train AI",
    "lost my phone, account security",
    "export my notes to another app",
  ],
  work: [
    "deploy notes from Sam",
    "anything about the security breach",
    "can I expense a conference",
    "why is churn going up",
    "database downtime this weekend",
  ],
};

// Wrap matched keywords in <mark>. Prefix match so the stemmed
// keyword "refund" lights up "refunds"/"refunding" in raw text.
function highlight(text: string, keywords: string[]): React.ReactNode {
  if (keywords.length === 0) return text;
  const esc = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`\\b(${esc.join("|")})\\w*`, "giu");
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <mark className="ib-kw" key={key++}>
        {m[0]}
      </mark>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function EmailSearchDemo() {
  const [corpusKey, setCorpusKey] = useState<CorpusKey>("lumenote");
  const corpus = CORPORA[corpusKey];
  const emails = corpus.emails;

  const [phase, setPhase] = useState<Phase>({ name: "loading-model" });
  const [device, setDevice] = useState<Device | null>(null);

  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("best");
  const [results, setResults] = useState<RankedEmail[]>([]);
  const [activeKeywords, setActiveKeywords] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const extractorRef = useRef<FeatureExtractionPipeline | null>(null);
  const vectorsRef = useRef<Float32Array[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchSeq = useRef(0);

  // Precompute the embed/keyword text for the active corpus.
  const embedTexts = useMemo(
    () => emails.map(emailEmbedText),
    [emails]
  );
  const keywordTexts = useMemo(
    () => emails.map(emailKeywordText),
    [emails]
  );

  // =============================================================
  // Load model, then embed (or restore) the active corpus.
  // Re-runs when the corpus switches — each inbox has its own
  // cache key, so flipping back and forth is instant after the
  // first index of each.
  // =============================================================
    useEffect(() => {
    let cancelled = false;

    (async () => {
      // Reset for the newly-selected corpus. Inside the async body
      // so these aren't synchronous setState calls in the effect.
      setPhase({ name: "loading-model" });
      setResults([]);
      setExpandedId(null);

      try {
        const { extractor, device } = await getExtractor((p) => {
          if (!cancelled && typeof p.progress === "number") {
            setPhase({ name: "loading-model", pct: Math.round(p.progress) });
          }
        });
        if (cancelled) return;
        extractorRef.current = extractor;
        setDevice(device);

        const docHash = hashText(embedTexts.join("\u0000"));
        const cacheKey = `${MODEL_ID}::inbox::${corpusKey}::${docHash}`;
        const cached = await loadEmbeddings(cacheKey);

        if (cached && cached.length === emails.length) {
          vectorsRef.current = cached;
          if (!cancelled) setPhase({ name: "ready", fromCache: true });
          return;
        }

        setPhase({ name: "indexing", done: 0, total: emails.length });
        const vectors = await embedChunks(extractor, embedTexts, (done, total) => {
          if (!cancelled) setPhase({ name: "indexing", done, total });
        });
        if (cancelled) return;

        vectorsRef.current = vectors;
        await saveEmbeddings(cacheKey, vectors);
        setPhase({ name: "ready", fromCache: false });
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setPhase({
            name: "error",
            message: err instanceof Error ? err.message : "Failed to load.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [corpusKey, emails, embedTexts]);

  // =============================================================
  // Hybrid search → fused results, then sort by Best / Recent.
  // =============================================================
  const q = query.trim();

  useEffect(() => {
    if (phase.name !== "ready") return;

    if (!q) {
      const id = setTimeout(() => {
        setResults([]);
        setActiveKeywords([]);
        setSearching(false);
      }, 0);
      return () => clearTimeout(id);
    }

    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const extractor = extractorRef.current!;

        // keyword ranking
        const keywords = extractKeywords(q);
        const kw = keywordScores(keywordTexts, keywords)
          .filter((s) => s.hits > 0)
          .sort((a, b) => b.score - a.score);
        const keywordOrder = kw.map((s) => s.index);

        // semantic ranking
        const qVec = await embedText(extractor, q);
        if (seq !== searchSeq.current) return;
        const sem = topK(qVec, vectorsRef.current, vectorsRef.current.length);
        const semanticOrder = sem.map((s: Scored) => s.index);

        // fuse
        const fused = reciprocalRankFusion(
          [
            { name: "semantic", list: { order: semanticOrder, weight: 1.0 } },
            { name: "keyword", list: { order: keywordOrder, weight: 1.0 } },
          ],
          emails.length // keep all; sort/trim happens in sortRankedEmails
        );

        setResults(sortRankedEmails(fused, emails, sortMode));
        setActiveKeywords(keywords);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [q, phase.name, sortMode, emails, keywordTexts]);

  const ready = phase.name === "ready";
  const showResults = ready && q.length > 0;

  return (
    <div className="ib-root">
      {/* ---------- Masthead + search ---------- */}
      <header className="ib-head">
        <div className="ib-head-row">
          <h1 className="ib-wordmark">
            find<span className="ib-wordmark-dot">.</span>mail
          </h1>
          <div className="ib-corpus-switch" role="tablist" aria-label="Inbox">
            {(Object.keys(CORPORA) as CorpusKey[]).map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={corpusKey === key}
                className={corpusKey === key ? "is-on" : ""}
                onClick={() => {
                  setCorpusKey(key);
                  setQuery("");
                }}
              >
                {CORPORA[key].title}
              </button>
            ))}
          </div>
        </div>

        <div className="ib-searchwrap">
          <span className="ib-search-glyph" aria-hidden>
            ⌕
          </span>
          <input
            ref={inputRef}
            className="ib-search"
            type="text"
            placeholder={
              ready
                ? "Search this inbox by meaning — try “refund info from Bob”"
                : "Indexing inbox…"
            }
            value={query}
            disabled={!ready}
            onChange={(e) => {
              setQuery(e.target.value);
              setExpandedId(null);
            }}
            autoFocus
          />
          {searching && <span className="ib-spinner" aria-hidden />}
          {q && (
            <button
              className="ib-clear"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
            >
              ×
            </button>
          )}
        </div>

        <div className="ib-controls">
          <div className="ib-sort" role="radiogroup" aria-label="Sort order">
            <button
              role="radio"
              aria-checked={sortMode === "best"}
              className={sortMode === "best" ? "is-on" : ""}
              onClick={() => setSortMode("best")}
            >
              Best match
            </button>
            <button
              role="radio"
              aria-checked={sortMode === "recent"}
              className={sortMode === "recent" ? "is-on" : ""}
              onClick={() => setSortMode("recent")}
            >
              Most recent
            </button>
          </div>
          <span className="ib-status">
            {!ready && phase.name === "loading-model" && "loading model…"}
            {!ready && phase.name === "indexing" && "indexing…"}
            {ready && device === "webgpu" && "WebGPU · local"}
            {ready && device === "wasm" && "WASM · local"}
          </span>
        </div>
      </header>

      {/* ---------- Progress while not ready ---------- */}
      {phase.name === "loading-model" && (
        <div className="ib-progress">
          <p>Downloading the embedding model {phase.pct ? `— ${phase.pct}%` : "…"}</p>
          <div className="ib-bar">
            <div className="ib-bar-fill" style={{ width: `${phase.pct ?? 5}%` }} />
          </div>
          <p className="ib-hint">
            One-time download, cached by your browser. Every search after runs
            entirely on this device.
          </p>
        </div>
      )}
      {phase.name === "indexing" && (
        <div className="ib-progress">
          <p>
            Embedding email {phase.done} of {phase.total}
          </p>
          <div className="ib-bar">
            <div
              className="ib-bar-fill"
              style={{ width: `${(phase.done / phase.total) * 100}%` }}
            />
          </div>
        </div>
      )}
      {phase.name === "error" && (
        <div className="ib-progress ib-error">
          <p>Couldn’t start the model: {phase.message}</p>
          <p className="ib-hint">Check your connection, then reload.</p>
        </div>
      )}

      {/* ---------- Empty state: example queries ---------- */}
      {ready && !q && (
        <div className="ib-empty">
          <p className="ib-empty-lead">
            {emails.length} emails indexed
            {phase.name === "ready" && phase.fromCache ? " · restored from cache" : ""}.
            Search by what you mean, not just the words used.
          </p>
          <ul className="ib-examples">
            {EXAMPLES[corpusKey].map((ex) => (
              <li key={ex}>
                <button onClick={() => setQuery(ex)}>{ex}</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------- Results ---------- */}
      {showResults && results.length === 0 && !searching && (
        <div className="ib-empty">
          <p className="ib-empty-lead">No emails matched “{q}”.</p>
          <p className="ib-hint">
            Try fewer words, or switch to{" "}
            {sortMode === "recent" ? "Best match" : "a broader phrasing"}.
          </p>
        </div>
      )}

      {showResults && results.length > 0 && (
        <ol className="ib-stack">
          {results.map((r) => {
            const e = r.email;
            const expanded = expandedId === e.id;
            return (
              <li key={e.id}>
                <article
                  className={`ib-card${expanded ? " is-open" : ""}`}
                  style={{ ["--rel" as string]: relStrength(r, results) }}
                >
                  <button
                    className="ib-card-main"
                    aria-expanded={expanded}
                    onClick={() => setExpandedId(expanded ? null : e.id)}
                  >
                    <span className="ib-card-spine" aria-hidden />
                    <span className="ib-card-body">
                      <span className="ib-card-top">
                        <span className="ib-from">{e.author.name}</span>
                        <span className="ib-time">{relativeTime(e.timestamp)}</span>
                      </span>
                      <span className="ib-subject">
                        {highlight(e.subject, activeKeywords)}
                      </span>
                      <span className="ib-snippet">
                        {expanded
                          ? null
                          : highlight(e.body.slice(0, 160) + "…", activeKeywords)}
                      </span>
                      <span className="ib-tags">
                        {e.tags.map((t) => (
                          <span className="ib-tag" key={t}>
                            {t}
                          </span>
                        ))}
                        {sortMode === "best" && (
                          <span className="ib-relscore" aria-label="relevance">
                            {Math.round(relStrength(r, results) * 100)}%
                          </span>
                        )}
                      </span>
                    </span>
                  </button>

                  {expanded && (
                    <div className="ib-full">
                      <div className="ib-full-meta">
                        <span>
                          <strong>{e.author.name}</strong> &lt;{e.author.email}&gt;
                        </span>
                        <span>{new Date(e.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="ib-full-body">
                        {highlight(e.body, activeKeywords)}
                      </p>
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// Relevance strength in [0,1], normalized to the top result of the
// current list, for the spine height and the percentage label.
function relStrength(r: RankedEmail, all: RankedEmail[]): number {
  const top = all.reduce((m, x) => Math.max(m, x.score), 0);
  return top > 0 ? r.score / top : 0;
}