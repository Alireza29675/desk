import type { Artifact, ArtifactId, Comment, CommentId, RealtimeServerMessage } from '@desk/types';
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from './store';

function artifact(id: string, title = id, version = 1): Artifact {
  return {
    id: id as ArtifactId,
    type: 'enriched-document',
    content: { title, components: [] },
    provenance: { sessionId: 's', agentId: 'a' } as never,
    contributors: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    version,
  };
}
const committed = (a: Artifact): RealtimeServerMessage =>
  ({
    kind: 's.committed',
    artifactId: a.id,
    artifact: a,
    event: { kind: 'edited' },
  }) as unknown as RealtimeServerMessage;
const openOf = (a: Artifact, comments: Comment[] = []) => ({
  artifact: a,
  relations: { outgoing: [], incoming: [] },
  comments,
  locator: [],
});

const apply = (msg: RealtimeServerMessage) => useStore.getState().applyEvent(msg);

beforeEach(() => {
  useStore.setState({ artifacts: [], open: null, realtimeConnected: false });
});

describe('store.applyEvent — sidebar (firehose)', () => {
  it('marks connected on s.welcome', () => {
    apply({ kind: 's.welcome', serverVersion: '0' } as RealtimeServerMessage);
    expect(useStore.getState().realtimeConnected).toBe(true);
  });

  it('prepends a newly-committed artifact to the sidebar', () => {
    useStore.setState({ artifacts: [artifact('a')] });
    apply(committed(artifact('b', 'Brand new')));
    expect(useStore.getState().artifacts.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('updates an existing artifact in place on commit (no duplicate)', () => {
    useStore.setState({ artifacts: [artifact('a', 'Old'), artifact('b')] });
    apply(committed(artifact('a', 'Renamed', 2)));
    const arts = useStore.getState().artifacts;
    expect(arts).toHaveLength(2);
    expect(arts.find((x) => x.id === 'a')?.content.title).toBe('Renamed');
  });

  it('removes an artifact from the sidebar on s.deleted', () => {
    useStore.setState({ artifacts: [artifact('a'), artifact('b')] });
    apply({ kind: 's.deleted', artifactId: 'a' as ArtifactId } as RealtimeServerMessage);
    expect(useStore.getState().artifacts.map((x) => x.id)).toEqual(['b']);
  });

  it('closes the open artifact when it is deleted', () => {
    useStore.setState({ artifacts: [artifact('a')], open: openOf(artifact('a')) as never });
    apply({ kind: 's.deleted', artifactId: 'a' as ArtifactId } as RealtimeServerMessage);
    expect(useStore.getState().open).toBeNull();
  });
});

describe('store.applyEvent — open artifact', () => {
  it('appends a comment to the open artifact', () => {
    useStore.setState({ open: openOf(artifact('a')) as never });
    const comment = {
      id: 'c1',
      artifactId: 'a',
      anchor: { kind: 'general' },
      payload: { kind: 'text', text: 'hi' },
    } as unknown as Comment;
    apply({ kind: 's.commented', artifactId: 'a' as ArtifactId, comment } as RealtimeServerMessage);
    expect(useStore.getState().open?.comments).toHaveLength(1);
  });

  it('ignores a comment for a different artifact', () => {
    useStore.setState({ open: openOf(artifact('a')) as never });
    const comment = {
      id: 'c1',
      artifactId: 'b',
      anchor: { kind: 'general' },
      payload: { kind: 'text', text: 'x' },
    } as unknown as Comment;
    apply({ kind: 's.commented', artifactId: 'b' as ArtifactId, comment } as RealtimeServerMessage);
    expect(useStore.getState().open?.comments).toHaveLength(0);
  });

  it('streams a live working-state edit into the open view (the "watch it form" path)', () => {
    useStore.setState({ open: openOf(artifact('a', 'Start', 1)) as never });
    // s.working_changed carries the uncommitted artifact; version stays 1.
    const edited = {
      ...artifact('a', 'Forming…', 1),
      content: { title: 'Forming…', components: [] },
    };
    apply({
      kind: 's.working_changed',
      artifactId: 'a' as ArtifactId,
      artifact: edited,
    } as RealtimeServerMessage);
    expect(useStore.getState().open?.artifact.content.title).toBe('Forming…');
    expect(useStore.getState().open?.artifact.version).toBe(1); // not a commit
  });

  it('marks a comment resolved on s.comment_resolved', () => {
    const comment = {
      id: 'c1',
      artifactId: 'a',
      anchor: { kind: 'general' },
      payload: { kind: 'text', text: 'hi' },
    } as unknown as Comment;
    useStore.setState({ open: openOf(artifact('a'), [comment]) as never });
    apply({
      kind: 's.comment_resolved',
      artifactId: 'a' as ArtifactId,
      commentId: 'c1',
      resolved: true,
    } as RealtimeServerMessage);
    expect(useStore.getState().open?.comments[0]?.resolved).toBe(true);
  });

  it('live-updates incoming AND outgoing relations regardless of event artifactId', () => {
    useStore.setState({ open: openOf(artifact('a')) as never });
    const rel = (id: string, from: string, to: string) => ({ id, from, to, type: 'refers-to' });
    // Incoming: b → a. The event's artifactId is the `from` (b), not the open artifact (a).
    apply({
      kind: 's.relation_added',
      artifactId: 'b' as ArtifactId,
      relation: rel('r1', 'b', 'a'),
    } as unknown as RealtimeServerMessage);
    expect(useStore.getState().open?.relations.incoming.map((r) => r.id)).toEqual(['r1']);
    // Outgoing: a → c.
    apply({
      kind: 's.relation_added',
      artifactId: 'a' as ArtifactId,
      relation: rel('r2', 'a', 'c'),
    } as unknown as RealtimeServerMessage);
    expect(useStore.getState().open?.relations.outgoing.map((r) => r.id)).toEqual(['r2']);
    // A relation not involving the open artifact is ignored.
    apply({
      kind: 's.relation_added',
      artifactId: 'x' as ArtifactId,
      relation: rel('r3', 'x', 'y'),
    } as unknown as RealtimeServerMessage);
    expect(useStore.getState().open?.relations.incoming).toHaveLength(1);
    expect(useStore.getState().open?.relations.outgoing).toHaveLength(1);
    // Removal clears from whichever side.
    apply({
      kind: 's.relation_removed',
      artifactId: 'b' as ArtifactId,
      relation: rel('r1', 'b', 'a'),
    } as unknown as RealtimeServerMessage);
    expect(useStore.getState().open?.relations.incoming).toHaveLength(0);
  });

  it('keeps a pinned (history) view untouched on a live commit, but still updates the sidebar', () => {
    useStore.setState({
      artifacts: [artifact('a', 'Live', 5)],
      open: { ...openOf(artifact('a', 'Old v2', 2)), pinnedVersion: 2 } as never,
    });
    apply(committed(artifact('a', 'Live v6', 6)));
    expect(useStore.getState().open?.artifact.version).toBe(2); // pinned view unchanged
    expect(useStore.getState().open?.artifact.content.title).toBe('Old v2');
    expect(useStore.getState().artifacts.find((x) => x.id === 'a')?.version).toBe(6); // sidebar live
  });

  it('reflects a commit to the open artifact in the open view', () => {
    useStore.setState({
      artifacts: [artifact('a', 'Old')],
      open: openOf(artifact('a', 'Old')) as never,
    });
    apply(committed(artifact('a', 'New', 2)));
    expect(useStore.getState().open?.artifact.content.title).toBe('New');
    expect(useStore.getState().open?.artifact.version).toBe(2);
  });
});

describe('store.setTheme — transient theme-switching class', () => {
  const root = () => document.documentElement;

  beforeEach(() => {
    vi.useFakeTimers();
    root().classList.remove('theme-switching');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds the class around the flip and removes it once the window closes', () => {
    useStore.getState().setTheme('dark');
    expect(root().dataset.theme).toBe('dark');
    expect(root().classList.contains('theme-switching')).toBe(true);
    vi.runAllTimers();
    expect(root().classList.contains('theme-switching')).toBe(false);
  });

  it('does not strand the class on a rapid double toggle (stale timeout cleared)', () => {
    useStore.getState().setTheme('dark');
    vi.advanceTimersByTime(150);
    useStore.getState().setTheme('light');
    // The first flip's timeout would have fired here; it must not — the
    // second flip owns the full window.
    vi.advanceTimersByTime(299);
    expect(root().classList.contains('theme-switching')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(root().classList.contains('theme-switching')).toBe(false);
    vi.runAllTimers();
    expect(root().classList.contains('theme-switching')).toBe(false);
  });
});

describe('store.revealInRail — rail scroll/flash target (clears itself)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useStore.setState({ railTarget: null });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets the target and auto-clears after the reveal window', () => {
    useStore.getState().revealInRail('c1' as CommentId);
    expect(useStore.getState().railTarget).toBe('c1');
    vi.advanceTimersByTime(1599);
    expect(useStore.getState().railTarget).toBe('c1');
    vi.advanceTimersByTime(1);
    expect(useStore.getState().railTarget).toBeNull();
  });

  it('a second reveal restarts the window (stale timer cleared)', () => {
    useStore.getState().revealInRail('c1' as CommentId);
    vi.advanceTimersByTime(1000);
    useStore.getState().revealInRail('c2' as CommentId);
    // The first reveal's timeout would fire here; it must not — the second
    // reveal owns the full window.
    vi.advanceTimersByTime(1599);
    expect(useStore.getState().railTarget).toBe('c2');
    vi.advanceTimersByTime(1);
    expect(useStore.getState().railTarget).toBeNull();
  });
});

describe('store.togglePanels — hide side panels (desktop)', () => {
  beforeEach(() => {
    localStorage.removeItem('desk-panels-hidden');
    useStore.setState({ panelsHidden: false });
  });

  it('flips panelsHidden and persists the choice', () => {
    expect(useStore.getState().panelsHidden).toBe(false);
    useStore.getState().togglePanels();
    expect(useStore.getState().panelsHidden).toBe(true);
    expect(localStorage.getItem('desk-panels-hidden')).toBe('1');
    useStore.getState().togglePanels();
    expect(useStore.getState().panelsHidden).toBe(false);
    expect(localStorage.getItem('desk-panels-hidden')).toBe('0');
  });

  it('reads a persisted "hidden" choice back on store creation', async () => {
    localStorage.setItem('desk-panels-hidden', '1');
    // The read happens once at create() time, so build a fresh store module.
    vi.resetModules();
    const { useStore: fresh } = await import('./store');
    expect(fresh.getState().panelsHidden).toBe(true);
    localStorage.removeItem('desk-panels-hidden');
  });
});
