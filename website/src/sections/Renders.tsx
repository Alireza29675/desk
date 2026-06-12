import { Shot } from '../components/Shot';

// Section 3 — the artifact is the description. Input → output pairs from the
// fixture session: two component slices of ONE create_artifact call (left)
// and what each rendered (right). The JSON is value-identical to the call's
// two component payloads (create-artifact-call.json, kept with the capture
// protocol in the task folder) — the enriched-document envelope (type,
// author, title, reason) is omitted and arrays are inlined for display;
// every key and value shown is the real payload. The rendered diagram is the
// call's v1 (two refresh edges — the bug the hero's comment points at), so
// the pair corresponds exactly.
const DIAGRAM_CALL = `{
  "id": "auth-flow",
  "type": "diagram",
  "data": {
    "engine": "d2",
    "source": "direction: right\\nuser: User { shape: person }\\napp: App\\nauth: Auth Service\\nstore: Token Store { shape: cylinder }\\ntoken_refresh: Token Refresh\\n\\nuser -> app: sign in\\napp -> auth: credentials\\nauth -> store: issue token\\napp -> token_refresh: on expiry\\ntoken_refresh -> store: refresh\\ntoken_refresh -> auth: refresh\\nstore -> app: new token",
    "namedNodes": ["token_refresh"],
    "caption": "Auth flow"
  }
}`;

const CHART_CALL = `{
  "id": "signins",
  "type": "chart",
  "data": {
    "kind": "bar",
    "title": "Sign-ins, last 7 days",
    "xLabel": "Day",
    "yLabel": "Count",
    "series": [{ "name": "Sign-ins", "values": [["Mon", 184], ["Tue", 152],
      ["Wed", 211], ["Thu", 169], ["Fri", 143], ["Sat", 88], ["Sun", 97]] }]
  }
}`;

export function Renders() {
  return (
    <section className="section container">
      <div className="section__head">
        <span className="eyebrow">Typed artifacts</span>
        <h2 className="section__title">It draws the thing.</h2>
        <p className="lede">
          Ask for a diagram and a diagram appears — not three paragraphs about one. Fifteen typed
          components render live into the viewer you&rsquo;re already watching.
        </p>
      </div>

      <div className="pairs">
        <div className="pair">
          <div className="pair__side">
            <span className="pair__tag">input — create_artifact (diagram component)</span>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: focusable scroll region */}
            <pre
              className="codeblock"
              role="region"
              tabIndex={0}
              aria-label="The create_artifact call's diagram component: a D2 source with one named, anchorable node."
            >
              {DIAGRAM_CALL}
            </pre>
          </div>
          <div className="pair__side">
            <span className="pair__tag">output — rendered in desk</span>
            <Shot
              name="render-diagram"
              alt="The rendered D2 auth-flow diagram that call produced — User, App, Auth Service, Token Refresh and Token Store nodes, with two refresh edges leaving Token Refresh."
            />
          </div>
        </div>

        <div className="pair">
          <div className="pair__side">
            <span className="pair__tag">input — same call (chart component)</span>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: focusable scroll region */}
            <pre
              className="codeblock"
              role="region"
              tabIndex={0}
              aria-label="The same call's chart component: a bar series of sign-ins per day."
            >
              {CHART_CALL}
            </pre>
          </div>
          <div className="pair__side">
            <span className="pair__tag">output — rendered in desk</span>
            <Shot
              name="render-chart"
              alt="The rendered bar chart that call produced — sign-ins for seven days in desk's coral."
            />
          </div>
        </div>
      </div>

      <p className="mono-line" style={{ marginTop: 'var(--space-8)' }}>
        15 components — diagrams · charts · tables · math · mindmaps · timelines · callouts · code ·
        images · …
      </p>
    </section>
  );
}
