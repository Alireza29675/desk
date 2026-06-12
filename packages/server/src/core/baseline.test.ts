import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { ArtifactId, Author, Component } from '@desk/types';
import { buildRegistry } from '../plugins';
import { openDatabase } from '../storage/db';
import { RealtimeHub } from '../ws/hub';
import { DeskService } from './service';

const agent = { kind: 'agent', agentId: 'a1', sessionId: 's1' } as unknown as Author;
const human = { kind: 'human', humanId: 'M' } as unknown as Author;

const checklist = (items: { id: string; label: string; checked: boolean }[]): Component =>
  ({ id: 'list-1', type: 'checkbox', data: { title: 'Tasks', items } }) as unknown as Component;

let db: Database;
let svc: DeskService;

beforeEach(() => {
  db = openDatabase(':memory:');
  svc = new DeskService({ db, registry: buildRegistry(), hub: new RealtimeHub(), autoCommitMs: 0 });
});
afterEach(() => db.close());

/** Patch the artifact replacing the checklist's items, as the given author. */
function setItems(
  id: ArtifactId,
  items: { id: string; label: string; checked: boolean }[],
  author: Author,
) {
  const current = svc.getArtifact(id);
  const components = current.content.components.map((c) =>
    c.id === 'list-1' ? checklist(items) : c,
  );
  svc.patchArtifact({ id, patch: { components }, author });
}

describe('checklistBaseline — the authored reset target (FB-R2 item 5)', () => {
  test('returns the authored checked-state, including items authored pre-checked', () => {
    const a = svc.createArtifact({
      type: 'enriched-document',
      author: agent,
      initialContent: {
        title: 'Doc',
        components: [
          checklist([
            { id: 'a', label: 'A', checked: false },
            { id: 'b', label: 'B', checked: true }, // "not in every case" — stays true on reset
          ]),
        ],
      },
    });
    expect(svc.checklistBaseline(a.id, 'list-1').items).toEqual({ a: false, b: true });
  });

  test('human toggles do not move the baseline', () => {
    const a = svc.createArtifact({
      type: 'enriched-document',
      author: agent,
      initialContent: {
        title: 'Doc',
        components: [checklist([{ id: 'a', label: 'A', checked: false }])],
      },
    });
    setItems(a.id, [{ id: 'a', label: 'A', checked: true }], human);
    svc.commit(a.id, human, '[checkbox]');
    expect(svc.checklistBaseline(a.id, 'list-1').items).toEqual({ a: false });
  });

  test('a later AGENT edit does not adopt the human checks (the contamination case)', () => {
    // Agents commit FULL working content — an agent edit after a human toggle
    // snapshots the human's check too. First-appearance must still win.
    const a = svc.createArtifact({
      type: 'enriched-document',
      author: agent,
      initialContent: {
        title: 'Doc',
        components: [checklist([{ id: 'a', label: 'A', checked: false }])],
      },
    });
    setItems(a.id, [{ id: 'a', label: 'A', checked: true }], human);
    svc.commit(a.id, human, '[checkbox]');
    // Agent adds a new (pre-checked) item; the snapshot carries a: true.
    setItems(
      a.id,
      [
        { id: 'a', label: 'A', checked: true },
        { id: 'c', label: 'C', checked: true },
      ],
      agent,
    );
    svc.commit(a.id, agent, 'add item');

    // a resets to its v1 authored false; c to its first-appearance true.
    expect(svc.checklistBaseline(a.id, 'list-1').items).toEqual({ a: false, c: true });
  });

  test('items removed by a later edit drop out of the baseline', () => {
    const a = svc.createArtifact({
      type: 'enriched-document',
      author: agent,
      initialContent: {
        title: 'Doc',
        components: [
          checklist([
            { id: 'a', label: 'A', checked: false },
            { id: 'b', label: 'B', checked: false },
          ]),
        ],
      },
    });
    setItems(a.id, [{ id: 'a', label: 'A', checked: false }], agent);
    svc.commit(a.id, agent, 'drop b');
    expect(svc.checklistBaseline(a.id, 'list-1').items).toEqual({ a: false });
  });

  test('an item not yet in any committed snapshot falls back to its current value', () => {
    const a = svc.createArtifact({
      type: 'enriched-document',
      author: agent,
      initialContent: {
        title: 'Doc',
        components: [checklist([{ id: 'a', label: 'A', checked: false }])],
      },
    });
    // Working-state-only addition (no commit) — the graceful-fallback rider.
    setItems(
      a.id,
      [
        { id: 'a', label: 'A', checked: false },
        { id: 'fresh', label: 'F', checked: true },
      ],
      agent,
    );
    expect(svc.checklistBaseline(a.id, 'list-1').items).toEqual({ a: false, fresh: true });
  });

  test('missing artifact, missing component, and non-checklist component all reject', () => {
    expect(() => svc.checklistBaseline('nope' as ArtifactId, 'list-1')).toThrow();
    const a = svc.createArtifact({
      type: 'enriched-document',
      author: agent,
      initialContent: {
        title: 'Doc',
        components: [
          { id: 'co', type: 'callout', data: { tone: 'info', title: 'T', body: 'B' } } as never,
        ],
      },
    });
    expect(() => svc.checklistBaseline(a.id, 'list-1')).toThrow();
    expect(() => svc.checklistBaseline(a.id, 'co')).toThrow();
  });
});
