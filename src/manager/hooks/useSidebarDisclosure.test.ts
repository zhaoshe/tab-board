// @vitest-environment happy-dom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useSidebarDisclosure,
  type SidebarDisclosure,
} from './useSidebarDisclosure';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let narrowViewport = false;
let coarsePointer = false;
let reducedMotion = false;

type DesiredSidebarDisclosure = SidebarDisclosure & {
  state?: 'collapsed' | 'peek' | 'pinned' | 'drawer';
  setPeekIntent?: (
    source: 'pointer' | 'focus',
    active: boolean,
    options?: { cancelPending?: boolean },
  ) => void;
  pin?: () => void;
  promote?: () => void;
};

function Probe({ onValue }: { onValue: (value: DesiredSidebarDisclosure) => void }) {
  const value = useSidebarDisclosure();
  useEffect(() => onValue(value), [onValue, value]);
  return createElement(
    'div',
    null,
    createElement('button', { ref: value.expandedToggleRef }, 'Collapse'),
    createElement('button', { ref: value.compactToggleRef }, 'Expand'),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  narrowViewport = false;
  coarsePointer = false;
  reducedMotion = false;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width')
      ? narrowViewport
      : query.includes('prefers-reduced-motion')
        ? reducedMotion
        : query.includes('hover') || query.includes('pointer')
          ? coarsePointer
          : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useSidebarDisclosure', () => {
  async function mountDisclosure(
    collapsedPreference = true,
  ): Promise<{ current: DesiredSidebarDisclosure | null }> {
    localStorage.setItem('tabboard.sidebarCollapsed', String(collapsedPreference));
    const observed: { current: DesiredSidebarDisclosure | null } = { current: null };
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(Probe, {
        onValue: (value) => {
          observed.current = value;
        },
      }));
    });
    return observed;
  }

  it('opens a desktop temporary peek exactly after the 350ms dwell', async () => {
    const observed = await mountDisclosure();
    expect(observed.current?.state).toBe('collapsed');

    await act(async () => observed.current?.setPeekIntent?.('pointer', true));
    await act(async () => vi.advanceTimersByTime(349));
    expect(observed.current?.state).toBe('collapsed');

    await act(async () => vi.advanceTimersByTime(1));
    expect(observed.current?.state).toBe('peek');
    expect(observed.current?.collapsed).toBe(true);
    expect(localStorage.getItem('tabboard.sidebarCollapsed')).toBe('true');
  });

  it('cancels pending dwell and closes an open peek when the rail is left', async () => {
    const observed = await mountDisclosure();

    await act(async () => observed.current?.setPeekIntent?.('pointer', true));
    await act(async () => vi.advanceTimersByTime(349));
    await act(async () => observed.current?.setPeekIntent?.('pointer', false));
    await act(async () => vi.advanceTimersByTime(1));
    expect(observed.current?.state).toBe('collapsed');

    await act(async () => observed.current?.setPeekIntent?.('pointer', true));
    await act(async () => vi.advanceTimersByTime(350));
    expect(observed.current?.state).toBe('peek');
    await act(async () => observed.current?.setPeekIntent?.('pointer', false));
    expect(observed.current?.state).toBe('collapsed');
  });

  it('pins a temporary peek and persists only the desktop pinned preference', async () => {
    const observed = await mountDisclosure();
    await act(async () => observed.current?.setPeekIntent?.('pointer', true));
    await act(async () => vi.advanceTimersByTime(350));

    await act(async () => observed.current?.pin?.());
    expect(observed.current?.state).toBe('pinned');
    expect(observed.current?.collapsed).toBe(false);
    expect(localStorage.getItem('tabboard.sidebarCollapsed')).toBe('false');
  });

  it('promotes a workflow peek without overwriting the explicit desktop preference', async () => {
    const observed = await mountDisclosure();
    await act(async () => observed.current?.setPeekIntent?.('pointer', true));
    await act(async () => vi.advanceTimersByTime(350));

    await act(async () => observed.current?.promote?.());

    expect(observed.current?.state).toBe('pinned');
    expect(observed.current?.collapsed).toBe(false);
    expect(localStorage.getItem('tabboard.sidebarCollapsed')).toBe('true');
  });

  it('keeps peek open until both pointer and focus intents leave', async () => {
    const observed = await mountDisclosure();
    await act(async () => observed.current?.setPeekIntent?.('pointer', true));
    await act(async () => vi.advanceTimersByTime(350));
    expect(observed.current?.state).toBe('peek');

    await act(async () => observed.current?.setPeekIntent?.('focus', true));
    await act(async () => observed.current?.setPeekIntent?.('pointer', false));
    expect(observed.current?.state).toBe('peek');

    await act(async () => observed.current?.setPeekIntent?.('focus', false));
    expect(observed.current?.state).toBe('collapsed');
  });

  it('cancels a mixed pointer/focus dwell when focus moves to Expand', async () => {
    const observed = await mountDisclosure();
    await act(async () => observed.current?.setPeekIntent?.('pointer', true));
    await act(async () => observed.current?.setPeekIntent?.('focus', true));
    await act(async () => vi.advanceTimersByTime(349));
    await act(async () => observed.current?.setPeekIntent?.(
      'focus',
      false,
      { cancelPending: true },
    ));
    await act(async () => vi.advanceTimersByTime(350));

    expect(observed.current?.state).toBe('collapsed');

    await act(async () => observed.current?.setPeekIntent?.('pointer', false));
    await act(async () => observed.current?.setPeekIntent?.('pointer', true));
    await act(async () => vi.advanceTimersByTime(350));
    expect(observed.current?.state).toBe('peek');
  });

  it('preserves an open pointer-owned peek when Expand receives focus', async () => {
    const observed = await mountDisclosure();
    await act(async () => observed.current?.setPeekIntent?.('pointer', true));
    await act(async () => vi.advanceTimersByTime(350));

    await act(async () => observed.current?.setPeekIntent?.(
      'focus',
      false,
      { cancelPending: true },
    ));

    expect(observed.current?.state).toBe('peek');
  });

  it('accepts a fresh peek intent after an explicit desktop collapse', async () => {
    const observed = await mountDisclosure(false);

    await act(async () => observed.current?.toggle(false));
    expect(observed.current?.state).toBe('collapsed');

    await act(async () => observed.current?.setPeekIntent?.('pointer', true));
    await act(async () => vi.advanceTimersByTime(350));

    expect(observed.current?.state).toBe('peek');
  });

  it('uses a transient inert drawer on narrow viewports without overwriting desktop preference', async () => {
    narrowViewport = true;
    const observed = await mountDisclosure(false);
    expect(observed.current?.state).toBe('collapsed');

    await act(async () => observed.current?.toggle(true));
    expect(observed.current?.state).toBe('drawer');
    expect(localStorage.getItem('tabboard.sidebarCollapsed')).toBe('false');

    await act(async () => observed.current?.toggle(false));
    expect(observed.current?.state).toBe('collapsed');
    expect(localStorage.getItem('tabboard.sidebarCollapsed')).toBe('false');
  });

  it('does not open a desktop hover peek for a coarse pointer', async () => {
    coarsePointer = true;
    const observed = await mountDisclosure();

    await act(async () => observed.current?.setPeekIntent?.('pointer', true));
    await act(async () => vi.advanceTimersByTime(350));
    expect(observed.current?.state).toBe('collapsed');
  });

  it('keeps the 350ms dwell deterministic when reduced motion is requested', async () => {
    reducedMotion = true;
    const observed = await mountDisclosure();

    await act(async () => observed.current?.setPeekIntent?.('pointer', true));
    await act(async () => vi.advanceTimersByTime(349));
    expect(observed.current?.state).toBe('collapsed');
    await act(async () => vi.advanceTimersByTime(1));
    expect(observed.current?.state).toBe('peek');
  });

  it('cleans a pending dwell timer before unmount', async () => {
    const observed = await mountDisclosure();
    await act(async () => observed.current?.setPeekIntent?.('pointer', true));
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    await act(async () => root?.unmount());
    root = null;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('focuses the visible compact toggle after collapsing and expanded toggle after reopening', async () => {
    const observed = await mountDisclosure(false);
    if (!observed.current) throw new Error('Sidebar disclosure did not mount.');

    await act(async () => {
      observed.current?.toggle(false);
    });
    expect(observed.current?.collapsed).toBe(true);
    expect(document.activeElement?.textContent).toBe('Expand');

    await act(async () => {
      observed.current?.toggle(true);
    });
    expect(observed.current?.collapsed).toBe(false);
    expect(document.activeElement?.textContent).toBe('Collapse');
  });
});
