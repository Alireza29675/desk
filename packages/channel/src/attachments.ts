import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Materialize a comment's image attachments as local PNG files the agent can
 * open. This is the PRIMARY delivery for item-12 screenshots: the viewer
 * captured exactly what the operator saw (one image per selection), the server
 * stored the bytes, and the agent gets file paths in the channel notification.
 * The Puppeteer re-render in `screenshot.ts` stays as the per-anchor fallback
 * for spatial selections with no attachment (older viewers, capture failure,
 * custom-component iframes the viewer cannot rasterize).
 */

const OUT_DIR = join(tmpdir(), 'desk-channel');

export interface AttachmentRef {
  id: string;
  kind: string;
  /** Which selection this image captured (index into the comment's anchors). */
  anchorIndex?: number;
}

/**
 * Download every image attachment to a tmp file, keyed by the anchor index it
 * captured. Returns an empty map when there is nothing to fetch; a fetch that
 * fails is skipped (callers fall back to the Puppeteer path for that anchor).
 * Never throws.
 */
export async function attachmentsToFiles(
  deskUrl: string,
  commentId: string,
  attachments: AttachmentRef[] | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  for (const att of attachments ?? []) {
    if (att.kind !== 'image') continue;
    const index = att.anchorIndex ?? 0;
    try {
      const res = await fetchImpl(`${deskUrl}/api/attachments/${att.id}`);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length === 0) continue;
      mkdirSync(OUT_DIR, { recursive: true });
      const path = join(OUT_DIR, `${commentId}-a${index}.png`);
      writeFileSync(path, bytes);
      out.set(index, path);
    } catch (e) {
      console.error('[desk-channel] attachment fetch failed:', (e as Error).message);
    }
  }
  return out;
}
