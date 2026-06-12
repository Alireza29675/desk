import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { attachmentsToFiles } from './attachments';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const okPng = (async () => new Response(PNG_BYTES, { status: 200 })) as unknown as typeof fetch;

describe('attachmentsToFiles — primary multi-image delivery to the agent', () => {
  test('downloads each image attachment keyed by its anchorIndex, as readable PNGs', async () => {
    const map = await attachmentsToFiles(
      'http://desk.test',
      'c-1',
      [
        { id: 'a0', kind: 'image', anchorIndex: 0 },
        { id: 'a2', kind: 'image', anchorIndex: 2 },
      ],
      okPng,
    );
    expect([...map.keys()].sort()).toEqual([0, 2]);
    const p0 = map.get(0) as string;
    expect(existsSync(p0)).toBe(true);
    expect([...readFileSync(p0).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  test('empty / undefined attachments → empty map (callers fall back to Puppeteer)', async () => {
    expect((await attachmentsToFiles('http://desk.test', 'c-2', undefined, okPng)).size).toBe(0);
    expect((await attachmentsToFiles('http://desk.test', 'c-2', [], okPng)).size).toBe(0);
  });

  test('defaults anchorIndex to 0 when absent', async () => {
    const map = await attachmentsToFiles(
      'http://desk.test',
      'c-3',
      [{ id: 'a', kind: 'image' }],
      okPng,
    );
    expect(map.has(0)).toBe(true);
  });

  test('skips a failed fetch and a network error without throwing; the rest survive', async () => {
    const fetchMixed = (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/bad')) return new Response('nope', { status: 404 });
      if (u.endsWith('/boom')) throw new Error('connection refused');
      return new Response(PNG_BYTES, { status: 200 });
    }) as unknown as typeof fetch;
    const map = await attachmentsToFiles(
      'http://desk.test',
      'c-4',
      [
        { id: 'good', kind: 'image', anchorIndex: 0 },
        { id: 'bad', kind: 'image', anchorIndex: 1 },
        { id: 'boom', kind: 'image', anchorIndex: 2 },
      ],
      fetchMixed,
    );
    expect([...map.keys()]).toEqual([0]);
  });

  test('skips non-image attachment kinds', async () => {
    const map = await attachmentsToFiles(
      'http://desk.test',
      'c-5',
      [{ id: 'a', kind: 'voice' }],
      okPng,
    );
    expect(map.size).toBe(0);
  });
});
