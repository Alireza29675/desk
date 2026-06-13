import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the lib layer so we drive runStart's decisions directly: is a desk
// already up, does the spawned child come healthy, does it time out. The real
// port/spawn behaviour is covered by lib/lifecycle.test.ts + the smoke script.
vi.mock('../lib/lifecycle', () => ({
  baseUrl: (host: string, port: number) => `http://${host}:${port}`,
  checkHealth: vi.fn(),
  waitForHealth: vi.fn(),
  spawnDetachedServer: vi.fn(),
  logfilePath: () => '/tmp/desk-test/desk.log',
  readPidfile: vi.fn(),
  removePidfile: vi.fn(),
  writePidfile: vi.fn(),
  stopRunning: vi.fn(),
}));
vi.mock('../lib/browser', () => ({ openInBrowser: vi.fn(() => Promise.resolve()) }));
vi.mock('@desk/server', () => ({ SERVER_VERSION: '0.1.0', startServer: vi.fn() }));

import { checkHealth, spawnDetachedServer, waitForHealth } from '../lib/lifecycle';
import { runStart } from './lifecycle';

/** process.exit is mocked to throw this so we can assert the exit code. */
class ExitError extends Error {
  constructor(public code: number) {
    super(`exit ${code}`);
  }
}

describe('runStart (background supervisor)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ExitError(code ?? 0);
    }) as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses a stranger on the port (exit 1, never spawns)', async () => {
    vi.mocked(checkHealth).mockResolvedValueOnce({ running: true, isDesk: false });
    await expect(runStart({})).rejects.toMatchObject({ code: 1 });
    expect(spawnDetachedServer).not.toHaveBeenCalled();
  });

  it('adopts a healthy desk already running (exit 0, never spawns)', async () => {
    vi.mocked(checkHealth).mockResolvedValueOnce({
      running: true,
      isDesk: true,
      version: '0.1.0',
    });
    await expect(runStart({})).rejects.toMatchObject({ code: 0 });
    expect(spawnDetachedServer).not.toHaveBeenCalled();
  });

  it('warns on a version mismatch but still adopts (exit 0)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(checkHealth).mockResolvedValueOnce({
      running: true,
      isDesk: true,
      version: '0.0.9',
    });
    await expect(runStart({})).rejects.toMatchObject({ code: 0 });
    expect(err).toHaveBeenCalledWith(expect.stringContaining('desk restart'));
  });

  it('spawns when nothing is running and the child comes healthy (exit 0)', async () => {
    vi.mocked(checkHealth).mockResolvedValueOnce({ running: false, isDesk: false });
    vi.mocked(spawnDetachedServer).mockReturnValue(4242);
    vi.mocked(waitForHealth).mockResolvedValue(true);
    await expect(runStart({})).rejects.toMatchObject({ code: 0 });
    expect(spawnDetachedServer).toHaveBeenCalledTimes(1);
  });

  it('hard-fails immediately if the spawn returns no pid (exit 1, no wait)', async () => {
    vi.mocked(checkHealth).mockResolvedValueOnce({ running: false, isDesk: false });
    vi.mocked(spawnDetachedServer).mockReturnValue(-1);
    await expect(runStart({})).rejects.toMatchObject({ code: 1 });
    expect(waitForHealth).not.toHaveBeenCalled();
  });

  // BLOCKER-1 guard: on a slow start the child may bind just after the timeout.
  it('adopts a late-binding child on timeout instead of orphaning it (exit 0, no kill)', async () => {
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true as never);
    vi.mocked(checkHealth)
      .mockResolvedValueOnce({ running: false, isDesk: false }) // initial probe: nothing
      .mockResolvedValueOnce({ running: true, isDesk: true, version: '0.1.0' }); // re-probe: it came up
    vi.mocked(spawnDetachedServer).mockReturnValue(4242);
    vi.mocked(waitForHealth).mockResolvedValue(false);
    await expect(runStart({})).rejects.toMatchObject({ code: 0 });
    expect(kill).not.toHaveBeenCalledWith(4242, 'SIGTERM');
  });

  // BLOCKER-1 guard: on a genuine failure the spawned child is reaped, not left.
  it('reaps the spawned child on timeout when no desk came up (exit 1, SIGTERM the child)', async () => {
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true as never);
    vi.mocked(checkHealth)
      .mockResolvedValueOnce({ running: false, isDesk: false }) // initial probe: nothing
      .mockResolvedValueOnce({ running: false, isDesk: false }); // re-probe: still nothing
    vi.mocked(spawnDetachedServer).mockReturnValue(4242);
    vi.mocked(waitForHealth).mockResolvedValue(false);
    await expect(runStart({})).rejects.toMatchObject({ code: 1 });
    expect(kill).toHaveBeenCalledWith(4242, 'SIGTERM');
  });
});
