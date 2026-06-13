import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type PidInfo,
  checkHealth,
  pidfilePath,
  readPidfile,
  removePidfile,
  stopRunning,
  writePidfile,
} from './lifecycle';

describe('pidfile round-trip', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'desk-lifecycle-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('writes then reads back the same object', () => {
    const info: PidInfo = {
      pid: 4321,
      port: 7878,
      version: '0.1.0',
      startedAt: '2026-06-13T00:00:00.000Z',
    };
    writePidfile(home, info);
    expect(readPidfile(home)).toEqual(info);
  });

  it('returns null for a missing pidfile', () => {
    expect(readPidfile(home)).toBeNull();
  });

  it('returns null for corrupt JSON without throwing', () => {
    writeFileSync(pidfilePath(home), 'not json at all {{{');
    expect(readPidfile(home)).toBeNull();
  });

  it('returns null after remove', () => {
    writePidfile(home, { pid: 1, port: 7878, version: '0.1.0', startedAt: 'now' });
    removePidfile(home);
    expect(readPidfile(home)).toBeNull();
  });

  it('tolerates removing a missing pidfile', () => {
    expect(() => removePidfile(home)).not.toThrow();
  });
});

describe('checkHealth decision table', () => {
  const base = 'http://127.0.0.1:7878';

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports not running when fetch rejects (connection refused)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );
    expect(await checkHealth(base)).toEqual({ running: false, isDesk: false });
  });

  it('reports a healthy desk with its version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ server: 'desk', version: '0.1.0' }),
        } as Response),
      ),
    );
    expect(await checkHealth(base)).toEqual({ running: true, isDesk: true, version: '0.1.0' });
  });

  it('reports a non-desk holder when server is not desk', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ server: 'other' }),
        } as Response),
      ),
    );
    expect(await checkHealth(base)).toEqual({ running: true, isDesk: false });
  });

  it('reports a non-desk holder on a 200 with non-JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.reject(new SyntaxError('Unexpected token')),
        } as Response),
      ),
    );
    expect(await checkHealth(base)).toEqual({ running: true, isDesk: false });
  });

  it('reports the running desk pid when /health echoes one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ server: 'desk', version: '0.1.0', pid: 4321 }),
        } as Response),
      ),
    );
    expect(await checkHealth(base)).toEqual({
      running: true,
      isDesk: true,
      version: '0.1.0',
      pid: 4321,
    });
  });
});

// These are the safety-critical branches: stopRunning must NEVER signal a pid it
// hasn't confirmed is our live desk. fetch (→ checkHealth) and process.kill (the
// liveness probe + the actual signal) are stubbed so we can drive every branch.
describe('stopRunning — never signals a stranger', () => {
  let home: string;
  const base = 'http://127.0.0.1:7878';

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'desk-stop-'));
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  type HealthKind = { kind: 'desk' | 'down' | 'other'; pid?: number };
  /** Drive successive checkHealth() calls; the last entry repeats once exhausted. */
  function stubFetch(seq: HealthKind[]): void {
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        const r = seq[Math.min(i, seq.length - 1)];
        i++;
        if (!r || r.kind === 'down') return Promise.reject(new Error('ECONNREFUSED'));
        if (r.kind === 'other')
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ server: 'other' }),
          } as Response);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ server: 'desk', version: '0.1.0', pid: r.pid }),
        } as Response);
      }),
    );
  }
  /** Spy process.kill: signal 0 = liveness probe; other signals are recorded, not sent. */
  function stubKill(alive: boolean): { signalled: number[] } {
    const signalled: number[] = [];
    vi.spyOn(process, 'kill').mockImplementation(((pid: number, sig?: string | number) => {
      if (sig === 0) {
        if (!alive) throw new Error('ESRCH');
        return true;
      }
      signalled.push(pid);
      return true;
    }) as typeof process.kill);
    return { signalled };
  }
  const writePid = (pid: number) =>
    writePidfile(home, { pid, port: 7878, version: '0.1.0', startedAt: 'now' });

  it('no pidfile + a desk on the port → no-pidfile (can not safely signal it)', async () => {
    stubFetch([{ kind: 'desk', pid: 4321 }]);
    expect(await stopRunning(home, base)).toBe('no-pidfile');
  });

  it('no pidfile + nothing on the port → not-running', async () => {
    stubFetch([{ kind: 'down' }]);
    expect(await stopRunning(home, base)).toBe('not-running');
  });

  it('pidfile pid is dead → not-running, pidfile cleaned, never signalled', async () => {
    writePid(999999);
    const { signalled } = stubKill(false);
    stubFetch([{ kind: 'down' }]);
    expect(await stopRunning(home, base)).toBe('not-running');
    expect(readPidfile(home)).toBeNull();
    expect(signalled).toEqual([]);
  });

  it('pid alive but port holder is not desk → not-running, never signalled', async () => {
    writePid(1111);
    const { signalled } = stubKill(true);
    stubFetch([{ kind: 'other' }]);
    expect(await stopRunning(home, base)).toBe('not-running');
    expect(readPidfile(home)).toBeNull();
    expect(signalled).toEqual([]);
  });

  it('pid alive + desk up but /health pid differs (reuse) → no-pidfile, never signalled', async () => {
    writePid(1111);
    const { signalled } = stubKill(true);
    stubFetch([{ kind: 'desk', pid: 2222 }]);
    expect(await stopRunning(home, base)).toBe('no-pidfile');
    expect(readPidfile(home)).toBeNull();
    expect(signalled).toEqual([]);
  });

  it('pid alive + desk up + pid matches → SIGTERM that exact pid, then stopped', async () => {
    writePid(1111);
    const { signalled } = stubKill(true);
    // identity probe sees our desk; the post-SIGTERM poll sees it gone.
    stubFetch([{ kind: 'desk', pid: 1111 }, { kind: 'down' }]);
    expect(await stopRunning(home, base)).toBe('stopped');
    expect(signalled).toEqual([1111]);
    expect(readPidfile(home)).toBeNull();
  });
});
