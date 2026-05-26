#!/usr/bin/env bun
// QA sweep: command palette + search, responsive width, and the 404 route.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:7878';
const OUT = '/tmp/desk-qa2';
mkdirSync(OUT, { recursive: true });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--force-color-profile=srgb'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});

// 1) Command palette: open with Cmd+K, then type a query.
{
  const page = await browser.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await wait(500);
  await page.keyboard.down('Meta');
  await page.keyboard.press('k');
  await page.keyboard.up('Meta');
  await wait(400);
  const palette = await page.$('.command-palette, [class*="palette"], [role="dialog"]');
  await page.screenshot({ path: `${OUT}/flow-palette-open.png` });
  console.log('palette element present:', Boolean(palette));
  // type a query
  await page.keyboard.type('improve');
  await wait(400);
  await page.screenshot({ path: `${OUT}/flow-palette-query.png` });
  const inputVal = await page.evaluate(
    () => (document.querySelector('input') as HTMLInputElement | null)?.value ?? null,
  );
  console.log('palette input value:', inputVal);
  await page.close();
}

// 2) Responsive: narrow (mobile-ish) viewport on an artifact.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/a/yqnrm6d8kqrhfk`, { waitUntil: 'networkidle0' });
  await wait(600);
  await page.screenshot({ path: `${OUT}/flow-narrow-doc.png` });
  const overflow = await page.evaluate(() => ({
    bodyScrollW: document.body.scrollWidth,
    winW: window.innerWidth,
    horizontalOverflow: document.body.scrollWidth > window.innerWidth + 2,
  }));
  console.log('narrow overflow:', JSON.stringify(overflow));
  await page.close();
}

// 3) 404 / unknown routes.
for (const path of ['/totally-not-a-route', '/a/doesnotexist123']) {
  const page = await browser.newPage();
  const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' });
  await wait(500);
  const slug = path.replace(/\W+/g, '-');
  await page.screenshot({ path: `${OUT}/flow-404${slug}.png` });
  const text = await page.evaluate(() =>
    document.body.innerText.slice(0, 120).replace(/\s+/g, ' '),
  );
  console.log(`route ${path} -> http ${resp?.status()} | ${text}`);
  await page.close();
}

await browser.close();
console.log('done');
