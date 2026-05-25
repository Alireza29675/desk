// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Artifact, ArtifactId, Comment, RealtimeServerMessage } from '@desk/types';
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
  ({ kind: 's.committed', artifactId: a.id, artifact: a, event: { kind: 'edited' } }) as unknown as RealtimeServerMessage;
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
    const comment = { id: 'c1', artifactId: 'a', anchor: { kind: 'general' }, payload: { kind: 'text', text: 'hi' } } as unknown as Comment;
    apply({ kind: 's.commented', artifactId: 'a' as ArtifactId, comment } as RealtimeServerMessage);
    expect(useStore.getState().open?.comments).toHaveLength(1);
  });

  it('ignores a comment for a different artifact', () => {
    useStore.setState({ open: openOf(artifact('a')) as never });
    const comment = { id: 'c1', artifactId: 'b', anchor: { kind: 'general' }, payload: { kind: 'text', text: 'x' } } as unknown as Comment;
    apply({ kind: 's.commented', artifactId: 'b' as ArtifactId, comment } as RealtimeServerMessage);
    expect(useStore.getState().open?.comments).toHaveLength(0);
  });

  it('marks a comment resolved on s.comment_resolved', () => {
    const comment = { id: 'c1', artifactId: 'a', anchor: { kind: 'general' }, payload: { kind: 'text', text: 'hi' } } as unknown as Comment;
    useStore.setState({ open: openOf(artifact('a'), [comment]) as never });
    apply({ kind: 's.comment_resolved', artifactId: 'a' as ArtifactId, commentId: 'c1', resolved: true } as RealtimeServerMessage);
    expect(useStore.getState().open?.comments[0]?.resolved).toBe(true);
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
    useStore.setState({ artifacts: [artifact('a', 'Old')], open: openOf(artifact('a', 'Old')) as never });
    apply(committed(artifact('a', 'New', 2)));
    expect(useStore.getState().open?.artifact.content.title).toBe('New');
    expect(useStore.getState().open?.artifact.version).toBe(2);
  });
});
