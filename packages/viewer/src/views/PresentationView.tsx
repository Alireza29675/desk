import { useEffect, useMemo, useState } from 'react';
import type { Artifact, Component } from '@desk/types';
import { renderers, RendererFallback } from '../renderers/renderer-registry';
import '../renderers/styles.css';

/**
 * Presentation view. Slices the components stream at every `slide-break`
 * component; the break itself contributes its title + layout hint to the
 * slide that follows. Arrow keys (and J/K) advance between slides.
 */
export function PresentationView({ artifact }: { artifact: Artifact }) {
  const slides = useMemo(() => splitIntoSlides(artifact.content.components), [artifact]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'j') setIndex((i) => Math.min(slides.length - 1, i + 1));
      if (e.key === 'ArrowLeft' || e.key === 'k') setIndex((i) => Math.max(0, i - 1));
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slides.length]);

  const slide = slides[Math.min(index, slides.length - 1)];

  return (
    <div className="presentation">
      <div className="presentation__deck">
        <header className="presentation__head">
          <span className="presentation__title serif-accent">{slide?.title ?? artifact.content.title}</span>
          <span className="presentation__pager">
            {index + 1} / {slides.length}
          </span>
        </header>
        <div className="presentation__slide" data-layout={slide?.layout ?? 'content'}>
          {slide?.body.map((component) => {
            const Renderer = renderers[component.type] ?? RendererFallback;
            return (
              <div key={component.id} data-component-id={component.id}>
                <Renderer component={component} artifactId={artifact.id} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface Slide {
  title?: string;
  layout?: 'title' | 'content' | 'two-column' | 'full-bleed';
  body: Component[];
}

function splitIntoSlides(components: Component[]): Slide[] {
  const slides: Slide[] = [];
  let current: Slide = { body: [] };
  for (const component of components) {
    if (component.type === 'slide-break') {
      if (current.body.length > 0 || current.title) slides.push(current);
      const data = component.data as { title?: string; layout?: Slide['layout'] };
      current = { title: data.title, layout: data.layout, body: [] };
    } else {
      current.body.push(component);
    }
  }
  if (current.body.length > 0 || current.title) slides.push(current);
  return slides.length > 0 ? slides : [{ body: components }];
}
