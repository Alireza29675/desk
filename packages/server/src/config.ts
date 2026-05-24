import { homedir } from 'node:os';
import { join } from 'node:path';

export interface ServerConfig {
  /** Directory where Desk keeps its state (SQLite DB, plugin caches, etc.). */
  home: string;
  /** TCP port for HTTP + WebSocket. They share a port via the runtime's upgrade hook. */
  port: number;
  /** Bind address. Stays on 127.0.0.1 by default — Desk is single-tenant, local-first. */
  host: string;
  /** Auto-commit debounce window in milliseconds. Set to 0 to disable auto-commit. */
  autoCommitMs: number;
  /** Optional override for the SQLite filename inside `home`. */
  dbFilename: string;
}

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const home = overrides.home ?? process.env.DESK_HOME ?? join(homedir(), '.desk');
  const port = overrides.port ?? Number(process.env.DESK_PORT ?? 7878);
  const host = overrides.host ?? process.env.DESK_HOST ?? '127.0.0.1';
  const autoCommitMs = overrides.autoCommitMs ?? Number(process.env.DESK_AUTOCOMMIT_MS ?? 2000);
  const dbFilename = overrides.dbFilename ?? 'desk.db';
  return { home, port, host, autoCommitMs, dbFilename };
}

export const SERVER_VERSION = '0.1.0';
