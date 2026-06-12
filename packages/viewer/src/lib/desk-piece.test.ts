import { describe, expect, it } from 'vitest';
import { dampStep, shouldAnimate, themeUniforms } from './desk-piece';

describe('dampStep — critically-damped pointer-tilt easing', () => {
  it('converges to the target from rest', () => {
    let pos = 0;
    let vel = 0;
    for (let i = 0; i < 240; i++) [pos, vel] = dampStep(pos, vel, 1, 1 / 60);
    expect(pos).toBeCloseTo(1, 3);
    expect(vel).toBeCloseTo(0, 3);
  });

  it('never overshoots from rest (critical damping = no wobble)', () => {
    let pos = 0;
    let vel = 0;
    let prev = pos;
    for (let i = 0; i < 240; i++) {
      [pos, vel] = dampStep(pos, vel, 1, 1 / 60);
      expect(pos).toBeLessThanOrEqual(1 + 1e-9);
      expect(pos).toBeGreaterThanOrEqual(prev - 1e-9); // monotonic approach
      prev = pos;
    }
  });

  it('stays stable for arbitrarily large frame deltas (closed-form, not Euler)', () => {
    const [pos, vel] = dampStep(0, 0, 1, 2);
    expect(Number.isFinite(pos)).toBe(true);
    expect(Number.isFinite(vel)).toBe(true);
    expect(pos).toBeGreaterThan(0.99);
    expect(pos).toBeLessThanOrEqual(1);
  });

  it('tracks a moved target back to zero (pointer leaving)', () => {
    let pos = 0.8;
    let vel = 0.5;
    for (let i = 0; i < 240; i++) [pos, vel] = dampStep(pos, vel, 0, 1 / 60);
    expect(pos).toBeCloseTo(0, 3);
  });
});

describe('themeUniforms — theme → shader uniform mapping', () => {
  it('uses the exact light-theme accent from tokens.css (#ff5a4d)', () => {
    const { coral } = themeUniforms('light');
    expect(coral[0]).toBeCloseTo(255 / 255, 5);
    expect(coral[1]).toBeCloseTo(90 / 255, 5);
    expect(coral[2]).toBeCloseTo(77 / 255, 5);
  });

  it('uses the exact dark-theme accent from tokens.css (#ff6f61)', () => {
    const { coral } = themeUniforms('dark');
    expect(coral[0]).toBeCloseTo(255 / 255, 5);
    expect(coral[1]).toBeCloseTo(111 / 255, 5);
    expect(coral[2]).toBeCloseTo(97 / 255, 5);
  });

  it('dark mode dims both lights (deeper coral sits into the dark surface)', () => {
    const light = themeUniforms('light');
    const dark = themeUniforms('dark');
    expect(dark.key).toBeLessThan(light.key);
    expect(dark.fill).toBeLessThan(light.fill);
  });

  it('keeps every uniform in shader range [0, 1]', () => {
    for (const theme of ['light', 'dark'] as const) {
      const u = themeUniforms(theme);
      for (const v of [...u.coral, u.key, u.fill]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('shouldAnimate — the rAF gate', () => {
  it('runs only when on-screen, tab visible, and motion is allowed', () => {
    expect(shouldAnimate({ visible: true, documentVisible: true, reducedMotion: false })).toBe(
      true,
    );
    expect(shouldAnimate({ visible: false, documentVisible: true, reducedMotion: false })).toBe(
      false,
    );
    expect(shouldAnimate({ visible: true, documentVisible: false, reducedMotion: false })).toBe(
      false,
    );
    expect(shouldAnimate({ visible: true, documentVisible: true, reducedMotion: true })).toBe(
      false,
    );
  });
});
