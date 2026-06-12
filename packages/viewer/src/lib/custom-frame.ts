/**
 * Parent-side runtime for `custom-react` sandbox frames: the message
 * protocol guard, the liveness supervisor, and the srcdoc builder.
 *
 * Trust model: the frame is UNTRUSTED (it runs AI-generated code). Every
 * inbound message is validated by SOURCE (must be the frame's own
 * contentWindow) and SHAPE (the strict union below); anything else is
 * ignored. The full protocol is documented in docs/custom-components.md.
 */

// ── protocol ───────────────────────────────────────────────────────────

/** Frame → parent. The harness sends nothing else. */
export type HarnessMessage =
  | { kind: 'ready' }
  | { kind: 'heartbeat' }
  | { kind: 'resize'; height: number };

/** Parent → frame. */
export type ParentMessage =
  | {
      kind: 'mount';
      code: string;
      props: Record<string, unknown>;
      theme: 'light' | 'dark';
    }
  | { kind: 'theme'; theme: 'light' | 'dark' };

export function isHarnessMessage(data: unknown): data is HarnessMessage {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as { kind?: unknown; height?: unknown };
  if (d.kind === 'ready' || d.kind === 'heartbeat') return true;
  return d.kind === 'resize' && typeof d.height === 'number' && Number.isFinite(d.height);
}

export const FRAME_MIN_HEIGHT = 80;
export const FRAME_MAX_HEIGHT = 1200;

export function clampFrameHeight(height: number): number {
  return Math.min(FRAME_MAX_HEIGHT, Math.max(FRAME_MIN_HEIGHT, Math.round(height)));
}

// ── liveness supervisor ────────────────────────────────────────────────

export interface SupervisorCallbacks {
  /** The harness booted and asked for its mount payload. */
  onReady(): void;
  /** The component asked for a new height (already clamped). */
  onResize(height: number): void;
  /** The frame must be torn down and offered a reload. */
  onDead(reason: 'boot-timeout' | 'stalled'): void;
}

export interface SupervisorOptions {
  /** No FIRST heartbeat within this window of start() = dead. A synchronous
   *  infinite loop at mount never starts the heartbeat, so stalled-detection
   *  alone would miss it. */
  bootDeadlineMs?: number;
  /** Heartbeats arrive every ~1s; silence this long after the first = dead. */
  staleMs?: number;
  now?: () => number;
}

/**
 * Watches one frame's heartbeat. Time is injected and the liveness check is
 * an explicit `check()` so the logic tests without real timers; production
 * drives `check()` from an interval.
 */
export class FrameSupervisor {
  private startedAt: number | null = null;
  private lastBeatAt: number | null = null;
  private dead = false;
  private readonly bootDeadlineMs: number;
  private readonly staleMs: number;
  private readonly now: () => number;

  constructor(
    private readonly callbacks: SupervisorCallbacks,
    opts: SupervisorOptions = {},
  ) {
    this.bootDeadlineMs = opts.bootDeadlineMs ?? 3000;
    this.staleMs = opts.staleMs ?? 3000;
    this.now = opts.now ?? (() => Date.now());
  }

  start(): void {
    this.startedAt = this.now();
    this.lastBeatAt = null;
    this.dead = false;
  }

  /**
   * Feed every window 'message' event through here. `source` must be the
   * frame's contentWindow — caller passes both and we compare identity, so
   * a message from any other window (or a forged shape) is dropped.
   */
  handleMessage(data: unknown, source: unknown, frameWindow: unknown): void {
    if (this.dead || this.startedAt === null) return;
    if (source === null || frameWindow === null || source !== frameWindow) return;
    if (!isHarnessMessage(data)) return;
    switch (data.kind) {
      case 'ready':
        this.callbacks.onReady();
        return;
      case 'heartbeat':
        this.lastBeatAt = this.now();
        return;
      case 'resize':
        this.callbacks.onResize(clampFrameHeight(data.height));
        return;
    }
  }

  /** Liveness check; call periodically. Fires onDead at most once. */
  check(): void {
    if (this.dead || this.startedAt === null) return;
    const t = this.now();
    if (this.lastBeatAt === null) {
      if (t - this.startedAt > this.bootDeadlineMs) {
        this.dead = true;
        this.callbacks.onDead('boot-timeout');
      }
      return;
    }
    if (t - this.lastBeatAt > this.staleMs) {
      this.dead = true;
      this.callbacks.onDead('stalled');
    }
  }

  stop(): void {
    this.startedAt = null;
    this.dead = false;
  }
}

// ── srcdoc ─────────────────────────────────────────────────────────────

/**
 * The frame document. Sandbox (`allow-scripts`, set on the iframe element —
 * never `allow-same-origin`) gives it an opaque origin: no parent DOM and no
 * store access. The network door is closed by the CSP, not CORS (the desk API
 * itself allows `origin: *`): `default-src 'none'` with no connect-src blocks
 * every fetch/XHR/WebSocket. Scripts only from our origin (the harness
 * bundle) plus eval (how the harness instantiates the compiled component),
 * inline styles for the component, data: images.
 */
export function buildFrameSrcdoc(origin: string, theme: 'light' | 'dark'): string {
  const csp = [
    "default-src 'none'",
    `script-src ${origin} 'unsafe-eval'`,
    "style-src 'unsafe-inline'",
    'img-src data:',
  ].join('; ');
  return [
    '<!doctype html>',
    `<html data-theme="${theme}">`,
    '<head>',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '<style>html,body{margin:0;background:transparent;font-family:system-ui,sans-serif}</style>',
    '</head>',
    '<body><div id="root"></div>',
    `<script src="${origin}/custom-harness.js"></script>`,
    '</body></html>',
  ].join('');
}
