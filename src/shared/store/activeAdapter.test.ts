import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  BOOTSTRAP_KEY,
  FILE_PING_KEY,
  STATE_KEY,
  SETTINGS_PROJECTION_KEY,
  STORAGE_FALLBACK_KEY,
} from '../model/constants';
import {
  createEmptyState,
  createGroupFromTabRecords,
  createTabRecord,
  normalizeState,
  type TabBoardState,
} from '../model';
import { createMemoryDirectory } from '../testing/memoryFs';
import type { MemoryDirectoryHandle } from '../testing/memoryFs';
import {
  _setActiveAdapterIdbFactory,
  _setActiveAdapterModuleLoadersForTests,
  getActiveAdapter,
  getStorageStatus,
  isFileModeActive,
  onFallback,
  reconnectFolder,
  reloadFileState,
  resetActiveAdapterForTests,
  resetActiveAdapter,
  switchToBrowserMode,
  switchToFileMode,
} from './activeAdapter';
import type { IdbFactory } from './fsDirectory';
import { createFileStorageAdapter } from './fileStorage';
import { atomicWriteFile } from './fsAtomic';

// ---------- chrome.storage + onChanged mock ----------

type StorageChange = { newValue?: unknown; oldValue?: unknown };
type StorageChangedListener = (
  changes: Record<string, StorageChange>,
  area: string,
) => void;

interface ChromeMock {
  storage: {
    local: {
      data: Record<string, unknown>;
      get: Mock<(keys?: string | string[] | Record<string, unknown> | null) => Promise<Record<string, unknown>>>;
      set: Mock<(items: Record<string, unknown>) => Promise<void>>;
      remove: Mock<(keys: string | string[]) => Promise<void>>;
    };
    onChanged: {
      _listeners: Set<StorageChangedListener>;
      addListener: Mock<(cb: StorageChangedListener) => void>;
      removeListener: Mock<(cb: StorageChangedListener) => void>;
      _fire(changes: Record<string, StorageChange>, area?: string): void;
    };
  };
}

function makeChromeMock(): ChromeMock {
  const data: Record<string, unknown> = {};
  const listeners = new Set<StorageChangedListener>();

  const mock: ChromeMock = {
    storage: {
      local: {
        data,
        get: vi.fn(async (keys) => {
          if (keys == null) return { ...data };
          if (typeof keys === 'string') {
            return keys in data ? { [keys]: data[keys] } : {};
          }
          if (Array.isArray(keys)) {
            const out: Record<string, unknown> = {};
            for (const k of keys) if (k in data) out[k] = data[k];
            return out;
          }
          if (keys && typeof keys === 'object') {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(keys)) {
              out[k] = k in data ? data[k] : (keys as Record<string, unknown>)[k];
            }
            return out;
          }
          return {};
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          const changes: Record<string, StorageChange> = {};
          for (const [k, v] of Object.entries(items)) {
            changes[k] = { newValue: v, oldValue: data[k] };
            data[k] = v;
          }
          // Fire onChanged (real Chrome does this after set completes).
          queueMicrotask(() => {
            for (const listener of Array.from(listeners)) {
              try {
                listener(changes, 'local');
              } catch {
                // ignore listener errors
              }
            }
          });
        }),
        remove: vi.fn(async (_keys: string | string[]) => {
          const keys = Array.isArray(_keys) ? _keys : [_keys];
          for (const k of keys) delete data[k];
        }),
      },
      onChanged: {
        _listeners: listeners,
        addListener: vi.fn((cb: StorageChangedListener) => {
          listeners.add(cb);
        }),
        removeListener: vi.fn((cb: StorageChangedListener) => {
          listeners.delete(cb);
        }),
        _fire(changes: Record<string, StorageChange>, area: string = 'local') {
          for (const listener of Array.from(listeners)) {
            listener(changes, area);
          }
        },
      },
    },
  };
  return mock;
}

function stubChrome(chromeMock: ChromeMock): void {
  vi.stubGlobal('chrome', chromeMock);
}

function withPermission(root: MemoryDirectoryHandle, state: PermissionState = 'granted'): void {
  (root as unknown as {
    queryPermission: () => Promise<PermissionState>;
    requestPermission: () => Promise<PermissionState>;
  }).queryPermission = async () => state;
  (root as unknown as {
    queryPermission: () => Promise<PermissionState>;
    requestPermission: () => Promise<PermissionState>;
  }).requestPermission = async () => state;
}

// ---------- fake IDB factory (subset, same shape as fsDirectory.test.ts) ----------

type DbMap = Map<string, Map<IDBValidKey, unknown>>;

interface FakeReq<T> {
  result: T;
  error: DOMException | null;
  onsuccess: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
}

interface FakeTx {
  objectStore(name: string): {
    put(value: unknown, key?: IDBValidKey): FakeReq<IDBValidKey>;
    get(key: IDBValidKey): FakeReq<unknown>;
    delete(key: IDBValidKey): FakeReq<undefined>;
  };
  onabort: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  error: DOMException | null;
}

interface FakeDb {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string): void;
  transaction(storeNames: string | string[], mode?: string): FakeTx;
  close(): void;
}

interface FakeOpenReq {
  result: FakeDb;
  error: DOMException | null;
  onupgradeneeded: ((ev: Event) => void) | null;
  onsuccess: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
}

function makeReq<T>(): FakeReq<T> & { _resolve: (v: T) => void; _reject: (e: DOMException) => void } {
  const req: FakeReq<T> & { _resolve: (v: T) => void; _reject: (e: DOMException) => void } = {
    result: undefined as unknown as T,
    error: null,
    onsuccess: null,
    onerror: null,
    _resolve(v: T) {
      req.result = v;
      queueMicrotask(() => {
        if (req.onsuccess) req.onsuccess(new Event('success'));
      });
    },
    _reject(e: DOMException) {
      req.error = e;
      queueMicrotask(() => {
        if (req.onerror) req.onerror(new Event('error'));
      });
    },
  };
  return req;
}

class FakeIDBFactoryInstance {
  private stores: DbMap = new Map();

  _reset(): void {
    this.stores.clear();
  }

  open(_name: string, _version: number): FakeOpenReq {
    const factory = this;
    const db: FakeDb = {
      objectStoreNames: {
        contains: (n: string) => factory.stores.has(n),
      },
      createObjectStore(name: string) {
        if (!factory.stores.has(name)) {
          factory.stores.set(name, new Map());
        }
      },
      transaction(storeNames: string | string[], _mode?: string): FakeTx {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        const tx: FakeTx = {
          objectStore(name: string) {
            const store = factory.stores.get(name);
            if (!store) {
              throw new DOMException(`objectStore "${name}" not found`, 'NotFoundError');
            }
            return {
              put(value: unknown, key?: IDBValidKey) {
                const req = makeReq<IDBValidKey>();
                const k = key;
                if (k === undefined) {
                  queueMicrotask(() => req._reject(new DOMException('No key specified', 'DataError')));
                } else {
                  store.set(k, value);
                  req._resolve(k);
                }
                return req;
              },
              get(key: IDBValidKey) {
                const req = makeReq<unknown>();
                req._resolve(store.get(key));
                return req;
              },
              delete(key: IDBValidKey) {
                const req = makeReq<undefined>();
                store.delete(key);
                req._resolve(undefined);
                return req;
              },
            };
          },
          onabort: null,
          onerror: null,
          error: null,
        };
        return tx;
      },
      close() {},
    };

    const openReq: FakeOpenReq = {
      result: db,
      error: null,
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
    };

    queueMicrotask(() => {
      const needsUpgrade = !factory.stores.has('handlers');
      if (needsUpgrade && openReq.onupgradeneeded) {
        openReq.onupgradeneeded(new Event('upgradeneeded'));
      }
      if (openReq.onsuccess) openReq.onsuccess(new Event('success'));
    });

    return openReq;
  }
}

function makeIdbFactory(): IdbFactory {
  const factory = new FakeIDBFactoryInstance();
  return (() => factory) as unknown as IdbFactory;
}

// ---------- helpers ----------

function knownState(seed?: Partial<TabBoardState>): TabBoardState {
  const base = createEmptyState();
  const ts = '2026-07-23T10:00:00.000Z';
  const group1 = createGroupFromTabRecords(
    [createTabRecord({ title: 'Example', url: 'https://example.com' } as chrome.tabs.Tab)],
    { title: 'Session One', workspaceId: base.activeWorkspaceId },
  );
  return normalizeState({
    ...base,
    mutationRevision: 7,
    groups: [group1],
    categoryOrderByWorkspace: {
      [base.activeWorkspaceId]: [group1.id],
    },
    createdAt: ts,
    updatedAt: ts,
    ...seed,
  });
}

async function writeBootstrap(mode: 'browser' | 'file', chromeMock: ChromeMock): Promise<void> {
  await chromeMock.storage.local.set({ [BOOTSTRAP_KEY]: { mode } });
}

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function withFileCommitGate(root: MemoryDirectoryHandle) {
  const entered = gate();
  const resume = gate();
  _setActiveAdapterModuleLoadersForTests({
    loadFsDirectoryModule: () => import('./fsDirectory'),
    loadFileStorageModule: async () => {
      const module = await import('./fileStorage');
      return { ...module, createFileStorageAdapter: (target, deps) => module.createFileStorageAdapter(target, {
        ...deps,
        locks: { beforeFinalMeta: async () => { entered.release(); await resume.promise; } },
      }) };
    },
  });
  withPermission(root);
  return { entered, resume };
}

// ---------- tests ----------

describe('activeAdapter', () => {
  let chromeMock: ChromeMock;
  let idbFactory: IdbFactory;

  beforeEach(() => {
    chromeMock = makeChromeMock();
    stubChrome(chromeMock);
    idbFactory = makeIdbFactory();
    _setActiveAdapterIdbFactory(idbFactory);
  });

  afterEach(() => {
    resetActiveAdapterForTests();
    _setActiveAdapterIdbFactory(undefined);
    _setActiveAdapterModuleLoadersForTests(undefined);
    vi.unstubAllGlobals();
  });

  it('orders later saves and reads after the complete file transition', async () => {
    const authority = await getActiveAdapter();
    await authority.setState(knownState({ mutationRevision: 10 }));
    const root = createMemoryDirectory('queued-target');
    const { entered, resume } = await withFileCommitGate(root);
    const switching = switchToFileMode(root, knownState({ mutationRevision: 11 }));
    await entered.promise;
    const save = authority.setState(knownState({ mutationRevision: 12 }));
    const read = authority.getState();
    await Promise.resolve();
    resume.release();
    await Promise.all([switching, save]);
    expect((await read).mutationRevision).toBe(12);
    await expect((await createFileStorageAdapter(root)).getState()).resolves.toMatchObject({ mutationRevision: 12 });
    expect((chromeMock.storage.local.data[STATE_KEY] as TabBoardState).mutationRevision).toBe(10);
  });

  it('copies back the preceding queued file write', async () => {
    const root = createMemoryDirectory('copy-after-write');
    withPermission(root);
    const publishing = gate(); const finish = gate();
    let writes = 0;
    _setActiveAdapterModuleLoadersForTests({
      loadFsDirectoryModule: () => import('./fsDirectory'),
      loadFileStorageModule: async () => {
        const module = await import('./fileStorage');
        return { ...module, createFileStorageAdapter: (target, deps) => module.createFileStorageAdapter(target, {
          ...deps, locks: { beforeFinalMeta: async () => {
            if (++writes === 2) { publishing.release(); await finish.promise; }
          } },
        }) };
      },
    });
    await switchToFileMode(root, knownState({ mutationRevision: 20 }));
    const authority = await getActiveAdapter();
    const save = authority.setState(knownState({ mutationRevision: 21 }));
    await publishing.promise;
    const copy = switchToBrowserMode(true);
    finish.release();
    await Promise.all([save, copy]);
    expect((await authority.getState()).mutationRevision).toBe(21);
    expect((chromeMock.storage.local.data[STATE_KEY] as TabBoardState).mutationRevision).toBe(21);
  });

  it('waits for the Web Lock outside the authority queue', async () => {
    const authority = await getActiveAdapter();
    const requested = gate();
    const grant = gate();
    let lockRequested = false;
    vi.stubGlobal('navigator', { locks: { request: async (name: string, options: unknown, operation: () => Promise<void>) => {
      expect(name).toBe('tabboard-state-write');
      expect(options).toEqual({ mode: 'exclusive' });
      lockRequested = true; requested.release(); await grant.promise; return operation();
    } } });
    const switching = switchToBrowserMode(false);
    await Promise.resolve();
    if (!lockRequested) await switching;
    expect(lockRequested).toBe(true);
    await requested.promise;
    // This models a persistence caller already holding the lock.
    await authority.setState(knownState({ mutationRevision: 30 }));
    expect((await authority.getState()).mutationRevision).toBe(30);
    grant.release();
    await switching;
  });

  it('manual reload waits for a transition and retains its direct error', async () => {
    const authority = await getActiveAdapter();
    const root = createMemoryDirectory('manual-after-switch');
    const { entered, resume } = await withFileCommitGate(root);
    const switching = switchToFileMode(root, knownState({ mutationRevision: 40 }));
    await entered.promise;
    const reload = reloadFileState();
    // Attach before releasing the gate so the former direct rejection is observed.
    const result = reload.then(() => 'reloaded', error => error.message);
    resume.release();
    await switching;
    expect(await result).toBe('reloaded');
    root.getDirectoryHandle = async () => { throw new Error('manual disk failure'); };
    await expect(reloadFileState()).rejects.toThrow('manual disk failure');
    expect(await isFileModeActive()).toBe(true);
    expect((await authority.getState()).mutationRevision).toBe(40);
  });

  it('rejects old initialization after reset without resurrecting its backend', async () => {
    const root = createMemoryDirectory('stale-init');
    withPermission(root);
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);
    await writeBootstrap('file', chromeMock);
    const entered = gate(); const resume = gate();
    _setActiveAdapterModuleLoadersForTests({
      loadFsDirectoryModule: () => import('./fsDirectory'),
      loadFileStorageModule: async () => { entered.release(); await resume.promise; return import('./fileStorage'); },
    });
    const old = getActiveAdapter().then(() => 'installed', error => error.message);
    await entered.promise;
    resetActiveAdapter();
    await writeBootstrap('browser', chromeMock);
    const replacing = getActiveAdapter();
    resume.release();
    expect(await old).not.toBe('installed');
    const replacement = await replacing;
    expect(await isFileModeActive()).toBe(false);
    await replacement.setState(knownState({ mutationRevision: 50 }));
    expect(chromeMock.storage.local.data[BOOTSTRAP_KEY]).toEqual({ mode: 'browser' });
  });

  it('retired initialized file adapters cannot publish later commits', async () => {
    const root = createMemoryDirectory('retired-file');
    withPermission(root);
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);
    await writeBootstrap('file', chromeMock);
    let file!: Awaited<ReturnType<typeof createFileStorageAdapter>>;
    _setActiveAdapterModuleLoadersForTests({
      loadFsDirectoryModule: () => import('./fsDirectory'),
      loadFileStorageModule: async () => {
        const module = await import('./fileStorage');
        return { ...module, createFileStorageAdapter: async (target, deps) => {
          file = await module.createFileStorageAdapter(target, deps); return file;
        } };
      },
    });
    const authority = await getActiveAdapter();
    await authority.setState(knownState({ mutationRevision: 60 }));
    expect((chromeMock.storage.local.data[FILE_PING_KEY] as { mutationRevision: number }).mutationRevision).toBe(60);
    await switchToBrowserMode(true);
    const notifications: number[] = [];
    authority.subscribeState(state => notifications.push(state.mutationRevision));
    await file.setState(knownState({ mutationRevision: 999 }));
    expect((chromeMock.storage.local.data[BOOTSTRAP_KEY] as { activeBackend: string }).activeBackend).toBe('browser');
    expect((chromeMock.storage.local.data[FILE_PING_KEY] as { mutationRevision: number }).mutationRevision).toBe(60);
    expect(notifications).toEqual([]);
    expect((await authority.getState()).mutationRevision).toBe(60);
  });

  it('ignores queued and late events from the old file binding after replacement', async () => {
    const previous = createMemoryDirectory('old-binding'); withPermission(previous);
    await switchToFileMode(previous, knownState({ mutationRevision: 70 }));
    const authority = await getActiveAdapter();
    const oldListeners = Array.from(chromeMock.storage.onChanged._listeners);
    const next = createMemoryDirectory('new-binding');
    const { entered, resume } = await withFileCommitGate(next);
    const switching = switchToFileMode(next, knownState({ mutationRevision: 71 }));
    await entered.promise;
    const event = {
      [FILE_PING_KEY]: { newValue: { mutationRevision: 999, updatedAt: '2026-11-13T10:00:00.000Z' } },
      [STORAGE_FALLBACK_KEY]: { newValue: { eventId: 'old-event', reason: 'old folder failed', occurredAt: '2026-11-13T10:00:00.000Z' } },
    };
    oldListeners.forEach(listener => listener(event, 'local'));
    resume.release(); await switching;
    expect((await authority.getState()).mutationRevision).toBe(71);
    const lateEvent = { ...event, [STORAGE_FALLBACK_KEY]: { newValue: { eventId: 'late-old-event', reason: 'retired folder failed again', occurredAt: '2026-11-13T10:00:00.000Z' } } };
    oldListeners.forEach(listener => listener(lateEvent, 'local'));
    expect((await authority.getState()).mutationRevision).toBe(71);
    expect(await isFileModeActive()).toBe(true);
    expect((await getStorageStatus()).folderName).toBe('new-binding');
  });

  it('ignores a late backend subscription callback even with a higher revision', async () => {
    const root = createMemoryDirectory('late-callback'); withPermission(root);
    let late!: (state: TabBoardState) => void;
    _setActiveAdapterModuleLoadersForTests({
      loadFsDirectoryModule: () => import('./fsDirectory'),
      loadFileStorageModule: async () => {
        const module = await import('./fileStorage');
        return { ...module, createFileStorageAdapter: async (target, deps) => {
          const adapter = await module.createFileStorageAdapter(target, deps);
          const subscribe = adapter.subscribeState.bind(adapter);
          adapter.subscribeState = callback => { late = callback; return subscribe(callback); };
          return adapter;
        } };
      },
    });
    await switchToFileMode(root, knownState({ mutationRevision: 80 }));
    const authority = await getActiveAdapter();
    await switchToBrowserMode(true);
    const notifications: number[] = [];
    authority.subscribeState(state => notifications.push(state.mutationRevision));
    late(knownState({ mutationRevision: 999 }));
    expect((await authority.getState()).mutationRevision).toBe(80);
    expect(notifications).toEqual([]);
  });

  it('reset revokes publication for an already-started file commit without losing its IO error', async () => {
    const root = createMemoryDirectory('reset-write'); withPermission(root);
    const entered = gate(); const resume = gate(); let writes = 0;
    _setActiveAdapterModuleLoadersForTests({
      loadFsDirectoryModule: () => import('./fsDirectory'),
      loadFileStorageModule: async () => {
        const module = await import('./fileStorage');
        return { ...module, createFileStorageAdapter: (target, deps) => module.createFileStorageAdapter(target, {
          ...deps, locks: { beforeFinalMeta: async () => {
            if (++writes === 2) { entered.release(); await resume.promise; throw new Error('original disk error'); }
          } },
        }) };
      },
    });
    await switchToFileMode(root, knownState({ mutationRevision: 90 }));
    const authority = await getActiveAdapter();
    const saving = authority.setState(knownState({ mutationRevision: 91 }));
    const result = saving.catch(error => error.message);
    await entered.promise;
    resetActiveAdapter();
    await writeBootstrap('browser', chromeMock);
    const replacing = getActiveAdapter();
    resume.release();
    expect(await result).toBe('original disk error');
    const replacement = await replacing;
    expect(await isFileModeActive()).toBe(false);
    await replacement.setState(knownState({ mutationRevision: 92 }));
    expect((chromeMock.storage.local.data[FILE_PING_KEY] as { mutationRevision: number }).mutationRevision).toBe(90);
  });

  it('reset stops a candidate paused before adapter creation from starting disk writes', async () => {
    const root = createMemoryDirectory('reset-candidate'); withPermission(root);
    const entered = gate(); const resume = gate();
    _setActiveAdapterModuleLoadersForTests({
      loadFsDirectoryModule: () => import('./fsDirectory'),
      loadFileStorageModule: async () => { entered.release(); await resume.promise; return import('./fileStorage'); },
    });
    await getActiveAdapter();
    const switching = switchToFileMode(root, knownState({ mutationRevision: 100 }));
    const result = switching.catch(error => error.message);
    await entered.promise;
    resetActiveAdapter();
    const replacing = getActiveAdapter();
    resume.release();
    await replacing;
    expect(await result).toBe('Storage authority was reset during the operation.');
    const entries: string[] = [];
    for await (const [name] of root.entries()) entries.push(name);
    expect(entries).toEqual([]);
    expect(await isFileModeActive()).toBe(false);
  });

  it('keeps same-root file commits ordered across synchronous reset', async () => {
    const root = createMemoryDirectory('same-root-reset'); withPermission(root);
    const entered = gate(); const resume = gate(); let writes = 0;
    let oldReleased = false; let overlap = false;
    _setActiveAdapterModuleLoadersForTests({
      loadFsDirectoryModule: () => import('./fsDirectory'),
      loadFileStorageModule: async () => {
        const module = await import('./fileStorage');
        return { ...module, createFileStorageAdapter: (target, deps) => module.createFileStorageAdapter(target, {
          ...deps, locks: { beforeFinalMeta: async () => {
            if (++writes === 2) { entered.release(); await resume.promise; }
            else if (writes === 3) overlap = !oldReleased;
          } },
        }) };
      },
    });
    await switchToFileMode(root, knownState({ mutationRevision: 110 }));
    const authority = await getActiveAdapter();
    const oldSave = authority.setState(knownState({ mutationRevision: 111 }));
    const oldResult = oldSave.catch(error => error.message);
    await entered.promise;
    resetActiveAdapter();
    const newSave = authority.setState(knownState({ mutationRevision: 112 }));
    // MemoryFS IO is microtask-only: one scheduler turn lets an unfenced writer finish.
    await new Promise(resolve => setTimeout(resolve, 0));
    const writesWhileOldPaused = writes;
    oldReleased = true; resume.release();
    await Promise.all([oldResult, newSave]);
    expect(writesWhileOldPaused).toBe(2);
    expect(overlap).toBe(false);
    expect((await (await createFileStorageAdapter(root)).getState()).mutationRevision).toBe(112);
    expect((await authority.getState()).mutationRevision).toBe(112);
    expect((chromeMock.storage.local.data[FILE_PING_KEY] as { mutationRevision: number }).mutationRevision).toBe(112);
  });

  it('preserves handle rollback and the actual bootstrap error when reset occurs during commit', async () => {
    await getActiveAdapter();
    const previous = createMemoryDirectory('previous-handle'); withPermission(previous);
    const target = createMemoryDirectory('failed-reset-target'); withPermission(target);
    const { saveRootHandle, loadRootHandle } = await import('./fsDirectory');
    await saveRootHandle(previous, idbFactory);
    const entered = gate(); const resume = gate();
    const original = chromeMock.storage.local.set.getMockImplementation()!;
    chromeMock.storage.local.set.mockImplementation(async items => {
      if (BOOTSTRAP_KEY in items) { entered.release(); await resume.promise; throw new Error('bootstrap failed during reset'); }
      return original(items);
    });
    const switching = switchToFileMode(target, knownState({ mutationRevision: 120 }));
    const result = switching.catch(error => error.message);
    await entered.promise;
    resetActiveAdapter();
    const replacing = getActiveAdapter();
    resume.release();
    expect(await result).toBe('bootstrap failed during reset');
    await replacing;
    expect(await loadRootHandle(idbFactory)).toBe(previous);
    expect(await isFileModeActive()).toBe(false);
  });

  it('browser bootstrap does not load file-only storage modules', async () => {
    const loadFileStorageModule = vi.fn(() => import('./fileStorage'));
    const loadFsDirectoryModule = vi.fn(() => import('./fsDirectory'));
    _setActiveAdapterModuleLoadersForTests({
      loadFileStorageModule,
      loadFsDirectoryModule,
    });

    await getActiveAdapter();

    expect(loadFileStorageModule).not.toHaveBeenCalled();
    expect(loadFsDirectoryModule).not.toHaveBeenCalled();
  });

  it('file bootstrap loads file-only storage modules on demand', async () => {
    await writeBootstrap('file', chromeMock);
    const root = createMemoryDirectory('root');
    withPermission(root);
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);
    const loadFileStorageModule = vi.fn(() => import('./fileStorage'));
    const loadFsDirectoryModule = vi.fn(() => import('./fsDirectory'));
    _setActiveAdapterModuleLoadersForTests({
      loadFileStorageModule,
      loadFsDirectoryModule,
    });

    await getActiveAdapter();

    expect(loadFileStorageModule).toHaveBeenCalledTimes(1);
    expect(loadFsDirectoryModule).toHaveBeenCalledTimes(1);
  });

  it('default bootstrap (no key) returns ChromeStorageAdapter', async () => {
    const adapter = await getActiveAdapter();
    // Chrome adapter reads STATE_KEY from chrome.storage.local
    const adapter2 = await getActiveAdapter();
    expect(adapter).toBe(adapter2); // singleton
    expect(await isFileModeActive()).toBe(false);
  });

  it('bootstrap=file + no handle in IDB falls back to chrome and emits fallback event', async () => {
    await writeBootstrap('file', chromeMock);
    const fallbackCb = vi.fn();
    const unsub = onFallback(fallbackCb);

    const adapter = await getActiveAdapter();

    // Should be a chrome adapter (fallback)
    expect(await isFileModeActive()).toBe(false);
    expect(fallbackCb).toHaveBeenCalledTimes(1);
    expect(fallbackCb.mock.calls[0][0]).toMatch(/handle/i);
    expect(await getStorageStatus()).toMatchObject({
      configuredTarget: 'file',
      activeBackend: 'browser',
      fallbackReason: expect.stringMatching(/handle/i),
    });
    // Verify it actually reads from STATE_KEY by exercising getState/setState
    const testState = knownState({ mutationRevision: 1 });
    await adapter.setState(testState);
    const loaded = await adapter.getState();
    expect(loaded.mutationRevision).toBe(1);
    // Chrome adapter writes to STATE_KEY in chrome.storage.local
    expect(chromeMock.storage.local.data[STATE_KEY]).toBeTruthy();
    unsub();
  });

  it('bootstrap=file + valid handle returns FileStorageAdapter', async () => {
    await writeBootstrap('file', chromeMock);
    const root = createMemoryDirectory('root');
    withPermission(root);
    // Persist handle directly via the same idbFactory
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);

    const adapter = await getActiveAdapter();
    expect(await isFileModeActive()).toBe(true);

    // Round-trip via file adapter
    const state = knownState({ mutationRevision: 42 });
    await adapter.setState(state);
    const loaded = await adapter.getState();
    expect(loaded.mutationRevision).toBe(42);
    expect(loaded.groups).toHaveLength(1);
    expect(await getStorageStatus()).toEqual({
      configuredTarget: 'file',
      activeBackend: 'file',
      folderName: 'root',
      fallbackReason: null,
      fileUpdatedAt: state.updatedAt,
    });
  });

  it('retries the file backend only for the persisted worker-preload fallback', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);
    chromeMock.storage.local.data[BOOTSTRAP_KEY] = {
      configuredTarget: 'file',
      activeBackend: 'browser',
      folderName: 'root',
      fallbackReason: 'File storage error: document is not defined',
      fileUpdatedAt: '2026-08-02T16:22:31.000Z',
    };
    const loadFileStorageModule = vi.fn(() => import('./fileStorage'));
    const loadFsDirectoryModule = vi.fn(() => import('./fsDirectory'));
    _setActiveAdapterModuleLoadersForTests({
      loadFileStorageModule,
      loadFsDirectoryModule,
    });

    await getActiveAdapter();

    expect(await isFileModeActive()).toBe(true);
    expect(loadFileStorageModule).toHaveBeenCalledTimes(1);
    expect(loadFsDirectoryModule).toHaveBeenCalledTimes(1);
    expect(await getStorageStatus()).toMatchObject({
      configuredTarget: 'file',
      activeBackend: 'file',
      folderName: 'root',
      fallbackReason: null,
    });
  });

  it('retries the file backend for the persisted worker dynamic-import fallback', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);
    chromeMock.storage.local.data[BOOTSTRAP_KEY] = {
      configuredTarget: 'file',
      activeBackend: 'browser',
      folderName: 'root',
      fallbackReason: 'File storage error: window is not defined',
      fileUpdatedAt: '2026-08-03T00:00:00.000Z',
    };

    await getActiveAdapter();

    expect(await isFileModeActive()).toBe(true);
    expect(await getStorageStatus()).toMatchObject({
      configuredTarget: 'file',
      activeBackend: 'file',
      fallbackReason: null,
    });
  });

  it('does not automatically retry ordinary persisted file fallbacks', async () => {
    chromeMock.storage.local.data[BOOTSTRAP_KEY] = {
      configuredTarget: 'file',
      activeBackend: 'browser',
      folderName: 'root',
      fallbackReason: 'Permission to access the storage folder was denied.',
      fileUpdatedAt: '2026-08-02T16:22:31.000Z',
    };
    const loadFileStorageModule = vi.fn(() => import('./fileStorage'));
    const loadFsDirectoryModule = vi.fn(() => import('./fsDirectory'));
    _setActiveAdapterModuleLoadersForTests({
      loadFileStorageModule,
      loadFsDirectoryModule,
    });

    await getActiveAdapter();

    expect(await isFileModeActive()).toBe(false);
    expect(loadFileStorageModule).not.toHaveBeenCalled();
    expect(loadFsDirectoryModule).not.toHaveBeenCalled();
  });

  it('concurrent getActiveAdapter() calls share one init promise', async () => {
    await writeBootstrap('file', chromeMock);
    const root = createMemoryDirectory('root');
    withPermission(root);
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);

    // Call getActiveAdapter 3 times concurrently; all should resolve to same instance.
    const [a, b, c] = await Promise.all([
      getActiveAdapter(),
      getActiveAdapter(),
      getActiveAdapter(),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('file adapter write triggers ping (FILE_PING_KEY written to chrome.storage.local)', async () => {
    await writeBootstrap('file', chromeMock);
    const root = createMemoryDirectory('root');
    withPermission(root);
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);

    const adapter = await getActiveAdapter();
    const state = knownState({ mutationRevision: 11, updatedAt: '2026-07-23T12:00:00.000Z' });
    await adapter.setState(state);

    // The file adapter writes FILE_PING_KEY after commit (same assertion as fileStorage.test,
    // but verifying end-to-end through the activeAdapter factory path).
    const ping = chromeMock.storage.local.data[FILE_PING_KEY] as
      | { mutationRevision: number; updatedAt: string }
      | undefined;
    expect(ping).toBeTruthy();
    expect(ping?.mutationRevision).toBe(11);
    expect(ping?.updatedAt).toBe('2026-07-23T12:00:00.000Z');
  });

  it('ping with newer revision triggers state reload from disk', async () => {
    await writeBootstrap('file', chromeMock);
    const root = createMemoryDirectory('root');
    withPermission(root);
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);

    const adapter = await getActiveAdapter();
    const initial = knownState({ mutationRevision: 1, updatedAt: '2026-07-23T10:00:00.000Z' });
    await adapter.setState(initial);

    // Subscribe to state changes on the active adapter.
    const stateCb = vi.fn();
    adapter.subscribeState(stateCb);

    // Simulate another context writing a newer state directly to the same root
    // (bypassing our cached adapter).
    const otherAdapter = await createFileStorageAdapter(root);
    const newer = knownState({
      mutationRevision: 5,
      updatedAt: '2026-07-23T11:00:00.000Z',
    });
    // Clear categoryOrder etc. to keep knownState simple — override with a distinct group title.
    const group2 = createGroupFromTabRecords(
      [createTabRecord({ title: 'Other', url: 'https://other.example' } as chrome.tabs.Tab)],
      { title: 'Other Session', workspaceId: newer.activeWorkspaceId },
    );
    const newerState = normalizeState({
      ...newer,
      groups: [group2],
      categoryOrderByWorkspace: { [newer.activeWorkspaceId]: [group2.id] },
    });
    await otherAdapter.setState(newerState);

    // Because the mock chrome fires onChanged automatically on set, the ping
    // from otherAdapter should already have triggered reload. Wait one microtask
    // for the subscribe callback to fire.
    await vi.waitFor(() => {
      expect(stateCb).toHaveBeenCalled();
    });

    const reloaded = await adapter.getState();
    expect(reloaded.mutationRevision).toBe(5);
    expect(reloaded.groups[0]?.title).toBe('Other Session');
  });

  it('ping with older or equal revision does not trigger reload', async () => {
    await writeBootstrap('file', chromeMock);
    const root = createMemoryDirectory('root');
    withPermission(root);
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);

    const adapter = await getActiveAdapter();
    const state = knownState({ mutationRevision: 3 });
    await adapter.setState(state);

    const stateCb = vi.fn();
    adapter.subscribeState(stateCb);

    // Fire a ping with an older revision (simulated onChanged event).
    chromeMock.storage.onChanged._fire({
      [FILE_PING_KEY]: {
        newValue: { mutationRevision: 1, updatedAt: '2026-07-23T09:00:00.000Z' },
      },
    });
    // Wait a tick for any (spurious) callbacks.
    await new Promise((r) => setTimeout(r, 10));
    expect(stateCb).not.toHaveBeenCalled();

    // Equal revision should also not fire.
    chromeMock.storage.onChanged._fire({
      [FILE_PING_KEY]: {
        newValue: { mutationRevision: 3, updatedAt: state.updatedAt },
      },
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(stateCb).not.toHaveBeenCalled();
  });

  it('runtime file write failure degrades the stable authority and preserves the last committed state', async () => {
    await writeBootstrap('file', chromeMock);
    const root = createMemoryDirectory('root');
    withPermission(root);
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);

    const authority = await getActiveAdapter();
    const committed = knownState({ mutationRevision: 10 });
    await authority.setState(committed);
    const fallbackCb = vi.fn();
    onFallback(fallbackCb);

    root.getDirectoryHandle = vi.fn(async () => {
      throw new DOMException('Folder disappeared', 'NotFoundError');
    }) as typeof root.getDirectoryHandle;
    const uncommitted = knownState({ mutationRevision: 11 });

    await expect(authority.setState(uncommitted)).rejects.toThrow('Folder disappeared');

    expect(await getActiveAdapter()).toBe(authority);
    expect(await isFileModeActive()).toBe(false);
    expect(fallbackCb).toHaveBeenCalledTimes(1);
    expect((await authority.getState()).mutationRevision).toBe(10);
    expect((chromeMock.storage.local.data[STATE_KEY] as TabBoardState).mutationRevision).toBe(10);
    expect(await getStorageStatus()).toEqual({
      configuredTarget: 'file',
      activeBackend: 'browser',
      folderName: 'root',
      fallbackReason: expect.stringMatching(/unavailable/i),
      fileUpdatedAt: committed.updatedAt,
    });

    const retried = knownState({ mutationRevision: 11 });
    await authority.setState(retried);
    expect((chromeMock.storage.local.data[STATE_KEY] as TabBoardState).mutationRevision).toBe(11);
  });

  it('runtime file reload failure degrades instead of leaving a broken file backend active', async () => {
    await writeBootstrap('file', chromeMock);
    const root = createMemoryDirectory('root');
    let permission: PermissionState = 'granted';
    (root as unknown as {
      queryPermission: () => Promise<PermissionState>;
      requestPermission: () => Promise<PermissionState>;
    }).queryPermission = async () => permission;
    (root as unknown as {
      queryPermission: () => Promise<PermissionState>;
      requestPermission: () => Promise<PermissionState>;
    }).requestPermission = async () => permission;
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);

    const authority = await getActiveAdapter();
    const committed = knownState({ mutationRevision: 12 });
    await authority.setState(committed);
    const fallbackCb = vi.fn();
    onFallback(fallbackCb);
    permission = 'denied';

    chromeMock.storage.onChanged._fire({
      [FILE_PING_KEY]: {
        newValue: {
          mutationRevision: 13,
          updatedAt: '2026-07-26T10:02:00.000Z',
        },
      },
    });

    await vi.waitFor(async () => {
      expect(await isFileModeActive()).toBe(false);
    });
    expect(fallbackCb).toHaveBeenCalledTimes(1);
    expect((await authority.getState()).mutationRevision).toBe(12);
  });

  it('suppresses remote fallback notification after reset during the awaited status write', async () => {
    const root = createMemoryDirectory('remote-reset-status'); withPermission(root);
    await switchToFileMode(root, knownState({ mutationRevision: 130 }));
    const entered = gate(); const resume = gate();
    const reason = 'Remote folder failed before reset';
    const original = chromeMock.storage.local.set.getMockImplementation()!;
    chromeMock.storage.local.set.mockImplementation(async items => {
      if ((items[BOOTSTRAP_KEY] as { fallbackReason?: string })?.fallbackReason === reason) {
        entered.release(); await resume.promise;
      }
      return original(items);
    });
    const reasons: string[] = [];
    onFallback(value => reasons.push(value));
    chromeMock.storage.onChanged._fire({
      [STORAGE_FALLBACK_KEY]: { newValue: { eventId: 'remote-reset-status', reason, occurredAt: '2026-11-13T10:00:00.000Z' } },
    });
    await entered.promise;
    resetActiveAdapter();
    const replacing = getActiveAdapter();
    resume.release();
    const replacement = await replacing;
    await replacement.getState();
    expect(reasons).toEqual([]);
    expect(await isFileModeActive()).toBe(false);
    // A transport write already started before reset still publishes its actual success.
    expect(await getStorageStatus()).toMatchObject({ activeBackend: 'browser', fallbackReason: reason });
  });

  it('preserves initialization IO rejection after reset without stale installation or fallback', async () => {
    const root = createMemoryDirectory('init-reset-status'); withPermission(root);
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);
    await writeBootstrap('file', chromeMock);
    const entered = gate(); const resume = gate();
    const actualError = new Error('Initialization status transport failed after reset');
    const original = chromeMock.storage.local.set.getMockImplementation()!;
    let paused = false;
    chromeMock.storage.local.set.mockImplementation(async items => {
      if (!paused && (items[BOOTSTRAP_KEY] as { activeBackend?: string })?.activeBackend === 'file') {
        paused = true; entered.release(); await resume.promise; throw actualError;
      }
      return original(items);
    });
    const reasons: string[] = [];
    onFallback(value => reasons.push(value));
    const initializing = getActiveAdapter().catch(error => error);
    await entered.promise;
    resetActiveAdapter();
    chromeMock.storage.local.data[BOOTSTRAP_KEY] = { mode: 'browser' };
    const replacing = getActiveAdapter();
    resume.release();
    expect(await initializing).toBe(actualError);
    const replacement = await replacing;
    await replacement.getState();
    expect(await isFileModeActive()).toBe(false);
    expect(reasons).toEqual([]);
    expect(chromeMock.storage.local.data[STORAGE_FALLBACK_KEY]).toBeUndefined();
    expect(chromeMock.storage.local.data[FILE_PING_KEY]).toBeUndefined();
    expect(chromeMock.storage.local.data[BOOTSTRAP_KEY]).toEqual({ mode: 'browser' });
  });

  it('remote fallback event moves a live authority to browser storage exactly once', async () => {
    await writeBootstrap('file', chromeMock);
    const root = createMemoryDirectory('root');
    withPermission(root);
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);

    const authority = await getActiveAdapter();
    const committed = knownState({ mutationRevision: 14 });
    await authority.setState(committed);
    const fallbackCb = vi.fn();
    onFallback(fallbackCb);
    const event = {
      eventId: 'remote-fallback-1',
      reason: 'Cloud folder went offline',
      occurredAt: '2026-07-26T10:03:00.000Z',
    };
    const remoteState = knownState({
      mutationRevision: 15,
      updatedAt: '2026-07-26T10:02:30.000Z',
    });
    chromeMock.storage.local.data[STATE_KEY] = remoteState;

    chromeMock.storage.onChanged._fire({
      [STORAGE_FALLBACK_KEY]: { newValue: event },
    });
    chromeMock.storage.onChanged._fire({
      [STORAGE_FALLBACK_KEY]: { newValue: event },
    });

    await vi.waitFor(async () => {
      expect(await isFileModeActive()).toBe(false);
    });
    expect(fallbackCb).toHaveBeenCalledTimes(1);
    expect(await getActiveAdapter()).toBe(authority);
    expect((await authority.getState()).mutationRevision).toBe(15);
    expect((chromeMock.storage.local.data[STATE_KEY] as TabBoardState).mutationRevision).toBe(15);
  });

  it('switchToFileMode persists handle, writes bootstrap, and seeds initial state', async () => {
    // Start in default (browser) mode with no bootstrap key.
    const root = createMemoryDirectory('root');
    withPermission(root);
    const initialState = knownState({ mutationRevision: 99 });

    await switchToFileMode(root, initialState);

    // Bootstrap is now 'file'
    expect(chromeMock.storage.local.data[BOOTSTRAP_KEY]).toEqual({
      configuredTarget: 'file',
      activeBackend: 'file',
      folderName: 'root',
      fallbackReason: null,
      fileUpdatedAt: initialState.updatedAt,
    });

    // Active adapter is file adapter
    expect(await isFileModeActive()).toBe(true);
    const adapter = await getActiveAdapter();
    const loaded = await adapter.getState();
    expect(loaded.mutationRevision).toBe(99);

    // Handle was saved to IDB
    const { loadRootHandle } = await import('./fsDirectory');
    const saved = await loadRootHandle(idbFactory);
    expect(saved).toBe(root);
  });

  it('failed file migration leaves browser authority, bootstrap, and handle unchanged', async () => {
    const authority = await getActiveAdapter();
    const browserState = knownState({ mutationRevision: 90 });
    await authority.setState(browserState);
    const root = createMemoryDirectory('unwritable');
    withPermission(root);
    root.getDirectoryHandle = vi.fn(async () => {
      throw new DOMException('Target folder is offline', 'NotFoundError');
    }) as typeof root.getDirectoryHandle;

    await expect(switchToFileMode(
      root,
      knownState({ mutationRevision: 91 }),
    )).rejects.toThrow('Target folder is offline');

    expect(chromeMock.storage.local.data[BOOTSTRAP_KEY]).toBeUndefined();
    expect(await isFileModeActive()).toBe(false);
    expect(await getActiveAdapter()).toBe(authority);
    expect((await authority.getState()).mutationRevision).toBe(90);
    const { loadRootHandle } = await import('./fsDirectory');
    expect(await loadRootHandle(idbFactory)).toBeNull();
  });

  it('file migration restores the previous handle when bootstrap commit fails', async () => {
    const authority = await getActiveAdapter();
    const previousRoot = createMemoryDirectory('previous-root');
    withPermission(previousRoot);
    const nextRoot = createMemoryDirectory('next-root');
    withPermission(nextRoot);
    const { loadRootHandle, saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(previousRoot, idbFactory);
    chromeMock.storage.local.set.mockImplementation(async (items: Record<string, unknown>) => {
      if (BOOTSTRAP_KEY in items) throw new Error('bootstrap write failed');
      const changes: Record<string, StorageChange> = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = {
          oldValue: chromeMock.storage.local.data[key],
          newValue: value,
        };
        chromeMock.storage.local.data[key] = value;
      }
      queueMicrotask(() => chromeMock.storage.onChanged._fire(changes));
    });

    await expect(switchToFileMode(
      nextRoot,
      knownState({ mutationRevision: 92 }),
    )).rejects.toThrow('bootstrap write failed');

    expect(await loadRootHandle(idbFactory)).toBe(previousRoot);
    expect(chromeMock.storage.local.data[BOOTSTRAP_KEY]).toBeUndefined();
    expect(await isFileModeActive()).toBe(false);
    expect(await getActiveAdapter()).toBe(authority);
  });

  it('failed file migration does not publish a pre-commit file ping', async () => {
    await writeBootstrap('file', chromeMock);
    const previousRoot = createMemoryDirectory('previous-root');
    withPermission(previousRoot);
    const nextRoot = createMemoryDirectory('next-root');
    withPermission(nextRoot);
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(previousRoot, idbFactory);
    const authority = await getActiveAdapter();
    await authority.setState(knownState({ mutationRevision: 92 }));
    const pingWritesBefore = chromeMock.storage.local.set.mock.calls.filter(
      ([items]) => FILE_PING_KEY in (items as Record<string, unknown>),
    ).length;
    chromeMock.storage.local.set.mockImplementation(async (items: Record<string, unknown>) => {
      if (BOOTSTRAP_KEY in items) throw new Error('bootstrap write failed');
      const changes: Record<string, StorageChange> = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = {
          oldValue: chromeMock.storage.local.data[key],
          newValue: value,
        };
        chromeMock.storage.local.data[key] = value;
      }
      queueMicrotask(() => chromeMock.storage.onChanged._fire(changes));
    });

    await expect(switchToFileMode(
      nextRoot,
      knownState({ mutationRevision: 93 }),
    )).rejects.toThrow('bootstrap write failed');

    const pingWritesAfter = chromeMock.storage.local.set.mock.calls.filter(
      ([items]) => FILE_PING_KEY in (items as Record<string, unknown>),
    ).length;
    expect(pingWritesAfter).toBe(pingWritesBefore);
    expect(await isFileModeActive()).toBe(true);
  });

  it('switchToBrowserMode(copyFileData:true) copies file data to chrome storage', async () => {
    // First, get into file mode with some state
    await writeBootstrap('file', chromeMock);
    const root = createMemoryDirectory('root');
    withPermission(root);
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);

    const fileAdapter = await getActiveAdapter();
    const state = knownState({ mutationRevision: 22 });
    await fileAdapter.setState(state);
    expect(await isFileModeActive()).toBe(true);

    // Switch to browser mode, requesting copy
    await switchToBrowserMode(true);

    // Bootstrap is now 'browser'
    expect(chromeMock.storage.local.data[BOOTSTRAP_KEY]).toEqual({
      configuredTarget: 'browser',
      activeBackend: 'browser',
      folderName: null,
      fallbackReason: null,
      fileUpdatedAt: null,
    });
    expect(await isFileModeActive()).toBe(false);

    // State was copied to chrome storage via STATE_KEY
    const stored = chromeMock.storage.local.data[STATE_KEY] as TabBoardState | undefined;
    expect(stored).toBeTruthy();
    expect(stored?.mutationRevision).toBe(22);

    // Handle was cleared from IDB
    const { loadRootHandle } = await import('./fsDirectory');
    const after = await loadRootHandle(idbFactory);
    expect(after).toBeNull();

    // New getActiveAdapter returns chrome adapter with the copied state
    const chromeAdapter = await getActiveAdapter();
    const loaded = await chromeAdapter.getState();
    expect(loaded.mutationRevision).toBe(22);
  });

  it('switchToBrowserMode(copyFileData:false) switches without copying', async () => {
    // First get into file mode with state
    await writeBootstrap('file', chromeMock);
    const root = createMemoryDirectory('root');
    withPermission(root);
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);

    const fileAdapter = await getActiveAdapter();
    await fileAdapter.setState(knownState({ mutationRevision: 33 }));

    // Put unrelated data into chrome STATE_KEY to confirm it is NOT overwritten.
    await chromeMock.storage.local.set({
      [STATE_KEY]: { unrelated: true, mutationRevision: 0 },
    });

    await switchToBrowserMode(false);

    expect(await isFileModeActive()).toBe(false);
    // STATE_KEY still has what we put there (switchToBrowserMode did not overwrite).
    expect(chromeMock.storage.local.data[STATE_KEY]).toEqual({ unrelated: true, mutationRevision: 0 });

    // Handle was cleared
    const { loadRootHandle } = await import('./fsDirectory');
    expect(await loadRootHandle(idbFactory)).toBeNull();
  });

  it('failed browser copy-back keeps file authority, bootstrap, and handle active', async () => {
    await writeBootstrap('file', chromeMock);
    const root = createMemoryDirectory('root');
    withPermission(root);
    const { loadRootHandle, saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);
    const authority = await getActiveAdapter();
    await authority.setState(knownState({ mutationRevision: 44 }));
    chromeMock.storage.local.set.mockImplementationOnce(async () => {
      throw new Error('chrome storage unavailable');
    });

    await expect(switchToBrowserMode(true)).rejects.toThrow('chrome storage unavailable');

    expect(chromeMock.storage.local.data[BOOTSTRAP_KEY]).toEqual({
      configuredTarget: 'file',
      activeBackend: 'file',
      folderName: 'root',
      fallbackReason: null,
      fileUpdatedAt: '2026-07-23T10:00:00.000Z',
    });
    expect(await isFileModeActive()).toBe(true);
    expect(await getActiveAdapter()).toBe(authority);
    expect(await loadRootHandle(idbFactory)).toBe(root);
    expect((await authority.getState()).mutationRevision).toBe(44);
  });

  it.each(['new-session', 'note-update', 'deletion'] as const)(
    'requires a choice before reconnecting after browser %s', async (change) => {
      const root = createMemoryDirectory('reconnect');
      withPermission(root);
      const fileState = knownState();
      await (await createFileStorageAdapter(root)).setState(fileState);
      const browserState = normalizeState({
        ...fileState, mutationRevision: 8,
        groups: change === 'deletion' ? [] : change === 'note-update'
          ? fileState.groups.map((group) => ({ ...group, note: 'New browser note' }))
          : [...fileState.groups, createGroupFromTabRecords(
              [createTabRecord({ title: 'New browser tab', url: 'https://new-browser.example' } as chrome.tabs.Tab)],
              { title: 'New browser session', workspaceId: fileState.activeWorkspaceId },
            )],
      });
      chromeMock.storage.local.data[STATE_KEY] = browserState;
      chromeMock.storage.local.data[BOOTSTRAP_KEY] = {
        configuredTarget: 'file', activeBackend: 'browser', folderName: 'reconnect',
        fallbackReason: 'Permission was denied.', fileUpdatedAt: fileState.updatedAt,
      };
      const authority = await getActiveAdapter();

      await expect(reconnectFolder(root)).rejects.toMatchObject({ code: 'RECONNECT_DATA_CONFLICT' });
      expect(await isFileModeActive()).toBe(false);
      expect(await authority.getState()).toEqual(browserState);
      expect(await (await createFileStorageAdapter(root)).getState()).toEqual(fileState);
    },
  );

  it.each(['browser', 'file'] as const)('reconnects with the chosen %s copy and preserves both recovery copies', async (choice) => {
    const root = createMemoryDirectory('reconnect');
    withPermission(root);
    const fileState = knownState();
    await (await createFileStorageAdapter(root)).setState(fileState);
    const browserState = normalizeState({
      ...fileState, mutationRevision: 8,
      groups: fileState.groups.map((group) => ({ ...group, note: 'New browser note' })),
    });
    chromeMock.storage.local.data[STATE_KEY] = browserState;
    chromeMock.storage.local.data[BOOTSTRAP_KEY] = {
      configuredTarget: 'file', activeBackend: 'browser', folderName: 'reconnect',
      fallbackReason: 'Permission was denied.', fileUpdatedAt: fileState.updatedAt,
    };
    await getActiveAdapter();
    await reconnectFolder(root, choice);

    expect(await isFileModeActive()).toBe(true);
    expect((await (await getActiveAdapter()).getState()).groups)
      .toEqual(choice === 'browser' ? browserState.groups : fileState.groups);
    const names: string[] = [];
    for await (const [name] of root.entries()) names.push(name);
    expect(names).toContain('.tabboard-reconnect-browser.json');
    expect(names).toContain('.tabboard-reconnect-file.json');
    const savedBrowser = JSON.parse(await (await (await root.getFileHandle('.tabboard-reconnect-browser.json')).getFile()).text());
    const savedFile = JSON.parse(await (await (await root.getFileHandle('.tabboard-reconnect-file.json')).getFile()).text());
    expect(savedBrowser.groups).toEqual(browserState.groups);
    expect(savedFile.groups).toEqual(fileState.groups);
  });

  it('browser reconnect preserves exact colliding unread bytes across repeated replacements and leaves other unread originals', async () => {
    const root = createMemoryDirectory('reconnect');
    withPermission(root);
    const browserState = knownState({ mutationRevision: 8 });
    await (await createFileStorageAdapter(root)).setState(browserState);
    const sessions = await root.getDirectoryHandle('sessions');
    const name = `${browserState.groups[0].id}.json`;
    const originals = [[123, 255, 254, 125], [123, 192, 128, 125]];
    await atomicWriteFile(sessions, 'other-unread.json', '{leave-original');
    for (const bytes of originals) {
      await atomicWriteFile(sessions, name, new Uint8Array(bytes));
      resetActiveAdapterForTests();
      chromeMock.storage.local.data[STATE_KEY] = browserState;
      chromeMock.storage.local.data[BOOTSTRAP_KEY] = { mode: 'browser' };
      await getActiveAdapter();
      await reconnectFolder(root, 'browser');
      expect((await (await getActiveAdapter()).getState()).groups).toEqual(browserState.groups);
      expect(JSON.parse(await (await (await sessions.getFileHandle(name)).getFile()).text())).toEqual(browserState.groups[0]);
      expect((await getStorageStatus()).unreadSessionCount).toBe(1);
    }
    const preserved = await root.getDirectoryHandle('.tabboard-unread-before-restore');
    const contents: number[][] = [];
    for await (const [, handle] of preserved.entries()) {
      if (handle.kind === 'file') contents.push([...new Uint8Array(await (await handle.getFile()).arrayBuffer())]);
    }
    expect(contents).toHaveLength(2);
    expect(contents).toEqual(expect.arrayContaining(originals));
    expect(await (await (await sessions.getFileHandle('other-unread.json')).getFile()).text()).toBe('{leave-original');
  });

  it('failed unread-byte preservation aborts browser reconnect before replacing files or transitioning authority', async () => {
    const root = createMemoryDirectory('reconnect');
    withPermission(root);
    const state = knownState();
    await (await createFileStorageAdapter(root)).setState(state);
    const sessions = await root.getDirectoryHandle('sessions');
    const name = `${state.groups[0].id}.json`;
    await atomicWriteFile(sessions, name, '{original');
    const oldMeta = await (await (await root.getFileHandle('meta.json')).getFile()).text();
    const preserved = await root.getDirectoryHandle('.tabboard-unread-before-restore', { create: true });
    vi.spyOn(preserved, 'getFileHandle').mockRejectedValue(new Error('byte backup failed'));
    chromeMock.storage.local.data[STATE_KEY] = state;
    chromeMock.storage.local.data[BOOTSTRAP_KEY] = { mode: 'browser' };
    const authority = await getActiveAdapter();
    const beforeProjection = chromeMock.storage.local.data[SETTINGS_PROJECTION_KEY];
    const beforePing = chromeMock.storage.local.data[FILE_PING_KEY];
    await expect(reconnectFolder(root, 'browser')).rejects.toThrow('byte backup failed');
    expect(await (await (await sessions.getFileHandle(name)).getFile()).text()).toBe('{original');
    expect(await (await (await root.getFileHandle('meta.json')).getFile()).text()).toBe(oldMeta);
    expect(await getActiveAdapter()).toBe(authority);
    expect(await isFileModeActive()).toBe(false);
    expect(chromeMock.storage.local.data[BOOTSTRAP_KEY]).toEqual({ mode: 'browser' });
    expect(chromeMock.storage.local.data[SETTINGS_PROJECTION_KEY]).toEqual(beforeProjection);
    expect(chromeMock.storage.local.data[FILE_PING_KEY]).toEqual(beforePing);
    const { loadRootHandle } = await import('./fsDirectory');
    expect(await loadRootHandle(idbFactory)).toBeNull();
  });

  it.each(['browser', 'file'] as const)('publishes the chosen %s settings with status and ping only after reconnect preparation', async (choice) => {
    const root = createMemoryDirectory('reconnect');
    withPermission(root);
    const original = knownState();
    const fileState = normalizeState({ ...original, settings: { ...original.settings, theme: 'dark' } });
    await (await createFileStorageAdapter(root)).setState(fileState);
    const browserState = normalizeState({ ...original, mutationRevision: 8, settings: { ...original.settings, theme: 'light' } });
    chromeMock.storage.local.data[STATE_KEY] = browserState;
    chromeMock.storage.local.data[BOOTSTRAP_KEY] = { mode: 'browser' };
    chromeMock.storage.local.data[SETTINGS_PROJECTION_KEY] = { settings: browserState.settings, mutationRevision: 8, updatedAt: browserState.updatedAt };
    await getActiveAdapter();
    chromeMock.storage.local.set.mockClear();
    await reconnectFolder(root, choice);
    const selected = await (await getActiveAdapter()).getState();
    expect(chromeMock.storage.local.data[SETTINGS_PROJECTION_KEY]).toEqual({
      settings: choice === 'file' ? fileState.settings : browserState.settings,
      mutationRevision: 9, updatedAt: selected.updatedAt,
    });
    const transition = chromeMock.storage.local.set.mock.calls.find(([items]) => items[BOOTSTRAP_KEY]);
    expect(transition?.[0]).toMatchObject({
      [SETTINGS_PROJECTION_KEY]: { mutationRevision: 9 },
      [FILE_PING_KEY]: { mutationRevision: 9 },
      [BOOTSTRAP_KEY]: { activeBackend: 'file' },
    });
    expect(chromeMock.storage.local.set).toHaveBeenCalledTimes(1);
  });

  it('direct commits through the reconnected authority publish later settings, status and revision', async () => {
    const root = createMemoryDirectory('reconnect');
    withPermission(root);
    const state = knownState();
    await (await createFileStorageAdapter(root)).setState(state);
    chromeMock.storage.local.data[STATE_KEY] = state;
    chromeMock.storage.local.data[BOOTSTRAP_KEY] = { mode: 'browser' };
    await reconnectFolder(root);
    const authority = await getActiveAdapter();
    const next = normalizeState({ ...state, mutationRevision: 15, updatedAt: '2026-11-13T01:00:00.000Z', settings: { ...state.settings, theme: 'dark' } });
    await authority.setState(next);
    expect(chromeMock.storage.local.data[SETTINGS_PROJECTION_KEY]).toEqual({ settings: next.settings, mutationRevision: 15, updatedAt: next.updatedAt });
    expect(chromeMock.storage.local.data[FILE_PING_KEY]).toEqual({ mutationRevision: 15, updatedAt: next.updatedAt });
    expect(await getStorageStatus()).toMatchObject({ activeBackend: 'file', fileUpdatedAt: next.updatedAt });
  });

  it('preserves unreadSessionCount when reconnecting a still-unread folder', async () => {
    const root = createMemoryDirectory('reconnect');
    withPermission(root);
    const originalState = knownState();
    await (await createFileStorageAdapter(root)).setState(originalState);
    const sessionsDir = await root.getDirectoryHandle('sessions');
    const unreadFileName = `${originalState.groups[0].id}.json`;
    await atomicWriteFile(sessionsDir, unreadFileName, '{broken');

    const unreadAdapter = await createFileStorageAdapter(root);
    const unreadState = await unreadAdapter.getState();
    expect(unreadAdapter.getUnreadSessionCount()).toBe(1);

    chromeMock.storage.local.data[STATE_KEY] = unreadState;
    chromeMock.storage.local.data[BOOTSTRAP_KEY] = {
      configuredTarget: 'file',
      activeBackend: 'browser',
      folderName: 'reconnect',
      fallbackReason: 'Permission was denied.',
      fileUpdatedAt: originalState.updatedAt,
      unreadSessionCount: 1,
    };

    await getActiveAdapter();
    await reconnectFolder(root);

    expect(await isFileModeActive()).toBe(true);
    expect(await getStorageStatus()).toEqual({
      configuredTarget: 'file',
      activeBackend: 'file',
      folderName: 'reconnect',
      fallbackReason: null,
      fileUpdatedAt: originalState.updatedAt,
      unreadSessionCount: 1,
    });
    await atomicWriteFile(sessionsDir, unreadFileName, JSON.stringify(originalState.groups[0]));
    await reloadFileState();
    expect((await getStorageStatus()).unreadSessionCount).toBeUndefined();
    expect((await (await getActiveAdapter()).getState()).groups).toEqual(originalState.groups);
  });

  it('does not automatically recover a worker fallback when browser data has diverged', async () => {
    const root = createMemoryDirectory('reconnect');
    withPermission(root);
    const fileState = knownState();
    await (await createFileStorageAdapter(root)).setState(fileState);
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);
    const browserState = normalizeState({ ...fileState, mutationRevision: 8, groups: [] });
    chromeMock.storage.local.data[STATE_KEY] = browserState;
    chromeMock.storage.local.data[BOOTSTRAP_KEY] = {
      configuredTarget: 'file', activeBackend: 'browser', folderName: 'reconnect',
      fallbackReason: 'File storage error: document is not defined', fileUpdatedAt: fileState.updatedAt,
    };
    const authority = await getActiveAdapter();

    expect(await isFileModeActive()).toBe(false);
    expect((await authority.getState()).groups).toEqual([]);
  });

  it('failed reconnect validation leaves browser authority and bootstrap unchanged', async () => {
    const authority = await getActiveAdapter();
    const root = createMemoryDirectory('denied');
    withPermission(root, 'denied');

    await expect(reconnectFolder(root)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });

    expect(chromeMock.storage.local.data[BOOTSTRAP_KEY]).toBeUndefined();
    expect(await isFileModeActive()).toBe(false);
    expect(await getActiveAdapter()).toBe(authority);
    const { loadRootHandle } = await import('./fsDirectory');
    expect(await loadRootHandle(idbFactory)).toBeNull();
  });

  it('reconnect restores the previous handle when bootstrap commit fails', async () => {
    const previousRoot = createMemoryDirectory('previous-root');
    withPermission(previousRoot);
    const nextRoot = createMemoryDirectory('next-root');
    withPermission(nextRoot);
    const { loadRootHandle, saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(previousRoot, idbFactory);
    const state = knownState();
    await (await createFileStorageAdapter(nextRoot)).setState(state);
    chromeMock.storage.local.data[STATE_KEY] = state;
    chromeMock.storage.local.data[BOOTSTRAP_KEY] = { mode: 'browser' };
    const authority = await getActiveAdapter();
    const previousProjection = chromeMock.storage.local.data[SETTINGS_PROJECTION_KEY];
    const previousPing = chromeMock.storage.local.data[FILE_PING_KEY];
    chromeMock.storage.local.set.mockImplementationOnce(async () => {
      throw new Error('bootstrap write failed');
    });

    await expect(reconnectFolder(nextRoot)).rejects.toThrow('bootstrap write failed');

    expect(await loadRootHandle(idbFactory)).toBe(previousRoot);
    expect(chromeMock.storage.local.data[BOOTSTRAP_KEY]).toEqual({ mode: 'browser' });
    expect(chromeMock.storage.local.data[SETTINGS_PROJECTION_KEY]).toEqual(previousProjection);
    expect(chromeMock.storage.local.data[FILE_PING_KEY]).toEqual(previousPing);
    expect(await getActiveAdapter()).toBe(authority);
    expect(await isFileModeActive()).toBe(false);
  });

  it('file mode init with permission denied falls back to chrome', async () => {
    await writeBootstrap('file', chromeMock);
    const root = createMemoryDirectory('root');
    withPermission(root, 'denied');
    const { saveRootHandle } = await import('./fsDirectory');
    await saveRootHandle(root, idbFactory);

    const fallbackCb = vi.fn();
    const unsub = onFallback(fallbackCb);

    const adapter = await getActiveAdapter();
    expect(await isFileModeActive()).toBe(false);
    expect(fallbackCb).toHaveBeenCalledTimes(1);
    expect(fallbackCb.mock.calls[0][0]).toMatch(/[Pp]ermission/);

    // Should be a working chrome adapter
    await adapter.setState(knownState({ mutationRevision: 2 }));
    expect((await adapter.getState()).mutationRevision).toBe(2);
    unsub();
  });

  it('resetActiveAdapterForTests clears the singleton so next getActiveAdapter re-inits', async () => {
    const a1 = await getActiveAdapter();
    resetActiveAdapterForTests();
    const a2 = await getActiveAdapter();
    expect(a2).not.toBe(a1);
  });
});
