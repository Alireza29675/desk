import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import type { ArtifactId, Author, Component, RealtimeServerMessage } from '@desk/types';
import { buildRegistry } from '../plugins';
import { openDatabase } from '../storage/db';
import { ALL_ARTIFACTS, RealtimeHub } from '../ws/hub';
import { DeskService } from './service';

const agent = { kind: 'agent', agentId: 'a1', sessionId: 's1' } as unknown as Author;
const callout = (id: string): Component =>
  ({ id, type: 'callout', data: { tone: 'info', title: 'T', body: 'B' } }) as unknown as Component;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let db: Database;
let svc: DeskService;
let events: RealtimeServerMessage[];

function makeService(autoCommitMs = 0): DeskService {
  const hub = new RealtimeHub();
  const service = new DeskService({ db, registry: buildRegistry(), hub, autoCommitMs });
  events = [];
  service.subscribe(ALL_ARTIFACTS, { send: (m) => events.push(m) });
  events.length = 0; // drop the initial s.subscribed
  return service;
}

beforeEach(() => {
  db = openDatabase(':memory:');
  svc = makeService();
});
afterEach(() => db.close());

const kinds = () => events.map((e) => e.kind);

describe('DeskService — artifact lifecycle', () => {
  test('createArtifact starts at version 1, logs created, emits s.committed', () => {
    const a = svc.createArtifact({ type: 'enriched-document', author: agent });
    expect(a.version).toBe(1);
    expect(svc.getHistory(a.id).map((h) => h.kind)).toEqual(['created']);
    expect(kinds()).toContain('s.committed');
  });

  test('createArtifact rejects an unknown type', () => {
    expect(() => svc.createArtifact({ type: 'no-such-type', author: agent })).toThrow();
  });

  test('createArtifact rejects content that fails component validation', () => {
    const bad = { id: 'x', type: 'callout', data: {} } as unknown as Component;
    expect(() =>
      svc.createArtifact({ type: 'enriched-document', author: agent, initialContent: { title: 'X', components: [bad] } }),
    ).toThrow();
  });

  test('patchArtifact updates working state without bumping version (s.working_changed)', () => {
    const a = svc.createArtifact({ type: 'enriched-document', author: agent });
    events.length = 0;
    const patched = svc.patchArtifact({ id: a.id, patch: { title: 'New' }, author: agent });
    expect(patched.version).toBe(1); // working state, not committed
    expect(patched.content.title).toBe('New');
    expect(kinds()).toEqual(['s.working_changed']);
  });

  test('commit bumps version, logs edited, emits s.committed', () => {
    const a = svc.createArtifact({ type: 'enriched-document', author: agent });
    svc.patchArtifact({ id: a.id, patch: { title: 'V2' }, author: agent });
    events.length = 0;
    const committed = svc.commit(a.id, agent, 'snapshot');
    expect(committed.version).toBe(2);
    expect(svc.getHistory(a.id).map((h) => h.kind)).toEqual(['created', 'edited']);
    expect(kinds()).toContain('s.committed');
  });

  test('time-travel: getArtifact at an old version returns that snapshot', () => {
    const a = svc.createArtifact({ type: 'enriched-document', author: agent, initialContent: { title: 'one', components: [] } });
    svc.patchArtifact({ id: a.id, patch: { title: 'two' }, author: agent });
    svc.commit(a.id, agent);
    expect(svc.getArtifact(a.id).content.title).toBe('two');
    expect(svc.getArtifact(a.id, 1).content.title).toBe('one');
  });

  test('getArtifact throws for a missing id', () => {
    expect(() => svc.getArtifact('missing' as ArtifactId)).toThrow();
  });
});

describe('DeskService — comments & anchors', () => {
  test('a general comment posts and emits s.commented', () => {
    const a = svc.createArtifact({ type: 'enriched-document', author: agent });
    events.length = 0;
    svc.postComment({ artifactId: a.id, anchor: { kind: 'general' }, payload: { kind: 'text', text: 'hi' }, author: agent });
    expect(kinds()).toContain('s.commented');
    expect(svc.listComments(a.id)).toHaveLength(1);
  });

  test('an element anchor must reference a real component', () => {
    const a = svc.createArtifact({
      type: 'enriched-document',
      author: agent,
      initialContent: { title: 'X', components: [callout('c1')] },
    });
    // valid
    expect(() =>
      svc.postComment({ artifactId: a.id, anchor: { kind: 'element', componentId: 'c1' as never }, payload: { kind: 'text', text: 'ok' }, author: agent }),
    ).not.toThrow();
    // dangling
    expect(() =>
      svc.postComment({ artifactId: a.id, anchor: { kind: 'element', componentId: 'nope' as never }, payload: { kind: 'text', text: 'no' }, author: agent }),
    ).toThrow();
  });
});

describe('DeskService — relations', () => {
  test('addRelation links two artifacts; self-relations and unknown types reject', () => {
    const a = svc.createArtifact({ type: 'enriched-document', author: agent });
    const b = svc.createArtifact({ type: 'enriched-document', author: agent });
    expect(() => svc.addRelation({ from: a.id, to: b.id, type: 'refers-to' })).not.toThrow();
    expect(() => svc.addRelation({ from: a.id, to: a.id, type: 'refers-to' })).toThrow();
    expect(() => svc.addRelation({ from: a.id, to: b.id, type: 'bogus' as never })).toThrow();
  });
});

describe('DeskService — delete', () => {
  test('deleteArtifact removes it, emits s.deleted, and getArtifact then throws', () => {
    const a = svc.createArtifact({ type: 'enriched-document', author: agent });
    events.length = 0;
    svc.deleteArtifact(a.id);
    expect(kinds()).toContain('s.deleted');
    expect(() => svc.getArtifact(a.id)).toThrow();
  });

  test('deleting a missing artifact throws', () => {
    expect(() => svc.deleteArtifact('missing' as ArtifactId)).toThrow();
  });

  test('delete cascades to the artifact’s comments and history rows', () => {
    const a = svc.createArtifact({ type: 'enriched-document', author: agent });
    svc.postComment({ artifactId: a.id, anchor: { kind: 'general' }, payload: { kind: 'text', text: 'hi' }, author: agent });
    const count = (table: string) =>
      (db.query(`SELECT count(*) c FROM ${table} WHERE artifact_id = ?`).get(a.id) as { c: number }).c;
    expect(count('comments')).toBe(1);
    expect(count('history_events')).toBeGreaterThan(0);
    svc.deleteArtifact(a.id);
    expect(count('comments')).toBe(0);
    expect(count('history_events')).toBe(0);
  });
});

describe('DeskService — auto-commit on idle', () => {
  test('a patch auto-commits after the idle delay', async () => {
    const service = makeService(15);
    const a = service.createArtifact({ type: 'enriched-document', author: agent });
    service.patchArtifact({ id: a.id, patch: { title: 'edited' }, author: agent });
    expect(service.getArtifact(a.id).version).toBe(1); // not yet
    await sleep(45);
    expect(service.getArtifact(a.id).version).toBe(2); // auto-committed
  });

  test('an explicit commit cancels the pending auto-commit (no double bump)', async () => {
    const service = makeService(15);
    const a = service.createArtifact({ type: 'enriched-document', author: agent });
    service.patchArtifact({ id: a.id, patch: { title: 'edited' }, author: agent });
    service.commit(a.id, agent);
    await sleep(45);
    expect(service.getArtifact(a.id).version).toBe(2); // exactly one bump
  });
});
