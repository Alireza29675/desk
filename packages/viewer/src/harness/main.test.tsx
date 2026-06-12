// @vitest-environment happy-dom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './main';

// The harness App renders here directly (no iframe — happy-dom can't boot an
// opaque-origin frame, but the theme contract is plain DOM and fully assertable).
// In this top-level context window.parent === window, so a MessageEvent with
// source: window passes the parent-only guard exactly like the real bridge.

let container: HTMLDivElement;
let root: Root;

const COMPONENT_CODE = "function Component() { return React.createElement('div', null, 'ok'); }";

async function send(data: unknown) {
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', { data, source: window }));
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  document.documentElement.style.background = '';
  document.body.style.background = '';
  document.documentElement.style.colorScheme = '';
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('harness theme bridge — the surface follows theme flips', () => {
  it('applies colorScheme + surface to BOTH html and body on mount', async () => {
    await act(async () => root.render(<App />));
    await send({
      kind: 'mount',
      code: COMPONENT_CODE,
      props: {},
      theme: 'dark',
      surface: '#060607',
    });
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.documentElement.style.background).toBe('#060607');
    expect(document.body.style.background).toBe('#060607');
  });

  it('repaints BOTH html and body on a theme flip after boot', async () => {
    // The regression: the srcdoc seeds the boot surface on html+body; the flip
    // effect updated only body, so html kept the dark boot paint and showed as
    // a dark band below the component after dark→light.
    await act(async () => root.render(<App />));
    await send({
      kind: 'mount',
      code: COMPONENT_CODE,
      props: {},
      theme: 'dark',
      surface: '#060607',
    });
    await send({ kind: 'theme', theme: 'light', surface: '#f4f4f5' });
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.documentElement.style.background).toBe('#f4f4f5');
    expect(document.body.style.background).toBe('#f4f4f5');
  });

  it('keeps the previous surface when a theme message carries none', async () => {
    await act(async () => root.render(<App />));
    await send({
      kind: 'mount',
      code: COMPONENT_CODE,
      props: {},
      theme: 'dark',
      surface: '#060607',
    });
    await send({ kind: 'theme', theme: 'light' });
    // color-scheme still flips; the painted surface stays (no flash to unset).
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.documentElement.style.background).toBe('#060607');
    expect(document.body.style.background).toBe('#060607');
  });
});
