// @vitest-environment happy-dom
import type { CommentAnchor, ComponentId } from '@desk/types';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
