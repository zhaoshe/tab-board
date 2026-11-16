import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyState, createGroupFromTabRecords, createNoteRecord, createTabRecord, exportToJson, normalizeState } from '../model';
import { parseCompleteBackup } from '../model/session-operations';
import { dropOperationGroupId, dropOperationTabId } from '../model/drop-operations';
import { STATE_KEY } from '../model/constants';
import { restoreWorkerHarness } from '../testing/restoreWorkerHarness';
import { restoreMemoryIdb } from '../testing/restoreMemoryIdb';
import { createMemoryDirectory } from '../testing/memoryFs';
import { createFileStorageAdapter } from './fileStorage';
import { readTextFile } from './fsAtomic';

const timestamp = '2026-11-16T00:00:00.000Z';
function backup(generated: boolean) {
  const empty = createEmptyState();
  const workspace = { ...empty.workspaces[0], id: 'workspace.legacy~1', name: 'Research', emoji: '📚' };
  const folder = { id: 'category.legacy~1', workspaceId: workspace.id, name: 'Reading', color: 'slate', collapsed: false, createdAt: timestamp, updatedAt: timestamp };
  const operationId = 'a'.repeat(128);
  const groupId = generated ? dropOperationGroupId(operationId) : 'group.legacy';
  const tabId = generated ? dropOperationTabId(operationId, 42) : 'tab.legacy';
  const link = { ...createTabRecord({ url: 'https://example.com/', title: 'Example', pinned: true, incognito: true }), id: tabId };
  const group = { ...createGroupFromTabRecords([link, { ...createNoteRecord('Keep this note'), id: 'note.legacy~1' }], { title: 'Reading session', workspaceId: workspace.id, folderId: folder.id, locked: true }), id: groupId };
  const deleted = { ...group, id: 'deleted.group~1', tabs: [{ ...link, id: 'deleted.tab~1' }] };
  return normalizeState({ ...empty, mutationRevision: 90, workspaces: [workspace, ...empty.workspaces], activeWorkspaceId: workspace.id, folders: [folder], categoryOrderByWorkspace: { [workspace.id]: ['saved', `folder:${folder.id}`, 'inbox', 'archive'] }, groups: [group, { ...group, id: 'saved.group~1', tabs: [], folderId: null, starred: true }, { ...group, id: 'archive.group~1', tabs: [], folderId: null, archived: true }], bin: [
    { id: 'bin.tab~1', kind: 'tab', label: 'Deleted note', groupId, groupTitle: group.title, source: 'group', item: { ...createNoteRecord('Deleted note'), id: 'deleted.note~1' }, deletedAt: timestamp, originalWorkspaceId: workspace.id, originalFolderId: folder.id, originalGroupId: groupId, originalIndex: 1 },
    { id: 'bin.group~1', kind: 'group', label: deleted.title, groupId: deleted.id, groupTitle: deleted.title, source: 'group', item: deleted, deletedAt: timestamp, originalWorkspaceId: workspace.id, originalFolderId: folder.id, originalIndex: 0 },
  ], settings: { ...empty.settings, theme: 'dark', customUrlFilter: 'https://excluded.example/*', includeChromeUrls: true, includeFileUrls: true, storageMode: 'file', storageFolderName: 'Backup folder' } });
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

// A restrictive backup ID validator or lost identity/reference during worker/file
// restore makes these fail. Chrome, IDB and native handles are the only doubles.
it.each([
  ['browser', false], ['browser', true], ['file', false], ['file', true],
] as const)('own Export restores %s through typed Store/worker with generated IDs=%s', async (mode, generated) => {
  vi.resetModules();
  vi.stubGlobal('indexedDB', restoreMemoryIdb().factory);
  const old = normalizeState({ ...createEmptyState(), mutationRevision: 7, settings: { ...createEmptyState().settings, storageMode: mode, storageFolderName: mode === 'file' ? 'Current folder' : '' } });
  const source = backup(generated);
  const text = exportToJson(source);
  const harness = await restoreWorkerHarness(old);
  const root = createMemoryDirectory('Current folder');
  if (mode === 'file') {
    const { switchToFileMode } = await import('./activeAdapter');
    await switchToFileMode(root, old);
  }
  const { useTabBoardStore } = await import('./useTabBoardStore');
  await useTabBoardStore.getState().hydrate();
  try {
    const preview = await useTabBoardStore.getState().captureRestorePreview();
    expect(preview).toMatchObject({ expectedRevision: 7, origin: { mode } });
    await useTabBoardStore.getState().restoreBackup(text, preview);
    expect(parseCompleteBackup(text)).toEqual(source);
    const current = normalizeState(useTabBoardStore.getState());
    const expected = { ...source, mutationRevision: 8, updatedAt: current.updatedAt, settings: { ...source.settings, storageMode: mode, storageFolderName: old.settings.storageFolderName } };
    expect(current).toEqual(expected);
    if (mode === 'browser') {
      expect(harness.data[STATE_KEY]).toEqual(expected);
      expect(harness.data.tabboardBackupBeforeRestore).toEqual(old);
    } else {
      const rebuilt = await createFileStorageAdapter(root);
      expect(await rebuilt.getState()).toEqual(expected);
      expect(JSON.parse(await readTextFile(await root.getFileHandle('.tabboard-before-restore.json')))).toEqual(old);
      const sessions = await root.getDirectoryHandle('sessions');
      expect(JSON.parse(await readTextFile(await sessions.getFileHandle(`${source.groups[0].id}.json`)))).toEqual(source.groups[0]);
    }
  } finally { useTabBoardStore.getState().releaseHydration(); }
});

it('complete backups reject oversized UTF-8 IDs and duplicate identities in every entity collection', () => {
  const source = backup(true);
  for (const id of ['', 'a'.repeat(129), '汉'.repeat(43)]) {
    expect(() => parseCompleteBackup(exportToJson({ ...source, groups: [{ ...source.groups[0], id }, ...source.groups.slice(1)] }))).toThrow();
  }
  for (const invalid of [
    { ...source, workspaces: [...source.workspaces, source.workspaces[0]] },
    { ...source, folders: [...source.folders, source.folders[0]] },
    { ...source, groups: [...source.groups, source.groups[0]] },
    { ...source, groups: [{ ...source.groups[0], id: source.bin[1].item.id }, ...source.groups.slice(1)] },
    { ...source, bin: [...source.bin, source.bin[0]] },
    { ...source, groups: [{ ...source.groups[0], tabs: [...source.groups[0].tabs, source.bin[0].item] }, ...source.groups.slice(1)] },
    { ...source, groups: [{ ...source.groups[0], folderId: 'missing' }, ...source.groups.slice(1)] },
    { ...source, groups: [{ ...source.groups[0], workspaceId: 'missing' }, ...source.groups.slice(1)] },
    { ...source, activeWorkspaceId: 'missing' },
    { ...source, categoryOrderByWorkspace: { [source.activeWorkspaceId]: ['folder:missing'] } },
    { ...source, settings: { ...source.settings, theme: 'invalid' } },
  ]) expect(() => parseCompleteBackup(JSON.stringify(invalid))).toThrow();
});

it.each(['../escape', 'nested/session', 'nested\\session', 'nul\0session'])('File rejects unsupported session filename %j before replacing any original bytes', async id => {
  const { createStatePersistence } = await import('../../background/statePersistence');
  const { createMutationBatch } = await import('./stateMutations');
  const { atomicWriteFile } = await import('./fsAtomic');
  vi.stubGlobal('chrome', { storage: { local: { get: async () => ({}), set: async () => undefined } } });
  const root = createMemoryDirectory('Filename boundary');
  const old = normalizeState({ ...backup(false), mutationRevision: 7 });
  const adapter = await createFileStorageAdapter(root);
  await adapter.setState(old);
  await atomicWriteFile(root, '.tabboard-before-restore.json', 'previous backup bytes');
  const bound = await adapter.getBoundState!();
  const before = await readTextFile(await root.getFileHandle('meta.json'));
  const sessions = await root.getDirectoryHandle('sessions');
  const oldSession = await readTextFile(await sessions.getFileHandle('group.legacy.json'));
  const source = backup(true);
  const candidate = parseCompleteBackup(exportToJson({ ...source, groups: [{ ...source.groups[0], id }, ...source.groups.slice(1)] }));
  const request = { requestId: crypto.randomUUID(), origin: bound.metadata.origin, mutations: [{ type: 'restore-backup' as const, backup: candidate, expectedRevision: 7, updatedAt: timestamp }], restoreAttempts: [{ originalIndex: 0, attemptId: crypto.randomUUID() }] };
  const persistence = createStatePersistence({ getState: () => adapter.getState(), getBoundState: () => adapter.getBoundState!(), setState: (state, options) => adapter.setState(state, options) });
  await expect(persistence.applyRestoreRequest(request, state => createMutationBatch(request.mutations).verify(state, async () => { throw new Error('Unexpected live validation'); }))).rejects.toThrow('Invalid session filename');
  expect(await readTextFile(await root.getFileHandle('meta.json'))).toBe(before);
  expect(await readTextFile(await root.getFileHandle('.tabboard-before-restore.json'))).toBe('previous backup bytes');
  expect(await readTextFile(await sessions.getFileHandle('group.legacy.json'))).toBe(oldSession);
  expect(await (await createFileStorageAdapter(root)).getState()).toEqual(old);
});
