import type { CommentAnchor } from '@desk/types';
import { useEffect } from 'react';
import { rangeFromTextOffsets } from '../lib/anchor-geometry';
import { useStore } from './store';

/**
 * Owns the two text-selection highlights (`desk-anchor-pending` for the comment
 * being composed, `desk-anchor-focused` for a clicked comment being revealed).
 *
 * Why a single owner instead of per-`Commentable` effects: the CSS Custom
 * Highlight registry is a *global* keyed map. If every Commentable managed the
 * shared key, the non-target instances would clear the highlight the target
 * instance just set — so it would never survive. Driving it once from the
 * store's `commentTarget` / `focusedAnchor` keeps a single writer.
 *
 * Called once, near the root.
 */
export function useAnchorHighlights(): void {
  const target = useStore((s) => s.commentTarget);
  const focused = useStore((s) => s.focusedAnchor);
  // Re-resolve when the open artifact (and thus the live DOM) changes.
  const open = useStore((s) => s.open);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `open` re-resolves highlights when the artifact/DOM swaps
  useEffect(() => {
    applyTextHighlight('desk-anchor-pending', target);
    applyTextHighlight('desk-anchor-focused', focused);
    return () => {
      setHighlight('desk-anchor-pending', null);
      setHighlight('desk-anchor-focused', null);
    };
  }, [target, focused, open]);
}

/** Resolve a text-selection anchor against the live DOM and paint it. */
function applyTextHighlight(name: string, anchor: CommentAnchor | null): void {
  if (!anchor || anchor.kind !== 'text-selection') {
    setHighlight(name, null);
    return;
  }
  const root = document.querySelector(
    `[data-component-id="${CSS.escape(anchor.componentId)}"] .commentable__content`,
  );
  setHighlight(name, root ? rangeFromTextOffsets(root, anchor.start, anchor.end) : null);
}

/** Register or clear a CSS Custom Highlight by name. No-ops where unsupported. */
function setHighlight(name: string, range: Range | null): void {
  const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const HighlightCtor = (
    globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }
  ).Highlight;
  if (!highlights || !HighlightCtor) return;
  if (range) highlights.set(name, new HighlightCtor(range));
  else highlights.delete(name);
}
