import type { RendererProps } from './renderer-registry';

interface Item {
  id: string;
  label: string;
  checked: boolean;
  note?: string;
}

interface Data {
  title?: string;
  items: Item[];
}

export function ChecklistRenderer({ component }: RendererProps<Data>) {
  const { title, items } = component.data;
  return (
    <div className="component-block">
      {title ? <div style={{ fontWeight: 600 }}>{title}</div> : null}
      <ul className="checklist">
        {items.map((item) => (
          <li key={item.id} className="checklist__item">
            <span className="checklist__box" data-checked={String(item.checked)} aria-hidden>
              {item.checked ? '✓' : ''}
            </span>
            <div>
              <span className="checklist__label" data-checked={String(item.checked)}>{item.label}</span>
              {item.note ? <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>{item.note}</div> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
