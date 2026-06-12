import type { ArtifactId, ComponentId } from '@desk/types';
import { useState } from 'react';
import { api } from '../lib/api';
import { draftAfterToggle } from '../lib/checkbox-draft';
import { useStore } from '../state/store';
import type { RendererProps } from './renderer-registry';

interface Item {
  id: string;
  label: string;
  checked: boolean;
  note?: string;
}

interface Data {
  title?: string;
  items: Item[];
}

export function ChecklistRenderer({ component, artifactId }: RendererProps<Data>) {
  const { title, items } = component.data;
  // Time-traveling views are read-only: a toggle would patch LIVE state while
  // the operator is looking at the past.
  const pinned = useStore((s) => s.open?.pinnedVersion !== undefined);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  async function toggle(item: Item) {
    if (busyId !== null || pinned) return;
    setBusyId(item.id);
    setSaveFailed(false);
    const { open, author, commentTarget, commentDraft, startComment } = useStore.getState();
    if (!open) {
      setBusyId(null);
      return;
    }
    const nextChecked = !item.checked;
    const components = open.artifact.content.components.map((c) =>
      c.id === component.id
        ? {
            ...c,
            data: {
              ...component.data,
              items: items.map((i) => (i.id === item.id ? { ...i, checked: nextChecked } : i)),
            },
          }
        : c,
    );
    try {
      await api.patchArtifact(artifactId as ArtifactId, { components }, author);
      // Commit immediately: a toggle is a complete, intentional change. It
      // must not sit in the 2s auto-commit window while the draft comment
      // about it is being written.
      await api.commit(artifactId as ArtifactId, author, '[checkbox]');
      // Seed the composer draft — coalescing with a previous toggle-draft on
      // this same checklist (single slot, last-write-wins).
      const prev =
        commentDraft !== null &&
        commentTarget !== null &&
        commentTarget.kind !== 'general' &&
        commentTarget.componentId === component.id
          ? { text: commentDraft, componentId: commentTarget.componentId }
          : null;
      const draft = draftAfterToggle(prev, {
        componentId: component.id as ComponentId,
        itemId: item.id,
        label: item.label,
        checked: nextChecked,
      });
      startComment(draft.anchor, draft.text);
    } catch {
      // The flip never happened server-side; the box stays as it was. Tell
      // the operator instead of failing silently.
      setSaveFailed(true);
    } finally {
      setBusyId(null);
    }
  }

  /** Restore the checklist to its AI-authored state (server-derived baseline). */
  async function reset() {
    if (busyId !== null || pinned) return;
    setBusyId('__reset');
    setSaveFailed(false);
    const { open, author } = useStore.getState();
    if (!open) {
      setBusyId(null);
      return;
    }
    try {
      const { items: baseline } = await api.checklistBaseline(
        artifactId as ArtifactId,
        component.id,
      );
      const restored = items.map((i) => ({ ...i, checked: baseline[i.id] ?? i.checked }));
      // Already at the authored state: no patch, no version-bump noise.
      if (restored.every((r, idx) => r.checked === items[idx]?.checked)) return;
      const components = open.artifact.content.components.map((c) =>
        c.id === component.id ? { ...c, data: { ...component.data, items: restored } } : c,
      );
      await api.patchArtifact(artifactId as ArtifactId, { components }, author);
      await api.commit(artifactId as ArtifactId, author, '[checkbox reset]');
    } catch {
      setSaveFailed(true);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="component-block">
      <div className="checklist__head">
        {title ? <div style={{ fontWeight: 600 }}>{title}</div> : <span />}
        {!pinned ? (
          <button
            type="button"
            className="checklist__reset"
            disabled={busyId !== null}
            title="Restore this checklist to its authored state"
            onClick={() => void reset()}
          >
            Reset
          </button>
        ) : null}
      </div>
      {saveFailed ? (
        <div className="checklist__error" role="alert">
          Couldn’t save that change — try again.
        </div>
      ) : null}
      <ul className="checklist">
        {items.map((item) => (
          <li key={item.id} className="checklist__item">
            <input
              type="checkbox"
              aria-label={item.label}
              className="checklist__box"
              checked={item.checked}
              data-checked={String(item.checked)}
              data-busy={String(busyId === item.id)}
              disabled={pinned || busyId !== null}
              onChange={() => void toggle(item)}
            />
            <div>
              <span className="checklist__label" data-checked={String(item.checked)}>
                {item.label}
              </span>
              {item.note ? (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
                  {item.note}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
