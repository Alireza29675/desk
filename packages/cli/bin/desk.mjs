#!/usr/bin/env bun
// Bin wrapper for `desk`. Prefers the bundled dist (installed/published layout);
// falls back to the TypeScript source for in-repo dev. When running from the
// bundled dist, point the server at the prebuilt viewer shipped in this package
// (static.ts reads DESK_VIEWER_DIST at mountViewer() time, after this import).
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = join(here, '..', 'dist', 'desk.js');
const fromDist = existsSync(distEntry);
if (fromDist) {
  process.env.DESK_VIEWER_DIST ||= join(here, '..', 'viewer', 'dist');
}
const entry = fromDist ? distEntry : join(here, '..', 'src', 'index.ts');
await import(pathToFileURL(entry).href);
