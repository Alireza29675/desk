// @vitest-environment happy-dom
import type { Artifact, ArtifactId } from '@desk/types';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../state/store';
import { CommentTool } from './CommentTool';

function artifact(): Artifact {
  return {
    id: 'a1' as ArtifactId,
    type: 'enriched-document',
    content: { title: 'Doc', components: [] },
    provenance: { sessionId: 's', agentId: 'a' } as never,
    contributors: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
  };
}

let container: HTMLDivElement;
let root: Root;
// The capture layer queries `.workspace__body` and resolves anchors against a
// `[data-component-id]` host with a `.commentable__content` box.
let workspaceBody: HTMLDivElement;
let content: HTMLDivElement;

function setOpen() {
  useStore.setState({
    open: {
      artifact: artifact(),
      relations: { outgoing: [], incoming: [] },
      comments: [],
      locator: [],
    } as never,
    commentArmed: false,
    draftAnchors: [],
    draftBody: '',
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  workspaceBody = document.createElement('div');
  workspaceBody.className = 'workspace__body';
  content = document.createElement('div');
  content.setAttribute('data-component-id', 'c1');
  const inner = document.createElement('div');
  inner.className = 'commentable__content';
  inner.textContent = 'some content';
  content.appendChild(inner);
  workspaceBody.appendChild(content);
  document.body.appendChild(workspaceBody);

  // happy-dom returns a zero rect by default — give the content box real size so
  // fractional projection is meaningful.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 100,
  } as DOMRect);

  setOpen();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  workspaceBody.remove();
  vi.restoreAllMocks();
  useStore.setState({ open: null, commentArmed: false, draftAnchors: [], draftBody: '' });
});

function render() {
  act(() => root.render(<CommentTool />));
}
const fab = () => container.querySelector('.comment-tool__fab') as HTMLButtonElement;
const pressKey = (key: string, target: EventTarget = window) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });

describe('CommentTool — arming', () => {
  it('arms and disarms by clicking the corner button', () => {
    render();
    expect(fab()).not.toBeNull();
    act(() => fab().click());
    expect(useStore.getState().commentArmed).toBe(true);
    act(() => fab().click());
    expect(useStore.getState().commentArmed).toBe(false);
  });

  it('the `C` key toggles the tool', () => {
    render();
    pressKey('c');
    expect(useStore.getState().commentArmed).toBe(true);
    pressKey('c');
    expect(useStore.getState().commentArmed).toBe(false);
  });

  it('ignores `C` typed inside a text field', () => {
    render();
    const input = document.createElement('textarea');
    document.body.appendChild(input);
    pressKey('c', input);
    expect(useStore.getState().commentArmed).toBe(false);
    input.remove();
  });

  it('Escape disarms (and claims the press so a drawer does not also close)', () => {
    render();
    act(() => fab().click());
    expect(useStore.getState().commentArmed).toBe(true);
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => window.dispatchEvent(esc));
    expect(useStore.getState().commentArmed).toBe(false);
    expect(esc.defaultPrevented).toBe(true);
  });

  it('Escape cancels an unsubmitted draft when not armed', () => {
    useStore.setState({
      draftAnchors: [{ kind: 'point', componentId: 'c1', offset: { x: 0.5, y: 0.5 } } as never],
      draftBody: 'half',
    });
    render();
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => window.dispatchEvent(esc));
    expect(useStore.getState().draftAnchors).toEqual([]);
    expect(useStore.getState().draftBody).toBe('');
  });
});

describe('CommentTool — capture gestures', () => {
  const pointer = (type: string, x: number, y: number, target: Element) =>
    act(() => {
      target.dispatchEvent(
        new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }),
      );
    });

  it('a click in a component drops a point anchor', () => {
    render();
    act(() => fab().click()); // arm
    pointer('pointerdown', 50, 50, content);
    pointer('pointerup', 50, 50, content);
    const anchors = useStore.getState().draftAnchors;
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toMatchObject({ kind: 'point', componentId: 'c1' });
    // 50/200, 50/100 → centre-left of the box.
    expect((anchors[0] as { offset: { x: number; y: number } }).offset).toEqual({
      x: 0.25,
      y: 0.5,
    });
    // One gesture, one anchor — capture mode releases back to composing.
    expect(useStore.getState().commentArmed).toBe(false);
  });

  it('a drag in a component marks a region anchor', () => {
    render();
    act(() => fab().click()); // arm
    pointer('pointerdown', 20, 20, content);
    pointer('pointermove', 120, 80, content);
    pointer('pointerup', 120, 80, content);
    const anchors = useStore.getState().draftAnchors;
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toMatchObject({ kind: 'region', componentId: 'c1' });
  });

  it('a gesture outside any component adds nothing (and shows the nudge)', () => {
    render();
    act(() => fab().click()); // arm
    // A bare element in the body with no data-component-id host.
    const blank = document.createElement('div');
    workspaceBody.appendChild(blank);
    pointer('pointerdown', 10, 10, blank);
    pointer('pointerup', 10, 10, blank);
    expect(useStore.getState().draftAnchors).toEqual([]);
    blank.remove();
  });
});
