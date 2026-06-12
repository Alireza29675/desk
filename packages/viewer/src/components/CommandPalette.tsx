import type { Artifact, ArtifactId } from '@desk/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../state/store';

/**
 * ⌘K / Ctrl-K command palette. Raycast-grade: opens instantly, keyboard
 * is the primary input, and the result list is virtualized-friendly
 * (linear scan is fine for v1's expected dataset; swap to virtualization
 * when artifact counts cross ~1000).
 */
interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  perform: () => void | Promise<void>;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Artifact[]>([]);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openArtifact = useStore((s) => s.openArtifact);
  const setTheme = useStore((s) => s.setTheme);
  const theme = useStore((s) => s.theme);
  const sidebarHidden = useStore((s) => s.sidebarHidden);
  const railHidden = useStore((s) => s.railHidden);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const toggleRail = useStore((s) => s.toggleRail);
  const artifacts = useStore((s) => s.artifacts);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlight(0);
    setResults(artifacts.slice(0, 8));
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, artifacts]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(artifacts.slice(0, 8));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { items } = await api.search(query);
        if (!cancelled) {
          setResults(items.slice(0, 12));
          setHighlight(0);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, artifacts]);

  const actions = useMemo<PaletteAction[]>(
    () => [
      {
        id: 'theme:toggle',
        label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
        hint: 'theme',
        perform: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'sidebar:toggle',
        label: sidebarHidden ? 'Show sidebar' : 'Hide sidebar',
        hint: 'layout panels',
        perform: () => toggleSidebar(),
      },
      {
        id: 'rail:toggle',
        label: railHidden ? 'Show comments' : 'Hide comments',
        hint: 'layout panels',
        perform: () => toggleRail(),
      },
    ],
    [theme, setTheme, sidebarHidden, railHidden, toggleSidebar, toggleRail],
  );

  // Commands stay findable by name: filter them by the query (label/hint
  // substring) rather than hiding them the moment the user types. An empty
  // query shows all commands. This keeps the "or run a command" promise true —
  // typing "theme" surfaces the theme toggle instead of "No results.".
  const matchedActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (a) => a.label.toLowerCase().includes(q) || a.hint?.toLowerCase().includes(q),
    );
  }, [actions, query]);

  const items = useMemo(
    () => [
      ...results.map((a) => ({
        kind: 'artifact' as const,
        artifact: a,
        label: a.content.title || a.id,
        hint: a.type,
      })),
      ...matchedActions.map((act) => ({
        kind: 'action' as const,
        action: act,
        label: act.label,
        hint: act.hint,
      })),
    ],
    [results, matchedActions],
  );

  if (!open) return null;

  function choose(idx: number) {
    const item = items[idx];
    if (!item) return;
    if (item.kind === 'artifact') void openArtifact(item.artifact.id as ArtifactId);
    else void item.action.perform();
    onClose();
  }

  return (
    <div className="palette-backdrop" onClick={onClose} role="presentation">
      <div
        className="palette"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <input
          ref={inputRef}
          className="palette__input"
          placeholder="Search artifacts or run a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => Math.min(items.length - 1, h + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(0, h - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(highlight);
            } else if (e.key === 'Escape') {
              // Consume the event so App's window-level Escape (which closes
              // the mobile drawer/sheet) doesn't also fire on the same press.
              e.preventDefault();
              onClose();
            }
          }}
        />
        <ul className="palette__list">
          {items.length === 0 ? (
            <li className="palette__empty">No results.</li>
          ) : (
            items.map((item, i) => (
              <li
                key={`${item.kind}-${item.label}`}
                className="palette__item"
                data-active={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(i)}
              >
                <span>{item.label}</span>
                {item.hint ? <span className="palette__hint">{item.hint}</span> : null}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
