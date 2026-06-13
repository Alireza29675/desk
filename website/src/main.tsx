// Self-host the exact fonts the product uses (Geist / Geist Mono), the same
// @fontsource packages the viewer imports, so the site renders identically with
// no network font fetch. Instrument Serif (the product's content-typography
// voice) joins only when the site actually sets var(--font-serif) somewhere.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';

import './styles/tokens.css';
import './styles/reset.css';
import './styles/base.css';
import './styles/site.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
