import { useStore } from '../state/store';
import type { ArtifactId } from '@desk/types';
import { api } from '../lib/api';

export function Sidebar() {
  const artifacts = useStore((s) => s.artifacts);
  const openArtifact = useStore((s) => s.openArtifact);
  const openId = useStore((s) => s.open?.artifact.id);
  const realtimeConnected = useStore((s) => s.realtimeConnected);

  async function remove(id: ArtifactId, title: string) {
    if (!window.confirm(`Delete “${title}”? This removes it and all its comments and history. This can't be undone.`)) return;
    // The s.deleted firehose event removes it from the list (and closes it if open).
    await api.deleteArtifact(id).catch(() => {});
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__mark" aria-hidden />
        <span className="serif-accent" style={{ fontSize: 'var(--text-md)' }}>Desk</span>
        <span
          className="sidebar__pulse"
          data-on={String(realtimeConnected)}
          title={realtimeConnected ? 'Realtime connected' : 'Reconnecting…'}
        />
      </div>
      <div className="sidebar__section-label">Artifacts</div>
      <ul className="sidebar__list">
        {artifacts.length === 0 ? (
          <li className="sidebar__empty">No artifacts yet. Agents will populate this list.</li>
        ) : (
          artifacts.map((artifact) => (
            <li key={artifact.id} className="sidebar__row">
              <button
                className="sidebar__item"
                data-active={openId === artifact.id}
                onClick={() => openArtifact(artifact.id as ArtifactId)}
              >
                <span className="sidebar__item-title">{artifact.content.title || artifact.id}</span>
                <span className="sidebar__item-meta">{artifact.type}</span>
              </button>
              <button
                className="sidebar__delete"
                title="Delete artifact"
                aria-label={`Delete ${artifact.content.title || artifact.id}`}
                onClick={() => remove(artifact.id as ArtifactId, artifact.content.title || artifact.id)}
              >
                ✕
              </button>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}
