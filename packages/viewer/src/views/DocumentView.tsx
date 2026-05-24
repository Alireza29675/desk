import { useEffect } from 'react';
import type { Artifact } from '@desk/types';
import { locatorValue } from '@desk/types';
import { useStore } from '../state/store';
import { renderers, RendererFallback } from '../renderers/renderer-registry';
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

/** CSS.escape isn't in older targets' lib types; fall back to a safe subset. */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}
