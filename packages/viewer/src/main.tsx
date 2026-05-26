import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { RegistryProvider, buildViewerRegistry } from './lib/registry';
import './styles/globals.css';

/**
 * Bootstrap. The plugin registry holds the same artifact + component +
 * relation set as the server (built-ins for now; user plugins land here
 * through a future config loader). Renderers are looked up by component
 * type from the React-side registry in `lib/renderers.tsx`.
 */
const root = createRoot(document.getElementById('root')!);
const registry = buildViewerRegistry();

root.render(
  <StrictMode>
    <RegistryProvider registry={registry}>
      <App />
    </RegistryProvider>
  </StrictMode>,
);
