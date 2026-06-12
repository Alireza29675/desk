import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { attachmentToFile } from './attachments';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function fetchOk(): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    expect(String(url)).toBe('http://desk.test/api/attachments/att-1');
    return new Response(PNG_BYTES, { status: 200 });
  }) as unknown as typeof fetch;
}

describe('attachmentToFile — primary screenshot delivery to the agent', () => {
  test('downloads the first image attachment and returns a readable PNG path', async () => {
    const path = await attachmentToFile(
      'http://desk.test',
      'c-1',
      [{ id: 'att-1', kind: 'image' }],
      fetchOk(),
    );
    expect(path).not.toBeNull();
    expect(existsSync(path as string)).toBe(true);
    const bytes = readFileSync(path as string);
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  test('returns null when there are no attachments (callers fall back to Puppeteer)', async () => {
    expect(await attachmentToFile('http://desk.test', 'c-2', undefined, fetchOk())).toBeNull();
    expect(await attachmentToFile('http://desk.test', 'c-2', [], fetchOk())).toBeNull();
  });

  test('returns null on HTTP failure and on network error — never throws', async () => {
    const fetch404 = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    expect(
      await attachmentToFile('http://desk.test', 'c-3', [{ id: 'a', kind: 'image' }], fetch404),
    ).toBeNull();

    const fetchBoom = (async () => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;
    expect(
      await attachmentToFile('http://desk.test', 'c-4', [{ id: 'a', kind: 'image' }], fetchBoom),
    ).toBeNull();
  });

  test('skips non-image attachment kinds', async () => {
    expect(
      await attachmentToFile('http://desk.test', 'c-5', [{ id: 'a', kind: 'voice' }], fetchOk()),
    ).toBeNull();
  });
});
