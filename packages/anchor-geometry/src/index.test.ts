import { describe, expect, it } from 'vitest';
import { CROP_PADDING, POINT_CROP, cropForAnchor, longEdgeScale } from './index';

const box = { x: 100, y: 200, width: 400, height: 300 };
const bounds = { width: 1440, height: 900 };

describe('cropForAnchor — one framing for both capture pipelines', () => {
  it('projects a fractional region into the component box (plus padding)', () => {
    const crop = cropForAnchor(
      { kind: 'region', region: { kind: 'fractional', x: 0.25, y: 0.5, width: 0.5, height: 0.25 } },
      box,
      bounds,
    );
    expect(crop).toEqual({
      x: 100 + 0.25 * 400 - CROP_PADDING,
      y: 200 + 0.5 * 300 - CROP_PADDING,
      width: 0.5 * 400 + CROP_PADDING * 2,
      height: 0.25 * 300 + CROP_PADDING * 2,
    });
  });

  it('draws the fixed context window around a point anchor', () => {
    const crop = cropForAnchor({ kind: 'point', offset: { x: 0.5, y: 0.5 } }, box, bounds);
    expect(crop.width).toBe(POINT_CROP.width + CROP_PADDING * 2);
    expect(crop.height).toBe(POINT_CROP.height + CROP_PADDING * 2);
    // Centered on the offset: box center is (300, 350).
    expect(crop.x + crop.width / 2).toBeCloseTo(300);
    expect(crop.y + crop.height / 2).toBeCloseTo(350);
  });

  it('falls back to the whole component for element anchors', () => {
    const crop = cropForAnchor({ kind: 'element' }, box, bounds);
    expect(crop.x).toBe(box.x - CROP_PADDING);
    expect(crop.width).toBe(box.width + CROP_PADDING * 2);
  });

  it('clamps to the bounds and never collapses below 1px', () => {
    const nearEdge = cropForAnchor(
      { kind: 'point', offset: { x: 0, y: 0 } },
      { x: 0, y: 0, width: 10, height: 10 },
      { width: 50, height: 50 },
    );
    expect(nearEdge.x).toBe(0);
    expect(nearEdge.y).toBe(0);
    expect(nearEdge.width).toBeLessThanOrEqual(50);
    expect(nearEdge.height).toBeLessThanOrEqual(50);
    expect(nearEdge.width).toBeGreaterThanOrEqual(1);
  });

  it('a region missing fraction fields defaults to the full component', () => {
    const crop = cropForAnchor({ kind: 'region', region: { kind: 'fractional' } }, box, bounds);
    expect(crop.width).toBe(box.width + CROP_PADDING * 2);
    expect(crop.height).toBe(box.height + CROP_PADDING * 2);
  });
});

describe('longEdgeScale — the pixel cap', () => {
  it('returns 1 when the render already fits', () => {
    expect(longEdgeScale(400, 300, 2, 1600)).toBe(1);
  });
  it('scales down so the long edge lands exactly on the cap', () => {
    const s = longEdgeScale(1000, 300, 2, 1600);
    expect(1000 * 2 * s).toBe(1600);
  });
});
