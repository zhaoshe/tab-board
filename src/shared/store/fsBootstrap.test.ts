import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOTSTRAP_KEY } from '../model';
import {
  readBootstrapMode,
  readStorageStatusProjection,
  subscribeStorageStatusProjection,
  writeStorageStatusProjection,
} from './fsBootstrap';
import type { StorageStatusProjection } from './settingsProjection';

afterEach(() => {
  vi.unstubAllGlobals();
});

function status(
  overrides: Partial<StorageStatusProjection> = {},
): StorageStatusProjection {
  return {
    configuredTarget: 'browser',
    activeBackend: 'browser',
    folderName: null,
    fallbackReason: null,
    fileUpdatedAt: null,
    ...overrides,
  };
}

describe('storage bootstrap status', () => {
  it('reads a legacy mode as the configured bootstrap target', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ [BOOTSTRAP_KEY]: { mode: 'file' } })),
        },
      },
    });

    await expect(readBootstrapMode()).resolves.toBe('file');
    await expect(readStorageStatusProjection()).resolves.toEqual(status({
      configuredTarget: 'file',
      activeBackend: 'file',
    }));
  });

  it('writes and reads the complete storage status atomically', async () => {
    const current = status({
      configuredTarget: 'file',
      activeBackend: 'browser',
      folderName: 'TabBoard',
      fallbackReason: 'Folder missing',
      fileUpdatedAt: '2026-07-31T09:10:11.000Z',
    });
    const set = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ [BOOTSTRAP_KEY]: current })),
          set,
        },
      },
    });

    await expect(readStorageStatusProjection()).resolves.toEqual(current);
    await writeStorageStatusProjection(current);
    expect(set).toHaveBeenCalledWith({ [BOOTSTRAP_KEY]: current });
  });

  it('subscribes only to valid local status changes', () => {
    let listener: (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void = () => undefined;
    const callback = vi.fn();
    vi.stubGlobal('chrome', {
      storage: {
        onChanged: {
          addListener: vi.fn((value) => { listener = value; }),
          removeListener: vi.fn(),
        },
      },
    });

    const unsubscribe = subscribeStorageStatusProjection(callback);
    listener({ [BOOTSTRAP_KEY]: { newValue: { configuredTarget: 'file' } } }, 'local');
    listener({ [BOOTSTRAP_KEY]: { newValue: status() } }, 'sync');
    listener({
      [BOOTSTRAP_KEY]: {
        newValue: status({
          configuredTarget: 'file',
          activeBackend: 'file',
          folderName: 'TabBoard',
        }),
      },
    }, 'local');

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(status({
      configuredTarget: 'file',
      activeBackend: 'file',
      folderName: 'TabBoard',
    }));
    unsubscribe();
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(listener);
  });
});
