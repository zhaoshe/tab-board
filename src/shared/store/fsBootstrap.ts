/**
 * Bootstrap key management.
 *
 * To decide which storage backend to use before settings are loaded, we keep
 * a tiny { mode } record under BOOTSTRAP_KEY in chrome.storage.local. This
 * solves the chicken-and-egg problem: we need to know whether to read from
 * files or chrome.storage before we can read settings (which themselves live
 * in whichever backend is active).
 */

import { BOOTSTRAP_KEY } from '../model/constants';
import {
  BROWSER_STORAGE_STATUS,
  parseStorageStatusProjection,
  type StorageStatusProjection,
} from './settingsProjection';
import type { StorageMode } from './storageAdapter';

export async function readBootstrapMode(): Promise<StorageMode> {
  return (await readStorageStatusProjection()).activeBackend;
}

export async function readStorageStatusProjection(): Promise<StorageStatusProjection> {
  const result = await chrome.storage.local.get(BOOTSTRAP_KEY);
  return parseStorageStatusProjection(result[BOOTSTRAP_KEY])
    ?? { ...BROWSER_STORAGE_STATUS };
}

export async function writeStorageStatusProjection(
  status: StorageStatusProjection,
): Promise<void> {
  await chrome.storage.local.set({ [BOOTSTRAP_KEY]: status });
}

export async function writeBootstrapMode(mode: StorageMode): Promise<void> {
  await writeStorageStatusProjection(
    mode === 'browser'
      ? { ...BROWSER_STORAGE_STATUS }
      : {
          configuredTarget: 'file',
          activeBackend: 'file',
          folderName: null,
          fallbackReason: null,
          fileUpdatedAt: null,
        },
  );
}

export function subscribeStorageStatusProjection(
  callback: (status: StorageStatusProjection) => void,
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== 'local' || !changes[BOOTSTRAP_KEY]) return;
    const status = parseStorageStatusProjection(changes[BOOTSTRAP_KEY].newValue);
    if (status) callback(status);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
