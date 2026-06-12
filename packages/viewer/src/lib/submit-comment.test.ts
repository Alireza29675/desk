// @vitest-environment node
import type { CommentAnchor } from '@desk/types';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./capture-anchor', () => ({ captureAnchorImage: vi.fn() }));
vi.mock('./api', () => ({ api: { comment: vi.fn() } }));
vi.mock('../state/store', () => ({ useStore: { getState: vi.fn() } }));

import { useStore } from '../state/store';
import { api } from './api';
import { captureAnchorImage } from './capture-anchor';
import { submitComment } from './submit-comment';

const author = { kind: 'human', humanId: 'M' };

beforeEach(() => {
  vi.clearAllMocks();
  (useStore.getState as Mock).mockReturnValue({ open: { artifact: { id: 'art-1' } }, author });
  // The real capture contract: only point/region rasterize; everything else null.
  (captureAnchorImage as Mock).mockImplementation(async (a: CommentAnchor) =>
    a.kind === 'point' || a.kind === 'region' ? { dataUrl: 'data:image/png;base64,AAAA' } : null,
  );
  (api.comment as Mock).mockResolvedValue({ id: 'c-1' });
});

describe('submitComment', () => {
  it('captures only spatial anchors and tags each image with its original anchorIndex', async () => {
    const anchors: CommentAnchor[] = [
      {
        kind: 'region',
        componentId: 'c1' as never,
        region: { kind: 'fractional', x: 0, y: 0, width: 1, height: 1 },
      },
      { kind: 'text-selection', componentId: 'c2' as never, start: 0, end: 4 },
      { kind: 'point', componentId: 'c1' as never, offset: { x: 0.5, y: 0.5 } },
    ];
    await submitComment({ body: 'look at these', anchors });

    expect(api.comment).toHaveBeenCalledTimes(1);
    const [artifactId, body] = (api.comment as Mock).mock.calls[0]!;
    expect(artifactId).toBe('art-1');
    expect(body.anchors).toEqual(anchors);
    expect(body.payload).toEqual({ kind: 'text', text: 'look at these' });
    expect(body.author).toBe(author);
    // Region (0) and point (2) captured; the text-selection (1) is skipped and
    // the survivors keep their ORIGINAL indices so delivery can pair them.
    expect(body.attachments).toEqual([
      { kind: 'image', dataUrl: 'data:image/png;base64,AAAA', anchorIndex: 0 },
      { kind: 'image', dataUrl: 'data:image/png;base64,AAAA', anchorIndex: 2 },
    ]);
  });

  it('omits attachments entirely when nothing spatial captured', async () => {
    await submitComment({ body: 'doc note', anchors: [{ kind: 'general' }] });
    const [, body] = (api.comment as Mock).mock.calls[0]!;
    expect(body.attachments).toBeUndefined();
    expect(body.anchors).toEqual([{ kind: 'general' }]);
  });

  it('throws when no artifact is open, without posting', async () => {
    (useStore.getState as Mock).mockReturnValue({ open: null, author });
    await expect(submitComment({ body: 'x', anchors: [{ kind: 'general' }] })).rejects.toThrow(
      /no artifact/i,
    );
    expect(api.comment).not.toHaveBeenCalled();
  });
});
