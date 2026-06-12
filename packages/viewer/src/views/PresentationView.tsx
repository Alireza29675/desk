import type { Artifact, Component } from '@desk/types';
import { locatorValue } from '@desk/types';
import { useEffect, useMemo } from 'react';
import { ArtifactMeta } from '../components/ArtifactMeta';
import { Commentable } from '../components/Commentable';
import { RenderedComponent } from '../renderers/renderer-registry';
import { useStore } from '../state/store';
import '../renderers/styles.css';

/**
 * Presentation view. Slices the components stream at every `slide-break`
 * component; the break contributes its title + layout to the slide that
 * follows. Arrow keys (and J/K) advance.
 *
 * Deep-link vocabulary: `slide:<n>` (1-based) and an optional
 * `component:<id>` to scroll to within the slide. The current slide is
 * reflected back into the URL as you navigate, so the address bar is always
 * a link to exactly what you're looking at.
 */
export function PresentationView({ artifact }: { artifact: Artifact }) {
  const slides = useMemo(() => splitIntoSlides(artifact.content.components), [artifact]);
  const locator = useStore((s) => s.open?.locator ?? []);
  const setLocator = useStore((s) => s.setLocator);

  const slideParam = Number(locatorValue(locator, 'slide') ?? '1');
  const index = Math.min(
    Math.max(0, (Number.isFinite(slideParam) ? slideParam : 1) - 1),
    slides.length - 1,
  );

  const go = (next: number) => {
    const clamped = Math.min(Math.max(0, next), slides.length - 1);
    setLocator([{ kind: 'slide', value: String(clamped + 1) }]);
  };

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight' || e.key === 'j') go(index + 1);
      if (e.key === 'ArrowLeft' || e.key === 'k') go(index - 1);
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // Scroll to a deep-linked component within the active slide.
  const component = locatorValue(locator, 'component');
  // biome-ignore lint/correctness/useExhaustiveDependencies: `index` re-runs the scroll when the slide changes, though it isn't read in the body
  useEffect(() => {
    if (!component) return;
    const el = document.querySelector<HTMLElement>(
      `[data-component-id="${component.replace(/["\\]/g, '\\$&')}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('deep-link-target');
    const t = setTimeout(() => el.classList.remove('deep-link-target'), 1400);
    return () => clearTimeout(t);
  }, [component, index]);

  const slide = slides[index];

  return (
    <div className="presentation">
      <div className="presentation__deck">
        <header className="presentation__head">
          <div className="presentation__head-row">
            <span className="presentation__title serif-accent">
              {slide?.title ?? artifact.content.title}
            </span>
            <span className="presentation__pager">
              {index + 1} / {slides.length}
            </span>
          </div>
          <ArtifactMeta artifact={artifact} className="presentation__meta" />
        </header>
        <div className="presentation__slide" data-layout={slide?.layout ?? 'content'}>
          {slide?.body.map((c) => (
            <Commentable key={c.id} componentId={c.id}>
              <RenderedComponent component={c} artifactId={artifact.id} />
            </Commentable>
          ))}
        </div>
        <div className="presentation__nav">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => go(index - 1)}
            disabled={index === 0}
          >
            ← Prev
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => go(index + 1)}
            disabled={index === slides.length - 1}
          >
            Next →
          </button>
        </div>
      </div>

      {/* Print-only: every slide on its own page, for Export → PDF. Always
          mounted (hidden on screen) so diagrams pre-render before printing. */}
      <div className="print-deck" aria-hidden>
        {slides.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the print deck is a static, never-reordered projection of slides
          <section className="print-slide" key={`print-${i}`} data-layout={s.layout ?? 'content'}>
            {s.title ? <h2 className="print-slide__title serif-accent">{s.title}</h2> : null}
            <div className="print-slide__body">
              {s.body.map((c) => (
                <RenderedComponent key={c.id} component={c} artifactId={artifact.id} />
              ))}
            </div>
          </section>
        ))}
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
