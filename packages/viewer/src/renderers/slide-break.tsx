import type { RendererProps } from './renderer-registry';

interface Data {
  title?: string;
  speakerNotes?: string;
  layout?: 'title' | 'content' | 'two-column' | 'full-bleed';
}

/**
 * Inside a document context, a slide break renders as a thin section divider
 * with the slide title. Inside the presentation view, the artifact-level
 * layout slices the components stream at each break instead of rendering
 * this component visibly.
 */
export function SlideBreakRenderer({ component }: RendererProps<Data>) {
  const { title } = component.data;
  return <div className="slide-break">{title ?? 'Slide'}</div>;
}
