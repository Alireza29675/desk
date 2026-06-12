import { describe, expect, it, vi } from 'vitest';
import {
  FRAME_MAX_HEIGHT,
  FRAME_MIN_HEIGHT,
  FrameSupervisor,
  buildFrameSrcdoc,
  clampFrameHeight,
  isHarnessMessage,
} from './custom-frame';

function makeSupervisor(opts: { bootDeadlineMs?: number; staleMs?: number } = {}) {
  let t = 0;
  const callbacks = { onReady: vi.fn(), onResize: vi.fn(), onDead: vi.fn() };
  const supervisor = new FrameSupervisor(callbacks, {
    bootDeadlineMs: opts.bootDeadlineMs ?? 3000,
    staleMs: opts.staleMs ?? 3000,
    now: () => t,
  });
  return {
    supervisor,
    callbacks,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

const FRAME = { tag: 'frame-window' };

describe('FrameSupervisor — the untrusted frame is watched, not trusted', () => {
  it('declares boot-timeout when no FIRST heartbeat arrives in the deadline', () => {
    // A synchronous infinite loop at mount never starts the heartbeat —
    // stalled-detection alone would miss it (the Executor rider).
    const { supervisor, callbacks, advance } = makeSupervisor();
    supervisor.start();
    advance(2999);
    supervisor.check();
    expect(callbacks.onDead).not.toHaveBeenCalled();
    advance(2);
    supervisor.check();
    expect(callbacks.onDead).toHaveBeenCalledWith('boot-timeout');
    expect(callbacks.onDead).toHaveBeenCalledTimes(1);
  });

  it('stays alive while heartbeats flow, declares stalled when they stop', () => {
    const { supervisor, callbacks, advance } = makeSupervisor();
    supervisor.start();
    for (let i = 0; i < 10; i++) {
      advance(1000);
      supervisor.handleMessage({ kind: 'heartbeat' }, FRAME, FRAME);
      supervisor.check();
    }
    expect(callbacks.onDead).not.toHaveBeenCalled();
    advance(3001);
    supervisor.check();
    expect(callbacks.onDead).toHaveBeenCalledWith('stalled');
  });

  it('fires onDead at most once, and never after stop()', () => {
    const { supervisor, callbacks, advance } = makeSupervisor();
    supervisor.start();
    advance(4000);
    supervisor.check();
    supervisor.check();
    expect(callbacks.onDead).toHaveBeenCalledTimes(1);
    supervisor.stop();
    advance(10_000);
    supervisor.check();
    expect(callbacks.onDead).toHaveBeenCalledTimes(1);
  });

  it('ignores messages whose source is not the frame window — identity, not shape', () => {
    const { supervisor, callbacks, advance } = makeSupervisor();
    supervisor.start();
    const attacker = { tag: 'other-window' };
    supervisor.handleMessage({ kind: 'heartbeat' }, attacker, FRAME);
    supervisor.handleMessage({ kind: 'ready' }, attacker, FRAME);
    supervisor.handleMessage({ kind: 'heartbeat' }, null, FRAME);
    advance(3001);
    supervisor.check();
    // The forged heartbeats did not keep it alive, and ready never fired.
    expect(callbacks.onDead).toHaveBeenCalledWith('boot-timeout');
    expect(callbacks.onReady).not.toHaveBeenCalled();
  });

  it('ignores malformed shapes from the right source', () => {
    const { supervisor, callbacks } = makeSupervisor();
    supervisor.start();
    supervisor.handleMessage({ kind: 'resize' }, FRAME, FRAME); // no height
    supervisor.handleMessage({ kind: 'resize', height: 'tall' }, FRAME, FRAME);
    supervisor.handleMessage('heartbeat', FRAME, FRAME);
    supervisor.handleMessage(null, FRAME, FRAME);
    expect(callbacks.onResize).not.toHaveBeenCalled();
  });

  it('routes ready and clamped resize', () => {
    const { supervisor, callbacks } = makeSupervisor();
    supervisor.start();
    supervisor.handleMessage({ kind: 'ready' }, FRAME, FRAME);
    expect(callbacks.onReady).toHaveBeenCalledTimes(1);
    supervisor.handleMessage({ kind: 'resize', height: 5000 }, FRAME, FRAME);
    expect(callbacks.onResize).toHaveBeenCalledWith(FRAME_MAX_HEIGHT);
    supervisor.handleMessage({ kind: 'resize', height: 4 }, FRAME, FRAME);
    expect(callbacks.onResize).toHaveBeenCalledWith(FRAME_MIN_HEIGHT);
  });
});

describe('buildFrameSrcdoc — the containment document', () => {
  const doc = buildFrameSrcdoc('http://127.0.0.1:7878', 'dark');

  it('locks the CSP: no network, scripts only from our origin plus eval', () => {
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("script-src http://127.0.0.1:7878 'unsafe-eval'");
    expect(doc).not.toContain('connect-src');
  });

  it('loads the harness from the origin and seeds the theme', () => {
    expect(doc).toContain('src="http://127.0.0.1:7878/custom-harness.js"');
    expect(doc).toContain('data-theme="dark"');
  });
});

describe('helpers', () => {
  it('isHarnessMessage accepts exactly the protocol', () => {
    expect(isHarnessMessage({ kind: 'ready' })).toBe(true);
    expect(isHarnessMessage({ kind: 'heartbeat' })).toBe(true);
    expect(isHarnessMessage({ kind: 'resize', height: 100 })).toBe(true);
    expect(isHarnessMessage({ kind: 'resize', height: Number.NaN })).toBe(false);
    expect(isHarnessMessage({ kind: 'mount' })).toBe(false);
    expect(isHarnessMessage(undefined)).toBe(false);
  });

  it('clampFrameHeight bounds and rounds', () => {
    expect(clampFrameHeight(0)).toBe(FRAME_MIN_HEIGHT);
    expect(clampFrameHeight(99_999)).toBe(FRAME_MAX_HEIGHT);
    expect(clampFrameHeight(300.6)).toBe(301);
  });
});
