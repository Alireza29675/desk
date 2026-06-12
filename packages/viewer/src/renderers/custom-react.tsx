import { useEffect, useRef, useState } from 'react';
import { FrameSupervisor, buildFrameSrcdoc, clampFrameHeight } from '../lib/custom-frame';
import { useStore } from '../state/store';
import type { RendererProps } from './renderer-registry';

interface Data {
  code: string;
  props?: Record<string, unknown>;
  height?: number;
  caption?: string;
}

const SUPERVISOR_TICK_MS = 500;

/** The themed background the sandbox body paints, resolved from the design
 *  token (the frame can't read tokens.css through its CSP). Sunken so an
 *  embedded component card reads against a slightly-darker well. */
function resolveSurface(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-bg-sunken').trim();
}

/**
 * AI-generated React, executed in a sandboxed iframe (`allow-scripts` ONLY —
 * never `allow-same-origin`): opaque origin, no parent DOM/store access, no
 * network (frame CSP). The parent fetches the server-compiled JS and posts
 * it in; the harness instantiates it with `theme` as a prop. A frame that
 * never heartbeats (boot deadline) or stops (stalled) is torn down and
 * offered a reload — worst case is this one block, never the artifact view.
 */
export function CustomReactRenderer({ component, artifactId }: RendererProps<Data>) {
  const data = component.data;
  const theme = useStore((s) => s.theme);
  const [epoch, setEpoch] = useState(0); // iframe key — bump = full frame reload
  const [dead, setDead] = useState<'boot-timeout' | 'stalled' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [autoHeight, setAutoHeight] = useState(data.height ?? 320);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const readyRef = useRef(false);

  // The srcdoc is fixed per epoch; theme + surface flow over postMessage after.
  // Seed both so the first paint is themed (no white flash before mount).
  const [srcdoc] = useState(() =>
    buildFrameSrcdoc(window.location.origin, theme, resolveSurface()),
  );

  async function postMount(target: Window) {
    try {
      const res = await fetch(`/api/a/${artifactId}/components/${component.id}/compiled`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setLoadError(body?.error?.message ?? `compile failed (${res.status})`);
        return;
      }
      const code = await res.text();
      setLoadError(null);
      target.postMessage(
        {
          kind: 'mount',
          code,
          props: data.props ?? {},
          theme: useStore.getState().theme,
          surface: resolveSurface(),
        },
        '*',
      );
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }

  // Frame lifecycle: supervisor + strictly-validated message routing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: epoch IS the reload signal
  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    readyRef.current = false;
    const supervisor = new FrameSupervisor({
      onReady: () => {
        readyRef.current = true;
        const target = frame.contentWindow;
        if (target) void postMount(target);
      },
      onResize: (h) => {
        if (data.height === undefined) setAutoHeight(h);
      },
      onDead: (reason) => setDead(reason),
    });
    supervisor.start();
    const onMessage = (ev: MessageEvent) =>
      supervisor.handleMessage(ev.data, ev.source, frame.contentWindow);
    window.addEventListener('message', onMessage);
    const ticker = setInterval(() => supervisor.check(), SUPERVISOR_TICK_MS);
    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(ticker);
      supervisor.stop();
    };
  }, [epoch]);

  // Theme changes flow into the live frame as a prop update, with the freshly
  // resolved surface so the body background tracks the new theme.
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { kind: 'theme', theme, surface: resolveSurface() },
      '*',
    );
  }, [theme]);

  // Artifact edits change the code/props: re-mount the component in place
  // (no frame reload needed — the harness accepts a fresh mount payload).
  const dataKey = JSON.stringify([data.code, data.props, data.height]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataKey covers the data reads
  useEffect(() => {
    const target = iframeRef.current?.contentWindow;
    if (readyRef.current && target) void postMount(target);
  }, [dataKey]);

  function reload() {
    setDead(null);
    setLoadError(null);
    setEpoch((e) => e + 1);
  }

  if (dead !== null) {
    return (
      <div className="component-block">
        <div className="custom-react__dead">
          <span>
            Custom component unresponsive
            {dead === 'boot-timeout' ? ' (never booted)' : ''} — its sandbox was shut down.
          </span>
          <button type="button" className="custom-react__reload" onClick={reload}>
            Reload
          </button>
        </div>
        {data.caption ? <div className="component-caption">{data.caption}</div> : null}
      </div>
    );
  }

  const height = data.height ?? clampFrameHeight(autoHeight);
  return (
    <figure className="component-block">
      {loadError ? (
        <div className="custom-react__dead">
          <span>Custom component couldn’t load: {loadError}</span>
          <button type="button" className="custom-react__reload" onClick={reload}>
            Retry
          </button>
        </div>
      ) : null}
      <iframe
        key={epoch}
        ref={iframeRef}
        className="custom-react__frame"
        title={data.caption ?? 'Custom component'}
        sandbox="allow-scripts"
        srcDoc={srcdoc}
        style={{ height }}
      />
      {data.caption ? <figcaption className="component-caption">{data.caption}</figcaption> : null}
    </figure>
  );
}
