import type { RendererProps } from './renderer-registry';

interface Node {
  id: string;
  label: string;
  note?: string;
  children?: Node[];
}

interface Data {
  root: Node;
  layout?: 'radial' | 'tree-right' | 'tree-down';
}

export function MindmapRenderer({ component }: RendererProps<Data>) {
  return (
    <div className="component-surface">
      <Branch node={component.data.root} depth={0} />
    </div>
  );
}

function Branch({ node, depth }: { node: Node; depth: number }) {
  return (
    <div>
      <div
        style={{
          fontWeight: depth === 0 ? 600 : 500,
          fontSize: depth === 0 ? 'var(--text-lg)' : 'var(--text-base)',
          color: depth === 0 ? 'var(--color-text)' : 'var(--color-text)',
          padding: 'var(--space-2) 0',
        }}
      >
        {node.label}
        {node.note ? (
          <span
            style={{ marginLeft: 8, color: 'var(--color-text-subtle)', fontSize: 'var(--text-xs)' }}
          >
            — {node.note}
          </span>
        ) : null}
      </div>
      {node.children?.length ? (
        <ul className="tree">
          {node.children.map((child) => (
            <li key={child.id}>
              <Branch node={child} depth={depth + 1} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
