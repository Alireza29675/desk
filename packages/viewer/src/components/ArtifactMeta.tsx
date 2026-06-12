import type { Artifact } from '@desk/types';
import { formatArtifactDate, formatArtifactDateFull } from '../lib/artifact-dates';

/** The meta line under an artifact title: type · contributors · vN · created · updated. */
export function ArtifactMeta({ artifact, className }: { artifact: Artifact; className: string }) {
  return (
    <div className={`${className} artifact-meta`}>
      {artifact.type} · {artifact.contributors.length} contributor
      {artifact.contributors.length === 1 ? '' : 's'} · v{artifact.version} · created{' '}
      <time dateTime={artifact.createdAt} title={formatArtifactDateFull(artifact.createdAt)}>
        {formatArtifactDate(artifact.createdAt)}
      </time>{' '}
      · updated{' '}
      <time dateTime={artifact.updatedAt} title={formatArtifactDateFull(artifact.updatedAt)}>
        {formatArtifactDate(artifact.updatedAt)}
      </time>
    </div>
  );
}
