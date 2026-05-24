#!/usr/bin/env bun
// Headless visual check of the four comment-anchor flows: toolbar, point pin,
// region drag, and the text-selection pill. Shots land in /tmp/desk-shots.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:7878';
const DOC = process.argv[2] ?? 'yqnrm6d8kqrhfk'; // text-bearing enriched-document
const OUT = '/tmp/desk-shots';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--force-color-profile=srgb'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function open() {
  const page = await browser.newPage();
  await page.goto(`${BASE}/a/${DOC}`, { waitUntil: 'networkidle0' });
  await wait(700);
  return page;
}

// 1) Hover → the three-tool anchor toolbar (Comment / Pin / Region).
{
  const page = await open();
  const el = await page.$('.commentable');
  if (el) await el.hover();
  await wait(300);
  await page.screenshot({ path: `${OUT}/a1-toolbar.png` });
  console.log('shot a1-toolbar', Boolean(el));
  await page.close();
}

// 2) Pin tool → click inside a component → pending point pin + composer banner.
{
  const page = await open();
  const el = await page.$('.commentable');
  if (el) await el.hover();
  await wait(150);
  const tools = await page.$$('.commentable__tool');
  if (tools[1]) await tools[1].click(); // Pin
  await wait(150);
  const box = await (await page.$('.commentable__content'))?.boundingBox();
  if (box) await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await wait(300);
  await page.screenshot({ path: `${OUT}/a2-point.png` });
  console.log('shot a2-point', Boolean(box));
  await page.close();
}

// 3) Region tool → drag a box → pending region rect + composer banner.
{
  const page = await open();
  const el = await page.$('.commentable');
  if (el) await el.hover();
  await wait(150);
  const tools = await page.$$('.commentable__tool');
  if (tools[2]) await tools[2].click(); // Region
  await wait(150);
  const box = await (await page.$('.commentable__content'))?.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 12 });
    await page.mouse.up();
  }
  await wait(300);
  await page.screenshot({ path: `${OUT}/a3-region.png` });
  console.log('shot a3-region', Boolean(box));
  await page.close();
}

// 4) Select text inside a component → the floating "Comment on …" pill.
{
  const page = await open();
  const made = await page.evaluate(() => {
    const content = document.querySelector('.commentable__content');
    if (!content) return false;
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node: Node | null = walker.nextNode();
    while (node && (node.textContent?.trim().length ?? 0) < 12) node = walker.nextNode();
    if (!node) return false;
    const len = node.textContent?.length ?? 0;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, Math.min(len, 10));
    sel?.addRange(range);
    content.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return true;
  });
  await wait(300);
  await page.screenshot({ path: `${OUT}/a4-selection.png` });
  console.log('shot a4-selection', made);
  await page.close();
}

await browser.close();
console.log('done');
