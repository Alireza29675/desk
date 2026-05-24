#!/usr/bin/env bun
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:7878';
const DECK = '73y3vvbd24qcmx';
const NOTES = 'yqnrm6d8kqrhfk';
const OUT = '/tmp/desk-shots';
mkdirSync(OUT, { recursive: true });

const shots: { name: string; path: string; dark?: boolean; scroll?: number; wait?: number }[] = [
  { name: '01-home', path: '/' },
  { name: '02-deck-title', path: `/a/${DECK}#slide:1` },
  { name: '03-deck-timeline', path: `/a/${DECK}#slide:2` },
  { name: '04-deck-northstars', path: `/a/${DECK}#slide:3` },
  { name: '05-deck-architecture', path: `/a/${DECK}#slide:4` },
  { name: '06-deck-table', path: `/a/${DECK}#slide:6` },
  { name: '07-deck-code', path: `/a/${DECK}#slide:7`, wait: 1500 },
  { name: '08-deck-mindmap', path: `/a/${DECK}#slide:8` },
  { name: '09-notes-top', path: `/a/${NOTES}` },
  { name: '10-notes-scrolled', path: `/a/${NOTES}`, scroll: 900 },
  { name: '11-deck-title-dark', path: `/a/${DECK}#slide:1`, dark: true },
  { name: '12-notes-dark', path: `/a/${NOTES}`, dark: true },
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--force-color-profile=srgb'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});

for (const shot of shots) {
  const page = await browser.newPage();
  if (shot.dark) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise((r) => setTimeout(r, shot.wait ?? 700));
  if (shot.scroll) {
    await page.evaluate((y) => {
      const body = document.querySelector('.workspace__body');
      if (body) body.scrollTop = y;
    }, shot.scroll);
    await new Promise((r) => setTimeout(r, 300));
  }
  await page.screenshot({ path: `${OUT}/${shot.name}.png` });
  console.log(`shot ${shot.name}`);
  await page.close();
}

await browser.close();
console.log('done');
