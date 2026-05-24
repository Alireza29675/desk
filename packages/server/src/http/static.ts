import { join } from 'node:path';
import type { Hono } from 'hono';

/**
 * Serve the built viewer (an SPA) from `@desk/viewer/dist`. Registered as the
 * last route on the HTTP app, so every API route defined before it wins; only
 * unmatched GETs fall through to here. Unknown paths resolve to `index.html`
 * (SPA fallback) — the viewer has no server-side routing of its own.
 *
 * Path resolution: when running from source the server module sits at
 * `packages/server/src`, so the viewer build is two levels up under
 * `packages/viewer/dist`. `DESK_VIEWER_DIST` overrides this for packaged
 * builds where the layout differs.
 */
const DEFAULT_VIEWER_DIST = join(import.meta.dir, '../../../viewer/dist');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
};

function contentType(path: string): string | undefined {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? undefined : CONTENT_TYPES[path.slice(dot)];
}

export function mountViewer(app: Hono, viewerDist: string = process.env.DESK_VIEWER_DIST ?? DEFAULT_VIEWER_DIST): void {
  app.get('*', async (c) => {
    const pathname = new URL(c.req.url).pathname;
    const requested = pathname === '/' ? '/index.html' : pathname;

    // Resolve the asset; on miss, fall back to index.html for SPA routing.
    let file = Bun.file(join(viewerDist, requested));
    let resolvedPath = requested;
    if (!(await file.exists())) {
      resolvedPath = '/index.html';
      file = Bun.file(join(viewerDist, 'index.html'));
    }

    if (!(await file.exists())) {
      return c.text(
        'Desk viewer is not built yet. Run `bun run --filter @desk/viewer build`, then restart the server.',
        503,
      );
    }

    const type = contentType(resolvedPath);
    return new Response(file, type ? { headers: { 'content-type': type } } : undefined);
  });
}
