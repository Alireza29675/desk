import type { RendererProps } from './renderer-registry';

interface Data {
  tone: 'info' | 'warn' | 'danger' | 'success';
  title?: string;
  body: string;
}

const ICONS: Record<Data['tone'], string> = {
  info: 'ℹ',
  warn: '⚠',
  danger: '✕',
  success: '✓',
};

export function CalloutRenderer({ component }: RendererProps<Data>) {
  const { tone, title, body } = component.data;
  return (
    <aside className="callout" data-tone={tone} role="note">
      <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>{ICONS[tone]}</span>
      <div>
        {title ? <div className="callout__title">{title}</div> : null}
        <div>{body}</div>
      </div>
    </aside>
  );
}
