// @vitest-environment happy-dom
import type { Artifact, ArtifactId } from '@desk/types';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../state/store';
import { DocumentView } from './DocumentView';
import { PresentationView } from './PresentationView';

// created/updated use a past year so the compact form deterministically
// carries the year regardless of when the test runs.
function artifact(type: Artifact['type']): Artifact {
  return {
    id: 'art-1' as ArtifactId,
    type,
    content: { title: 'Doc', components: [] },
    provenance: { sessionId: 's', agentId: 'a' } as never,
    contributors: [],
    createdAt: '2024-03-15T12:00:00.000Z',
    updatedAt: '2024-04-20T12:00:00.000Z',
    version: 3,
  };
}

// The views read `s.open?.locator` from the store; keep an open bundle in
// place so the selector returns a stable reference while rendering.
const openOf = (a: Artifact) => ({
  artifact: a,
  relations: { outgoing: [], incoming: [] },
  comments: [],
  locator: [],
});

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
  useStore.setState({ open: null });
});

function expectMetaDates() {
  expect(container.textContent).toContain('created');
  expect(container.textContent).toContain('updated');
  expect(container.textContent).toContain('2024');
  const times = [...container.querySelectorAll('.artifact-meta time')] as HTMLTimeElement[];
  expect(times.map((t) => t.getAttribute('datetime'))).toEqual([
    '2024-03-15T12:00:00.000Z',
    '2024-04-20T12:00:00.000Z',
  ]);
  // The tooltip carries the full date.
  for (const t of times) expect(t.getAttribute('title')).toContain('2024');
}

describe('artifact meta line — created/updated always visible', () => {
  it('DocumentView shows both dates in the meta line', () => {
    const a = artifact('enriched-document');
    useStore.setState({ open: openOf(a) as never });
    act(() => root.render(<DocumentView artifact={a} />));
    expectMetaDates();
    expect(container.querySelector('.document__meta.artifact-meta')).not.toBeNull();
  });

  it('PresentationView shows the same meta line under the title row', () => {
    const a = artifact('presentation');
    useStore.setState({ open: openOf(a) as never });
    act(() => root.render(<PresentationView artifact={a} />));
    expectMetaDates();
    expect(container.querySelector('.presentation__meta.artifact-meta')).not.toBeNull();
    // The pager row stays intact next to the title.
    expect(container.querySelector('.presentation__head-row .presentation__pager')).not.toBeNull();
  });
});
