import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Fonts are bundled (not fetched from a CDN) — Desk is local-first and must
// paint correctly with no network. Geist/Geist Mono are variable fonts;
// Instrument Serif is the display accent and never renders below ~20px.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/instrument-serif';
// The base package ships 400-normal only; quotes set font-style italic and
// would get a synthetic oblique without the real italic face.
import '@fontsource/instrument-serif/400-italic.css';
import './styles/globals.css';

/**
 * Dev-only icon export: `?icon` renders the desk piece once at 1024×1024 and
 * offers the PNG for download (the committed `public/icon.png` is produced
 * here, in a real browser — WebGL never runs in CI). Not linked anywhere in
 * the UI.
 */
async function mountIconExport(el: HTMLElement) {
  el.style.cssText =
    'min-height:100vh;display:grid;place-content:center;justify-items:center;gap:16px;font-family:system-ui';
  try {
    const { renderIconPNG } = await import('./lib/desk-piece');
    const blob = await renderIconPNG(1024);
    const url = URL.createObjectURL(blob);
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Desk icon, 1024×1024';
    // Checkerboard behind the preview so the transparent background is visible.
    img.style.cssText =
      'width:256px;height:256px;border-radius:12px;background:repeating-conic-gradient(#e4e4e7 0% 25%, #fff 0% 50%) 0 0 / 32px 32px';
    const link = document.createElement('a');
    link.href = url;
    link.download = 'icon.png';
    link.textContent = 'Download icon.png (1024×1024)';
    el.append(img, link);
  } catch (err) {
    el.textContent = `Icon export failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Bootstrap. Renderers are looked up by component type from the static
 * registry in `renderers/renderer-registry.tsx`. (Runtime plugin-driven
 * renderer registration is tracked as post-v1 — see task #28.)
 */
const rootEl = document.getElementById('root')!;

if (new URLSearchParams(location.search).has('icon')) {
  void mountIconExport(rootEl);
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
