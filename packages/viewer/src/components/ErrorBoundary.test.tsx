// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error('boom');
  return <span>healthy</span>;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // React logs caught errors to console.error; silence for the throwing cases.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders children when they do not throw', () => {
    act(() => root.render(<ErrorBoundary fallback={<span>fallback</span>}><Boom explode={false} /></ErrorBoundary>));
    expect(container.textContent).toContain('healthy');
  });

  it('renders the fallback when a child throws', () => {
    act(() => root.render(<ErrorBoundary fallback={<span>fallback-ui</span>}><Boom explode /></ErrorBoundary>));
    expect(container.textContent).toContain('fallback-ui');
    expect(container.textContent).not.toContain('healthy');
  });

  it('recovers when resetKey changes and the child stops throwing', () => {
    act(() => root.render(<ErrorBoundary resetKey={1} fallback={<span>fallback-ui</span>}><Boom explode /></ErrorBoundary>));
    expect(container.textContent).toContain('fallback-ui');
    act(() => root.render(<ErrorBoundary resetKey={2} fallback={<span>fallback-ui</span>}><Boom explode={false} /></ErrorBoundary>));
    expect(container.textContent).toContain('healthy');
  });
});
