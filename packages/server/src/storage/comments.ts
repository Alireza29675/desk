import type { Database } from 'bun:sqlite';
import {
  type ArtifactId,
  type Comment,
  type CommentAnchor,
  type CommentId,
  commentAnchors,
} from '@desk/types';

interface CommentRow {
  id: string;
  artifact_id: string;
  anchor: string;
  /** FB-R3: the JSON array of anchors. Null only for a legacy row the backfill
   *  hasn't touched — handled by the read fallback below. */
  anchors: string | null;
  author: string;
  payload: string;
  thread_parent_id: string | null;
  resolved: number;
  created_at: string;
}

function rowToComment(row: CommentRow): Comment {
  // Canonical multi-anchor read with a belt-and-suspenders fallback: a legacy
  // row whose `anchors` the migration backfill somehow missed still reads as a
  // 1-element array off the shadow `anchor` column.
  const anchors: CommentAnchor[] = row.anchors ? JSON.parse(row.anchors) : [JSON.parse(row.anchor)];
  return {
    id: row.id as CommentId,
    artifactId: row.artifact_id as ArtifactId,
    anchors,
    anchor: anchors[0]!, // transitional primary, always == anchors[0]
    author: JSON.parse(row.author),
    payload: JSON.parse(row.payload),
    ...(row.thread_parent_id ? { threadParentId: row.thread_parent_id as CommentId } : {}),
    ...(row.resolved ? { resolved: true } : {}),
    createdAt: row.created_at,
  };
}

export class CommentRepository {
  constructor(private readonly db: Database) {}

  insert(comment: Comment): void {
    // Dual-write this cycle: `anchors` is canonical; `anchor` is the populated
    // shadow (= anchors[0]) that keeps the NOT NULL column satisfied and lets a
    // downgrade still read. Derived via the helper so they can never disagree.
    const anchors = commentAnchors(comment);
    this.db
      .query(
        `INSERT INTO comments
         (id, artifact_id, anchor, anchors, author, payload, thread_parent_id, resolved, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        comment.id,
        comment.artifactId,
        JSON.stringify(anchors[0]),
        JSON.stringify(anchors),
        JSON.stringify(comment.author),
        JSON.stringify(comment.payload),
        comment.threadParentId ?? null,
        comment.resolved ? 1 : 0,
        comment.createdAt,
      );
  }

  setResolved(id: CommentId, resolved: boolean): void {
    this.db.query('UPDATE comments SET resolved = ? WHERE id = ?').run(resolved ? 1 : 0, id);
  }

  listByArtifact(artifactId: ArtifactId): Comment[] {
    return this.db
      .query<CommentRow, [string]>(
        'SELECT * FROM comments WHERE artifact_id = ? ORDER BY created_at ASC',
      )
      .all(artifactId)
      .map(rowToComment);
  }

  get(id: CommentId): Comment | undefined {
    const row = this.db.query<CommentRow, [string]>('SELECT * FROM comments WHERE id = ?').get(id);
    return row ? rowToComment(row) : undefined;
  }
}
