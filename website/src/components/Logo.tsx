// The product's coral desk mark — rounded square, three lines — plus the
// wordmark. Same glyph as the viewer favicon.
export function Logo() {
  return (
    <a className="logo" href="#top" aria-label="Desk — home">
      <svg className="logo__mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="6" fill="#FF5A4D" />
        <path d="M9 11h14M9 16h10M9 21h7" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="logo__word">Desk</span>
    </a>
  );
}
