import { useState } from 'react';
import { Kbd } from './Kbd';
import { useStore } from '../state/store';
import { absoluteUrl, artifactPath } from '../lib/router';

export function Topbar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const open = useStore((s) => s.open);
  const closeArtifact = useStore((s) => s.closeArtifact);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!open) return;
    const url = absoluteUrl(artifactPath(open.artifact.id, open.locator));
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard blocked (insecure context); surface the URL so it's still copyable
      window.prompt('Copy this link:', url);
    }
  }

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
        {open ? (
          <button className="topbar__link" onClick={copyLink} title="Copy a link to this view">
            {copied ? 'Copied' : 'Copy link'}
          </button>
        ) : null}
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
