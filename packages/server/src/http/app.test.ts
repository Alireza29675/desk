import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { DeskService } from '../core/service';
import { buildRegistry } from '../plugins';
import { openDatabase } from '../storage/db';
import { RealtimeHub } from '../ws/hub';
import { buildHttpApp } from './app';

const agent = { kind: 'agent', agentId: 'a1', sessionId: 's1' };
let db: Database;
let app: ReturnType<typeof buildHttpApp>;

beforeEach(() => {
  db = openDatabase(':memory:');
  const service = new DeskService({
    db,
    registry: buildRegistry(),
    hub: new RealtimeHub(),
    autoCommitMs: 0,
  });
  app = buildHttpApp(service);
});
afterEach(() => db.close());

const post = (path: string, body: unknown) =>
  app.fetch(
    new Request(`http://t${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
const patch = (path: string, body: unknown) =>
  app.fetch(
    new Request(`http://t${path}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
const del = (path: string) => app.fetch(new Request(`http://t${path}`, { method: 'DELETE' }));
const get = (path: string) => app.fetch(new Request(`http://t${path}`));

async function createDoc(title = 'Doc') {
  const res = await post('/api/artifacts', {
    type: 'enriched-document',
    author: agent,
    initialContent: { title, components: [] },
  });
  return (await res.json()) as { id: string; version: number };
}

describe('HTTP API', () => {
  test('GET /health is 200', async () => {
    expect((await get('/health')).status).toBe(200);
  });

  test('create → list → get round-trip', async () => {
    const a = await createDoc('Hello');
    expect(a.version).toBe(1);

    const list = (await (await get('/api/artifacts')).json()) as { items: { id: string }[] };
    expect(list.items.some((x) => x.id === a.id)).toBe(true);

    const bundle = (await (await get(`/api/a/${a.id}`)).json()) as {
      artifact: { content: { title: string } };
    };
    expect(bundle.artifact.content.title).toBe('Hello');
  });

  test('GET an unknown artifact is 404', async () => {
    expect((await get('/api/a/nope')).status).toBe(404);
  });

  test('PATCH updates working state', async () => {
    const a = await createDoc();
    const res = await patch(`/api/a/${a.id}`, { patch: { title: 'Renamed' }, author: agent });
    expect(res.status).toBe(200);
    const bundle = (await (await get(`/api/a/${a.id}`)).json()) as {
      artifact: { content: { title: string } };
    };
    expect(bundle.artifact.content.title).toBe('Renamed');
  });

  test('POST a comment, then read it back', async () => {
    const a = await createDoc();
    const res = await post(`/api/a/${a.id}/comments`, {
      anchor: { kind: 'general' },
      payload: { kind: 'text', text: 'nice' },
      author: agent,
    });
    expect(res.status).toBe(201);
    const comments = (await (await get(`/api/a/${a.id}/comments`)).json()) as { items: unknown[] };
    expect(comments.items).toHaveLength(1);
  });

  test('DELETE removes the artifact (subsequent GET is 404)', async () => {
    const a = await createDoc();
    const res = await del(`/api/a/${a.id}`);
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toMatchObject({ ok: true });
    expect((await get(`/api/a/${a.id}`)).status).toBe(404);
  });

  test('a malformed create body is rejected (non-2xx)', async () => {
    const res = await post('/api/artifacts', { nope: true });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
