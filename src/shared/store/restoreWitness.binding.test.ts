import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyState, normalizeState } from '../model';
import { BOOTSTRAP_KEY } from '../model/constants';
import { createMemoryDirectory } from '../testing/memoryFs';
import { restoreMemoryIdb } from '../testing/restoreMemoryIdb';
import { restoreWorkerHarness } from '../testing/restoreWorkerHarness';
import type { RestoreRequest } from './restoreCommit';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });
async function fixture() {
  vi.resetModules();
  const old = normalizeState({ ...createEmptyState(), mutationRevision: 7 });
  const harness = await restoreWorkerHarness(old);
  const idb = restoreMemoryIdb(); vi.stubGlobal('indexedDB', idb.factory);
  const authority = await import('./activeAdapter');
  const rootA = createMemoryDirectory('same-name'); const rootB = createMemoryDirectory('same-name');
  await authority.switchToFileMode(rootA, old);
  const bound = await authority.getActiveRestoreSnapshot();
  const request: RestoreRequest = { requestId: crypto.randomUUID(), origin: bound.metadata.origin, mutations: [{ type: 'restore-backup', backup: old, expectedRevision: 7, updatedAt: '2026-11-16T00:00:00.000Z' }], restoreAttempts: [{ originalIndex: 0, attemptId: crypto.randomUUID() }] };
  return { old, harness, idb, authority, rootA, rootB, bound, request };
}

it('same-named File A to B to A and explicit same-folder reconnect reject the unknown old preview', async () => {
  const { old, harness, authority, rootA, rootB, request } = await fixture();
  await authority.switchToFileMode(rootB, old);
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request })).toMatchObject({ ok: false, code: 'RESTORE_ORIGIN_CHANGED' });
  await authority.switchToFileMode(rootA, old);
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request })).toMatchObject({ ok: false, code: 'RESTORE_ORIGIN_CHANGED' });
  const origin = (await authority.getActiveRestoreSnapshot()).metadata.origin;
  await authority.reconnectFolder(rootA);
  expect((await authority.getActiveRestoreSnapshot()).metadata.origin.scopeId).not.toBe(origin.scopeId);
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request })).toMatchObject({ ok: false, code: 'RESTORE_ORIGIN_CHANGED' });
});

it('File receipt survives a worker restart and ordinary reread without doing live Chrome verification', async () => {
  const { harness, request, authority, bound } = await fixture();
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request })).toMatchObject({ ok: true });
  await authority.reloadFileState();
  await harness.restart();
  const active = await import('./activeAdapter');
  expect((await active.getActiveRestoreSnapshot()).metadata.origin).toEqual(bound.metadata.origin);
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request })).toMatchObject({ ok: true, result: { confirmedByReceipt: true, state: { mutationRevision: 8 } } });
});

it('mid-selection binding disagreement survives restart and blocks unknown Restore rather than manufacturing a scope', async () => {
  const { harness, request } = await fixture();
  const status = harness.data[BOOTSTRAP_KEY] as Record<string, unknown>;
  harness.data[BOOTSTRAP_KEY] = { ...status, activeOrigin: { mode: 'file', scopeId: 'interrupted-other-binding' } };
  await harness.restart();
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request })).toMatchObject({ ok: false, code: 'RESTORE_ORIGIN_CHANGED' });
});

it('IDB preserves the native handle key and only resolves binding publication after transaction completion', async () => {
  vi.resetModules();
  const idb = restoreMemoryIdb(); vi.stubGlobal('indexedDB', idb.factory);
  const { saveRootHandle, loadRootHandle, loadRootBinding } = await import('./fsDirectory');
  const handle = createMemoryDirectory('native');
  const origin = { mode: 'file' as const, scopeId: 'selected-scope' };
  idb.holdNextWrite(); let finished = false;
  const write = saveRootHandle(handle, undefined, origin).then(() => { finished = true; });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(finished).toBe(false);
  expect(await loadRootHandle()).toBeNull();
  idb.completeWrite(); await write;
  expect(await loadRootHandle()).toBe(handle);
  expect(await loadRootBinding()).toEqual({ handle, origin });
  idb.abortNextWrite();
  await expect(saveRootHandle(createMemoryDirectory('rejected'), undefined, { ...origin, scopeId: 'candidate' })).rejects.toThrow('aborted');
  expect(await loadRootHandle()).toBe(handle);
  expect((await loadRootBinding())?.origin).toEqual(origin);
});

it('initialization fallback starts a new browser origin rather than reviving an earlier unknown request', async () => {
  vi.resetModules();
  const old = normalizeState({ ...createEmptyState(), mutationRevision: 7 });
  const harness = await restoreWorkerHarness(old);
  const { getActiveRestoreSnapshot } = await import('./activeAdapter');
  const snapshot = await getActiveRestoreSnapshot();
  const request = { requestId: crypto.randomUUID(), origin: snapshot.metadata.origin, mutations: [{ type: 'restore-backup', backup: old, expectedRevision: 7, updatedAt: '2026-11-16T00:00:00.000Z' }], restoreAttempts: [{ originalIndex: 0, attemptId: crypto.randomUUID() }] };
  const idb = restoreMemoryIdb(); vi.stubGlobal('indexedDB', idb.factory);
  harness.data[BOOTSTRAP_KEY] = { configuredTarget: 'file', activeBackend: 'file', folderName: 'unavailable', fallbackReason: null, fileUpdatedAt: null, activeOrigin: { mode: 'file', scopeId: 'interrupted-file' } };
  await harness.restart();
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request })).toMatchObject({ ok: false, code: 'RESTORE_ORIGIN_CHANGED' });
});

it('failed File selection rolls back native handle association and leaves the old bound origin usable', async () => {
  const { old, harness, authority, rootA, rootB, bound, request, idb } = await fixture();
  idb.abortNextWrite();
  await expect(authority.switchToFileMode(rootB, old)).rejects.toThrow('aborted');
  const { loadRootHandle, loadRootBinding } = await import('./fsDirectory');
  expect(await loadRootHandle()).toBe(rootA);
  expect((await loadRootBinding())?.origin).toEqual(bound.metadata.origin);
  expect((await authority.getActiveRestoreSnapshot()).metadata.origin).toEqual(bound.metadata.origin);
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request })).toMatchObject({ ok: true });
});

it('failed bootstrap publication restores the prior handle association and candidate metadata before releasing selection', async () => {
  const { old, harness, authority, rootA, rootB, bound } = await fixture();
  const set = harness.chromeMock.storage.local.set;
  vi.spyOn(harness.chromeMock.storage.local, 'set').mockImplementation(async items => {
    if (BOOTSTRAP_KEY in items) throw new Error('selection status failed');
    return set(items);
  });
  await expect(authority.switchToFileMode(rootB, old)).rejects.toThrow('selection status failed');
  vi.restoreAllMocks();
  const { loadRootHandle, loadRootBinding } = await import('./fsDirectory');
  const { initFileStorageDirectory } = await import('./fileStorage');
  expect(await loadRootHandle()).toBe(rootA);
  expect((await loadRootBinding())?.origin).toEqual(bound.metadata.origin);
  expect((await initFileStorageDirectory(rootB)).restoreMetadata).toBeUndefined();
  expect((await authority.getActiveRestoreSnapshot()).metadata.origin).toEqual(bound.metadata.origin);
});

it('returning to a previously committed File source confirms its old receipt with fresh origin and current state', async () => {
  const { old, harness, authority, rootA, rootB, request } = await fixture();
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request })).toMatchObject({ ok: true });
  await authority.switchToFileMode(rootB, old);
  await authority.switchToFileMode(rootA, old);
  const current = await authority.getActiveRestoreSnapshot();
  const { readTextFile } = await import('./fsAtomic');
  const before = await readTextFile(await rootA.getFileHandle('meta.json'));
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request })).toMatchObject({ ok: true, result: { confirmedByReceipt: true, origin: current.metadata.origin, state: { mutationRevision: 7 } } });
  expect(await readTextFile(await rootA.getFileHandle('meta.json'))).toBe(before);
});

it('a half-registered File handle/status association cannot be silently relabeled for Restore', async () => {
  const { rootA, request, harness } = await fixture();
  const { saveRootHandle } = await import('./fsDirectory');
  await saveRootHandle(rootA); // Legacy key remains readable; the association is absent.
  const status = structuredClone(harness.data[BOOTSTRAP_KEY]);
  await harness.restart();
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request })).toMatchObject({ ok: false, code: 'RESTORE_ORIGIN_UNAVAILABLE' });
  expect(harness.data[BOOTSTRAP_KEY]).toEqual(status);
});

it('interrupted legacy File registration fails closed across restart without manufacturing a replacement scope', async () => {
  const { old, harness, authority, rootA } = await fixture();
  const { saveRootHandle } = await import('./fsDirectory');
  const { atomicWriteFile, readTextFile } = await import('./fsAtomic');
  const { initFileStorageDirectory } = await import('./fileStorage');
  const meta = JSON.parse(await readTextFile(await rootA.getFileHandle('meta.json'))); delete meta.restoreMetadata;
  await atomicWriteFile(rootA, 'meta.json', JSON.stringify(meta));
  await saveRootHandle(rootA);
  const status = harness.data[BOOTSTRAP_KEY] as Record<string, unknown>;
  harness.data[BOOTSTRAP_KEY] = { ...status, activeOrigin: undefined };
  authority.resetActiveAdapter();
  const set = harness.chromeMock.storage.local.set;
  vi.spyOn(harness.chromeMock.storage.local, 'set').mockImplementation(async items => {
    if ((items[BOOTSTRAP_KEY] as { activeOrigin?: unknown } | undefined)?.activeOrigin) throw new Error('legacy status failed');
    return set(items);
  });
  await expect(authority.getActiveRestoreSnapshot()).rejects.toThrow('legacy status failed');
  vi.restoreAllMocks();
  const registered = (await initFileStorageDirectory(rootA)).restoreMetadata!;
  const request: RestoreRequest = { requestId: crypto.randomUUID(), origin: registered.origin, mutations: [{ type: 'restore-backup', backup: old, expectedRevision: 7, updatedAt: old.updatedAt }], restoreAttempts: [{ originalIndex: 0, attemptId: crypto.randomUUID() }] };
  await harness.restart();
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request })).toMatchObject({ ok: false, code: 'RESTORE_ORIGIN_CHANGED' });
  expect((await initFileStorageDirectory(rootA)).restoreMetadata?.origin).toEqual(registered.origin);
});
