// @vitest-environment happy-dom
import type { Comment, CommentAttachment, CommentId, ComponentId } from '@desk/types';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../state/store';
import { CommentRail } from './CommentRail';

// Composer flows post via api.comment after a best-effort anchor capture; stub
// both so tests stay offline. attachmentUrl keeps its real shape so the
// thumbnail/lightbox tests still see /api/attachments/<id>.
const commentMock = vi.fn().mockResolvedValue({});
vi.mock('../lib/api', () => ({
  api: {
    comment: (...args: unknown[]) => commentMock(...args),
    attachmentUrl: (id: string) => `/api/attachments/${id}`,
    resolveComment: vi.fn().mockResolvedValue({ ok: true }),
  },
}));
vi.mock('../lib/capture-anchor', () => ({
  captureAnchorImage: vi.fn().mockResolvedValue(null),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  commentMock.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  useStore.setState({ open: null, commentTarget: null, commentDraft: null, railTarget: null });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useStore.setState({ open: null, commentTarget: null, commentDraft: null, railTarget: null });
});

const makeComment = (id: string, overrides: Partial<Comment> = {}): Comment =>
  ({
    id,
    artifactId: 'a',
    anchor: { kind: 'general' },
    author: { kind: 'human', humanId: 'M' },
    payload: { kind: 'text', text: 'looks good' },
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as unknown as Comment;

const attachment = {
  id: 'att1',
  kind: 'image',
  mediaType: 'image/png',
  width: 640,
  height: 480,
} as unknown as CommentAttachment;

function renderRail(comments: Comment[]) {
  useStore.setState({
    open: {
      artifact: { id: 'a', content: { title: 't', components: [] } },
      relations: { outgoing: [], incoming: [] },
      comments,
      locator: [],
    } as never,
  });
  act(() => root.render(<CommentRail />));
}

describe('CommentRail — attachment thumbnails', () => {
  it('renders the thumb strip pointing at the attachment bytes URL', () => {
    renderRail([makeComment('c1', { attachments: [attachment] })]);
    const thumb = container.querySelector('.comment__attachment-thumb') as HTMLImageElement;
    expect(thumb).not.toBeNull();
    expect(thumb.getAttribute('src')).toBe('/api/attachments/att1');
    expect(thumb.getAttribute('loading')).toBe('lazy');
    // Intrinsic size rides on the attributes so CSS can hold the aspect ratio.
    expect(thumb.getAttribute('width')).toBe('640');
    expect(thumb.getAttribute('height')).toBe('480');
  });

  it('renders no strip for a comment without attachments', () => {
    renderRail([makeComment('c1')]);
    expect(container.querySelector('.comment__attachments')).toBeNull();
    expect(container.querySelector('.comment__attachment-thumb')).toBeNull();
  });
});

describe('CommentRail — attachment lightbox', () => {
  it('clicking a thumb opens the lightbox with the full-size image', () => {
    renderRail([makeComment('c1', { attachments: [attachment] })]);
    const thumb = container.querySelector('.comment__attachment-thumb') as HTMLImageElement;
    act(() => thumb.click());
    const image = container.querySelector('.comment-lightbox .comment-lightbox__image');
    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe('/api/attachments/att1');
  });

  it('Escape closes it and marks the event handled (so a drawer does not also close)', () => {
    renderRail([makeComment('c1', { attachments: [attachment] })]);
    act(() => (container.querySelector('.comment__attachment-thumb') as HTMLElement).click());
    expect(container.querySelector('.comment-lightbox')).not.toBeNull();

    const press = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    act(() => {
      window.dispatchEvent(press);
    });
    expect(container.querySelector('.comment-lightbox')).toBeNull();
    // App's drawer Escape handler checks defaultPrevented — the lightbox owns
    // this press (same contract as the topbar overflow menu).
    expect(press.defaultPrevented).toBe(true);
  });

  it('clicking anywhere on the backdrop closes it', () => {
    renderRail([makeComment('c1', { attachments: [attachment] })]);
    act(() => (container.querySelector('.comment__attachment-thumb') as HTMLElement).click());
    const backdrop = container.querySelector('.comment-lightbox') as HTMLElement;
    act(() => backdrop.click());
    expect(container.querySelector('.comment-lightbox')).toBeNull();
  });
});

describe('CommentRail — rail reveal flash', () => {
  it('flashes the matching row, then clears when the store auto-clears railTarget', () => {
    // Fake timers must be installed BEFORE the React root mounts, or React 18's
    // scheduler binds the real timer env and trips on the store's auto-clear.
    vi.useFakeTimers();
    try {
      renderRail([makeComment('c1')]);
      act(() => useStore.getState().revealInRail('c1' as CommentId));
      const row = container.querySelector('[data-comment-id="c1"]') as HTMLElement;
      expect(row.getAttribute('data-rail-flash')).toBe('true');
      // The store clears railTarget ~1.6s later; the effect cleanup re-arms the
      // one-shot by stripping the attribute.
      act(() => vi.advanceTimersByTime(1700));
      expect(row.getAttribute('data-rail-flash')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('escapes backslashes in the id when locating the row', () => {
    // A backslash in the id forces the selector-escaping path
    // (.replace(/["\\]/g, ...)); without it the querySelector would miss/throw.
    const id = 'c\\1';
    renderRail([makeComment(id)]);
    act(() => useStore.getState().revealInRail(id as CommentId));
    const row = container.querySelector(
      `[data-comment-id="${id.replace(/["\\]/g, '\\$&')}"]`,
    ) as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.getAttribute('data-rail-flash')).toBe('true');
  });
});

describe('CommentRail — draft seeding and Escape', () => {
  const textarea = () =>
    container.querySelector(
      '.comment-rail__composer .comment-rail__textarea',
    ) as HTMLTextAreaElement;

  it('seeds the composer from commentDraft and clears an unedited seed on Escape', () => {
    useStore.setState({ commentTarget: { kind: 'general' }, commentDraft: 'seed text' });
    renderRail([]);
    expect(textarea().value).toBe('seed text');

    act(() => {
      textarea().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    });
    expect(textarea().value).toBe('');
    expect(useStore.getState().commentTarget).toBeNull();
  });

  it('keeps hand-edited text when Escape dismisses the anchor', () => {
    useStore.setState({ commentTarget: { kind: 'general' }, commentDraft: 'seed text' });
    renderRail([]);
    // Operator edits the seeded draft to something of their own. Use the native
    // prototype setter so React's value tracker registers the change.
    act(() => {
      const el = textarea();
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setter?.call(el, 'my own words');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => {
      textarea().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    });
    // Only an unedited seed is cleared; edited text survives the anchor dismiss.
    expect(textarea().value).toBe('my own words');
    expect(useStore.getState().commentTarget).toBeNull();
  });
});

describe('CommentRail — anchor chips', () => {
  it('renders one chip per spatial anchor of a multi-anchor comment', () => {
    renderRail([
      makeComment('c1', {
        anchor: { kind: 'point', componentId: 'cmp' as ComponentId, offset: { x: 0.5, y: 0.5 } },
        anchors: [
          { kind: 'point', componentId: 'cmp' as ComponentId, offset: { x: 0.5, y: 0.5 } },
          {
            kind: 'region',
            componentId: 'cmp' as ComponentId,
            region: { kind: 'fractional', x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
          },
        ],
      } as Partial<Comment>),
    ]);
    expect(container.querySelectorAll('.comment__anchors .comment__anchor').length).toBe(2);
  });

  it('renders no chip for a general-only comment', () => {
    renderRail([makeComment('c1')]); // default anchor is { kind: 'general' }
    expect(container.querySelector('.comment__anchors')).toBeNull();
    expect(container.querySelector('.comment__anchor')).toBeNull();
  });
});
