// @vitest-environment happy-dom
import type { Artifact, ArtifactId, Comment } from '@desk/types';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../state/store';
import { MobileBar } from './MobileBar';

const artifact = (): Artifact =>
  ({
    id: 'a1' as ArtifactId,
    type: 'enriched-document',
    content: { title: 'Doc', components: [] },
    provenance: { sessionId: 's', agentId: 'a' } as never,
    contributors: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
  }) as Artifact;

const comment = (id: string): Comment =>
  ({
    id,
    artifactId: 'a1',
    anchor: { kind: 'general' },
    author: { kind: 'human', humanId: 'M' },
    payload: { kind: 'text', text: 'x' },
    createdAt: '2026-01-01T00:00:00.000Z',
  }) as unknown as Comment;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  useStore.setState({ open: null, commentArmed: false });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useStore.setState({ open: null, commentArmed: false });
});

function open(comments: Comment[] = []) {
  useStore.setState({
    open: {
      artifact: artifact(),
      relations: { outgoing: [], incoming: [] },
      comments,
      locator: [],
    } as never,
  });
}

function render() {
  const onToggleNav = vi.fn();
  const onToggleComments = vi.fn();
  act(() =>
    root.render(<MobileBar onToggleNav={onToggleNav} onToggleComments={onToggleComments} />),
  );
  return { onToggleNav, onToggleComments };
}

describe('MobileBar', () => {
  it('shows only Artifacts when nothing is open', () => {
    render();
    expect(container.querySelector('.mobile-bar__btn')).not.toBeNull();
    expect(container.querySelector('.mobile-bar__comment')).toBeNull();
  });

  it('the centre button arms the comment tool when an artifact is open', () => {
    open();
    render();
    const comment = container.querySelector('.mobile-bar__comment') as HTMLButtonElement;
    act(() => comment.click());
    expect(useStore.getState().commentArmed).toBe(true);
  });

  it('shows the unresolved comment count on the comments button', () => {
    open([comment('c1'), comment('c2')]);
    render();
    expect(container.querySelector('.mobile-bar__count')?.textContent).toBe('2');
  });

  it('the nav + comments buttons call their handlers', () => {
    open();
    const { onToggleNav, onToggleComments } = render();
    const buttons = container.querySelectorAll('.mobile-bar__btn');
    act(() => (buttons[0] as HTMLButtonElement).click());
    act(() => (buttons[1] as HTMLButtonElement).click());
    expect(onToggleNav).toHaveBeenCalledTimes(1);
    expect(onToggleComments).toHaveBeenCalledTimes(1);
  });
});
