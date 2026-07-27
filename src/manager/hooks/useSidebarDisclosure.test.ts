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

function Probe({ onValue }: { onValue: (value: SidebarDisclosure) => void }) {
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
  localStorage.clear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
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
  vi.unstubAllGlobals();
});

describe('useSidebarDisclosure', () => {
  it('focuses the visible compact toggle after collapsing and expanded toggle after reopening', async () => {
    const observed: { current: SidebarDisclosure | null } = { current: null };
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(Probe, { onValue: (value) => { observed.current = value; } }));
    });
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
