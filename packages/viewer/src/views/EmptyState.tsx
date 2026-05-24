import { Kbd } from '../components/Kbd';

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
