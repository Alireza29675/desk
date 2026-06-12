// @vitest-environment happy-dom
import type { Comment, CommentAnchor, ComponentId } from '@desk/types';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../state/store';
import { Commentable } from './Commentable';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  useStore.setState({ draftAnchors: [], focusedAnchor: null });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useStore.setState({ draftAnchors: [], focusedAnchor: null });
});

function render() {
  act(() =>
    root.render(
      <Commentable componentId="c1">
        <p>body</p>
      </Commentable>,
    ),
  );
  return container.querySelector('.commentable') as HTMLElement;
}

describe('Commentable — anchor attributes drive the focus/target visuals', () => {
  it('paints data-comment-focused when a clicked element-anchored comment matches this component', () => {
    const focused: CommentAnchor = { kind: 'element', componentId: 'c1' as ComponentId };
    useStore.setState({ focusedAnchor: focused });
    const el = render();
    // The attribute is what app.css's `commentable-focus-pulse` keys off — the
    // visible "reveal where this anchors" pulse for element-kind comments
    // (text-selection / region / point already had their own focus visuals).
    expect(el.getAttribute('data-comment-focused')).toBe('true');
  });

  it('does not paint data-comment-focused when the focused anchor targets a different component', () => {
    useStore.setState({
      focusedAnchor: { kind: 'element', componentId: 'other' as ComponentId },
    });
    const el = render();
    expect(el.getAttribute('data-comment-focused')).toBeNull();
  });

  it('does not paint data-comment-focused for region/point/text-selection anchors (they have their own visuals)', () => {
    useStore.setState({
      focusedAnchor: {
        kind: 'region',
        componentId: 'c1' as ComponentId,
        region: { kind: 'fractional', x: 0, y: 0, width: 0.5, height: 0.5 },
      } as CommentAnchor,
    });
    const el = render();
    expect(el.getAttribute('data-comment-focused')).toBeNull();
  });

  it('draws a pending overlay for a draft selection that lives in this component', () => {
    // While composing, a region/point in the draft set shows its overlay so the
    // operator sees what they're commenting on (text draws via the highlight
    // registry instead).
    useStore.setState({
      draftAnchors: [
        {
          kind: 'region',
          componentId: 'c1' as ComponentId,
          region: { kind: 'fractional', x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
        } as CommentAnchor,
      ],
    });
    render();
    expect(container.querySelector('.anchor-overlay--region')).not.toBeNull();
  });
});

describe('Commentable — unresolved comment dots + hover card', () => {
  const pointComment = (id: string, overrides: Partial<Comment> = {}): Comment =>
    ({
      id,
      artifactId: 'a',
      anchor: { kind: 'point', componentId: 'c1', offset: { x: 0.25, y: 0.5 } },
      author: { kind: 'human', humanId: 'M' },
      payload: { kind: 'text', text: 'tighten this paragraph' },
      createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    }) as unknown as Comment;

  // Same shape as pointComment but for the other spatial/text anchor kinds —
  // every shipped dot branch (point already covered above) gets one fixture.
  const commentWith = (id: string, anchor: CommentAnchor): Comment =>
    ({
      id,
      artifactId: 'a',
      anchor,
      author: { kind: 'human', humanId: 'M' },
      payload: { kind: 'text', text: 'tighten this paragraph' },
      createdAt: '2026-01-01T00:00:00.000Z',
    }) as unknown as Comment;

  // A multi-anchor comment: `anchors` carries every selection, `anchor` shadows
  // anchors[0]. The renderer reads the full set via `commentAnchors`.
  const commentWithAnchors = (id: string, anchors: CommentAnchor[]): Comment =>
    ({
      id,
      artifactId: 'a',
      anchor: anchors[0],
      anchors,
      author: { kind: 'human', humanId: 'M' },
      payload: { kind: 'text', text: 'tighten this paragraph' },
      createdAt: '2026-01-01T00:00:00.000Z',
    }) as unknown as Comment;

  const pt = (cid: string, x: number, y: number): CommentAnchor =>
    ({ kind: 'point', componentId: cid as ComponentId, offset: { x, y } }) as CommentAnchor;

  function setOpenComments(comments: Comment[]) {
    useStore.setState({
      open: {
        artifact: { id: 'a', content: { title: 't', components: [] } },
        relations: { outgoing: [], incoming: [] },
        comments,
        locator: [],
      } as never,
    });
  }

  beforeEach(() => {
    useStore.setState({ open: null, railTarget: null });
    // happy-dom answers every media query with false, which would route clicks
    // through the touch (tap-to-reveal) path — pin the hover-capable one.
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
  });
  afterEach(() => {
    useStore.setState({ open: null, railTarget: null });
    vi.restoreAllMocks();
  });

  it('renders a dot for an unresolved point comment', () => {
    setOpenComments([pointComment('u1')]);
    render();
    expect(container.querySelector('.unresolved-dot')).not.toBeNull();
  });

  it('renders no dot once the comment is resolved', () => {
    setOpenComments([pointComment('u1', { resolved: true })]);
    render();
    expect(container.querySelector('.unresolved-dot')).toBeNull();
  });

  it('clicking the dot pulses the anchor (focusAnchor) and targets the rail row', () => {
    const c = pointComment('u1');
    setOpenComments([c]);
    render();
    const dot = container.querySelector('.unresolved-dot') as HTMLButtonElement;
    act(() => dot.click());
    expect(useStore.getState().focusedAnchor).toEqual(c.anchor);
    expect(useStore.getState().railTarget).toBe('u1');
  });

  it('hovering the dot reveals the comment card (author, body, view row)', () => {
    setOpenComments([pointComment('u1')]);
    render();
    const dot = container.querySelector('.unresolved-dot') as HTMLElement;
    act(() => {
      dot.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    const card = container.querySelector('.unresolved-popover');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('M');
    expect(card?.textContent).toContain('tighten this paragraph');
    expect(card?.querySelector('.unresolved-popover__view')).not.toBeNull();
  });

  it('focusing the dot (keyboard path) reveals the card too', () => {
    setOpenComments([pointComment('u1')]);
    render();
    const dot = container.querySelector('.unresolved-dot') as HTMLElement;
    act(() => dot.focus());
    expect(container.querySelector('.unresolved-popover')).not.toBeNull();
  });

  it("the card's “View in comments” row focuses the anchor and targets the rail", () => {
    const c = pointComment('u1');
    setOpenComments([c]);
    render();
    const dot = container.querySelector('.unresolved-dot') as HTMLElement;
    act(() => {
      dot.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    const view = container.querySelector('.unresolved-popover__view') as HTMLButtonElement;
    act(() => view.click());
    expect(useStore.getState().focusedAnchor).toEqual(c.anchor);
    expect(useStore.getState().railTarget).toBe('u1');
    // Activating dismisses the card.
    expect(container.querySelector('.unresolved-popover')).toBeNull();
  });

  it('places a dot for an unresolved text-selection comment from its measured range', () => {
    // text-selection anchors carry no fraction of their own — the layout effect
    // measures the live range (rangeFromTextOffsets → getClientRects) and
    // projects the last rect into the content box. Stub both geometries (zero by
    // default in happy-dom) so the box is non-empty and the range yields a rect.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 40,
    } as DOMRect);
    vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue({
      length: 1,
      0: { right: 50, top: 20 },
    } as unknown as DOMRectList);
    setOpenComments([
      commentWith('ts1', {
        kind: 'text-selection',
        componentId: 'c1' as ComponentId,
        start: 0,
        end: 4,
      } as CommentAnchor),
    ]);
    render();
    // right:50 of width:100 → x 0.5, top:20 of height:40 → y 0.5.
    const dot = container.querySelector('.unresolved-dot') as HTMLElement;
    expect(dot).not.toBeNull();
    expect(dot.getAttribute('style')).toContain('50%');
  });

  it('reveals the region shape only while its dot is hovered', () => {
    setOpenComments([
      commentWith('r1', {
        kind: 'region',
        componentId: 'c1' as ComponentId,
        region: { kind: 'fractional', x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
      } as CommentAnchor),
    ]);
    render();
    // Idle: the dot is present but the box outline is not (persistent region
    // outlines would be noisy).
    expect(container.querySelector('.anchor-overlay--region')).toBeNull();
    const dot = container.querySelector('.unresolved-dot') as HTMLElement;
    act(() => {
      dot.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(container.querySelector('.anchor-overlay--region')).not.toBeNull();
  });

  it('reveals the element ring only while its dot is hovered', () => {
    setOpenComments([
      commentWith('e1', { kind: 'element', componentId: 'c1' as ComponentId } as CommentAnchor),
    ]);
    render();
    expect(container.querySelector('.anchor-overlay--ring')).toBeNull();
    const dot = container.querySelector('.unresolved-dot') as HTMLElement;
    act(() => {
      dot.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(container.querySelector('.anchor-overlay--ring')).not.toBeNull();
  });

  it('renders one dot per anchor a multi-anchor comment places in this component', () => {
    setOpenComments([commentWithAnchors('m1', [pt('c1', 0.2, 0.3), pt('c1', 0.7, 0.6)])]);
    render();
    expect(container.querySelectorAll('.unresolved-dot').length).toBe(2);
  });

  it('renders only the anchors that land in THIS component (others stay elsewhere)', () => {
    // Anchored in both c1 and another component; this Commentable is c1, so it
    // draws c1's single anchor and ignores the one that lives elsewhere.
    setOpenComments([commentWithAnchors('m1', [pt('c1', 0.2, 0.3), pt('other', 0.7, 0.6)])]);
    render();
    expect(container.querySelectorAll('.unresolved-dot').length).toBe(1);
  });

  it("hovering a specific dot reveals THAT anchor's shape (multi-anchor)", () => {
    // First anchor is a point (no box), second is a region — hovering the
    // region's dot must surface the region box, not the point's.
    setOpenComments([
      commentWithAnchors('m1', [
        pt('c1', 0.2, 0.3),
        {
          kind: 'region',
          componentId: 'c1' as ComponentId,
          region: { kind: 'fractional', x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
        } as CommentAnchor,
      ]),
    ]);
    render();
    const dots = container.querySelectorAll('.unresolved-dot');
    expect(dots.length).toBe(2);
    expect(container.querySelector('.anchor-overlay--region')).toBeNull();
    const regionDot = dots[1] as HTMLElement;
    act(() => {
      regionDot.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(container.querySelector('.anchor-overlay--region')).not.toBeNull();
  });

  it('on touch, the first tap only reveals the card and a later tap navigates', () => {
    // Pin a non-hover (coarse pointer) environment so onDotClick takes the
    // tap-to-reveal branch — the opposite of every test above.
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    // onDotClick gates the first vs. later tap on a 500ms Date.now() window
    // (popoverOpenedAt). Drive that clock directly — no fake timers, so nothing
    // can leak into sibling test files.
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const focusAnchorSpy = vi.spyOn(useStore.getState(), 'focusAnchor');
    const revealSpy = vi.spyOn(useStore.getState(), 'revealInRail');

    const c = pointComment('u1');
    setOpenComments([c]);
    render();
    const dot = container.querySelector('.unresolved-dot') as HTMLButtonElement;

    // First tap: the tap's own focus opens the card (stamping popoverOpenedAt),
    // and the click — same gesture, still inside the 500ms guard — must reveal
    // only, never navigate.
    act(() => dot.focus());
    act(() => dot.click());
    expect(container.querySelector('.unresolved-popover')).not.toBeNull();
    expect(focusAnchorSpy).not.toHaveBeenCalled();
    expect(revealSpy).not.toHaveBeenCalled();
    expect(useStore.getState().focusedAnchor).toBeNull();
    expect(useStore.getState().railTarget).toBeNull();

    // A later tap (past the 500ms guard, card still open) activates: pulse the
    // anchor + target the rail row.
    now.mockReturnValue(1_501);
    act(() => dot.click());
    expect(focusAnchorSpy).toHaveBeenCalledWith(c.anchor);
    expect(revealSpy).toHaveBeenCalledWith('u1');
    expect(useStore.getState().focusedAnchor).toEqual(c.anchor);
    expect(useStore.getState().railTarget).toBe('u1');
  });
});
