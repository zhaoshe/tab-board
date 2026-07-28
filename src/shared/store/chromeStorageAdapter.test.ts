import { afterEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_PROJECTION_KEY, STATE_KEY } from '../model/constants';
import { createEmptyState } from '../model';
import { createChromeStorageAdapter } from './chromeStorageAdapter';
import { projectionFromState } from './settingsProjection';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createChromeStorageAdapter', () => {
  function createAdapterWithMocks() {
    const store: Record<string, unknown> = {};
    const listeners: Array<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void> = [];
    const get = vi.fn(async (key: string) => {
      if (key in store && store[key] !== undefined) {
        return { [key]: store[key] };
      }
      return {};
    });
    const set = vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    });
    const addListener = vi.fn((listener) => { listeners.push(listener); });
    const removeListener = vi.fn((listener) => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    });
    vi.stubGlobal('chrome', {
      storage: {
        local: { get, set },
        onChanged: { addListener, removeListener },
      },
    });
    const adapter = createChromeStorageAdapter();
    return { adapter, store, get, set, listeners, addListener, removeListener };
  }

  it('returns an object implementing StorageAdapter with all four methods', () => {
    const { adapter } = createAdapterWithMocks();
    expect(adapter).toBeTypeOf('object');
    expect(typeof adapter.getState).toBe('function');
    expect(typeof adapter.setState).toBe('function');
    expect(typeof adapter.ensureState).toBe('function');
    expect(typeof adapter.subscribeState).toBe('function');
  });

  it('getState reads STATE_KEY and normalizes the result', async () => {
    const { adapter, get, store } = createAdapterWithMocks();
    const raw = createEmptyState();
    // mutationRevision is preserved by normalizeState when it is a valid non-negative integer
    raw.mutationRevision = 42;
    store[STATE_KEY] = raw;

    const result = await adapter.getState();

    expect(get).toHaveBeenCalledWith(STATE_KEY);
    expect(result.mutationRevision).toBe(42);
    // normalizeState returns a normalized copy, not the same reference
    expect(result).not.toBe(raw);
  });

  it('getState returns a normalized empty state when storage has nothing', async () => {
    const { adapter } = createAdapterWithMocks();
    // store[STATE_KEY] is undefined
    const result = await adapter.getState();
    expect(result.workspaces.length).toBeGreaterThan(0);
    expect(result.mutationRevision).toBe(0);
  });

  it('setState atomically writes canonical state and its settings projection', async () => {
    const { adapter, set } = createAdapterWithMocks();
    const state = createEmptyState();
    await adapter.setState(state);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({
      [STATE_KEY]: state,
      [SETTINGS_PROJECTION_KEY]: projectionFromState(state),
    });
  });

  describe('ensureState', () => {
    it('returns existing state without seeding when storage already has data', async () => {
      const { adapter, store, get, set } = createAdapterWithMocks();
      const existing = createEmptyState();
      existing.mutationRevision = 99;
      store[STATE_KEY] = existing;

      const result = await adapter.ensureState();

      expect(get).toHaveBeenCalledWith(STATE_KEY);
      expect(result.mutationRevision).toBe(99);
      expect(set).not.toHaveBeenCalled();
    });

    it('seeds default state when storage is empty', async () => {
      const { adapter, get, set } = createAdapterWithMocks();
      // store empty — get returns {}

      const result = await adapter.ensureState();

      expect(get).toHaveBeenCalledWith(STATE_KEY);
      expect(set).toHaveBeenCalledWith({
        [STATE_KEY]: expect.anything(),
        [SETTINGS_PROJECTION_KEY]: expect.anything(),
      });
      expect(result.workspaces.length).toBeGreaterThan(0);
    });
  });

  describe('subscribeState', () => {
    it('registers an onChanged listener and returns an unsubscribe function', () => {
      const { adapter, addListener, removeListener } = createAdapterWithMocks();
      const cb = vi.fn();
      const unsub = adapter.subscribeState(cb);

      expect(addListener).toHaveBeenCalledTimes(1);
      expect(typeof unsub).toBe('function');

      unsub();
      expect(removeListener).toHaveBeenCalledTimes(1);
    });

    it('fires the callback with normalized state when local storage changes for STATE_KEY', () => {
      const { adapter, listeners } = createAdapterWithMocks();
      const cb = vi.fn();
      adapter.subscribeState(cb);

      const newRawState = createEmptyState();
      newRawState.mutationRevision = 77;
      listeners[0](
        { [STATE_KEY]: { newValue: newRawState, oldValue: null } },
        'local',
      );

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0][0].mutationRevision).toBe(77);
    });

    it('ignores changes to other keys and other storage areas', () => {
      const { adapter, listeners } = createAdapterWithMocks();
      const cb = vi.fn();
      adapter.subscribeState(cb);

      // Different key
      listeners[0](
        { otherKey: { newValue: {}, oldValue: null } },
        'local',
      );
      // Different area
      listeners[0](
        { [STATE_KEY]: { newValue: createEmptyState(), oldValue: null } },
        'sync',
      );

      expect(cb).not.toHaveBeenCalled();
    });
  });

  it('multiple adapter instances register independent subscriptions', () => {
    const { addListener, removeListener } = createAdapterWithMocks();
    const adapter1 = createChromeStorageAdapter();
    const adapter2 = createChromeStorageAdapter();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const unsub1 = adapter1.subscribeState(cb1);
    const unsub2 = adapter2.subscribeState(cb2);

    // Two separate listener registrations
    expect(addListener).toHaveBeenCalledTimes(2);

    unsub1();
    expect(removeListener).toHaveBeenCalledTimes(1);

    unsub2();
    expect(removeListener).toHaveBeenCalledTimes(2);
  });
});
