// @vitest-environment happy-dom
import type { CommentAnchor, ComponentId } from '@desk/types';
import { afterEach, describe, expect, it } from 'vitest';
import { captureAnchorImage } from './capture-anchor';

const cid = 'comp-1' as ComponentId;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('captureAnchorImage — best-effort by contract, never throws', () => {
  it('returns null for non-spatial anchors (nothing to frame)', async () => {
    expect(await captureAnchorImage({ kind: 'general' })).toBeNull();
    expect(await captureAnchorImage({ kind: 'element', componentId: cid })).toBeNull();
    expect(
      await captureAnchorImage({ kind: 'text-selection', componentId: cid, start: 0, end: 4 }),
    ).toBeNull();
  });

  it('returns null when the anchored component is not in the document', async () => {
    const anchor: CommentAnchor = { kind: 'point', componentId: cid, offset: { x: 0.5, y: 0.5 } };
    expect(await captureAnchorImage(anchor)).toBeNull();
  });

  it('degrades to null (no throw) when rasterization is unavailable', async () => {
    // happy-dom has no real layout or canvas — exactly the "ANY failure →
    // null → Puppeteer fallback" path the contract requires.
    const el = document.createElement('div');
    el.setAttribute('data-component-id', cid);
    document.body.appendChild(el);
    const anchor: CommentAnchor = {
      kind: 'region',
      componentId: cid,
      region: { kind: 'fractional', x: 0, y: 0, width: 1, height: 1 },
    };
    expect(await captureAnchorImage(anchor)).toBeNull();
  });
});
