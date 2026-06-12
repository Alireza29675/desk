import type { Comment, CommentAnchor, ComponentId } from '@desk/types';
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  type Fraction,
  type FractionalRect,
  fractionalPoint,
  fractionalRect,
  rangeFromTextOffsets,
  selectedTextPreview,
  textOffsetsWithin,
} from '../lib/anchor-geometry';
import { useUnresolvedByComponent } from '../state/selectors';
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
  const focusAnchor = useStore((s) => s.focusAnchor);
  const revealInRail = useStore((s) => s.revealInRail);
  const unresolved = useUnresolvedByComponent(componentId);

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
  // Measured dot positions for unresolved text-selection anchors (fractions of
  // the content box, like every other spatial anchor) — see the layout effect.
  const [textDots, setTextDots] = useState<Record<string, Fraction>>({});
  // The one open hover/focus card over an unresolved dot (content-box pixels).
  const [popover, setPopover] = useState<{
    id: string;
    left: number;
    top: number;
    below: boolean;
  } | null>(null);
  const popoverOpenedAt = useRef(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  // ── Unresolved comment indicators ───────────────────────────────────
  // text-selection anchors have no fractional position of their own — project
  // the range's last client rect into the content box so the dot sits at the
  // selection's end. Runs on every commit (content reflows move the rect) but
  // only re-renders when a measured position actually changes.
  useLayoutEffect(() => {
    const root = contentRef.current;
    const box = boxOf();
    const next: Record<string, Fraction> = {};
    if (root && box && box.width > 0 && box.height > 0) {
      for (const c of unresolved) {
        if (c.anchor.kind !== 'text-selection') continue;
        const range = rangeFromTextOffsets(root, c.anchor.start, c.anchor.end);
        if (!range || typeof range.getClientRects !== 'function') continue;
        const rects = range.getClientRects();
        const last = rects[rects.length - 1];
        if (last) next[c.id] = fractionalPoint(box, last.right, last.top);
      }
    }
    setTextDots((prev) => (sameDots(prev, next) ? prev : next));
  });

  const cancelClose = () => clearTimeout(closeTimer.current);
  const scheduleClose = () => {
    clearTimeout(closeTimer.current);
    // Small grace window so the pointer can travel from the dot into the card.
    closeTimer.current = setTimeout(() => setPopover(null), 150);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const openPopover = (c: Comment, dotEl: HTMLElement) => {
    const box = boxOf();
    if (!box) return;
    const d = dotEl.getBoundingClientRect();
    // Above the dot by default; flip under it when the card would leave the
    // top of the viewport. Clamp the center within the component box.
    const below = d.top < POPOVER_HEADROOM;
    const half = POPOVER_WIDTH / 2;
    const left = Math.min(
      Math.max(d.left + d.width / 2 - box.left, half),
      Math.max(box.width - half, half),
    );
    const top = below ? d.bottom - box.top + 8 : d.top - box.top - 8;
    cancelClose();
    popoverOpenedAt.current = Date.now();
    setPopover({ id: c.id, left, top, below });
  };

  const activateUnresolved = (c: Comment) => {
    // Pulse the anchor on the artifact and scroll/flash the rail row. On
    // ≤640px the rail is a closed bottom sheet owned by App's local `panel`
    // state (not the store), so it can't be opened from here — the on-artifact
    // pulse still shows, and the rail lands on the row next time it opens.
    focusAnchor(c.anchor);
    revealInRail(c.id);
    cancelClose();
    setPopover(null);
  };

  const onDotClick = (c: Comment, dotEl: HTMLElement) => {
    const hoverCapable = window.matchMedia?.('(hover: hover)').matches ?? true;
    if (!hoverCapable && (popover?.id !== c.id || Date.now() - popoverOpenedAt.current < 500)) {
      // Touch: the first tap reveals the card (the tap's own focus event may
      // have just opened it — same gesture, still the "first" tap); a later
      // tap, or the card's "View in comments" row, navigates.
      openPopover(c, dotEl);
      return;
    }
    activateUnresolved(c);
  };

  // Esc closes the card. Capture phase + preventDefault: the card is the
  // topmost surface, so this press must not also close a drawer (App checks
  // defaultPrevented) — same pattern as the topbar overflow menu.
  useEffect(() => {
    if (!popover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setPopover(null);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [popover]);

  const hovered = popover ? (unresolved.find((c) => c.id === popover.id) ?? null) : null;

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
      // Click-to-reveal feedback for element anchors. text-selection is painted
      // by the CSS Highlight registry; region/point draw their own overlays;
      // element had nothing — clicking the comment did nothing visible. This
      // attribute drives a brief outline pulse on the whole component.
      data-comment-focused={isFocused && focused?.kind === 'element' ? 'true' : undefined}
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

        {/* Persistent markers for unresolved comments (calm at idle; hover or
            focus a dot to reveal the comment card and the shape it covers).
            `general` anchors have no spatial placement and stay rail-only. */}
        {unresolved.map((c, i) => {
          const at = dotAnchorPoint(c.anchor, textDots[c.id]);
          if (!at) return null;
          return (
            <button
              key={c.id}
              className="unresolved-dot"
              style={dotStyle(at, i)}
              aria-label={`Unresolved comment by ${authorName(c.author)}`}
              onMouseEnter={(e) => openPopover(c, e.currentTarget)}
              onMouseLeave={scheduleClose}
              onFocus={(e) => openPopover(c, e.currentTarget)}
              onBlur={scheduleClose}
              onClick={(e) => onDotClick(c, e.currentTarget)}
              // Don't let an armed point/region tool treat this click as a drop.
              onPointerUp={(e) => e.stopPropagation()}
            />
          );
        })}

        {/* While its dot is hovered, an unresolved region/element shows its
            shape — persistent outlines for every region would be noisy. */}
        {hovered?.anchor.kind === 'region' && hovered.anchor.region.kind === 'fractional' ? (
          <span
            className="anchor-overlay anchor-overlay--region"
            style={rectStyle(hovered.anchor.region)}
          />
        ) : null}
        {hovered?.anchor.kind === 'element' ? (
          <span className="anchor-overlay anchor-overlay--ring" />
        ) : null}

        {/* Hover/focus card for the unresolved comment under the pointer. */}
        {popover && hovered ? (
          <div
            className="unresolved-popover"
            data-flip={popover.below ? 'below' : undefined}
            style={{ left: popover.left, top: popover.top }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <span className="unresolved-popover__author" data-kind={hovered.author.kind}>
              {authorName(hovered.author)}
            </span>
            {hovered.payload.kind === 'text' ? (
              <p className="unresolved-popover__body">{hovered.payload.text}</p>
            ) : null}
            <button
              className="unresolved-popover__view"
              onClick={() => activateUnresolved(hovered)}
              onFocus={cancelClose}
            >
              View in comments →
            </button>
          </div>
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

/** Card geometry for the unresolved-comment popover (kept in sync with CSS). */
const POPOVER_WIDTH = 240;
/** Viewport headroom under which the card flips below its dot. */
const POPOVER_HEADROOM = 132;

/**
 * Where an unresolved comment's dot sits, as a fraction of the content box.
 * Reuses the same fraction→percent projection as the transient overlays.
 */
function dotAnchorPoint(anchor: CommentAnchor, measured?: Fraction): Fraction | null {
  switch (anchor.kind) {
    case 'point': {
      const o = anchor.offset ?? { x: 0.5, y: 0.5 };
      return { x: o.x, y: o.y };
    }
    case 'region':
      // Top-right corner; the rect itself draws only while hovered.
      return anchor.region.kind === 'fractional'
        ? { x: anchor.region.x + anchor.region.width, y: anchor.region.y }
        : null;
    case 'element':
      return { x: 1, y: 0 };
    case 'text-selection':
      // Measured against the live range (see the layout effect); null until
      // (or unless) the range resolves.
      return measured ?? null;
    default:
      return null;
  }
}

function dotStyle(at: Fraction, index: number) {
  // Near-coincident dots fan out by a couple px per index so none fully
  // occludes another (no clustering logic in v1).
  return {
    left: `calc(${at.x * 100}% + ${index * 3}px)`,
    top: `calc(${at.y * 100}% + ${index * 3}px)`,
  };
}

function authorName(author: Comment['author']): string {
  return author.kind === 'human' ? author.humanId : author.agentId;
}

/** Shallow equality over the measured text-dot map (guards the layout effect). */
function sameDots(a: Record<string, Fraction>, b: Record<string, Fraction>): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  return ak.every((k) => a[k]?.x === b[k]?.x && a[k]?.y === b[k]?.y);
}
