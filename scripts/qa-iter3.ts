#!/usr/bin/env bun
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:7878';
const DECK = '73y3vvbd24qcmx';
const FIX = 'p7kbbhtjvyvtv9';
const DOC = 'yqnrm6d8kqrhfk';
const OUT = '/tmp/desk-qa3';
mkdirSync(OUT, { recursive: true });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--force-color-profile=srgb'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});
const newPage = async (dark: boolean) => {
  const p = await browser.newPage();
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  return p;
};

// #19 — title slide centered (light + dark)
for (const dark of [false, true]) {
  const p = await newPage(dark);
  await p.goto(`${BASE}/a/${DECK}#slide:1`, { waitUntil: 'networkidle0' });
  await wait(700);
  await p.screenshot({ path: `${OUT}/title-${dark ? 'dark' : 'light'}.png` });
  await p.close();
}
console.log('title slide shots done');

// fixtures — full page so chart/math/image/iframe/youtube/quote all show
for (const dark of [false, true]) {
  const p = await newPage(dark);
  await p.goto(`${BASE}/a/${FIX}`, { waitUntil: 'networkidle0' });
  await wait(1500); // let image/iframe load
  const types = await p.$$eval('[data-component-id]', (els) =>
    els.map((e) => e.getAttribute('data-component-id')),
  );
  await p.screenshot({ path: `${OUT}/fixtures-${dark ? 'dark' : 'light'}.png`, fullPage: true });
  console.log(`fixtures ${dark ? 'dark' : 'light'} components:`, types.join(','));
  await p.close();
}

// #18 — theme persistence: store 'light', reload with dark system pref, expect light to win
{
  const p = await newPage(true); // system = dark
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.setItem('desk-theme', 'light'));
  await p.reload({ waitUntil: 'networkidle0' });
  await wait(300);
  const theme = await p.evaluate(() => document.documentElement.dataset.theme);
  console.log(
    `#18 persistence: stored=light, system=dark -> resolved=${theme} (${theme === 'light' ? 'PASS' : 'FAIL'})`,
  );
  await p.evaluate(() => localStorage.removeItem('desk-theme'));
  await p.close();
}

// #21 — scroll comment list to bottom, check last comment clears the composer
{
  const p = await newPage(true);
  await p.goto(`${BASE}/a/${DOC}`, { waitUntil: 'networkidle0' });
  await wait(800);
  const info = await p.evaluate(() => {
    const list = document.querySelector('.comment-rail__list') as HTMLElement | null;
    const composer = document.querySelector('.comment-rail__composer') as HTMLElement | null;
    if (!list || !composer) return { ok: false };
    list.scrollTop = list.scrollHeight;
    const cards = list.querySelectorAll('.comment');
    const last = cards[cards.length - 1] as HTMLElement | undefined;
    const lastBottom = last?.getBoundingClientRect().bottom ?? 0;
    const composerTop = composer.getBoundingClientRect().top;
    return {
      ok: true,
      lastBottom: Math.round(lastBottom),
      composerTop: Math.round(composerTop),
      clears: lastBottom <= composerTop + 1,
    };
  });
  await wait(200);
  await p.screenshot({ path: `${OUT}/comments-scrolled.png` });
  console.log('#21 comment scroll:', JSON.stringify(info));
  await p.close();
}

await browser.close();
console.log('done');
