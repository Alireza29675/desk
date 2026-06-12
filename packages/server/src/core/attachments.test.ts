import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { ArtifactId, Author, RealtimeServerMessage } from '@desk/types';
import { buildHttpApp } from '../http/app';
import { buildRegistry } from '../plugins';
import { openDatabase } from '../storage/db';
import { ALL_ARTIFACTS, RealtimeHub } from '../ws/hub';
import { DeskService } from './service';

const human = { kind: 'human', humanId: 'M' } as unknown as Author;
const agent = { kind: 'agent', agentId: 'a1', sessionId: 's1' } as unknown as Author;

/** A real 1×1 transparent PNG. */
const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let db: Database;
let svc: DeskService;
let events: RealtimeServerMessage[];

beforeEach(() => {
  db = openDatabase(':memory:');
  svc = new DeskService({ db, registry: buildRegistry(), hub: new RealtimeHub(), autoCommitMs: 0 });
  events = [];
  svc.subscribe(ALL_ARTIFACTS, { send: (m) => events.push(m) });
  events.length = 0;
});
afterEach(() => db.close());

function makeArtifact(): ArtifactId {
  return svc.createArtifact({ type: 'enriched-document', author: agent }).id;
}

const anchor = { kind: 'general' } as const;
const payload = { kind: 'text', text: 'look here' } as const;

describe('comment attachments — protocol + storage (FB-R2 item 12)', () => {
  test('a posted attachment comes back as envelope metadata with real PNG dimensions', () => {
    const id = makeArtifact();
    const comment = svc.postComment({
      artifactId: id,
      anchor,
      payload,
      author: human,
      attachments: [{ kind: 'image', dataUrl: PNG_1X1 }],
    });
    expect(comment.attachments).toHaveLength(1);
    const meta = comment.attachments?.[0];
    expect(meta?.kind).toBe('image');
    expect(meta?.mediaType).toBe('image/png');
    expect(meta?.width).toBe(1);
    expect(meta?.height).toBe(1);
  });

  test('listComments hydrates attachment metadata; bytes round-trip via getAttachment', () => {
    const id = makeArtifact();
    const posted = svc.postComment({
      artifactId: id,
      anchor,
      payload,
      author: human,
      attachments: [{ kind: 'image', dataUrl: PNG_1X1 }],
    });
    const listed = svc.listComments(id);
    expect(listed[0]?.attachments?.[0]?.id).toBe(posted.attachments?.[0]?.id as never);

    const attachmentId = posted.attachments?.[0]?.id;
    const { mediaType, bytes } = svc.getAttachment(attachmentId as never);
    expect(mediaType).toBe('image/png');
    // PNG signature survives the store round-trip.
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  test('the s.commented realtime event carries the attachment metadata (the channel reads this)', () => {
    const id = makeArtifact();
    events.length = 0;
    svc.postComment({
      artifactId: id,
      anchor,
      payload,
      author: human,
      attachments: [{ kind: 'image', dataUrl: PNG_1X1 }],
    });
    const commented = events.find((e) => e.kind === 's.commented') as {
      comment: { attachments?: unknown[] };
    };
    expect(commented.comment.attachments).toHaveLength(1);
  });

  test('rejects: too many, oversized, junk base64, and non-PNG bytes — comment is never stored', () => {
    const id = makeArtifact();
    const img = { kind: 'image', dataUrl: PNG_1X1 } as const;
    expect(() =>
      svc.postComment({
        artifactId: id,
        anchor,
        payload,
        author: human,
        attachments: [img, img, img, img, img],
      }),
    ).toThrow(/at most 4/);
    expect(() =>
      svc.postComment({
        artifactId: id,
        anchor,
        payload,
        author: human,
        // Size bound trips on length before any decode work.
        attachments: [{ kind: 'image', dataUrl: `data:image/png;base64,${'A'.repeat(2_900_000)}` }],
      }),
    ).toThrow(/limit/);
    expect(() =>
      svc.postComment({
        artifactId: id,
        anchor,
        payload,
        author: human,
        attachments: [{ kind: 'image', dataUrl: 'data:image/png;base64,!!!not-base64!!!' }],
      }),
    ).toThrow(/base64/);
    expect(() =>
      svc.postComment({
        artifactId: id,
        anchor,
        payload,
        author: human,
        attachments: [
          {
            kind: 'image',
            dataUrl: `data:image/png;base64,${btoa('definitely not a png, just long enough text')}`,
          },
        ],
      }),
    ).toThrow(/not a PNG/);
    // None of the failures left a comment behind.
    expect(svc.listComments(id)).toHaveLength(0);
  });

  test('deleting the artifact cascades the attachment rows away', () => {
    const id = makeArtifact();
    const posted = svc.postComment({
      artifactId: id,
      anchor,
      payload,
      author: human,
      attachments: [{ kind: 'image', dataUrl: PNG_1X1 }],
    });
    svc.deleteArtifact(id);
    expect(() => svc.getAttachment(posted.attachments?.[0]?.id as never)).toThrow(/not found/);
  });
});

describe('comment attachments — HTTP surface', () => {
  test('POST comment with attachment, then GET the bytes with an image content-type', async () => {
    const app = buildHttpApp(svc);
    const id = makeArtifact();
    const post = await app.fetch(
      new Request(`http://t/api/a/${id}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          anchor,
          payload,
          author: human,
          attachments: [{ kind: 'image', dataUrl: PNG_1X1 }],
        }),
      }),
    );
    expect(post.status).toBe(201);
    const comment = (await post.json()) as { attachments: { id: string }[] };
    expect(comment.attachments).toHaveLength(1);

    const got = await app.fetch(
      new Request(`http://t/api/attachments/${comment.attachments[0]?.id}`),
    );
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/png');
    const bytes = new Uint8Array(await got.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  test('GET a missing attachment is a clean 404', async () => {
    const app = buildHttpApp(svc);
    const res = await app.fetch(new Request('http://t/api/attachments/nope'));
    expect(res.status).toBe(404);
  });

  test('a non-PNG data-URL bounces as 400 at the schema boundary', async () => {
    const app = buildHttpApp(svc);
    const id = makeArtifact();
    const res = await app.fetch(
      new Request(`http://t/api/a/${id}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          anchor,
          payload,
          author: human,
          attachments: [{ kind: 'image', dataUrl: 'data:image/jpeg;base64,abcd' }],
        }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
