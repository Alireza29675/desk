import { describe, expect, it } from 'vitest';
import { fractionalPoint, fractionalRect, selectedTextPreview } from './anchor-geometry';

const box = { left: 100, top: 50, width: 200, height: 400 };

describe('fractionalPoint', () => {
  it('maps a pointer inside the box to 0..1 fractions', () => {
    expect(fractionalPoint(box, 200, 250)).toEqual({ x: 0.5, y: 0.5 });
    expect(fractionalPoint(box, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(fractionalPoint(box, 300, 450)).toEqual({ x: 1, y: 1 });
  });

  it('clamps points outside the box into [0,1]', () => {
    expect(fractionalPoint(box, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(fractionalPoint(box, 9999, 9999)).toEqual({ x: 1, y: 1 });
  });
});

describe('fractionalRect', () => {
  const expectRect = (r: { x: number; y: number; width: number; height: number }, x: number, y: number, w: number, h: number) => {
    expect(r.x).toBeCloseTo(x);
    expect(r.y).toBeCloseTo(y);
    expect(r.width).toBeCloseTo(w);
    expect(r.height).toBeCloseTo(h);
  };

  it('builds a rect from two corners', () => {
    expectRect(fractionalRect(box, { x: 0.2, y: 0.25 }, { x: 0.7, y: 0.75 }), 0.2, 0.25, 0.5, 0.5);
  });

  it('normalizes a reversed (bottom-right → top-left) drag', () => {
    expectRect(fractionalRect(box, { x: 0.7, y: 0.75 }, { x: 0.2, y: 0.25 }), 0.2, 0.25, 0.5, 0.5);
  });

  it('yields a zero-area rect for a click without drag', () => {
    expect(fractionalRect(box, { x: 0.4, y: 0.4 }, { x: 0.4, y: 0.4 })).toEqual({ x: 0.4, y: 0.4, width: 0, height: 0 });
  });
});

describe('selectedTextPreview', () => {
  it('returns empty string for no selection', () => {
    expect(selectedTextPreview(null)).toBe('');
  });

  it('collapses whitespace', () => {
    const sel = { toString: () => '  hello   world  ' } as unknown as Selection;
    expect(selectedTextPreview(sel)).toBe('hello world');
  });

  it('truncates with an ellipsis past the max', () => {
    const sel = { toString: () => 'x'.repeat(80) } as unknown as Selection;
    const out = selectedTextPreview(sel, 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith('…')).toBe(true);
  });
});
