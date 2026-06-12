import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guards the topbar-squeeze fix. .topbar and .history-bar are non-scrolling
// flex items in the .workspace column, and .workspace__body's flex-basis is
// its content height — so on a long artifact the column overflows at the
// preferred-size stage and the default flex-shrink:1 squeezes the chrome rows
// to min-content (the topbar measured 33px on a long document vs its designed
// 48px). `flex-shrink: 0` pins them; only .workspace__body may flex.
const css = readFileSync(fileURLToPath(new URL('./app.css', import.meta.url)), 'utf8');
const globals = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8');

function ruleBlock(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `selector ${selector} not found in app.css`).toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open, close + 1);
}

describe('workspace chrome rows never shrink under a long artifact', () => {
  it('pins .topbar at its designed height', () => {
    expect(ruleBlock('.topbar')).toContain('flex-shrink: 0');
  });

  it('pins .history-bar (rendered between the topbar and the body)', () => {
    expect(ruleBlock('.history-bar')).toContain('flex-shrink: 0');
  });
});

// Guards the measured-smooth motion budget: nothing animates slower than
// --duration-slow (260ms), and no transition/animation declares !important
// (the prefers-reduced-motion kill switch in globals.css relies on its own
// !important outranking every normal declaration). The scan covers literal
// `Nms` values only — token-driven durations are budgeted in tokens.css, and
// the second-denominated pulses (deep-link, anchor focus) are one-shot
// functional signals tied to store timers, not transitions.
describe('motion stays inside the measured-smooth budget', () => {
  // The kill switch is the one sanctioned !important; exempt it from the scan.
  const withoutKillSwitch = (text: string) =>
    text.replace(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/, '');

  it('defines the content-enter keyframes (artifact/slide mount animation)', () => {
    expect(css).toContain('@keyframes content-enter');
  });

  for (const [name, text] of [
    ['app.css', css],
    ['globals.css', globals],
  ] as const) {
    it(`${name}: no transition/animation over a literal 260ms, none !important`, () => {
      const decls =
        withoutKillSwitch(text).match(/(?:transition|animation)[a-z-]*\s*:[^;{}]+/g) ?? [];
      expect(decls.length).toBeGreaterThan(0);
      for (const decl of decls) {
        expect(decl, decl).not.toContain('!important');
        for (const [, ms] of decl.matchAll(/(\d+(?:\.\d+)?)ms/g)) {
          expect(Number(ms), decl).toBeLessThanOrEqual(260);
        }
      }
    });
  }
});
