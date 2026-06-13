#!/usr/bin/env bun
/**
 * Integration smoke for the desk background-server lifecycle. NOT part of the
 * unit run — run it by hand against an isolated DESK_HOME and a clear DESK_PORT:
 *
 *   bun packages/cli/scripts/smoke-lifecycle.ts
 *
 * It asserts: start brings the server up + writes a pidfile; a second start is a
 * no-op (same pid); five concurrent `serve`s leave exactly one bound and the
 * losers exit 0; stop takes it down + removes the pidfile. Exits non-zero on the
 * first failure. Each check prints PASS/FAIL.
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHealth, readPidfile } from '../src/lib/lifecycle';

const SMOKE_HOME = '/tmp/desk-lifecycle-smoke/home';
const PORT = '7914';
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;

const cliDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(cliDir, '..', '..');
const entry = join(cliDir, 'src', 'index.ts');

// A no-op `open` stub on PATH so `--open` never actually launches a browser.
const stubBin = '/tmp/desk-lifecycle-smoke/bin';

const env = {
  ...process.env,
  DESK_HOME: SMOKE_HOME,
  DESK_PORT: PORT,
  DESK_HOST: HOST,
  PATH: `${stubBin}:${process.env.PATH ?? ''}`,
};

let failures = 0;

function report(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function setup(): void {
  rmSync('/tmp/desk-lifecycle-smoke', { recursive: true, force: true });
  mkdirSync(SMOKE_HOME, { recursive: true });
  mkdirSync(stubBin, { recursive: true });
  // No-op `open`/`xdg-open` so browser launches are inert during the smoke.
  const stub = '#!/bin/sh\nexit 0\n';
  Bun.write(join(stubBin, 'open'), stub);
  Bun.write(join(stubBin, 'xdg-open'), stub);
  Bun.spawnSync(['chmod', '+x', join(stubBin, 'open'), join(stubBin, 'xdg-open')]);
}

/** Spawn a desk command, returning the live handle (does not await exit). */
function deskSpawn(args: string[]): Bun.Subprocess<'ignore', 'pipe', 'pipe'> {
  return Bun.spawn(['bun', entry, ...args], {
    cwd: repoRoot,
    env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

/** Run a desk command to completion, returning exit code + captured output. */
async function deskRun(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = deskSpawn(args);
  const code = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { code, stdout, stderr };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Count live `serve` processes for THIS entry — the orphan check. */
function serveProcessCount(): number {
  const res = Bun.spawnSync(['pgrep', '-f', `${entry} serve`]);
  const out = new TextDecoder().decode(res.stdout).trim();
  return out ? out.split('\n').filter(Boolean).length : 0;
}

async function main(): Promise<void> {
  setup();

  // ── 1. start → server up, status running, pidfile names the bound pid ──────
  await deskRun(['start']);
  const h1 = await checkHealth(BASE);
  report('start: /health is up', h1.running && h1.isDesk, JSON.stringify(h1));

  const status1 = await deskRun(['status']);
  report('start: `desk status` reports running', status1.stdout.includes('desk: running'));

  const pid1 = readPidfile(SMOKE_HOME);
  report(
    'start: pidfile exists with the bound pid',
    pid1 !== null && pid1.pid > 0 && pid1.port === Number(PORT),
    pid1 ? `pid ${pid1.pid}` : 'no pidfile',
  );

  // ── 2. second start → no-op, same pid, still healthy ───────────────────────
  const second = await deskRun(['start']);
  report(
    'second start: exits cleanly and reports already running',
    second.code === 0 && second.stdout.includes('already running'),
    `code ${second.code}`,
  );
  const pid2 = readPidfile(SMOKE_HOME);
  report(
    'second start: same pid in pidfile (no second server)',
    pid1 !== null && pid2 !== null && pid1.pid === pid2.pid,
    pid2 ? `pid ${pid2.pid}` : 'no pidfile',
  );
  const h2 = await checkHealth(BASE);
  report('second start: /health still ok', h2.running && h2.isDesk);

  // Stop the supervised server so the start-race begins from a clean port.
  await deskRun(['stop']);
  await sleep(300);

  // ── 2.5 start race: 5 concurrent `desk start` (the layer the hook calls) ────
  // Each supervisor spawns a detached `serve`; the port mutex lets exactly one
  // bind and the rest EADDRINUSE-exit. Every `start` must exit 0, leave exactly
  // one healthy desk + one pidfile, and — after stop — NO orphan serve behind.
  const starts = await Promise.all(Array.from({ length: 5 }, () => deskRun(['start'])));
  report(
    'start race: all 5 concurrent `desk start` exited 0',
    starts.every((s) => s.code === 0),
    `exit codes ${starts.map((s) => s.code).join(',')}`,
  );
  const hStartRace = await checkHealth(BASE);
  report('start race: exactly one desk is healthy', hStartRace.running && hStartRace.isDesk);
  const pidStartRace = readPidfile(SMOKE_HOME);
  report(
    'start race: exactly one pidfile owner',
    pidStartRace !== null && pidStartRace.port === Number(PORT),
    pidStartRace ? `pid ${pidStartRace.pid}` : 'no pidfile',
  );

  await deskRun(['stop']);
  await sleep(400);
  const hAfterStartStop = await checkHealth(BASE);
  report('start race: stop took it down cleanly', !hAfterStartStop.running);
  const orphansAfterStartRace = serveProcessCount();
  report(
    'start race: NO orphan serve processes survive the stop',
    orphansAfterStartRace === 0,
    `${orphansAfterStartRace} serve procs`,
  );

  // ── 3. race: fire 5 `serve` concurrently → exactly one bound, losers exit 0 ─
  // Spawn 5 foreground `serve`s at once. The OS grants the port bind to exactly
  // one; the other 4 hit EADDRINUSE, log it, and exit 0. The winner stays alive
  // holding the port (it is the long-lived service) — so we do NOT await all
  // five (the winner never exits); we wait a grace window then classify by exit.
  const racerProcs = Array.from({ length: 5 }, () => deskSpawn(['serve']));
  await sleep(1500);

  const hRace = await checkHealth(BASE);
  report(
    'race: exactly one /health is up after 5 concurrent serves',
    hRace.running && hRace.isDesk,
  );

  const exited = racerProcs.filter((p) => p.exitCode !== null);
  const alive = racerProcs.filter((p) => p.exitCode === null);
  report(
    'race: exactly one server stayed bound (winner alive)',
    alive.length === 1,
    `${alive.length} alive`,
  );

  const loserStderr = await Promise.all(exited.map((p) => new Response(p.stderr).text()));
  const losersLogged = loserStderr.filter((s) => s.includes('another desk is already on'));
  report(
    'race: exactly 4 losers logged EADDRINUSE',
    losersLogged.length === 4,
    `${losersLogged.length} logged`,
  );
  report(
    'race: all losers exited 0 (no crash, no second bind)',
    exited.length === 4 && exited.every((p) => p.exitCode === 0),
    `exit codes ${exited.map((p) => p.exitCode).join(',')}`,
  );

  // The winner bound the port and wrote the pidfile; confirm one owner, then
  // tear it down via stop in step 4. Kill the winner handle's child outright if
  // stop can't reach it (belt-and-suspenders cleanup).
  const pidRace = readPidfile(SMOKE_HOME);
  report(
    'race: pidfile names exactly one owner',
    pidRace !== null && pidRace.port === Number(PORT),
    pidRace ? `pid ${pidRace.pid}` : 'no pidfile',
  );

  // ── 4. stop → /health down, pidfile removed, status stopped ────────────────
  const stop = await deskRun(['stop']);
  await sleep(300);
  const hStop = await checkHealth(BASE);
  report('stop: /health is down', !hStop.running, JSON.stringify(hStop));
  report('stop: pidfile removed', !existsSync(join(SMOKE_HOME, 'desk.pid')));
  report('stop: exited 0', stop.code === 0, `code ${stop.code}`);
  const status2 = await deskRun(['status']);
  report('stop: `desk status` reports stopped', status2.stdout.includes('desk: stopped'));
  const orphansAfterServeRace = serveProcessCount();
  report(
    'stop: NO orphan serve processes survive (the race winner was reaped)',
    orphansAfterServeRace === 0,
    `${orphansAfterServeRace} serve procs`,
  );

  // Belt-and-suspenders: make sure no race winner is left holding the port.
  for (const p of racerProcs) {
    if (p.exitCode === null) p.kill();
  }

  // Cleanup. If the sandbox blocks rm, the path is noted for manual removal.
  try {
    rmSync('/tmp/desk-lifecycle-smoke', { recursive: true, force: true });
  } catch {
    console.log('NOTE: could not remove /tmp/desk-lifecycle-smoke — clean it up manually.');
  }

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
