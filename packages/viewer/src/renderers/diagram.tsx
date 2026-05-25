import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import type { RendererProps } from './renderer-registry';

interface Data {
  engine: 'd2' | 'graphviz';
  source: string;
  caption?: string;
  namedNodes?: string[];
  namedEdges?: string[];
}

// D2 built-in theme IDs: 0 = Neutral default (light), 200 = Dark Mauve (dark).
const D2_LIGHT = 0;
const D2_DARK = 200;

// One D2 instance (and thus one wasm worker) shared across all diagrams,
// loaded lazily the first time a diagram mounts so the ~MB wasm stays out of
// the initial bundle.
type D2Engine = { compile: (src: string, opts?: unknown) => Promise<{ diagram: unknown; renderOptions: unknown }>; render: (diagram: unknown, opts?: unknown) => Promise<string> };
let d2Promise: Promise<D2Engine> | null = null;
function getD2(): Promise<D2Engine> {
  if (!d2Promise) {
    d2Promise = import('@terrastruct/d2').then(({ D2 }) => new D2() as unknown as D2Engine);
  }
  return d2Promise;
}

type RenderState =
  | { status: 'loading' }
  | { status: 'ready'; svg: string }
  | { status: 'error'; message: string };

/**
 * Renders D2 source to live SVG via the D2 WASM engine, re-rendering on theme
 * change so the diagram matches light/dark. The source is shown as a graceful
 * fallback while the engine loads, on error, and for engines not yet rendered
 * client-side (graphviz). The named-node / named-edge metadata stays the
 * addressable anchor surface regardless of how the SVG looks.
 */
export function DiagramRenderer({ component }: RendererProps<Data>) {
  const { engine, source, caption, namedNodes, namedEdges } = component.data;
  const theme = useStore((s) => s.theme);
  const [state, setState] = useState<RenderState>({ status: 'loading' });

  useEffect(() => {
    if (engine !== 'd2') {
      setState({ status: 'error', message: `${engine} diagrams render as source for now.` });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        const d2 = await getD2();
        const result = await d2.compile(source, { themeID: D2_LIGHT, darkThemeID: D2_DARK });
        const svg = await d2.render(result.diagram, {
          ...(result.renderOptions as object),
          themeID: theme === 'dark' ? D2_DARK : D2_LIGHT,
          pad: 12,
          noXMLTag: true,
        });
        if (!cancelled) setState({ status: 'ready', svg });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engine, source, theme]);

  const anchors = [...(namedNodes ?? []).map((n) => `nodes.${n}`), ...(namedEdges ?? []).map((e) => `edges.${e}`)];

  return (
    <figure className="component-block">
      <div className="diagram" data-engine={engine} data-status={state.status}>
        {state.status === 'ready' ? (
          // SVG comes from the local WASM engine compiling author-provided source.
          <div
            className="diagram__svg"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted local-engine SVG output
            dangerouslySetInnerHTML={{ __html: state.svg }}
          />
        ) : (
          <div className="diagram__fallback">
            <span className="diagram__engine">{engine.toUpperCase()}</span>
            <span className="diagram__status" title={state.status === 'error' ? state.message : undefined}>
              {state.status === 'loading' ? 'rendering…' : 'source'}
            </span>
            <pre className="diagram__source">{source}</pre>
          </div>
        )}
        {anchors.length > 0 ? (
          <div className="diagram__anchors">
            <strong>Anchors:</strong> {anchors.join(' · ')}
          </div>
        ) : null}
      </div>
      {caption ? <figcaption className="component-caption">{caption}</figcaption> : null}
    </figure>
  );
}
