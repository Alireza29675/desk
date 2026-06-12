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
