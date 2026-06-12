// @vitest-environment happy-dom
import type { Artifact, ArtifactId } from '@desk/types';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../state/store';
import { PresentationView } from './PresentationView';

function presentation(): Artifact {
  return {
    id: 'art-1' as ArtifactId,
    type: 'presentation',
    content: {
      title: 'Deck',
      components: [
        { id: 'b1', type: 'slide-break', data: { title: 'One' } },
        { id: 'c1', type: 'note-block', data: {} },
        { id: 'b2', type: 'slide-break', data: { title: 'Two' } },
        { id: 'c2', type: 'note-block', data: {} },
      ] as never,
    },
    provenance: { sessionId: 's', agentId: 'a' } as never,
    contributors: [],
    createdAt: '2024-03-15T12:00:00.000Z',
    updatedAt: '2024-04-20T12:00:00.000Z',
    version: 1,
  };
}

let container: HTMLDivElement;
let root: Root;
let requestFullscreen: ReturnType<typeof vi.fn>;
let exitFullscreen: ReturnType<typeof vi.fn>;

// happy-dom doesn't implement the Fullscreen API (the view feature-detects
// it), so stub the whole surface: requestFullscreen on elements,
// exitFullscreen + the fullscreenElement getter on document.
function setFullscreenElement(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', {
    get: () => el,
    configurable: true,
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
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
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useStore.setState({ open: null });
});

// The view reads `s.open?.locator` — render with a populated open bundle so
// the selector returns a stable reference (open:null re-subscribes forever).
function render() {
  const a = presentation();
  useStore.setState({
    open: {
      artifact: a,
      relations: { outgoing: [], incoming: [] },
      comments: [],
      locator: [],
    } as never,
  });
  act(() => root.render(<PresentationView artifact={a} />));
  return container.querySelector('.presentation') as HTMLElement;
}

const fullscreenButton = () =>
  container.querySelector('.presentation__fullscreen') as HTMLButtonElement;

describe('PresentationView — fullscreen presentation mode', () => {
  it('renders the ⛶ button in the head row with an enter label', () => {
    render();
    const btn = fullscreenButton();
    expect(btn).not.toBeNull();
    expect(btn.closest('.presentation__head-row')).not.toBeNull();
    expect(btn.getAttribute('aria-label')).toBe('Enter fullscreen');
  });

  it('clicking the button requests fullscreen on the .presentation root', () => {
    const el = render();
    act(() => fullscreenButton().click());
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(requestFullscreen.mock.contexts[0]).toBe(el);
  });

  it('the `f` key requests fullscreen', () => {
    render();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    });
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('typing `f` inside an input is ignored (same guard as slide nav)', () => {
    render();
    const input = document.createElement('input');
    container.appendChild(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
    });
    expect(requestFullscreen).not.toHaveBeenCalled();
    input.remove();
  });

  it('fullscreenchange syncs data-fullscreen and flips the label (covers native Esc exit)', () => {
    const el = render();
    expect(el.getAttribute('data-fullscreen')).toBeNull();

    setFullscreenElement(el);
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(el.getAttribute('data-fullscreen')).toBe('true');
    expect(fullscreenButton().getAttribute('aria-label')).toBe('Exit fullscreen');

    setFullscreenElement(null);
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(el.getAttribute('data-fullscreen')).toBeNull();
    expect(fullscreenButton().getAttribute('aria-label')).toBe('Enter fullscreen');
  });

  it('locks to landscape on entering fullscreen and unlocks on exit (mobile)', () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    const unlock = vi.fn();
    Object.defineProperty(window.screen, 'orientation', {
      value: { lock, unlock },
      configurable: true,
    });
    const el = render();

    setFullscreenElement(el);
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(lock).toHaveBeenCalledWith('landscape');

    setFullscreenElement(null);
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(unlock).toHaveBeenCalledTimes(1);

    // Don't leak the mock orientation into the other tests' fullscreen toggles.
    Object.defineProperty(window.screen, 'orientation', {
      value: undefined,
      configurable: true,
    });
  });

  it('while fullscreen the button (and `f`) exit instead of re-entering', () => {
    const el = render();
    setFullscreenElement(el);
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    act(() => fullscreenButton().click());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    });
    expect(exitFullscreen).toHaveBeenCalledTimes(2);
    expect(requestFullscreen).not.toHaveBeenCalled();
  });

  it('keyboard slide nav keeps working in fullscreen and the slide is not reset', () => {
    const el = render();
    setFullscreenElement(el);
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    });
    expect(container.querySelector('.presentation__pager')?.textContent).toBe('2 / 2');

    // Leaving fullscreen only changes painting, not state — slide 2 stays.
    setFullscreenElement(null);
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(container.querySelector('.presentation__pager')?.textContent).toBe('2 / 2');
  });
});
