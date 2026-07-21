import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function setupMocks(
  hydrate: () => Promise<void>,
  releaseHydration: () => void,
) {
  const cleanups: Array<() => void> = [];
  const setMounted = vi.fn();
  const refCells: { current: unknown }[] = [];
  let refIndex = 0;

  const mockUseTabBoardStore = Object.assign(
    vi.fn((selector: (state: {
      hydrate: typeof hydrate;
      hydrated: boolean;
      releaseHydration: typeof releaseHydration;
    }) => unknown) => selector({ hydrate, hydrated: false, releaseHydration })),
    {
      getState: () => ({ hydrate, releaseHydration }),
    },
  );

  vi.doMock('react', async () => {
    const actual = await vi.importActual<typeof import('react')>('react');
    return {
      ...actual,
      useEffect: (effect: () => void | (() => void)) => {
        const cleanup = effect();
        if (cleanup) cleanups.push(cleanup);
      },
      useState: (initial: boolean) => [initial, setMounted],
      useRef: (initial: unknown) => {
        const cell = refCells[refIndex++];
        if (cell) return cell;
        const newCell = { current: initial };
        refCells.push(newCell);
        return newCell;
      },
    };
  });
  vi.doMock('../store/useTabBoardStore', () => ({
    useTabBoardStore: mockUseTabBoardStore,
  }));

  return { cleanups, setMounted, mockUseTabBoardStore };
}

describe('useStoreHydration lifecycle', () => {
  it('pairs remount setup and cleanup with the store lifecycle action', async () => {
    const hydrate = vi.fn(async () => undefined);
    const releaseHydration = vi.fn();
    const { cleanups, setMounted } = setupMocks(hydrate, releaseHydration);

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
    const hydrate = vi.fn(async () => {
      throw new Error('worker unavailable');
    });
    const releaseHydration = vi.fn();
    const { cleanups, setMounted } = setupMocks(hydrate, releaseHydration);

    const { useStoreHydration } = await import('./useStoreHydration');
    useStoreHydration();

    await vi.waitFor(() => expect(setMounted).toHaveBeenLastCalledWith(false));
    cleanups.shift()?.();
    expect(releaseHydration).toHaveBeenCalledTimes(1);
  });
});
