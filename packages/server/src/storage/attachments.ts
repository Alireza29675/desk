import type { Database } from 'bun:sqlite';
import type { AttachmentId, CommentAttachment, CommentId } from '@desk/types';

interface AttachmentMetaRow {
  id: string;
  comment_id: string;
  media_type: string;
  width: number;
  height: number;
  anchor_index: number;
  created_at: string;
}

function rowToMeta(row: AttachmentMetaRow): CommentAttachment {
  return {
    id: row.id as AttachmentId,
    kind: 'image',
    mediaType: row.media_type as CommentAttachment['mediaType'],
    width: row.width,
    height: row.height,
    anchorIndex: row.anchor_index,
  };
}

export class AttachmentRepository {
  constructor(private readonly db: Database) {}

  insert(input: {
    id: AttachmentId;
    commentId: CommentId;
    mediaType: string;
    width: number;
    height: number;
    anchorIndex: number;
    bytes: Uint8Array;
    createdAt: string;
  }): void {
    this.db
      .query(
        `INSERT INTO attachments (id, comment_id, media_type, width, height, anchor_index, bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.commentId,
        input.mediaType,
        input.width,
        input.height,
        input.anchorIndex,
        input.bytes,
        input.createdAt,
      );
  }

  /** Bytes + content type, for serving. */
  get(id: AttachmentId): { mediaType: string; bytes: Uint8Array } | undefined {
    const row = this.db
      .query<{ media_type: string; bytes: Uint8Array }, [string]>(
        'SELECT media_type, bytes FROM attachments WHERE id = ?',
      )
      .get(id);
    return row ? { mediaType: row.media_type, bytes: row.bytes } : undefined;
  }

  /** Envelope metadata (no bytes) for one comment, ordered by which selection
   *  each image captured (anchor index), then insertion order. */
  listMetaByComment(commentId: CommentId): CommentAttachment[] {
    return this.db
      .query<AttachmentMetaRow, [string]>(
        'SELECT id, comment_id, media_type, width, height, anchor_index, created_at FROM attachments WHERE comment_id = ? ORDER BY anchor_index ASC, created_at ASC, id ASC',
      )
      .all(commentId)
      .map(rowToMeta);
  }
}
