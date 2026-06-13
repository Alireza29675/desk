import { Shot } from '../components/Shot';

// Section 2 — the round-trip. Desk's unique capability and the section that
// earns the install: you point at the rendered surface and your agent hears it.
// Two dedicated frames from the capture session, breakpoint-swapped like the
// hero: desktop shows the inline comment popover on the pinned-v1 (buggy)
// diagram — the badge must read v1 so the page agrees with the hero's
// "fixed, see v4"; mobile shows the comment sheet (shot at 390, displays ~1:1
// so the thread text is native-size).
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
        name="roundtrip"
        className="shot--roundtrip shot--desktop"
        alt="The v1 diagram with an inline comment popover anchored to the Token Refresh node — “this one refreshes twice — wrong” — and a ring marking the anchored component."
      />
      <Shot
        name="mobile-sheet"
        className="shot--sheet"
        alt="The mobile comment sheet over the artifact: the comment “this one refreshes twice — wrong” and the agent's reply “fixed, see v4”, each labelled with its anchor."
      />
    </section>
  );
}
