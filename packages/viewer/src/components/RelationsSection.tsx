import type { ArtifactId, RelationGraph } from '@desk/types';
import { useStore } from '../state/store';

const REL_LABEL: Record<string, string> = {
  blocks: 'Blocks',
  supports: 'Supports',
  'is-supported-by': 'Supported by',
  'refers-to': 'Refers to',
};
const label = (type: string) => REL_LABEL[type] ?? type;

/**
 * Read-only "Related" panel: surfaces an artifact's typed relations (the
 * `add_relation` graph) so the operator can hop between linked artifacts.
 * Outgoing links point away (↗), incoming point in (↙). Titles are resolved
 * from the sidebar list, which the firehose keeps current.
 */
export function RelationsSection({ relations }: { relations: RelationGraph }) {
  const artifacts = useStore((s) => s.artifacts);
  const openArtifact = useStore((s) => s.openArtifact);
  const titleOf = (id: string) => artifacts.find((a) => a.id === id)?.content.title ?? id;

  const rows = [
    ...relations.outgoing.map((r) => ({
      id: r.id,
      dir: '↗' as const,
      otherId: r.to,
      type: r.type,
      incoming: false,
    })),
    ...relations.incoming.map((r) => ({
      id: r.id,
      dir: '↙' as const,
      otherId: r.from,
      type: r.type,
      incoming: true,
    })),
  ];
  if (rows.length === 0) return null;

  return (
    <section className="relations" aria-label="Related artifacts">
      <div className="relations__label">Related</div>
      <ul className="relations__list">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className="relations__item"
              title={`${row.incoming ? 'Incoming' : 'Outgoing'} · ${label(row.type)}`}
              onClick={() => openArtifact(row.otherId as ArtifactId)}
            >
              <span className="relations__arrow" aria-hidden>
                {row.dir}
              </span>
              <span className="relations__title">{titleOf(row.otherId)}</span>
              <span className="relations__type">{label(row.type)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
