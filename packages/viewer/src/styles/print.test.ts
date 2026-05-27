import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guards the "print is always light" fix. Export = window.print(), so a dark
// on-screen theme must not produce a dark, ink-heavy PDF. The override lives in
// app.css's @media print block and MUST be qualified with `html` — app.css is
// bundled before tokens.css (App is imported ahead of globals.css in main.tsx),
// so a bare `[data-theme="dark"]` (equal specificity, earlier source) loses to
// tokens.css and the dark palette leaks into print. See app.css for the why.
const css = readFileSync(fileURLToPath(new URL('./app.css', import.meta.url)), 'utf8');

function printBlock(): string {
  const start = css.indexOf('@media print');
  expect(start).toBeGreaterThan(-1);
  // Walk braces from the first '{' after @media print to its matching close.
  let i = css.indexOf('{', start);
  let depth = 0;
  const open = i;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) break;
  }
  return css.slice(open, i + 1);
}

describe('print stylesheet forces the light palette', () => {
  const block = printBlock();

  it('re-points the dark theme palette with an html-qualified selector (beats tokens.css specificity)', () => {
    expect(block).toContain('html[data-theme="dark"]');
    // A bare selector would silently lose to tokens.css — reject it.
    expect(block).not.toMatch(/(?<!html)\[data-theme="dark"\]\s*\{/);
  });

  it('maps the dark surface + text tokens to the light values', () => {
    expect(block).toContain('--color-bg: #fbfaf8');
    expect(block).toContain('--color-text: #1a1815');
    expect(block).toContain('--color-bg-elevated: #ffffff');
  });
});
