import type { RendererProps } from './renderer-registry';

interface Data {
  src: string;
  sandbox: boolean;
  aspectRatio?: number;
  caption?: string;
}

export function IframeRenderer({ component }: RendererProps<Data>) {
  const { src, sandbox, aspectRatio, caption } = component.data;
  return (
    <figure className="component-block">
      <div className="media" style={{ aspectRatio: aspectRatio ?? 16 / 9 }}>
        <iframe
          src={src}
          title={caption ?? 'Embed'}
          sandbox={sandbox ? 'allow-scripts allow-same-origin allow-popups' : undefined}
          loading="lazy"
        />
      </div>
      {caption ? <figcaption className="media__caption">{caption}</figcaption> : null}
    </figure>
  );
}
