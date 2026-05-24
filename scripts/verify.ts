#!/usr/bin/env bun
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:7878';
const DECK = '73y3vvbd24qcmx';
const OUT = '/tmp/desk-shots';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--force-color-profile=srgb'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});

// 1) Hover a component to reveal the "Comment" affordance.
{
  const page = await browser.newPage();
  await page.goto(`${BASE}/a/${DECK}#slide:1`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 700));
  const el = await page.$('.commentable');
  if (el) await el.hover();
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${OUT}/v1-hover-comment.png` });
  console.log('shot v1-hover-comment');
  await page.close();
}

// 2) Click "Comment" → composer shows the anchored target banner.
{
  const page = await browser.newPage();
  await page.goto(`${BASE}/a/${DECK}#slide:1`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 700));
  const el = await page.$('.commentable');
  if (el) await el.hover();
  await new Promise((r) => setTimeout(r, 200));
  const btn = await page.$('.commentable__btn');
  if (btn) await btn.click();
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${OUT}/v2-comment-target.png` });
  console.log('shot v2-comment-target');
  await page.close();
}

// 3) Dark mode at load (via prefers-color-scheme).
{
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto(`${BASE}/a/${DECK}#slide:1`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `${OUT}/v3-dark.png` });
  console.log('shot v3-dark');
  await page.close();
}

await browser.close();
console.log('done');
