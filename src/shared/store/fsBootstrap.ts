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
import type { StorageMode } from './storageAdapter';

interface BootstrapConfig {
  mode: StorageMode;
}

function isValidMode(v: unknown): v is StorageMode {
  return v === 'browser' || v === 'file';
}

export async function readBootstrapMode(): Promise<StorageMode> {
  const result = await chrome.storage.local.get(BOOTSTRAP_KEY);
  const config = result[BOOTSTRAP_KEY] as BootstrapConfig | undefined;
  if (config && isValidMode(config.mode)) {
    return config.mode;
  }
  return 'browser';
}

export async function writeBootstrapMode(mode: StorageMode): Promise<void> {
  await chrome.storage.local.set({ [BOOTSTRAP_KEY]: { mode } satisfies BootstrapConfig });
}
