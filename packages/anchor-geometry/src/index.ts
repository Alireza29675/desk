/**
 * Pure projection math for spatial comment anchors.
 *
 * Anchors store *semantic or relative* positions (fractions of a component's
 * box, never raw pixels). This module answers the inverse question both
 * capture pipelines need: given the component's box on screen, WHAT AREA does
 * a point/region anchor cover? The viewer's html-to-image crop and the
 * channel's Puppeteer crop both call this, so the operator sees the same
 * framing no matter which pipeline produced the image.
 */

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The crop drawn around a `point` anchor: a fixed context window. */
export const POINT_CROP = { width: 220, height: 160 } as const;

/** Breathing room added around every crop before clamping. */
export const CROP_PADDING = 10;

export interface SpatialAnchorLike {
  kind: string;
  region?: { kind: string; x?: number; y?: number; width?: number; height?: number };
  offset?: { x: number; y: number };
}

/**
 * Crop rectangle for an anchor, in the same coordinate space as `box`
 * (CSS px relative to whatever `box` is relative to). Falls back to the whole
 * component box for element/text-selection anchors. Padded by `CROP_PADDING`
 * and clamped to `bounds`.
 */
export function cropForAnchor(
  anchor: SpatialAnchorLike,
  box: PixelRect,
  bounds: { width: number; height: number },
): PixelRect {
  let rect: PixelRect;
  if (anchor.kind === 'region' && anchor.region?.kind === 'fractional') {
    const r = anchor.region;
    rect = {
      x: box.x + (r.x ?? 0) * box.width,
      y: box.y + (r.y ?? 0) * box.height,
      width: (r.width ?? 1) * box.width,
      height: (r.height ?? 1) * box.height,
    };
  } else if (anchor.kind === 'point' && anchor.offset) {
    const cx = box.x + anchor.offset.x * box.width;
    const cy = box.y + anchor.offset.y * box.height;
    rect = {
      x: cx - POINT_CROP.width / 2,
      y: cy - POINT_CROP.height / 2,
      width: POINT_CROP.width,
      height: POINT_CROP.height,
    };
  } else {
    rect = box; // element / text-selection → the whole component
  }
  const x = Math.max(0, rect.x - CROP_PADDING);
  const y = Math.max(0, rect.y - CROP_PADDING);
  return {
    x,
    y,
    width: Math.max(1, Math.min(bounds.width - x, rect.width + CROP_PADDING * 2)),
    height: Math.max(1, Math.min(bounds.height - y, rect.height + CROP_PADDING * 2)),
  };
}

/**
 * Scale factor that keeps a `width × height` crop, rendered at `pixelRatio`,
 * inside `maxLongEdge` device pixels. ≤ 1; multiply the render ratio by it.
 */
export function longEdgeScale(
  width: number,
  height: number,
  pixelRatio: number,
  maxLongEdge: number,
): number {
  const longEdge = Math.max(width, height) * pixelRatio;
  return longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
}
