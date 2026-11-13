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
  normalizeState,
  nowIso,
  type TabBoardState,
} from '../model';
import {
  BOOTSTRAP_KEY,
  FILE_PING_KEY,
  SETTINGS_PROJECTION_KEY,
  STATE_KEY,
} from '../model/constants';
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
  StateWriteOptions,
} from './storageAdapter';
import {
  BROWSER_STORAGE_STATUS,
  fileStorageStatus,
  projectionFromState,
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

export type ReconnectChoice = 'browser' | 'file';

export class ReconnectDataConflict extends Error {
  readonly code = 'RECONNECT_DATA_CONFLICT';
  constructor(readonly browserState: TabBoardState, readonly fileState: TabBoardState) {
    super('Browser and folder copies differ. Choose the data to reconnect with.');
    this.name = 'ReconnectDataConflict';
  }
}

function reconnectDataMatches(browser: TabBoardState, file: TabBoardState): boolean {
  const data = (state: TabBoardState) => JSON.stringify(state, (key, value) =>
    ['createdAt', 'updatedAt', 'mutationRevision', 'storageMode', 'storageFolderName'].includes(key)
      ? undefined : value);
  return data(browser) === data(file);
}
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
  private lifecycle = 0;
  private initPromise: Promise<AuthorityBackend> | null = null;
  private backendUnsubscribe: (() => void) | null = null;
  private readonly subscribers = new Set<(state: TabBoardState) => void>();
  private readonly handledFallbackEvents = new Set<string>();
  private lastKnownState: TabBoardState | null = null;
  private lastSeenRevision = -1;
  private operationQueue: Promise<unknown> = Promise.resolve();
  private pingUnsubscribe: (() => void) | null = null;
  private fallbackUnsubscribe: (() => void) | null = null;

  private bindFileEvents(binding: AuthorityBackend): void {
    this.unbindFileEvents();
    this.pingUnsubscribe = subscribeFilePing((ping) => {
      if (this.backend !== binding || ping.mutationRevision <= this.lastSeenRevision) return;
      void this.enqueueOperation(async () => {
        const backend = this.backend;
        if (backend !== binding || !isReloadableAdapter(backend.adapter)) return;
        this.lastSeenRevision = ping.mutationRevision;
        try {
          await backend.adapter.reloadFromDisk();
        } catch (error: unknown) {
          if (this.backend === backend) await this.degradeToBrowser(error, true);
        }
      }).catch(error => logWarning('activeAdapter', 'Automatic file reload failed', error));
    });
    this.fallbackUnsubscribe = subscribeStorageFallback((event) => {
      if (this.backend !== binding || this.handledFallbackEvents.has(event.eventId)) return;
      this.handledFallbackEvents.add(event.eventId);
      void this.enqueueOperation(async () => {
        if (this.backend !== binding) return;
        await this.degradeToBrowser(new Error(event.reason), false, event);
      }).catch(error => logWarning('activeAdapter', 'Remote file fallback failed', error));
    });
  }

  private unbindFileEvents(): void {
    this.pingUnsubscribe?.();
    this.pingUnsubscribe = null;
    this.fallbackUnsubscribe?.();
    this.fallbackUnsubscribe = null;
  }

  private assertLifecycle(lifecycle: number): void {
    if (lifecycle !== this.lifecycle) throw new Error('Storage authority was reset during the operation.');
  }

  private assertBackend(backend: AuthorityBackend): void {
    if (this.backend !== backend) throw new Error('Storage authority was reset during the operation.');
  }

  private enqueueOperation<T>(operation: () => Promise<T>, lifecycle = this.lifecycle): Promise<T> {
    const run = this.operationQueue.then(async () => {
      this.assertLifecycle(lifecycle);
      const result = await operation();
      this.assertLifecycle(lifecycle);
      return result;
    });
    this.operationQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async initializeBackend(lifecycle: number): Promise<AuthorityBackend> {
    const storageStatus = await readStorageStatusProjection();
    this.assertLifecycle(lifecycle);
    const mode = storageStatus.activeBackend;
    const shouldRecoverWorkerPreloadFallback = storageStatus.configuredTarget === 'file'
      && mode === 'browser'
      && isWorkerModuleFallbackReason(storageStatus.fallbackReason);
    if (mode === 'browser' && !shouldRecoverWorkerPreloadFallback) {
      const adapter = createChromeStorageAdapter();
      const backend = this.installBackend({ mode, adapter });
      logBreadcrumb('file-storage: init', 'browser storage active');
      return backend;
    }

    try {
      const { loadRootHandle } = await loadFsDirectoryModule();
      this.assertLifecycle(lifecycle);
      const root = await loadRootHandle(testIdbFactory);
      this.assertLifecycle(lifecycle);
      if (!root) {
        throw Object.assign(
          new Error('No saved folder handle. Select a folder in Options to use file storage.'),
          { code: 'NO_HANDLE' },
        );
      }
      const { createFileStorageAdapter } = await loadFileStorageModule();
      this.assertLifecycle(lifecycle);
      let adapter: StorageAdapter;
      const fileAdapter = await createFileStorageAdapter(root, {
        shouldPublishPing: () => lifecycle === this.lifecycle && this.backend?.adapter === adapter,
      });
      adapter = fileAdapter;
      this.assertLifecycle(lifecycle);
      if (shouldRecoverWorkerPreloadFallback) {
        const saved = (await chrome.storage.local.get(STATE_KEY))[STATE_KEY];
        if (saved && !reconnectDataMatches(normalizeState(saved), await adapter.getState())) {
          const browserAdapter = createChromeStorageAdapter();
          this.assertLifecycle(lifecycle);
          const backend = this.installBackend({ mode: 'browser', adapter: browserAdapter });
          await this.publishFallback('Browser and folder copies differ. Reconnect to choose which data to use.', storageStatus);
          return backend;
        }
      }
      this.assertLifecycle(lifecycle);
      await writeStorageStatusProjection(fileStorageStatus({
        folderName: root.name || storageStatus.folderName,
        fileUpdatedAt: fileAdapter.getFileUpdatedAt() ?? storageStatus.fileUpdatedAt,
        unreadSessionCount: fileAdapter.getUnreadSessionCount(),
      }));
      this.assertLifecycle(lifecycle);
      const backend = this.installBackend({ mode: 'file', adapter });
      logBreadcrumb('file-storage: init', 'file adapter active');
      return backend;
    } catch (error: unknown) {
      if (lifecycle !== this.lifecycle) throw error;
      logWarning('activeAdapter', 'File adapter initialization failed; falling back to browser storage', error);
      const reason = (error as { code?: string })?.code === 'NO_HANDLE'
        ? (error as Error).message
        : fallbackReason(error);
      const adapter = createChromeStorageAdapter();
      const backend = this.installBackend({ mode: 'browser', adapter });
      await this.publishFallback(reason, storageStatus);
      return backend;
    }
  }

  private async ensureBackend(): Promise<AuthorityBackend> {
    if (this.backend) return this.backend;
    if (!this.initPromise) {
      const promise = this.initializeBackend(this.lifecycle).finally(() => {
        if (this.initPromise === promise) this.initPromise = null;
      });
      this.initPromise = promise;
    }
    return this.initPromise;
  }

  private installBackend(backend: AuthorityBackend, state?: TabBoardState): AuthorityBackend {
    this.backendUnsubscribe?.();
    this.backend = backend;
    if (backend.mode === 'file') {
      this.bindFileEvents(backend);
    } else {
      this.unbindFileEvents();
    }
    if (state) {
      this.lastKnownState = state;
      this.lastSeenRevision = state.mutationRevision;
    } else if (backend.mode === 'browser') {
      this.lastSeenRevision = -1;
    }
    this.backendUnsubscribe = backend.adapter.subscribeState((nextState) => {
      if (this.backend !== backend) return;
      this.recordState(nextState);
      this.notifyState(nextState);
    });
    return backend;
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
    const lifecycle = this.lifecycle;
    emitFallback(reason);
    const status = currentStatus ?? await readStorageStatusProjection();
    this.assertLifecycle(lifecycle);
    if (status.configuredTarget === 'file') {
      await writeStorageStatusProjection({
        ...status,
        activeBackend: 'browser',
        fallbackReason: reason,
      });
    }
    this.assertLifecycle(lifecycle);
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
    if (this.backend !== current) return;
    const state = await adapter.getState();
    if (this.backend !== current) return;
    this.installBackend({ mode: 'browser', adapter }, state);
    const installed = this.backend;
    this.notifyState(state);
    if (this.backend !== installed) return;
    if (broadcast) {
      await this.publishFallback(reason);
    } else {
      const status = await readStorageStatusProjection();
      if (this.backend !== installed) return;
      if (status.configuredTarget === 'file') {
        await writeStorageStatusProjection({
          ...status,
          activeBackend: 'browser',
          fallbackReason: reason,
        });
      }
      if (this.backend !== installed) return;
      emitFallback(reason);
    }
  }

  getState(): Promise<TabBoardState> {
    return this.enqueueOperation(async () => {
      const lifecycle = this.lifecycle;
      const backend = await this.ensureBackend();
      this.assertLifecycle(lifecycle);
      this.assertBackend(backend);
      try {
        const state = await backend.adapter.getState();
        this.assertBackend(backend);
        this.recordState(state);
        return this.lastKnownState || state;
      } catch (error: unknown) {
        if (backend.mode !== 'file' || this.backend !== backend) throw error;
        await this.degradeToBrowser(error, true);
        this.assertLifecycle(lifecycle);
        const current = await this.ensureBackend();
        this.assertBackend(current);
        const state = await current.adapter.getState();
        this.assertBackend(current);
        this.recordState(state);
        return this.lastKnownState || state;
      }
    });
  }

  setState(state: TabBoardState, options?: StateWriteOptions): Promise<void> {
    return this.enqueueOperation(async () => {
      const lifecycle = this.lifecycle;
      const backend = await this.ensureBackend();
      this.assertLifecycle(lifecycle);
      this.assertBackend(backend);
      try {
        await backend.adapter.setState(state, options);
        if (this.backend === backend) this.recordState(state);
      } catch (error: unknown) {
        if (backend.mode === 'file' && this.backend === backend) {
          await this.degradeToBrowser(error, true);
        }
        throw error;
      }
    });
  }

  ensureState(): Promise<TabBoardState> {
    return this.enqueueOperation(async () => {
      const lifecycle = this.lifecycle;
      const backend = await this.ensureBackend();
      this.assertLifecycle(lifecycle);
      this.assertBackend(backend);
      try {
        const state = await backend.adapter.ensureState();
        this.assertBackend(backend);
        this.recordState(state);
        return this.lastKnownState || state;
      } catch (error: unknown) {
        if (backend.mode !== 'file' || this.backend !== backend) throw error;
        await this.degradeToBrowser(error, true);
        this.assertLifecycle(lifecycle);
        const current = await this.ensureBackend();
        this.assertBackend(current);
        const state = await current.adapter.ensureState();
        this.assertBackend(current);
        this.recordState(state);
        return this.lastKnownState || state;
      }
    });
  }

  subscribeState(callback: (state: TabBoardState) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  ready(): Promise<void> {
    return this.enqueueOperation(async () => { await this.ensureBackend(); });
  }

  isFileMode(): Promise<boolean> {
    return this.enqueueOperation(async () => (await this.ensureBackend()).mode === 'file');
  }

  private async transition(operation: (lifecycle: number) => Promise<void>): Promise<void> {
    const lifecycle = this.lifecycle;
    const run = () => this.enqueueOperation(() => operation(lifecycle), lifecycle);
    const locks = globalThis.navigator?.locks;
    if (typeof locks?.request === 'function') {
      await locks.request('tabboard-state-write', { mode: 'exclusive' }, run);
    } else {
      await run();
    }
  }

  switchToFileMode(root: FileSystemDirectoryHandle, initialState: TabBoardState): Promise<void> {
    return this.transition(async lifecycle => {
      logBreadcrumb('file-storage: migration', `switching to file mode, revision=${initialState.mutationRevision}`);
      const { createFileStorageAdapter } = await loadFileStorageModule();
      this.assertLifecycle(lifecycle);
      const adapter = await createFileStorageAdapter(root, {
        shouldPublishPing: () => lifecycle === this.lifecycle && this.backend?.adapter === adapter,
      });
      this.assertLifecycle(lifecycle);
      await adapter.setState(initialState);
      this.assertLifecycle(lifecycle);
      await commitFileHandleAndBootstrap(root, {
        fileUpdatedAt: initialState.updatedAt,
        unreadSessionCount: adapter.getUnreadSessionCount(),
      }, undefined, () => this.assertLifecycle(lifecycle));
      this.assertLifecycle(lifecycle);
      this.installBackend({ mode: 'file', adapter }, initialState);
      await writeFilePing(initialState.mutationRevision, initialState.updatedAt);
    });
  }

  switchToBrowserMode(copyFileData: boolean): Promise<void> {
    return this.transition(async lifecycle => {
      logBreadcrumb('file-storage: migration', `switching to browser mode, copyFileData=${copyFileData}`);
      const current = await this.ensureBackend();
      let fileStateToCopy: TabBoardState | null = null;
      if (copyFileData && current.mode === 'file') {
        try {
          fileStateToCopy = await current.adapter.getState();
        } catch (err) {
          logWarning('activeAdapter', 'Failed to read file state while switching to browser mode', err);
        }
      }

      this.assertLifecycle(lifecycle);
      const chromeAdapter = createChromeStorageAdapter();
      if (fileStateToCopy) {
        await chromeAdapter.setState(fileStateToCopy);
      }
      const state = await chromeAdapter.getState();
      this.assertLifecycle(lifecycle);
      await writeStorageStatusProjection({ ...BROWSER_STORAGE_STATUS });
      try {
        const { clearRootHandle } = await loadFsDirectoryModule();
        this.assertLifecycle(lifecycle);
        await clearRootHandle(testIdbFactory);
      } catch (err) {
        logWarning('activeAdapter', 'Failed to clear root handle during switch to browser mode', err);
      }
      this.assertLifecycle(lifecycle);
      this.installBackend({ mode: 'browser', adapter: chromeAdapter }, state);
    });
  }

  reconnectFolder(root: FileSystemDirectoryHandle, choice?: ReconnectChoice): Promise<void> {
    return this.transition(async lifecycle => {
      logBreadcrumb('file-storage: reconnect', 'reconnecting to file folder');
      const { createFileStorageAdapter, saveReconnectCopies } = await loadFileStorageModule();
      this.assertLifecycle(lifecycle);
      const adapter = await createFileStorageAdapter(root, { shouldPublishPing: () => lifecycle === this.lifecycle && this.backend?.adapter === adapter });
      this.assertLifecycle(lifecycle);
      const fileState = await adapter.getState();
      const saved = (await chrome.storage.local.get(STATE_KEY))[STATE_KEY];
      const browserState = normalizeState(saved);
      const differs = saved !== undefined && !reconnectDataMatches(browserState, fileState);
      if (differs && !choice) throw new ReconnectDataConflict(browserState, fileState);
      let state = fileState;
      if (differs) {
        this.assertLifecycle(lifecycle);
        await saveReconnectCopies(root, browserState, fileState);
        const revision = Math.max(browserState.mutationRevision, fileState.mutationRevision);
        if (revision === Number.MAX_SAFE_INTEGER) throw new Error('The saved state revision cannot be advanced.');
        state = normalizeState({
          ...(choice === 'browser' ? browserState : fileState),
          mutationRevision: revision + 1,
          updatedAt: nowIso(),
        });
        this.assertLifecycle(lifecycle);
        await adapter.setState(state);
      }
      this.assertLifecycle(lifecycle);
      await commitFileHandleAndBootstrap(root, {
        fileUpdatedAt: adapter.getFileUpdatedAt(),
        unreadSessionCount: adapter.getUnreadSessionCount(),
      }, state, () => this.assertLifecycle(lifecycle));
      this.assertLifecycle(lifecycle);
      this.installBackend({ mode: 'file', adapter }, state);
    });
  }

  reloadFileState(): Promise<void> {
    return this.enqueueOperation(async () => {
      const backend = await this.ensureBackend();
      this.assertBackend(backend);
      if (backend.mode !== 'file' || !isReloadableAdapter(backend.adapter)) throw new Error('Reconnect the folder before re-reading saved files.');
      await backend.adapter.reloadFromDisk();
    });
  }

  resetBackend(): void {
    this.lifecycle++;
    // Keep in-flight IO ordered across reset; two adapters may target the same folder.
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
  health: {
    fileUpdatedAt: string | null;
    unreadSessionCount?: number;
  },
  selectedState: TabBoardState | undefined,
  assertCurrent: () => void,
): Promise<void> {
  const {
    clearRootHandle,
    loadRootHandle,
    saveRootHandle,
  } = await loadFsDirectoryModule();
  assertCurrent();
  const previousRoot = await loadRootHandle(testIdbFactory);
  assertCurrent();
  await saveRootHandle(root, testIdbFactory);
  try {
    assertCurrent();
    const status = fileStorageStatus({
      folderName: root.name || null,
      fileUpdatedAt: health.fileUpdatedAt,
      unreadSessionCount: health.unreadSessionCount,
    });
    if (selectedState) {
      await chrome.storage.local.set({
        [BOOTSTRAP_KEY]: status,
        [SETTINGS_PROJECTION_KEY]: projectionFromState(selectedState),
        [FILE_PING_KEY]: {
          mutationRevision: selectedState.mutationRevision,
          updatedAt: selectedState.updatedAt,
        },
      });
    } else {
      await writeStorageStatusProjection(status);
    }
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
  await activeAuthority.ready();
  return activeAuthority;
}

export async function getActiveState(): Promise<TabBoardState> {
  return getAuthority().getState();
}

export async function setActiveState(state: TabBoardState, options?: StateWriteOptions): Promise<void> {
  return getAuthority().setState(state, options);
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
export async function switchToFileMode(root: FileSystemDirectoryHandle, initialState: TabBoardState): Promise<void> {
  return getAuthority().switchToFileMode(root, initialState);
}

export async function switchToBrowserMode(copyFileData: boolean): Promise<void> {
  return getAuthority().switchToBrowserMode(copyFileData);
}

/** Reconnect matching data directly; divergent data requires an explicit choice and local recovery copies. */
export async function reconnectFolder(root: FileSystemDirectoryHandle, choice?: ReconnectChoice): Promise<void> {
  return getAuthority().reconnectFolder(root, choice);
}

export async function reloadFileState(): Promise<void> {
  return getAuthority().reloadFileState();
}
