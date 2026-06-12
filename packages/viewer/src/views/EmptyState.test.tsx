// @vitest-environment happy-dom
import type { Artifact, ArtifactId } from '@desk/types';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../state/store';
import { EmptyState } from './EmptyState';

function artifact(id: string): Artifact {
  return {
    id: id as ArtifactId,
    type: 'enriched-document',
    content: { title: id, components: [] },
    provenance: { sessionId: 's', agentId: 'a' } as never,
    contributors: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useStore.setState({ artifacts: [] });
});

describe('EmptyState', () => {
  it('onboards toward connecting an agent when the desk is truly empty', () => {
    useStore.setState({ artifacts: [] });
    act(() => root.render(<EmptyState />));
    expect(container.textContent).toContain('Nothing on the desk yet');
    expect(container.textContent).toContain('/mcp');
  });

  it('points at the sidebar (not "nothing on the desk") when artifacts exist but none is open', () => {
    useStore.setState({ artifacts: [artifact('a'), artifact('b')] });
    act(() => root.render(<EmptyState />));
    expect(container.textContent).toContain('Nothing open');
    expect(container.textContent).toContain('Pick an artifact');
    // The misleading empty-desk copy must NOT appear when the desk has content.
    expect(container.textContent).not.toContain('Nothing on the desk yet');
  });

  it('falls back to the flat gradient mark when WebGL2 is unavailable', () => {
    // happy-dom has no WebGL, so this exercises the real no-GL path: the
    // hero piece mounts, fails to get a context, and yields the brand mark.
    act(() => root.render(<EmptyState />));
    expect(container.querySelector('.empty-state__mark')).not.toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
  });
});
