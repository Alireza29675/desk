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
  const panelsHidden = useStore((s) => s.panelsHidden);
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
      // Escape dismisses an open drawer/sheet — unless a closer surface
      // (palette, topbar menu) already consumed this press.
      if (e.key === 'Escape' && !e.defaultPrevented) setPanel(null);
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Lift the comments bottom sheet above the soft keyboard. iOS doesn't
  // resize the layout viewport when the keyboard shows (dvh doesn't track it
  // either), so a bottom-pinned composer would hide behind it; visualViewport
  // is the only honest signal. Desktop / no keyboard → inset 0, a no-op.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let last = '';
    const update = () => {
      // Pinch-zoom also shrinks the visual viewport with no keyboard in
      // sight — only treat the shortfall as a keyboard at 1:1 scale.
      const inset =
        vv.scale > 1 ? 0 : Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const value = `${Math.round(inset)}px`;
      if (value === last) return; // vv 'scroll' fires continuously on iOS
      last = value;
      document.documentElement.style.setProperty('--keyboard-inset', value);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
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
    // data-panels (plural) is the desktop hide-panels toggle; data-panel
    // (singular) is the mobile drawer/sheet state. Separate on purpose —
    // ≤920px the CSS ignores data-panels entirely, so drawers are unaffected.
    <div
      className="app"
      data-panel={panel ?? undefined}
      data-panels={panelsHidden ? 'hidden' : undefined}
    >
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
        {/* Keyed per artifact (or empty/not-found state) so React remounts the
            body on a switch — the remount retriggers the content-enter
            animation and starts the new artifact scrolled to the top. Keyed
            on .workspace__body itself, never an inner wrapper: this element
            must stay THE scroll container (anchor overlay math reads rects of
            content scrolled within it). */}
        <div
          className="workspace__body"
          key={open ? open.artifact.id : loadError ? 'notfound' : 'empty'}
        >
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
