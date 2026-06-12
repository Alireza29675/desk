// @vitest-environment happy-dom
import type { Comment, CommentAttachment } from '@desk/types';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../state/store';
import { CommentRail } from './CommentRail';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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
