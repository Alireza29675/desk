import type { Database } from 'bun:sqlite';
import type { Artifact, ArtifactId, ArtifactContent } from '@desk/types';

interface ArtifactRow {
  id: string;
  type: string;
  title: string;
  components: string;
  provenance: string;
  contributors: string;
  created_at: string;
  updated_at: string;
  version: number;
}

function rowToArtifact(row: ArtifactRow): Artifact {
  return {
    id: row.id as ArtifactId,
    type: row.type,
    content: {
      title: row.title,
      components: JSON.parse(row.components),
    },
    provenance: JSON.parse(row.provenance),
    contributors: JSON.parse(row.contributors),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

export class ArtifactRepository {
  constructor(private readonly db: Database) {}

  insert(artifact: Artifact): void {
    this.db
      .query(
        `INSERT INTO artifacts
         (id, type, title, components, provenance, contributors, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        artifact.id,
        artifact.type,
        artifact.content.title,
        JSON.stringify(artifact.content.components),
        JSON.stringify(artifact.provenance),
        JSON.stringify(artifact.contributors),
        artifact.createdAt,
        artifact.updatedAt,
        artifact.version,
      );
    this.indexFts(artifact);
  }

  update(artifact: Artifact): void {
    this.db
      .query(
        `UPDATE artifacts
         SET title = ?, components = ?, contributors = ?, updated_at = ?, version = ?
         WHERE id = ?`,
      )
      .run(
        artifact.content.title,
        JSON.stringify(artifact.content.components),
        JSON.stringify(artifact.contributors),
        artifact.updatedAt,
        artifact.version,
        artifact.id,
      );
    this.indexFts(artifact);
  }

  get(id: ArtifactId): Artifact | undefined {
    const row = this.db.query<ArtifactRow, [string]>('SELECT * FROM artifacts WHERE id = ?').get(id);
    return row ? rowToArtifact(row) : undefined;
  }

  /** Remove an artifact and everything attached to it. Child rows are deleted
   *  explicitly rather than relying on FK cascade, which depends on the
   *  `foreign_keys` pragma being active on the connection. The FTS row isn't
   *  FK-linked, so it always needs an explicit delete. */
  delete(id: ArtifactId): void {
    this.db.query('DELETE FROM comments WHERE artifact_id = ?').run(id);
    this.db.query('DELETE FROM history_events WHERE artifact_id = ?').run(id);
    this.db.query('DELETE FROM relations WHERE from_id = ? OR to_id = ?').run(id, id);
    this.db.query('DELETE FROM artifacts_fts WHERE artifact_id = ?').run(id);
    this.db.query('DELETE FROM artifacts WHERE id = ?').run(id);
  }

  list(filter?: { type?: string; limit?: number; offset?: number }): Artifact[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter?.type) {
      where.push('type = ?');
      params.push(filter.type);
    }
    const sql =
      'SELECT * FROM artifacts ' +
      (where.length ? `WHERE ${where.join(' AND ')} ` : '') +
      'ORDER BY updated_at DESC ' +
      `LIMIT ${Math.min(filter?.limit ?? 100, 500)} OFFSET ${filter?.offset ?? 0}`;
    return this.db.query<ArtifactRow, typeof params>(sql).all(...params).map(rowToArtifact);
  }

  search(query: string, limit = 25): Artifact[] {
    if (!query.trim()) return [];
    const rows = this.db
      .query<{ artifact_id: string }, [string, number]>(
        // Rank by bm25 with the title column weighted heavily over the body, so
        // a title hit (e.g. "what I'd improve") outranks an artifact that only
        // mentions the term in its content. Columns: artifact_id, title, body.
        `SELECT artifact_id FROM artifacts_fts WHERE artifacts_fts MATCH ?
         ORDER BY bm25(artifacts_fts, 0.0, 10.0, 1.0) LIMIT ?`,
      )
      .all(query, limit);
    return rows
      .map((r) => this.get(r.artifact_id as ArtifactId))
      .filter((a): a is Artifact => Boolean(a));
  }

  private indexFts(artifact: Artifact): void {
    this.db.query('DELETE FROM artifacts_fts WHERE artifact_id = ?').run(artifact.id);
    this.db
      .query('INSERT INTO artifacts_fts (artifact_id, title, body) VALUES (?, ?, ?)')
      .run(artifact.id, artifact.content.title, extractBody(artifact.content));
  }
}

/**
 * Pull text content out of the components stream for full-text indexing.
 * Each component contributes whatever string-valued fields it has; the
 * indexer is intentionally generic so adding a new component type doesn't
 * require touching the storage layer.
 */
function extractBody(content: ArtifactContent): string {
  const out: string[] = [];
  for (const c of content.components) {
    collectStrings(c.data, out);
  }
  return out.join('\n');
}

function collectStrings(value: unknown, into: string[]): void {
  if (typeof value === 'string') {
    into.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, into);
    return;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectStrings(v, into);
  }
}
