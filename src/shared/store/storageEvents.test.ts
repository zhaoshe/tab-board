import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILE_PING_KEY, STORAGE_FALLBACK_KEY } from '../model/constants';
import {
  subscribeFilePing,
  subscribeStorageFallback,
  writeFilePing,
  writeStorageFallback,
} from './storageEvents';

type StorageChange = { newValue?: unknown; oldValue?: unknown };
type StorageChangedListener = (
  changes: Record<string, StorageChange>,
  area: string,
) => void;

function makeChromeMock() {
  const data: Record<string, unknown> = {};
  const listeners = new Set<StorageChangedListener>();
  return {
    storage: {
      local: {
        data,
        set: vi.fn(async (items: Record<string, unknown>) => {
          const changes: Record<string, StorageChange> = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: data[key], newValue: value };
            data[key] = value;
          }
          listeners.forEach((listener) => listener(changes, 'local'));
        }),
      },
      onChanged: {
        addListener: vi.fn((listener: StorageChangedListener) => listeners.add(listener)),
        removeListener: vi.fn((listener: StorageChangedListener) => listeners.delete(listener)),
        fire(changes: Record<string, StorageChange>, area = 'local') {
          listeners.forEach((listener) => listener(changes, area));
        },
      },
    },
  };
}

describe('storage event transport', () => {
  let chromeMock: ReturnType<typeof makeChromeMock>;

  beforeEach(() => {
    chromeMock = makeChromeMock();
    vi.stubGlobal('chrome', chromeMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publishes and subscribes to canonical file commit pings', async () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeFilePing((ping) => received.push(ping));

    await writeFilePing(7, '2026-07-26T10:00:00.000Z');

    expect(chromeMock.storage.local.data[FILE_PING_KEY]).toEqual({
      mutationRevision: 7,
      updatedAt: '2026-07-26T10:00:00.000Z',
    });
    expect(received).toEqual([{
      mutationRevision: 7,
      updatedAt: '2026-07-26T10:00:00.000Z',
    }]);

    unsubscribe();
    await writeFilePing(8, '2026-07-26T10:01:00.000Z');
    expect(received).toHaveLength(1);
  });

  it('publishes canonical fallback events and ignores malformed or non-local changes', async () => {
    const received: unknown[] = [];
    subscribeStorageFallback((event) => received.push(event));

    chromeMock.storage.onChanged.fire({
      [STORAGE_FALLBACK_KEY]: {
        newValue: {
          eventId: '',
          reason: 'missing event id',
          occurredAt: '2026-07-26T10:00:00.000Z',
        },
      },
    });
    chromeMock.storage.onChanged.fire({
      [STORAGE_FALLBACK_KEY]: {
        newValue: {
          eventId: 'remote-ignored',
          reason: 'wrong storage area',
          occurredAt: '2026-07-26T10:00:00.000Z',
        },
      },
    }, 'sync');

    await writeStorageFallback({
      eventId: 'fallback-1',
      reason: 'Folder unavailable',
      occurredAt: '2026-07-26T10:01:00.000Z',
    });

    expect(chromeMock.storage.local.data[STORAGE_FALLBACK_KEY]).toEqual({
      eventId: 'fallback-1',
      reason: 'Folder unavailable',
      occurredAt: '2026-07-26T10:01:00.000Z',
    });
    expect(received).toEqual([{
      eventId: 'fallback-1',
      reason: 'Folder unavailable',
      occurredAt: '2026-07-26T10:01:00.000Z',
    }]);
  });
});
