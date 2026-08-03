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

import {
  createId,
  nowIso,
  type TabBoardState,
} from '../model';
import { logBreadcrumb, logError, logWarning } from '../utils/diagnostics';
import { createChromeStorageAdapter } from './chromeStorageAdapter';
import type { IdbFactory } from './fsDirectory';
import {
  readStorageStatusProjection,
  writeStorageStatusProjection,
} from './fsBootstrap';
import type {
  ReloadableStorageAdapter,
  StorageAdapter,
  StorageMode,
} from './storageAdapter';
import {
  BROWSER_STORAGE_STATUS,
  fileStorageStatus,
  type StorageStatusProjection,
} from './settingsProjection';
import {
  subscribeFilePing,
  subscribeStorageFallback,
  writeFilePing,
  writeStorageFallback,
  type StorageFallbackEvent,
} from './storageEvents';

// ---------- test injection seam ----------

type FileStorageModule = typeof import('./fileStorage');
type FsDirectoryModule = typeof import('./fsDirectory');

interface ActiveAdapterModuleLoaders {
  loadFileStorageModule: () => Promise<FileStorageModule>;
  loadFsDirectoryModule: () => Promise<FsDirectoryModule>;
}

const defaultModuleLoaders: ActiveAdapterModuleLoaders = {
  loadFileStorageModule: () => import('./fileStorage'),
  loadFsDirectoryModule: () => import('./fsDirectory'),
};

let testIdbFactory: IdbFactory | undefined;
let moduleLoaders = defaultModuleLoaders;
let fileStorageModulePromise: Promise<FileStorageModule> | null = null;
let fsDirectoryModulePromise: Promise<FsDirectoryModule> | null = null;

/**
 * Test-only: override the IndexedDB factory used to persist the root handle.
 * Pass `undefined` to restore the default (real indexedDB). Exported with a
 * name clearly marked for tests so production code does not reach for it.
 */
export function _setActiveAdapterIdbFactory(factory: IdbFactory | undefined): void {
  testIdbFactory = factory;
}

/**
 * Test-only: observe or replace conditional file-storage module loading.
 */
export function _setActiveAdapterModuleLoadersForTests(
  loaders: ActiveAdapterModuleLoaders | undefined,
): void {
  moduleLoaders = loaders ?? defaultModuleLoaders;
  fileStorageModulePromise = null;
  fsDirectoryModulePromise = null;
}

export function _setActiveAdapterModuleLoadersForWorker(
  loaders: ActiveAdapterModuleLoaders,
): void {
  _setActiveAdapterModuleLoadersForTests(loaders);
}

function loadFileStorageModule(): Promise<FileStorageModule> {
  fileStorageModulePromise ??= moduleLoaders.loadFileStorageModule();
  return fileStorageModulePromise;
}

function loadFsDirectoryModule(): Promise<FsDirectoryModule> {
  fsDirectoryModulePromise ??= moduleLoaders.loadFsDirectoryModule();
  return fsDirectoryModulePromise;
}

const fallbackListeners = new Set<(reason: string) => void>();
export const WORKER_PRELOAD_FALLBACK_REASON = 'File storage error: document is not defined';
export const WORKER_DYNAMIC_IMPORT_FALLBACK_REASON = 'File storage error: window is not defined';

export function isWorkerModuleFallbackReason(reason: string | null): boolean {
  return reason === WORKER_PRELOAD_FALLBACK_REASON
    || reason === WORKER_DYNAMIC_IMPORT_FALLBACK_REASON;
}

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

function fallbackReason(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === 'PERMISSION_DENIED') {
    return 'Permission to access the storage folder was denied. Please re-select the folder in Options.';
  }
  if (code === 'FILE_CORRUPT') {
    return 'The storage folder appears corrupted. Please re-select the folder in Options.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'The storage folder is unavailable. Please re-select the folder in Options.';
  }
  return `File storage error: ${error instanceof Error ? error.message : String(error)}`;
}

interface AuthorityBackend {
  mode: StorageMode;
  adapter: StorageAdapter;
}

function isReloadableAdapter(adapter: StorageAdapter): adapter is ReloadableStorageAdapter {
  return typeof (adapter as ReloadableStorageAdapter).reloadFromDisk === 'function';
}

class StorageAuthority implements StorageAdapter {
  private backend: AuthorityBackend | null = null;
  private initPromise: Promise<AuthorityBackend> | null = null;
  private backendUnsubscribe: (() => void) | null = null;
  private readonly subscribers = new Set<(state: TabBoardState) => void>();
  private readonly handledFallbackEvents = new Set<string>();
  private lastKnownState: TabBoardState | null = null;
  private lastSeenRevision = -1;
  private operationQueue: Promise<unknown> = Promise.resolve();
  private pingUnsubscribe: (() => void) | null = null;
  private fallbackUnsubscribe: (() => void) | null = null;

  private bindFileEvents(): void {
    this.unbindFileEvents();
    this.pingUnsubscribe = subscribeFilePing((ping) => {
      if (ping.mutationRevision <= this.lastSeenRevision) return;
      void this.enqueueOperation(async () => {
        const backend = await this.ensureBackend();
        if (backend.mode !== 'file' || !isReloadableAdapter(backend.adapter)) return;
        this.lastSeenRevision = ping.mutationRevision;
        try {
          await backend.adapter.reloadFromDisk();
        } catch (error: unknown) {
          await this.degradeToBrowser(error, true);
        }
      });
    });
    this.fallbackUnsubscribe = subscribeStorageFallback((event) => {
      if (this.handledFallbackEvents.has(event.eventId)) return;
      this.handledFallbackEvents.add(event.eventId);
      void this.enqueueOperation(async () => {
        const backend = await this.ensureBackend();
        if (backend.mode !== 'file') return;
        await this.degradeToBrowser(new Error(event.reason), false, event);
      });
    });
  }

  private unbindFileEvents(): void {
    this.pingUnsubscribe?.();
    this.pingUnsubscribe = null;
    this.fallbackUnsubscribe?.();
    this.fallbackUnsubscribe = null;
  }

  private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.operationQueue.then(operation);
    this.operationQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async initializeBackend(): Promise<AuthorityBackend> {
    const storageStatus = await readStorageStatusProjection();
    const mode = storageStatus.activeBackend;
    const shouldRecoverWorkerPreloadFallback = storageStatus.configuredTarget === 'file'
      && mode === 'browser'
      && isWorkerModuleFallbackReason(storageStatus.fallbackReason);
    if (mode === 'browser' && !shouldRecoverWorkerPreloadFallback) {
      const adapter = createChromeStorageAdapter();
      this.installBackend({ mode, adapter });
      logBreadcrumb('file-storage: init', 'browser storage active');
      return { mode, adapter };
    }

    try {
      const { loadRootHandle } = await loadFsDirectoryModule();
      const root = await loadRootHandle(testIdbFactory);
      if (!root) {
        throw Object.assign(
          new Error('No saved folder handle. Select a folder in Options to use file storage.'),
          { code: 'NO_HANDLE' },
        );
      }
      const { createFileStorageAdapter } = await loadFileStorageModule();
      const adapter = await createFileStorageAdapter(root);
      await writeStorageStatusProjection(fileStorageStatus({
        folderName: root.name || storageStatus.folderName,
        fileUpdatedAt: adapter.getFileUpdatedAt() ?? storageStatus.fileUpdatedAt,
      }));
      this.installBackend({ mode: 'file', adapter });
      logBreadcrumb('file-storage: init', 'file adapter active');
      return { mode: 'file', adapter };
    } catch (error: unknown) {
      logWarning('activeAdapter', 'File adapter initialization failed; falling back to browser storage', error);
      const reason = (error as { code?: string })?.code === 'NO_HANDLE'
        ? (error as Error).message
        : fallbackReason(error);
      const adapter = createChromeStorageAdapter();
      this.installBackend({ mode: 'browser', adapter });
      await this.publishFallback(reason, storageStatus);
      return { mode: 'browser', adapter };
    }
  }

  private async ensureBackend(): Promise<AuthorityBackend> {
    if (this.backend) return this.backend;
    if (!this.initPromise) {
      this.initPromise = this.initializeBackend().finally(() => {
        this.initPromise = null;
      });
    }
    return this.initPromise;
  }

  private installBackend(backend: AuthorityBackend, state?: TabBoardState): void {
    this.backendUnsubscribe?.();
    if (backend.mode === 'file') {
      this.bindFileEvents();
    } else {
      this.unbindFileEvents();
    }
    this.backend = backend;
    if (state) {
      this.lastKnownState = state;
      this.lastSeenRevision = state.mutationRevision;
    } else if (backend.mode === 'browser') {
      this.lastSeenRevision = -1;
    }
    this.backendUnsubscribe = backend.adapter.subscribeState((nextState) => {
      this.recordState(nextState);
      this.notifyState(nextState);
    });
  }

  private recordState(state: TabBoardState): void {
    if (this.lastKnownState) {
      if (state.mutationRevision < this.lastKnownState.mutationRevision) return;
      if (state.mutationRevision === this.lastKnownState.mutationRevision
        && Date.parse(state.updatedAt) < Date.parse(this.lastKnownState.updatedAt)) {
        return;
      }
    }
    this.lastKnownState = state;
    this.lastSeenRevision = Math.max(this.lastSeenRevision, state.mutationRevision);
  }

  private notifyState(state: TabBoardState): void {
    for (const callback of Array.from(this.subscribers)) {
      try {
        callback(state);
      } catch {
        // A subscriber must not stop authority publication.
      }
    }
  }

  private async publishFallback(
    reason: string,
    currentStatus?: StorageStatusProjection,
  ): Promise<void> {
    emitFallback(reason);
    const status = currentStatus ?? await readStorageStatusProjection();
    if (status.configuredTarget === 'file') {
      await writeStorageStatusProjection({
        ...status,
        activeBackend: 'browser',
        fallbackReason: reason,
      });
    }
    const event: StorageFallbackEvent = {
      eventId: createId('storage-fallback'),
      reason,
      occurredAt: nowIso(),
    };
    this.handledFallbackEvents.add(event.eventId);
    try {
      await writeStorageFallback(event);
    } catch (error: unknown) {
      logWarning('activeAdapter', 'Failed to publish storage fallback event', error);
    }
  }

  private async degradeToBrowser(
    error: unknown,
    broadcast: boolean,
    remoteEvent?: StorageFallbackEvent,
  ): Promise<void> {
    const current = this.backend;
    if (!current || current.mode !== 'file') return;
    const reason = remoteEvent?.reason || fallbackReason(error);
    logError('file-storage: fallback', reason, error);
    const adapter = createChromeStorageAdapter();
    if (!remoteEvent && this.lastKnownState) {
      try {
        await adapter.setState(this.lastKnownState);
      } catch (chromeError: unknown) {
        logError('activeAdapter', 'Failed to preserve the last file snapshot in browser storage', chromeError);
        throw chromeError;
      }
    }
    const state = await adapter.getState();
    this.installBackend({ mode: 'browser', adapter }, state);
    this.notifyState(state);
    if (broadcast) {
      await this.publishFallback(reason);
    } else {
      const status = await readStorageStatusProjection();
      if (status.configuredTarget === 'file') {
        await writeStorageStatusProjection({
          ...status,
          activeBackend: 'browser',
          fallbackReason: reason,
        });
      }
      emitFallback(reason);
    }
  }

  async getState(): Promise<TabBoardState> {
    await this.operationQueue.catch(() => undefined);
    const backend = await this.ensureBackend();
    try {
      const state = await backend.adapter.getState();
      this.recordState(state);
      return this.lastKnownState || state;
    } catch (error: unknown) {
      if (backend.mode !== 'file') throw error;
      await this.enqueueOperation(() => this.degradeToBrowser(error, true));
      return (await this.ensureBackend()).adapter.getState();
    }
  }

  setState(state: TabBoardState): Promise<void> {
    return this.enqueueOperation(async () => {
      const backend = await this.ensureBackend();
      try {
        await backend.adapter.setState(state);
        this.recordState(state);
      } catch (error: unknown) {
        if (backend.mode === 'file') {
          await this.degradeToBrowser(error, true);
        }
        throw error;
      }
    });
  }

  ensureState(): Promise<TabBoardState> {
    return this.enqueueOperation(async () => {
      const backend = await this.ensureBackend();
      try {
        const state = await backend.adapter.ensureState();
        this.recordState(state);
        return this.lastKnownState || state;
      } catch (error: unknown) {
        if (backend.mode !== 'file') throw error;
        await this.degradeToBrowser(error, true);
        const state = await (await this.ensureBackend()).adapter.ensureState();
        this.recordState(state);
        return this.lastKnownState || state;
      }
    });
  }

  subscribeState(callback: (state: TabBoardState) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  async isFileMode(): Promise<boolean> {
    return (await this.ensureBackend()).mode === 'file';
  }

  async currentBackend(): Promise<AuthorityBackend> {
    return this.ensureBackend();
  }

  async install(mode: StorageMode, adapter: StorageAdapter, state?: TabBoardState): Promise<void> {
    await this.enqueueOperation(async () => {
      this.installBackend({ mode, adapter }, state);
    });
  }

  resetBackend(): void {
    this.backendUnsubscribe?.();
    this.backendUnsubscribe = null;
    this.unbindFileEvents();
    this.backend = null;
    this.initPromise = null;
    this.lastKnownState = null;
    this.lastSeenRevision = -1;
  }

  dispose(): void {
    this.resetBackend();
    this.subscribers.clear();
    this.handledFallbackEvents.clear();
  }
}

let authority: StorageAuthority | null = null;
let authorityContext: unknown;

function getAuthority(): StorageAuthority {
  const context = globalThis.chrome;
  if (authority && authorityContext !== context) {
    authority.dispose();
    authority = null;
  }
  if (!authority) {
    authority = new StorageAuthority();
    authorityContext = context;
  }
  return authority;
}

async function commitFileHandleAndBootstrap(
  root: FileSystemDirectoryHandle,
  fileUpdatedAt: string | null,
): Promise<void> {
  const {
    clearRootHandle,
    loadRootHandle,
    saveRootHandle,
  } = await loadFsDirectoryModule();
  const previousRoot = await loadRootHandle(testIdbFactory);
  await saveRootHandle(root, testIdbFactory);
  try {
    await writeStorageStatusProjection(fileStorageStatus({
      folderName: root.name || null,
      fileUpdatedAt,
    }));
  } catch (error: unknown) {
    if (previousRoot) {
      await saveRootHandle(previousRoot, testIdbFactory);
    } else {
      await clearRootHandle(testIdbFactory);
    }
    throw error;
  }
}

// ---------- public API ----------

/**
 * Return the active StorageAdapter singleton. The first call reads the
 * bootstrap config and initializes the appropriate adapter. Subsequent calls
 * return the same adapter.
 */
export async function getActiveAdapter(): Promise<StorageAdapter> {
  const activeAuthority = getAuthority();
  await activeAuthority.currentBackend();
  return activeAuthority;
}

export async function getActiveState(): Promise<TabBoardState> {
  return getAuthority().getState();
}

export async function setActiveState(state: TabBoardState): Promise<void> {
  return getAuthority().setState(state);
}

export async function ensureActiveState(): Promise<TabBoardState> {
  return getAuthority().ensureState();
}

export function subscribeActiveState(
  callback: (state: TabBoardState) => void,
): () => void {
  return getAuthority().subscribeState(callback);
}

/**
 * Test-only: reset the singleton adapter and all internal state. Call between
 * tests so a previously-initialized adapter does not leak into the next test.
 */
export function resetActiveAdapterForTests(): void {
  authority?.dispose();
  authority = null;
  authorityContext = undefined;
  fallbackListeners.clear();
}

/**
 * Reset the singleton adapter in production contexts (e.g. after the Options
 * page notifies the service worker that storage mode has switched). The next
 * call to getActiveAdapter() re-reads the bootstrap config and builds a fresh
 * adapter. Safe to call even if no adapter has been initialized yet.
 */
export function resetActiveAdapter(): void {
  authority?.resetBackend();
}

/**
 * Convenience: true when the active adapter is the FileStorageAdapter.
 */
export async function isFileModeActive(): Promise<boolean> {
  return getAuthority().isFileMode();
}

export function getStorageStatus(): Promise<StorageStatusProjection> {
  return readStorageStatusProjection();
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
  const { createFileStorageAdapter } = await loadFileStorageModule();
  let committed = false;
  const adapter = await createFileStorageAdapter(root, {
    shouldPublishPing: () => committed,
  });
  await adapter.setState(initialState);
  await commitFileHandleAndBootstrap(root, initialState.updatedAt);
  committed = true;
  await getAuthority().install('file', adapter, initialState);
  await writeFilePing(initialState.mutationRevision, initialState.updatedAt);
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
  const activeAuthority = getAuthority();
  const current = await activeAuthority.currentBackend();
  let fileStateToCopy: TabBoardState | null = null;
  if (copyFileData && current.mode === 'file') {
    try {
      fileStateToCopy = await current.adapter.getState();
    } catch (err) {
      logWarning('activeAdapter', 'Failed to read file state while switching to browser mode', err);
    }
  }

  const chromeAdapter = createChromeStorageAdapter();
  if (fileStateToCopy) {
    await chromeAdapter.setState(fileStateToCopy);
  }
  const state = await chromeAdapter.getState();
  await writeStorageStatusProjection({ ...BROWSER_STORAGE_STATUS });
  try {
    const { clearRootHandle } = await loadFsDirectoryModule();
    await clearRootHandle(testIdbFactory);
  } catch (err) {
    logWarning('activeAdapter', 'Failed to clear root handle during switch to browser mode', err);
  }
  await activeAuthority.install('browser', chromeAdapter, state);
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
  const { createFileStorageAdapter } = await loadFileStorageModule();
  const adapter = await createFileStorageAdapter(root);
  const state = await adapter.getState();
  await commitFileHandleAndBootstrap(root, adapter.getFileUpdatedAt());
  await getAuthority().install('file', adapter, state);
}
