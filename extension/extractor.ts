// ============================================================
// extension/extractor.ts
// ============================================================
// Replaces the demo's static `sampleDocument` with real, live page
// text. The goal is Ctrl+F parity: index ALL visible text on the page —
// nav bars, headings, links, buttons, footers, captions, body copy —
// not just a handful of "article" tags.
//
// Strategy: walk every block-level element and take its OWN flow text —
// the text in its direct text nodes plus any inline descendants
// (<a>, <span>, <strong>, …). Block-level descendants (<p>, <li>, <div>,
// …) are NOT folded in; each becomes its own block. That gives two
// things for free:
//   - full phrases stay intact across inline markup ("Hello <a>world</a>"
//     indexes as "Hello world", so a literal/keyword search still hits),
//   - no duplication: every text node belongs to exactly one block (its
//     nearest block-level ancestor), so we don't need the old
//     container-vs-descendant de-dup pass.
//
// Emits two parallel structures:
//   - blocks:        Block[]  (the SAME shape lib/chunk.ts expects)
//   - elementById:   Map<blockId, Element>  (block id -> real node)
//
// lib/chunk.ts keys every block by `block-${i}` (its index in the
// array); we keep the element for that exact index, so a chunk's
// `blockIds` / `anchorId` map straight back to real DOM nodes for
// scrolling + highlighting. No changes to the shared chunker were needed.
// ============================================================

import { blockId, type Block } from "../lib/chunk";

// Inline elements hold text that belongs to their block-level parent's
// flow — they are folded into that parent, never emitted on their own.
const INLINE_TAGS = new Set([
  "A", "SPAN", "B", "STRONG", "I", "EM", "U", "S", "SMALL", "SUB", "SUP",
  "MARK", "ABBR", "TIME", "CITE", "Q", "CODE", "KBD", "SAMP", "VAR", "BDI",
  "BDO", "DFN", "DATA", "INS", "DEL", "FONT", "TT", "NOBR", "RUBY", "RT",
  "RP", "WBR", "BR",
]);

// Elements whose text is not real page content (or isn't text at all).
const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "META", "LINK", "TITLE",
  "SVG", "CANVAS", "IFRAME", "OBJECT", "EMBED", "AUDIO", "VIDEO", "MAP",
  "SELECT", "OPTION", "DATALIST", "TEXTAREA", "PROGRESS", "METER",
]);

const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

export interface ExtractResult {
  /** Blocks in the exact shape lib/chunk.ts consumes. */
  blocks: Block[];
  /** blockId (`block-${i}`) -> the DOM element it came from. */
  elementById: Map<string, Element>;
}

function isHidden(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.visibility === "collapse" ||
    Number(style.opacity) === 0
  ) {
    return true;
  }
  const rect = el.getBoundingClientRect();
  return rect.width === 0 && rect.height === 0;
}

/**
 * The element's OWN flow text: direct text nodes + the text of inline
 * descendants, but stopping at block-level descendants (which become
 * their own blocks). Whitespace-collapsed and trimmed.
 */
function ownFlowText(el: Element): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element;
      // Inline markup is part of this block's flow; pull its whole
      // subtree text. Block-level children are skipped here — the walk
      // visits them separately and emits them as their own blocks.
      if (INLINE_TAGS.has(child.tagName)) {
        out += child.textContent ?? "";
      }
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Extract readable blocks from the current document. Pure DOM read —
 * never mutates the page (highlighting is a separate, reversible
 * concern in highlighter.ts).
 */
export function extractBlocks(root: ParentNode = document): ExtractResult {
  const scope = (root as Document).body ?? root;
  const blocks: Block[] = [];
  const elementById = new Map<string, Element>();

  for (const el of Array.from(scope.querySelectorAll("*"))) {
    if (SKIP_TAGS.has(el.tagName) || INLINE_TAGS.has(el.tagName)) continue;
    // Never index our own overlay.
    if (el.closest("#semantic-find-extension-root")) continue;

    // Cheap text check first; only pay for layout/style on candidates.
    const text = ownFlowText(el);
    if (!text) continue;
    if (isHidden(el)) continue;

    const i = blocks.length;
    blocks.push({ type: HEADING_TAGS.has(el.tagName) ? "h2" : "p", text });
    // lib/chunk.ts will refer to this block as blockId(i).
    elementById.set(blockId(i), el);
  }

  return { blocks, elementById };
}
