import { PluginRegistryError } from '@desk/plugin-sdk';
import type { ArtifactId, CommentAnchor, CommentId, CommentPayload } from '@desk/types';
import {
  ArtifactPatchSchema,
  AuthorSchema,
  CommentAnchorSchema,
  CommentPayloadSchema,
} from '@desk/types';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { SERVER_VERSION } from '../config';
import { DeskError } from '../core/errors';
import type { DeskService } from '../core/service';
import { mountViewer } from './static';

/**
 * The HTTP surface. Data routes live under `/api/*`; the viewer SPA is served
 * for everything else (so `/a/:id` is a real, shareable client route rather
 * than an API endpoint). Routes are thin: validate, call `DeskService`, shape
 * the response. No domain logic lives in here.
 */
/** Parse a query param as a finite integer, or undefined — so junk like
 *  `?limit=abc` becomes a default rather than `NaN` flowing into SQL (LIMIT NaN
 *  throws → 500). */
function intQuery(c: Context, name: string): number | undefined {
  const raw = c.req.query(name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

export function buildHttpApp(service: DeskService): Hono {
  const app = new Hono();
  const api = new Hono();

  app.use('*', cors({ origin: '*' }));

  const onError = (err: Error, c: Context) => {
    if (err instanceof DeskError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as never);
    }
    // Invalid input — bad component/artifact data (registry validation) or a
    // malformed request body (route-level zod parse) — is a 400, not a 500.
    if (err instanceof PluginRegistryError || err instanceof z.ZodError) {
      return c.json({ error: { code: 'validation_failed', message: err.message } }, 400);
    }
    // A request body that isn't valid JSON makes `c.req.json()` throw a
    // SyntaxError. That's a client mistake (400), not a server fault (500).
    if (err instanceof SyntaxError) {
      return c.json({ error: { code: 'validation_failed', message: 'Malformed JSON body' } }, 400);
    }
    console.error('[desk-server] unhandled error', err);
    return c.json({ error: { code: 'internal', message: 'Internal server error' } }, 500);
  };
  app.onError(onError);
  api.onError(onError);

  // Root liveness probe (kept off /api so external health checks stay simple).
  app.get('/health', (c) =>
    c.json({ ok: true, server: 'desk', version: SERVER_VERSION, time: new Date().toISOString() }),
  );

  api.get('/plugins', (c) =>
    c.json({
      artifactTypes: service.registry.listArtifactTypes().map((p) => ({
        type: p.type,
        displayName: p.displayName,
        allowedComponentTypes: p.allowedComponentTypes,
      })),
      componentTypes: service.registry.listComponentTypes().map((p) => ({
        type: p.type,
        displayName: p.displayName,
      })),
      relationTypes: service.registry.listRelationTypes().map((p) => ({
        type: p.type,
        displayName: p.displayName,
        description: p.description,
        inverse: p.inverse,
      })),
    }),
  );

  // ─── artifacts ─────────────────────────────────────────────────────

  const CreateBody = z.object({
    type: z.string().min(1),
    author: AuthorSchema,
    initialContent: z
      .object({ title: z.string().optional(), components: z.array(z.unknown()).optional() })
      .optional(),
    reason: z.string().optional(),
  });

  api.post('/artifacts', async (c) => {
    const body = CreateBody.parse(await c.req.json());
    const artifact = service.createArtifact(body as never);
    return c.json(artifact, 201);
  });

  api.get('/artifacts', (c) => {
    const type = c.req.query('type');
    return c.json({
      items: service.listArtifacts({
        type,
        limit: intQuery(c, 'limit'),
        offset: intQuery(c, 'offset'),
      }),
    });
  });

  api.get('/artifacts/search', (c) => {
    const q = c.req.query('q') ?? '';
    return c.json({ items: service.searchArtifacts(q, intQuery(c, 'limit')) });
  });

  api.get('/a/:id', (c) => {
    const id = c.req.param('id') as ArtifactId;
    const artifact = service.getArtifact(id);
    const relations = service.getRelations(id);
    const comments = service.listComments(id);
    return c.json({ artifact, relations, comments });
  });

  api.get('/a/:id/v/:version', (c) => {
    const id = c.req.param('id') as ArtifactId;
    const version = Number(c.req.param('version'));
    return c.json({ artifact: service.getArtifact(id, version) });
  });

  api.get('/a/:id/history', (c) => {
    const id = c.req.param('id') as ArtifactId;
    return c.json({
      events: service.getHistory(id, { from: intQuery(c, 'from'), to: intQuery(c, 'to') }),
    });
  });

  // The authored (reset-target) checked-state of a checklist component.
  api.get('/a/:id/baseline/:componentId', (c) => {
    const id = c.req.param('id') as ArtifactId;
    return c.json(service.checklistBaseline(id, c.req.param('componentId')));
  });

  api.get('/a/:id/similar', (c) => {
    const id = c.req.param('id') as ArtifactId;
    const limit = intQuery(c, 'limit');
    return c.json({ items: service.findSimilar(id, limit) });
  });

  const PatchBody = z.object({
    patch: ArtifactPatchSchema,
    author: AuthorSchema,
  });

  api.patch('/a/:id', async (c) => {
    const id = c.req.param('id') as ArtifactId;
    const { patch, author } = PatchBody.parse(await c.req.json());
    return c.json(service.patchArtifact({ id, patch, author }));
  });

  const CommitBody = z.object({ author: AuthorSchema, reason: z.string().optional() });

  api.delete('/a/:id', (c) => {
    const id = c.req.param('id') as ArtifactId;
    service.deleteArtifact(id);
    return c.json({ ok: true, id });
  });

  api.post('/a/:id/commit', async (c) => {
    const id = c.req.param('id') as ArtifactId;
    const { author, reason } = CommitBody.parse(await c.req.json());
    return c.json(service.commit(id, author, reason));
  });

  // ─── comments ───────────────────────────────────────────────────────

  const CommentBody = z.object({
    anchor: CommentAnchorSchema,
    payload: CommentPayloadSchema,
    author: AuthorSchema,
    threadParentId: z.string().optional(),
  });

  api.post('/a/:id/comments', async (c) => {
    const artifactId = c.req.param('id') as ArtifactId;
    const body = CommentBody.parse(await c.req.json());
    return c.json(
      service.postComment({
        artifactId,
        anchor: body.anchor as CommentAnchor,
        payload: body.payload as CommentPayload,
        author: body.author,
        ...(body.threadParentId ? { threadParentId: body.threadParentId as CommentId } : {}),
      }),
      201,
    );
  });

  api.get('/a/:id/comments', (c) => {
    const artifactId = c.req.param('id') as ArtifactId;
    return c.json({ items: service.listComments(artifactId) });
  });

  api.post('/comments/:id/resolve', async (c) => {
    const id = c.req.param('id') as CommentId;
    const { resolved } = z.object({ resolved: z.boolean() }).parse(await c.req.json());
    service.resolveComment(id, resolved);
    return c.json({ ok: true });
  });

  // ─── relations ──────────────────────────────────────────────────────

  const RelationBody = z.object({
    from: z.string(),
    to: z.string(),
    type: z.string().min(1),
  });

  api.post('/relations', async (c) => {
    const body = RelationBody.parse(await c.req.json());
    return c.json(
      service.addRelation({
        from: body.from as ArtifactId,
        to: body.to as ArtifactId,
        type: body.type,
      }),
      201,
    );
  });

  api.delete('/relations', async (c) => {
    const body = RelationBody.parse(await c.req.json());
    const removed = service.removeRelation({
      from: body.from as ArtifactId,
      to: body.to as ArtifactId,
      type: body.type,
    });
    return c.json({ removed: removed ?? null });
  });

  app.route('/api', api);

  // The viewer SPA is served last, as a catch-all fallback. Every /api route
  // is matched first; unmatched GETs (/, /a/:id, /assets/*) get the SPA.
  mountViewer(app);

  return app;
}
