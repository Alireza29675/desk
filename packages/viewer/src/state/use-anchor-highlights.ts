import { type CommentAnchor, commentAnchors } from '@desk/types';
import { useEffect } from 'react';
import { rangeFromTextOffsets } from '../lib/anchor-geometry';
import { useStore } from './store';

/**
 * Owns the three text-selection highlights (`desk-anchor-pending` for the
 * comment being composed, `desk-anchor-focused` for a clicked comment being
 * revealed, `desk-anchor-unresolved` for the persistent tint under every
 * unresolved text-anchored comment).
 *
 * Why a single owner instead of per-`Commentable` effects: the CSS Custom
 * Highlight registry is a *global* keyed map. If every Commentable managed the
 * shared key, the non-target instances would clear the highlight the target
 * instance just set — so it would never survive. Driving it once from the
 * store's `commentTarget` / `focusedAnchor` / open comments keeps a single
 * writer.
 *
 * Called once, near the root.
 */
export function useAnchorHighlights(): void {
  const target = useStore((s) => s.commentTarget);
  const focused = useStore((s) => s.focusedAnchor);
  // Re-resolve when the open artifact (and thus the live DOM) changes. This
  // also covers the unresolved set: comment posts/resolves replace `open`.
  const open = useStore((s) => s.open);

  useEffect(() => {
    applyTextHighlight('desk-anchor-pending', target ? [target] : []);
    applyTextHighlight('desk-anchor-focused', focused ? [focused] : []);
    // Persistent indicators: unresolved ROOT comments only (replies inherit
    // the parent's anchor and resolution, so painting roots covers threads).
    // A comment can carry several text-selection anchors, so flatten the whole
    // anchor set — applyTextHighlight keeps just the text-selection ones.
    applyTextHighlight(
      'desk-anchor-unresolved',
      (open?.comments ?? [])
        .filter((c) => !c.resolved && !c.threadParentId)
        .flatMap((c) => commentAnchors(c)),
    );
    return () => {
      setHighlight('desk-anchor-pending', []);
      setHighlight('desk-anchor-focused', []);
      setHighlight('desk-anchor-unresolved', []);
    };
  }, [target, focused, open]);
}

/** Resolve text-selection anchors against the live DOM and paint them. */
function applyTextHighlight(name: string, anchors: CommentAnchor[]): void {
  const ranges: Range[] = [];
  for (const anchor of anchors) {
    if (anchor.kind !== 'text-selection') continue;
    const root = document.querySelector(
      `[data-component-id="${CSS.escape(anchor.componentId)}"] .commentable__content`,
    );
    const range = root ? rangeFromTextOffsets(root, anchor.start, anchor.end) : null;
    if (range) ranges.push(range);
  }
  setHighlight(name, ranges);
}

/** Register or clear a CSS Custom Highlight by name. No-ops where unsupported. */
function setHighlight(name: string, ranges: Range[]): void {
  const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const HighlightCtor = (
    globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }
  ).Highlight;
  if (!highlights || !HighlightCtor) return;
  if (ranges.length > 0) highlights.set(name, new HighlightCtor(...ranges));
  else highlights.delete(name);
}
