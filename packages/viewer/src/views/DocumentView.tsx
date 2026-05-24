import type { Artifact } from '@desk/types';
import { renderers, RendererFallback } from '../renderers/renderer-registry';
import '../renderers/styles.css';

/**
 * Enriched document view. Components flow vertically with the typographic
 * scale; the comment rail (rendered separately) anchors to any component
 * by id. The view never branches on component type — it just looks up the
 * renderer in the registry.
 */
export function DocumentView({ artifact }: { artifact: Artifact }) {
  return (
    <article className="document">
      <header className="document__header">
        <h1 className="document__title serif-accent">{artifact.content.title}</h1>
        <div className="document__meta">
          {artifact.type} · {artifact.contributors.length} contributor{artifact.contributors.length === 1 ? '' : 's'} ·
          v{artifact.version}
        </div>
      </header>
      <div className="document__components">
        {artifact.content.components.map((component) => {
          const Renderer = renderers[component.type] ?? RendererFallback;
          return (
            <section key={component.id} data-component-id={component.id} className="document__component">
              <Renderer component={component} artifactId={artifact.id} />
            </section>
          );
        })}
      </div>
    </article>
  );
}
