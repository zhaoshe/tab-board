import { BOOTSTRAP_KEY, SETTINGS_PROJECTION_KEY, STATE_KEY } from '../model/constants';
import { normalizeState, type TabBoardState } from '../model';
import type { StorageAdapter, StateWriteOptions } from './storageAdapter';
import { RESTORE_METADATA_KEY, newOrigin, readRestoreMetadata, sameOrigin, restoreError, type OriginScope, type BoundSnapshot, type RestoreMetadata } from './restoreCommit';
import { parseStorageStatusProjection, BROWSER_STORAGE_STATUS, projectionFromState } from './settingsProjection';

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

  async getBoundState(expectedOrigin?: OriginScope, initializeLegacy = true): Promise<BoundSnapshot> {
    const result = await chrome.storage.local.get([STATE_KEY, RESTORE_METADATA_KEY, BOOTSTRAP_KEY]);
    let metadata = readRestoreMetadata(result[RESTORE_METADATA_KEY], 'browser');
    if (expectedOrigin && !sameOrigin(expectedOrigin, metadata?.origin)) throw restoreError('RESTORE_ORIGIN_CHANGED', 'Browser storage origin does not match its binding.');
    if (!metadata) {
      if (!initializeLegacy) throw restoreError('RESTORE_ORIGIN_UNAVAILABLE', 'Browser storage has no registered restore origin.');
      metadata = { origin: newOrigin('browser'), receipts: [] };
      const status = parseStorageStatusProjection(result[BOOTSTRAP_KEY]) ?? BROWSER_STORAGE_STATUS;
      await chrome.storage.local.set({ [RESTORE_METADATA_KEY]: metadata, [BOOTSTRAP_KEY]: { ...status, activeOrigin: metadata.origin } });
    }
    return { state: normalizeState(result[STATE_KEY]), metadata };
  }

  async setRestoreMetadata(metadata: RestoreMetadata | undefined): Promise<void> {
    await chrome.storage.local.set({ [RESTORE_METADATA_KEY]: metadata });
  }

  async setState(state: TabBoardState, options?: StateWriteOptions): Promise<void> {
    await chrome.storage.local.set({
      ...(options?.backupBeforeRestore ? { tabboardBackupBeforeRestore: normalizeState(options.backupBeforeRestore) } : {}),
      ...(options?.restoreMetadata ? { [RESTORE_METADATA_KEY]: options.restoreMetadata } : {}),
      [STATE_KEY]: normalizeState(state),
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
