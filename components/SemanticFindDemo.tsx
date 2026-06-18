"use client";

// ============================================================
// components/SemanticFindDemo.tsx
// ============================================================
// Supercharged Ctrl+F. FOUR signals, fused:
//
//   substring  lib/substring.ts        literal Ctrl+F (chars)
//   keyword    lib/minisearch-lexical  tokens: exact+prefix+fuzzy
//   semantic   lib/embedding + vector  cosine over 384-dim vectors
//   fusion     lib/vector (RRF)        rank-position blend + gate
//
// Layering rule ("Ctrl+F always works, semantics overshadows it"):
//   GATE (eligibility): a chunk shows if it has a substring hit OR
//     a keyword hit OR cosine >= floor. The substring OR is what
//     guarantees the literal-find promise — type "f" and every
//     chunk containing an f is eligible, period.
//   RANK (ordering): eligible chunks are ordered by RRF over the
//     semantic + keyword lists, so a strong MEANING match outranks
//     a chunk that merely contains the letter. Substring feeds the
//     gate, not the rank — otherwise "e" would flood the top.
//
// Each result carries a provenance tag (Exact / Close / Related)
// computed from which signals fired. A running occurrence count
// (literal substring total) is always shown, Ctrl+F style.
//
// Retrieval only: nothing generates text or calls an inference API.
// ============================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FeatureExtractionPipeline } from "@huggingface/transformers";

import { sampleDocument, DOC_TITLE } from "./sampleDocument";
import { chunkBlocks, blockId, hashText, type Chunk } from "@/lib/chunk";
import {
  buildLexicalIndex,
  lexicalSearch,
  type LexicalIndex,
} from "@/lib/minisearch-lexical";
import {
  substringHits,
  totalOccurrences,
  isLiteralFragment,
} from "@/lib/substring";
import {
  classify,
  PROVENANCE_META,
  type Provenance,
} from "@/lib/provenance";
import {
  getExtractor,
  embedChunks,
  embedText,
  MODEL_ID,
  type Device,
} from "@/lib/embedding";
import { loadEmbeddings, saveEmbeddings } from "@/lib/cache";
import {
  topK,
  reciprocalRankFusion,
  type Scored,
  type FusedResult,
} from "@/lib/vector";

// ---- Types for UI state ---------------------------------------

type Phase =
  | { name: "loading-model"; file?: string; pct?: number }
  | { name: "indexing"; done: number; total: number }
  | { name: "ready"; fromCache: boolean }
  | { name: "error"; message: string };

type SearchResult = FusedResult & {
  /** Raw cosine similarity — drives match % and the no-match gate. */
  cosine: number;
  /** Stemmed doc terms that matched lexically — used for highlighting. */
  matchedTerms: string[];
  /** Which signals fired → the colored tag. */
  provenance: Provenance;
  /** Literal substring occurrences in this chunk (0 if none). */
  substringCount: number;
};

const TOP_K = 5;
const DEBOUNCE_MS = 250;
const NO_MATCH_FLOOR = 0.28; // min cosine to show a result with no lexical/substring hit
const SEMANTIC_WEIGHT = 1.0;
const LEXICAL_WEIGHT = 0.9;
// Substring ranks LOW on purpose: it's a safety net for the gate,
// not a relevance signal. Without this a one-char query floods the
// top of the list with whatever chunk has the most of that letter.
const SUBSTRING_WEIGHT = 0.3;

const EXAMPLE_QUERIES = [
  "where does it talk about refunds?",
  "the part about cancelling",
  "privacy concerns",
  "can I take my notes elsewhere?",
  "what happens if my card is declined",
];

// Split text into React nodes with matched keywords wrapped in <mark>.
// Matches on word prefix so "refund" highlights inside "refunds".
function highlightKeywords(
  text: string,
  keywords: string[]
): React.ReactNode {
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
      <mark className="sf-kw" key={key++}>
        {m[0]}
      </mark>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Literal substring highlighter — for the Ctrl+F path. Wraps every
// case-insensitive occurrence of the raw needle, mid-word included
// (this is what catches the "f" inside "offline"). Kept separate
// from highlightKeywords, which is word/prefix-aware.
function highlightSubstring(
  text: string,
  needle: string
): React.ReactNode {
  const n = needle.trim();
  if (!n) return text;
  const lowerText = text.toLowerCase();
  const lowerN = n.toLowerCase();
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (;;) {
    const at = lowerText.indexOf(lowerN, last);
    if (at === -1) break;
    if (at > last) out.push(text.slice(last, at));
    out.push(
      <mark className="sf-kw" key={key++}>
        {text.slice(at, at + n.length)}
      </mark>
    );
    last = at + n.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function SemanticFindDemo() {
  // ---- Indexing state -----------------------------------------
  const [phase, setPhase] = useState<Phase>({ name: "loading-model" });
  const [device, setDevice] = useState<Device | null>(null);

  // ---- Search state -------------------------------------------
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeKeywords, setActiveKeywords] = useState<string[]>([]);
  // The raw literal needle for substring highlighting in the body.
  const [activeNeedle, setActiveNeedle] = useState("");
  const [occurrences, setOccurrences] = useState(0); // total literal hits
  const [literalMode, setLiteralMode] = useState(false); // short fragment?
  const [searching, setSearching] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedChunk, setSelectedChunk] = useState<number | null>(null);

  // ---- Long-lived objects kept out of React state -------------
  const extractorRef = useRef<FeatureExtractionPipeline | null>(null);
  const vectorsRef = useRef<Float32Array[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchSeq = useRef(0);

  // Chunk once — the document is static.
  const chunks: Chunk[] = useMemo(() => chunkBlocks(sampleDocument), []);

  // Build the MiniSearch index synchronously; stable alongside chunks.
  const msIndex: LexicalIndex = useMemo(
    () =>
      buildLexicalIndex(
        chunks.map((c) => ({ text: c.text, heading: c.heading }))
      ),
    [chunks]
  );

  // Raw chunk texts for the substring scan (verbatim, not tokenized).
  const chunkTexts: string[] = useMemo(
    () => chunks.map((c) => c.text),
    [chunks]
  );

  // =============================================================
  // 1–3. Load model, then embed (or restore) the chunk index
  // =============================================================
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { extractor, device } = await getExtractor((p) => {
          if (!cancelled && typeof p.progress === "number") {
            setPhase({
              name: "loading-model",
              file: p.file,
              pct: Math.round(p.progress),
            });
          }
        });
        if (cancelled) return;
        extractorRef.current = extractor;
        setDevice(device);

        const docHash = hashText(chunks.map((c) => c.text).join("\u0000"));
        const cacheKey = `${MODEL_ID}::${docHash}`;
        const cached = await loadEmbeddings(cacheKey);

        if (cached && cached.length === chunks.length) {
          vectorsRef.current = cached;
          if (!cancelled) setPhase({ name: "ready", fromCache: true });
          return;
        }

        setPhase({ name: "indexing", done: 0, total: chunks.length });
        const vectors = await embedChunks(
          extractor,
          chunks.map((c) => c.text),
          (done, total) => {
            if (!cancelled) setPhase({ name: "indexing", done, total });
          }
        );
        if (cancelled) return;

        vectorsRef.current = vectors;
        await saveEmbeddings(cacheKey, vectors);
        setPhase({ name: "ready", fromCache: false });
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setPhase({
            name: "error",
            message:
              err instanceof Error ? err.message : "Failed to load the model.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chunks]);

  // =============================================================
  // 4. Debounced search: substring + lexical + semantic → gate + RRF
  // =============================================================
  const q = query.trim();

  useEffect(() => {
    if (phase.name !== "ready") return;

    if (!q) {
      const id = setTimeout(() => {
        setResults([]);
        setActiveKeywords([]);
        setActiveNeedle("");
        setOccurrences(0);
        setLiteralMode(false);
        setSearching(false);
      }, 0);
      return () => clearTimeout(id);
    }

    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const extractor = extractorRef.current!;

        // --- Signal 1: literal substring (Ctrl+F) ---
        const subHits = substringHits(chunkTexts, q);
        const subCountMap = new Map(subHits.map((h) => [h.index, h.count]));
        const subHitSet = new Set(subHits.map((h) => h.index));
        const totalOcc = totalOccurrences(subHits);
        // Order substring hits by occurrence count (most first) so they
        // have a defined RRF rank even though their weight is low.
        const substringOrder = [...subHits]
          .sort((a, b) => b.count - a.count)
          .map((h) => h.index);

        // --- Signal 2: lexical (MiniSearch exact+prefix+fuzzy) ---
        const lexHits = lexicalSearch(msIndex, q);
        const lexHitSet = new Set(lexHits.map((h) => h.index));
        const lexTermsMap = new Map(lexHits.map((h) => [h.index, h.terms]));
        const lexExactSet = new Set(
          lexHits.filter((h) => h.hasExact).map((h) => h.index)
        );
        const lexFuzzySet = new Set(
          lexHits.filter((h) => h.fuzzyOnly).map((h) => h.index)
        );
        const keywordOrder = lexHits.map((h) => h.index); // MiniSearch-sorted

        // --- Signal 3: semantic (embed + cosine) ---
        const qVec = await embedText(extractor, q);
        if (seq !== searchSeq.current) return; // user kept typing
        const sem = topK(qVec, vectorsRef.current, vectorsRef.current.length);
        const cosineMap = new Map<number, number>(
          sem.map((s: Scored) => [s.index, s.score])
        );
        const semanticOrder = sem.map((s: Scored) => s.index);

        // --- Fuse semantic + keyword + substring with weighted RRF ---
        const fused = reciprocalRankFusion(
          [
            { name: "semantic", list: { order: semanticOrder, weight: SEMANTIC_WEIGHT } },
            { name: "keyword", list: { order: keywordOrder, weight: LEXICAL_WEIGHT } },
            { name: "substring", list: { order: substringOrder, weight: SUBSTRING_WEIGHT } },
          ],
          vectorsRef.current.length
        );

        // --- Gate: keep chunks with a substring hit OR a lexical hit
        //     OR cosine >= floor. (Ctrl+F promise lives in the first OR.) ---
        const gated: SearchResult[] = fused
          .filter((r) => {
            const cosine = cosineMap.get(r.index) ?? 0;
            return (
              subHitSet.has(r.index) ||
              lexHitSet.has(r.index) ||
              cosine >= NO_MATCH_FLOOR
            );
          })
          .slice(0, TOP_K)
          .map((r) => ({
            ...r,
            cosine: cosineMap.get(r.index) ?? 0,
            matchedTerms: lexTermsMap.get(r.index) ?? [],
            substringCount: subCountMap.get(r.index) ?? 0,
            provenance: classify({
              hasSubstring: subHitSet.has(r.index),
              hasExactKeyword: lexExactSet.has(r.index),
              hasFuzzyKeyword: lexFuzzySet.has(r.index),
            }),
          }));

        const allMatchedTerms = [
          ...new Set(gated.flatMap((r) => r.matchedTerms)),
        ];

        setResults(gated);
        setActiveKeywords(allMatchedTerms);
        setActiveNeedle(q);
        setOccurrences(totalOcc);
        setLiteralMode(isLiteralFragment(q));
        setActiveIdx(0);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [q, phase.name, chunkTexts, msIndex]);

  // =============================================================
  // 5. Jump-to-result: scroll + highlight the chunk's paragraphs
  // =============================================================
  const jumpTo = useCallback(
    (chunkIndex: number) => {
      setSelectedChunk(chunkIndex);
      const chunk = chunks[chunkIndex];
      const anchor = document.getElementById(chunk.anchorId);
      anchor?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [chunks]
  );

  // ---- Keyboard shortcuts -------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (e.key === "Escape") {
        setOpen(false);
        setSelectedChunk(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[activeIdx] ?? results[0];
      jumpTo(target.index);
    }
  };

  const highlighted = useMemo(() => {
    if (selectedChunk === null) return new Set<string>();
    return new Set(chunks[selectedChunk].blockIds);
  }, [selectedChunk, chunks]);

  const ready = phase.name === "ready";

  // In literal mode, body highlighting uses raw substring; otherwise
  // it uses the word/prefix-aware keyword highlighter.
  const renderBlockText = (text: string) => {
    if (literalMode && activeNeedle) {
      return highlightSubstring(text, activeNeedle);
    }
    return activeKeywords.length > 0
      ? highlightKeywords(text, activeKeywords)
      : text;
  };

  // =============================================================
  // Render
  // =============================================================
  return (
    <div className="sf-page">
      {/* ---------- The "webpage" being searched ---------- */}
      <article className="sf-article">
        <p className="sf-doc-kicker">Demo document</p>
        <h1>{DOC_TITLE}</h1>
        {sampleDocument.map((block, i) =>
          block.type === "h2" ? (
            <h2 key={i} id={blockId(i)}>
              {activeKeywords.length > 0 || (literalMode && activeNeedle)
                ? renderBlockText(block.text)
                : block.text}
            </h2>
          ) : (
            <p
              key={i}
              id={blockId(i)}
              className={highlighted.has(blockId(i)) ? "sf-hit" : undefined}
            >
              {selectedChunk !== null && highlighted.has(blockId(i))
                ? renderBlockText(block.text)
                : literalMode && activeNeedle
                ? renderBlockText(block.text)
                : block.text}
            </p>
          )
        )}
      </article>

      {/* ---------- Floating semantic-find overlay ---------- */}
      {!open && (
        <button className="sf-fab" onClick={() => setOpen(true)}>
          Semantic find <kbd>⌘K</kbd>
        </button>
      )}

      {open && (
        <section className="sf-overlay" aria-label="Semantic find">
          <header className="sf-overlay-head">
            <span className="sf-overlay-title">Semantic find</span>
            <span className="sf-overlay-sub">
              {device === "webgpu" && ready && "WebGPU · local"}
              {device === "wasm" && ready && "WASM · local"}
              {!ready && "loading…"}
            </span>
            <button
              className="sf-close"
              aria-label="Close finder"
              onClick={() => {
                setOpen(false);
                setSelectedChunk(null);
              }}
            >
              ×
            </button>
          </header>

          <div className="sf-inputrow">
            <input
              ref={inputRef}
              className="sf-input"
              type="text"
              placeholder={
                ready ? "Describe what you're looking for…" : "Indexing…"
              }
              value={query}
              disabled={!ready}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              autoFocus
            />
            {searching && <span className="sf-spinner" aria-hidden />}
          </div>

          {/* ----- Ctrl+F-style occurrence count (always shown when searching) ----- */}
          {ready && q && (
            <div className="sf-countbar">
              {occurrences > 0 ? (
                <span>
                  {occurrences} literal {occurrences === 1 ? "match" : "matches"}
                  {" "}
                  across {results.filter((r) => r.substringCount > 0).length}{" "}
                  {results.filter((r) => r.substringCount > 0).length === 1
                    ? "chunk"
                    : "chunks"}
                </span>
              ) : (
                <span>No literal matches — showing meaning-based results</span>
              )}
            </div>
          )}

          {/* ----- Status / progress while not ready ----- */}
          {phase.name === "loading-model" && (
            <div className="sf-status">
              <p>
                Downloading {MODEL_ID.split("/")[1]}
                {phase.pct !== undefined ? ` — ${phase.pct}%` : "…"}
              </p>
              <div className="sf-bar">
                <div
                  className="sf-bar-fill"
                  style={{ width: `${phase.pct ?? 5}%` }}
                />
              </div>
              <p className="sf-finehint">
                One-time download. The model is cached by your browser; every
                search afterwards runs entirely on this device.
              </p>
            </div>
          )}

          {phase.name === "indexing" && (
            <div className="sf-status">
              <p>
                Embedding chunk {phase.done} of {phase.total}
              </p>
              <div className="sf-bar">
                <div
                  className="sf-bar-fill"
                  style={{ width: `${(phase.done / phase.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {phase.name === "error" && (
            <div className="sf-status sf-error">
              <p>Couldn&apos;t start the model: {phase.message}</p>
              <p className="sf-finehint">
                Check your connection for the first-time model download, then
                reload the page.
              </p>
            </div>
          )}

          {/* ----- Ready: examples or results ----- */}
          {ready && !q && (
            <div className="sf-status">
              <p className="sf-finehint">
                {chunks.length} chunks indexed
                {phase.name === "ready" && phase.fromCache
                  ? " (restored from IndexedDB)"
                  : ""}
                . Try a meaning, not a keyword:
              </p>
              <ul className="sf-examples">
                {EXAMPLE_QUERIES.map((ex) => (
                  <li key={ex}>
                    <button onClick={() => setQuery(ex)}>{ex}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ready && q && !searching && results.length === 0 && (
            <div className="sf-status">
              <p className="sf-finehint">No results — try different terms.</p>
            </div>
          )}

          {ready && q && results.length > 0 && (
            <ol className="sf-results">
              {results.map((r, i) => {
                const chunk = chunks[r.index];
                const pct = Math.round(Math.max(0, r.cosine) * 100);
                const tag = PROVENANCE_META[r.provenance];
                return (
                  <li key={r.index}>
                    <button
                      className={[
                        "sf-result",
                        i === activeIdx ? "is-active" : "",
                        selectedChunk === r.index ? "is-selected" : "",
                      ].join(" ")}
                      onClick={() => {
                        setActiveIdx(i);
                        jumpTo(r.index);
                      }}
                    >
                      <span className="sf-result-head">
                        <span className="sf-result-section">
                          {chunk.heading || DOC_TITLE}
                        </span>
                        <span className={`sf-tag ${tag.className}`}>
                          {tag.label}
                        </span>
                        <span className="sf-result-score">{pct}%</span>
                      </span>
                      <span className="sf-result-snippet">
                        {literalMode && activeNeedle
                          ? highlightSubstring(
                              chunk.text.slice(0, 140),
                              activeNeedle
                            )
                          : highlightKeywords(
                              chunk.text.slice(0, 140),
                              activeKeywords
                            )}
                        …
                      </span>
                      {r.substringCount > 0 && (
                        <span className="sf-result-occ">
                          {r.substringCount} literal{" "}
                          {r.substringCount === 1 ? "hit" : "hits"} here
                        </span>
                      )}
                      <span className="sf-meter" aria-hidden>
                        <span style={{ width: `${pct}%` }} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}