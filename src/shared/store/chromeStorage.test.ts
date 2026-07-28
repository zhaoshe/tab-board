import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SETTINGS_PROJECTION_KEY,
  STATE_KEY,
} from '../model/constants';
import { createEmptyState } from '../model';
import { resetActiveAdapterForTests } from './activeAdapter';
import { ensureStateForHydration } from './chromeStorage';
import { projectionFromState } from './settingsProjection';

afterEach(() => {
  resetActiveAdapterForTests();
  vi.unstubAllGlobals();
});

function storageChangedMock() {
  return {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };
}

describe('ensureStateForHydration (worker-decoupled read)', () => {
  it('uses the service worker response when it is reachable', async () => {
    const workerState = { ...createEmptyState(), activeWorkspaceId: 'workspace_default' };
    const sendMessage = vi.fn(async () => ({ ok: true, result: workerState }));
    const get = vi.fn(async () => ({}));
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: { local: { get, set: vi.fn() }, onChanged: storageChangedMock() },
    });

    const result = await ensureStateForHydration();

    expect(sendMessage).toHaveBeenCalledWith({ type: 'tabboard-ensure-state' });
    expect(result.activeWorkspaceId).toBe('workspace_default');
    // Worker succeeded, so we did not need to read storage directly.
    expect(get).not.toHaveBeenCalled();
  });

  it('falls back to local storage when the worker rejects (asleep / torn-down port)', async () => {
    const stored = { ...createEmptyState(), version: 1 };
    const sendMessage = vi.fn(async () => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    });
    const get = vi.fn(async (key: string) => ({ [key]: stored }));
    const set = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: { local: { get, set }, onChanged: storageChangedMock() },
    });

    const result = await ensureStateForHydration();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    // The page hydrated straight from chrome.storage.local instead of failing.
    expect(get).toHaveBeenCalledWith(STATE_KEY);
    expect(result.version).toBe(1);
    // Storage already had state, so no default seeding write was needed.
    expect(set).not.toHaveBeenCalled();
  });

  it('falls back and seeds default state when the worker fails and storage is empty', async () => {
    const sendMessage = vi.fn(async () => ({ ok: false, error: 'The message port closed before a response was received.' }));
    const get = vi.fn(async () => ({}));
    const set = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: { local: { get, set }, onChanged: storageChangedMock() },
    });

    const result = await ensureStateForHydration();

    expect(result.workspaces.length).toBeGreaterThan(0);
    // First-install seeding still happens locally so the write path has a base.
    expect(set).toHaveBeenCalledWith({
      [STATE_KEY]: result,
      [SETTINGS_PROJECTION_KEY]: projectionFromState(result),
    });
  });
});
