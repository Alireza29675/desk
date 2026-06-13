/**
 * The background-server lifecycle commands: serve / start / stop / status /
 * restart. `serve` is the raw long-lived process (and the detached child);
 * `start` is the idempotent, singleton-safe supervisor the onboarding hook
 * calls. The PORT bind is the mutex, so concurrent `start`s can never duplicate
 * the server — the loser hits EADDRINUSE and exits 0.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SERVER_VERSION, startServer } from '@desk/server';
import { openInBrowser } from '../lib/browser';
import {
  type StopResult,
  baseUrl,
  checkHealth,
  logfilePath,
  readPidfile,
  removePidfile,
  spawnDetachedServer,
  stopRunning,
  waitForHealth,
  writePidfile,
} from '../lib/lifecycle';

export interface StartOptions {
  open?: boolean;
  foreground?: boolean;
}

/**
 * How long `start` waits for a freshly-spawned background server to report
 * healthy. Generous by default because a cold first run does migrations + WAL
 * setup; override via DESK_START_TIMEOUT_MS for slow disks / loaded CI.
 */
const START_TIMEOUT_MS = Number(process.env.DESK_START_TIMEOUT_MS ?? 10000);

/**
 * Run the server in the foreground with no browser. This is the raw service
 * process and the detached child spawned by `start`. The winning serve writes
 * the pidfile once it has bound the port; a losing racer hits EADDRINUSE before
 * writing, so it never leaves a stale pidfile.
 */
export async function runServe(): Promise<void> {
  try {
    const running = await startServer();
    const { home, host, port } = running.config;
    const url = baseUrl(host, port);

    writePidfile(home, {
      pid: process.pid,
      port,
      version: SERVER_VERSION,
      startedAt: new Date().toISOString(),
    });

    // Re-entrancy guard: a second signal (SIGTERM arriving during a SIGINT
    // shutdown) must not double-run stop()/db.close(). First signal wins.
    let shuttingDown = false;
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      await running.stop();
      removePidfile(home);
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    console.error(`desk serving on ${url} (pid ${process.pid})`);
    // No explicit await/loop keeps this process alive — the live Bun.serve
    // listener (inside startServer's return) holds the event loop open. Do not
    // add an early return or await that could drop that handle, or the daemon
    // would exit right after writing a pidfile that then points at a dead pid.
  } catch (e) {
    if ((e as { code?: string }).code === 'EADDRINUSE') {
      const { host, port } = portFromEnv();
      console.error(`[desk] another desk is already on ${baseUrl(host, port)}; exiting.`);
      process.exit(0);
    }
    throw e;
  }
}

/**
 * Idempotent supervisor. With `--foreground` it runs the server inline (dev,
 * with browser). Otherwise it ensures a single background desk is up: adopt a
 * healthy one, refuse a stranger on the port, or spawn a detached `serve` and
 * wait for it to bind.
 */
export async function runStart(opts: StartOptions = {}): Promise<void> {
  const { home, host, port } = portFromEnv();
  const base = baseUrl(host, port);

  if (opts.foreground) {
    const running = await startServer();
    const url = baseUrl(running.config.host, running.config.port);
    console.log(banner(url));
    void openInBrowser(url);
    let shuttingDown = false;
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log('\nShutting down…');
      await running.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  const health = await checkHealth(base);

  if (health.running && health.isDesk) {
    if (health.version && health.version !== SERVER_VERSION) {
      console.error(
        `desk ${health.version} is running; this CLI is ${SERVER_VERSION} — run \`desk restart\` to upgrade.`,
      );
    }
    console.log(`desk already running at ${base}`);
    if (opts.open) void openInBrowser(base);
    process.exit(0);
  }

  if (health.running && !health.isDesk) {
    console.error(`port ${port} is held by a non-desk process — set DESK_PORT or free it.`);
    process.exit(1);
  }

  const childPid = spawnDetachedServer(home, process.env);
  if (childPid <= 0) {
    console.error('desk failed to spawn the server process.');
    process.exit(1);
  }
  const ok = await waitForHealth(base, START_TIMEOUT_MS);
  if (!ok) {
    // The child we spawned didn't report healthy in time. Re-probe once: it may
    // be a slow first-run (migrations/WAL) that bound a beat late, or a healthy
    // desk a concurrent `start` won the race to spawn — either way, adopt it.
    const late = await checkHealth(base);
    if (late.running && late.isDesk) {
      console.log(`desk started at ${base}`);
      if (opts.open) void openInBrowser(base);
      process.exit(0);
    }
    // No desk came up → our child genuinely failed or is wedged. Reap the child
    // WE just spawned (its pid, freshly ours — no orphan left behind a "failed"
    // message) before exiting non-zero. Guard the signal: if it already exited,
    // isAlive is false and we skip it.
    try {
      process.kill(childPid, 'SIGTERM');
    } catch {
      // already gone
    }
    console.error(
      `desk failed to start within ${Math.round(START_TIMEOUT_MS / 1000)}s — check ${logfilePath(home)}`,
    );
    process.exit(1);
  }
  console.log(`desk started at ${base}`);
  if (opts.open) void openInBrowser(base);
  process.exit(0);
}

/** Stop a running background desk. Returns the outcome for `restart` to branch on. */
export async function runStop(): Promise<StopResult> {
  const { home, host, port } = portFromEnv();
  const base = baseUrl(host, port);
  const result = await stopRunning(home, base);
  switch (result) {
    case 'stopped':
      console.log('desk stopped.');
      break;
    case 'not-running':
      console.log('desk is not running.');
      break;
    case 'no-pidfile':
      console.log(
        `a desk is running at ${base} but wasn't started by \`desk start\` (no pidfile) — stop it where you launched it.`,
      );
      break;
  }
  return result;
}

/** Report whether desk is running, where, which version, and its pid. */
export async function runStatus(): Promise<void> {
  const { home, host, port } = portFromEnv();
  const base = baseUrl(host, port);
  const health = await checkHealth(base);
  const pidInfo = readPidfile(home);

  if (health.running && health.isDesk) {
    console.log('desk: running');
    console.log(`  url      ${base}`);
    console.log(`  version  ${health.version ?? 'unknown'}`);
    console.log(`  pid      ${pidInfo ? pidInfo.pid : 'unknown (no pidfile)'}`);
    console.log(`  home     ${home}`);
  } else if (health.running && !health.isDesk) {
    console.log('desk: not running');
    console.log(`  port ${port} is held by a non-desk process — set DESK_PORT or free it.`);
    console.log(`  home     ${home}`);
  } else {
    console.log('desk: stopped');
    console.log(`  url      ${base}`);
    console.log(`  home     ${home}`);
  }
}

/** Stop (if anything is running) then start. */
export async function runRestart(opts: StartOptions = {}): Promise<void> {
  const stopped = await runStop();
  if (stopped === 'no-pidfile') {
    // A desk we didn't launch holds the port; we won't signal it, so we can't
    // restart it. Be honest rather than silently adopting it as a "restart".
    console.error(
      'cannot restart a desk launched by hand — stop it where you launched it, then run `desk start`.',
    );
    process.exit(1);
  }
  // Let a just-released port settle before re-spawning, so the fresh serve child
  // doesn't lose a race against the still-closing listener socket (which would
  // EADDRINUSE-exit and surface as a spurious "failed to start").
  if (stopped === 'stopped') await new Promise((resolve) => setTimeout(resolve, 300));
  await runStart(opts);
}

function portFromEnv(): { home: string; host: string; port: number } {
  return {
    home: process.env.DESK_HOME ?? join(homedir(), '.desk'),
    host: process.env.DESK_HOST ?? '127.0.0.1',
    port: Number(process.env.DESK_PORT ?? 7878),
  };
}

function banner(url: string): string {
  return [
    '',
    `  Desk · v${SERVER_VERSION}`,
    `  Viewer    ${url}`,
    `  MCP       ${url}/mcp`,
    `  WebSocket ${url.replace(/^http/, 'ws')}/ws`,
    '',
    '  Press ⌘C to quit.',
    '',
  ].join('\n');
}
