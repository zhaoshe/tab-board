// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getInitialSessionActivation,
  useSessionActivation,
} from './useSessionActivation';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ids = Array.from({ length: 10 }, (_, index) => `group-${index}`);

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latest: ReturnType<typeof useSessionActivation> | null = null;
let intersectionCallback:
  | ((entries: Array<{ isIntersecting: boolean; target: Element }>) => void)
  | null = null;
const observed: Element[] = [];

function Probe({
  contextKey,
  forcedIds = [],
}: {
  contextKey: string;
  forcedIds?: string[];
}) {
  latest = useSessionActivation({
    contextKey,
    forcedIds,
    groupIds: ids,
    initialCount: 3,
    overscanPx: 720,
  });
  return createElement(
    'section',
    { ref: latest.rootRef },
    ids.map((id) => createElement('div', {
      key: id,
      'data-id': id,
      ref: latest?.registerSlot(id),
    })),
  );
}

async function renderProbe(contextKey: string, forcedIds: string[] = []) {
  await act(async () => {
    root?.render(createElement(Probe, { contextKey, forcedIds }));
  });
}

beforeEach(() => {
  latest = null;
  intersectionCallback = null;
  observed.length = 0;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof intersectionCallback, options: IntersectionObserverInit) {
      intersectionCallback = callback;
      expect(options.rootMargin).toBe('0px 720px');
    }
    observe(element: Element) {
      observed.push(element);
    }
    unobserve() {}
    disconnect() {}
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('getInitialSessionActivation', () => {
  it('bounds the first interactive session set and includes forced ids', () => {
    expect([...getInitialSessionActivation(ids, ['group-8'], 3)])
      .toEqual(['group-0', 'group-1', 'group-2', 'group-8']);
  });
});

describe('useSessionActivation', () => {
  it('deactivates slots outside viewport plus overscan', async () => {
    await renderProbe('workspace:inbox');
    expect([...latest!.activeIds]).toEqual(['group-0', 'group-1', 'group-2']);
    expect(observed).toHaveLength(10);

    await act(async () => {
      intersectionCallback?.([
        {
          isIntersecting: true,
          target: container!.querySelector('[data-id="group-7"]')!,
        },
      ]);
    });
    expect(latest!.activeIds.has('group-7')).toBe(true);

    await act(async () => {
      intersectionCallback?.([
        {
          isIntersecting: false,
          target: container!.querySelector('[data-id="group-7"]')!,
        },
      ]);
    });
    expect(latest!.activeIds.has('group-7')).toBe(false);
  });


  it('stays bounded after traversing every slot and returning to the beginning', async () => {
    await renderProbe('workspace:inbox');
    for (let index = 0; index < ids.length; index += 1) {
      await act(async () => intersectionCallback?.(ids.map((id, slotIndex) => ({
        isIntersecting: slotIndex === index,
        target: container!.querySelector(`[data-id="${id}"]`)!,
      }))));
      expect(latest!.activeIds.size).toBe(1);
    }
    await act(async () => intersectionCallback?.(ids.map((id, index) => ({
      isIntersecting: index === 0,
      target: container!.querySelector(`[data-id="${id}"]`)!,
    }))));
    expect([...latest!.activeIds]).toEqual(['group-0']);
  });

  it('retains forced owners outside overscan and releases them without another intersection', async () => {
    await renderProbe('workspace:inbox', ['group-8']);
    await act(async () => intersectionCallback?.([{
      isIntersecting: false,
      target: container!.querySelector('[data-id="group-8"]')!,
    }]));
    expect(latest!.activeIds.has('group-8')).toBe(true);
    await renderProbe('workspace:inbox');
    expect(latest!.activeIds.has('group-8')).toBe(false);
  });

  it('resets bounded activation when context changes', async () => {
    await renderProbe('workspace:inbox');
    await act(async () => latest!.activate('group-9'));
    expect(latest!.activeIds.has('group-9')).toBe(true);

    await renderProbe('workspace:saved');
    expect([...latest!.activeIds]).toEqual(['group-0', 'group-1', 'group-2']);
  });

  it('activates newly forced ids immediately', async () => {
    await renderProbe('workspace:inbox');
    await renderProbe('workspace:inbox', ['group-8']);
    expect(latest!.activeIds.has('group-8')).toBe(true);
  });

  it('falls back to every session when IntersectionObserver is unavailable', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    await renderProbe('workspace:inbox');
    expect([...latest!.activeIds]).toEqual(ids);
  });
});
