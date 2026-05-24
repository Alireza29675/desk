import { useEffect, useState } from 'react';
import type { RendererProps } from './renderer-registry';

interface Data {
  language: string;
  code: string;
  filename?: string;
  highlightLines?: number[];
  wrap?: boolean;
}

/**
 * Shiki-powered syntax highlighting. We load lazily and fall back to plain
 * text while the highlighter warms up — the renderer must be readable on
 * the first paint.
 */
export function CodeViewRenderer({ component }: RendererProps<Data>) {
  const { language, code, filename, wrap } = component.data;
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { codeToHtml } = await import('shiki');
        const out = await codeToHtml(code, {
          lang: language,
          themes: { light: 'github-light', dark: 'github-dark' },
        });
        if (!cancelled) setHtml(out);
      } catch {
        if (!cancelled) setHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <div className="code-view" data-wrap={wrap ? 'true' : 'false'}>
      <div className="code-view__chrome">
        <span>{filename ?? language}</span>
        <span>{language}</span>
      </div>
      <div className="code-view__body">
        {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <pre><code>{code}</code></pre>}
      </div>
    </div>
  );
}
