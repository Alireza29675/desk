import type { RendererProps } from './renderer-registry';

interface Data {
  videoId: string;
  start?: number;
  caption?: string;
}

export function YoutubeEmbedRenderer({ component }: RendererProps<Data>) {
  const { videoId, start, caption } = component.data;
  const src = `https://www.youtube-nocookie.com/embed/${videoId}${start ? `?start=${start}` : ''}`;
  return (
    <figure className="component-block">
      <div className="media" style={{ aspectRatio: 16 / 9 }}>
        <iframe
          src={src}
          title={caption ?? 'YouTube video'}
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
      {caption ? <figcaption className="media__caption">{caption}</figcaption> : null}
    </figure>
  );
}
