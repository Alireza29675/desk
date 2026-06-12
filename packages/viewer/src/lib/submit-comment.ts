import type { Comment, CommentAnchor, CommentAttachmentInput } from '@desk/types';
import { useStore } from '../state/store';
import { api } from './api';
import { captureAnchorImage } from './capture-anchor';

/**
 * Post ONE comment anchored to an array of selections. This is the submit half
 * of the multi-anchor seam: the composer accumulates `anchors` (in the wire
 * `CommentAnchor` shape) and hands them here with the body text; everything
 * downstream — per-anchor capture, the POST, delivery — lives behind this call.
 *
 * Each spatial anchor (point / region) is rasterized into its OWN image tagged
 * with its `anchorIndex`, so the model sees every selection distinctly; a
 * non-spatial anchor (text-selection / element / general) captures nothing and
 * its slot is simply skipped (the surviving images keep their original index).
 * The created comment also streams back via `s.commented`, so there is no store
 * mutation here.
 */
export async function submitComment(input: {
  body: string;
  anchors: CommentAnchor[];
}): Promise<Comment> {
  const { open, author } = useStore.getState();
  if (!open) throw new Error('Cannot post a comment with no artifact open.');

  const attachments: CommentAttachmentInput[] = [];
  for (let i = 0; i < input.anchors.length; i++) {
    const shot = await captureAnchorImage(input.anchors[i]!);
    if (shot) attachments.push({ kind: 'image', dataUrl: shot.dataUrl, anchorIndex: i });
  }

  return api.comment(open.artifact.id, {
    anchors: input.anchors,
    payload: { kind: 'text', text: input.body },
    author,
    ...(attachments.length > 0 ? { attachments } : {}),
  });
}
