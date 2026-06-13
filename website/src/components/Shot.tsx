interface ShotProps {
  /** Capture basename under /captures/ — resolves to `${name}-{light,dark}.png`. */
  name: string;
  alt: string;
  /** Above-the-fold shots load eagerly; the rest lazy. Fetch PRIORITY for the
   *  visible hero variant comes from the media-gated preloads in index.html —
   *  per-img fetchpriority would also boost the hidden viewport/theme variants
   *  (and React 18 doesn't know the camelCase prop). */
  eager?: boolean;
  className?: string;
}

// A real product capture, one variant per theme. Both render; CSS shows the one
// matching <html data-theme> (an attribute, so <picture media> can't track it).
// The dark variant is presentational duplication — alt lives on the light one.
export function Shot({ name, alt, eager = false, className }: ShotProps) {
  const base = `${import.meta.env.BASE_URL}captures/${name}`;
  const loading = eager ? 'eager' : 'lazy';
  return (
    <span className={className ? `shot ${className}` : 'shot'}>
      <img
        className="shot__img shot__img--light"
        src={`${base}-light.png`}
        alt={alt}
        loading={loading}
      />
      <img
        className="shot__img shot__img--dark"
        src={`${base}-dark.png`}
        alt=""
        aria-hidden="true"
        loading={loading}
      />
    </span>
  );
}
