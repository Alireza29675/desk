interface CaptureProps {
  /** Short kind tag shown in the corner (e.g. "diagram", "workspace"). */
  kind: string;
  /** What the real capture will show — describes the slot for eng2's pass. */
  label: string;
  wide?: boolean;
}

// A greyboxed capture slot. Until R2+R3 land on main, every screenshot/GIF on
// the page is one of these dashed placeholders, each labelled with exactly what
// the real capture must contain. eng2 swaps them for real session captures at
// the post-R3 design-feel-pass.
export function Capture({ kind, label, wide = false }: CaptureProps) {
  return (
    <div className={wide ? 'capture capture--wide' : 'capture'} role="img" aria-label={label}>
      <span className="capture__kind">{kind}</span>
      <span className="capture__label">{label}</span>
    </div>
  );
}
