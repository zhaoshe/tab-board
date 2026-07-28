import { SETTINGS_PROJECTION_KEY, STATE_KEY } from '../model/constants';
import { normalizeState, type TabBoardState } from '../model';
import type { StorageAdapter } from './storageAdapter';
import { projectionFromState } from './settingsProjection';

/**
 * ChromeStorageAdapter implements StorageAdapter against chrome.storage.local.
 *
 * It is the default storage backend for the extension. All reads/writes go
 * through chrome.storage.local with the STATE_KEY, and state is normalized
 * on every read to protect against stale or malformed persisted data.
 */
class ChromeStorageAdapterImpl implements StorageAdapter {
  async getState(): Promise<TabBoardState> {
    const result = await chrome.storage.local.get(STATE_KEY);
    return normalizeState(result[STATE_KEY]);
  }

  async setState(state: TabBoardState): Promise<void> {
    await chrome.storage.local.set({
      [STATE_KEY]: state,
      [SETTINGS_PROJECTION_KEY]: projectionFromState(state),
    });
  }

  async ensureState(): Promise<TabBoardState> {
    const result = await chrome.storage.local.get(STATE_KEY);
    if (result[STATE_KEY]) {
      return normalizeState(result[STATE_KEY]);
    }

    const state = normalizeState(null);
    await this.setState(state);
    return state;
  }

  subscribeState(callback: (state: TabBoardState) => void): () => void {
    const onChanged = chrome.storage.onChanged;
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local' || !changes[STATE_KEY]) {
        return;
      }
      callback(normalizeState(changes[STATE_KEY].newValue));
    };
    onChanged.addListener(listener);
    return () => onChanged.removeListener(listener);
  }
}

export function createChromeStorageAdapter(): StorageAdapter {
  return new ChromeStorageAdapterImpl();
}
