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
