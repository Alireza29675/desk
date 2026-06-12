import { Capture } from '../components/Capture';

// Section 4 — proof of life. One real workspace mid-session; the one quiet
// motion is the version scrubber sliding an artifact back through its
// append-only history.
export function ProofOfLife() {
  return (
    <section className="section container">
      <div className="section__head">
        <span className="eyebrow">A real session</span>
        <h2 className="section__title">Watch it form. Scrub it back.</h2>
        <p className="lede">
          Artifacts stream in live over a WebSocket. Every commit appends a snapshot, so you can
          slide the history scrubber to any past version — desk keeps the whole timeline in one
          SQLite file on your machine.
        </p>
      </div>
      <Capture
        kind="workspace"
        wide
        label="A real desk workspace mid-session: several artifacts in the sidebar, the comment rail, and the version scrubber open on one artifact's history."
      />
    </section>
  );
}
