import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
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
