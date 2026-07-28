import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIAGNOSTICS_KEY,
  DIAGNOSTICS_LIMIT,
  clearDiagnostics,
  enableDiagnosticsPersistence,
  formatDiagnostics,
  logBreadcrumb,
  logError,
  logWarning,
  readDiagnostics,
  serializeDetail,
  type DiagnosticEntry,
} from './diagnostics';

function stubChromeStorage() {
  const store: Record<string, unknown> = {};
  const local = {
    get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    }),
    remove: vi.fn(async (key: string) => {
      delete store[key];
    }),
  };
  vi.stubGlobal('chrome', { storage: { local } });
  return { store, local };
}

beforeEach(() => {
  vi.useFakeTimers();
  enableDiagnosticsPersistence(true);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  enableDiagnosticsPersistence(false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('diagnostics ring buffer', () => {
  it('persists breadcrumbs and errors to a dedicated storage key', async () => {
    const { store } = stubChromeStorage();

    logBreadcrumb('hydration', 'started');
    logError('manager', 'boom', new Error('kaboom'));
    await vi.runAllTimersAsync();
    await readDiagnostics(); // flush the serialized write chain

    const entries = store[DIAGNOSTICS_KEY] as DiagnosticEntry[];
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ level: 'info', scope: 'hydration', message: 'started' });
    expect(entries[1]).toMatchObject({ level: 'error', scope: 'manager', message: 'boom' });
    expect(entries[1].detail).toContain('kaboom');
  });

  it('uses a storage key independent of tabboardState', () => {
    expect(DIAGNOSTICS_KEY).toBe('tabboardDiagnostics');
    expect(DIAGNOSTICS_KEY).not.toBe('tabboardState');
  });

  it('bounds the buffer to the ring limit', async () => {
    const { store } = stubChromeStorage();

    for (let i = 0; i < DIAGNOSTICS_LIMIT + 25; i += 1) {
      logBreadcrumb('loop', `entry ${i}`);
    }
    await vi.advanceTimersByTimeAsync(250);
    await readDiagnostics();

    const entries = store[DIAGNOSTICS_KEY] as DiagnosticEntry[];
    expect(entries).toHaveLength(DIAGNOSTICS_LIMIT);
    // Oldest entries are dropped; the newest is retained.
    expect(entries[entries.length - 1].message).toBe(`entry ${DIAGNOSTICS_LIMIT + 24}`);
  });

  it('never throws when chrome storage is unavailable', async () => {
    vi.stubGlobal('chrome', undefined);
    expect(() => logError('scope', 'no chrome here')).not.toThrow();
    await expect(readDiagnostics()).resolves.toEqual([]);
  });

  it('clears diagnostics on request', async () => {
    const { store } = stubChromeStorage();
    logBreadcrumb('scope', 'one');
    await vi.advanceTimersByTimeAsync(250);
    await readDiagnostics();
    expect(store[DIAGNOSTICS_KEY]).toBeDefined();

    await clearDiagnostics();
    expect(store[DIAGNOSTICS_KEY]).toBeUndefined();
  });

  it('batches an info breadcrumb burst into one storage read and write', async () => {
    const { local } = stubChromeStorage();

    for (let index = 0; index < 25; index += 1) {
      logBreadcrumb('startup', `entry ${index}`);
    }
    expect(local.get).not.toHaveBeenCalled();
    expect(local.set).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(249);
    expect(local.get).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(local.get).toHaveBeenCalledTimes(1);
    expect(local.set).toHaveBeenCalledTimes(1);
  });

  it('flushes warning and error entries without waiting for the info timer', async () => {
    const { local } = stubChromeStorage();

    logWarning('startup', 'warning');
    logError('startup', 'error');
    await Promise.resolve();
    await Promise.resolve();

    expect(local.get).toHaveBeenCalledTimes(1);
    expect(local.set).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('serializes errors, strings, and objects into readable detail', () => {
    expect(serializeDetail(undefined)).toBeUndefined();
    expect(serializeDetail('plain')).toBe('plain');
    expect(serializeDetail(new Error('oops'))).toContain('oops');
    expect(serializeDetail({ a: 1 })).toBe('{"a":1}');
  });

  it('formats entries into a copyable report', () => {
    const text = formatDiagnostics([
      { ts: '2026-07-21T00:00:00.000Z', level: 'error', scope: 'manager', message: 'crash', detail: 'line1\nline2' },
    ]);
    expect(text).toContain('[ERROR] manager: crash');
    expect(text).toContain('line1');
    expect(formatDiagnostics([])).toBe('No diagnostics recorded.');
  });
});
