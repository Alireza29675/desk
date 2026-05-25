import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';

/**
 * Renders the region a comment is anchored to and saves it as a PNG, so the
 * agent can *see* what the operator selected — not just read the anchor id.
 *
 * It drives a headless Chrome against the live viewer (the same SVG/diagram
 * pipeline the operator saw), finds the component by `data-component-id`,
 * and crops to the anchor: a region's fractional rect, a small box around a
 * point, or the whole component for element/text-selection anchors.
 */

const CHROME =
  process.env.DESK_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = join(tmpdir(), 'desk-channel');
const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 2 };

interface Anchor {
  kind: string;
  componentId?: string;
  region?: { kind: string; x?: number; y?: number; width?: number; height?: number };
  offset?: { x: number; y: number };
}

let browserPromise: Promise<Browser> | null = null;
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox', '--force-color-profile=srgb'],
      defaultViewport: VIEWPORT,
    });
  }
  return browserPromise;
}

/** Close the shared browser (graceful shutdown). */
export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}

/**
 * Capture the anchored region to a PNG file. Returns the path, or null if the
 * anchor isn't spatial (general) or rendering fails — callers degrade to
 * text-only in that case.
 */
export async function captureAnchor(
  deskUrl: string,
  artifactId: string,
  commentId: string,
  anchor: Anchor,
): Promise<string | null> {
  if (anchor.kind === 'general' || !anchor.componentId) return null;
  mkdirSync(OUT_DIR, { recursive: true });

  let page: Awaited<ReturnType<Browser['newPage']>> | null = null;
  try {
    const hash = await slideHash(deskUrl, artifactId, anchor.componentId);
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await page.goto(`${deskUrl}/a/${artifactId}${hash}`, { waitUntil: 'networkidle0' });

    const sel = `[data-component-id="${cssEscape(anchor.componentId)}"]`;
    await page.waitForSelector(sel, { timeout: 5000 });
    // Diagrams render asynchronously (wasm); give them a moment to settle.
    await waitForDiagrams(page);
    await page.$eval(sel, (el) => el.scrollIntoView({ block: 'center' }));
    await new Promise((r) => setTimeout(r, 250));

    const box = await page.$eval(sel, (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });

    const clip = clipForAnchor(anchor, box, VIEWPORT);
    const path = join(OUT_DIR, `${commentId}.png`);
    await page.screenshot({ path, clip });
    return path;
  } catch (e) {
    console.error('[desk-channel] screenshot failed:', (e as Error).message);
    return null;
  } finally {
    await page?.close().catch(() => {});
  }
}

/** Crop rectangle (CSS px) for the anchor, padded and clamped to the viewport. */
function clipForAnchor(
  anchor: Anchor,
  box: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
) {
  let rect: { x: number; y: number; width: number; height: number };
  if (anchor.kind === 'region' && anchor.region?.kind === 'fractional') {
    const r = anchor.region;
    rect = {
      x: box.x + (r.x ?? 0) * box.width,
      y: box.y + (r.y ?? 0) * box.height,
      width: (r.width ?? 1) * box.width,
      height: (r.height ?? 1) * box.height,
    };
  } else if (anchor.kind === 'point' && anchor.offset) {
    const cx = box.x + anchor.offset.x * box.width;
    const cy = box.y + anchor.offset.y * box.height;
    rect = { x: cx - 110, y: cy - 80, width: 220, height: 160 };
  } else {
    rect = box; // element / text-selection → the whole component
  }
  // Pad a little for context, then clamp to the viewport.
  const pad = 10;
  const x = Math.max(0, rect.x - pad);
  const y = Math.max(0, rect.y - pad);
  return {
    x,
    y,
    width: Math.max(1, Math.min(viewport.width - x, rect.width + pad * 2)),
    height: Math.max(1, Math.min(viewport.height - y, rect.height + pad * 2)),
  };
}

/** For presentations, the deep-link hash that lands on the component's slide. */
async function slideHash(deskUrl: string, artifactId: string, componentId: string): Promise<string> {
  try {
    const res = await fetch(`${deskUrl}/api/a/${artifactId}`);
    if (!res.ok) return '';
    const { artifact } = (await res.json()) as {
      artifact: { type: string; content: { components: { id: string; type: string }[] } };
    };
    if (artifact.type !== 'presentation') return '';
    // Each slide begins with a slide-break (slide 1's break included), so the
    // component's 1-based slide = number of breaks at/before it.
    let slide = 0;
    for (const c of artifact.content.components) {
      if (c.id === componentId) break;
      if (c.type === 'slide-break') slide += 1;
    }
    return `#slide:${Math.max(1, slide)}`;
  } catch {
    return '';
  }
}

async function waitForDiagrams(page: Awaited<ReturnType<Browser['newPage']>>): Promise<void> {
  try {
    const hasDiagram = (await page.$('.diagram')) !== null;
    if (!hasDiagram) return;
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.diagram')).every((d) => d.getAttribute('data-status') !== 'loading'),
      { timeout: 6000 },
    );
  } catch {
    /* best effort */
  }
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}
