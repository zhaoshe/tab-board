import { beforeEach } from 'vitest';

function createTestStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(String(key)) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(String(key));
    },
    setItem(key: string, value: string) {
      values.set(String(key), String(value));
    },
  };
}

const local = createTestStorage();
const session = createTestStorage();
const targets = typeof window === 'undefined' || window === globalThis
  ? [globalThis]
  : [globalThis, window];

for (const target of targets) {
  Object.defineProperties(target, {
    localStorage: {
      configurable: true,
      value: local,
    },
    sessionStorage: {
      configurable: true,
      value: session,
    },
  });
}

beforeEach(() => {
  local.clear();
  session.clear();
});
