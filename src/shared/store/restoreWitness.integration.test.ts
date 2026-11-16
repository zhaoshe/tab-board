import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyState, exportToJson, normalizeState } from '../model';
import { STATE_KEY } from '../model/constants';
import { restoreWorkerHarness } from '../testing/restoreWorkerHarness';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

it('confirms a complete Restore after its real worker commit reply is lost, without replacing the original snapshot', async () => {
  vi.resetModules();
  const old = normalizeState({ ...createEmptyState(), mutationRevision: 7 });
  const restored = normalizeState({ ...old, settings: { ...old.settings, theme: 'dark' } });
  const harness = await restoreWorkerHarness(old);
  const { restoreMemoryIdb } = await import('../testing/restoreMemoryIdb');
  vi.stubGlobal('indexedDB', restoreMemoryIdb().factory);
  const { useTabBoardStore } = await import('./useTabBoardStore');
  await useTabBoardStore.getState().hydrate();
  harness.dropReply();
  const outcome = useTabBoardStore.getState().restoreBackup(exportToJson(restored), await useTabBoardStore.getState().captureRestorePreview()).then(() => 'confirmed', error => error.code);
  await expect(outcome).resolves.toBe('confirmed');
  expect(harness.data[STATE_KEY]).toMatchObject({ mutationRevision: 8, settings: { theme: 'dark' } });
  expect(harness.data.tabboardBackupBeforeRestore).toEqual(old);
  expect(harness.writes.filter(items => STATE_KEY in items)).toHaveLength(1);
  expect(useTabBoardStore.getState()).toMatchObject({ mutationRevision: 8, persistenceError: null });
  useTabBoardStore.getState().releaseHydration();
});

async function browserFixture() {
  vi.resetModules();
  const old = normalizeState({ ...createEmptyState(), mutationRevision: 7 });
  const harness = await restoreWorkerHarness(old);
  const { restoreMemoryIdb } = await import('../testing/restoreMemoryIdb');
  vi.stubGlobal('indexedDB', restoreMemoryIdb().factory);
  const { getActiveRestoreSnapshot } = await import('./activeAdapter');
  const snapshot = await getActiveRestoreSnapshot();
  const backup = normalizeState({ ...old, settings: { ...old.settings, theme: 'dark' } });
  const request = {
    requestId: crypto.randomUUID(), origin: snapshot.metadata.origin,
    mutations: [{ type: 'restore-backup', backup, expectedRevision: 7, updatedAt: '2026-11-16T00:00:00.000Z' }],
    restoreAttempts: [{ originalIndex: 0, attemptId: crypto.randomUUID() }],
  };
  return { old, harness, request };
}

it('a restarted worker confirms the durable receipt and preserves a later ordinary edit and the before snapshot', async () => {
  const { old, harness, request } = await browserFixture();
  harness.dropReply();
  await expect(harness.send({ type: 'tabboard-state-mutations', restoreRequest: request })).rejects.toThrow('reply was lost');
  await harness.send({ type: 'tabboard-state-mutations', mutations: [{ type: 'update-settings', updates: { theme: 'light' }, updatedAt: '2026-11-16T01:00:00.000Z' }] });
  await harness.restart();
  const replay = await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request });
  expect(replay).toMatchObject({ ok: true, result: { confirmedByReceipt: true, state: { mutationRevision: 9, settings: { theme: 'light' } } } });
  expect(harness.data.tabboardBackupBeforeRestore).toEqual(old);
  expect(harness.writes.filter(items => STATE_KEY in items)).toHaveLength(2);
});

it('a different stale attempt and altered payload cannot claim another request receipt', async () => {
  const { harness, request } = await browserFixture();
  await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request });
  const freshAttempt = { ...request, requestId: crypto.randomUUID(), restoreAttempts: [{ originalIndex: 0, attemptId: crypto.randomUUID() }] };
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: freshAttempt })).toMatchObject({ ok: false, code: 'BACKUP_REVISION_CONFLICT' });
  const altered = { ...request, mutations: [{ ...request.mutations[0], expectedRevision: 8 }] };
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: altered })).toMatchObject({ ok: false, code: 'RESTORE_REQUEST_MISMATCH' });
  expect(harness.writes.filter(items => STATE_KEY in items)).toHaveLength(1);
});

it('a real edit before the first restore commit retains strict CAS and produces no receipt or backup', async () => {
  const { harness, request } = await browserFixture();
  await harness.send({ type: 'tabboard-state-mutations', mutations: [{ type: 'update-settings', updates: { theme: 'light' }, updatedAt: '2026-11-16T01:00:00.000Z' }] });
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request })).toMatchObject({ ok: false, code: 'BACKUP_REVISION_CONFLICT' });
  expect(harness.data.tabboardBackupBeforeRestore).toBeUndefined();
  expect(harness.data.tabboardRestoreMetadata).toMatchObject({ receipts: [] });
});

it('an unknown old preview fails on a new browser binding even when revision and content match', async () => {
  const { harness, request } = await browserFixture();
  const { switchToBrowserMode } = await import('./activeAdapter');
  await switchToBrowserMode(false);
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request })).toMatchObject({ ok: false, code: 'RESTORE_ORIGIN_CHANGED' });
  expect(harness.writes.filter(items => STATE_KEY in items)).toHaveLength(0);
});

it('a numeric legacy restore cannot attach the current origin to an uncaptured revision', async () => {
  const { harness, old } = await browserFixture();
  const { useTabBoardStore } = await import('./useTabBoardStore');
  await useTabBoardStore.getState().hydrate();
  await expect(useTabBoardStore.getState().restoreBackup(exportToJson(old), 7)).rejects.toMatchObject({ code: 'RESTORE_PREVIEW_REQUIRED' });
  expect(harness.writes.filter(items => STATE_KEY in items)).toHaveLength(0);
  useTabBoardStore.getState().releaseHydration();
});

it('keeps a mixed ordinary and checked Restore request frozen while later pending edits are sent separately', async () => {
  const { old, harness } = await browserFixture();
  const { useTabBoardStore } = await import('./useTabBoardStore');
  await useTabBoardStore.getState().hydrate();
  useTabBoardStore.getState().updateSettings({ theme: 'light' });
  const preview = await useTabBoardStore.getState().captureRestorePreview();
  expect(preview.expectedRevision).toBe(8);
  const backup = normalizeState({ ...old, settings: { ...old.settings, theme: 'dark' } });
  harness.dropReply(() => useTabBoardStore.getState().updateSettings({ theme: 'light' }));
  let settled = 0;
  await useTabBoardStore.getState().restoreBackup(exportToJson(backup), preview).then(() => { settled++; });
  await vi.waitFor(() => expect(harness.data[STATE_KEY]).toMatchObject({ mutationRevision: 10, settings: { theme: 'light' } }));
  const requests = harness.requests.filter(r => r.type === 'tabboard-state-mutations');
  expect(requests).toHaveLength(3);
  expect(requests[0].restoreRequest).toEqual(requests[1].restoreRequest);
  expect(requests[2].restoreRequest).toBeUndefined();
  expect((requests[2].mutations as unknown[])).toHaveLength(1);
  expect(settled).toBe(1);
  expect(harness.data.tabboardBackupBeforeRestore).toMatchObject({ mutationRevision: 8, settings: { theme: 'light' } });
  expect(harness.writes.filter(items => STATE_KEY in items)).toHaveLength(2);
  useTabBoardStore.getState().releaseHydration();
});

it('historical partial Restore ACK retains raw soft-drop gap indexes and preserves the original before snapshot', async () => {
  const { old, harness, request } = await browserFixture();
  const mixed = {
    ...request,
    mutations: [
      { type: 'update-settings', updates: { theme: 'light' }, updatedAt: '2026-11-16T00:00:00.000Z' },
      { type: 'drop-intent', invalid: true },
      { ...request.mutations[0], expectedRevision: 8 },
      { type: 'update-settings', updates: { theme: 'system' }, updatedAt: '2026-11-16T00:00:00.000Z' },
    ],
    restoreAttempts: [{ originalIndex: 2, attemptId: request.restoreAttempts[0].attemptId }],
  };
  harness.dropReply();
  await expect(harness.send({ type: 'tabboard-state-mutations', restoreRequest: mixed })).rejects.toThrow('reply was lost');
  const before = structuredClone(harness.data.tabboardBackupBeforeRestore);
  await harness.send({ type: 'tabboard-state-mutations', mutations: [{ type: 'update-settings', updates: { theme: 'dark' }, updatedAt: '2026-11-16T01:00:00.000Z' }] });
  await harness.restart();
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: mixed })).toMatchObject({ ok: false, code: 'INVALID_DROP_INTENT', confirmedByReceipt: true, invalidMutationIndexes: [1], committedMutationIndexes: [0, 2, 3], state: { mutationRevision: 11, settings: { theme: 'dark' } } });
  expect(harness.data.tabboardBackupBeforeRestore).toEqual(before);
  expect(before).toMatchObject({ mutationRevision: 8, settings: { theme: 'light' } });
  expect(harness.writes.filter(items => STATE_KEY in items)).toHaveLength(2);
  expect(old.mutationRevision).toBe(7);
});

it('multiple complete Restores commit once and receipt replay preserves the snapshot before the last Restore', async () => {
  const { harness, request } = await browserFixture();
  const mixed = { ...request, mutations: [request.mutations[0], { type: 'update-settings', updates: { theme: 'light' }, updatedAt: '2026-11-16T00:00:00.000Z' }, { ...request.mutations[0], expectedRevision: 9 }], restoreAttempts: [{ originalIndex: 0, attemptId: crypto.randomUUID() }, { originalIndex: 2, attemptId: crypto.randomUUID() }] };
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: mixed })).toMatchObject({ ok: true, result: { state: { mutationRevision: 10 } } });
  const before = structuredClone(harness.data.tabboardBackupBeforeRestore);
  expect(before).toMatchObject({ mutationRevision: 9, settings: { theme: 'light' } });
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: mixed })).toMatchObject({ ok: true, result: { confirmedByReceipt: true } });
  expect(harness.data.tabboardBackupBeforeRestore).toEqual(before);
  expect(harness.writes.filter(items => STATE_KEY in items)).toHaveLength(1);
});

it('a later Restore CAS failure aborts the whole request without attesting its earlier Restore', async () => {
  const { harness, request } = await browserFixture();
  const mixed = { ...request, mutations: [request.mutations[0], { ...request.mutations[0], expectedRevision: 7 }], restoreAttempts: [{ originalIndex: 0, attemptId: crypto.randomUUID() }, { originalIndex: 1, attemptId: crypto.randomUUID() }] };
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: mixed })).toMatchObject({ ok: false, code: 'BACKUP_REVISION_CONFLICT' });
  expect(harness.data.tabboardRestoreMetadata).toMatchObject({ receipts: [] });
  expect(harness.data.tabboardBackupBeforeRestore).toBeUndefined();
  expect(harness.writes.filter(items => STATE_KEY in items)).toHaveLength(0);
});

it('the worker rejects a complete Restore without a captured origin/request instead of blind revision-only execution', async () => {
  const { harness, request } = await browserFixture();
  expect(await harness.send({ type: 'tabboard-state-mutations', mutations: request.mutations })).toMatchObject({ ok: false, code: 'RESTORE_PREVIEW_REQUIRED' });
  expect(harness.writes.filter(items => STATE_KEY in items)).toHaveLength(0);
});

it('a committed Restore request never revalidates live Open Tabs after receipt confirmation', async () => {
  const { harness, request } = await browserFixture();
  harness.chromeMock.windows.get.mockResolvedValue({ id: 1, type: 'normal', incognito: false } as never);
  harness.chromeMock.tabs.get.mockResolvedValue({ id: 1, windowId: 1, index: 0, title: 'Live title', url: 'https://live.test/', pinned: false, incognito: false, groupId: -1 });
  const drop = { type: 'drop-intent', operationId: 'live-restore-sibling', expectedRevision: 7,
    intent: { kind: 'create-session', source: { kind: 'open-tabs', tabIds: [1], windowId: 1 }, category: 'inbox', index: 0, workspaceId: 'workspace_default' }, openTabs: [], updatedAt: '2026-11-16T00:00:00.000Z' };
  const mixed = { ...request, mutations: [drop, { ...request.mutations[0], expectedRevision: 8 }], restoreAttempts: [{ originalIndex: 1, attemptId: crypto.randomUUID() }] };
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: mixed })).toMatchObject({ ok: true });
  harness.chromeMock.tabs.get.mockImplementation(() => { throw new Error('Historical live validation ran'); });
  harness.chromeMock.windows.get.mockImplementation(() => { throw new Error('Historical window validation ran'); });
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: mixed })).toMatchObject({ ok: true, result: { confirmedByReceipt: true } });
  expect(harness.data.tabboardBackupBeforeRestore).toMatchObject({ mutationRevision: 8, groups: [{ tabs: [{ title: 'Live title', url: 'https://live.test/' }] }] });
  expect(harness.writes.filter(items => STATE_KEY in items)).toHaveLength(1);
});

it('a historical verified-invalid Drop gap returns its original partial outcome without another Chrome read', async () => {
  const { harness, request } = await browserFixture();
  harness.chromeMock.windows.get.mockResolvedValue({ id: 1, type: 'normal', incognito: false } as never);
  harness.chromeMock.tabs.get.mockResolvedValue(undefined);
  const drop = { type: 'drop-intent', operationId: 'invalid-live-sibling', expectedRevision: 7,
    intent: { kind: 'create-session', source: { kind: 'open-tabs', tabIds: [1], windowId: 1 }, category: 'inbox', index: 0, workspaceId: 'workspace_default' }, openTabs: [], updatedAt: '2026-11-16T00:00:00.000Z' };
  const mixed = { ...request, mutations: [drop, request.mutations[0]], restoreAttempts: [{ originalIndex: 1, attemptId: crypto.randomUUID() }] };
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: mixed })).toMatchObject({ ok: false, code: 'INVALID_DROP_INTENT', invalidMutationIndexes: [0], committedMutationIndexes: [1] });
  harness.chromeMock.tabs.get.mockImplementation(() => { throw new Error('Historical live validation ran'); });
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: mixed })).toMatchObject({ ok: false, confirmedByReceipt: true, invalidMutationIndexes: [0], committedMutationIndexes: [1], state: { mutationRevision: 8 } });
  expect(harness.writes.filter(items => STATE_KEY in items)).toHaveLength(1);
});

it('a captured UI preview keeps its old origin through an equal-content source change and a new preview can restore', async () => {
  const { old, harness } = await browserFixture();
  const { useTabBoardStore } = await import('./useTabBoardStore');
  const { switchToBrowserMode } = await import('./activeAdapter');
  await useTabBoardStore.getState().hydrate();
  const preview = await useTabBoardStore.getState().captureRestorePreview();
  await switchToBrowserMode(false);
  const text = exportToJson(normalizeState({ ...old, settings: { ...old.settings, theme: 'dark' } }));
  await expect(useTabBoardStore.getState().restoreBackup(text, preview)).rejects.toMatchObject({ code: 'RESTORE_ORIGIN_CHANGED' });
  expect(harness.writes.filter(items => STATE_KEY in items)).toHaveLength(0);
  const current = await useTabBoardStore.getState().captureRestorePreview();
  expect(current.expectedRevision).toBe(preview.expectedRevision);
  expect(current.origin.scopeId).not.toBe(preview.origin.scopeId);
  await useTabBoardStore.getState().restoreBackup(text, current);
  expect(harness.data[STATE_KEY]).toMatchObject({ mutationRevision: 8, settings: { theme: 'dark' } });
  useTabBoardStore.getState().releaseHydration();
});

it('a failed browser selection status write retains the previous bound origin', async () => {
  const { harness } = await browserFixture();
  const { getActiveRestoreSnapshot, switchToBrowserMode } = await import('./activeAdapter');
  const before = await getActiveRestoreSnapshot();
  const set = harness.chromeMock.storage.local.set;
  vi.spyOn(harness.chromeMock.storage.local, 'set').mockImplementation(async items => {
    if ('tabboardStorageConfig' in items) throw new Error('browser selection failed');
    return set(items);
  });
  await expect(switchToBrowserMode(false)).rejects.toThrow('browser selection failed');
  vi.restoreAllMocks();
  expect((await getActiveRestoreSnapshot()).metadata.origin).toEqual(before.metadata.origin);
});

it('historical partial Publication settles the checked Restore once and never replays a committed ordinary sibling over a newer peer', async () => {
  const { old, harness } = await browserFixture();
  const { createAuthoritativePublication } = await import('./authoritativePublication');
  const { getActiveState, getActiveRestoreSnapshot, getActiveDatasetIdentity, subscribeActiveState } = await import('./activeAdapter');
  const { sendStateMutations } = await import('./chromeStorage');
  let projection = { state: old, hydrated: true, persistenceError: null as string | null };
  const committed: string[] = [];
  const publication = createAuthoritativePublication({
    readProjection: () => projection, publishProjection: (state, status) => { projection = { ...projection, ...status, state }; },
    patchStatus: status => { projection = { ...projection, ...status }; },
    initializeAuthoritativeState: getActiveState, readRestoreSnapshot: getActiveRestoreSnapshot,
    subscribeAuthoritativeState: subscribeActiveState, sendMutations: sendStateMutations,
    currentContext: () => globalThis.chrome, currentDataset: getActiveDatasetIdentity,
    onPersistenceError: () => undefined, onMutationCommitted: mutation => committed.push(mutation.type),
  });
  await publication.hydrate();
  publication.commit({ type: 'update-settings', updates: { theme: 'light' }, updatedAt: '2026-11-16T00:00:00.000Z' });
  const preview = await publication.captureRestorePreview();
  const drop = { type: 'drop-intent' as const, operationId: 'partial-checked-gap', expectedRevision: 8,
    intent: { kind: 'create-session' as const, source: { kind: 'open-tabs' as const, tabIds: [1], windowId: 1 }, category: 'inbox' as const, index: 0, workspaceId: 'workspace_default' },
    openTabs: [{ id: 1, windowId: 1, title: 'Missing', url: 'https://missing.test/', favIconUrl: '', pinned: false, index: 0, browserGroup: null, storable: true, reason: null }], updatedAt: '2026-11-16T00:00:00.000Z' };
  publication.commit(drop);
  harness.chromeMock.windows.get.mockResolvedValue({ id: 1, type: 'normal', incognito: false } as never);
  harness.chromeMock.tabs.get.mockResolvedValue(undefined);
  harness.dropReply();
  harness.beforeReceiptReply(() => {
    const peer = normalizeState({ ...(harness.data[STATE_KEY] as typeof old), mutationRevision: 10, updatedAt: '2026-11-16T01:00:00.000Z', settings: { ...old.settings, theme: 'system' } });
    void harness.chromeMock.storage.local.set({ [STATE_KEY]: peer });
  });
  let settled = 0;
  await publication.commitCompleteRestore({ type: 'restore-backup', backup: normalizeState({ ...old, settings: { ...old.settings, theme: 'dark' } }), expectedRevision: 8, updatedAt: '2026-11-16T00:00:00.000Z' }, preview).then(() => { settled++; });
  expect(settled).toBe(1);
  expect(committed).toEqual(['update-settings', 'restore-backup']);
  expect(projection.state).toMatchObject({ mutationRevision: 10, settings: { theme: 'system' } });
  expect(harness.data.tabboardBackupBeforeRestore).toMatchObject({ mutationRevision: 8, settings: { theme: 'light' } });
  const requests = harness.requests.filter(r => r.type === 'tabboard-state-mutations');
  expect(requests).toHaveLength(2);
  expect(requests[0].restoreRequest).toEqual(requests[1].restoreRequest);
  publication.dispose();
});

it('inconsistent receipt outcomes fail closed before replay or a new Restore can execute', async () => {
  const { harness, request } = await browserFixture();
  await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request });
  const metadata = structuredClone(harness.data.tabboardRestoreMetadata) as { receipts: { failure?: unknown }[] };
  metadata.receipts[0].failure = { code: 'INVALID_DROP_INTENT', message: 'invalid', invalidMutationIndexes: 'not-indexes' };
  harness.data.tabboardRestoreMetadata = metadata;
  expect(await harness.send({ type: 'tabboard-state-mutations', restoreRequest: request })).toMatchObject({ ok: false, code: 'RESTORE_METADATA_INVALID' });
  expect(harness.writes.filter(items => STATE_KEY in items)).toHaveLength(1);
});

it('the captured revision includes an optimistic no-op prefix exactly as the frozen worker batch evaluates it', async () => {
  const { old, harness } = await browserFixture();
  const { useTabBoardStore } = await import('./useTabBoardStore');
  await useTabBoardStore.getState().hydrate();
  vi.setSystemTime(new Date(old.updatedAt));
  useTabBoardStore.getState().updateSettings({ theme: 'system' });
  const preview = await useTabBoardStore.getState().captureRestorePreview();
  expect(preview.expectedRevision).toBe(7);
  const backup = normalizeState({ ...old, settings: { ...old.settings, theme: 'dark' } });
  await useTabBoardStore.getState().restoreBackup(exportToJson(backup), preview);
  expect(harness.data[STATE_KEY]).toMatchObject({ mutationRevision: 8, settings: { theme: 'dark' } });
  expect(harness.writes.filter(items => STATE_KEY in items)).toHaveLength(1);
  useTabBoardStore.getState().releaseHydration();
});

it('an unknown mixed Restore request whose former source is unavailable rejects whole rather than copying possibly committed siblings into the new source', async () => {
  const { old, harness } = await browserFixture();
  const { restoreMemoryIdb } = await import('../testing/restoreMemoryIdb');
  const { createMemoryDirectory } = await import('../testing/memoryFs');
  vi.stubGlobal('indexedDB', restoreMemoryIdb().factory);
  const { useTabBoardStore } = await import('./useTabBoardStore');
  const { switchToFileMode } = await import('./activeAdapter');
  const { initFileStorageDirectory } = await import('./fileStorage');
  await useTabBoardStore.getState().hydrate();
  useTabBoardStore.getState().updateSettings({ theme: 'light' });
  const preview = await useTabBoardStore.getState().captureRestorePreview();
  const root = createMemoryDirectory('new-unrelated-source');
  let switched: Promise<void> | undefined;
  harness.dropReply(() => { switched = switchToFileMode(root, old); });
  await expect(useTabBoardStore.getState().restoreBackup(exportToJson(normalizeState({ ...old, settings: { ...old.settings, theme: 'dark' } })), preview)).rejects.toMatchObject({ code: 'RESTORE_ORIGIN_CHANGED' });
  await switched;
  expect((await initFileStorageDirectory(root)).state).toMatchObject({ mutationRevision: 7, settings: { theme: 'system' } });
  expect(harness.data[STATE_KEY]).toMatchObject({ mutationRevision: 9, settings: { theme: 'dark' } });
  useTabBoardStore.getState().releaseHydration();
});
