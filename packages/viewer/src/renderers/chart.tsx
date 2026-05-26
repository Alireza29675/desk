import type { RendererProps } from './renderer-registry';

type Tuple = [string | number, number];
interface Series {
  name: string;
  values: Tuple[];
}
interface Data {
  kind: 'bar' | 'line' | 'area' | 'pie' | 'scatter';
  title?: string;
  xLabel?: string;
  yLabel?: string;
  series: Series[];
  stacked?: boolean;
}

const W = 720;
const H = 280;
const PADDING = { top: 16, right: 16, bottom: 32, left: 40 };

/**
 * Tiny dependency-free chart renderer. Covers the common cases (bar / line /
 * area / pie / scatter) without pulling in a heavy charting library; teams
 * that need brand-grade visuals can swap a renderer per chart kind later.
 */
export function ChartRenderer({ component }: RendererProps<Data>) {
  const { kind, title, xLabel, yLabel, series } = component.data;
  return (
    <figure className="component-block">
      {title ? <div style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>{title}</div> : null}
      <div className="component-surface component-surface--inset">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={title ?? `${kind} chart`}
        >
          {kind === 'pie' ? (
            <Pie series={series} />
          ) : (
            <CartesianChart kind={kind} series={series} />
          )}
        </svg>
        {(xLabel || yLabel) && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 'var(--space-3)',
              fontSize: 'var(--text-2xs)',
              color: 'var(--color-text-subtle)',
            }}
          >
            <span>{xLabel ?? ''}</span>
            <span>{yLabel ?? ''}</span>
          </div>
        )}
        <Legend series={series} />
      </div>
    </figure>
  );
}

function CartesianChart({
  kind,
  series,
}: { kind: 'bar' | 'line' | 'area' | 'scatter'; series: Series[] }) {
  const allY = series.flatMap((s) => s.values.map((v) => v[1]));
  const minY = Math.min(0, ...allY);
  const maxY = Math.max(0, ...allY);
  const xs = uniqueXs(series);
  const colors = paletteFor(series.length);

  const innerW = W - PADDING.left - PADDING.right;
  const innerH = H - PADDING.top - PADDING.bottom;
  const xPos = (idx: number) =>
    PADDING.left + (xs.length <= 1 ? innerW / 2 : (idx / (xs.length - 1)) * innerW);
  const yPos = (v: number) => PADDING.top + innerH - ((v - minY) / (maxY - minY || 1)) * innerH;

  return (
    <g>
      {/* axes */}
      <line
        x1={PADDING.left}
        y1={PADDING.top}
        x2={PADDING.left}
        y2={H - PADDING.bottom}
        stroke="currentColor"
        opacity={0.2}
      />
      <line
        x1={PADDING.left}
        y1={H - PADDING.bottom}
        x2={W - PADDING.right}
        y2={H - PADDING.bottom}
        stroke="currentColor"
        opacity={0.2}
      />
      {series.map((s, i) => {
        const points = s.values.map((v) => {
          const idx = xs.indexOf(String(v[0]));
          return { x: xPos(idx), y: yPos(v[1]) };
        });
        if (kind === 'bar') {
          const barW = Math.max(4, innerW / Math.max(xs.length, 1) / series.length - 2);
          return (
            <g key={s.name}>
              {points.map((p, j) => (
                <rect
                  // biome-ignore lint/suspicious/noArrayIndexKey: static chart data, fixed order
                  key={j}
                  x={p.x - (series.length * barW) / 2 + i * barW}
                  y={Math.min(p.y, yPos(0))}
                  width={barW}
                  height={Math.abs(p.y - yPos(0))}
                  fill={colors[i]}
                  rx={2}
                />
              ))}
            </g>
          );
        }
        const d = points.map((p, j) => `${j === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        if (kind === 'line')
          return <path key={s.name} d={d} stroke={colors[i]} strokeWidth={2} fill="none" />;
        if (kind === 'area')
          return (
            <path
              key={s.name}
              d={`${d} L ${points[points.length - 1]!.x} ${yPos(0)} L ${points[0]!.x} ${yPos(0)} Z`}
              fill={colors[i]}
              opacity={0.4}
              stroke={colors[i]}
            />
          );
        return (
          <g key={s.name}>
            {points.map((p, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static chart data, fixed order
              <circle key={j} cx={p.x} cy={p.y} r={4} fill={colors[i]} />
            ))}
          </g>
        );
      })}
    </g>
  );
}

function Pie({ series }: { series: Series[] }) {
  const total = series.reduce((acc, s) => acc + s.values.reduce((a, v) => a + v[1], 0), 0);
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) / 2 - 16;
  const colors = paletteFor(series.length);
  let start = -Math.PI / 2;
  return (
    <g>
      {series.map((s, i) => {
        const value = s.values.reduce((a, v) => a + v[1], 0);
        const angle = (value / (total || 1)) * Math.PI * 2;
        const end = start + angle;
        const x1 = cx + r * Math.cos(start);
        const y1 = cy + r * Math.sin(start);
        const x2 = cx + r * Math.cos(end);
        const y2 = cy + r * Math.sin(end);
        const largeArc = angle > Math.PI ? 1 : 0;
        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
        start = end;
        return <path key={s.name} d={d} fill={colors[i]} />;
      })}
    </g>
  );
}

function Legend({ series }: { series: Series[] }) {
  const colors = paletteFor(series.length);
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-5)',
        marginTop: 'var(--space-4)',
        fontSize: 'var(--text-xs)',
      }}
    >
      {series.map((s, i) => (
        <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: colors[i] }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

function uniqueXs(series: Series[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const s of series) {
    for (const [x] of s.values) {
      const key = String(x);
      if (!seen.has(key)) {
        seen.add(key);
        order.push(key);
      }
    }
  }
  return order;
}

const PALETTE = [
  '#ff5a4d',
  '#2563eb',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#dc2626',
  '#0ea5e9',
  '#a16207',
];
function paletteFor(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(PALETTE[i % PALETTE.length]!);
  return out;
}
