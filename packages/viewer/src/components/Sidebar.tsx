import { useStore } from '../state/store';
import type { ArtifactId } from '@desk/types';

export function Sidebar() {
  const artifacts = useStore((s) => s.artifacts);
  const openArtifact = useStore((s) => s.openArtifact);
  const openId = useStore((s) => s.open?.artifact.id);
  const realtimeConnected = useStore((s) => s.realtimeConnected);

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
            <li key={artifact.id}>
              <button
                className="sidebar__item"
                data-active={openId === artifact.id}
                onClick={() => openArtifact(artifact.id as ArtifactId)}
              >
                <span className="sidebar__item-title">{artifact.content.title || artifact.id}</span>
                <span className="sidebar__item-meta">{artifact.type}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}
