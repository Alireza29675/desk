import { useEffect, useRef, useState } from 'react';
import { type DeskPieceHandle, mountDeskPiece } from '../lib/desk-piece';
import { useStore } from '../state/store';

/**
 * The empty-state hero: the raymarched WebGL desk piece, themed live from the
 * store. When WebGL2 isn't available (old hardware, happy-dom, blocked GL),
 * it degrades to the flat gradient brand mark — same identity, no canvas.
 *
 * The canvas is created imperatively inside the wrapper div rather than
 * rendered by React: dispose() loses the GL context, and a canvas element can
 * never hand out a fresh context afterwards. StrictMode double-mounts effects
 * in dev, so each mount needs its own canvas.
 */
export function DeskPiece() {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<DeskPieceHandle | null>(null);
  const theme = useStore((s) => s.theme);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    const handle = mountDeskPiece(canvas, { theme: useStore.getState().theme });
    if (!handle) {
      canvas.remove();
      setFailed(true);
      return;
    }
    handleRef.current = handle;
    return () => {
      handle.dispose();
      handleRef.current = null;
      canvas.remove();
    };
  }, []);

  useEffect(() => {
    handleRef.current?.setTheme(theme);
  }, [theme]);

  if (failed) return <div className="empty-state__mark" aria-hidden />;
  return <div ref={hostRef} className="empty-state__piece" aria-hidden />;
}
