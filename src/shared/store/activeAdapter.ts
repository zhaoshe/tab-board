/**
 * Active adapter factory.
 *
 * Selects between ChromeStorageAdapter and FileStorageAdapter based on the
 * bootstrap config stored in chrome.storage.local (BOOTSTRAP_KEY). Provides
 * automatic fallback to chrome storage when file mode fails, plus cross-context
 * ping synchronization so that multiple extension contexts (manager, popup,
 * options, service worker) see a consistent file-backed state.
 *
 * The active adapter is a module-level singleton. All concurrent calls to
 * getActiveAdapter() share a single initialization promise so we never create
 * two file adapters (which could race on disk writes).
 */

import type { TabBoardState } from '../model';
import { STATE_KEY } from '../model/constants';
import { logBreadcrumb, logWarning } from '../utils/diagnostics';
import { createChromeStorageAdapter } from './chromeStorageAdapter';
import { createFileStorageAdapter } from './fileStorage';
import {
  clearRootHandle,
  loadRootHandle,
  saveRootHandle,
  type IdbFactory,
} from './fsDirectory';
import { readBootstrapMode, writeBootstrapMode } from './fsBootstrap';
import type { StorageAdapter } from './storageAdapter';
import { subscribePing } from './chromeStorage';

// ---------- test injection seam ----------

let testIdbFactory: IdbFactory | undefined;

/**
 * Test-only: override the IndexedDB factory used to persist the root handle.
 * Pass `undefined` to restore the default (real indexedDB). Exported with a
 * name clearly marked for tests so production code does not reach for it.
 */
export function _setActiveAdapterIdbFactory(factory: IdbFactory | undefined): void {
  testIdbFactory = factory;
}

// ---------- module state ----------

let cachedAdapter: StorageAdapter | null = null;
let initPromise: Promise<StorageAdapter> | null = null;
let lastSeenRevision = -1;
let pingUnsubscribe: (() => void) | null = null;

const fallbackListeners = new Set<(reason: string) => void>();

function emitFallback(reason: string): void {
  logWarning('file-storage: fallback', reason);
  for (const cb of Array.from(fallbackListeners)) {
    try {
      cb(reason);
    } catch {
      // subscriber errors must not break other subscribers
    }
  }
}

function cleanupPingSubscription(): void {
  if (pingUnsubscribe) {
    try {
      pingUnsubscribe();
    } catch {
      // ignore
    }
    pingUnsubscribe = null;
  }
}

/**
 * Internal type for the file adapter, which exposes reloadFromDisk() for
 * cross-context ping refresh.
 */
interface FileStorageAdapterInternal extends StorageAdapter {
  reloadFromDisk(): Promise<void>;
}

function isFileAdapter(a: StorageAdapter): a is FileStorageAdapterInternal {
  return typeof (a as FileStorageAdapterInternal).reloadFromDisk === 'function';
}

function setupPingSubscription(adapter: FileStorageAdapterInternal): void {
  cleanupPingSubscription();
  pingUnsubscribe = subscribePing((ping) => {
    if (ping.mutationRevision > lastSeenRevision) {
      lastSeenRevision = ping.mutationRevision;
      // Fire-and-forget: reload from disk notifies same-context subscribers.
      adapter.reloadFromDisk().catch((err) => {
        logWarning('activeAdapter', 'Failed to reload file state from ping', err);
      });
    }
  });
}

async function initAdapter(): Promise<StorageAdapter> {
  const mode = await readBootstrapMode();
  if (mode === 'browser') {
    cachedAdapter = createChromeStorageAdapter();
    lastSeenRevision = -1;
    logBreadcrumb('file-storage: init', 'browser storage active');
    return cachedAdapter;
  }

  // mode === 'file'
  let root: FileSystemDirectoryHandle | null = null;
  try {
    root = await loadRootHandle(testIdbFactory);
  } catch (err) {
    logWarning('activeAdapter', 'Failed to load root handle from IndexedDB, falling back to browser storage', err);
    emitFallback(`IndexedDB unavailable: ${(err as Error).message}`);
    cachedAdapter = createChromeStorageAdapter();
    lastSeenRevision = -1;
    return cachedAdapter;
  }

  if (!root) {
    logWarning('activeAdapter', 'No root directory handle found in IndexedDB for file mode; falling back to browser storage');
    emitFallback('No saved folder handle. Select a folder in Options to use file storage.');
    cachedAdapter = createChromeStorageAdapter();
    lastSeenRevision = -1;
    return cachedAdapter;
  }

  try {
    const adapter = await createFileStorageAdapter(root) as FileStorageAdapterInternal;
    cachedAdapter = adapter;
    // Initialize lastSeenRevision from the adapter's current state revision
    // so an initial ping at the same revision does not double-notify.
    try {
      const currentState = await adapter.getState();
      lastSeenRevision = currentState.mutationRevision;
    } catch {
      lastSeenRevision = -1;
    }
    setupPingSubscription(adapter);
    logBreadcrumb('file-storage: init', `file adapter active, revision=${lastSeenRevision}`);
    return cachedAdapter;
  } catch (err) {
    logWarning('activeAdapter', 'File adapter initialization failed; falling back to browser storage', err);
    const code = (err as { code?: string })?.code;
    const reason = code === 'PERMISSION_DENIED'
      ? 'Permission to access the storage folder was denied. Please re-select the folder in Options.'
      : code === 'FILE_CORRUPT'
        ? 'The storage folder appears corrupted. Please re-select the folder in Options.'
        : `File storage error: ${(err as Error).message}`;
    emitFallback(reason);
    cachedAdapter = createChromeStorageAdapter();
    lastSeenRevision = -1;
    return cachedAdapter;
  }
}

// ---------- public API ----------

/**
 * Return the active StorageAdapter singleton. The first call reads the
 * bootstrap config and initializes the appropriate adapter. Subsequent calls
 * return the same adapter.
 */
export async function getActiveAdapter(): Promise<StorageAdapter> {
  if (cachedAdapter) {
    return cachedAdapter;
  }
  if (initPromise) {
    return initPromise;
  }
  initPromise = initAdapter().finally(() => {
    initPromise = null;
  });
  return initPromise;
}

/**
 * Test-only: reset the singleton adapter and all internal state. Call between
 * tests so a previously-initialized adapter does not leak into the next test.
 */
export function resetActiveAdapterForTests(): void {
  resetActiveAdapter();
}

/**
 * Reset the singleton adapter in production contexts (e.g. after the Options
 * page notifies the service worker that storage mode has switched). The next
 * call to getActiveAdapter() re-reads the bootstrap config and builds a fresh
 * adapter. Safe to call even if no adapter has been initialized yet.
 */
export function resetActiveAdapter(): void {
  cleanupPingSubscription();
  cachedAdapter = null;
  initPromise = null;
  lastSeenRevision = -1;
  fallbackListeners.clear();
  // Don't reset testIdbFactory here; tests clear it explicitly if needed.
}

/**
 * Convenience: true when the active adapter is the FileStorageAdapter.
 */
export async function isFileModeActive(): Promise<boolean> {
  const adapter = await getActiveAdapter();
  return isFileAdapter(adapter);
}

/**
 * Subscribe to fallback events. Fires when file mode fails (no handle,
 * permission denied, corrupt) and the adapter drops back to browser storage.
 * The callback receives a human-readable reason string suitable for display
 * in a toast/notification. Returns an unsubscribe function.
 */
export function onFallback(callback: (reason: string) => void): () => void {
  fallbackListeners.add(callback);
  return () => {
    fallbackListeners.delete(callback);
  };
}

/**
 * Switch to file storage mode. Called from the Options page after the user
 * picks a folder and any migration is complete. Saves the root handle, writes
 * bootstrap='file', resets the singleton, seeds the file adapter with the
 * provided initial state, and leaves the file adapter active.
 */
export async function switchToFileMode(
  root: FileSystemDirectoryHandle,
  initialState: TabBoardState,
): Promise<void> {
  logBreadcrumb('file-storage: migration', `switching to file mode, revision=${initialState.mutationRevision}`);
  await saveRootHandle(root, testIdbFactory);
  await writeBootstrapMode('file');
  // Tear down current adapter/ping before rebuilding.
  cleanupPingSubscription();
  cachedAdapter = null;
  initPromise = null;
  lastSeenRevision = -1;
  const adapter = await getActiveAdapter() as FileStorageAdapterInternal;
  await adapter.setState(initialState);
  lastSeenRevision = initialState.mutationRevision;
}

/**
 * Switch back to browser storage mode. If copyFileData is true and a file
 * adapter is currently active, copies the on-disk state into chrome.storage
 * before switching so no data is lost. Clears the IndexedDB root handle and
 * resets the singleton so the next getActiveAdapter() returns a fresh
 * ChromeStorageAdapter.
 */
export async function switchToBrowserMode(copyFileData: boolean): Promise<void> {
  logBreadcrumb('file-storage: migration', `switching to browser mode, copyFileData=${copyFileData}`);
  let fileStateToCopy: TabBoardState | null = null;
  if (copyFileData && cachedAdapter && isFileAdapter(cachedAdapter)) {
    try {
      fileStateToCopy = await cachedAdapter.getState();
    } catch (err) {
      logWarning('activeAdapter', 'Failed to read file state while switching to browser mode', err);
    }
  }

  cleanupPingSubscription();
  cachedAdapter = null;
  initPromise = null;
  lastSeenRevision = -1;

  try {
    await clearRootHandle(testIdbFactory);
  } catch (err) {
    logWarning('activeAdapter', 'Failed to clear root handle during switch to browser mode', err);
  }
  await writeBootstrapMode('browser');

  // Get a fresh chrome adapter and, if requested, write the copied state.
  const chromeAdapter = createChromeStorageAdapter();
  if (fileStateToCopy) {
    await chromeAdapter.setState(fileStateToCopy);
  }
  // The chrome adapter is the new active singleton.
  cachedAdapter = chromeAdapter;
}

/**
 * Reconnect to a file-storage folder after a fallback (e.g. permission was
 * re-granted or the user re-selected the folder). Saves the root handle,
 * writes bootstrap='file', and tears down the current singleton so the next
 * getActiveAdapter() call rebuilds a fresh FileStorageAdapter from the folder.
 * Does NOT seed initial state (the folder is expected to already contain data).
 */
export async function reconnectFolder(root: FileSystemDirectoryHandle): Promise<void> {
  logBreadcrumb('file-storage: reconnect', 'reconnecting to file folder');
  await saveRootHandle(root, testIdbFactory);
  await writeBootstrapMode('file');
  cleanupPingSubscription();
  cachedAdapter = null;
  initPromise = null;
  lastSeenRevision = -1;
  // The next getActiveAdapter() call will re-read from disk; we don't
  // pre-build the adapter here so callers control timing.
}
