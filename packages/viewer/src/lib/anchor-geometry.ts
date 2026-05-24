/**
 * Geometry helpers for spatial comment anchors (region / point) and text
 * selections (text-selection).
 *
 * The design pillar holds here too: everything that leaves this module and
 * lands in a `CommentAnchor` is *semantic or relative*, never a raw pixel.
 * Points and regions are stored as fractions (0..1) of the component's own
 * box, so they survive zoom, reflow, and different screen sizes. Text ranges
 * are stored as character offsets into the component's resolved text.
 *
 * Projecting back to pixels (for drawing overlays) happens at render time,
 * against the live box — the inverse of the capture step.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Fraction {
  x: number;
  y: number;
}

export interface FractionalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Where a pointer landed, expressed as a fraction (0..1) of `box`. */
export function fractionalPoint(box: Box, clientX: number, clientY: number): Fraction {
  return {
    x: clamp01((clientX - box.left) / box.width),
    y: clamp01((clientY - box.top) / box.height),
  };
}

/** The rectangle spanned by two pointer positions, as fractions of `box`. */
export function fractionalRect(box: Box, a: Fraction, b: Fraction): FractionalRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/**
 * Character offsets of a Selection within `root`, or null if the selection is
 * empty or falls outside `root`. Offsets count into `root`'s resolved text
 * (its `textContent`), so they're stable across re-renders that preserve the
 * text — which is exactly the "resolved semantic text" the anchor model means.
 */
export function textOffsetsWithin(root: Node, selection: Selection | null): { start: number; end: number } | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

  const start = offsetOf(root, range.startContainer, range.startOffset);
  const end = offsetOf(root, range.endContainer, range.endOffset);
  if (start === end) return null;
  return start < end ? { start, end } : { start: end, end: start };
}

/** Count text characters in `root` up to (`node`, `nodeOffset`). */
function offsetOf(root: Node, node: Node, nodeOffset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let count = 0;
  let current = walker.nextNode();
  while (current) {
    if (current === node) return count + nodeOffset;
    count += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }
  // The boundary sits on an element node (e.g. selection ends at a wrapper):
  // fall back to the running total, which points just past the last text seen.
  return count;
}

/**
 * Rebuild a Range spanning [start, end) characters into `root`'s text, for
 * highlighting a stored text-selection anchor. Returns null if the offsets no
 * longer fit the current text (e.g. the component was edited).
 */
export function rangeFromTextOffsets(root: Node, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let count = 0;
  let startNode: Node | null = null;
  let startNodeOffset = 0;
  let endNode: Node | null = null;
  let endNodeOffset = 0;

  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length ?? 0;
    if (startNode === null && count + len >= start) {
      startNode = node;
      startNodeOffset = start - count;
    }
    if (count + len >= end) {
      endNode = node;
      endNodeOffset = end - count;
      break;
    }
    count += len;
    node = walker.nextNode();
  }
  if (!startNode || !endNode) return null;

  const range = document.createRange();
  range.setStart(startNode, startNodeOffset);
  range.setEnd(endNode, endNodeOffset);
  return range;
}

/** A short, readable preview of the selected text, for the composer banner. */
export function selectedTextPreview(selection: Selection | null, max = 48): string {
  const text = selection?.toString().replace(/\s+/g, ' ').trim() ?? '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
