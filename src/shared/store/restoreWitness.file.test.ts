import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyState, createGroupFromTabRecords, createNoteRecord, normalizeState } from '../model';
import { createMemoryDirectory } from '../testing/memoryFs';
import { createFileStorageAdapter, initFileStorageDirectory } from './fileStorage';
import { createStatePersistence } from '../../background/statePersistence';
import { createMutationBatch } from './stateMutations';
import { readTextFile } from './fsAtomic';
import type { FileStorageAdapter } from './storageAdapter';
import type { RestoreRequest } from './restoreCommit';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function persistence(adapter: FileStorageAdapter) {
  return createStatePersistence({ getState: () => adapter.getState(), getBoundState: () => adapter.getBoundState!(), setState: (s, options) => adapter.setState(s, options) });
}
const prepare = (request: RestoreRequest) => (state: ReturnType<typeof createEmptyState>) => createMutationBatch(request.mutations).verify(state, async () => { throw new Error('Unexpected live validation'); });
async function fixture() {
  vi.stubGlobal('chrome', { storage: { local: { get: async () => ({}), set: async () => undefined } } });
  const root = createMemoryDirectory('Restore');
  const old = normalizeState({ ...createEmptyState(), mutationRevision: 7 });
  const adapter = await createFileStorageAdapter(root);
  await adapter.setState(old);
  const bound = await adapter.getBoundState!();
  const backup = normalizeState({ ...old, settings: { ...old.settings, theme: 'dark' } });
  const request: RestoreRequest = { requestId: crypto.randomUUID(), origin: bound.metadata.origin, mutations: [{ type: 'restore-backup', backup, expectedRevision: 7, updatedAt: '2026-11-16T00:00:00.000Z' }], restoreAttempts: [{ originalIndex: 0, attemptId: crypto.randomUUID() }] };
  return { root, old, adapter, request };
}

it('File final-meta receipt survives rebuilt persistence and does not replace pre-restore bytes after later edits', async () => {
  const { root, adapter, request } = await fixture();
  await persistence(adapter).applyRestoreRequest(request, prepare(request));
  const before = await readTextFile(await root.getFileHandle('.tabboard-before-restore.json'));
  await persistence(adapter).applyMutations([{ type: 'update-settings', updates: { theme: 'light' }, updatedAt: '2026-11-16T01:00:00.000Z' }]);
  const rebuilt = await createFileStorageAdapter(root);
  const replay = await persistence(rebuilt).applyRestoreRequest(request, async () => { throw new Error('Historical request was reverified'); });
  expect(replay).toMatchObject({ confirmedByReceipt: true, state: { mutationRevision: 9, settings: { theme: 'light' } } });
  expect(await readTextFile(await root.getFileHandle('.tabboard-before-restore.json'))).toBe(before);
  expect((await rebuilt.getBoundState!()).metadata.receipts).toHaveLength(1);
});

it('a failed File final-meta close exposes old state and receipts, never the candidate receipt', async () => {
  const { root, old, adapter, request } = await fixture();
  const meta = await root.getFileHandle('meta.json');
  const createWritable = meta.createWritable.bind(meta);
  let candidate = false;
  vi.spyOn(meta, 'createWritable').mockImplementation(async () => {
    const stream = await createWritable();
    const write = stream.write.bind(stream);
    vi.spyOn(stream, 'write').mockImplementation(async content => {
      candidate = typeof content === 'string' && JSON.parse(content).writeInProgress === false;
      return write(content);
    });
    const close = stream.close.bind(stream);
    vi.spyOn(stream, 'close').mockImplementation(async () => { if (candidate) throw new Error('final close failed'); return close(); });
    return stream;
  });
  await expect(persistence(adapter).applyRestoreRequest(request, prepare(request))).rejects.toThrow('final close failed');
  const loaded = await initFileStorageDirectory(root);
  expect(loaded.state).toEqual(old);
  expect(loaded.restoreMetadata?.receipts).toEqual([]);
  const rebuilt = await createFileStorageAdapter(root);
  expect((await rebuilt.getBoundState!()).metadata.receipts).toEqual([]);
});

it('an interrupted ordinary File transaction retains the preceding complete Restore receipt in recovery', async () => {
  const { root, adapter, request } = await fixture();
  await persistence(adapter).applyRestoreRequest(request, prepare(request));
  const meta = await root.getFileHandle('meta.json');
  const createWritable = meta.createWritable.bind(meta);
  let final = false;
  vi.spyOn(meta, 'createWritable').mockImplementation(async () => {
    const stream = await createWritable(); const write = stream.write.bind(stream);
    vi.spyOn(stream, 'write').mockImplementation(async content => { final = typeof content === 'string' && JSON.parse(content).writeInProgress === false; return write(content); });
    const close = stream.close.bind(stream);
    vi.spyOn(stream, 'close').mockImplementation(async () => { if (final) throw new Error('ordinary final close failed'); return close(); });
    return stream;
  });
  await expect(persistence(adapter).applyMutations([{ type: 'update-settings', updates: { theme: 'light' }, updatedAt: '2026-11-16T01:00:00.000Z' }])).rejects.toThrow('ordinary final close failed');
  const rebuilt = await createFileStorageAdapter(root);
  expect(await persistence(rebuilt).applyRestoreRequest(request, async () => { throw new Error('reverified'); })).toMatchObject({ confirmedByReceipt: true, state: { mutationRevision: 8, settings: { theme: 'dark' } } });
});

it('legacy complete File registration changes auxiliary meta only and keeps readable v1 core files and revision', async () => {
  const { root } = await fixture();
  const meta = JSON.parse(await readTextFile(await root.getFileHandle('meta.json')));
  delete meta.restoreMetadata;
  const stream = await (await root.getFileHandle('meta.json')).createWritable(); await stream.write(JSON.stringify(meta)); await stream.close();
  const settings = await readTextFile(await root.getFileHandle('settings.json'));
  const workspaces = await readTextFile(await root.getFileHandle('workspaces.json'));
  const rebuilt = await createFileStorageAdapter(root);
  expect((await rebuilt.getBoundState!()).state.mutationRevision).toBe(7);
  expect(await readTextFile(await root.getFileHandle('settings.json'))).toBe(settings);
  expect(await readTextFile(await root.getFileHandle('workspaces.json'))).toBe(workspaces);
  expect(JSON.parse(await readTextFile(await root.getFileHandle('meta.json')))).toMatchObject({ fileLayoutVersion: 1, mutationRevision: 7, updatedAt: meta.updatedAt });
});

it.each(['before-restore', 'recovery', 'pending-meta', 'settings-data', 'final-meta'] as const)('File failure at %s never attests its candidate and retains prior committed receipts', async phase => {
  const { root, adapter, request } = await fixture();
  await persistence(adapter).applyRestoreRequest(request, prepare(request));
  const committed = (await adapter.getBoundState!()).state;
  const candidate: RestoreRequest = { ...request, requestId: crypto.randomUUID(), mutations: [{ ...(request.mutations[0] as object), expectedRevision: 8 }], restoreAttempts: [{ originalIndex: 0, attemptId: crypto.randomUUID() }] };
  const getFileHandle = root.getFileHandle.bind(root);
  let metaCloses = 0;
  const wrapped = new WeakSet<object>();
  vi.spyOn(root, 'getFileHandle').mockImplementation(async (name, options) => {
    const handle = await getFileHandle(name, options);
    const matches = (phase === 'before-restore' && name === '.tabboard-before-restore.json')
      || (phase === 'recovery' && name.startsWith('.tabboard-recovery-'))
      || ((phase === 'pending-meta' || phase === 'final-meta') && name === 'meta.json')
      || (phase === 'settings-data' && name === 'settings.json');
    if (!matches || wrapped.has(handle)) return handle;
    wrapped.add(handle);
    const originalCreate = handle.createWritable.bind(handle);
    vi.spyOn(handle, 'createWritable').mockImplementation(async () => {
      const stream = await originalCreate(); const close = stream.close.bind(stream);
      vi.spyOn(stream, 'close').mockImplementation(async () => {
        if (name === 'meta.json') metaCloses++;
        if ((phase === 'pending-meta' && metaCloses === 1) || (phase === 'final-meta' && metaCloses === 2)
          || (phase !== 'pending-meta' && phase !== 'final-meta')) throw new Error(`failed ${phase}`);
        return close();
      });
      return stream;
    });
    return handle;
  });
  await expect(persistence(adapter).applyRestoreRequest(candidate, prepare(candidate))).rejects.toThrow(`failed ${phase}`);
  vi.restoreAllMocks();
  const rebuilt = await createFileStorageAdapter(root);
  const bound = await rebuilt.getBoundState!();
  expect(bound.state).toEqual(committed);
  expect(bound.metadata.receipts).toHaveLength(1);
  expect(bound.metadata.receipts[0].requestId).toBe(request.requestId);
  expect(await persistence(rebuilt).applyRestoreRequest(request, async () => { throw new Error('historical validation'); })).toMatchObject({ confirmedByReceipt: true });
});

it('metadata-only File write options do not create a Restore backup, rewrite equal core files or delete orphan sessions', async () => {
  const { root, adapter } = await fixture();
  const state = await adapter.getState();
  const metadata = (await adapter.getBoundState!()).metadata;
  const sessions = await root.getDirectoryHandle('sessions');
  const orphan = await sessions.getFileHandle('orphan.json', { create: true });
  const stream = await orphan.createWritable(); await stream.write(JSON.stringify({ id: 'orphan', tabs: [] })); await stream.close();
  const settings = await root.getFileHandle('settings.json');
  vi.spyOn(settings, 'createWritable').mockImplementation(async () => { throw new Error('equal settings were rewritten'); });
  await adapter.setState(state, { restoreMetadata: metadata });
  expect(await sessions.getFileHandle('orphan.json')).toBe(orphan);
  await expect(root.getFileHandle('.tabboard-before-restore.json')).rejects.toMatchObject({ name: 'NotFoundError' });
});

it('post-final-meta ping failure still leaves a verifiable committed File receipt', async () => {
  const { root, adapter, request } = await fixture();
  vi.stubGlobal('chrome', { storage: { local: { get: async () => ({}), set: async () => { throw new Error('ping unavailable'); } } } });
  await persistence(adapter).applyRestoreRequest(request, prepare(request));
  const rebuilt = await createFileStorageAdapter(root);
  expect(await persistence(rebuilt).applyRestoreRequest(request, async () => { throw new Error('reverified'); })).toMatchObject({ confirmedByReceipt: true, state: { mutationRevision: 8 } });
});

it('an ordinary write by a previously cached File adapter preserves receipts committed by another adapter', async () => {
  const { root, adapter, request } = await fixture();
  const other = await createFileStorageAdapter(root);
  await other.getBoundState!();
  const committed = await persistence(adapter).applyRestoreRequest(request, prepare(request));
  const edited = normalizeState({ ...committed.state, mutationRevision: 9, settings: { ...committed.state.settings, theme: 'light' } });
  await other.setState(edited);
  const rebuilt = await createFileStorageAdapter(root);
  expect(await persistence(rebuilt).applyRestoreRequest(request, async () => { throw new Error('old request was executed again'); })).toMatchObject({ confirmedByReceipt: true, state: { mutationRevision: 9, settings: { theme: 'light' } } });
});

it('ordinary Persistence evaluates a peer Restore from its fresh File snapshot, preserving restored content and receipt', async () => {
  const { root, old, adapter, request } = await fixture();
  const peer = await createFileStorageAdapter(root);
  await peer.getBoundState!();
  const workspace = { ...old.workspaces[0], id: 'peer-restored', name: 'Peer restored content' };
  const backup = normalizeState({ ...old, workspaces: [workspace], activeWorkspaceId: workspace.id });
  const restore = { ...request, mutations: [{ ...(request.mutations[0] as object), backup }] };
  await persistence(adapter).applyRestoreRequest(restore, prepare(restore));
  await persistence(peer).applyMutations([{ type: 'update-settings', updates: { theme: 'light' }, updatedAt: '2026-11-16T01:00:00.000Z' }]);
  const rebuilt = await createFileStorageAdapter(root);
  const bound = await rebuilt.getBoundState!();
  expect(bound.state).toMatchObject({ mutationRevision: 9, activeWorkspaceId: 'peer-restored', workspaces: [{ id: 'peer-restored', name: 'Peer restored content' }], settings: { theme: 'light' } });
  expect(bound.metadata.receipts.map(r => r.requestId)).toEqual([restore.requestId]);
  expect(await persistence(rebuilt).applyRestoreRequest(restore, async () => { throw new Error('repeat restore'); })).toMatchObject({ confirmedByReceipt: true, state: { activeWorkspaceId: 'peer-restored' } });
});

it('legacy pending File metadata cannot gain a committed origin by preview registration', async () => {
  const { root, old } = await fixture();
  const { atomicWriteFile } = await import('./fsAtomic');
  const meta = JSON.parse(await readTextFile(await root.getFileHandle('meta.json')));
  delete meta.restoreMetadata;
  const commitId = 'legacy-pending'; const recoveryFile = '.tabboard-recovery-legacy-pending.json';
  await atomicWriteFile(root, recoveryFile, JSON.stringify({ commitId, state: old }));
  await atomicWriteFile(root, 'meta.json', JSON.stringify({ ...meta, writeInProgress: true, pendingRevision: 8, commitId, recoveryFile }));
  const bytes = await readTextFile(await root.getFileHandle('meta.json'));
  const rebuilt = await createFileStorageAdapter(root);
  await expect(rebuilt.getBoundState!()).rejects.toMatchObject({ code: 'RESTORE_ORIGIN_UNAVAILABLE' });
  expect(await readTextFile(await root.getFileHandle('meta.json'))).toBe(bytes);
});

it('a File scope change at the same canonical clock rereads the corresponding new state before ordinary evaluation', async () => {
  const { root, old, adapter } = await fixture();
  const peer = await createFileStorageAdapter(root);
  await peer.getBoundState!();
  const metadata = (await adapter.getBoundState!()).metadata;
  const workspace = { ...old.workspaces[0], id: 'same-clock-selected', name: 'Selected source at same clock' };
  const selected = normalizeState({ ...old, workspaces: [workspace], activeWorkspaceId: workspace.id });
  await adapter.setState(selected, { restoreMetadata: { ...metadata, origin: { mode: 'file', scopeId: crypto.randomUUID() } } });
  expect((await peer.getState()).activeWorkspaceId).toBe('same-clock-selected');
  await persistence(peer).applyMutations([{ type: 'update-settings', updates: { theme: 'light' }, updatedAt: '2026-11-16T01:00:00.000Z' }]);
  expect((await initFileStorageDirectory(root)).state).toMatchObject({ mutationRevision: 8, activeWorkspaceId: 'same-clock-selected', settings: { theme: 'light' } });
});

it('failed unread raw-byte preservation cannot authorize a Restore receipt or replace the original bytes', async () => {
  const { root, old, adapter, request } = await fixture();
  const { atomicWriteFile } = await import('./fsAtomic');
  const group = createGroupFromTabRecords([createNoteRecord('Recovered note')], { title: 'Recovered', workspaceId: old.activeWorkspaceId });
  const sessions = await root.getDirectoryHandle('sessions');
  const bytes = new Uint8Array([123, 255, 254, 125]);
  await atomicWriteFile(sessions, `${group.id}.json`, bytes);
  await adapter.reloadFromDisk();
  const preserved = await root.getDirectoryHandle('.tabboard-unread-before-restore', { create: true });
  vi.spyOn(preserved, 'getFileHandle').mockRejectedValue(new Error('raw backup failed'));
  const backup = normalizeState({ ...old, groups: [group] });
  const candidate = { ...request, mutations: [{ ...(request.mutations[0] as object), backup }] };
  await expect(persistence(adapter).applyRestoreRequest(candidate, prepare(candidate))).rejects.toThrow('raw backup failed');
  expect(new Uint8Array(await (await (await sessions.getFileHandle(`${group.id}.json`)).getFile()).arrayBuffer())).toEqual(bytes);
  expect((await adapter.getBoundState!()).metadata.receipts).toEqual([]);
  expect((await adapter.getState()).mutationRevision).toBe(7);
});

it('Publication does not attach a new File origin to the incumbent old canonical projection at an exact clock tie', async () => {
  const { old, adapter } = await fixture();
  const { createAuthoritativePublication } = await import('./authoritativePublication');
  let projection = { state: old, hydrated: true, persistenceError: null as string | null };
  const publication = createAuthoritativePublication({
    readProjection: () => projection, publishProjection: (state, status) => { projection = { ...projection, ...status, state }; }, patchStatus: status => { projection = { ...projection, ...status }; },
    initializeAuthoritativeState: () => adapter.getState(), readRestoreSnapshot: () => adapter.getBoundState!(), subscribeAuthoritativeState: callback => adapter.subscribeState(callback),
    sendMutations: async () => { throw new Error('No request should be sent'); }, currentContext: () => globalThis.chrome, currentDataset: () => adapter,
    onPersistenceError: () => undefined, onMutationCommitted: () => undefined,
  });
  await publication.hydrate();
  const before = await publication.captureRestorePreview();
  const workspace = { ...old.workspaces[0], id: 'publication-new-source', name: 'New same-clock source' };
  const selected = normalizeState({ ...old, activeWorkspaceId: workspace.id, workspaces: [workspace] });
  const metadata = (await adapter.getBoundState!()).metadata;
  await adapter.setState(selected, { restoreMetadata: { ...metadata, origin: { mode: 'file', scopeId: crypto.randomUUID() } } });
  const preview = await publication.captureRestorePreview();
  expect(preview.origin.scopeId).not.toBe(before.origin.scopeId);
  expect(projection.state.activeWorkspaceId).toBe('publication-new-source');
  publication.dispose();
});
