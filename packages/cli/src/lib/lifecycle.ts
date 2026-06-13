/**
 * Background-server lifecycle helpers for the Desk CLI.
 *
 * The PORT is the real mutex: `Bun.serve` on a bound port throws EADDRINUSE
 * synchronously, so at most one desk server can ever hold it. Everything here
 * — health probing, the pidfile, detached spawn, graceful stop — is bookkeeping
 * and UX around that guarantee, never the safety mechanism. These are kept as
 * small, side-effect-light functions so the parse/identity/decision logic is
 * unit-testable without standing up a real server.
 */
import { spawn } from 'node:child_process';
import { openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface HealthResult {
  /** Something answered the port (or held it open). */
  running: boolean;
  /** That something identified itself as a desk server via /health. */
  isDesk: boolean;
  /** The running server's reported version, when it is a desk. */
  version?: string;
  /** The running desk's own process id, when it reports one via /health. */
  pid?: number;
}

export interface PidInfo {
  pid: number;
  port: number;
  version: string;
  startedAt: string;
}

/** `http://host:port` for the configured bind address. */
export function baseUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}

/**
 * Probe `<base>/health` with a short timeout and classify the holder of the
 * port. Connection refused or timeout → nothing there (safe to spawn). A 200
 * with JSON `server === 'desk'` → a desk we can adopt. A 200 that is not desk,
 * or non-JSON, → a stranger holds the port (never spawn, never signal).
 */
export async function checkHealth(base: string, timeoutMs = 500): Promise<HealthResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/health`, { signal: controller.signal });
    if (!res.ok) return { running: true, isDesk: false };
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      // 200 but not JSON — someone else is on the port.
      return { running: true, isDesk: false };
    }
    if (body && typeof body === 'object' && (body as { server?: unknown }).server === 'desk') {
      const version = (body as { version?: unknown }).version;
      const pid = (body as { pid?: unknown }).pid;
      return {
        running: true,
        isDesk: true,
        version: typeof version === 'string' ? version : undefined,
        pid: typeof pid === 'number' ? pid : undefined,
      };
    }
    return { running: true, isDesk: false };
  } catch {
    // Connection refused, DNS failure, or our own abort timeout — nothing there.
    return { running: false, isDesk: false };
  } finally {
    clearTimeout(timer);
  }
}

/** `<home>/desk.pid` — JSON bookkeeping for `stop`/`status`. */
export function pidfilePath(home: string): string {
  return join(home, 'desk.pid');
}

/** `<home>/desk.log` — append target for the detached server's stdout/stderr. */
export function logfilePath(home: string): string {
  return join(home, 'desk.log');
}

/** Read the pidfile. Missing or corrupt JSON yields null — never throws. */
export function readPidfile(home: string): PidInfo | null {
  let raw: string;
  try {
    raw = readFileSync(pidfilePath(home), 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PidInfo>;
    if (
      typeof parsed.pid === 'number' &&
      typeof parsed.port === 'number' &&
      typeof parsed.version === 'string' &&
      typeof parsed.startedAt === 'string'
    ) {
      return {
        pid: parsed.pid,
        port: parsed.port,
        version: parsed.version,
        startedAt: parsed.startedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Write the pidfile. Called by the winning `serve` once it has bound the port. */
export function writePidfile(home: string, info: PidInfo): void {
  writeFileSync(pidfilePath(home), JSON.stringify(info));
}

/** Remove the pidfile, ignoring a missing file. */
export function removePidfile(home: string): void {
  rmSync(pidfilePath(home), { force: true });
}

/** Poll `checkHealth` until a desk answers or the timeout elapses. */
export async function waitForHealth(base: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await checkHealth(base, 500);
    if (health.running && health.isDesk) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const health = await checkHealth(base, 500);
  return health.running && health.isDesk;
}

/**
 * Spawn a detached `desk serve` that outlives this process (it IS the
 * long-lived service — intended, not an orphan). Re-execs THIS same entry
 * (`process.argv[1]`) under bun so the child is the same desk version and the
 * wiring works from both source-dev and the bundled bin wrapper. The child
 * inherits DESK_PORT/HOST/HOME via env. stdout/stderr append to desk.log so
 * crashes stay diagnosable. Returns the child pid.
 */
export function spawnDetachedServer(home: string, env: NodeJS.ProcessEnv): number {
  const fd = openSync(logfilePath(home), 'a');
  const selfEntry = process.argv[1] ?? '';
  const child = spawn(process.execPath, [selfEntry, 'serve'], {
    detached: true,
    stdio: ['ignore', fd, fd] as const,
    env,
  });
  child.unref();
  return child.pid ?? -1;
}

export type StopResult = 'stopped' | 'not-running' | 'no-pidfile';

/**
 * Stop a running desk. Only ever signals a pid the live `/health` identity
 * confirms is desk — we never kill an unconfirmed or foreign process. If a desk
 * is up but has no pidfile (e.g. launched by hand via `desk serve`), we can't
 * signal it safely → 'no-pidfile'.
 */
export async function stopRunning(home: string, base: string): Promise<StopResult> {
  const pidInfo = readPidfile(home);
  if (!pidInfo) {
    const health = await checkHealth(base);
    if (health.running && health.isDesk) return 'no-pidfile';
    return 'not-running';
  }

  // Confirm the pid is alive AND that the port holder is genuinely desk before
  // signalling anything. A dead pid or a not-desk holder means the pidfile is
  // stale (or the pid was reused) — clean it up, never signal a stranger.
  if (!isAlive(pidInfo.pid)) {
    removePidfile(home);
    return 'not-running';
  }
  const health = await checkHealth(base);
  if (!health.running || !health.isDesk) {
    removePidfile(home);
    return 'not-running';
  }
  // Airtight reuse guard: a desk IS on the port, but confirm it is the exact pid
  // our pidfile names. If /health reports a different pid, our recorded pid was
  // recycled (or the port holder is a different desk we didn't launch) — never
  // signal it. Tolerate a missing pid (older server) by falling through.
  if (typeof health.pid === 'number' && health.pid !== pidInfo.pid) {
    removePidfile(home);
    return 'no-pidfile';
  }

  process.kill(pidInfo.pid, 'SIGTERM');

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const health = await checkHealth(base, 500);
    if (!health.running) {
      removePidfile(home);
      return 'stopped';
    }
  }

  // Graceful shutdown stalled — escalate, then clean up regardless.
  try {
    process.kill(pidInfo.pid, 'SIGKILL');
  } catch {
    // Already gone between the poll and here.
  }
  removePidfile(home);
  return 'stopped';
}

/** Does a process exist at this pid? `kill(pid, 0)` probes without signalling. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
