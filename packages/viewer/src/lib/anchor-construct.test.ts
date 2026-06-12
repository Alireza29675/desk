// @vitest-environment happy-dom
import type { ComponentId } from '@desk/types';
import { afterEach, describe, expect, it } from 'vitest';
import { anchorFromPoint, anchorFromRegion, anchorFromSelection } from './anchor-construct';

const cid = 'comp-1' as ComponentId;

/**
 * Mount a `.commentable[data-component-id] > .commentable__content` host whose
 * content box is `box` (happy-dom has no layout, so the rect is stubbed — the
 * same technique the capture tests use).
 */
function mountComponent(
  box: { left: number; top: number; width: number; height: number },
  text = '',
): HTMLElement {
  const host = document.createElement('div');
  host.className = 'commentable';
  host.setAttribute('data-component-id', cid);
  const content = document.createElement('div');
  content.className = 'commentable__content';
  content.textContent = text;
  host.appendChild(content);
  document.body.appendChild(host);
  content.getBoundingClientRect = () =>
    ({
      ...box,
      right: box.left + box.width,
      bottom: box.top + box.height,
      x: box.left,
      y: box.top,
      toJSON: () => ({}),
    }) as DOMRect;
  return content;
}

function fakeSelection(range: Range, collapsed = false): Selection {
  return {
    isCollapsed: collapsed,
    rangeCount: 1,
    getRangeAt: () => range,
    toString: () => range.toString(),
  } as unknown as Selection;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('anchorFromPoint', () => {
  it('resolves the component and stores a fractional offset', () => {
    const content = mountComponent({ left: 100, top: 50, width: 200, height: 100 });
    expect(anchorFromPoint(content, 150, 100)).toEqual({
      kind: 'point',
      componentId: cid,
      offset: { x: 0.25, y: 0.5 },
    });
  });

  it('resolves from a nested child element', () => {
    const content = mountComponent({ left: 0, top: 0, width: 100, height: 100 });
    const child = document.createElement('span');
    content.appendChild(child);
    expect(anchorFromPoint(child, 50, 25)).toMatchObject({
      kind: 'point',
      componentId: cid,
      offset: { x: 0.5, y: 0.25 },
    });
  });

  it('returns null when the gesture is outside any component', () => {
    const loose = document.createElement('div');
    document.body.appendChild(loose);
    expect(anchorFromPoint(loose, 10, 10)).toBeNull();
  });
});

describe('anchorFromRegion', () => {
  it('builds a clamped fractional rect from a drag', () => {
    // Coordinates chosen to land on exact binary fractions (0.25 / 0.75) so the
    // assertion isn't tripped by float drift — the math itself is fractional.
    const content = mountComponent({ left: 0, top: 0, width: 200, height: 100 });
    expect(anchorFromRegion(content, 50, 25, 150, 75)).toEqual({
      kind: 'region',
      componentId: cid,
      region: { kind: 'fractional', x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    });
  });

  it('returns null for an accidental click-without-drag (under the threshold)', () => {
    const content = mountComponent({ left: 0, top: 0, width: 200, height: 200 });
    expect(anchorFromRegion(content, 100, 100, 101, 101)).toBeNull();
  });

  it('returns null outside any component', () => {
    const loose = document.createElement('div');
    document.body.appendChild(loose);
    expect(anchorFromRegion(loose, 0, 0, 50, 50)).toBeNull();
  });
});

describe('anchorFromSelection', () => {
  it('resolves the component and the character offsets of the selection', () => {
    const content = mountComponent({ left: 0, top: 0, width: 100, height: 100 }, 'hello world');
    const range = document.createRange();
    range.setStart(content.firstChild!, 0);
    range.setEnd(content.firstChild!, 5); // "hello"
    expect(anchorFromSelection(fakeSelection(range))).toEqual({
      kind: 'text-selection',
      componentId: cid,
      start: 0,
      end: 5,
    });
  });

  it('returns null for a collapsed selection', () => {
    const content = mountComponent({ left: 0, top: 0, width: 100, height: 100 }, 'hi');
    const range = document.createRange();
    range.setStart(content.firstChild!, 1);
    range.collapse(true);
    expect(anchorFromSelection(fakeSelection(range, true))).toBeNull();
  });

  it('returns null when the selection is outside any component', () => {
    const loose = document.createElement('div');
    loose.textContent = 'orphan';
    document.body.appendChild(loose);
    const range = document.createRange();
    range.setStart(loose.firstChild!, 0);
    range.setEnd(loose.firstChild!, 3);
    expect(anchorFromSelection(fakeSelection(range))).toBeNull();
  });
});
