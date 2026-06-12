// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountDeskPiece } from './desk-piece';

/**
 * happy-dom has no WebGL, which is exactly the fallback path the module must
 * survive. For the lifecycle tests (loop arming, dispose) we substitute a
 * minimal fake WebGL2 context that records calls — no pixels, just contract.
 */
function fakeGL() {
  const loseContext = vi.fn();
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    BLEND: 5,
    COLOR_BUFFER_BIT: 6,
    TRIANGLES: 7,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),
    getUniformLocation: vi.fn(() => ({})),
    disable: vi.fn(),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform3f: vi.fn(),
    drawArrays: vi.fn(),
    getExtension: vi.fn((name: string) => (name === 'WEBGL_lose_context' ? { loseContext } : null)),
  };
  return { gl, loseContext };
}

function stubMatchMedia(reducedMotion: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: reducedMotion,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
}

function mountWithFakeGL(reducedMotion: boolean) {
  const { gl, loseContext } = fakeGL();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
    type === 'webgl2' ? gl : null) as never);
  stubMatchMedia(reducedMotion);
  // rAF must not fire on its own — the tests count frames deterministically.
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
  const caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  return { handle: mountDeskPiece(canvas), gl, loseContext, raf, caf };
}

/**
 * Like `mountWithFakeGL`, but hands back the bare canvas + GL *before* mount so
 * a test can install constructor/listener spies first, and exposes the captured
 * IntersectionObserver callback so visibility can be driven by hand (happy-dom
 * has real observers but never fires their callbacks on its own).
 */
function fakeGLEnv(reducedMotion: boolean) {
  const { gl, loseContext } = fakeGL();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
    type === 'webgl2' ? gl : null) as never);
  stubMatchMedia(reducedMotion);
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);

  // Wrap the IntersectionObserver constructor to grab the callback the module
  // registers, while still returning a real observer (so observe/disconnect and
  // the prototype.disconnect spy all stay live).
  type IOCb = ConstructorParameters<typeof IntersectionObserver>[0];
  const RealIO = window.IntersectionObserver;
  let ioCallback: IOCb | null = null;
  vi.spyOn(window, 'IntersectionObserver').mockImplementation(
    (cb: IOCb, init?: IntersectionObserverInit) => {
      ioCallback = cb;
      return new RealIO(cb, init);
    },
  );

  return {
    gl,
    loseContext,
    canvas,
    /** Drive the IO callback as if the canvas crossed the viewport edge. */
    setIntersecting(isIntersecting: boolean) {
      const entry = { isIntersecting } as IntersectionObserverEntry;
      ioCallback?.([entry], {} as IntersectionObserver);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('mountDeskPiece — fallback', () => {
  it('returns null when WebGL2 is unavailable (happy-dom), without throwing', () => {
    const canvas = document.createElement('canvas');
    expect(mountDeskPiece(canvas)).toBeNull();
  });
});

describe('mountDeskPiece — reduced motion', () => {
  it('renders exactly one static frame and never arms the rAF loop', () => {
    const { handle, gl, raf } = mountWithFakeGL(true);
    expect(handle).not.toBeNull();
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    expect(raf).not.toHaveBeenCalled();
    handle?.dispose();
  });

  it('repaints once on a theme change while the loop is idle', () => {
    const { handle, gl, raf } = mountWithFakeGL(true);
    handle?.setTheme('dark');
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(raf).not.toHaveBeenCalled();
    handle?.dispose();
  });
});

describe('mountDeskPiece — lifecycle', () => {
  it('arms the rAF loop when motion is allowed', () => {
    const { handle, gl, raf } = mountWithFakeGL(false);
    expect(handle).not.toBeNull();
    expect(raf).toHaveBeenCalledTimes(1);
    // The mount paint happens immediately; loop frames wait on the (mocked) rAF.
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    handle?.dispose();
  });

  it('dispose cancels the loop, loses the context, and is idempotent', () => {
    const { handle, gl, loseContext, caf } = mountWithFakeGL(false);
    handle?.dispose();
    expect(caf).toHaveBeenCalledWith(42);
    expect(loseContext).toHaveBeenCalledTimes(1);
    const draws = gl.drawArrays.mock.calls.length;
    // Second dispose: no throw, no double-release, and setTheme is inert.
    handle?.dispose();
    expect(loseContext).toHaveBeenCalledTimes(1);
    handle?.setTheme('dark');
    expect(gl.drawArrays).toHaveBeenCalledTimes(draws);
  });
});

describe('mountDeskPiece — listener & observer cleanup', () => {
  it('removes every listener it added and disconnects both observers on dispose', () => {
    // happy-dom ships real observers; spy straight on the shared prototypes so
    // the instances the module news up route disconnect() through here. This
    // must happen before fakeGLEnv wraps the IO constructor — the wrapper still
    // returns real observers, so the real prototype is the one that matters.
    const ioDisconnect = vi.spyOn(IntersectionObserver.prototype, 'disconnect');
    const roDisconnect = vi.spyOn(ResizeObserver.prototype, 'disconnect');

    const env = fakeGLEnv(false);
    const { canvas } = env;

    // Record (type, handler) pairs added vs. removed on both targets the module
    // touches: the canvas (pointer) and the document (visibilitychange).
    const added: Array<[EventTarget, string, EventListenerOrEventListenerObject | null]> = [];
    const removed: Array<[EventTarget, string, EventListenerOrEventListenerObject | null]> = [];
    for (const target of [canvas, document] as EventTarget[]) {
      vi.spyOn(target, 'addEventListener').mockImplementation(((
        type: string,
        fn: EventListenerOrEventListenerObject | null,
      ) => {
        added.push([target, type, fn]);
      }) as never);
      vi.spyOn(target, 'removeEventListener').mockImplementation(((
        type: string,
        fn: EventListenerOrEventListenerObject | null,
      ) => {
        removed.push([target, type, fn]);
      }) as never);
    }

    const handle = mountDeskPiece(canvas);
    expect(handle).not.toBeNull();
    // The mount wired up at least the pointer + visibility listeners.
    expect(added.length).toBeGreaterThan(0);

    handle?.dispose();

    // Every listener registered at mount is torn down with the same handler.
    for (const [target, type, fn] of added) {
      expect(removed).toContainEqual([target, type, fn]);
    }
    expect(ioDisconnect).toHaveBeenCalledTimes(1);
    expect(roDisconnect).toHaveBeenCalledTimes(1);
    // The WEBGL_lose_context release ran exactly once.
    expect(env.loseContext).toHaveBeenCalledTimes(1);

    // dispose() is idempotent: a second call neither throws nor re-tears-down.
    expect(() => handle?.dispose()).not.toThrow();
    expect(ioDisconnect).toHaveBeenCalledTimes(1);
    expect(roDisconnect).toHaveBeenCalledTimes(1);
    expect(env.loseContext).toHaveBeenCalledTimes(1);
  });
});

describe('mountDeskPiece — visibility gating', () => {
  it('parks the rAF loop while off-screen and re-arms it on re-entry', () => {
    const env = fakeGLEnv(false);
    const { canvas } = env;

    // Fake rAF/cAF that count scheduling without ever firing a frame, so the
    // assertions see only what `sync()` arms — not runaway self-rescheduling.
    let nextId = 1;
    const raf = vi.fn(() => nextId++);
    const caf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', caf);

    const handle = mountDeskPiece(canvas);
    expect(handle).not.toBeNull();
    // Motion is allowed and the canvas is assumed visible → one armed frame.
    expect(raf).toHaveBeenCalledTimes(1);

    // Off-screen: the loop is cancelled and no fresh frame is scheduled.
    env.setIntersecting(false);
    expect(caf).toHaveBeenCalledTimes(1);
    expect(raf).toHaveBeenCalledTimes(1);

    // Still hidden: repeated not-intersecting reports must not re-arm.
    env.setIntersecting(false);
    expect(raf).toHaveBeenCalledTimes(1);

    // Back on-screen: the loop re-arms with exactly one new frame.
    env.setIntersecting(true);
    expect(raf).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
    handle?.dispose();
  });

  it('parks the loop when the tab is hidden and re-arms when it returns', () => {
    const env = fakeGLEnv(false);
    const { canvas } = env;

    let nextId = 1;
    const raf = vi.fn(() => nextId++);
    const caf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', caf);

    const handle = mountDeskPiece(canvas);
    expect(raf).toHaveBeenCalledTimes(1);

    // Tab hidden: the module reads document.visibilityState on the event, so
    // override it before dispatching visibilitychange.
    let hidden = false;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (hidden ? 'hidden' : 'visible'),
    });

    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(caf).toHaveBeenCalledTimes(1);
    expect(raf).toHaveBeenCalledTimes(1);

    // Tab visible again: the loop re-arms.
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(raf).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
    handle?.dispose();
    // restoreAllMocks can't undo defineProperty — drop the override by hand so
    // the shared document goes back to its native visibilityState.
    // biome-ignore lint/performance/noDelete: removing a defineProperty override in test teardown
    delete (document as unknown as Record<string, unknown>).visibilityState;
  });
});
