import type { Database } from 'bun:sqlite';
import type { ArtifactId, Relation, RelationGraph, RelationId, RelationType } from '@desk/types';

interface RelationRow {
  id: string;
  from_id: string;
  to_id: string;
  type: string;
  created_at: string;
}

function rowToRelation(row: RelationRow): Relation {
  return {
    id: row.id as RelationId,
    from: row.from_id as ArtifactId,
    to: row.to_id as ArtifactId,
    type: row.type as RelationType,
    createdAt: row.created_at,
  };
}

export class RelationRepository {
  constructor(private readonly db: Database) {}

  insert(rel: Relation): void {
    this.db
      .query(
        `INSERT INTO relations (id, from_id, to_id, type, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(rel.id, rel.from, rel.to, rel.type, rel.createdAt);
  }

  remove(from: ArtifactId, to: ArtifactId, type: RelationType): Relation | undefined {
    const row = this.db
      .query<RelationRow, [string, string, string]>(
        'SELECT * FROM relations WHERE from_id = ? AND to_id = ? AND type = ?',
      )
      .get(from, to, type);
    if (!row) return undefined;
    this.db.query('DELETE FROM relations WHERE id = ?').run(row.id);
    return rowToRelation(row);
  }

  forArtifact(id: ArtifactId): RelationGraph {
    const outgoing = this.db
      .query<RelationRow, [string]>('SELECT * FROM relations WHERE from_id = ?')
      .all(id)
      .map(rowToRelation);
    const incoming = this.db
      .query<RelationRow, [string]>('SELECT * FROM relations WHERE to_id = ?')
      .all(id)
      .map(rowToRelation);
    return { outgoing, incoming };
  }
}
