import type { Database } from 'bun:sqlite';
import type { ArtifactId, Comment, CommentId } from '@desk/types';

interface CommentRow {
  id: string;
  artifact_id: string;
  anchor: string;
  author: string;
  payload: string;
  thread_parent_id: string | null;
  resolved: number;
  created_at: string;
}

function rowToComment(row: CommentRow): Comment {
  return {
    id: row.id as CommentId,
    artifactId: row.artifact_id as ArtifactId,
    anchor: JSON.parse(row.anchor),
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
    this.db
      .query(
        `INSERT INTO comments
         (id, artifact_id, anchor, author, payload, thread_parent_id, resolved, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        comment.id,
        comment.artifactId,
        JSON.stringify(comment.anchor),
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
