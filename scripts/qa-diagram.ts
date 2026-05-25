import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:7878'; const DECK = '73y3vvbd24qcmx';
const OUT = '/tmp/desk-qa4'; mkdirSync(OUT, { recursive: true });
const wait = (ms:number)=>new Promise(r=>setTimeout(r,ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args:['--no-sandbox','--force-color-profile=srgb'], defaultViewport:{width:1440,height:900} });
for (const [name,dark] of [['light',false],['dark',true]] as const) {
  for (const slide of [4,6]) {
    const p = await browser.newPage();
    await p.emulateMediaFeatures([{name:'prefers-color-scheme',value:dark?'dark':'light'}]);
    await p.goto(`${BASE}/a/${DECK}#slide:${slide}`, { waitUntil:'networkidle0' });
    // wait for the D2 wasm to load + render the svg
    let ok=false;
    for (let i=0;i<30;i++){ ok = await p.$eval('.diagram', el=>el.getAttribute('data-status')==='ready').catch(()=>false); if(ok) break; await wait(500); }
    const hasSvg = await p.$$eval('.diagram__svg svg', els=>els.length);
    await p.screenshot({ path:`${OUT}/diagram-s${slide}-${name}.png` });
    console.log(`slide ${slide} ${name}: status-ready=${ok} svgCount=${hasSvg}`);
    await p.close();
  }
}
await browser.close(); console.log('done');
