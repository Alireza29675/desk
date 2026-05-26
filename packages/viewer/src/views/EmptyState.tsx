import { Kbd } from '../components/Kbd';
import { useStore } from '../state/store';

export function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state__inner">
        <div className="empty-state__mark" aria-hidden />
        <h2 className="empty-state__title serif-accent">Nothing on the desk yet.</h2>
        <p className="empty-state__sub">
          Connect an agent to the MCP endpoint at <code>/mcp</code> and ask it to draft something.
        </p>
        <div className="empty-state__row">
          <Kbd>⌘K</Kbd>
          <span>to search anything</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Shown when a deep link points at an artifact that doesn't exist (deleted, or
 * a stale/typo'd id). Distinct from the empty desk so the operator knows the
 * link was the problem — not that the desk is empty.
 */
export function NotFoundState({ id }: { id: string }) {
  const closeArtifact = useStore((s) => s.closeArtifact);
  return (
    <div className="empty-state">
      <div className="empty-state__inner">
        <div className="empty-state__mark" aria-hidden />
        <h2 className="empty-state__title serif-accent">That artifact isn’t here.</h2>
        <p className="empty-state__sub">
          Nothing is stored under <code>{id}</code>. It may have been removed, or the link is out of
          date.
        </p>
        <div className="empty-state__row">
          <button className="btn btn--ghost btn--sm" onClick={closeArtifact}>
            ← Back to the desk
          </button>
        </div>
      </div>
    </div>
  );
}
