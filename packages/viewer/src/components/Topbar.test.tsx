// @vitest-environment happy-dom
import type { Artifact, ArtifactId } from '@desk/types';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../state/store';
import { Topbar } from './Topbar';

function artifact(id: string, title = id, version = 1): Artifact {
  return {
    id: id as ArtifactId,
    type: 'enriched-document',
    content: { title, components: [] },
    provenance: { sessionId: 's', agentId: 'a' } as never,
    contributors: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    version,
  };
}
const openOf = (a: Artifact) => ({
  artifact: a,
  relations: { outgoing: [], incoming: [] },
  comments: [],
  locator: [],
});

let container: HTMLDivElement;
let root: Root;

const noop = () => {};
function render(props: Partial<Parameters<typeof Topbar>[0]> = {}) {
  act(() =>
    root.render(
      <Topbar onOpenPalette={noop} onToggleHistory={noop} historyOpen={false} {...props} />,
    ),
  );
}

const trigger = () => container.querySelector('button[aria-label="More actions"]') as HTMLElement;
const menu = () => container.querySelector('.topbar__menu');
const menuItem = (label: string) =>
  [...container.querySelectorAll('.topbar__menu-item')].find((b) =>
    b.textContent?.includes(label),
  ) as HTMLElement | undefined;

async function openMenu() {
  await act(async () => trigger().click());
  expect(menu()).not.toBeNull();
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  useStore.setState({ open: openOf(artifact('art-1', 'Doc')) as never, theme: 'light' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
  useStore.setState({ open: null, theme: 'light' });
});

describe('Topbar overflow menu — open/close via trigger and actions', () => {
  it('opens on trigger click (aria-expanded flips, popover appears) and an action closes it', async () => {
    const onOpenPalette = vi.fn();
    render({ onOpenPalette });
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(menu()).toBeNull();

    await act(async () => trigger().click());
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(menu()).not.toBeNull();

    await act(async () => menuItem('Search')?.click());
    expect(onOpenPalette).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('toggles closed when the trigger is clicked again', async () => {
    render();
    await openMenu();
    await act(async () => trigger().click());
    expect(menu()).toBeNull();
  });

  it('offers only Search + theme when no artifact is open (no Export/Copy rows)', async () => {
    useStore.setState({ open: null });
    render();
    await openMenu();
    expect(menuItem('Search')).toBeDefined();
    expect(menuItem('Dark theme')).toBeDefined();
    expect(menuItem('Export to PDF')).toBeUndefined();
    expect(menuItem('Copy link')).toBeUndefined();
  });

  it('flips the store theme from the menu item and closes', async () => {
    render();
    await openMenu();
    await act(async () => menuItem('Dark theme')?.click());
    expect(useStore.getState().theme).toBe('dark');
    expect(menu()).toBeNull();
  });
});

describe('Topbar — panel toggles (independent sidebar + rail)', () => {
  const sidebarToggle = () =>
    container.querySelector(
      'button[aria-label="Hide sidebar"], button[aria-label="Show sidebar"]',
    ) as HTMLElement | null;
  const railToggle = () =>
    container.querySelector(
      'button[aria-label="Hide comments"], button[aria-label="Show comments"]',
    ) as HTMLElement | null;

  afterEach(() => {
    localStorage.removeItem('desk-sidebar-hidden');
    localStorage.removeItem('desk-rail-hidden');
    useStore.setState({ sidebarHidden: false, railHidden: false });
  });

  it('sidebar toggle mirrors sidebarHidden and toggles on click, leaving the rail alone', async () => {
    useStore.setState({ sidebarHidden: false, railHidden: false });
    render();
    const btn = sidebarToggle();
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('aria-label')).toBe('Hide sidebar');
    expect(btn?.getAttribute('aria-pressed')).toBe('false');

    await act(async () => btn?.click());
    expect(useStore.getState().sidebarHidden).toBe(true);
    expect(useStore.getState().railHidden).toBe(false);
    const after = sidebarToggle();
    expect(after?.getAttribute('aria-pressed')).toBe('true');
    expect(after?.getAttribute('aria-label')).toBe('Show sidebar');
  });

  it('rail toggle mirrors railHidden and toggles on click (artifact open)', async () => {
    useStore.setState({ railHidden: false });
    render();
    const btn = railToggle();
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('aria-label')).toBe('Hide comments');

    await act(async () => btn?.click());
    expect(useStore.getState().railHidden).toBe(true);
    expect(useStore.getState().sidebarHidden).toBe(false);
    expect(railToggle()?.getAttribute('aria-label')).toBe('Show comments');
  });

  it('keeps the sidebar toggle with no artifact open, but drops the rail toggle', () => {
    useStore.setState({ open: null, sidebarHidden: false });
    render();
    expect(sidebarToggle()).not.toBeNull();
    expect(sidebarToggle()?.getAttribute('aria-label')).toBe('Hide sidebar');
    expect(railToggle()).toBeNull();
  });

  it('reflects already-hidden panels on first render', () => {
    useStore.setState({ sidebarHidden: true, railHidden: true });
    render();
    expect(sidebarToggle()?.getAttribute('aria-pressed')).toBe('true');
    expect(sidebarToggle()?.getAttribute('aria-label')).toBe('Show sidebar');
    expect(railToggle()?.getAttribute('aria-pressed')).toBe('true');
    expect(railToggle()?.getAttribute('aria-label')).toBe('Show comments');
  });
});

describe('Topbar overflow menu — outside pointerdown', () => {
  it('closes on a pointerdown outside the menu', async () => {
    render();
    await openMenu();
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(menu()).toBeNull();
  });

  it('stays open on a pointerdown inside the menu (clicks must not self-dismiss)', async () => {
    render();
    await openMenu();
    await act(async () => {
      menuItem('Search')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(menu()).not.toBeNull();
  });
});

describe('Topbar overflow menu — Escape', () => {
  it('closes on Escape and preventDefaults so App-level handlers skip the press', async () => {
    render();
    await openMenu();
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => window.dispatchEvent(esc));
    expect(menu()).toBeNull();
    // App's Escape handler checks defaultPrevented; this press must be claimed
    // by the menu so it doesn't also close a drawer underneath.
    expect(esc.defaultPrevented).toBe(true);
  });

  it('leaves Escape unclaimed when the menu is closed (drawers still get it)', async () => {
    render();
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => window.dispatchEvent(esc));
    expect(esc.defaultPrevented).toBe(false);
  });
});

describe('Topbar overflow menu — Copy link', () => {
  const expectedUrl = () => `${window.location.origin}/a/art-1`;

  function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    return () => Reflect.deleteProperty(navigator, 'clipboard');
  }

  it('writes the artifact URL, flips the row to "Copied", and keeps the menu open until the delayed dismiss', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const restore = stubClipboard(writeText);
    try {
      render();
      await openMenu();
      await act(async () => menuItem('Copy link')?.click());

      expect(writeText).toHaveBeenCalledWith(expectedUrl());
      // The feedback happens where the user is looking: the row itself.
      expect(menu()).not.toBeNull();
      expect(menuItem('Copied')).toBeDefined();
      expect(menuItem('Copy link')).toBeUndefined();

      // The menu dismisses itself ~900ms later, after the feedback registered.
      await act(async () => vi.advanceTimersByTime(900));
      expect(menu()).toBeNull();

      // The copied state resets at 1200ms (visible on the desktop inline button).
      const inline = [...container.querySelectorAll('.topbar__link')] as HTMLElement[];
      expect(inline.some((b) => b.textContent === 'Copied')).toBe(true);
      await act(async () => vi.advanceTimersByTime(300));
      expect(inline.some((b) => b.textContent === 'Copy link')).toBe(true);
    } finally {
      restore();
    }
  });

  it('falls back to window.prompt when the clipboard is blocked, without faking "Copied"', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('insecure context'));
    const restore = stubClipboard(writeText);
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
    try {
      render();
      await openMenu();
      await act(async () => menuItem('Copy link')?.click());

      expect(prompt).toHaveBeenCalledWith('Copy this link:', expectedUrl());
      // Nothing was copied, so the row must not claim it was.
      expect(menuItem('Copied')).toBeUndefined();
    } finally {
      restore();
    }
  });
});
