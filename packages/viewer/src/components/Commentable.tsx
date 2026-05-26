import type { CommentAnchor, ComponentId } from '@desk/types';
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  type Fraction,
  type FractionalRect,
  fractionalPoint,
  fractionalRect,
  selectedTextPreview,
  textOffsetsWithin,
} from '../lib/anchor-geometry';
import { useStore } from '../state/store';

/**
 * Wraps a rendered component so the operator can anchor a comment to it. Four
 * of the five anchor shapes are reachable here; the fifth (`general`) is the
 * composer's default when nothing is targeted.
 *
 *   • element        — the "Comment" tool: targets the component as a whole.
 *   • point          — the "Pin" tool: click inside to drop a pin (fractional).
 *   • region         — the "Region" tool: drag a box (fractional rect).
 *   • text-selection — automatic: select text and a floating pill appears.
 *
 * Everything stored is semantic or relative (component id, char offsets, 0..1
 * fractions), never a raw pixel — the anchoring pillar. Pixels exist only
 * transiently, to draw overlays, and are recomputed from the live box.
 *
 * It also carries `data-component-id`, so deep links (`#component:<id>`) still
 * resolve to this element.
 */
export function Commentable({
  componentId,
  className,
  children,
}: {
  componentId: string;
  className?: string;
  children: ReactNode;
}) {
  const cid = componentId as ComponentId;
  const startComment = useStore((s) => s.startComment);
  const target = useStore((s) => s.commentTarget);
  const focused = useStore((s) => s.focusedAnchor);

  const contentRef = useRef<HTMLDivElement | null>(null);
  // Active spatial capture for *this* component, or null when idle.
  const [mode, setMode] = useState<'point' | 'region' | null>(null);
  // Live drag rectangle while the region tool is dragging.
  const [drag, setDrag] = useState<{ from: Fraction; to: Fraction } | null>(null);
  // Floating selection pill: where to show it + the offsets it would anchor.
  const [pill, setPill] = useState<{
    x: number;
    y: number;
    start: number;
    end: number;
    preview: string;
  } | null>(null);

  const isTarget = anchorBelongsTo(target, cid);
  const isFocused = anchorBelongsTo(focused, cid);

  const boxOf = () => {
    const r = contentRef.current?.getBoundingClientRect();
    return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
  };

  // ── Spatial capture (point / region) ────────────────────────────────
  const onPointerDown = (e: ReactPointerEvent) => {
    if (mode !== 'region') return;
    const box = boxOf();
    if (!box) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const f = fractionalPoint(box, e.clientX, e.clientY);
    setDrag({ from: f, to: f });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (mode !== 'region' || !drag) return;
    const box = boxOf();
    if (!box) return;
    setDrag({ from: drag.from, to: fractionalPoint(box, e.clientX, e.clientY) });
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const box = boxOf();
    if (!box) return;
    if (mode === 'point') {
      startComment({
        kind: 'point',
        componentId: cid,
        offset: fractionalPoint(box, e.clientX, e.clientY),
      });
      setMode(null);
    } else if (mode === 'region' && drag) {
      const rect = fractionalRect(box, drag.from, drag.to);
      // Ignore an accidental click-without-drag; require a meaningful area.
      if (rect.width > 0.02 && rect.height > 0.02) {
        startComment({ kind: 'region', componentId: cid, region: { kind: 'fractional', ...rect } });
      }
      setDrag(null);
      setMode(null);
    }
  };

  // Esc leaves capture mode without anchoring.
  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMode(null);
        setDrag(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  // ── Text selection → floating pill ──────────────────────────────────
  const refreshPill = useCallback(() => {
    const root = contentRef.current;
    if (!root) return;
    const selection = window.getSelection();
    const offsets = textOffsetsWithin(root, selection);
    if (!offsets || !selection) {
      setPill(null);
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    setPill({
      x: rect.left + rect.width / 2,
      y: rect.top,
      start: offsets.start,
      end: offsets.end,
      preview: selectedTextPreview(selection),
    });
  }, []);

  const commentOnSelection = () => {
    if (!pill) return;
    startComment({ kind: 'text-selection', componentId: cid, start: pill.start, end: pill.end });
    window.getSelection()?.removeAllRanges();
    setPill(null);
  };

  // Text-selection highlights are owned globally (see useAnchorHighlights):
  // the CSS Highlight registry is a shared keyed map, so a single writer keeps
  // sibling Commentables from clobbering each other's range.

  const liveRect = drag
    ? fractionalRect({ left: 0, top: 0, width: 1, height: 1 }, drag.from, drag.to)
    : null;

  return (
    <div
      className={['commentable', className].filter(Boolean).join(' ')}
      data-component-id={componentId}
      data-comment-target={isTarget && target?.kind === 'element' ? 'true' : undefined}
      data-capture={mode ?? undefined}
    >
      <div
        ref={contentRef}
        className="commentable__content"
        onMouseUp={refreshPill}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {children}

        {/* Live drag rectangle while marking a region. */}
        {liveRect ? (
          <span
            className="anchor-overlay anchor-overlay--region is-live"
            style={rectStyle(liveRect)}
          />
        ) : null}

        {/* Pending spatial anchor (what you're about to comment on). */}
        {isTarget && target?.kind === 'region' && target.region.kind === 'fractional' ? (
          <span
            className="anchor-overlay anchor-overlay--region"
            style={rectStyle(target.region)}
          />
        ) : null}
        {isTarget && target?.kind === 'point' ? (
          <span
            className="anchor-overlay anchor-overlay--point"
            style={pointStyle(target.offset)}
          />
        ) : null}

        {/* Focused spatial anchor (a clicked comment revealing its location). */}
        {isFocused && focused?.kind === 'region' && focused.region.kind === 'fractional' ? (
          <span
            className="anchor-overlay anchor-overlay--region is-focused"
            style={rectStyle(focused.region)}
          />
        ) : null}
        {isFocused && focused?.kind === 'point' ? (
          <span
            className="anchor-overlay anchor-overlay--point is-focused"
            style={pointStyle(focused.offset)}
          />
        ) : null}

        {/* Capture-mode hint. */}
        {mode ? (
          <span className="commentable__capture-hint">
            {mode === 'point' ? 'Click to drop a pin' : 'Drag to mark a region'} · Esc to cancel
          </span>
        ) : null}
      </div>

      <div className="commentable__tools" role="toolbar" aria-label="Comment anchors">
        <button
          className="commentable__tool"
          title="Comment on this element"
          onClick={() => startComment({ kind: 'element', componentId: cid })}
        >
          Comment
        </button>
        <button
          className="commentable__tool commentable__tool--icon"
          title="Pin a point"
          data-active={mode === 'point' ? 'true' : undefined}
          onClick={() => setMode((m) => (m === 'point' ? null : 'point'))}
        >
          ⌖
        </button>
        <button
          className="commentable__tool commentable__tool--icon"
          title="Mark a region"
          data-active={mode === 'region' ? 'true' : undefined}
          onClick={() => setMode((m) => (m === 'region' ? null : 'region'))}
        >
          ▭
        </button>
      </div>

      {/* Floating pill anchored to a live text selection. */}
      {pill ? (
        <button
          className="selection-pill"
          style={{ left: pill.x, top: pill.y }}
          onMouseDown={(e) => e.preventDefault()} // keep the selection alive through the click
          onClick={commentOnSelection}
        >
          💬 Comment on “{pill.preview}”
        </button>
      ) : null}
    </div>
  );
}

/** True when an anchor targets this component (any spatial/text/element shape). */
function anchorBelongsTo(anchor: CommentAnchor | null, cid: ComponentId): boolean {
  return anchor !== null && 'componentId' in anchor && anchor.componentId === cid;
}

function rectStyle(r: FractionalRect) {
  return {
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.width * 100}%`,
    height: `${r.height * 100}%`,
  };
}

function pointStyle(offset?: { x: number; y: number }) {
  const o = offset ?? { x: 0.5, y: 0.5 };
  return { left: `${o.x * 100}%`, top: `${o.y * 100}%` };
}
