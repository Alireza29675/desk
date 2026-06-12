import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Schema migrations. Each entry is run inside its own transaction in order;
 * the `user_version` PRAGMA tracks the next-to-run index. Add new entries
 * to the end; never edit historical ones.
 */
const MIGRATIONS: ((db: Database) => void)[] = [
  (db) => {
    db.exec(`
      CREATE TABLE artifacts (
        id           TEXT PRIMARY KEY,
        type         TEXT NOT NULL,
        title        TEXT NOT NULL,
        components   TEXT NOT NULL,
        provenance   TEXT NOT NULL,
        contributors TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        version      INTEGER NOT NULL
      );

      CREATE TABLE history_events (
        id          TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        kind        TEXT NOT NULL,
        version     INTEGER NOT NULL,
        author      TEXT NOT NULL,
        reason      TEXT,
        payload     TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
      );
      CREATE INDEX history_events_by_artifact ON history_events(artifact_id, version);
      CREATE INDEX history_events_by_created ON history_events(created_at);

      CREATE TABLE comments (
        id              TEXT PRIMARY KEY,
        artifact_id     TEXT NOT NULL,
        anchor          TEXT NOT NULL,
        author          TEXT NOT NULL,
        payload         TEXT NOT NULL,
        thread_parent_id TEXT,
        resolved        INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL,
        FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
      );
      CREATE INDEX comments_by_artifact ON comments(artifact_id, created_at);

      CREATE TABLE relations (
        id         TEXT PRIMARY KEY,
        from_id    TEXT NOT NULL,
        to_id      TEXT NOT NULL,
        type       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (from_id, to_id, type),
        FOREIGN KEY (from_id) REFERENCES artifacts(id) ON DELETE CASCADE,
        FOREIGN KEY (to_id)   REFERENCES artifacts(id) ON DELETE CASCADE
      );
      CREATE INDEX relations_outgoing ON relations(from_id);
      CREATE INDEX relations_incoming ON relations(to_id);

      -- Full-text search across artifact text content.
      CREATE VIRTUAL TABLE artifacts_fts USING fts5(
        artifact_id UNINDEXED,
        title,
        body,
        tokenize = 'unicode61 remove_diacritics 2'
      );
    `);
  },
  (db) => {
    // Comment attachments (FB-R2 item 12): bytes live here, metadata rides on
    // the comment envelope. CASCADE keeps cleanup automatic when a comment's
    // artifact is deleted.
    db.exec(`
      CREATE TABLE attachments (
        id          TEXT PRIMARY KEY,
        comment_id  TEXT NOT NULL,
        media_type  TEXT NOT NULL,
        width       INTEGER NOT NULL,
        height      INTEGER NOT NULL,
        bytes       BLOB NOT NULL,
        created_at  TEXT NOT NULL,
        FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
      );
      CREATE INDEX attachments_by_comment ON attachments(comment_id);
    `);
  },
];

export function openDatabase(path: string): Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA synchronous = NORMAL;');
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  const current = Number(
    db.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version ?? 0,
  );
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      MIGRATIONS[i]!(db);
      db.exec(`PRAGMA user_version = ${i + 1}`);
    })();
  }
}
