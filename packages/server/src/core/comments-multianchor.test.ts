import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { ArtifactId, Author, CommentAnchor, Component } from '@desk/types';
import { buildHttpApp } from '../http/app';
import { buildRegistry } from '../plugins';
import { openDatabase } from '../storage/db';
import { RealtimeHub } from '../ws/hub';
import { DeskService } from './service';

const agent = { kind: 'agent', agentId: 'a1', sessionId: 's1' } as unknown as Author;
const callout = (id: string): Component =>
  ({ id, type: 'callout', data: { tone: 'info', title: 'T', body: 'B' } }) as unknown as Component;
const payload = { kind: 'text', text: 'see these' } as const;
/** A real 1×1 transparent PNG. */
const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let db: Database;
let svc: DeskService;

beforeEach(() => {
  db = openDatabase(':memory:');
  svc = new DeskService({ db, registry: buildRegistry(), hub: new RealtimeHub(), autoCommitMs: 0 });
});
afterEach(() => db.close());

function artifactWith(...componentIds: string[]): ArtifactId {
  return svc.createArtifact({
    type: 'enriched-document',
    author: agent,
    initialContent: { title: 'X', components: componentIds.map(callout) },
  }).id;
}

const numeric = (a: number, b: number) => a - b;

describe('multi-anchor — payload', () => {
  test('one comment anchors to an array of mixed selections; anchor === anchors[0]', () => {
    const id = artifactWith('c1', 'c2');
    const anchors: CommentAnchor[] = [
      {
        kind: 'region',
        componentId: 'c1' as never,
        region: { kind: 'fractional', x: 0.1, y: 0.1, width: 0.3, height: 0.2 },
      },
      { kind: 'text-selection', componentId: 'c2' as never, start: 0, end: 4 },
    ];
    const c = svc.postComment({ artifactId: id, anchors, payload, author: agent });
    expect(c.anchors).toEqual(anchors);
    expect(c.anchor).toEqual(anchors[0]!); // transitional primary

    const listed = svc.listComments(id)[0];
    expect(listed?.anchors).toEqual(anchors);
    expect(listed?.anchor).toEqual(anchors[0]!);
  });

  test('per-anchor capture: each image carries its anchorIndex back-ref through the store', () => {
    const id = artifactWith('c1', 'c2');
    const anchors: CommentAnchor[] = [
      {
        kind: 'region',
        componentId: 'c1' as never,
        region: { kind: 'fractional', x: 0, y: 0, width: 0.5, height: 0.5 },
      },
      { kind: 'point', componentId: 'c2' as never, offset: { x: 0.5, y: 0.5 } },
    ];
    const c = svc.postComment({
      artifactId: id,
      anchors,
      payload,
      author: agent,
      attachments: [
        { kind: 'image', dataUrl: PNG_1X1, anchorIndex: 0 },
        { kind: 'image', dataUrl: PNG_1X1, anchorIndex: 1 },
      ],
    });
    expect(c.attachments?.map((a) => a.anchorIndex).sort(numeric)).toEqual([0, 1]);

    // Survives the store round-trip (listComments rehydrates from the table).
    const listed = svc.listComments(id)[0];
    expect(listed?.attachments?.map((a) => a.anchorIndex).sort(numeric)).toEqual([0, 1]);
  });

  test('an attachment whose anchorIndex is out of range is rejected; nothing stored', () => {
    const id = artifactWith('c1');
    expect(() =>
      svc.postComment({
        artifactId: id,
        anchors: [{ kind: 'point', componentId: 'c1' as never, offset: { x: 0.5, y: 0.5 } }],
        payload,
        author: agent,
        attachments: [{ kind: 'image', dataUrl: PNG_1X1, anchorIndex: 3 }],
      }),
    ).toThrow(/out of range/);
    expect(svc.listComments(id)).toHaveLength(0);
  });

  test('two attachments on the same anchorIndex are rejected (one image per selection)', () => {
    const id = artifactWith('c1', 'c2');
    expect(() =>
      svc.postComment({
        artifactId: id,
        anchors: [
          {
            kind: 'region',
            componentId: 'c1' as never,
            region: { kind: 'fractional', x: 0, y: 0, width: 1, height: 1 },
          },
          { kind: 'point', componentId: 'c2' as never, offset: { x: 0.5, y: 0.5 } },
        ],
        payload,
        author: agent,
        attachments: [
          { kind: 'image', dataUrl: PNG_1X1, anchorIndex: 0 },
          { kind: 'image', dataUrl: PNG_1X1, anchorIndex: 0 },
        ],
      }),
    ).toThrow(/same selection/);
    expect(svc.listComments(id)).toHaveLength(0);
  });

  test('the s.commented event carries the full anchors array (the channel reads this)', () => {
    const events: { kind: string; comment?: { anchors?: unknown[] } }[] = [];
    const hub = new RealtimeHub();
    const service = new DeskService({ db, registry: buildRegistry(), hub, autoCommitMs: 0 });
    const id = service.createArtifact({
      type: 'enriched-document',
      author: agent,
      initialContent: { title: 'X', components: [callout('c1'), callout('c2')] },
    }).id;
    service.subscribe('*' as ArtifactId, { send: (m) => events.push(m as never) });
    service.postComment({
      artifactId: id,
      anchors: [
        { kind: 'element', componentId: 'c1' as never },
        { kind: 'element', componentId: 'c2' as never },
      ],
      payload,
      author: agent,
    });
    const commented = events.find((e) => e.kind === 's.commented');
    expect(commented?.comment?.anchors).toHaveLength(2);
  });
});

describe('multi-anchor — validateAnchors', () => {
  test('an empty anchor set is rejected', () => {
    const id = artifactWith('c1');
    expect(() => svc.postComment({ artifactId: id, anchors: [], payload, author: agent })).toThrow(
      /at least one/,
    );
  });

  test('more than the max (8) is rejected', () => {
    const id = artifactWith('c1');
    const many: CommentAnchor[] = Array.from({ length: 9 }, () => ({
      kind: 'element',
      componentId: 'c1' as never,
    }));
    expect(() =>
      svc.postComment({ artifactId: id, anchors: many, payload, author: agent }),
    ).toThrow(/at most 8/);
  });

  test('general is exclusive — it cannot be combined with a tethered selection', () => {
    const id = artifactWith('c1');
    expect(() =>
      svc.postComment({
        artifactId: id,
        anchors: [{ kind: 'general' }, { kind: 'element', componentId: 'c1' as never }],
        payload,
        author: agent,
      }),
    ).toThrow(/document-level/);
  });

  test('any dangling component in the set rejects the whole comment (atomic)', () => {
    const id = artifactWith('c1');
    expect(() =>
      svc.postComment({
        artifactId: id,
        anchors: [
          { kind: 'element', componentId: 'c1' as never },
          { kind: 'element', componentId: 'ghost' as never },
        ],
        payload,
        author: agent,
      }),
    ).toThrow(/not present/);
    expect(svc.listComments(id)).toHaveLength(0);
  });

  test('a document-level comment is a single general anchor', () => {
    const id = artifactWith('c1');
    const c = svc.postComment({
      artifactId: id,
      anchors: [{ kind: 'general' }],
      payload,
      author: agent,
    });
    expect(c.anchors).toEqual([{ kind: 'general' }]);
  });
});

describe('multi-anchor — migration (additive, lossless, idempotent on real ~/.desk data)', () => {
  // Migration 2 adds `comments.anchors` and backfills each legacy single anchor
  // into a 1-element array, KEEPING the `anchor` shadow column. These pin the
  // Executor's safety bar: a legacy row round-trips byte-identical, the backfill
  // is idempotent (safe to re-run), and new rows dual-write both columns.
  const legacyAnchor: CommentAnchor = {
    kind: 'point',
    componentId: 'c1' as never,
    offset: { x: 0.25, y: 0.75 },
  };
  // Kept in sync with the migration SQL in db.ts (including the json_valid guard).
  const BACKFILL =
    'UPDATE comments SET anchors = json_array(json(anchor)) WHERE anchors IS NULL AND json_valid(anchor)';

  function insertLegacyRow(artifactId: ArtifactId, commentId: string, anchorCell?: string): void {
    // A pre-FB-R3 row: `anchor` set, `anchors` NULL (as if written before the
    // backfill ran). `anchorCell` overrides the stored anchor text to simulate
    // a corrupt/hand-edited row.
    db.query(
      `INSERT INTO comments (id, artifact_id, anchor, anchors, author, payload, thread_parent_id, resolved, created_at)
       VALUES (?, ?, ?, NULL, ?, ?, NULL, 0, ?)`,
    ).run(
      commentId,
      artifactId,
      anchorCell ?? JSON.stringify(legacyAnchor),
      JSON.stringify(agent),
      JSON.stringify(payload),
      new Date().toISOString(),
    );
  }

  test('a legacy single-anchor row (anchors NULL) reads back as a 1-element array — byte-identical', () => {
    const id = artifactWith('c1');
    insertLegacyRow(id, 'legacy-1');
    const listed = svc.listComments(id)[0];
    expect(listed?.anchors).toEqual([legacyAnchor]);
    expect(listed?.anchor).toEqual(legacyAnchor); // primary matches the original singular anchor
  });

  test('the backfill populates anchors and is idempotent (safe to re-run, no double-wrap)', () => {
    const id = artifactWith('c1');
    insertLegacyRow(id, 'legacy-2');
    db.query(BACKFILL).run();
    const after1 = db
      .query<{ anchors: string }, [string]>('SELECT anchors FROM comments WHERE id = ?')
      .get('legacy-2');
    expect(JSON.parse(after1!.anchors)).toEqual([legacyAnchor]);
    db.query(BACKFILL).run(); // re-run
    const after2 = db
      .query<{ anchors: string }, [string]>('SELECT anchors FROM comments WHERE id = ?')
      .get('legacy-2');
    expect(after2!.anchors).toBe(after1!.anchors);
  });

  test('a malformed legacy anchor cell does not abort the backfill (DB never bricks)', () => {
    // The migration runs in a transaction; an unguarded `json(anchor)` would
    // throw on a corrupt cell and roll the WHOLE migration back, leaving the DB
    // unopenable forever. The json_valid guard degrades it to one bad row.
    const id = artifactWith('c1');
    insertLegacyRow(id, 'good', JSON.stringify(legacyAnchor));
    insertLegacyRow(id, 'corrupt', 'not valid json at all');
    expect(() => db.query(BACKFILL).run()).not.toThrow();
    const good = db
      .query<{ anchors: string | null }, [string]>('SELECT anchors FROM comments WHERE id = ?')
      .get('good');
    const corrupt = db
      .query<{ anchors: string | null }, [string]>('SELECT anchors FROM comments WHERE id = ?')
      .get('corrupt');
    expect(JSON.parse(good!.anchors as string)).toEqual([legacyAnchor]); // valid row backfilled
    expect(corrupt!.anchors).toBeNull(); // corrupt row left untouched, not fatal
  });

  test('a new multi-anchor comment dual-writes both columns; anchor = anchors[0]', () => {
    const id = artifactWith('c1', 'c2');
    const anchors: CommentAnchor[] = [
      { kind: 'element', componentId: 'c1' as never },
      { kind: 'element', componentId: 'c2' as never },
    ];
    const c = svc.postComment({ artifactId: id, anchors, payload, author: agent });
    const row = db
      .query<{ anchor: string; anchors: string }, [string]>(
        'SELECT anchor, anchors FROM comments WHERE id = ?',
      )
      .get(c.id as unknown as string);
    expect(JSON.parse(row!.anchors)).toEqual(anchors);
    expect(JSON.parse(row!.anchor)).toEqual(anchors[0]!); // shadow = primary
  });
});

describe('multi-anchor — HTTP back-compat', () => {
  test('a legacy singular `anchor` body is normalized to a 1-element anchors array', async () => {
    const app = buildHttpApp(svc);
    const id = artifactWith('c1');
    const res = await app.fetch(
      new Request(`http://t/api/a/${id}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          anchor: { kind: 'element', componentId: 'c1' },
          payload,
          author: agent,
        }),
      }),
    );
    expect(res.status).toBe(201);
    const c = (await res.json()) as { anchors: CommentAnchor[] };
    expect(c.anchors).toEqual([{ kind: 'element', componentId: 'c1' } as CommentAnchor]);
  });
});
