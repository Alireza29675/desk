import type { HistoryEvent } from '@desk/types';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../state/store';

/**
 * History scrubber. Lists an artifact's committed versions (the `created` /
 * `edited` events) as a timeline; clicking one pins the open view to that
 * past snapshot via the store, and the latest chip returns to live. Live
 * edits keep streaming into the sidebar while a past version is pinned — the
 * store leaves the pinned view untouched until you come back to latest.
 */
export function HistoryBar() {
  const open = useStore((s) => s.open);
  const scrub = useStore((s) => s.scrubToVersion);
  const pinned = useStore((s) => s.open?.pinnedVersion);
  // Live (max) version comes from the sidebar entry, which the firehose keeps current.
  const liveVersion = useStore((s) => s.artifacts.find((a) => a.id === open?.artifact.id)?.version);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const id = open?.artifact.id;

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch only on id + liveVersion (a new commit), not on api identity
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .history(id)
      .then(({ events }) => {
        if (!cancelled) setEvents(events);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Refetch when a new version lands (liveVersion bumps).
  }, [id, liveVersion]);

  // Distinct versioned snapshots, oldest → newest.
  const versions = events
    .filter((e) => e.kind === 'created' || e.kind === 'edited')
    .sort((a, b) => a.version - b.version);
  if (versions.length <= 1) return null; // nothing to scrub yet

  const latest = versions[versions.length - 1]?.version ?? liveVersion ?? 1;
  const current = pinned ?? latest;

  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled control group has no clean native element
    <div className="history-bar" role="group" aria-label="Version history">
      <span className="history-bar__label">History</span>
      <div className="history-bar__track">
        {versions.map((e) => {
          const isLatest = e.version === latest;
          const who = e.author.kind === 'human' ? e.author.humanId : e.author.agentId;
          return (
            <button
              type="button"
              key={e.version}
              className="history-bar__chip"
              data-active={e.version === current ? 'true' : undefined}
              data-latest={isLatest ? 'true' : undefined}
              title={`v${e.version} · ${who} · ${new Date(e.createdAt).toLocaleString()}${e.reason ? ` · ${e.reason}` : ''}`}
              onClick={() => scrub(isLatest ? null : e.version)}
            >
              v{e.version}
            </button>
          );
        })}
      </div>
      {pinned !== undefined ? (
        <div className="history-bar__pinned">
          <span>Viewing v{pinned} (read-only)</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => scrub(null)}>
            Back to latest →
          </button>
        </div>
      ) : null}
    </div>
  );
}
