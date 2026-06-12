import { Shot } from '../components/Shot';

// Section 4 — proof of life. The capture shows the scrubber doing the work
// (v1 of 4, read-only, the diagram back in its buggy state); the lede keeps
// only what the image can't show — where the history lives.
export function ProofOfLife() {
  return (
    <section className="section container">
      <div className="section__head">
        <span className="eyebrow">A real session</span>
        <h2 className="section__title">Watch it form. Scrub it back.</h2>
        <p className="lede">
          Every commit appends a snapshot. The whole timeline — every artifact, every version, every
          comment — is one SQLite file on your machine.
        </p>
      </div>
      <Shot
        name="proof-of-life"
        className="shot--wide"
        alt="The desk workspace with the history scrubber open: versions v1 through v4, viewing v1 read-only — the auth-flow diagram rendered back in its earlier, buggy state."
      />
    </section>
  );
}
