import { useStore } from '../state/store';

/**
 * Mobile bottom bar (≤920px) — the thumb-reachable panel controls the operator
 * asked for, "like Instagram": Artifacts on the left, the comment action in the
 * centre, Comments on the right. Hidden on wide viewports, where the panels
 * have edge toggles and the comment tool has its own corner button.
 *
 * The Artifacts button is always present (it's the only way to reach the nav
 * drawer on a phone); the comment + comments controls need an open artifact.
 */
export function MobileBar({
  onToggleNav,
  onToggleComments,
}: {
  onToggleNav: () => void;
  onToggleComments: () => void;
}) {
  const open = useStore((s) => s.open);
  const commentArmed = useStore((s) => s.commentArmed);
  const armComment = useStore((s) => s.armComment);
  const disarmComment = useStore((s) => s.disarmComment);
  const count = open?.comments.length ?? 0;

  return (
    <nav className="mobile-bar" aria-label="Quick actions">
      <button type="button" className="mobile-bar__btn" onClick={onToggleNav}>
        <span className="mobile-bar__icon" aria-hidden="true">
          ☰
        </span>
        <span className="mobile-bar__label">Artifacts</span>
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="mobile-bar__comment"
            data-armed={commentArmed ? 'true' : undefined}
            onClick={() => (commentArmed ? disarmComment() : armComment())}
            aria-pressed={commentArmed}
            aria-label={commentArmed ? 'Cancel commenting' : 'New comment'}
          >
            <span aria-hidden="true">💬</span>
          </button>
          <button type="button" className="mobile-bar__btn" onClick={onToggleComments}>
            <span className="mobile-bar__icon" aria-hidden="true">
              ❝{count > 0 ? <span className="mobile-bar__count">{count}</span> : null}
            </span>
            <span className="mobile-bar__label">Comments</span>
          </button>
        </>
      ) : null}
    </nav>
  );
}
