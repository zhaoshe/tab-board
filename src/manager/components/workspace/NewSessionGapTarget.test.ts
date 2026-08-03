// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getReleaseTipPosition,
  NewSessionGapTarget,
} from './NewSessionGapTarget';

const testHarness = vi.hoisted(() => ({
  droppableOptions: [] as unknown[],
}));

const COARSE_POINTER_QUERY = '(hover: none), (pointer: coarse)';

vi.mock('@dnd-kit/core', () => ({
  useDroppable: (options: unknown) => {
    testHarness.droppableOptions.push(options);
    return { setNodeRef: vi.fn() };
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let coarsePointer = false;
let mediaQueryListeners: Set<() => void>;
let addMediaQueryListener: ReturnType<typeof vi.fn>;
let removeMediaQueryListener: ReturnType<typeof vi.fn>;

function latestDroppableOptions(): { disabled: boolean } {
  const options = testHarness.droppableOptions.at(-1);
  if (!options) throw new Error('Missing droppable options.');
  return options as { disabled: boolean };
}

async function setCoarsePointer(matches: boolean): Promise<void> {
  coarsePointer = matches;
  await act(async () => {
    for (const listener of mediaQueryListeners) listener();
  });
}

async function renderTarget({
  enabled = true,
  active = false,
}: {
  enabled?: boolean;
  active?: boolean;
} = {}): Promise<void> {
  root = createRoot(container!);
  await act(async () => {
    root?.render(createElement(NewSessionGapTarget, {
      category: 'inbox',
      index: 2,
      workspaceId: 'workspace-a',
      enabled,
      active,
    }));
  });
}

async function rerenderTarget(
  enabled: boolean,
  active = false,
): Promise<void> {
  await act(async () => {
    root?.render(createElement(NewSessionGapTarget, {
      category: 'inbox',
      index: 2,
      workspaceId: 'workspace-a',
      enabled,
      active,
    }));
  });
}

beforeEach(() => {
  coarsePointer = false;
  mediaQueryListeners = new Set();
  addMediaQueryListener = vi.fn((_type: string, listener: () => void) => {
    mediaQueryListeners.add(listener);
  });
  removeMediaQueryListener = vi.fn((_type: string, listener: () => void) => {
    mediaQueryListeners.delete(listener);
  });
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query === COARSE_POINTER_QUERY && coarsePointer,
    media: query,
    onchange: null,
    addEventListener: addMediaQueryListener,
    removeEventListener: removeMediaQueryListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
  container = document.createElement('div');
  document.body.append(container);
  testHarness.droppableOptions = [];
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('NewSessionGapTarget', () => {
  it('clamps release tips at viewport edges and falls below when top space is unavailable', () => {
    const tipSize = { width: 100, height: 30 };
    const viewport = { width: 400, height: 300 };
    const options = { padding: 12, gap: 8 };

    expect(getReleaseTipPosition(
      { left: -10, right: 10, top: 100, bottom: 120, width: 20, height: 20 },
      tipSize,
      viewport,
      options,
    )).toEqual({ left: 12, top: 62 });
    expect(getReleaseTipPosition(
      { left: 150, right: 170, top: 100, bottom: 120, width: 20, height: 20 },
      tipSize,
      viewport,
      options,
    )).toEqual({ left: 110, top: 62 });
    expect(getReleaseTipPosition(
      { left: 390, right: 410, top: 100, bottom: 120, width: 20, height: 20 },
      tipSize,
      viewport,
      options,
    )).toEqual({ left: 288, top: 62 });
    expect(getReleaseTipPosition(
      { left: 150, right: 170, top: 4, bottom: 24, width: 20, height: 20 },
      tipSize,
      viewport,
      options,
    )).toEqual({ left: 110, top: 32 });
    expect(getReleaseTipPosition(
      { left: 150, right: 170, top: 4, bottom: 24, width: 20, height: 20 },
      { width: 100, height: 280 },
      viewport,
      options,
    )).toEqual({ left: 110, top: 12 });
  });

  it('owns one aria-hidden new-session insertion target', async () => {
    await renderTarget();

    expect(testHarness.droppableOptions).toEqual([{
      id: 'new-session-insert-workspace-a-inbox-2',
      disabled: false,
      data: {
        type: 'new-session-insert',
        dnd: {
          targets: [{
            kind: 'new-session-insert',
            category: 'inbox',
            index: 2,
            workspaceId: 'workspace-a',
          }],
        },
      },
    }]);
    const target = document.querySelector<HTMLElement>('.new-session-gap-target');
    expect(target?.getAttribute('aria-hidden')).toBe('true');
    expect(target?.getAttribute('data-active')).toBeNull();
  });

  it('exposes the presentational active hook without changing target semantics', async () => {
    await renderTarget({ active: true });

    expect(document.querySelector('.new-session-gap-target')?.getAttribute('data-active'))
      .toBe('true');
    expect(testHarness.droppableOptions).toHaveLength(1);
  });

  it('shows a pointer-transparent release tip only after 300ms active dwell', async () => {
    vi.useFakeTimers();
    try {
      await renderTarget();
      const target = document.querySelector('.new-session-gap-target');

      await rerenderTarget(true, true);
      expect(document.querySelector('.new-session-gap-target')).toBe(target);
      expect(document.querySelector('.new-session-gap-target__release-tip')).toBeNull();

      await act(async () => vi.advanceTimersByTime(299));
      expect(document.body.textContent).not.toContain('Release to create session');

      await act(async () => vi.advanceTimersByTime(1));
      const tip = document.querySelector<HTMLElement>(
        '.new-session-gap-target__release-tip',
      );
      expect(tip?.textContent).toBe('Release to create session');
      expect(document.querySelector('.new-session-gap-target')).toBe(target);

      await rerenderTarget(true, false);
      expect(document.querySelector('.new-session-gap-target__release-tip')).toBeNull();

      await rerenderTarget(true, true);
      expect(document.querySelector('.new-session-gap-target__release-tip')).toBeNull();
      await act(async () => vi.advanceTimersByTime(299));
      expect(document.querySelector('.new-session-gap-target__release-tip')).toBeNull();
      await act(async () => vi.advanceTimersByTime(1));
      expect(document.querySelector('.new-session-gap-target__release-tip')).not.toBeNull();

      await rerenderTarget(true, false);
      expect(document.querySelector('.new-session-gap-target__release-tip')).toBeNull();
      await rerenderTarget(true, true);
      await act(async () => vi.advanceTimersByTime(299));
      await act(async () => root?.unmount());
      root = null;
      await act(async () => vi.advanceTimersByTime(1));
      expect(document.body.textContent).not.toContain('Release to create session');
    } finally {
      vi.useRealTimers();
    }
  });

  it('disables dnd-kit registration and omits the affordance when disabled', async () => {
    await renderTarget({ enabled: false });

    expect(testHarness.droppableOptions).toEqual([expect.objectContaining({
      disabled: true,
    })]);
    expect(document.querySelector('.new-session-gap-target')).toBeNull();
  });

  it('keeps hook order stable while enabled toggles on the same mount', async () => {
    await renderTarget();
    expect(latestDroppableOptions().disabled).toBe(false);
    expect(document.querySelector('.new-session-gap-target')).not.toBeNull();

    vi.mocked(window.matchMedia).mockClear();
    await rerenderTarget(false);
    expect(window.matchMedia).toHaveBeenCalledWith(COARSE_POINTER_QUERY);
    expect(latestDroppableOptions().disabled).toBe(true);
    expect(document.querySelector('.new-session-gap-target')).toBeNull();

    vi.mocked(window.matchMedia).mockClear();
    await rerenderTarget(true);
    expect(window.matchMedia).toHaveBeenCalledWith(COARSE_POINTER_QUERY);
    expect(latestDroppableOptions().disabled).toBe(false);
    expect(document.querySelector('.new-session-gap-target')).not.toBeNull();
  });

  it('disables and unmounts the target while the pointer media query is coarse', async () => {
    await renderTarget();

    expect(window.matchMedia).toHaveBeenCalledWith(COARSE_POINTER_QUERY);
    expect(latestDroppableOptions().disabled).toBe(false);
    expect(document.querySelector('.new-session-gap-target')).not.toBeNull();

    await setCoarsePointer(true);

    expect(latestDroppableOptions().disabled).toBe(true);
    expect(document.querySelector('.new-session-gap-target')).toBeNull();

    await setCoarsePointer(false);

    expect(latestDroppableOptions().disabled).toBe(false);
    expect(document.querySelector('.new-session-gap-target')).not.toBeNull();

    await act(async () => root?.unmount());
    root = null;
    expect(removeMediaQueryListener).toHaveBeenCalledTimes(1);
    expect(mediaQueryListeners).toHaveLength(0);
  });
});
