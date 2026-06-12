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
