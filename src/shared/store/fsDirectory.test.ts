import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryDirectory } from '../testing/memoryFs';
import type { MemoryDirectoryHandle } from '../testing/memoryFs';
import {
  saveRootHandle,
  loadRootHandle,
  clearRootHandle,
  IDB_UNAVAILABLE,
} from './fsDirectory';
import type { IdbFactory } from './fsDirectory';

// ---------- minimal in-memory IDB stub ----------
//
// Implements just enough of the IDB surface used by fsDirectory.ts —
// open/upgradeneeded/success/error, transaction with readwrite/readonly,
// and get/put/delete on a single object store. Storage is a
// Map<storeName, Map<key, value>> and persists across open() calls for
// the same factory instance, matching real IndexedDB behavior.

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
  private closed = false;

  _reset(): void {
    this.stores.clear();
    this.closed = false;
  }

  open(_name: string, _version: number): FakeOpenReq {
    // Build a FakeDb tied to this.stores.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
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
      close() {
        factory.closed = true;
      },
    };

    const openReq: FakeOpenReq = {
      result: db,
      error: null,
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
    };

    queueMicrotask(() => {
      // Always fire upgradeneeded the first time (store missing); subsequently
      // only if version bumped. Since our stub resets between tests, first
      // open per factory always triggers upgrade.
      const needsUpgrade = !factory.stores.has('handlers');
      if (needsUpgrade && openReq.onupgradeneeded) {
        openReq.onupgradeneeded(new Event('upgradeneeded'));
      }
      if (openReq.onsuccess) openReq.onsuccess(new Event('success'));
    });

    return openReq;
  }
}

function makeFactory(): IdbFactory {
  const factory = new FakeIDBFactoryInstance();
  // idbFactory is a thunk returning an IDBFactory-like object (matching
  // the production default `() => window.indexedDB`).
  const thunk = (() => factory) as unknown as IdbFactory;
  return thunk;
}

// ---------- tests ----------

describe('fsDirectory (IndexedDB handle persistence)', () => {
  let idbFactory: IdbFactory;
  let dir: MemoryDirectoryHandle;

  beforeEach(() => {
    idbFactory = makeFactory();
    dir = createMemoryDirectory('root');
  });

  it('save then load round-trips the handle', async () => {
    await saveRootHandle(dir, idbFactory);
    const loaded = await loadRootHandle(idbFactory);
    expect(loaded).not.toBeNull();
    expect(loaded).toBe(dir);
  });

  it('load returns null when nothing has been saved', async () => {
    const loaded = await loadRootHandle(idbFactory);
    expect(loaded).toBeNull();
  });

  it('clear removes the saved handle so load returns null', async () => {
    await saveRootHandle(dir, idbFactory);
    await clearRootHandle(idbFactory);
    const loaded = await loadRootHandle(idbFactory);
    expect(loaded).toBeNull();
  });

  it('save overwrites a previously stored handle', async () => {
    const dir2 = createMemoryDirectory('root2');
    await saveRootHandle(dir, idbFactory);
    await saveRootHandle(dir2, idbFactory);
    const loaded = await loadRootHandle(idbFactory);
    expect(loaded).toBe(dir2);
    expect(loaded).not.toBe(dir);
  });

  it('clear without a prior save is a no-op', async () => {
    await expect(clearRootHandle(idbFactory)).resolves.toBeUndefined();
  });

  it('successive opens against the same factory share state', async () => {
    await saveRootHandle(dir, idbFactory);
    const loaded = await loadRootHandle(idbFactory);
    expect(loaded).toBe(dir);
  });

  it('rejects with IDB_UNAVAILABLE when indexedDB is not present', async () => {
    const noIdbFactory: IdbFactory = () => null;
    await expect(saveRootHandle(dir, noIdbFactory)).rejects.toBe(IDB_UNAVAILABLE);
    await expect(loadRootHandle(noIdbFactory)).rejects.toBe(IDB_UNAVAILABLE);
    await expect(clearRootHandle(noIdbFactory)).rejects.toBe(IDB_UNAVAILABLE);
  });
});
