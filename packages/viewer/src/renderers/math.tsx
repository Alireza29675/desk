import { useEffect, useRef } from 'react';
import type { RendererProps } from './renderer-registry';

interface Data {
  latex: string;
  display: 'block' | 'inline';
  caption?: string;
}

export function MathRenderer({ component }: RendererProps<Data>) {
  const { latex, display, caption } = component.data;
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const katex = (await import('katex')).default;
      await import('katex/dist/katex.min.css');
      if (cancelled || !ref.current) return;
      katex.render(latex, ref.current, { displayMode: display === 'block', throwOnError: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [latex, display]);

  return (
    <figure className="component-block">
      <div className="math" ref={ref} aria-label="Math expression" />
      {caption ? <figcaption className="component-caption">{caption}</figcaption> : null}
    </figure>
  );
}
