// Section 5 — the footer is the canonical install surface (the hero CTA points
// here). The steps are byte-real to the post-R3 README: desk isn't on npm, so it
// runs from source through bun. The facts line describes the PRODUCT (local-first),
// not the website.
export function Footer() {
  return (
    <footer className="footer" id="install">
      <div className="container">
        <span className="eyebrow">Run it locally</span>
        <h2 className="section__title" style={{ marginTop: 'var(--space-5)' }}>
          One process, one port, one file.
        </h2>

        <div className="install">
          <div className="install__card">
            <span className="install__title">Start desk</span>
            {/* tabIndex: the pre scrolls horizontally on narrow screens — it must
                be keyboard-reachable (WCAG 2.1.1). */}
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: focusable scroll region */}
            <pre
              className="codeblock"
              role="region"
              tabIndex={0}
              aria-label="Commands to start desk"
            >
              {'git clone https://github.com/Alireza29675/desk\n' +
                'cd desk\n' +
                'bun install\n' +
                "bun run --filter '@desk/viewer' build\n" +
                'bun run dev'}
            </pre>
            <span className="note">Serves the viewer on 127.0.0.1:7878 and opens it.</span>
          </div>

          <div className="install__card">
            <span className="install__title">Connect your agent</span>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: focusable scroll region */}
            <pre
              className="codeblock"
              role="region"
              tabIndex={0}
              aria-label="Command to connect your agent"
            >
              {'bun packages/cli/src/index.ts \\\n  mcp claude-desktop\n\n# also: cursor · generic'}
            </pre>
            <span className="note">
              Prints a config snippet to paste. The <code>desk</code> bin isn&rsquo;t on npm yet —
              run it through bun from the repo root.
            </span>
          </div>
        </div>

        <div className="footer__meta">
          <span className="footer__facts">
            MIT · Local-first: one Bun process, a SQLite file, your machine. No cloud.
          </span>
          <nav className="footer__links" aria-label="Resources">
            <a className="nav__link" href="https://github.com/Alireza29675/desk">
              GitHub
            </a>
            <a className="nav__link" href="https://github.com/Alireza29675/desk#readme">
              README
            </a>
            <a className="nav__link" href="https://github.com/Alireza29675/desk/issues">
              Issues
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
