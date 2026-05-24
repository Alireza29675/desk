import type { RendererProps } from './renderer-registry';

interface Data {
  src: string;
  alt: string;
  caption?: string;
  aspectRatio?: number;
}

export function ImageRenderer({ component }: RendererProps<Data>) {
  const { src, alt, caption, aspectRatio } = component.data;
  return (
    <figure className="component-block">
      <div className="media" style={aspectRatio ? { aspectRatio } : undefined}>
        <img src={src} alt={alt} loading="lazy" />
      </div>
      {caption ? <figcaption className="media__caption">{caption}</figcaption> : null}
    </figure>
  );
}
