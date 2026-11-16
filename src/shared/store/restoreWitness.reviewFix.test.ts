// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyState, createGroupFromTabRecords, createNoteRecord, normalizeState } from '../model';
import { restoreWorkerHarness } from '../testing/restoreWorkerHarness';
import { restoreMemoryIdb } from '../testing/restoreMemoryIdb';
import { createMemoryDirectory } from '../testing/memoryFs';
import { readTextFile } from './fsAtomic';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });
it('confirms an isolated real Restore commit after its success reply is lost', async () => {
  vi.resetModules();
  const base = normalizeState({ ...createEmptyState(), mutationRevision: 7 });
  const group = createGroupFromTabRecords([createNoteRecord('Old note')], { workspaceId: base.activeWorkspaceId, title: 'Old group' });
  const old = normalizeState({ ...base, groups: [group] });
  const harness = await restoreWorkerHarness(old);
  const { createAuthoritativePublication } = await import('./authoritativePublication');
  const authority = await import('./activeAdapter');
  const { sendStateMutations } = await import('./chromeStorage');
  let projection = { state: old, hydrated: true, persistenceError: null as string | null };
  const feedback: string[] = [];
  const publication = createAuthoritativePublication({
    readProjection: () => projection, publishProjection: (state, status) => { projection = { ...projection, ...status, state }; }, patchStatus: status => { projection = { ...projection, ...status }; },
    initializeAuthoritativeState: authority.getActiveState, readRestoreSnapshot: authority.getActiveRestoreSnapshot, subscribeAuthoritativeState: authority.subscribeActiveState,
    sendMutations: sendStateMutations, currentContext: () => globalThis.chrome, currentDataset: authority.getActiveDatasetIdentity,
    onPersistenceError: () => undefined, onMutationCommitted: mutation => feedback.push(mutation.type),
  });
  await publication.hydrate();
  publication.commit({ type: 'update-group', id: group.id, updates: { title: 'Pending old group edit' }, updatedAt: '2026-11-16T00:00:00.000Z' });
  const preview = await publication.captureRestorePreview();
  await harness.send({ type: 'tabboard-state-mutations', mutations: [{ type: 'set-group-flags', id: group.id, locked: true, updatedAt: '2026-11-16T00:00:00.000Z' }] });
  const originalSend = harness.chromeMock.runtime.sendMessage;
  let dropped = false;
  let resolved = 0;
  vi.spyOn(harness.chromeMock.runtime, 'sendMessage').mockImplementation(async message => {
    const response = await originalSend(message);
    const request = message.restoreRequest as { mutations?: { type: string }[] } | undefined;
    if (!dropped && (response as { ok?: boolean }).ok && request?.mutations?.length === 1 && request.mutations[0].type === 'restore-backup') {
      dropped = true;
      publication.commit({ type: 'update-settings', updates: { theme: 'dark' }, updatedAt: '2026-11-16T02:00:00.000Z' });
      throw new Error('Isolated real committed reply lost');
    }
    return response;
  });
  const outcome = publication.commitCompleteRestore({ type: 'restore-backup', backup: base, expectedRevision: preview.expectedRevision, updatedAt: '2026-11-16T00:00:00.000Z' }, preview).then(() => { resolved++; return 'confirmed'; }, error => error.code);
  const result = await outcome;
  console.log('ISOLATION_EVIDENCE', JSON.stringify({ result, dropped, stateWrites: harness.writes.filter(items => 'tabboardState' in items).length, requests: harness.requests.map(r => ({ types: (r.mutations as { type: string }[] | undefined)?.map(m => m.type), requestId: (r.restoreRequest as { requestId?: string } | undefined)?.requestId })), feedback, before: harness.data.tabboardBackupBeforeRestore, canonical: harness.data.tabboardState }));
  await vi.waitFor(() => expect(harness.data.tabboardState).toMatchObject({ mutationRevision: 10, settings: { theme: 'dark' } }));
  const isolated = harness.requests.filter(r => (r.restoreRequest as { mutations?: { type: string }[] } | undefined)?.mutations?.length === 1);
  expect(isolated).toHaveLength(2);
  expect(isolated[0].restoreRequest).toEqual(isolated[1].restoreRequest);
  expect(feedback).toEqual(['restore-backup', 'update-settings']);
  expect(resolved).toBe(1);
  expect(harness.data.tabboardBackupBeforeRestore).toMatchObject({ mutationRevision: 8, groups: [{ id: group.id, title: 'Old group', locked: true }] });
  expect(harness.writes.filter(items => 'tabboardState' in items)).toHaveLength(3);
  publication.dispose();
  expect(dropped).toBe(true);
  expect(result).toBe('confirmed');
});
it('ordinary worker evaluation uses a lower-clock File peer selection from the newly refreshed origin', async () => {
  vi.resetModules();
  const old = normalizeState({ ...createEmptyState(), mutationRevision: 9 });
  const harness = await restoreWorkerHarness(old);
  vi.stubGlobal('indexedDB', restoreMemoryIdb().factory);
  const authority = await import('./activeAdapter');
  const { createFileStorageAdapter, initFileStorageDirectory } = await import('./fileStorage');
  const root = createMemoryDirectory('selected-file');
  await authority.switchToFileMode(root, old);
  await authority.getActiveState();
  await authority.getActiveRestoreSnapshot();
  const dataset = authority.getActiveDatasetIdentity();
  const workspace = { ...old.workspaces[0], id: 'new-peer-source', name: 'Peer source' };
  const selected = normalizeState({ ...old, mutationRevision: 7, workspaces: [workspace], activeWorkspaceId: workspace.id });
  vi.resetModules();
  const peerAuthority = await import('./activeAdapter');
  await peerAuthority.switchToFileMode(root, selected);
  const before = await authority.getActiveState();
  const response = await harness.send({ type: 'tabboard-state-mutations', mutations: [{ type: 'update-settings', updates: { theme: 'dark' }, updatedAt: '2026-11-16T01:00:00.000Z' }] });
  const after = (await initFileStorageDirectory(root)).state;
  console.log('FILE_FRESHNESS_EVIDENCE', JSON.stringify({ before: { revision: before.mutationRevision, workspace: before.activeWorkspaceId }, response, after: { revision: after?.mutationRevision, workspace: after?.activeWorkspaceId } }));
  expect(before).toMatchObject({ mutationRevision: 7, activeWorkspaceId: workspace.id });
  expect(authority.getActiveDatasetIdentity()).not.toBe(dataset);
  expect(after?.activeWorkspaceId).toBe(workspace.id);
  expect(after?.mutationRevision).toBe(8);
});
it.each(['critical-json', 'file-permission', 'indexeddb', 'indexeddb-with-later'] as const)('a committed mixed File request whose %s proof read fails rejects whole without replaying an ordinary sibling', async boundary => {
  vi.resetModules();
  const old = normalizeState({ ...createEmptyState(), mutationRevision: 7 });
  const harness = await restoreWorkerHarness(old);
  vi.stubGlobal('indexedDB', restoreMemoryIdb().factory);
  const authority = await import('./activeAdapter');
  const root = createMemoryDirectory('proof-source');
  await authority.switchToFileMode(root, old);
  const { createAuthoritativePublication } = await import('./authoritativePublication');
  const { sendStateMutations } = await import('./chromeStorage');
  let projection = { state: old, hydrated: true, persistenceError: null as string | null };
  const feedback: string[] = [];
  const publication = createAuthoritativePublication({
    readProjection: () => projection, publishProjection: (state, status) => { projection = { ...projection, ...status, state }; }, patchStatus: status => { projection = { ...projection, ...status }; },
    initializeAuthoritativeState: authority.getActiveState, readRestoreSnapshot: authority.getActiveRestoreSnapshot, subscribeAuthoritativeState: authority.subscribeActiveState,
    sendMutations: sendStateMutations, currentContext: () => globalThis.chrome, currentDataset: authority.getActiveDatasetIdentity,
    onPersistenceError: () => undefined, onMutationCommitted: mutation => feedback.push(mutation.type),
  });
  await publication.hydrate();
  publication.commit({ type: 'update-settings', updates: { theme: 'light' }, updatedAt: '2026-11-16T00:00:00.000Z' });
  const preview = await publication.captureRestorePreview();
  const originalSend = harness.chromeMock.runtime.sendMessage;
  let dropped = false;
  const responses: { ok?: boolean; restoreOutcome?: string; code?: string; error?: string }[] = [];
  vi.spyOn(harness.chromeMock.runtime, 'sendMessage').mockImplementation(async message => {
    const response = await originalSend(message);
    responses.push(response as typeof responses[number]);
    if (!dropped && message.restoreRequest && (response as { ok?: boolean }).ok) {
      dropped = true;
      if (boundary === 'critical-json') {
        const stream = await (await root.getFileHandle('settings.json')).createWritable();
        await stream.write('{broken'); await stream.close();
      } else if (boundary === 'file-permission') {
        const getFile = root.getFileHandle.bind(root);
        vi.spyOn(root, 'getFileHandle').mockImplementation(async (name, options) => {
          if (name === 'settings.json') throw new DOMException('File proof permission lost', 'NotAllowedError');
          return getFile(name, options);
        });
      } else {
        vi.spyOn(globalThis.indexedDB, 'open').mockImplementation(() => { throw new Error('IndexedDB proof read failed'); });
      }
      if (boundary === 'indexeddb-with-later') publication.commit({ type: 'rename-workspace', id: old.activeWorkspaceId, name: 'Later explicit edit', updatedAt: '2026-11-16T02:00:00.000Z' });
      throw new Error('Actual committed File reply lost then proof became unreadable');
    }
    return response;
  });
  const result = await publication.commitCompleteRestore({ type: 'restore-backup', backup: normalizeState({ ...old, settings: { ...old.settings, theme: 'dark' } }), expectedRevision: preview.expectedRevision, updatedAt: '2026-11-16T00:00:00.000Z' }, preview).then(() => 'confirmed', error => error.code);
  const { initFileStorageDirectory } = await import('./fileStorage');
  let after: unknown;
  try { after = (await initFileStorageDirectory(root)).state; } catch (error) { after = { code: error && typeof error === 'object' && 'code' in error ? error.code : undefined }; }
  console.log('PROOF_FAILURE_EVIDENCE', JSON.stringify({ result, dropped, requests: harness.requests.map(r => ({ types: (r.mutations as { type: string }[] | undefined)?.map(m => m.type), requestId: (r.restoreRequest as { requestId?: string } | undefined)?.requestId })), feedback, after }));
  const failure = responses.find(response => response.restoreOutcome === 'proof-unavailable');
  expect(failure).toMatchObject({ ok: false, restoreOutcome: 'proof-unavailable' });
  if (boundary === 'critical-json') expect(result).toBe('FILE_CORRUPT');
  else expect(failure?.error).toContain(boundary === 'file-permission' ? 'File proof permission lost' : 'IndexedDB proof read failed');
  if (boundary === 'indexeddb-with-later') {
    await vi.waitFor(() => expect(feedback).toEqual(['rename-workspace']));
    const later = harness.requests.filter(r => r.type === 'tabboard-state-mutations').at(-1)!;
    expect(later.restoreRequest).toBeUndefined();
    expect(later.mutations).toMatchObject([{ type: 'rename-workspace', name: 'Later explicit edit' }]);
  }
  expect(JSON.parse(await readTextFile(await root.getFileHandle('meta.json')))).toMatchObject({ mutationRevision: boundary === 'indexeddb-with-later' ? 10 : 9, restoreMetadata: { receipts: [{ committedRevision: 9 }] } });
  expect(JSON.parse(await readTextFile(await root.getFileHandle('.tabboard-before-restore.json')))).toMatchObject({ mutationRevision: 8, settings: { theme: 'light' } });
  publication.dispose();
  expect(feedback).toEqual(boundary === 'indexeddb-with-later' ? ['rename-workspace'] : []);
  const requests = harness.requests.filter(r => r.type === 'tabboard-state-mutations');
  expect(requests).toHaveLength(boundary === 'indexeddb-with-later' ? 3 : 2);
  expect(requests[0].restoreRequest).toEqual(requests[1].restoreRequest);
});

it('Authority keeps the high-water snapshot for a lower File observation in the same origin', async () => {
  vi.resetModules();
  const old = normalizeState({ ...createEmptyState(), mutationRevision: 9 });
  await restoreWorkerHarness(old);
  vi.stubGlobal('indexedDB', restoreMemoryIdb().factory);
  const authority = await import('./activeAdapter');
  const { createFileStorageAdapter } = await import('./fileStorage');
  const root = createMemoryDirectory('same-origin-observation');
  await authority.switchToFileMode(root, old);
  await authority.getActiveRestoreSnapshot();
  const dataset = authority.getActiveDatasetIdentity();
  const peer = await createFileStorageAdapter(root);
  await peer.setState(normalizeState({ ...old, mutationRevision: 7, settings: { ...old.settings, theme: 'light' } }));
  expect(await authority.getActiveState()).toMatchObject({ mutationRevision: 9, settings: { theme: 'system' } });
  expect(authority.getActiveDatasetIdentity()).toBe(dataset);
});
