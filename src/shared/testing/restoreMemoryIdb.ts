// Transactional external IDB double: writes become visible only at completion.
export function restoreMemoryIdb() {
  const rows = new Map<IDBValidKey, unknown>();
  let hold = false;
  let abort = false;
  let release: (() => void) | undefined;
  const factory = {
    open: () => {
      const db = {
        objectStoreNames: { contains: () => true }, close: () => undefined,
        transaction: (_name: string, mode: string) => {
          const pending = new Map(rows);
          const tx = { oncomplete: null, onerror: null, onabort: null, error: null } as unknown as IDBTransaction;
          const request = (value: unknown) => {
            const req = { result: value, error: null, onsuccess: null, onerror: null } as unknown as IDBRequest;
            queueMicrotask(() => req.onsuccess?.(new Event('success')));
            return req;
          };
          tx.objectStore = () => ({
            get: (key: IDBValidKey) => request(pending.get(key)),
            put: (value: unknown, key: IDBValidKey) => { pending.set(key, value); return request(key); },
            delete: (key: IDBValidKey) => { pending.delete(key); return request(undefined); },
          }) as unknown as IDBObjectStore;
          const finish = () => {
            if (mode === 'readwrite' && abort) { abort = false; tx.onabort?.(new Event('abort')); return; }
            if (mode === 'readwrite') { rows.clear(); pending.forEach((v, k) => rows.set(k, v)); }
            tx.oncomplete?.(new Event('complete'));
          };
          queueMicrotask(() => queueMicrotask(() => {
            if (mode === 'readwrite' && hold) { hold = false; release = finish; }
            else finish();
          }));
          return tx;
        },
      };
      const req = { result: db, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => (req.onsuccess as ((event: Event) => unknown) | null)?.(new Event('success')));
      return req;
    },
  };
  return { factory, holdNextWrite: () => { hold = true; }, abortNextWrite: () => { abort = true; }, completeWrite: () => release?.() };
}
