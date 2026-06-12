import type { Artifact } from '@desk/types';
import { locatorValue } from '@desk/types';
import { useEffect } from 'react';
import { ArtifactMeta } from '../components/ArtifactMeta';
import { Commentable } from '../components/Commentable';
import { RenderedComponent } from '../renderers/renderer-registry';
import { useStore } from '../state/store';
import '../renderers/styles.css';

/**
 * Enriched document view. Components flow vertically with the typographic
 * scale. Its deep-link vocabulary is `component:<id>` — opening
 * `/a/<id>#component:s7-code` scrolls that component into view and pulses it.
 */
export function DocumentView({ artifact }: { artifact: Artifact }) {
  const locator = useStore((s) => s.open?.locator ?? []);
  const target = locatorValue(locator, 'component');

  useEffect(() => {
    if (!target) return;
    const el = document.querySelector<HTMLElement>(`[data-component-id="${cssEscape(target)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('deep-link-target');
    const timer = setTimeout(() => el.classList.remove('deep-link-target'), 1400);
    return () => clearTimeout(timer);
  }, [target]);

  return (
    <article className="document">
      <header className="document__header">
        <h1 className="document__title serif-accent">{artifact.content.title}</h1>
        <ArtifactMeta artifact={artifact} className="document__meta" />
      </header>
      <div className="document__components">
        {artifact.content.components.map((component) => (
          <Commentable
            key={component.id}
            componentId={component.id}
            className="document__component"
          >
            <RenderedComponent component={component} artifactId={artifact.id} />
          </Commentable>
        ))}
      </div>
    </article>
  );
}

/** CSS.escape isn't in older targets' lib types; fall back to a safe subset. */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}
