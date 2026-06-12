import { Shot } from '../components/Shot';

// The hero. A real held frame from the fixture session (artifact r73n5dn8yb1k9t
// @ v4): the workspace carrying both halves of the idea — rendered artifacts AND
// the open anchored comment with the agent's reply. The conversation rides on
// top as a compact dimmed card: at the captured width the original side-by-side
// panes scaled the screenshot to ~0.46 (comment text ~6px), so the workspace
// takes the full frame and the quiet chat overlays it instead. The reveal
// (chat first, workspace fills, chat dims) is a one-shot CSS animation;
// prefers-reduced-motion and mobile get the settled frame directly.
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

          <div className="hero-stage">
            <div className="hero-chat" aria-hidden="true">
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
            <Shot
              name="hero-desktop"
              eager
              alt="A desk session: the workspace shows a rendered auth-flow diagram and a sign-ins chart, with an open comment anchored to the Token Refresh node — “this one refreshes twice — wrong” — and the agent's reply beneath it: “fixed, see v4”."
            />
          </div>

          <div className="hero-mobile">
            <Shot
              name="hero-mobile"
              eager
              alt="The same desk artifact on a phone: the auth-flow diagram and sign-ins chart with the comment affordances in a bottom bar, readable at 390px."
            />
          </div>
        </div>
      </div>
    </header>
  );
}
