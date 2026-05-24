import type { RendererProps } from './renderer-registry';

interface Event {
  id: string;
  at: string;
  label: string;
  note?: string;
  tone?: 'neutral' | 'info' | 'warn' | 'success' | 'danger';
}

interface Data {
  title?: string;
  events: Event[];
  orientation: 'horizontal' | 'vertical';
}

export function TimelineRenderer({ component }: RendererProps<Data>) {
  const { title, events } = component.data;
  return (
    <div className="component-block">
      {title ? <div style={{ fontWeight: 600 }}>{title}</div> : null}
      <div className="timeline">
        {events.map((event) => (
          <div key={event.id} className="timeline__event">
            <span className="timeline__when">{event.at}</span>
            <div>
              <div style={{ fontWeight: 500 }}>{event.label}</div>
              {event.note ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{event.note}</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
