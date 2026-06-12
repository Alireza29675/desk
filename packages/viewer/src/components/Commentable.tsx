import { type Comment, type CommentAnchor, type ComponentId, commentAnchors } from '@desk/types';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { anchorFromSelection } from '../lib/anchor-construct';
import {
  type Fraction,
  type FractionalRect,
  fractionalPoint,
  rangeFromTextOffsets,
  selectedTextPreview,
  textOffsetsWithin,
} from '../lib/anchor-geometry';
import { useUnresolvedByComponent } from '../state/selectors';
import { useStore } from '../state/store';

/**
 * Wraps a rendered component as a comment surface. Point and region capture now
 * live in the GLOBAL comment tool (see `CommentTool`) — when it's armed, a click
 * anywhere in here becomes a point and a drag a region, resolved back to this
 * component by `data-component-id`. Two things stay local:
 *
 *   • text-selection — select text inside and a floating "Comment" pill appears
 *     (works with or without the tool armed); clicking it adds the selection to
 *     the draft via the shared `anchorFromSelection` constructor.
 *   • the read side — unresolved-comment dots, their hover cards, and the
 *     pending/focused overlays for selections that live in this component.
 *
 * Everything stored is semantic or relative (component id, char offsets, 0..1
 * fractions), never a raw pixel — the anchoring pillar. Pixels exist only
 * transiently, to draw overlays, and are recomputed from the live box.
 *
 * It also carries `data-component-id`, so deep links (`#component:<id>`) and the
 * global tool's hit-testing both resolve to this element.
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
  const draftAnchors = useStore((s) => s.draftAnchors);
  const addDraftAnchor = useStore((s) => s.addDraftAnchor);
  const focused = useStore((s) => s.focusedAnchor);
  const focusAnchor = useStore((s) => s.focusAnchor);
  const revealInRail = useStore((s) => s.revealInRail);
  const unresolved = useUnresolvedByComponent(componentId);

  // The draft selections that live in THIS component — point/region draw their
  // overlay so the operator sees what they're composing on (text selections are
  // painted by the shared CSS highlight registry, see useAnchorHighlights).
  const pendingHere = draftAnchors.filter((a) => anchorBelongsTo(a, cid));

  // Flatten the unresolved comments into per-anchor markers for THIS component.
  // A multi-anchor comment shows one dot per anchor it lands here; an anchor in
  // another component contributes nothing to this Commentable. `key` is stable
  // per (comment, anchor index) so dot state survives reflows.
  const markers = useMemo<Marker[]>(
    () =>
      unresolved.flatMap((c) =>
        commentAnchors(c)
          .map((anchor, ai) => ({ comment: c, anchor, key: `${c.id}:${ai}` }))
          .filter((m) => anchorBelongsTo(m.anchor, cid)),
      ),
    [unresolved, cid],
  );

  const contentRef = useRef<HTMLDivElement | null>(null);
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
  // Keyed by marker (comment + anchor index), so the card and the shape preview
  // track the exact dot under the pointer, not just the comment.
  const [popover, setPopover] = useState<{
    key: string;
    left: number;
    top: number;
    below: boolean;
  } | null>(null);
  const popoverOpenedAt = useRef(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const isFocused = anchorBelongsTo(focused, cid);

  const boxOf = () => {
    const r = contentRef.current?.getBoundingClientRect();
    return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
  };

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
      for (const m of markers) {
        if (m.anchor.kind !== 'text-selection') continue;
        const range = rangeFromTextOffsets(root, m.anchor.start, m.anchor.end);
        if (!range || typeof range.getClientRects !== 'function') continue;
        const rects = range.getClientRects();
        const last = rects[rects.length - 1];
        if (last) next[m.key] = fractionalPoint(box, last.right, last.top);
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

  const openPopover = (m: Marker, dotEl: HTMLElement) => {
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
    setPopover({ key: m.key, left, top, below });
  };

  const activateUnresolved = (m: Marker) => {
    // Pulse the SPECIFIC anchor whose dot was clicked, and scroll/flash the
    // comment's rail row. On ≤640px the rail is a closed bottom sheet owned by
    // App's local `panel` state (not the store), so it can't be opened from
    // here — the on-artifact pulse still shows, and the rail lands on the row
    // next time it opens.
    focusAnchor(m.anchor);
    revealInRail(m.comment.id);
    cancelClose();
    setPopover(null);
  };

  const onDotClick = (m: Marker, dotEl: HTMLElement) => {
    const hoverCapable = window.matchMedia?.('(hover: hover)').matches ?? true;
    if (!hoverCapable && (popover?.key !== m.key || Date.now() - popoverOpenedAt.current < 500)) {
      // Touch: the first tap reveals the card (the tap's own focus event may
      // have just opened it — same gesture, still the "first" tap); a later
      // tap, or the card's "View in comments" row, navigates.
      openPopover(m, dotEl);
      return;
    }
    activateUnresolved(m);
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

  const hoveredMarker = popover ? (markers.find((m) => m.key === popover.key) ?? null) : null;

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
    // Build the anchor through the shared constructor (the same path the global
    // tool uses) so the text-selection shape never drifts. The pill keeps the
    // selection alive through the click (onMouseDown preventDefault), so
    // getSelection() is still the live range here.
    const selection = window.getSelection();
    const anchor = selection ? anchorFromSelection(selection) : null;
    if (anchor) addDraftAnchor(anchor);
    selection?.removeAllRanges();
    setPill(null);
  };

  // Text-selection highlights are owned globally (see useAnchorHighlights):
  // the CSS Highlight registry is a shared keyed map, so a single writer keeps
  // sibling Commentables from clobbering each other's range.

  return (
    <div
      className={['commentable', className].filter(Boolean).join(' ')}
      data-component-id={componentId}
      // Click-to-reveal feedback for element anchors. text-selection is painted
      // by the CSS Highlight registry; region/point draw their own overlays;
      // element had nothing — clicking the comment did nothing visible. This
      // attribute drives a brief outline pulse on the whole component.
      data-comment-focused={isFocused && focused?.kind === 'element' ? 'true' : undefined}
    >
      <div ref={contentRef} className="commentable__content" onMouseUp={refreshPill}>
        {children}

        {/* Pending spatial selections (what you're about to comment on) — one
            overlay per point/region draft anchor that lives here. */}
        {pendingHere.map((a, i) =>
          a.kind === 'region' && a.region.kind === 'fractional' ? (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: draft anchors are a small, append-only set
              key={i}
              className="anchor-overlay anchor-overlay--region"
              style={rectStyle(a.region)}
            />
          ) : a.kind === 'point' ? (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: draft anchors are a small, append-only set
              key={i}
              className="anchor-overlay anchor-overlay--point"
              style={pointStyle(a.offset)}
            />
          ) : null,
        )}

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
        {markers.map((m, i) => {
          const at = dotAnchorPoint(m.anchor, textDots[m.key]);
          if (!at) return null;
          return (
            <button
              key={m.key}
              className="unresolved-dot"
              style={dotStyle(at, i)}
              aria-label={`Unresolved comment by ${authorName(m.comment.author)}`}
              onMouseEnter={(e) => openPopover(m, e.currentTarget)}
              onMouseLeave={scheduleClose}
              onFocus={(e) => openPopover(m, e.currentTarget)}
              onBlur={scheduleClose}
              onClick={(e) => onDotClick(m, e.currentTarget)}
              // Don't let an armed point/region tool treat this click as a drop.
              onPointerUp={(e) => e.stopPropagation()}
            />
          );
        })}

        {/* While its dot is hovered, an unresolved region/element shows its
            shape — persistent outlines for every region would be noisy. */}
        {hoveredMarker?.anchor.kind === 'region' &&
        hoveredMarker.anchor.region.kind === 'fractional' ? (
          <span
            className="anchor-overlay anchor-overlay--region"
            style={rectStyle(hoveredMarker.anchor.region)}
          />
        ) : null}
        {hoveredMarker?.anchor.kind === 'element' ? (
          <span className="anchor-overlay anchor-overlay--ring" />
        ) : null}

        {/* Hover/focus card for the unresolved comment under the pointer. */}
        {popover && hoveredMarker ? (
          <div
            className="unresolved-popover"
            data-flip={popover.below ? 'below' : undefined}
            style={{ left: popover.left, top: popover.top }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <span
              className="unresolved-popover__author"
              data-kind={hoveredMarker.comment.author.kind}
            >
              {authorName(hoveredMarker.comment.author)}
            </span>
            {hoveredMarker.comment.payload.kind === 'text' ? (
              <p className="unresolved-popover__body">{hoveredMarker.comment.payload.text}</p>
            ) : null}
            <button
              className="unresolved-popover__view"
              onClick={() => activateUnresolved(hoveredMarker)}
              onFocus={cancelClose}
            >
              View in comments →
            </button>
          </div>
        ) : null}
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

/** One anchor of an unresolved comment that lands in this component — i.e. one
 *  rendered dot. `key` is `${commentId}:${anchorIndex}`, stable across reflows. */
type Marker = { comment: Comment; anchor: CommentAnchor; key: string };

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
