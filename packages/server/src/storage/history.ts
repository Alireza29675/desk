import type { Database } from 'bun:sqlite';
import type { ArtifactId, HistoryEvent, HistoryEventId } from '@desk/types';

interface HistoryRow {
  id: string;
  artifact_id: string;
  kind: string;
  version: number;
  author: string;
  reason: string | null;
  payload: string;
  created_at: string;
}

function rowToEvent(row: HistoryRow): HistoryEvent {
  const author = JSON.parse(row.author);
  const payload = JSON.parse(row.payload);
  const base = {
    id: row.id as HistoryEventId,
    artifactId: row.artifact_id as ArtifactId,
    version: row.version,
    author,
    createdAt: row.created_at,
    ...(row.reason ? { reason: row.reason } : {}),
  };
  switch (row.kind) {
    case 'created':
    case 'edited':
      return { ...base, kind: row.kind, snapshot: payload };
    case 'commented':
      return { ...base, kind: 'commented', comment: payload };
    case 'relation_added':
      return { ...base, kind: 'relation_added', relation: payload };
    case 'relation_removed':
      return { ...base, kind: 'relation_removed', relation: payload };
    default:
      throw new Error(`Unknown history event kind in DB: ${row.kind}`);
  }
}

export class HistoryRepository {
  constructor(private readonly db: Database) {}

  append(event: HistoryEvent): void {
    const payload =
      event.kind === 'created' || event.kind === 'edited'
        ? event.snapshot
        : event.kind === 'commented'
          ? event.comment
          : event.relation;

    this.db
      .query(
        `INSERT INTO history_events (id, artifact_id, kind, version, author, reason, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.artifactId,
        event.kind,
        event.version,
        JSON.stringify(event.author),
        event.reason ?? null,
        JSON.stringify(payload),
        event.createdAt,
      );
  }

  list(
    artifactId: ArtifactId,
    range?: { from?: number; to?: number; limit?: number },
  ): HistoryEvent[] {
    const where: string[] = ['artifact_id = ?'];
    const params: (string | number)[] = [artifactId];
    if (range?.from !== undefined) {
      where.push('version >= ?');
      params.push(range.from);
    }
    if (range?.to !== undefined) {
      where.push('version <= ?');
      params.push(range.to);
    }
    const sql = `SELECT * FROM history_events WHERE ${where.join(' AND ')} ORDER BY version ASC, created_at ASC LIMIT ${Math.min(range?.limit ?? 500, 5000)}`;
    return this.db
      .query<HistoryRow, typeof params>(sql)
      .all(...params)
      .map(rowToEvent);
  }

  /** Find the most recent committed snapshot at or before `version`. */
  snapshotAt(artifactId: ArtifactId, version: number): HistoryEvent | undefined {
    const row = this.db
      .query<HistoryRow, [string, number]>(
        `SELECT * FROM history_events
         WHERE artifact_id = ? AND version <= ? AND kind IN ('created','edited')
         ORDER BY version DESC LIMIT 1`,
      )
      .get(artifactId, version);
    return row ? rowToEvent(row) : undefined;
  }
}
