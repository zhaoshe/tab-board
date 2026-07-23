import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOTSTRAP_KEY, FILE_PING_KEY, STATE_KEY } from '../model/constants';
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
  getActiveAdapter,
  isFileModeActive,
  onFallback,
  resetActiveAdapterForTests,
  switchToBrowserMode,
  switchToFileMode,
} from './activeAdapter';
import type { IdbFactory } from './fsDirectory';
import { createFileStorageAdapter } from './fileStorage';

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
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
    onChanged: {
      _listeners: Set<StorageChangedListener>;
      addListener: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
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
    vi.unstubAllGlobals();
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

  it('switchToFileMode persists handle, writes bootstrap, and seeds initial state', async () => {
    // Start in default (browser) mode with no bootstrap key.
    const root = createMemoryDirectory('root');
    withPermission(root);
    const initialState = knownState({ mutationRevision: 99 });

    await switchToFileMode(root, initialState);

    // Bootstrap is now 'file'
    expect(chromeMock.storage.local.data[BOOTSTRAP_KEY]).toEqual({ mode: 'file' });

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
    expect(chromeMock.storage.local.data[BOOTSTRAP_KEY]).toEqual({ mode: 'browser' });
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
