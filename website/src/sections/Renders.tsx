import { Capture } from '../components/Capture';

// Section 3 — the artifact is the description. Input → output pairs: the call the
// agent ran (left) and the artifact it rendered (right). Per the gate's rider 3,
// BOTH sides are byte-real from the same session log — until that capture pass,
// both sides are greybox slots (no schematic pretending to be a real call).
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
          <Capture
            kind="mcp call"
            label="The real create_artifact call from the session log — the exact input that produced the diagram on the right."
          />
          <Capture
            kind="diagram"
            label="The rendered D2 system diagram that call produced — boxes and edges, Graphviz fallback if D2 is absent."
          />
        </div>

        <div className="pair">
          <Capture
            kind="mcp call"
            label="The real create_artifact call from the same session — the exact input that produced the chart on the right."
          />
          <Capture
            kind="chart"
            label="The rendered bar chart that call produced, in desk's own theme."
          />
        </div>
      </div>

      <p className="mono-line" style={{ marginTop: 'var(--space-8)' }}>
        15 components — diagrams · charts · tables · math · mindmaps · timelines · callouts · code ·
        images · …
      </p>
    </section>
  );
}
