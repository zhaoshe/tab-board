// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyState, SETTINGS_PROJECTION_KEY } from '../../shared/model';
import { projectionFromState } from '../../shared/store/settingsProjection';
import { useOptionsSettings } from './useOptionsSettings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latest: ReturnType<typeof useOptionsSettings> | null = null;
let storageListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void)
  | null = null;

function Probe() {
  latest = useOptionsSettings();
  return createElement(
    'button',
    {
      type: 'button',
      onClick: () => latest?.updateSettings({ theme: 'dark' }),
    },
    latest.hydrated
      ? `${latest.settings.theme}:${latest.persistenceError || 'ok'}`
      : 'loading',
  );
}

async function mountProbe(): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(Probe));
  });
}

beforeEach(() => {
  latest = null;
  storageListener = null;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('useOptionsSettings', () => {
  it('hydrates from the settings projection without reading canonical state or waking the worker', async () => {
    const state = createEmptyState();
    state.settings.theme = 'light';
    const get = vi.fn(async (key: string) => ({
      [key]: projectionFromState(state),
    }));
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: {
        local: { get, set: vi.fn() },
        onChanged: {
          addListener: vi.fn((listener) => { storageListener = listener; }),
          removeListener: vi.fn(),
        },
      },
    });

    await mountProbe();
    await vi.waitFor(() => expect(container?.textContent).toBe('light:ok'));

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(SETTINGS_PROJECTION_KEY);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('publishes an optimistic change and accepts the authoritative mutation result', async () => {
    const initial = createEmptyState();
    const authoritative = {
      ...initial,
      mutationRevision: 3,
      settings: { ...initial.settings, theme: 'dark' as const },
      updatedAt: '2026-02-01T00:00:00.000Z',
    };
    let resolveMutation!: (value: unknown) => void;
    const sendMessage = vi.fn(() => new Promise((resolve) => {
      resolveMutation = resolve;
    }));
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: {
        local: {
          get: vi.fn(async () => ({
            [SETTINGS_PROJECTION_KEY]: projectionFromState(initial),
          })),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn((listener) => { storageListener = listener; }),
          removeListener: vi.fn(),
        },
      },
    });

    await mountProbe();
    await vi.waitFor(() => expect(container?.textContent).toBe('system:ok'));
    await act(async () => {
      container?.querySelector('button')?.click();
    });

    expect(container?.textContent).toBe('dark:ok');
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'tabboard-state-mutations',
      mutations: [{
        type: 'update-settings',
        updates: { theme: 'dark' },
        updatedAt: expect.any(String),
      }],
    });

    await act(async () => {
      resolveMutation({ ok: true, result: authoritative });
      await Promise.resolve();
    });
    expect(latest?.projection.mutationRevision).toBe(3);
    expect(container?.textContent).toBe('dark:ok');
  });

  it('keeps save status pending until the authoritative mutation commits', async () => {
    const initial = createEmptyState();
    const authoritative = {
      ...initial,
      mutationRevision: 4,
      settings: { ...initial.settings, theme: 'dark' as const },
      updatedAt: '2026-02-02T00:00:00.000Z',
    };
    let resolveMutation!: (value: unknown) => void;
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn(() => new Promise((resolve) => {
          resolveMutation = resolve;
        })),
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            [SETTINGS_PROJECTION_KEY]: projectionFromState(initial),
          })),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn((listener) => { storageListener = listener; }),
          removeListener: vi.fn(),
        },
      },
    });

    await mountProbe();
    await vi.waitFor(() => expect(latest?.saveStatus).toBe('idle'));
    await act(async () => {
      container?.querySelector('button')?.click();
    });

    expect(latest?.settings.theme).toBe('dark');
    expect(latest?.saveStatus).toBe('saving');

    await act(async () => {
      resolveMutation({ ok: true, result: authoritative });
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(latest?.saveStatus).toBe('saved'));
    expect(latest?.projection.mutationRevision).toBe(4);
  });

  it('rolls back an optimistic change when persistence rejects', async () => {
    const initial = createEmptyState();
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: false,
          error: 'storage unavailable',
        })),
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            [SETTINGS_PROJECTION_KEY]: projectionFromState(initial),
          })),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn((listener) => { storageListener = listener; }),
          removeListener: vi.fn(),
        },
      },
    });

    await mountProbe();
    await vi.waitFor(() => expect(container?.textContent).toBe('system:ok'));
    await act(async () => {
      container?.querySelector('button')?.click();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(container?.textContent).toBe('system:storage unavailable');
    });
    expect(latest?.saveStatus).toBe('error');
  });

  it('retries the exact failed settings update through the same queue', async () => {
    const initial = createEmptyState();
    const authoritative = {
      ...initial,
      mutationRevision: 1,
      settings: { ...initial.settings, theme: 'dark' as const },
      updatedAt: '2026-02-03T00:00:00.000Z',
    };
    const sendMessage = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'storage unavailable' })
      .mockResolvedValueOnce({ ok: true, result: authoritative });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: {
        local: {
          get: vi.fn(async () => ({
            [SETTINGS_PROJECTION_KEY]: projectionFromState(initial),
          })),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn((listener) => { storageListener = listener; }),
          removeListener: vi.fn(),
        },
      },
    });

    await mountProbe();
    await vi.waitFor(() => expect(latest?.saveStatus).toBe('idle'));
    await act(async () => {
      container?.querySelector('button')?.click();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(latest?.saveStatus).toBe('error'));

    await act(async () => {
      latest?.retryLastFailedMutation();
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(latest?.saveStatus).toBe('saved'));
    expect(latest?.settings.theme).toBe('dark');
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls.map(([message]) => message.mutations[0].updates))
      .toEqual([{ theme: 'dark' }, { theme: 'dark' }]);
  });

  it('does not retain a stale failed patch after a newer update for the same field commits', async () => {
    const initial = createEmptyState();
    const authoritative = {
      ...initial,
      mutationRevision: 1,
      settings: { ...initial.settings, theme: 'light' as const },
      updatedAt: '2026-02-04T00:00:00.000Z',
    };
    const sendMessage = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'first write failed' })
      .mockResolvedValueOnce({ ok: true, result: authoritative });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: {
        local: {
          get: vi.fn(async () => ({
            [SETTINGS_PROJECTION_KEY]: projectionFromState(initial),
          })),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn((listener) => { storageListener = listener; }),
          removeListener: vi.fn(),
        },
      },
    });

    await mountProbe();
    await vi.waitFor(() => expect(latest?.saveStatus).toBe('idle'));
    await act(async () => {
      latest?.updateSettings({ theme: 'dark' });
      latest?.updateSettings({ theme: 'light' });
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(latest?.saveStatus).toBe('saved'));
    expect(latest?.settings.theme).toBe('light');
    expect(latest?.persistenceError).toBeNull();
  });

  it('accepts a newer cross-context projection publication', async () => {
    const initial = createEmptyState();
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn() },
      storage: {
        local: {
          get: vi.fn(async () => ({
            [SETTINGS_PROJECTION_KEY]: projectionFromState(initial),
          })),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn((listener) => { storageListener = listener; }),
          removeListener: vi.fn(),
        },
      },
    });
    await mountProbe();
    await vi.waitFor(() => expect(storageListener).not.toBeNull());

    const remote = {
      ...initial,
      mutationRevision: 5,
      settings: { ...initial.settings, theme: 'light' as const },
      updatedAt: '2026-03-01T00:00:00.000Z',
    };
    await act(async () => {
      storageListener?.({
        [SETTINGS_PROJECTION_KEY]: {
          newValue: projectionFromState(remote),
        },
      }, 'local');
    });

    expect(container?.textContent).toBe('light:ok');
  });
});
