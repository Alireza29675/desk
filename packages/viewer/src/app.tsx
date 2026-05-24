import { useEffect, useState } from 'react';
import { useStore } from './state/store';
import { useAnchorHighlights } from './state/use-anchor-highlights';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { CommandPalette } from './components/CommandPalette';
import { CommentRail } from './components/CommentRail';
import { DocumentView } from './views/DocumentView';
import { PresentationView } from './views/PresentationView';
import { EmptyState } from './views/EmptyState';
import './styles/app.css';

export function App() {
  const init = useStore((s) => s.init);
  const open = useStore((s) => s.open);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useAnchorHighlights();

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
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="app">
      <Sidebar />
      <main className="workspace">
        <Topbar onOpenPalette={() => setPaletteOpen(true)} />
        <div className="workspace__body">
          {open ? (
            open.artifact.type === 'presentation' ? (
              <PresentationView artifact={open.artifact} />
            ) : (
              <DocumentView artifact={open.artifact} />
            )
          ) : (
            <EmptyState />
          )}
        </div>
      </main>
      {open ? <CommentRail /> : null}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
