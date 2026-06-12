import React from 'react';
import { createRoot } from 'react-dom/client';

/**
 * The custom-component harness — the ONLY code that runs inside a
 * `custom-react` sandbox frame besides the AI-generated component itself.
 * Built as a self-contained IIFE (own React copy) by `build:harness` and
 * served from the viewer origin, so the frame's CSP can allowlist it.
 *
 * Protocol (see docs/custom-components.md):
 *   frame → parent: ready, heartbeat (1s), resize
 *   parent → frame: mount { code, props, theme }, theme { theme }
 *
 * The component contract: compiled code defines `Component`; it renders as
 * <Component theme={theme} {...props} /> under a local error boundary, so a
 * render crash shows inside the frame and never reaches the artifact view.
 */

const HEARTBEAT_MS = 1000;

type Mount = {
  kind: 'mount';
  code: string;
  props: Record<string, unknown>;
  theme: 'light' | 'dark';
};
type ThemeMsg = { kind: 'theme'; theme: 'light' | 'dark' };

function isMount(d: unknown): d is Mount {
  const m = d as Mount;
  return (
    typeof d === 'object' &&
    d !== null &&
    m.kind === 'mount' &&
    typeof m.code === 'string' &&
    (m.theme === 'light' || m.theme === 'dark')
  );
}
function isThemeMsg(d: unknown): d is ThemeMsg {
  const m = d as ThemeMsg;
  return (
    typeof d === 'object' &&
    d !== null &&
    m.kind === 'theme' &&
    (m.theme === 'light' || m.theme === 'dark')
  );
}

const post = (msg: { kind: string; height?: number }) => window.parent.postMessage(msg, '*');

class HarnessBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  override state = { error: null };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  override render() {
    if (this.state.error !== null) {
      return (
        <div style={{ padding: 12, fontSize: 13, color: '#b91c1c' }}>
          Component crashed: {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [mount, setMount] = React.useState<Mount | null>(null);
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light');

  React.useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      // Only the embedding parent may drive this frame.
      if (ev.source !== window.parent) return;
      if (isMount(ev.data)) {
        setTheme(ev.data.theme);
        setMount(ev.data);
      } else if (isThemeMsg(ev.data)) {
        setTheme(ev.data.theme);
      }
    };
    window.addEventListener('message', onMessage);
    post({ kind: 'ready' });
    const beat = setInterval(() => post({ kind: 'heartbeat' }), HEARTBEAT_MS);
    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(beat);
    };
  }, []);

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  React.useEffect(() => {
    const observer = new ResizeObserver(() => {
      post({ kind: 'resize', height: document.documentElement.scrollHeight });
    });
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const Component = React.useMemo(() => {
    if (!mount) return null;
    try {
      // The compiled code (classic React.createElement output) defines
      // `Component`; React is the one global we hand it.
      const factory = new Function('React', `${mount.code}\n;return Component;`);
      return factory(React) as React.ComponentType<Record<string, unknown>>;
    } catch (e) {
      const message = (e as Error).message;
      const Failed = () => (
        <div style={{ padding: 12, fontSize: 13, color: '#b91c1c' }}>
          Component failed to load: {message}
        </div>
      );
      return Failed;
    }
  }, [mount]);

  if (!mount || !Component) return null;
  return (
    <HarnessBoundary>
      <Component theme={theme} {...mount.props} />
    </HarnessBoundary>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) createRoot(rootEl).render(<App />);
