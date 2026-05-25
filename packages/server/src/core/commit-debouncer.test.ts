import { describe, expect, test } from 'bun:test';
import type { ArtifactId, Author } from '@desk/types';
import { CommitDebouncer } from './commit-debouncer';

const A = 'art-a' as ArtifactId;
const B = 'art-b' as ArtifactId;
const agent = { kind: 'agent', agentId: 'a1', sessionId: 's1' } as unknown as Author;
const human = { kind: 'human', humanId: 'M' } as unknown as Author;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('CommitDebouncer', () => {
  test('flushAll fires pending timers with the touching author', () => {
    const fired: Array<[ArtifactId, Author]> = [];
    const d = new CommitDebouncer(1000, (id, author) => fired.push([id, author]));
    d.touch(A, agent);
    d.flushAll();
    expect(fired).toEqual([[A, agent]]);
  });

  test('a flushed artifact does not fire again from its timer', async () => {
    const fired: ArtifactId[] = [];
    const d = new CommitDebouncer(10, (id) => fired.push(id));
    d.touch(A, agent);
    d.flushAll();
    await sleep(30);
    expect(fired).toEqual([A]); // only the manual flush, the timer was cleared
  });

  test('delayMs <= 0 disables auto-commit entirely', async () => {
    const fired: ArtifactId[] = [];
    const d = new CommitDebouncer(0, (id) => fired.push(id));
    d.touch(A, agent);
    d.flushAll();
    await sleep(20);
    expect(fired).toEqual([]);
  });

  test('cancel prevents a pending auto-commit', async () => {
    const fired: ArtifactId[] = [];
    const d = new CommitDebouncer(10, (id) => fired.push(id));
    d.touch(A, agent);
    d.cancel(A);
    await sleep(30);
    expect(fired).toEqual([]);
  });

  test('the last author to touch wins (debounced snapshot)', () => {
    const fired: Author[] = [];
    const d = new CommitDebouncer(1000, (_id, author) => fired.push(author));
    d.touch(A, agent);
    d.touch(A, human); // human edited last
    d.flushAll();
    expect(fired).toEqual([human]);
  });

  test('the timer fires on its own after the delay', async () => {
    const fired: ArtifactId[] = [];
    const d = new CommitDebouncer(15, (id) => fired.push(id));
    d.touch(A, agent);
    expect(fired).toEqual([]); // not yet
    await sleep(40);
    expect(fired).toEqual([A]);
  });

  test('distinct artifacts keep independent timers', () => {
    const fired: ArtifactId[] = [];
    const d = new CommitDebouncer(1000, (id) => fired.push(id));
    d.touch(A, agent);
    d.touch(B, agent);
    d.cancel(A);
    d.flushAll();
    expect(fired).toEqual([B]);
  });
});
