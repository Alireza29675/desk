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
    expect(block).toContain('--color-bg: #fafafa');
    expect(block).toContain('--color-text: #171717');
    expect(block).toContain('--color-bg-elevated: #ffffff');
  });

  it('print block stays in sync with the light palette in tokens.css', () => {
    // The print block is a manual mirror of the light tokens (specificity
    // requirement). Catch drift in BOTH directions:
    //  1. every --color-* the print block declares must match the light block
    //     of tokens.css value-for-value (no stale copies), and
    //  2. every --color-* the DARK theme overrides must be re-pointed by the
    //     print block (a token added to both themes but not mirrored here
    //     would leak its dark value into print).
    const tokens = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
    const lightStart = tokens.indexOf('[data-theme="light"]');
    const darkStart = tokens.indexOf('[data-theme="dark"]');
    const darkEnd = tokens.indexOf(':root {', darkStart);
    const lightBlock = tokens.slice(lightStart, darkStart);
    const darkBlock = tokens.slice(darkStart, darkEnd);

    const declared = block.match(/--color-[a-z-]+:\s*[^;]+;/g) ?? [];
    expect(declared.length).toBeGreaterThan(20);
    for (const decl of declared) {
      expect(lightBlock).toContain(decl);
    }

    const darkNames = new Set(darkBlock.match(/--color-[a-z-]+(?=:)/g) ?? []);
    expect(darkNames.size).toBeGreaterThan(20);
    for (const name of darkNames) {
      expect(block).toContain(`${name}:`);
    }
  });
});
