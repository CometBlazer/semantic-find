// ============================================================
// extension/highlighter.ts
// ============================================================
// On-page highlighting for the active result. Two layers:
//
//   1. Element halo  — a class on the source element so the user can
//      see WHERE on the page the match is, even with no literal text
//      (semantic-only results have no substring to underline).
//   2. Literal marks — for substring/keyword queries, wrap each
//      case-insensitive occurrence inside the element's text nodes in
//      a <mark data-sf-mark>. This is the "Option B" approach from the
//      build doc, done reversibly: we only ever insert <mark> wrappers
//      and remove them again, never rewriting the element's structure.
//
// Everything is undoable: clearHighlights() restores the page exactly,
// so closing the overlay / changing the query leaves no trace.
//
// CSS for both classes lives in overlay.css (injected at document
// level, not just the shadow root, so page elements can use it).
// ============================================================

const HALO_CLASS = "semantic-find-active-result";
const MARK_ATTR = "data-sf-mark";

let haloEl: Element | null = null;
const markedRoots = new Set<Element>();

/** Remove the element halo and unwrap every literal <mark> we added. */
export function clearHighlights(): void {
  if (haloEl) {
    haloEl.classList.remove(HALO_CLASS);
    haloEl = null;
  }
  for (const root of markedRoots) unwrapMarks(root);
  markedRoots.clear();
}

/**
 * Highlight one source element: scroll it into view, add the halo, and
 * (if a needle is given) underline literal occurrences inside it.
 * Clears any previous highlight first so only one result is lit.
 */
export function highlightElement(el: Element, needle?: string): void {
  clearHighlights();

  haloEl = el;
  el.classList.add(HALO_CLASS);
  el.scrollIntoView({ behavior: "smooth", block: "center" });

  const n = needle?.trim();
  if (n) markLiteral(el, n);
}

// ---- Literal text-node marking (reversible) ------------------

function markLiteral(root: Element, needle: string): void {
  const lowerNeedle = needle.toLowerCase();

  // Collect text nodes first; mutating during a live TreeWalker walk
  // is fragile. Skip nodes already inside a <mark> we own.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(`[${MARK_ATTR}]`)) return NodeFilter.FILTER_REJECT;
      const text = node.nodeValue ?? "";
      return text.toLowerCase().includes(lowerNeedle)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const targets: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    targets.push(n as Text);
  }

  let wrappedAny = false;
  for (const textNode of targets) {
    if (wrapOccurrences(textNode, lowerNeedle, needle.length)) wrappedAny = true;
  }
  if (wrappedAny) markedRoots.add(root);
}

/** Split one text node so each occurrence of the needle sits in a
 *  <mark data-sf-mark>. Returns true if anything was wrapped. */
function wrapOccurrences(
  textNode: Text,
  lowerNeedle: string,
  needleLen: number
): boolean {
  const value = textNode.nodeValue ?? "";
  const lower = value.toLowerCase();

  const frag = document.createDocumentFragment();
  let last = 0;
  let at = lower.indexOf(lowerNeedle);
  if (at === -1) return false;

  while (at !== -1) {
    if (at > last) frag.appendChild(document.createTextNode(value.slice(last, at)));
    const mark = document.createElement("mark");
    mark.setAttribute(MARK_ATTR, "");
    mark.textContent = value.slice(at, at + needleLen);
    frag.appendChild(mark);
    last = at + needleLen;
    at = lower.indexOf(lowerNeedle, last);
  }
  if (last < value.length) frag.appendChild(document.createTextNode(value.slice(last)));

  textNode.parentNode?.replaceChild(frag, textNode);
  return true;
}

/** Undo markLiteral: replace each <mark data-sf-mark> with its text
 *  and re-merge adjacent text nodes so the DOM is byte-identical. */
function unwrapMarks(root: Element): void {
  const marks = root.querySelectorAll(`mark[${MARK_ATTR}]`);
  for (const mark of marks) {
    const text = document.createTextNode(mark.textContent ?? "");
    mark.parentNode?.replaceChild(text, mark);
  }
  root.normalize();
}
