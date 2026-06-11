import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Fonts are bundled (not fetched from a CDN) — Desk is local-first and must
// paint correctly with no network. Geist/Geist Mono are variable fonts;
// Instrument Serif is the display accent and never renders below ~20px.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/instrument-serif';
import './styles/globals.css';

/**
 * Bootstrap. Renderers are looked up by component type from the static
 * registry in `renderers/renderer-registry.tsx`. (Runtime plugin-driven
 * renderer registration is tracked as post-v1 — see task #28.)
 */
const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
