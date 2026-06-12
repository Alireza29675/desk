import type { CommentAnchor } from '@desk/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { anchorFromPoint, anchorFromRegion, anchorFromSelection } from '../lib/anchor-construct';
import { useStore } from '../state/store';

/** Below this pointer travel (px) a gesture is a point, not a region. */
const DRAG_THRESHOLD = 6;

/**
 * The global comment tool — one affordance to start commenting from anywhere,
 * replacing the old per-component hover toolbars.
 *
 *   • Desktop: a corner button (bottom-right) + the `C` key. `C` with text
 *     selected adds that selection; otherwise it toggles capture mode.
 *   • Mobile: the centre button of the bottom bar (see `MobileBar`) arms it.
 *
 * When armed, capture-phase pointer listeners on the scrolling artifact body
 * turn a click into a point and a drag into a region, resolved back to whatever
 * component sits under the gesture via eng1's `anchorFrom*` constructors. We
 * listen rather than cover the body with an overlay so the wheel still scrolls;
 * component clicks/links and native text-selection are suppressed while armed.
 * Text selection is its own (un-armed) path — the per-component pill, or `C`.
 */
export function CommentTool() {
  const open = useStore((s) => s.open);
  const commentArmed = useStore((s) => s.commentArmed);
  const armComment = useStore((s) => s.armComment);
  const disarmComment = useStore((s) => s.disarmComment);
  const addDraftAnchor = useStore((s) => s.addDraftAnchor);
  const draftCount = useStore((s) => s.draftAnchors.length);
  const clearDraft = useStore((s) => s.clearDraft);

  // Live drag rectangle (viewport coords) while marking a region.
  const [dragRect, setDragRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  // Brief "select inside a component" nudge after a gesture that missed.
  const [missed, setMissed] = useState(false);
  const missTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(missTimer.current), []);

  const flashMiss = useCallback(() => {
    setMissed(true);
    clearTimeout(missTimer.current);
    missTimer.current = setTimeout(() => setMissed(false), 1400);
  }, []);

  // `C` toggles the tool (or, with text selected, adds that selection); Escape
  // cancels. Capture phase + preventDefault so Escape preempts the drawer-close
  // handler in App (which only acts on un-prevented presses).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el?.isContentEditable === true;
      if (e.key === 'Escape') {
        if (commentArmed) {
          e.preventDefault();
          disarmComment();
        } else if (draftCount > 0 && !typing) {
          e.preventDefault();
          clearDraft();
        }
        return;
      }
      if (typing || !open) return;
      if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
          const anchor = anchorFromSelection(sel);
          if (anchor) {
            addDraftAnchor(anchor);
            sel.removeAllRanges();
            return;
          }
        }
        if (commentArmed) disarmComment();
        else armComment();
      }
    }
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [commentArmed, draftCount, open, armComment, disarmComment, addDraftAnchor, clearDraft]);

  // Armed capture: listen on the scrolling artifact body so the wheel still
  // scrolls. Gestures on the surrounding chrome (topbar, panels, the FAB) fall
  // through untouched — only gestures that land in the body are captured.
  useEffect(() => {
    if (!commentArmed) return;
    const body = document.querySelector<HTMLElement>('.workspace__body');
    if (!body) return;
    body.setAttribute('data-comment-armed', 'true');
    let start: { x: number; y: number; el: Element } | null = null;

    const inBody = (t: EventTarget | null): t is Element =>
      t instanceof Element && body.contains(t);

    function onDown(e: PointerEvent) {
      if (!inBody(e.target)) return;
      // Suppress the component's own handlers + native text selection.
      e.preventDefault();
      e.stopPropagation();
      start = { x: e.clientX, y: e.clientY, el: e.target };
      setDragRect(null);
    }
    function onMove(e: PointerEvent) {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) {
        setDragRect(null);
        return;
      }
      setDragRect({
        left: Math.min(start.x, e.clientX),
        top: Math.min(start.y, e.clientY),
        width: Math.abs(dx),
        height: Math.abs(dy),
      });
    }
    function onUp(e: PointerEvent) {
      const s = start;
      start = null;
      setDragRect(null);
      if (!s) return;
      const moved = Math.hypot(e.clientX - s.x, e.clientY - s.y) >= DRAG_THRESHOLD;
      const anchor: CommentAnchor | null = moved
        ? anchorFromRegion(s.el, s.x, s.y, e.clientX, e.clientY)
        : anchorFromPoint(s.el, s.x, s.y);
      if (anchor) addDraftAnchor(anchor);
      else flashMiss();
    }
    // The synthetic click after a captured pointerdown must not reach a link or
    // a checkbox underneath.
    function onClick(e: MouseEvent) {
      if (inBody(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    document.addEventListener('pointerdown', onDown, { capture: true });
    document.addEventListener('pointermove', onMove, { capture: true });
    document.addEventListener('pointerup', onUp, { capture: true });
    document.addEventListener('click', onClick, { capture: true });
    return () => {
      body.removeAttribute('data-comment-armed');
      document.removeEventListener('pointerdown', onDown, { capture: true });
      document.removeEventListener('pointermove', onMove, { capture: true });
      document.removeEventListener('pointerup', onUp, { capture: true });
      document.removeEventListener('click', onClick, { capture: true });
    };
  }, [commentArmed, addDraftAnchor, flashMiss]);

  if (!open) return null;

  return (
    <>
      {/* Desktop entry point; the mobile entry is the bottom bar's centre
          button. Both call armComment. Sits above the capture layer so it can
          always cancel. */}
      <button
        type="button"
        className="comment-tool__fab"
        data-armed={commentArmed ? 'true' : undefined}
        onClick={() => (commentArmed ? disarmComment() : armComment())}
        aria-pressed={commentArmed}
        aria-label={commentArmed ? 'Cancel commenting' : 'Comment (C)'}
        title={commentArmed ? 'Cancel (Esc)' : 'Comment · C'}
      >
        💬
      </button>

      {commentArmed ? (
        <>
          <div className="comment-capture__hint" aria-live="polite">
            {missed ? 'Select inside a component' : 'Click a point · drag a region · Esc to cancel'}
          </div>
          {dragRect ? (
            <div
              className="comment-capture__rect"
              style={{
                left: dragRect.left,
                top: dragRect.top,
                width: dragRect.width,
                height: dragRect.height,
              }}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
