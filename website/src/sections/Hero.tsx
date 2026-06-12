// The hero. The space-axis held frame is the source of truth; the desktop
// reveal motion (left dims, right fills) is planned as progressive enhancement
// at the capture/feel-pass stage — mobile and prefers-reduced-motion stay on
// the held frame either way. The held frame must carry both halves of the idea:
// the workspace filling with artifacts AND one open comment with the agent's
// reply (the round-trip). Greyboxed here; eng2's capture pass replaces it with
// two real frames — a desktop full-workspace shot and a mobile-legible crop.
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
            aria-label="A desk session: the conversation has gone quiet on the left while the workspace fills with rendered artifacts — a system diagram with an open comment pinned to one node and the agent's reply beneath it, and a chart beside it."
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
              <div className="capture-wrap">
                <div className="capture">
                  <span className="capture__kind">diagram</span>
                  <span className="capture__label">Auth flow (D2)</span>
                </div>
                <div className="hero-thread">
                  <span className="hero-thread__anchor">◆ node: token refresh</span>
                  <span className="hero-thread__msg">this one refreshes twice — wrong</span>
                  <span className="hero-thread__reply">agent — fixed, see v4</span>
                </div>
              </div>
              <div className="capture">
                <span className="capture__kind">chart</span>
                <span className="capture__label">Sign-ins, last 7 days</span>
              </div>
            </div>
          </div>

          <div
            className="hero-mobile"
            role="img"
            aria-label="A desk artifact on a phone: the auth-flow diagram with an open comment anchored to one node and the agent's reply beneath it."
          >
            <div className="capture capture--wide">
              <span className="capture__kind">mobile crop</span>
              <span className="capture__label">
                One artifact + the anchored comment and agent reply, readable at 390px.
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
