import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { api } from '../lib/api';
import type { Artifact, ArtifactId } from '@desk/types';

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
    ],
    [theme, setTheme],
  );

  const items = useMemo(
    () => [
      ...results.map((a) => ({
        kind: 'artifact' as const,
        artifact: a,
        label: a.content.title || a.id,
        hint: a.type,
      })),
      ...(query.trim() === ''
        ? actions.map((act) => ({ kind: 'action' as const, action: act, label: act.label, hint: act.hint }))
        : []),
    ],
    [results, actions, query],
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
      <div className="palette" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
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
              onClose();
            }
          }}
        />
        <ul className="palette__list" role="listbox">
          {items.length === 0 ? (
            <li className="palette__empty">No results.</li>
          ) : (
            items.map((item, i) => (
              <li
                key={i}
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
