// The hero. The space-axis held frame is the source of truth — a single
// restrained reveal settles into it on desktop, and mobile / reduced-motion
// render it directly. The held frame alone must carry both halves of the idea:
// the workspace full of real artifacts AND one anchored comment (the round-trip).
// Greyboxed here; eng2's capture pass fills it with a real session.
export function Hero() {
  return (
    <header className="hero container">
      <h1 className="hero__title">
        See what your agent <span className="accent">means.</span>
      </h1>
      <p className="hero__sub">
        Your agent draws the diagram instead of describing it — and you reply by pointing at the
        part that&rsquo;s wrong. A local-first visual channel, MCP-native.
      </p>
      <div className="hero__cta">
        <a className="btn btn--primary" href="#install">
          Run it locally →
        </a>
        <a className="btn btn--ghost" href="https://github.com/Alireza29675/desk">
          GitHub ↗
        </a>
      </div>

      <div className="hero-frame">
        <div className="window">
          <div className="window__bar">
            <span className="window__dot" />
            <span className="window__dot" />
            <span className="window__dot" />
            <span className="window__title">desk · 127.0.0.1:7878</span>
          </div>
          <div
            className="hero-stage"
            role="img"
            aria-label="A desk session: the conversation has gone quiet on the left while the workspace on the right fills with rendered artifacts — a system diagram and a chart — with a comment pinned to one of them."
          >
            <div className="hero-pane hero-pane--convo" aria-hidden="true">
              <div className="bubble">
                <div className="bubble__who">you</div>
                Map the auth flow and chart last week&rsquo;s sign-ins.
              </div>
              <div className="bubble">
                <div className="bubble__who">agent</div>
                Done — both are on your desk.
              </div>
              <div className="cursor-idle">&gt; </div>
            </div>
            <div className="hero-pane hero-pane--workspace" aria-hidden="true">
              <div className="capture">
                <span className="capture__kind">diagram</span>
                <span className="capture__label">Auth flow (D2)</span>
              </div>
              <div className="capture">
                <span className="capture__kind">chart</span>
                <span className="capture__label">Sign-ins, last 7 days</span>
              </div>
              <span className="pin">◆ comment on “node: token refresh”</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
