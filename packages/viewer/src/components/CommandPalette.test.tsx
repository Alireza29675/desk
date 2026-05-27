// @vitest-environment happy-dom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The palette searches artifacts via api.search; stub it so these tests isolate
// the command-filtering behavior (no real network / DeskService).
vi.mock('../lib/api', () => ({ api: { search: vi.fn().mockResolvedValue({ items: [] }) } }));

import { useStore } from '../state/store';
import { CommandPalette } from './CommandPalette';

let container: HTMLDivElement;
let root: Root;

async function flush() {
  // Let the debounced api.search effect resolve and re-render.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function type(value: string) {
  const input = container.querySelector('.palette__input') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  await act(async () => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush();
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  useStore.setState({ artifacts: [], theme: 'light' });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CommandPalette command filtering', () => {
  it('surfaces a command when its name is typed (not just on empty query)', async () => {
    await act(async () => root.render(<CommandPalette open onClose={() => {}} />));
    await type('theme');
    // The theme toggle must appear by name — the old behavior showed "No results.".
    expect(container.textContent).toContain('Switch to dark theme');
    expect(container.textContent).not.toContain('No results');
  });

  it('matches a command by hint as well as label', async () => {
    await act(async () => root.render(<CommandPalette open onClose={() => {}} />));
    await type('switch');
    expect(container.textContent).toContain('Switch to dark theme');
  });

  it('does not leak unrelated commands into an artifact-only query', async () => {
    await act(async () => root.render(<CommandPalette open onClose={() => {}} />));
    await type('renderer');
    // No artifacts (mocked empty) and no command matches "renderer" → empty state.
    expect(container.textContent).not.toContain('Switch to');
    expect(container.textContent).toContain('No results');
  });
});
