// ============================================================
// extension/extractor.ts
// ============================================================
// Replaces the demo's static `sampleDocument` with real, live page
// text. Walks the DOM for readable block elements, filters out the
// hidden / trivial ones, and emits two parallel structures:
//
//   - blocks:        Block[]  (the SAME shape lib/chunk.ts expects)
//   - elementById:   Map<blockId, Element>  (chunk id -> real node)
//
// lib/chunk.ts keys every paragraph by `block-${i}` where i is the
// position in the Block[] array. We keep an element for that exact
// index, so a chunk's `blockIds` / `anchorId` map straight back to
// real DOM nodes for scrolling + highlighting. No changes to the
// shared chunker were needed.
// ============================================================

import { blockId, type Block } from "../lib/chunk";

// Block-level, readable elements. Order matters only for readability;
// querySelectorAll returns them in document order, which is what we
// want so chunks read top-to-bottom like the page.
const SELECTOR = [
  "article",
  "main",
  "p",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "td",
  "th",
].join(",");

// Headings become section breaks in the chunker; everything else is
// flowing text. lib/chunk.ts only distinguishes "h2" (break) from
// "p" (accumulate), so we collapse all heading levels to "h2".
const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4"]);

const MIN_WORDS = 4;

export interface ExtractResult {
  /** Blocks in the exact shape lib/chunk.ts consumes. */
  blocks: Block[];
  /** blockId (`block-${i}`) -> the DOM element it came from. */
  elementById: Map<string, Element>;
}

function isHidden(el: Element): boolean {
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number(style.opacity) === 0 ||
    (rect.width === 0 && rect.height === 0)
  );
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// Prefer leaf-ish blocks: if an <article>/<main> also contains its own
// <p>/<li> children that we already extract, indexing the container
// duplicates all that text. We skip a container when a descendant is
// also in our candidate set.
function hasExtractableDescendant(el: Element, candidates: Set<Element>): boolean {
  for (const child of candidates) {
    if (child !== el && el.contains(child)) return true;
  }
  return false;
}

/**
 * Extract readable blocks from the current document. Pure DOM read —
 * never mutates the page (highlighting is a separate, reversible
 * concern in highlighter.ts).
 */
export function extractBlocks(root: ParentNode = document): ExtractResult {
  const all = Array.from(root.querySelectorAll(SELECTOR));

  // First pass: keep elements with enough visible text.
  const kept = all.filter((el) => {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) return false;
    if (wordCount(text) < MIN_WORDS) return false;
    if (isHidden(el)) return false;
    // Never index our own overlay.
    if (el.closest("#semantic-find-extension-root")) return false;
    return true;
  });

  const keptSet = new Set(kept);

  const blocks: Block[] = [];
  const elementById = new Map<string, Element>();

  for (const el of kept) {
    // Drop big wrappers (article/main/li/td) whose text is already
    // covered by a more specific descendant we also kept.
    if (hasExtractableDescendant(el, keptSet)) continue;

    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const i = blocks.length;

    if (HEADING_TAGS.has(el.tagName)) {
      blocks.push({ type: "h2", text });
    } else {
      blocks.push({ type: "p", text });
    }
    // lib/chunk.ts will refer to this block as blockId(i).
    elementById.set(blockId(i), el);
  }

  return { blocks, elementById };
}
