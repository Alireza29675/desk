import type { RendererProps } from './renderer-registry';

interface Node {
  name: string;
  kind?: 'file' | 'dir';
  note?: string;
  children?: Node[];
}

interface Data {
  root: string;
  nodes: Node[];
}

export function FolderStructureRenderer({ component }: RendererProps<Data>) {
  const { root, nodes } = component.data;
  return (
    <div className="component-surface">
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
        <div style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>{root}</div>
        <NodeList nodes={nodes} />
      </div>
    </div>
  );
}

function NodeList({ nodes }: { nodes: Node[] }) {
  return (
    <ul className="tree">
      {nodes.map((node) => (
        <li key={node.name}>
          <span>
            <span aria-hidden style={{ marginRight: 6 }}>{node.kind === 'dir' ? '▸' : '·'}</span>
            <strong>{node.name}</strong>
            {node.note ? (
              <span style={{ marginLeft: 8, color: 'var(--color-text-subtle)', fontFamily: 'var(--font-sans)' }}>
                — {node.note}
              </span>
            ) : null}
          </span>
          {node.children?.length ? <NodeList nodes={node.children} /> : null}
        </li>
      ))}
    </ul>
  );
}
