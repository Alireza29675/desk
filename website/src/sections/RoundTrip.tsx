import { Capture } from '../components/Capture';

// Section 2 — the round-trip. Desk's unique capability and the section that
// earns the install: you point at the rendered surface and your agent hears it.
export function RoundTrip() {
  return (
    <section className="section container">
      <div className="section__head">
        <span className="eyebrow">The round-trip</span>
        <h2 className="section__title">Reply by pointing, not typing.</h2>
        <p className="lede">
          Press <kbd>C</kbd>, then click a point, drag a region, or select text. Your comment
          anchors to the thing itself — a bullet, a node, a cell — never to pixels, so it survives
          every re-render.
        </p>
        <p className="quiet">
          Figma-style comments, wired into your agent&rsquo;s session — live with the{' '}
          <a href="https://github.com/Alireza29675/desk/tree/main/packages/channel">
            comment channel
          </a>
          , readable over MCP from any client.
        </p>
        <p className="mono-line">
          element · region · text-selection · point · general — never coordinates
        </p>
      </div>
      <Capture
        kind="round-trip"
        wide
        label="A rendered artifact with an open comment anchored to one element, and the agent's reply arriving in the same thread."
      />
    </section>
  );
}
