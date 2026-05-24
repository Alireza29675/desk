#!/usr/bin/env bun
// QA sweep: capture renderer-heavy deck slides in light + dark.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:7878';
const DECK = process.argv[2] ?? '73y3vvbd24qcmx';
const OUT = '/tmp/desk-qa2';
mkdirSync(OUT, { recursive: true });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--force-color-profile=srgb'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});

// 2 timeline · 4 diagram · 5 folder-structure · 6 diagram+table · 7 code-view · 8 mindmap
const slides = [2, 4, 5, 6, 7, 8];
for (const dark of [false, true]) {
  for (const n of slides) {
    const page = await browser.newPage();
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
    await page.goto(`${BASE}/a/${DECK}#slide:${n}`, { waitUntil: 'networkidle0' });
    await wait(700);
    const pager = await page.$eval('.presentation__pager', (e) => e.textContent).catch(() => '?');
    await page.screenshot({ path: `${OUT}/s${n}-${dark ? 'dark' : 'light'}.png` });
    console.log(`slide ${n} ${dark ? 'dark' : 'light'} pager=${pager}`);
    await page.close();
  }
}
await browser.close();
console.log('done');
