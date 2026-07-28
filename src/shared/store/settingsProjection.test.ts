import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyState, DEFAULT_SETTINGS } from '../model';
import {
  projectionFromState,
  readSettingsProjection,
  subscribeSettingsProjection,
  type SettingsProjection,
} from './settingsProjection';

afterEach(() => {
  vi.unstubAllGlobals();
});

function projection(overrides: Partial<SettingsProjection> = {}): SettingsProjection {
  return {
    settings: { ...DEFAULT_SETTINGS },
    mutationRevision: 7,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('settings projection', () => {
  it('derives an isolated settings snapshot from canonical state', () => {
    const state = createEmptyState();
    state.mutationRevision = 9;
    state.updatedAt = '2026-02-01T00:00:00.000Z';
    state.settings.theme = 'dark';

    const result = projectionFromState(state);

    expect(result).toEqual({
      settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
      mutationRevision: 9,
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
    expect(result.settings).not.toBe(state.settings);
  });

  it('returns a valid projection without reading canonical state', async () => {
    const cached = projection();
    const readCanonicalState = vi.fn();
    const set = vi.fn();
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ tabboardSettingsProjection: cached })),
          set,
        },
      },
    });

    await expect(readSettingsProjection({ readCanonicalState })).resolves.toEqual(cached);
    expect(readCanonicalState).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['partial settings', projection({
      settings: { theme: 'dark' } as SettingsProjection['settings'],
    })],
    ['invalid revision', projection({ mutationRevision: -1 })],
    ['invalid timestamp', projection({ updatedAt: '' })],
  ])('repairs a %s projection from one canonical read', async (_name, cached) => {
    const state = createEmptyState();
    state.mutationRevision = 12;
    state.settings.theme = 'light';
    const readCanonicalState = vi.fn(async () => state);
    const set = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => (
            cached === undefined ? {} : { tabboardSettingsProjection: cached }
          )),
          set,
        },
      },
    });

    const result = await readSettingsProjection({ readCanonicalState });

    expect(readCanonicalState).toHaveBeenCalledTimes(1);
    expect(result).toEqual(projectionFromState(state));
    expect(set).toHaveBeenCalledWith({
      tabboardSettingsProjection: projectionFromState(state),
    });
  });

  it('subscribes only to valid local projection changes', () => {
    let listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
      = () => undefined;
    const callback = vi.fn();
    vi.stubGlobal('chrome', {
      storage: {
        onChanged: {
          addListener: vi.fn((value) => { listener = value; }),
          removeListener: vi.fn(),
        },
      },
    });

    const unsubscribe = subscribeSettingsProjection(callback);
    listener({
      tabboardSettingsProjection: { newValue: { settings: { theme: 'dark' } } },
    }, 'local');
    listener({
      tabboardSettingsProjection: { newValue: projection() },
    }, 'sync');
    listener({
      tabboardSettingsProjection: { newValue: projection({ mutationRevision: 8 }) },
    }, 'local');

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(projection({ mutationRevision: 8 }));
    unsubscribe();
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(listener);
  });
});
