import type { RendererProps } from './renderer-registry';

interface Column {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  width?: number;
}

interface Data {
  columns: Column[];
  rows: Record<string, string | number | boolean | null>[];
  caption?: string;
}

export function TableRenderer({ component }: RendererProps<Data>) {
  const { columns, rows, caption } = component.data;
  return (
    <figure className="component-block">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={c.width ? { width: c.width } : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: table rows render in fixed source order
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} data-align={c.align ?? 'left'}>
                    {formatCell(row[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption ? <figcaption className="component-caption">{caption}</figcaption> : null}
    </figure>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}
