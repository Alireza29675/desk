import type { RendererProps } from './renderer-registry';

interface Data {
  text: string;
  attribution?: string;
  sourceUrl?: string;
}

export function QuoteRenderer({ component }: RendererProps<Data>) {
  const { text, attribution, sourceUrl } = component.data;
  return (
    <blockquote className="quote">
      <span>{text}</span>
      {attribution ? (
        <cite className="quote__attribution">
          —{' '}
          {sourceUrl ? (
            <a href={sourceUrl} target="_blank" rel="noreferrer">
              {attribution}
            </a>
          ) : (
            attribution
          )}
        </cite>
      ) : null}
    </blockquote>
  );
}
