import type { CommentAnchor, ComponentId } from '@desk/types';
import { type Box, fractionalPoint, fractionalRect, textOffsetsWithin } from './anchor-geometry';

/**
 * Gesture → `CommentAnchor` constructors, lifted out of `Commentable` so the
 * global comment tool and the per-component renderer share ONE construction
 * path — the anchor shape can never drift between them.
 *
 * The component is resolved INTERNALLY from the gesture's hit element (via the
 * `data-component-id` host that `Commentable` stamps), and geometry is measured
 * against the same `.commentable__content` box the renderer projects overlays
 * into — so a freshly built anchor lands its dot exactly where it was drawn.
 *
 * Every constructor returns `CommentAnchor | null`; `null` means the gesture did
 * not resolve to a component (e.g. a click in empty workspace) — the caller
 * gives feedback and adds nothing. Each anchor is SINGLE-component; spanning
 * several components is expressed by the multi-anchor array, never one anchor.
 */

/** The component a hit element belongs to: its id + the content box overlays
 *  are measured against. */
function resolveHost(
  el: Element | null,
): { componentId: ComponentId; content: HTMLElement } | null {
  const host = el?.closest('[data-component-id]') as HTMLElement | null;
  const id = host?.getAttribute('data-component-id');
  if (!host || !id) return null;
  // The renderer positions overlays inside `.commentable__content`; measure the
  // same element so fractions match. Fall back to the host if the structure
  // ever changes (or in a bare test DOM).
  const content = (host.querySelector('.commentable__content') as HTMLElement | null) ?? host;
  return { componentId: id as ComponentId, content };
}

function boxOf(content: HTMLElement): Box {
  const r = content.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** A click inside a component → a relative point anchor. */
export function anchorFromPoint(
  hitEl: Element,
  clientX: number,
  clientY: number,
): CommentAnchor | null {
  const resolved = resolveHost(hitEl);
  if (!resolved) return null;
  return {
    kind: 'point',
    componentId: resolved.componentId,
    offset: fractionalPoint(boxOf(resolved.content), clientX, clientY),
  };
}

/**
 * A drag inside a component → a relative region anchor. The component is
 * resolved from the START element; the rect is clamped to that component's box.
 * An accidental click-without-drag (under the 2% threshold) returns null.
 */
export function anchorFromRegion(
  startEl: Element,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): CommentAnchor | null {
  const resolved = resolveHost(startEl);
  if (!resolved) return null;
  const box = boxOf(resolved.content);
  const rect = fractionalRect(
    box,
    fractionalPoint(box, fromX, fromY),
    fractionalPoint(box, toX, toY),
  );
  if (rect.width <= 0.02 || rect.height <= 0.02) return null;
  return {
    kind: 'region',
    componentId: resolved.componentId,
    region: { kind: 'fractional', ...rect },
  };
}

/**
 * A text selection → a text-selection anchor. Resolves the component from the
 * range's common ancestor; offsets are character counts into that component's
 * resolved text. A selection that escapes a single component (or is empty)
 * returns null — span components with separate anchors instead.
 */
export function anchorFromSelection(selection: Selection): CommentAnchor | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) return null;
  const container = selection.getRangeAt(0).commonAncestorContainer;
  const el =
    container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement;
  const resolved = resolveHost(el);
  if (!resolved) return null;
  const offsets = textOffsetsWithin(resolved.content, selection);
  if (!offsets) return null;
  return {
    kind: 'text-selection',
    componentId: resolved.componentId,
    start: offsets.start,
    end: offsets.end,
  };
}
