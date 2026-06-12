// @vitest-environment happy-dom
import type { Component } from '@desk/types';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomReactRenderer } from './custom-react';

const component = (data: Record<string, unknown>): Component =>
  ({
    id: 'cr-1',
    type: 'custom-react',
    data: { code: 'const Component = () => null;', ...data },
  }) as Component;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('var Component = () => null;', { status: 200 })),
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(data: Record<string, unknown> = {}) {
  act(() =>
    root.render(<CustomReactRenderer component={component(data) as never} artifactId="a1" />),
  );
  return container.querySelector('iframe') as HTMLIFrameElement;
}

describe('CustomReactRenderer — containment is structural', () => {
  it('sandboxes with allow-scripts ONLY — never allow-same-origin', () => {
    const frame = render();
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('the srcdoc carries the no-network CSP and loads the harness from our origin', () => {
    const frame = render();
    const doc = frame.getAttribute('srcdoc') ?? '';
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain('/custom-harness.js');
  });

  it('honors a fixed author height and skips auto-resize', () => {
    const frame = render({ height: 512 });
    expect(frame.style.height).toBe('512px');
  });

  it('renders the caption when present', () => {
    render({ caption: 'A tiny timer' });
    expect(container.textContent).toContain('A tiny timer');
  });
});

describe('CustomReactRenderer — fullscreen', () => {
  // happy-dom ships no Fullscreen API, so stub the surface (same pattern as
  // PresentationView): requestFullscreen on elements, exit + the
  // fullscreenElement getter on document.
  let requestFullscreen: ReturnType<typeof vi.fn>;
  let exitFullscreen: ReturnType<typeof vi.fn>;
  function setFullscreenElement(el: Element | null) {
    Object.defineProperty(document, 'fullscreenElement', { get: () => el, configurable: true });
  }
  beforeEach(() => {
    requestFullscreen = vi.fn().mockResolvedValue(undefined);
    exitFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      value: requestFullscreen,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      value: exitFullscreen,
      configurable: true,
      writable: true,
    });
    setFullscreenElement(null);
  });

  const fsButton = () => container.querySelector('.custom-react__fullscreen') as HTMLButtonElement;
  const figure = () => container.querySelector('figure.custom-react') as HTMLElement;

  it('always renders a fullscreen button on the component', () => {
    render({ caption: 'Widget' });
    expect(fsButton()).not.toBeNull();
    expect(fsButton().getAttribute('aria-label')).toBe('Fullscreen');
  });

  it('clicking it requests fullscreen on the figure (not the sandboxed iframe)', () => {
    render();
    act(() => fsButton().click());
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(requestFullscreen.mock.contexts[0]).toBe(figure());
  });

  it('fullscreenchange flips the label and fills the frame (covers native Esc exit)', () => {
    render();
    setFullscreenElement(figure());
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    expect(figure().getAttribute('data-fullscreen')).toBe('true');
    expect(fsButton().getAttribute('aria-label')).toBe('Exit fullscreen');
    expect((container.querySelector('iframe') as HTMLIFrameElement).style.height).toBe('100%');

    setFullscreenElement(null);
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    expect(figure().getAttribute('data-fullscreen')).toBeNull();
    expect(fsButton().getAttribute('aria-label')).toBe('Fullscreen');
  });
});
