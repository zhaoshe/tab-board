/**
 * Persistence for the user-chosen root FileSystemDirectoryHandle in IndexedDB.
 *
 * FileSystemDirectoryHandle is structured-cloneable and is the object that
 * grants the extension ongoing read/write access to a folder the user picked
 * via window.showDirectoryPicker(). We keep a single copy under a fixed
 * key in a dedicated DB so it survives extension reloads and can be cleared
 * when the user disables file-storage mode.
 *
 * The module exposes an injectable idbFactory parameter so unit tests can
 * substitute an in-memory stub without pulling in fake-indexeddb.
 */

import {
  FILE_STORE_DB,
  FILE_STORE_STORE,
  FILE_STORE_HANDLE_KEY,
} from '../model/constants';

/** Sentinel Error thrown when IndexedDB is not available in the current environment. */
export const IDB_UNAVAILABLE: Error = new Error('IndexedDB is not available in this environment');

/**
 * Factory type. Accepts either the real IDBFactory or a test double that
 * exposes an open(name, version) method returning a request-shaped object.
 * We deliberately type the return of open() structurally to keep the bar
 * low for test doubles; only the open/onsuccess/onupgradeneeded/onerror
 * surface is required.
 */
export type IdbFactory = () => {
  open(name: string, version: number): {
    result: IDBDatabase;
    error: DOMException | null;
    onupgradeneeded: ((ev: Event) => unknown) | null;
    onsuccess: ((ev: Event) => unknown) | null;
    onerror: ((ev: Event) => unknown) | null;
  };
} | undefined | null;

function defaultIdbFactory(): IDBFactory | undefined {
  // Defensive fallbacks so SSR / old environments do not throw on import.
  const g = globalThis as { indexedDB?: IDBFactory; webkitIndexedDB?: IDBFactory };
  return g.indexedDB ?? g.webkitIndexedDB;
}

function openDb(idbFactory: IdbFactory): Promise<IDBDatabase> {
  const factory = idbFactory();
  if (!factory) {
    return Promise.reject(IDB_UNAVAILABLE);
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = factory.open(FILE_STORE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FILE_STORE_STORE)) {
        db.createObjectStore(FILE_STORE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function runTx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(FILE_STORE_STORE, mode);
    const store = tx.objectStore(FILE_STORE_STORE);
    const req = work(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? req.error ?? new Error('IndexedDB transaction failed'));
  });
}

/**
 * Persist `handle` at the fixed root key. Overwrites any previously stored
 * handle for the same key.
 */
export async function saveRootHandle(
  handle: FileSystemDirectoryHandle,
  idbFactory: IdbFactory = defaultIdbFactory as IdbFactory,
): Promise<void> {
  const db = await openDb(idbFactory);
  try {
    await runTx(db, 'readwrite', (store) => store.put(handle, FILE_STORE_HANDLE_KEY));
  } finally {
    db.close();
  }
}

/**
 * Load the previously-saved root directory handle, or null if none has been
 * stored (or the entry was cleared).
 */
export async function loadRootHandle(
  idbFactory: IdbFactory = defaultIdbFactory as IdbFactory,
): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb(idbFactory);
  try {
    const result = await runTx(db, 'readonly', (store) => store.get(FILE_STORE_HANDLE_KEY));
    return (result as FileSystemDirectoryHandle | undefined) ?? null;
  } finally {
    db.close();
  }
}

/**
 * Delete the persisted root handle. Safe to call even if no handle is stored.
 */
export async function clearRootHandle(
  idbFactory: IdbFactory = defaultIdbFactory as IdbFactory,
): Promise<void> {
  const db = await openDb(idbFactory);
  try {
    await runTx(db, 'readwrite', (store) => store.delete(FILE_STORE_HANDLE_KEY));
  } finally {
    db.close();
  }
}
