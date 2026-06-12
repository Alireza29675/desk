// @vitest-environment happy-dom
import type { Comment, CommentAnchor } from '@desk/types';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from './store';
import { useAnchorHighlights } from './use-anchor-highlights';

/** Renders nothing — exists to host the hook like App does. */
function Host() {
  useAnchorHighlights();
  return null;
}

/** Stand-in for the Highlight constructor (happy-dom doesn't ship one). */
class FakeHighlight {
  ranges: Range[];
  constructor(...ranges: Range[]) {
    this.ranges = ranges;
  }
}

// happy-dom's `CSS` is a getter returning a fresh object per access, so a
// plain `CSS.highlights = …` doesn't stick — stub the whole global (keeping
// the real escape) to give the hook a registry it can write to.
const realEscape = CSS.escape.bind(CSS);

let mount: HTMLDivElement;
let content: HTMLDivElement;
let root: Root;
let registry: Map<string, unknown>;

/** A text-selection anchor over `[start, end)` of component `c1` (branded id). */
const textAnchor = (start: number, end: number): CommentAnchor =>
  ({ kind: 'text-selection', componentId: 'c1', start, end }) as unknown as CommentAnchor;

const textComment = (id: string, overrides: Partial<Comment> = {}): Comment =>
  ({
    id,
    artifactId: 'a',
    anchor: textAnchor(0, 5),
    author: { kind: 'human', humanId: 'M' },
    payload: { kind: 'text', text: 'hm' },
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as unknown as Comment;

function setOpen(comments: Comment[]) {
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
  // A commentable component in the document for anchors to resolve against.
  content = document.createElement('div');
  content.innerHTML = '<div class="commentable__content">hello world</div>';
  content.dataset.componentId = 'c1';
  document.body.appendChild(content);
  mount = document.createElement('div');
  document.body.appendChild(mount);
  root = createRoot(mount);
  registry = new Map();
  vi.stubGlobal('CSS', { escape: realEscape, highlights: registry });
  vi.stubGlobal('Highlight', FakeHighlight);
  useStore.setState({ open: null, draftAnchors: [], focusedAnchor: null });
});

afterEach(() => {
  act(() => root.unmount());
  content.remove();
  mount.remove();
  vi.unstubAllGlobals();
  useStore.setState({ open: null, draftAnchors: [], focusedAnchor: null });
});

describe('useAnchorHighlights — persistent unresolved text highlight', () => {
  it('registers desk-anchor-unresolved for unresolved text-selection comments', () => {
    setOpen([textComment('t1')]);
    act(() => root.render(<Host />));
    const h = registry.get('desk-anchor-unresolved') as FakeHighlight | undefined;
    expect(h).toBeInstanceOf(FakeHighlight);
    expect(h?.ranges).toHaveLength(1);
    expect(h?.ranges[0]?.toString()).toBe('hello');
  });

  it('does not register it for resolved (or reply) comments', () => {
    setOpen([
      textComment('t1', { resolved: true }),
      textComment('t2', { threadParentId: 't1' } as Partial<Comment>),
    ]);
    act(() => root.render(<Host />));
    expect(registry.has('desk-anchor-unresolved')).toBe(false);
  });

  it('no-ops without CSS Custom Highlight support (the happy-dom default)', () => {
    vi.unstubAllGlobals();
    setOpen([textComment('t1')]);
    expect(() => act(() => root.render(<Host />))).not.toThrow();
  });

  it('folds multiple unresolved ranges into one desk-anchor-unresolved Highlight', () => {
    // Two distinct text selections in the same component, both unresolved: the
    // spread-into-one-Highlight path (`new HighlightCtor(...ranges)`) must carry
    // both, not register two competing highlights or keep only the last.
    setOpen([
      textComment('t1', { anchor: textAnchor(0, 5) }),
      textComment('t2', { anchor: textAnchor(6, 11) }),
    ]);
    act(() => root.render(<Host />));
    const h = registry.get('desk-anchor-unresolved') as FakeHighlight | undefined;
    expect(h).toBeInstanceOf(FakeHighlight);
    expect(h?.ranges).toHaveLength(2);
    expect(h?.ranges.map((r) => r.toString())).toEqual(['hello', 'world']);
  });

  it('lets pending, focused, and unresolved highlights coexist without clobbering', () => {
    // Single-writer guarantee: a compose target, a focused anchor, and an
    // unresolved comment are all live at once. Each owns its own named key, so
    // all three must be present together — no key overwrites another's.
    useStore.setState({
      draftAnchors: [textAnchor(0, 5)],
      focusedAnchor: textAnchor(6, 11),
    });
    setOpen([textComment('t1')]);
    act(() => root.render(<Host />));
    expect(registry.get('desk-anchor-pending')).toBeInstanceOf(FakeHighlight);
    expect(registry.get('desk-anchor-focused')).toBeInstanceOf(FakeHighlight);
    expect(registry.get('desk-anchor-unresolved')).toBeInstanceOf(FakeHighlight);
  });
});
