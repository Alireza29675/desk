// @vitest-environment happy-dom
import type { Artifact, ArtifactId, Component, ComponentId } from '@desk/types';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { useStore } from '../state/store';
import { ChecklistRenderer } from './checkbox';

vi.mock('../lib/api', () => ({
  api: {
    patchArtifact: vi.fn().mockResolvedValue({}),
    commit: vi.fn().mockResolvedValue({}),
  },
}));

const COMP_ID = 'comp-1' as ComponentId;
const ART_ID = 'a1' as ArtifactId;

function checklist(items: { id: string; label: string; checked: boolean }[]): Component {
  return { id: COMP_ID, type: 'checkbox', data: { title: 'Tasks', items } } as Component;
}

function artifactWith(component: Component): Artifact {
  return {
    id: ART_ID,
    type: 'enriched-document',
    content: { title: 'Doc', components: [component] },
    provenance: { sessionId: 's', agentId: 'a' } as never,
    contributors: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
  };
}

function openWith(component: Component, pinnedVersion?: number) {
  useStore.setState({
    open: {
      artifact: artifactWith(component),
      relations: { outgoing: [], incoming: [] },
      comments: [],
      locator: [],
      ...(pinnedVersion !== undefined ? { pinnedVersion } : {}),
    },
    commentTarget: null,
    commentDraft: null,
  });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useStore.setState({ open: null, commentTarget: null, commentDraft: null });
});

function render(component: Component) {
  act(() => root.render(<ChecklistRenderer component={component as never} artifactId={ART_ID} />));
}

async function clickBox(index = 0) {
  const boxes = container.querySelectorAll('input.checklist__box');
  await act(async () => {
    (boxes[index] as HTMLInputElement).click();
  });
}

describe('ChecklistRenderer — really checkable (item 4)', () => {
  it('toggling patches the artifact with the flipped item and commits immediately', async () => {
    const comp = checklist([{ id: 'i1', label: 'Ship', checked: false }]);
    openWith(comp);
    render(comp);
    await clickBox();

    expect(api.patchArtifact).toHaveBeenCalledOnce();
    const call = vi.mocked(api.patchArtifact).mock.calls[0];
    expect(call).toBeDefined();
    const [id, patch] = call as NonNullable<typeof call>;
    expect(id).toBe(ART_ID);
    const first = patch.components?.[0] as { data: { items: { checked: boolean }[] } };
    expect(first.data.items[0]?.checked).toBe(true);
    // The immediate commit (no 2s auto-commit window).
    expect(api.commit).toHaveBeenCalledWith(ART_ID, expect.anything(), '[checkbox]');
  });

  it('seeds the composer draft, anchored to the toggled item', async () => {
    const comp = checklist([{ id: 'i1', label: 'Ship', checked: false }]);
    openWith(comp);
    render(comp);
    await clickBox();

    const s = useStore.getState();
    expect(s.commentDraft).toBe('Checked: Ship');
    expect(s.commentTarget).toEqual({
      kind: 'element',
      componentId: COMP_ID,
      elementPath: 'items.i1',
    });
  });

  it('coalesces a second toggle on the same checklist into one draft', async () => {
    const comp = checklist([
      { id: 'i1', label: 'A', checked: false },
      { id: 'i2', label: 'B', checked: true },
    ]);
    openWith(comp);
    render(comp);
    await clickBox(0);
    await clickBox(1);

    const s = useStore.getState();
    expect(s.commentDraft).toBe('Checked: A · Unchecked: B');
    expect(s.commentTarget).toEqual({ kind: 'element', componentId: COMP_ID });
  });

  it('is read-only while time-traveling (pinned version)', async () => {
    const comp = checklist([{ id: 'i1', label: 'Ship', checked: false }]);
    openWith(comp, 1);
    render(comp);
    const box = container.querySelector('input.checklist__box') as HTMLInputElement;
    expect(box.disabled).toBe(true);
    await clickBox();
    expect(api.patchArtifact).not.toHaveBeenCalled();
  });

  it('a failed save surfaces an error and seeds NO draft (the flip never happened)', async () => {
    vi.mocked(api.patchArtifact).mockRejectedValueOnce(new Error('boom'));
    const comp = checklist([{ id: 'i1', label: 'Ship', checked: false }]);
    openWith(comp);
    render(comp);
    await clickBox();

    expect(container.querySelector('.checklist__error')).not.toBeNull();
    expect(useStore.getState().commentDraft).toBeNull();
    expect(api.commit).not.toHaveBeenCalled();
  });
});
