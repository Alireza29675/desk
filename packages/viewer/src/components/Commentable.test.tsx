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
  useStore.setState({ commentTarget: null, focusedAnchor: null });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useStore.setState({ commentTarget: null, focusedAnchor: null });
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

  it('still paints data-comment-target during composing (unchanged behavior)', () => {
    useStore.setState({
      commentTarget: { kind: 'element', componentId: 'c1' as ComponentId },
    });
    const el = render();
    expect(el.getAttribute('data-comment-target')).toBe('true');
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
});
