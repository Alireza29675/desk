import { useEffect, useState } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { CommentRail } from './components/CommentRail';
import { HistoryBar } from './components/HistoryBar';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { useStore } from './state/store';
import { useAnchorHighlights } from './state/use-anchor-highlights';
import { DocumentView } from './views/DocumentView';
import { EmptyState, NotFoundState } from './views/EmptyState';
import { PresentationView } from './views/PresentationView';
import './styles/app.css';

export function App() {
  const init = useStore((s) => s.init);
  const open = useStore((s) => s.open);
  const loadError = useStore((s) => s.loadError);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Which off-canvas panel is open on narrow viewports (ignored on wide via CSS).
  const [panel, setPanel] = useState<'nav' | 'comments' | null>(null);
  useAnchorHighlights();

  // Close the mobile panel when the open artifact changes (e.g. after picking
  // one from the nav drawer).
  // biome-ignore lint/correctness/useExhaustiveDependencies: close on route change
  useEffect(() => setPanel(null), [open?.artifact.id]);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const isPalette = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isPalette) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      // Escape dismisses an open drawer/sheet (the palette handles its own).
      if (e.key === 'Escape') setPanel(null);
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Force light theme for any print path (the Export button *and* the browser's
  // own ⌘P) so PDFs read cleanly on paper, then restore afterward.
  useEffect(() => {
    let prev: string | undefined;
    const before = () => {
      prev = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme = 'light';
    };
    const after = () => {
      if (prev) document.documentElement.dataset.theme = prev;
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  return (
    <div className="app" data-panel={panel ?? undefined}>
      <Sidebar />
      <main className="workspace">
        <Topbar
          onOpenPalette={() => setPaletteOpen(true)}
          onToggleHistory={() => setHistoryOpen((v) => !v)}
          historyOpen={historyOpen}
          onToggleNav={() => setPanel((p) => (p === 'nav' ? null : 'nav'))}
          onToggleComments={() => setPanel((p) => (p === 'comments' ? null : 'comments'))}
        />
        {open && historyOpen ? <HistoryBar /> : null}
        <div className="workspace__body">
          {open ? (
            open.artifact.type === 'presentation' ? (
              <PresentationView artifact={open.artifact} />
            ) : (
              <DocumentView artifact={open.artifact} />
            )
          ) : loadError ? (
            <NotFoundState id={loadError} />
          ) : (
            <EmptyState />
          )}
        </div>
      </main>
      {open ? <CommentRail /> : null}
      {panel ? (
        <button
          type="button"
          className="mobile-backdrop"
          aria-label="Close panel"
          onClick={() => setPanel(null)}
        />
      ) : null}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
