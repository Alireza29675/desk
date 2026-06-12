// @vitest-environment happy-dom
import type { ArtifactId, Comment, CommentId, ComponentId } from '@desk/types';
import { describe, expect, it } from 'vitest';
import { unresolvedByComponent } from './selectors';

let n = 0;
function comment(overrides: Partial<Comment>): Comment {
  n += 1;
  return {
    id: `c${n}` as CommentId,
    artifactId: 'a1' as ArtifactId,
    anchor: { kind: 'element', componentId: 'comp-1' as ComponentId },
    author: { kind: 'human', humanId: 'M' },
    payload: { kind: 'text', text: 'hi' },
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('unresolvedByComponent — the item-10 placement query', () => {
  it('returns unresolved root comments anchored to the component, any spatial kind', () => {
    const target = comment({});
    const point = comment({
      anchor: { kind: 'point', componentId: 'comp-1' as ComponentId, offset: { x: 0.5, y: 0.5 } },
    });
    const out = unresolvedByComponent([target, point], 'comp-1');
    expect(out.map((c) => c.id)).toEqual([target.id, point.id]);
  });

  it('excludes resolved comments, replies, other components, and general anchors', () => {
    const resolved = comment({ resolved: true });
    const root = comment({});
    const reply = comment({ threadParentId: root.id });
    const other = comment({
      anchor: { kind: 'element', componentId: 'comp-2' as ComponentId },
    });
    const general = comment({ anchor: { kind: 'general' } });
    const out = unresolvedByComponent([resolved, root, reply, other, general], 'comp-1');
    expect(out.map((c) => c.id)).toEqual([root.id]);
  });

  it('treats resolved: undefined as unresolved (the flag is optional)', () => {
    const c = comment({ resolved: undefined });
    expect(unresolvedByComponent([c], 'comp-1')).toHaveLength(1);
  });
});

describe('unresolvedByComponent — multi-anchor', () => {
  const point = (cid: string): Comment['anchor'] =>
    ({
      kind: 'point',
      componentId: cid as ComponentId,
      offset: { x: 0.5, y: 0.5 },
    }) as Comment['anchor'];

  it('matches when a NON-primary anchor targets the component', () => {
    // Primary is in comp-2; the second anchor is in comp-1 — querying comp-1
    // must hit. The pre-migration `c.anchor`-only check would have missed it.
    const c = comment({ anchor: point('comp-2'), anchors: [point('comp-2'), point('comp-1')] });
    expect(unresolvedByComponent([c], 'comp-1').map((x) => x.id)).toEqual([c.id]);
  });

  it('does not match a component none of the anchors target', () => {
    const c = comment({ anchor: point('comp-2'), anchors: [point('comp-2'), point('comp-3')] });
    expect(unresolvedByComponent([c], 'comp-1')).toEqual([]);
  });

  it('matches off a real anchor even when a general anchor sits beside it', () => {
    const c = comment({
      anchor: point('comp-1'),
      anchors: [point('comp-1'), { kind: 'general' } as Comment['anchor']],
    });
    expect(unresolvedByComponent([c], 'comp-1').map((x) => x.id)).toEqual([c.id]);
  });
});
