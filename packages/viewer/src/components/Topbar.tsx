import { useEffect, useRef, useState } from 'react';
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
  const panelsHidden = useStore((s) => s.panelsHidden);
  const togglePanels = useStore((s) => s.togglePanels);
  const [copied, setCopied] = useState(false);
  // Phone-width overflow menu (⋯) holding the secondary actions. Hidden on
  // wide viewports via CSS; the inline buttons hide on phones the same way.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Theme-forcing for print lives in App's beforeprint/afterprint handler, so
  // it applies whether you click Export or hit ⌘P.
  const exportPdf = () => window.print();

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Capture phase + preventDefault: the menu is the topmost surface, so
        // this press must not also close a drawer (App checks defaultPrevented).
        e.preventDefault();
        setMenuOpen(false);
      }
    }
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [menuOpen]);

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

  const runFromMenu = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  // Copy needs visible feedback where the user is looking: keep the menu open
  // so the row flips to "Copied", then dismiss once the state resets.
  const copyFromMenu = async () => {
    await copyLink();
    setTimeout(() => setMenuOpen(false), 900);
  };

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
            <button
              className="topbar__link topbar__desktop-only"
              onClick={exportPdf}
              title="Export to PDF (print)"
            >
              Export
            </button>
            <button
              className="topbar__link topbar__desktop-only"
              onClick={copyLink}
              title="Copy a link to this view"
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </>
        ) : null}
        <button
          className="topbar__icon topbar__desktop-only"
          onClick={togglePanels}
          aria-pressed={panelsHidden}
          aria-label={panelsHidden ? 'Show panels' : 'Hide panels'}
          title={panelsHidden ? 'Show panels' : 'Hide panels'}
        >
          ◫
        </button>
        <button className="topbar__search topbar__desktop-only" onClick={onOpenPalette}>
          Search · <Kbd>⌘K</Kbd>
        </button>
        <button
          className="topbar__icon topbar__desktop-only"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
          title="Toggle theme"
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <div className="topbar__more" ref={menuRef}>
          {/* Plain buttons in a popover, not role="menu" — full ARIA menu
              semantics (roving focus, arrow keys) aren't implemented, and
              announcing a half-menu is worse than honest buttons. */}
          <button
            className="topbar__icon"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More actions"
            aria-expanded={menuOpen}
            title="More"
          >
            ⋯
          </button>
          {menuOpen ? (
            <div className="topbar__menu">
              <button className="topbar__menu-item" onClick={runFromMenu(onOpenPalette)}>
                Search
              </button>
              {open ? (
                <>
                  <button className="topbar__menu-item" onClick={runFromMenu(exportPdf)}>
                    Export to PDF
                  </button>
                  <button className="topbar__menu-item" onClick={copyFromMenu}>
                    {copied ? 'Copied' : 'Copy link'}
                  </button>
                </>
              ) : null}
              <button
                className="topbar__menu-item"
                onClick={runFromMenu(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}
              >
                {theme === 'dark' ? 'Light theme' : 'Dark theme'}
              </button>
            </div>
          ) : null}
        </div>
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
