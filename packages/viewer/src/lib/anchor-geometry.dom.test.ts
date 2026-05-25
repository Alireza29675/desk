// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { rangeFromTextOffsets, textOffsetsWithin } from './anchor-geometry';

function mount(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}
afterEach(() => {
  document.body.innerHTML = '';
});

function selectRange(node: Node, start: number, end: number): Selection {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const sel = window.getSelection() as Selection;
  sel.removeAllRanges();
  sel.addRange(range);
  return sel;
}

describe('textOffsetsWithin', () => {
  it('computes char offsets of a selection within the root', () => {
    const root = mount('An honest engineering critique');
    const offsets = textOffsetsWithin(root, selectRange(root.firstChild as Node, 3, 9));
    expect(offsets).toEqual({ start: 3, end: 9 });
  });

  it('counts across multiple text nodes (root holds an inline element)', () => {
    const root = mount('A <strong>bold</strong> word');
    // "A " = 2, then "bold" begins at offset 2. Select 2..6 inside the <strong> text node.
    const strongText = root.querySelector('strong')?.firstChild as Node;
    expect(textOffsetsWithin(root, selectRange(strongText, 0, 4))).toEqual({ start: 2, end: 6 });
  });

  it('returns null for a collapsed selection', () => {
    const root = mount('hello');
    expect(textOffsetsWithin(root, selectRange(root.firstChild as Node, 2, 2))).toBeNull();
  });

  it('returns null for no selection', () => {
    const root = mount('hello');
    expect(textOffsetsWithin(root, null)).toBeNull();
  });
});

describe('rangeFromTextOffsets', () => {
  it('rebuilds a range spanning the given offsets', () => {
    const root = mount('An honest engineering critique');
    const range = rangeFromTextOffsets(root, 3, 9);
    expect(range?.toString()).toBe('honest');
  });

  it('round-trips with textOffsetsWithin', () => {
    const root = mount('The medium is the message');
    const sel = selectRange(root.firstChild as Node, 4, 10); // "medium"
    const offsets = textOffsetsWithin(root, sel);
    expect(offsets).not.toBeNull();
    const range = rangeFromTextOffsets(root, offsets!.start, offsets!.end);
    expect(range?.toString()).toBe('medium');
  });

  it('returns null when offsets exceed the text', () => {
    const root = mount('short');
    expect(rangeFromTextOffsets(root, 100, 200)).toBeNull();
  });
});
