// @vitest-environment happy-dom
import {
  StrictMode,
  act,
  createElement,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyState,
  DEFAULT_SETTINGS,
  SETTINGS_PROJECTION_KEY,
} from '../shared/model';
import {
  projectionFromState,
  type SettingsProjection,
} from '../shared/store/settingsProjection';
import { usePopupSettings } from './usePopupSettings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const activeAdapterMock = vi.hoisted(() => ({
  getActiveState: vi.fn(),
}));

vi.mock('../shared/store/activeAdapter', () => activeAdapterMock);

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latest: ReturnType<typeof usePopupSettings> | null = null;
let storageListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void)
  | null = null;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function Probe() {
  latest = usePopupSettings();
  return createElement(
    'output',
    null,
    latest.hydrated
      ? `${latest.settings.theme}:${latest.error ?? 'ok'}`
      : 'loading',
  );
}

async function mountProbe(strict = false): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      strict
        ? createElement(StrictMode, null, createElement(Probe))
        : createElement(Probe),
    );
  });
}

function stubChrome({
  get,
  set = vi.fn(async () => undefined),
  events,
}: {
  get: (key: string) => Promise<Record<string, unknown>>;
  set?: (value: Record<string, unknown>) => Promise<void>;
  events?: string[];
}) {
  const addListener = vi.fn((
    listener: (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void,
  ) => {
    events?.push('subscribe');
    storageListener = listener;
  });
  const removeListener = vi.fn();
  const getSpy = vi.fn(async (key: string) => {
    events?.push('read');
    return get(key);
  });
  const setSpy = vi.fn(set);
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: getSpy, set: setSpy },
      onChanged: { addListener, removeListener },
    },
  });
  return { addListener, get: getSpy, removeListener, set: setSpy };
}

beforeEach(() => {
  latest = null;
  storageListener = null;
  activeAdapterMock.getActiveState.mockReset();
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('usePopupSettings', () => {
  it('hydrates from the settings projection without reading canonical state or waking the worker', async () => {
    const state = createEmptyState();
    state.settings.theme = 'light';
    const chromeMock = stubChrome({
      get: async (key) => ({ [key]: projectionFromState(state) }),
    });

    await mountProbe();
    await vi.waitFor(() => expect(container?.textContent).toBe('light:ok'));

    expect(chromeMock.get).toHaveBeenCalledTimes(1);
    expect(chromeMock.get).toHaveBeenCalledWith(SETTINGS_PROJECTION_KEY);
    expect(activeAdapterMock.getActiveState).not.toHaveBeenCalled();
  });

  it('subscribes before reading and keeps a newer projection published during the read', async () => {
    const events: string[] = [];
    const pendingRead = deferred<Record<string, unknown>>();
    stubChrome({
      events,
      get: () => pendingRead.promise,
    });
    const initial = createEmptyState();
    initial.settings.theme = 'light';
    const remote = {
      ...initial,
      mutationRevision: 5,
      updatedAt: '2026-08-05T00:00:05.000Z',
      settings: { ...initial.settings, theme: 'dark' as const },
    };

    await mountProbe();
    expect(events).toEqual(['subscribe', 'read']);

    await act(async () => {
      storageListener?.({
        [SETTINGS_PROJECTION_KEY]: {
          newValue: projectionFromState(remote),
        },
      }, 'local');
    });
    expect(container?.textContent).toBe('dark:ok');

    await act(async () => {
      pendingRead.resolve({
        [SETTINGS_PROJECTION_KEY]: projectionFromState(initial),
      });
      await pendingRead.promise;
    });

    expect(container?.textContent).toBe('dark:ok');
    expect(latest?.settings.theme).toBe('dark');
  });

  it('shares one in-flight projection read across Strict Mode effect replay', async () => {
    const pendingRead = deferred<Record<string, unknown>>();
    const state = createEmptyState();
    const chromeMock = stubChrome({
      get: () => pendingRead.promise,
    });

    await mountProbe(true);
    expect(chromeMock.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingRead.resolve({
        [SETTINGS_PROJECTION_KEY]: projectionFromState(state),
      });
      await pendingRead.promise;
    });

    await vi.waitFor(() => expect(container?.textContent).toBe('system:ok'));
    expect(chromeMock.get).toHaveBeenCalledTimes(1);
  });

  it('repairs a missing projection from canonical state only on the fallback path', async () => {
    const state = createEmptyState();
    state.settings.theme = 'dark';
    activeAdapterMock.getActiveState.mockResolvedValue(state);
    const chromeMock = stubChrome({
      get: async () => ({}),
    });

    await mountProbe();
    await vi.waitFor(() => expect(container?.textContent).toBe('dark:ok'));

    expect(activeAdapterMock.getActiveState).toHaveBeenCalledTimes(1);
    expect(chromeMock.set).toHaveBeenCalledWith({
      [SETTINGS_PROJECTION_KEY]: projectionFromState(state),
    });
  });

  it('settles with default settings and an error when projection repair fails', async () => {
    activeAdapterMock.getActiveState.mockRejectedValue(
      new Error('storage unavailable'),
    );
    const chromeMock = stubChrome({
      get: async () => ({}),
    });

    await mountProbe();
    await vi.waitFor(() => {
      expect(container?.textContent).toBe('system:storage unavailable');
    });

    expect(latest?.hydrated).toBe(true);
    expect(latest?.settings).toEqual(DEFAULT_SETTINGS);
    expect(chromeMock.set).not.toHaveBeenCalled();
  });

  it('removes its subscription and ignores late completion after unmount', async () => {
    const pendingRead = deferred<Record<string, unknown>>();
    const state = createEmptyState();
    const chromeMock = stubChrome({
      get: () => pendingRead.promise,
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await mountProbe();
    expect(latest?.hydrated).toBe(false);

    await act(async () => root?.unmount());
    root = null;
    await act(async () => {
      pendingRead.resolve({
        [SETTINGS_PROJECTION_KEY]: projectionFromState(state),
      });
      await pendingRead.promise;
      storageListener?.({
        [SETTINGS_PROJECTION_KEY]: {
          newValue: {
            ...projectionFromState(state),
            settings: { ...state.settings, theme: 'dark' },
          } satisfies SettingsProjection,
        },
      }, 'local');
    });

    expect(chromeMock.removeListener).toHaveBeenCalledTimes(1);
    expect(latest?.hydrated).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
