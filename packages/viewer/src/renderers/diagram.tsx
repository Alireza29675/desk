import type { RendererProps } from './renderer-registry';

interface Data {
  engine: 'd2' | 'graphviz';
  source: string;
  caption?: string;
  namedNodes?: string[];
  namedEdges?: string[];
}

/**
 * Diagram source is rendered as-is in v0.1 — the build team can wire D2 / Graphviz
 * WASM compilation here without changing the surface. The named-node /
 * named-edge metadata is the addressable anchor surface; comments target
 * `nodes.<name>` regardless of how the final SVG looks.
 */
export function DiagramRenderer({ component }: RendererProps<Data>) {
  const { engine, source, caption, namedNodes, namedEdges } = component.data;
  return (
    <figure className="component-block">
      <div className="diagram">
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <span className="diagram__engine">{engine.toUpperCase()}</span>
        </div>
        <pre className="diagram__source">{source}</pre>
        {(namedNodes?.length ?? 0) + (namedEdges?.length ?? 0) > 0 ? (
          <div style={{ marginTop: 'var(--space-5)', fontSize: 'var(--text-2xs)', color: 'var(--color-text-subtle)' }}>
            <strong>Anchors:</strong>{' '}
            {[...(namedNodes ?? []).map((n) => `nodes.${n}`), ...(namedEdges ?? []).map((e) => `edges.${e}`)].join(' · ')}
          </div>
        ) : null}
      </div>
      {caption ? <figcaption className="component-caption">{caption}</figcaption> : null}
    </figure>
  );
}
