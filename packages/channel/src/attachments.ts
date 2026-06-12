import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Materialize a comment's first image attachment as a local PNG file the
 * agent can open. This is the PRIMARY delivery for item-12 screenshots: the
 * viewer captured exactly what the operator saw, the server stored the bytes,
 * and the agent gets a file path in the channel notification. The Puppeteer
 * re-render in `screenshot.ts` stays as the fallback for spatial comments
 * with no attachment (older viewers, capture failure, custom-component
 * iframes the viewer cannot rasterize).
 */

const OUT_DIR = join(tmpdir(), 'desk-channel');

export interface AttachmentRef {
  id: string;
  kind: string;
}

/**
 * Download the first image attachment to a tmp file. Returns the path, or
 * null when there is nothing to fetch / the fetch fails — callers fall back
 * to the Puppeteer path in that case.
 */
export async function attachmentToFile(
  deskUrl: string,
  commentId: string,
  attachments: AttachmentRef[] | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const image = attachments?.find((a) => a.kind === 'image');
  if (!image) return null;
  try {
    const res = await fetchImpl(`${deskUrl}/api/attachments/${image.id}`);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) return null;
    mkdirSync(OUT_DIR, { recursive: true });
    const path = join(OUT_DIR, `${commentId}-attached.png`);
    writeFileSync(path, bytes);
    return path;
  } catch (e) {
    console.error('[desk-channel] attachment fetch failed:', (e as Error).message);
    return null;
  }
}
