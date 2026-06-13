// ============================================================
// lib/chunk.ts
// ============================================================
// Pure, framework-free chunking logic.
//
// The document is modeled as an ordered list of blocks
// (headings + paragraphs), each with a stable DOM id.
// The chunker groups consecutive paragraphs into chunks of
// roughly TARGET_WORDS words, never crossing a heading
// boundary, and remembers:
//
//   - which DOM ids belong to the chunk  -> for scroll + highlight
//   - the nearest heading above it       -> for result context
//
// Keeping this separate from React means the exact same code
// can later run inside a Chrome extension content script over
// a real page's DOM.
// ============================================================

export type Block =
  | { type: "h2"; text: string }
  | { type: "p"; text: string };

export interface Chunk {
  /** Index into the chunk array — doubles as the embedding row index. */
  id: number;
  /** Concatenated paragraph text that gets embedded. */
  text: string;
  /** DOM ids of every paragraph in this chunk (for highlighting). */
  blockIds: string[];
  /** DOM id of the first paragraph (scroll target). */
  anchorId: string;
  /** Nearest heading above the chunk, for display in results. */
  heading: string;
  wordCount: number;
}

/** Target chunk size in words. 100–200 is the sweet spot for
 *  all-MiniLM-L6-v2 (256-token context): big enough to carry
 *  meaning, small enough that one topic dominates the vector. */
const TARGET_WORDS = 150;

export function blockId(index: number): string {
  return `block-${index}`;
}

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * Split a block list into embeddable chunks.
 *
 * Strategy:
 *  - walk blocks in order
 *  - headings update "current heading" and force a chunk break
 *    (a chunk should never straddle two sections)
 *  - paragraphs accumulate until ~TARGET_WORDS, then flush
 *  - a single paragraph longer than the target becomes its own chunk
 */
export function chunkBlocks(blocks: Block[]): Chunk[] {
  const chunks: Chunk[] = [];

  let heading = "";
  let buf: { text: string; id: string }[] = [];
  let bufWords = 0;

  const flush = () => {
    if (buf.length === 0) return;
    chunks.push({
      id: chunks.length,
      text: buf.map((b) => b.text).join("\n"),
      blockIds: buf.map((b) => b.id),
      anchorId: buf[0].id,
      heading,
      wordCount: bufWords,
    });
    buf = [];
    bufWords = 0;
  };

  blocks.forEach((block, i) => {
    if (block.type === "h2") {
      flush(); // never cross a section boundary
      heading = block.text;
      return;
    }
    const words = countWords(block.text);
    // If adding this paragraph would blow well past the target,
    // flush first so chunks stay in the 100–200 word band.
    if (bufWords > 0 && bufWords + words > TARGET_WORDS * 1.3) {
      flush();
    }
    buf.push({ text: block.text, id: blockId(i) });
    bufWords += words;
    if (bufWords >= TARGET_WORDS) flush();
  });
  flush();

  return chunks;
}

/**
 * Tiny stable hash of the document text (djb2). Used as part of
 * the IndexedDB cache key so editing the sample document
 * automatically invalidates cached embeddings.
 */
export function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
