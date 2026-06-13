"use client";

// ============================================================
// components/SemanticFindDemo.tsx
// ============================================================
// The whole demo lives in this client component. Architecture:
//
//   sampleDocument (static blocks)
//        │ chunkBlocks()                lib/chunk.ts
//        ▼
//   chunks[] ──► embedChunks() ──► Float32Array[384] per chunk
//        │        lib/embedding.ts (transformers.js, in-browser)
//        │        cached via lib/cache.ts (IndexedDB)
//        ▼
//   query ──► embedText() ──► topK() cosine scan ──► results
//                              lib/vector.ts
//
// Lifecycle:
//   1. mount → chunk the document
//   2. load the feature-extraction pipeline (WebGPU → WASM)
//   3. try IndexedDB cache; on miss, embed every chunk with a
//      visible progress bar, then persist to the cache
//   4. ready → every keystroke (debounced) embeds the query
//      locally and brute-force ranks all chunk vectors
//   5. clicking a result scrolls to the paragraph and highlights it
//
// Nothing here generates text, calls a chat model, or talks to
// any inference API. It is retrieval only: a smarter Ctrl+F.
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
  getExtractor,
  embedChunks,
  embedText,
  MODEL_ID,
  type Device,
} from "@/lib/embedding";
import { loadEmbeddings, saveEmbeddings } from "@/lib/cache";
import { topK, type Scored } from "@/lib/vector";

// ---- Types for UI state ---------------------------------------

type Phase =
  | { name: "loading-model"; file?: string; pct?: number }
  | { name: "indexing"; done: number; total: number }
  | { name: "ready"; fromCache: boolean }
  | { name: "error"; message: string };

const TOP_K = 5;
const DEBOUNCE_MS = 250;

const EXAMPLE_QUERIES = [
  "where does it talk about refunds?",
  "the part about cancelling",
  "privacy concerns",
  "can I take my notes elsewhere?",
  "what happens if my card is declined",
];

export default function SemanticFindDemo() {
  // ---- Indexing state -----------------------------------------
  const [phase, setPhase] = useState<Phase>({ name: "loading-model" });
  const [device, setDevice] = useState<Device | null>(null);

  // ---- Search state -------------------------------------------
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Scored[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0); // keyboard cursor in results
  const [selectedChunk, setSelectedChunk] = useState<number | null>(null);

  // ---- Long-lived objects kept out of React state -------------
  // Vectors and the pipeline are big and never drive rendering
  // directly, so refs avoid pointless re-renders and effect churn.
  const extractorRef = useRef<FeatureExtractionPipeline | null>(null);
  const vectorsRef = useRef<Float32Array[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchSeq = useRef(0); // discards stale async search results

  // Chunk once — the document is static.
  const chunks: Chunk[] = useMemo(() => chunkBlocks(sampleDocument), []);

  // =============================================================
  // 1–3. Load model, then embed (or restore) the chunk index
  // =============================================================
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Step 1: model (downloads ~25 MB once, then browser-cached).
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

        // Step 2: cache lookup — key ties model + document together.
        const docHash = hashText(chunks.map((c) => c.text).join("\u0000"));
        const cacheKey = `${MODEL_ID}::${docHash}`;
        const cached = await loadEmbeddings(cacheKey);

        if (cached && cached.length === chunks.length) {
          vectorsRef.current = cached;
          if (!cancelled) setPhase({ name: "ready", fromCache: true });
          return;
        }

        // Step 3: embed every chunk locally, with visible progress.
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
        await saveEmbeddings(cacheKey, vectors); // best-effort persist
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
  // 4. Debounced semantic search on every query change
  // =============================================================
  const q = query.trim();

  useEffect(() => {
    if (phase.name !== "ready") return;

    // Empty query: clear asynchronously so we're not calling
    // setState synchronously in the effect body.
    if (!q) {
      const id = setTimeout(() => {
        setResults([]);
        setSearching(false);
      }, 0);
      return () => clearTimeout(id);
    }

    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      setSearching(true); // now inside the async callback, not the effect body
      try {
        const extractor = extractorRef.current!;
        const qVec = await embedText(extractor, q);
        if (seq !== searchSeq.current) return; // user kept typing
        setResults(topK(qVec, vectorsRef.current, TOP_K));
        setActiveIdx(0);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [q, phase.name]);

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
  // Cmd/Ctrl+K opens the finder (native Ctrl+F is left alone so
  // the browser's literal find still works alongside this one).
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

  // Arrow keys move through results, Enter jumps — like Ctrl+F's
  // next/previous buttons.
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
      jumpTo(results[activeIdx].index);
    }
  };

  // Which paragraph ids are currently highlighted?
  const highlighted = useMemo(() => {
    if (selectedChunk === null) return new Set<string>();
    return new Set(chunks[selectedChunk].blockIds);
  }, [selectedChunk, chunks]);

  const ready = phase.name === "ready";

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
              {block.text}
            </h2>
          ) : (
            <p
              key={i}
              id={blockId(i)}
              className={highlighted.has(blockId(i)) ? "sf-hit" : undefined}
            >
              {block.text}
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
                  style={{
                    width: `${(phase.done / phase.total) * 100}%`,
                  }}
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
          {ready && !query.trim() && (
            <div className="sf-status">
              <p className="sf-finehint">
                {chunks.length} chunks indexed
                {phase.fromCache ? " (restored from IndexedDB)" : ""}. Try a
                meaning, not a keyword:
              </p>
              <ul className="sf-examples">
                {EXAMPLE_QUERIES.map((q) => (
                  <li key={q}>
                    <button onClick={() => setQuery(q)}>{q}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ready && query.trim() && results.length > 0 && (
            <ol className="sf-results">
              {results.map((r, i) => {
                const chunk = chunks[r.index];
                const pct = Math.round(Math.max(0, r.score) * 100);
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
                        <span className="sf-result-score">{pct}%</span>
                      </span>
                      <span className="sf-result-snippet">
                        {chunk.text.slice(0, 140)}…
                      </span>
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
