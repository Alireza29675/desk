import { Kbd } from './Kbd';
import { useStore } from '../state/store';

export function Topbar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const open = useStore((s) => s.open);
  const closeArtifact = useStore((s) => s.closeArtifact);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  return (
    <div className="topbar">
      <div className="topbar__left">
        {open ? (
          <>
            <button className="topbar__back" onClick={closeArtifact} aria-label="Close artifact">
              ←
            </button>
            <span className="topbar__title">{open.artifact.content.title}</span>
            <span className="topbar__badge">v{open.artifact.version}</span>
          </>
        ) : (
          <span className="topbar__title topbar__title--dim">No artifact open</span>
        )}
      </div>
      <div className="topbar__right">
        <button className="topbar__search" onClick={onOpenPalette}>
          Search · <Kbd>⌘K</Kbd>
        </button>
        <button
          className="topbar__icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
          title="Toggle theme"
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </div>
  );
}
