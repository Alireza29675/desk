import { Shot } from '../components/Shot';

// Section 2 — the round-trip. Desk's unique capability and the section that
// earns the install: you point at the rendered surface and your agent hears it.
// The capture is the held frame cropped to the artifact + comment rail (the
// sidebar and chat framing belong to the hero); a dedicated inline-popover
// shot replaces it at eng2's drop-2.
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
      <Shot
        name="hero-desktop"
        className="shot--crop-rail"
        alt="A rendered artifact with an open comment anchored to one element — “this one refreshes twice — wrong” — and the agent's reply in the same thread: “fixed, see v4”."
      />
    </section>
  );
}
