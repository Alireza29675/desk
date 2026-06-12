/**
 * The WebGL "desk" hero piece — a raymarched signed-distance-field desk
 * (rounded tabletop on four rounded legs) in the brand coral, floating over a
 * soft contact shadow on a transparent background. Zero dependencies: one
 * WebGL2 context, one fullscreen triangle, everything happens in the fragment
 * shader.
 *
 * Exports:
 * - `mountDeskPiece(canvas, opts)` — live hero. Idle yaw drift + pointer tilt,
 *   rAF only while the canvas is on-screen, the tab is visible, and the user
 *   hasn't asked for reduced motion (then it renders exactly one static frame).
 *   Returns null when WebGL2 isn't available — callers fall back to the flat
 *   gradient mark, never throw.
 * - `renderIconPNG(size)` — same shader with square icon framing, one offscreen
 *   render, resolved as a PNG blob (drives the dev-only `?icon` export page).
 * - Pure helpers (`dampStep`, `themeUniforms`, `shouldAnimate`) exported for
 *   tests — no GL required.
 */

export type DeskTheme = 'light' | 'dark';

export interface DeskThemeUniforms {
  /** Coral albedo, linear-ish 0..1 RGB. */
  coral: [number, number, number];
  /** Key (warm main) light intensity. */
  key: number;
  /** Fill (cool secondary) light intensity. */
  fill: number;
}

export interface DeskPieceOptions {
  theme?: DeskTheme;
}

export interface DeskPieceHandle {
  setTheme(theme: DeskTheme): void;
  dispose(): void;
}

/* ── Pure helpers (unit-tested, no GL) ─────────────────────────────── */

/**
 * Theme → shader uniforms. The coral values mirror `--color-accent` in
 * styles/tokens.css exactly (light #ff5a4d, dark #ff6f61) — if the tokens
 * move, move these with them. Dark mode runs the deeper coral with a dimmer
 * key and fill so the piece sits into the dark surface instead of glowing.
 */
export function themeUniforms(theme: DeskTheme): DeskThemeUniforms {
  return theme === 'dark'
    ? { coral: hexToRgb01('#ff6f61'), key: 0.8, fill: 0.35 }
    : { coral: hexToRgb01('#ff5a4d'), key: 1.0, fill: 0.55 };
}

function hexToRgb01(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/**
 * One step of a critically-damped spring toward `target` — the pointer-tilt
 * easing. Critically damped means it settles as fast as possible *without
 * overshooting* (no wobble). This is the exact closed-form solution, so it is
 * stable for any frame delta (a 500ms hitch can't make it explode).
 * Returns the next `[position, velocity]`.
 */
export function dampStep(
  position: number,
  velocity: number,
  target: number,
  dt: number,
  omega = 12,
): [number, number] {
  const x = position - target;
  const c = velocity + omega * x;
  const decay = Math.exp(-omega * dt);
  return [(x + c * dt) * decay + target, (velocity - omega * c * dt) * decay];
}

/** The rAF loop runs only while all three conditions hold. */
export function shouldAnimate(state: {
  visible: boolean;
  documentVisible: boolean;
  reducedMotion: boolean;
}): boolean {
  return state.visible && state.documentVisible && !state.reducedMotion;
}

/* ── Shaders ───────────────────────────────────────────────────────── */

// Fullscreen triangle from gl_VertexID — no vertex buffer needed. Three
// vertices spanning (-1,-1)..(3,3) cover the whole clip space.
const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Raymarched desk. The scene is described as a signed distance field (SDF):
// map(p) returns the distance from point p to the nearest desk surface
// (negative inside). A ray from the camera steps forward by that distance
// until it lands on the surface (sphere tracing).
const FRAG_SRC = `#version 300 es
precision highp float;

uniform vec2 uResolution; // drawing buffer size, px
uniform vec2 uAngles;     // x: desk yaw (rad), y: extra camera pitch (rad)
uniform vec3 uCoral;      // brand coral albedo
uniform float uKey;       // warm key light intensity
uniform float uFill;      // cool fill light intensity
uniform float uFrame;     // 0 = hero framing, 1 = square icon framing

out vec4 outColor;

// Distance to a box with half-extents b, edges rounded by r.
float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

// Smooth minimum — unions two distances with a soft fillet of width k where
// the surfaces meet, instead of a hard crease.
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// The desk: one wide thin rounded slab + four rounded legs. abs(p.xz)
// mirrors a single leg into all four quadrants, so the SDF stays cheap.
// Ground plane is y = 0; the legs land exactly on it.
float mapDesk(vec3 p) {
  float top = sdRoundBox(p - vec3(0.0, 0.82, 0.0), vec3(0.85, 0.038, 0.5), 0.04);
  vec3 q = vec3(abs(p.x) - 0.7, p.y - 0.37, abs(p.z) - 0.36);
  float legs = sdRoundBox(q, vec3(0.038, 0.34, 0.038), 0.03);
  return smin(top, legs, 0.06);
}

// Scene distance with the desk's yaw applied (rotating the sample point is
// equivalent to rotating the desk the other way).
float map(vec3 p) {
  float c = cos(uAngles.x), s = sin(uAngles.x);
  p.xz = mat2(c, -s, s, c) * p.xz;
  return mapDesk(p);
}

// Surface normal = gradient of the distance field, via 4 tetrahedral taps.
vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(0.0015, -0.0015);
  return normalize(
    e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) +
    e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

// Soft shadow: march from p toward the light; the closer the ray skims past
// geometry (small d at distance t), the darker the result. k sets penumbra
// sharpness. Used for the desk's self-shadowing and the ground contact shadow.
float softShadow(vec3 ro, vec3 rd, float k) {
  float res = 1.0;
  float t = 0.02;
  for (int i = 0; i < 32; i++) {
    float d = map(ro + rd * t);
    res = min(res, k * d / t);
    if (res < 0.005 || t > 4.0) break;
    t += clamp(d, 0.01, 0.25);
  }
  return clamp(res, 0.0, 1.0);
}

const vec3 KEY_DIR = normalize(vec3(0.55, 0.85, 0.45));   // warm key, upper right
const vec3 FILL_DIR = normalize(vec3(-0.65, 0.25, -0.4)); // cool fill, upper left

// Studio shading: ambient + warm key (shadowed) + cool fill + fresnel rim
// (edges facing away from the eye catch light) + a small key specular.
vec3 shade(vec3 p, vec3 rd) {
  vec3 n = calcNormal(p);
  float keyShadow = softShadow(p + n * 0.01, KEY_DIR, 16.0);
  float keyDiff = clamp(dot(n, KEY_DIR), 0.0, 1.0);
  float fillDiff = clamp(dot(n, FILL_DIR), 0.0, 1.0);
  float fresnel = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);
  vec3 halfVec = normalize(KEY_DIR - rd);
  float spec = pow(clamp(dot(n, halfVec), 0.0, 1.0), 48.0);

  vec3 c = uCoral * 0.32;
  c += uCoral * vec3(1.0, 0.96, 0.9) * keyDiff * keyShadow * uKey;
  c += uCoral * vec3(0.75, 0.85, 1.0) * fillDiff * uFill;
  c += vec3(1.0, 0.92, 0.88) * fresnel * 0.22;
  c += vec3(1.0) * spec * keyShadow * 0.3 * uKey;

  // Tonemap on luminance only: compressing each channel independently
  // (classic Reinhard) washes the coral toward dusty pink; scaling by the
  // compressed luminance rolls highlights off while keeping the brand hue.
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float mapped = lum * (1.0 + lum / 2.25) / (1.0 + lum); // white point 1.5
  return clamp(c * (mapped / max(lum, 1e-4)), 0.0, 1.0);
}

// One ray: march the desk; on a hit, shade it (alpha 1). On a miss, intersect
// the invisible ground plane y=0 and emit only a black contact shadow
// (premultiplied alpha — RGB stays 0). Everything else is fully transparent.
vec4 sample_(vec2 fragCoord) {
  vec2 ndc = (2.0 * fragCoord - uResolution) / uResolution.y;
  // Icon framing sits the desk slightly low in the square.
  ndc.y += uFrame * 0.12;

  float pitch = 0.42 + uAngles.y;
  vec3 target = vec3(0.0, 0.46, 0.0);
  vec3 ro = target + vec3(0.0, sin(pitch), cos(pitch)) * 3.1;
  vec3 fw = normalize(target - ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw * mix(2.3, 2.1, uFrame) + rt * ndc.x + up * ndc.y);

  float t = 0.0;
  bool hit = false;
  for (int i = 0; i < 80; i++) {
    float d = map(ro + rd * t);
    if (d < 0.001 * max(t, 1.0)) { hit = true; break; }
    t += d;
    if (t > 7.0) break;
  }
  if (hit) return vec4(shade(ro + rd * t, rd), 1.0);

  // Ground contact shadow: how much desk blocks the key light at this point,
  // faded out away from the desk so the shadow never hard-clips at the edge.
  if (rd.y < 0.0) {
    vec3 g = ro + rd * (-ro.y / rd.y);
    float fade = smoothstep(1.7, 0.5, length(g.xz));
    float a = (1.0 - softShadow(g + vec3(0.0, 0.01, 0.0), KEY_DIR, 6.0)) * fade * 0.34;
    return vec4(0.0, 0.0, 0.0, a);
  }
  return vec4(0.0);
}

void main() {
  // 2×2 supersampling — raymarched silhouettes get no MSAA, so average four
  // rays per pixel for clean edges. The canvas is small; this stays cheap.
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 2; i++) {
    for (int j = 0; j < 2; j++) {
      acc += sample_(gl_FragCoord.xy + (vec2(float(i), float(j)) - 0.5) * 0.5);
    }
  }
  outColor = acc * 0.25; // already premultiplied (shadow RGB is 0, desk a=1)
}
`;

/* ── GL plumbing ───────────────────────────────────────────────────── */

const CONTEXT_ATTRS: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false, // AA is done in-shader; MSAA can't smooth raymarched edges
  powerPreference: 'low-power',
};

interface DrawState {
  width: number;
  height: number;
  /** [desk yaw, extra camera pitch] in radians. */
  angles: [number, number];
  theme: DeskThemeUniforms;
  /** 0 = hero framing, 1 = icon framing. */
  frame: number;
}

interface Renderer {
  draw(state: DrawState): void;
  dispose(): void;
}

/** Compile + link the program. Returns null on any failure — never throws
 * (some environments hand out half-implemented GL contexts). */
function createRenderer(gl: WebGL2RenderingContext): Renderer | null {
  try {
    return createRendererUnsafe(gl);
  } catch {
    return null;
  }
}

function createRendererUnsafe(gl: WebGL2RenderingContext): Renderer | null {
  function compile(type: number, src: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vert = compile(gl.VERTEX_SHADER, VERT_SRC);
  const frag = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vert || !frag) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  // Shaders are owned by the program once linked.
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  gl.useProgram(program);
  const uResolution = gl.getUniformLocation(program, 'uResolution');
  const uAngles = gl.getUniformLocation(program, 'uAngles');
  const uCoral = gl.getUniformLocation(program, 'uCoral');
  const uKey = gl.getUniformLocation(program, 'uKey');
  const uFill = gl.getUniformLocation(program, 'uFill');
  const uFrame = gl.getUniformLocation(program, 'uFrame');
  // The shader writes premultiplied alpha straight into the transparent
  // canvas — no blending against previous content needed.
  gl.disable(gl.BLEND);

  return {
    draw(state) {
      gl.viewport(0, 0, state.width, state.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uResolution, state.width, state.height);
      gl.uniform2f(uAngles, state.angles[0], state.angles[1]);
      gl.uniform3f(uCoral, state.theme.coral[0], state.theme.coral[1], state.theme.coral[2]);
      gl.uniform1f(uKey, state.theme.key);
      gl.uniform1f(uFill, state.theme.fill);
      gl.uniform1f(uFrame, state.frame);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(program);
    },
  };
}

function getWebGL2(
  canvas: HTMLCanvasElement,
  attrs: WebGLContextAttributes,
): WebGL2RenderingContext | null {
  try {
    return canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null;
  } catch {
    return null;
  }
}

/* ── Live hero ─────────────────────────────────────────────────────── */

/** Base three-quarter orientation; idle drift oscillates around it. */
const BASE_YAW = 0.55;
/** Idle yaw drift: ±~4° over a ~14s period — calm, no full spin. */
const IDLE_RATE = 0.45;
const IDLE_AMPLITUDE = 0.07;
/** How far pointer tilt can lean the desk (radians at full deflection). */
const TILT_YAW = 0.3;
const TILT_PITCH = 0.16;
const FALLBACK_SIZE = 200;

/**
 * Mount the live piece onto `canvas`. Returns null (no side effects worth
 * cleaning) when WebGL2 or shader compilation is unavailable.
 */
export function mountDeskPiece(
  canvas: HTMLCanvasElement,
  opts: DeskPieceOptions = {},
): DeskPieceHandle | null {
  const gl = getWebGL2(canvas, CONTEXT_ATTRS);
  if (!gl) return null;
  const maybeRenderer = createRenderer(gl);
  if (!maybeRenderer) return null;
  // Re-bound with a non-null type: the hoisted closures below would otherwise
  // see the original `Renderer | null` declaration.
  const renderer: Renderer = maybeRenderer;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let theme = themeUniforms(opts.theme ?? 'light');

  // Pointer tilt state: target set by the pointer, position/velocity advanced
  // by the critically-damped spring each frame.
  let tiltX = 0;
  let tiltY = 0;
  let velX = 0;
  let velY = 0;
  let targetX = 0;
  let targetY = 0;

  let raf = 0;
  let running = false;
  let disposed = false;
  let visible = true; // assume visible until the IntersectionObserver reports
  let documentVisible = document.visibilityState !== 'hidden';
  const reducedQuery =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  let reducedMotion = reducedQuery?.matches ?? false;

  function resize() {
    const w = canvas.clientWidth || FALLBACK_SIZE;
    const h = canvas.clientHeight || FALLBACK_SIZE;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
  }

  function renderFrame(timeSec: number) {
    resize();
    // Reduced motion: a fixed three-quarter hero frame, no drift, no tilt.
    const yaw = reducedMotion
      ? BASE_YAW
      : BASE_YAW + Math.sin(timeSec * IDLE_RATE) * IDLE_AMPLITUDE + tiltX * TILT_YAW;
    const pitch = reducedMotion ? 0 : -tiltY * TILT_PITCH;
    renderer.draw({
      width: canvas.width,
      height: canvas.height,
      angles: [yaw, pitch],
      theme,
      frame: 0,
    });
  }

  let last = 0;
  function frame(now: number) {
    raf = 0;
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    [tiltX, velX] = dampStep(tiltX, velX, targetX, dt);
    [tiltY, velY] = dampStep(tiltY, velY, targetY, dt);
    renderFrame(now / 1000);
    raf = requestAnimationFrame(frame);
  }

  /** Start/stop the loop to match visibility + motion preference. */
  function sync() {
    if (disposed) return;
    const should = shouldAnimate({ visible, documentVisible, reducedMotion });
    if (should && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!should && running) {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (reducedMotion) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    targetX = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width - 0.5) * 2));
    targetY = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height - 0.5) * 2));
  }
  function onPointerLeave() {
    targetX = 0;
    targetY = 0;
  }
  function onVisibilityChange() {
    documentVisible = document.visibilityState !== 'hidden';
    sync();
  }
  function onReducedChange() {
    reducedMotion = reducedQuery?.matches ?? false;
    if (reducedMotion) {
      targetX = 0;
      targetY = 0;
      tiltX = 0;
      tiltY = 0;
      velX = 0;
      velY = 0;
    }
    sync();
    if (!running) renderFrame(performance.now() / 1000);
  }

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  document.addEventListener('visibilitychange', onVisibilityChange);
  reducedQuery?.addEventListener?.('change', onReducedChange);

  const io =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => {
          visible = entries[entries.length - 1]?.isIntersecting ?? true;
          sync();
        })
      : null;
  io?.observe(canvas);

  // Re-render the static frame when the element resizes while the loop is
  // idle (e.g. reduced motion + viewport breakpoint change).
  const ro =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (!running) renderFrame(performance.now() / 1000);
        })
      : null;
  ro?.observe(canvas);

  // First paint immediately (covers the reduced-motion "exactly one frame"
  // contract), then arm the loop if allowed.
  renderFrame(performance.now() / 1000);
  sync();

  return {
    setTheme(next) {
      if (disposed) return;
      theme = themeUniforms(next);
      // The loop picks the change up next frame; when idle, repaint now.
      if (!running) renderFrame(performance.now() / 1000);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      io?.disconnect();
      ro?.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reducedQuery?.removeEventListener?.('change', onReducedChange);
      renderer.dispose();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

/* ── Icon export ───────────────────────────────────────────────────── */

/** Icon orientation: a touch more yaw + raised camera so the silhouette
 * reads "desk" even at 32px. */
const ICON_YAW = 0.6;
const ICON_PITCH = 0.06;

/**
 * Render the square icon offscreen and resolve it as a PNG blob. Light-theme
 * coral, transparent background, baked-in contact shadow. Rejects when WebGL2
 * is unavailable (the `?icon` page surfaces the message).
 */
export function renderIconPNG(size = 1024): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    // preserveDrawingBuffer keeps the frame around for the toBlob readback.
    const gl = getWebGL2(canvas, { ...CONTEXT_ATTRS, preserveDrawingBuffer: true });
    if (!gl) {
      reject(new Error('WebGL2 is unavailable'));
      return;
    }
    const renderer = createRenderer(gl);
    if (!renderer) {
      reject(new Error('Shader compilation failed'));
      return;
    }
    renderer.draw({
      width: size,
      height: size,
      angles: [ICON_YAW, ICON_PITCH],
      theme: themeUniforms('light'),
      frame: 1,
    });
    canvas.toBlob((blob) => {
      renderer.dispose();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      if (blob) resolve(blob);
      else reject(new Error('PNG encoding failed'));
    }, 'image/png');
  });
}
