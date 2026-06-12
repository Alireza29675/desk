import { Capture } from '../components/Capture';

// Section 3 — the artifact is the description. Input → output pairs: the call the
// agent ran (left) and the artifact it rendered (right). Per the gate's rider 3,
// the LEFT side is byte-real too — these schematic snippets get replaced with the
// exact calls from the same session log at the capture pass.
export function Renders() {
  return (
    <section className="section container">
      <div className="section__head">
        <span className="eyebrow">Typed artifacts</span>
        <h2 className="section__title">It draws the thing.</h2>
        <p className="lede">
          Ask for a diagram and a diagram appears — not three paragraphs about one. Fourteen typed
          components render live into the viewer you&rsquo;re already watching.
        </p>
      </div>

      <div className="pairs">
        <div className="pair">
          <pre className="codeblock">
            <span className="tok-key">create_artifact</span>
            {'({\n  title: '}
            <span className="tok-str">&quot;Auth flow&quot;</span>
            {',\n  components: [\n    diagram('}
            <span className="tok-str">&quot;d2&quot;</span>
            {', '}
            <span className="tok-str">&quot;user -&gt; api -&gt; db&quot;</span>
            {'),\n  ],\n})'}
          </pre>
          <Capture
            kind="diagram"
            label="A rendered D2 system diagram — boxes and edges for the auth flow, Graphviz fallback if D2 is absent."
          />
        </div>

        <div className="pair">
          <pre className="codeblock">
            <span className="tok-key">create_artifact</span>
            {'({\n  title: '}
            <span className="tok-str">&quot;Sign-ins&quot;</span>
            {',\n  components: [\n    chart('}
            <span className="tok-str">&quot;bar&quot;</span>
            {', '}
            <span className="tok-dim">lastSevenDays</span>
            {'),\n  ],\n})'}
          </pre>
          <Capture
            kind="chart"
            label="A rendered bar chart of sign-ins over the last seven days, in desk's own theme."
          />
        </div>
      </div>

      <p className="mono-line" style={{ marginTop: 'var(--space-8)' }}>
        14 components — diagrams · charts · tables · math · slides · mindmaps · timelines · callouts
        · code · …
      </p>
    </section>
  );
}
