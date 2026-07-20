import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('useStoreHydration lifecycle', () => {
  it('pairs remount setup and cleanup with the store lifecycle action', async () => {
    const cleanups: Array<() => void> = [];
    const setMounted = vi.fn();
    const hydrate = vi.fn(async () => undefined);
    const releaseHydration = vi.fn();
    const useTabBoardStore = vi.fn((selector: (state: {
      hydrate: typeof hydrate;
      hydrated: boolean;
      releaseHydration: typeof releaseHydration;
    }) => unknown) => selector({ hydrate, hydrated: false, releaseHydration }));

    vi.doMock('react', async () => {
      const actual = await vi.importActual<typeof import('react')>('react');
      return {
        ...actual,
        useEffect: (effect: () => void | (() => void)) => {
          const cleanup = effect();
          if (cleanup) cleanups.push(cleanup);
        },
        useState: (initial: boolean) => [initial, setMounted],
      };
    });
    vi.doMock('../store/useTabBoardStore', () => ({ useTabBoardStore }));

    const { useStoreHydration } = await import('./useStoreHydration');
    useStoreHydration();
    await vi.waitFor(() => expect(hydrate).toHaveBeenCalledTimes(1));

    cleanups.shift()?.();
    expect(releaseHydration).toHaveBeenCalledTimes(1);

    useStoreHydration();
    await vi.waitFor(() => expect(hydrate).toHaveBeenCalledTimes(2));
    expect(releaseHydration).toHaveBeenCalledTimes(1);
    expect(setMounted).toHaveBeenCalled();

    cleanups.shift()?.();
    expect(releaseHydration).toHaveBeenCalledTimes(2);
  });

  it('handles hydration rejection by resetting mounted state', async () => {
    const cleanups: Array<() => void> = [];
    const setMounted = vi.fn();
    const hydrate = vi.fn(async () => {
      throw new Error('worker unavailable');
    });
    const releaseHydration = vi.fn();
    const useTabBoardStore = vi.fn((selector: (state: {
      hydrate: typeof hydrate;
      hydrated: boolean;
      releaseHydration: typeof releaseHydration;
    }) => unknown) => selector({ hydrate, hydrated: false, releaseHydration }));

    vi.doMock('react', async () => {
      const actual = await vi.importActual<typeof import('react')>('react');
      return {
        ...actual,
        useEffect: (effect: () => void | (() => void)) => {
          const cleanup = effect();
          if (cleanup) cleanups.push(cleanup);
        },
        useState: (initial: boolean) => [initial, setMounted],
      };
    });
    vi.doMock('../store/useTabBoardStore', () => ({ useTabBoardStore }));

    const { useStoreHydration } = await import('./useStoreHydration');
    useStoreHydration();

    await vi.waitFor(() => expect(setMounted).toHaveBeenLastCalledWith(false));
    cleanups.shift()?.();
    expect(releaseHydration).toHaveBeenCalledTimes(1);
  });
});
