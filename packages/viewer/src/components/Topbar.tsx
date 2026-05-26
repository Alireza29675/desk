import { useState } from 'react';
import { absoluteUrl, artifactPath } from '../lib/router';
import { useStore } from '../state/store';
import { Kbd } from './Kbd';

export function Topbar({
  onOpenPalette,
  onToggleHistory,
  historyOpen,
  onToggleNav,
  onToggleComments,
}: {
  onOpenPalette: () => void;
  onToggleHistory: () => void;
  historyOpen: boolean;
  onToggleNav: () => void;
  onToggleComments: () => void;
}) {
  const open = useStore((s) => s.open);
  const closeArtifact = useStore((s) => s.closeArtifact);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const [copied, setCopied] = useState(false);

  // Theme-forcing for print lives in App's beforeprint/afterprint handler, so
  // it applies whether you click Export or hit ⌘P.
  const exportPdf = () => window.print();

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
        <button
          className="topbar__icon topbar__mobile-only"
          onClick={onToggleNav}
          aria-label="Toggle artifacts"
          title="Artifacts"
        >
          ☰
        </button>
        {open ? (
          <>
            <button className="topbar__back" onClick={closeArtifact} aria-label="Close artifact">
              ←
            </button>
            <span className="topbar__title">{open.artifact.content.title}</span>
            <button
              className="topbar__badge"
              data-active={historyOpen ? 'true' : undefined}
              onClick={onToggleHistory}
              title="Version history"
            >
              v{open.artifact.version}
            </button>
          </>
        ) : (
          <span className="topbar__title topbar__title--dim">No artifact open</span>
        )}
      </div>
      <div className="topbar__right">
        {open ? (
          <>
            <button className="topbar__link" onClick={exportPdf} title="Export to PDF (print)">
              Export
            </button>
            <button className="topbar__link" onClick={copyLink} title="Copy a link to this view">
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </>
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
        {open ? (
          <button
            className="topbar__icon topbar__mobile-only"
            onClick={onToggleComments}
            aria-label="Toggle comments"
            title="Comments"
          >
            💬
          </button>
        ) : null}
      </div>
    </div>
  );
}
