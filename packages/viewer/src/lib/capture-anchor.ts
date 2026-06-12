import { cropForAnchor, longEdgeScale } from '@desk/anchor-geometry';
import type { CommentAnchor } from '@desk/types';
import { toCanvas } from 'html-to-image';

/**
 * Capture what the operator is LOOKING AT when they drop a point or select a
 * region: rasterize the anchored component's live DOM (their theme, their
 * viewport, current state) and crop to the anchor using the shared projection
 * math — the same framing the channel's Puppeteer fallback produces.
 *
 * Returns null on ANY failure (component gone, rasterization unsupported,
 * over the byte cap) — the comment still posts, and the channel falls back to
 * its server-side Puppeteer render. Known limits, by design: CSS Custom
 * Highlight paint doesn't rasterize, and cross-origin iframe content (e.g. a
 * sandboxed custom component) captures blank — the fallback covers those.
 */

/** Device-pixel caps: DPR ≤ 2 and long edge ≤ 1600px keep PNGs well under the
 *  server's 2 MB attachment limit for realistic crops. */
const MAX_PIXEL_RATIO = 2;
const MAX_LONG_EDGE = 1600;
const MAX_BYTES = 2 * 1024 * 1024;
const DATA_URL_PREFIX_LENGTH = 'data:image/png;base64,'.length;

export async function captureAnchorImage(
  anchor: CommentAnchor,
): Promise<{ dataUrl: string } | null> {
  if (anchor.kind !== 'point' && anchor.kind !== 'region') return null;
  try {
    const selector = `[data-component-id="${anchor.componentId.replace(/["\\]/g, '\\$&')}"]`;
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return null;

    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    // Element-local space: the box sits at the origin, bounds = the element.
    const box = { x: 0, y: 0, width: rect.width, height: rect.height };
    const crop = cropForAnchor(anchor, box, { width: rect.width, height: rect.height });

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const ratio = dpr * longEdgeScale(crop.width, crop.height, dpr, MAX_LONG_EDGE);

    const full = await toCanvas(el, { pixelRatio: ratio });
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(crop.width * ratio));
    out.height = Math.max(1, Math.round(crop.height * ratio));
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(
      full,
      crop.x * ratio,
      crop.y * ratio,
      crop.width * ratio,
      crop.height * ratio,
      0,
      0,
      out.width,
      out.height,
    );

    const dataUrl = out.toDataURL('image/png');
    if (((dataUrl.length - DATA_URL_PREFIX_LENGTH) / 4) * 3 > MAX_BYTES) return null;
    return { dataUrl };
  } catch {
    return null;
  }
}
