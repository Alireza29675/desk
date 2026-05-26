import type { Component } from '@desk/types';
import type { ComponentType } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { CalloutRenderer } from './callout';
import { ChartRenderer } from './chart';
import { ChecklistRenderer } from './checkbox';
import { CodeViewRenderer } from './code-view';
import { DiagramRenderer } from './diagram';
import { FolderStructureRenderer } from './folder-structure';
import { IframeRenderer } from './iframe';
import { ImageRenderer } from './image';
import { MathRenderer } from './math';
import { MindmapRenderer } from './mindmap';
import { QuoteRenderer } from './quote';
import { SlideBreakRenderer } from './slide-break';
import { TableRenderer } from './table';
import { TimelineRenderer } from './timeline';
import { YoutubeEmbedRenderer } from './youtube-embed';

/**
 * The viewer-side renderer registry. Each entry maps a component-type
 * discriminator (the same string the server validates against) to a React
 * component. Add a new component type: drop a file in this folder and add
 * an entry here. The artifact views never branch on type — they just look
 * up `renderers[component.type]`.
 */
export interface RendererProps<TData = unknown> {
  component: Component<TData>;
  artifactId: string;
}

// Renderers are heterogeneous in `TData`; the registry is the join point
// where the type erases. Each renderer re-narrows by `component.type`.
// biome-ignore lint/suspicious/noExplicitAny: heterogeneous registry by design
type AnyRenderer = ComponentType<RendererProps<any>>;

export const renderers: Record<string, AnyRenderer> = {
  callout: CalloutRenderer as AnyRenderer,
  chart: ChartRenderer as AnyRenderer,
  checkbox: ChecklistRenderer as AnyRenderer,
  'code-view': CodeViewRenderer as AnyRenderer,
  diagram: DiagramRenderer as AnyRenderer,
  'folder-structure': FolderStructureRenderer as AnyRenderer,
  iframe: IframeRenderer as AnyRenderer,
  image: ImageRenderer as AnyRenderer,
  math: MathRenderer as AnyRenderer,
  mindmap: MindmapRenderer as AnyRenderer,
  quote: QuoteRenderer as AnyRenderer,
  'slide-break': SlideBreakRenderer as AnyRenderer,
  table: TableRenderer as AnyRenderer,
  timeline: TimelineRenderer as AnyRenderer,
  'youtube-embed': YoutubeEmbedRenderer as AnyRenderer,
};

export function RendererFallback({ component }: RendererProps) {
  return (
    <div className="renderer-fallback">
      <code>{component.type}</code> has no registered renderer.
    </div>
  );
}

/**
 * Looks up a component's renderer and renders it inside an error boundary, so a
 * single failing component degrades to a fallback instead of crashing the whole
 * artifact view. The component object is the reset key — new data retries.
 */
export function RenderedComponent({ component, artifactId }: RendererProps) {
  const Renderer = renderers[component.type] ?? RendererFallback;
  return (
    <ErrorBoundary
      resetKey={component}
      fallback={
        <div className="renderer-error">
          <code>{component.type}</code> couldn’t render — the rest of the artifact is unaffected.
        </div>
      }
    >
      <Renderer component={component} artifactId={artifactId} />
    </ErrorBoundary>
  );
}
