import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyState, createGroupFromTabRecords, createNoteRecord, exportToJson, normalizeState } from '../model';
import { parseCompleteBackup, parseImportedText } from '../model/session-operations';
import { createStatePersistence } from '../../background/statePersistence';
import { createChromeStorageAdapter } from './chromeStorageAdapter';
import { createFileStorageAdapter, initFileStorageDirectory } from './fileStorage';
import { atomicWriteFile, readTextFile } from './fsAtomic';
import { createMemoryDirectory } from '../testing/memoryFs';
import type { StateMutation } from './stateMutations';
import { STATE_KEY } from '../model/constants';

const timestamp = '2026-11-12T00:00:00.000Z';
function backup() {
  const state = createEmptyState();
  const workspace = { ...state.workspaces[0], id: 'workspace-two', name: 'Second' };
  const category = { id: 'category-two', name: 'Research', color: 'slate', workspaceId: workspace.id, collapsed: false, createdAt: timestamp, updatedAt: timestamp };
  const note = createNoteRecord('A saved note');
  const group = createGroupFromTabRecords([note], { title: 'Notes', workspaceId: workspace.id, folderId: category.id });
  return normalizeState({ ...state, mutationRevision: 90, workspaces: [workspace, ...state.workspaces], activeWorkspaceId: workspace.id, folders: [category], categoryOrderByWorkspace: { [workspace.id]: ['saved', 'folder:category-two', 'inbox', 'archive'] }, groups: [group, { ...group, id: 'saved', tabs: [], folderId: null, starred: true, locked: true }, { ...group, id: 'archive', tabs: [], folderId: null, archived: true }], settings: { ...state.settings, theme: 'dark', storageMode: 'file', storageFolderName: 'Other folder' }, bin: [{ id: 'bin-note', kind: 'tab', label: 'Deleted note', groupId: group.id, groupTitle: group.title, source: 'group', item: { ...note, id: 'deleted-note' }, deletedAt: timestamp }] });
}
function restore(state = backup(), expectedRevision = 0): StateMutation {
  return { type: 'restore-backup', backup: state, expectedRevision, updatedAt: timestamp };
}
beforeEach(() => {
  const data: Record<string, unknown> = {};
  vi.stubGlobal('chrome', { storage: { local: { get: async () => data, set: async (items: object) => Object.assign(data, items) } } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function captureUnreadWarnings() {
  const originalWarn = console.warn;
  return vi.spyOn(console, 'warn').mockImplementation((...args) => {
    if (!String(args[0]).includes('Corrupt session file "')) originalWarn(...args);
  });
}

describe('complete backup restore', () => {
  it('round trips workspace/category order, notes, flags, settings and Bin', () => {
    const source = backup();
    expect(parseCompleteBackup(exportToJson(source))).toEqual(source);
    expect(parseCompleteBackup(exportToJson(source)).groups.map(group => group.id)).toEqual(source.groups.map(group => group.id));
  });
  it.each(['{', '{}', '[]', 'https://example.com | Example'])('rejects incomplete or non-JSON backups: %s', text => {
    expect(() => parseCompleteBackup(text)).toThrow();
  });
  it('rejects incompatible versions, lost entities, broken references and invalid settings', () => {
    const source = backup();
    for (const invalid of [{ ...source, version: 2 }, { ...source, groups: [null] }, { ...source, activeWorkspaceId: 'missing' }, { ...source, groups: [{ ...source.groups[0], folderId: 'missing' }] }, { ...source, settings: { ...source.settings, theme: 'bad' } }, { ...source, workspaces: [...source.workspaces, source.workspaces[0]] }]) {
      expect(() => parseCompleteBackup(JSON.stringify(invalid))).toThrow();
    }
  });
  it('rejects malformed entity timestamps and category references before writing', () => {
    const source = backup();
    for (const invalid of [
      { ...source, groups: [{ ...source.groups[0], createdAt: 'invalid' }] },
      { ...source, categoryOrderByWorkspace: { 'workspace-two': ['folder:missing'] } },
    ]) expect(() => parseCompleteBackup(JSON.stringify(invalid))).toThrow();
  });
  it('retains OneTab import support', () => {
    expect(parseImportedText('[Example](https://example.com)')[0].tabs[0]).toMatchObject({ url: 'https://example.com', title: 'Example' });
  });
  it('authority restore keeps current backend and advances current revision', async () => {
    let stored = normalizeState({ ...createEmptyState(), mutationRevision: 4 });
    const persistence = createStatePersistence({ getState: async () => stored, setState: async state => { stored = state; } });
    const source = backup();
    const result = await persistence.applyMutations([restore(source, 4)]);
    expect(result).toMatchObject({ mutationRevision: 5, activeWorkspaceId: 'workspace-two', settings: { theme: 'dark', storageMode: 'browser', storageFolderName: '' } });
    expect(result.groups).toEqual(source.groups);
  });
  it('serialized worker passes the real previous snapshot to the browser authority', async () => {
    const old = normalizeState({ ...createEmptyState(), mutationRevision: 7 });
    const data: Record<string, unknown> = { [STATE_KEY]: old };
    vi.stubGlobal('chrome', { storage: { local: { get: async () => data, set: async (items: object) => Object.assign(data, items) } } });
    const adapter = createChromeStorageAdapter();
    const persistence = createStatePersistence({ getState: () => adapter.getState(), setState: (state, options) => adapter.setState(state, options) });
    await persistence.applyMutations([restore(backup(), 7)]);
    expect(data.tabboardBackupBeforeRestore).toEqual(old);
    expect(data[STATE_KEY]).toMatchObject({ mutationRevision: 8, activeWorkspaceId: 'workspace-two' });
  });
  it('checked store publishes only the confirmed restore and keeps backend settings', async () => {
    vi.resetModules();
    const old = createEmptyState();
    const source = backup();
    let complete: ((response: unknown) => void) | undefined;
    vi.stubGlobal('chrome', { runtime: { sendMessage: (message: { type: string }) => message.type === 'tabboard-ensure-state'
      ? Promise.resolve({ ok: true, result: old })
      : new Promise(resolve => { complete = resolve; }) } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...old, hydrated: true });
    const pending = useTabBoardStore.getState().restoreBackup(exportToJson(source), 0);
    await vi.waitFor(() => expect(complete).toBeDefined());
    expect(useTabBoardStore.getState().activeWorkspaceId).toBe('workspace_default');
    const persistence = createStatePersistence({ getState: async () => old, setState: async () => undefined });
    complete?.({ ok: true, result: await persistence.applyMutations([restore(source)]) });
    await pending;
    expect(useTabBoardStore.getState()).toMatchObject({ mutationRevision: 1, activeWorkspaceId: 'workspace-two', settings: { storageMode: 'browser', storageFolderName: '', theme: 'dark' } });
    useTabBoardStore.getState().releaseHydration();
  });
  it('stale restore rejects without overwriting or saving a recovery copy', async () => {
    const stored = normalizeState({ ...createEmptyState(), mutationRevision: 5 });
    const setState = vi.fn();
    const persistence = createStatePersistence({ getState: async () => stored, setState });
    await expect(persistence.applyMutations([restore(backup(), 4)])).rejects.toMatchObject({ code: 'BACKUP_REVISION_CONFLICT' });
    expect(setState).not.toHaveBeenCalled();
  });
  it('browser saves the previous normalized snapshot with the replacement', async () => {
    const old = createEmptyState();
    const data: Record<string, unknown> = { [STATE_KEY]: old };
    vi.stubGlobal('chrome', { storage: { local: { get: async () => data, set: async (items: object) => Object.assign(data, items) } } });
    await createChromeStorageAdapter().setState(backup(), { backupBeforeRestore: old });
    expect(data.tabboardBackupBeforeRestore).toEqual(old);
    expect(data[STATE_KEY]).toMatchObject({ activeWorkspaceId: 'workspace-two' });
  });
  it('file restores a full replacement, saves the previous snapshot, and preserves unread original bytes even on an ID collision', async () => {
    const warnings = captureUnreadWarnings();
    const root = createMemoryDirectory('Restore');
    const old = normalizeState({ ...createEmptyState(), groups: [createGroupFromTabRecords([createNoteRecord('Previous data')], { title: 'Old session' })] });
    const adapter = await createFileStorageAdapter(root);
    await adapter.setState(old);
    const source = backup();
    const sessions = await root.getDirectoryHandle('sessions');
    await atomicWriteFile(sessions, source.groups[0].id + '.json', '{broken');
    await atomicWriteFile(sessions, 'unread-original.json', '{unread');
    await adapter.reloadFromDisk();
    await adapter.setState(source, { backupBeforeRestore: old });
    const loaded = await initFileStorageDirectory(root);
    expect(loaded.state?.groups).toEqual(source.groups);
    const before = await readTextFile(await root.getFileHandle('.tabboard-before-restore.json'));
    expect(JSON.parse(before)).toEqual(old);
    const preserved = await root.getDirectoryHandle('.tabboard-unread-before-restore');
    expect(await readTextFile(await preserved.getFileHandle(source.groups[0].id + '.json'))).toBe('{broken');
    expect(loaded.unreadSessionFiles).toEqual(['unread-original.json']);
    expect(await readTextFile(await sessions.getFileHandle('unread-original.json'))).toBe('{unread');
    expect(await readTextFile(await preserved.getFileHandle('unread-original.json'))).toBe('{unread');
    expect(warnings.mock.calls.map(([message]) => message)).toEqual(Array(3).fill(expect.stringContaining('Corrupt session file')));
  });
  it('keeps both unread originals when a later restore encounters the same filename again', async () => {
    const warnings = captureUnreadWarnings();
    const root = createMemoryDirectory('Repeated restore');
    const adapter = await createFileStorageAdapter(root);
    const old = createEmptyState();
    await adapter.setState(old);
    const source = backup();
    const sessions = await root.getDirectoryHandle('sessions');
    const name = source.groups[0].id + '.json';
    for (const bytes of ['{first-broken', '{second-broken']) {
      await atomicWriteFile(sessions, name, bytes);
      await adapter.reloadFromDisk();
      await adapter.setState(source, { backupBeforeRestore: old });
    }
    const preserved = await root.getDirectoryHandle('.tabboard-unread-before-restore');
    const contents: string[] = [];
    for await (const [name] of preserved.entries()) contents.push(await readTextFile(await preserved.getFileHandle(name)));
    expect(contents.sort()).toEqual(['{first-broken', '{second-broken']);
    expect(warnings.mock.calls.map(([message]) => message)).toEqual(Array(2).fill(expect.stringContaining('Corrupt session file')));
  });
  it('preserves exact invalid UTF-8 bytes through repeated unread filename collisions', async () => {
    const warnings = captureUnreadWarnings();
    const root = createMemoryDirectory('Unread binary originals');
    const adapter = await createFileStorageAdapter(root);
    const old = createEmptyState();
    await adapter.setState(old);
    const source = backup();
    const sessions = await root.getDirectoryHandle('sessions');
    const name = source.groups[0].id + '.json';
    const originals = [[123, 255, 254, 125], [123, 192, 128, 125]];
    for (const bytes of originals) {
      const file = await sessions.getFileHandle(name, { create: true });
      const writable = await file.createWritable();
      await writable.write(new Uint8Array(bytes));
      await writable.close();
      await adapter.reloadFromDisk();
      await adapter.setState(source, { backupBeforeRestore: old });
    }
    const preserved = await root.getDirectoryHandle('.tabboard-unread-before-restore');
    const contents: number[][] = [];
    for await (const [name] of preserved.entries()) {
      const file = await (await preserved.getFileHandle(name)).getFile();
      contents.push([...new Uint8Array(await file.arrayBuffer())]);
    }
    expect(contents).toHaveLength(2);
    expect(contents).toEqual(expect.arrayContaining(originals));
    expect(warnings.mock.calls.map(([message]) => message)).toEqual(Array(2).fill(expect.stringContaining('Corrupt session file')));
    expect((await initFileStorageDirectory(root)).state?.groups).toEqual(source.groups);
  });
  it('saving the current file snapshot failing prevents replacement', async () => {
    const root = createMemoryDirectory('Restore failure');
    const old = createEmptyState();
    const adapter = await createFileStorageAdapter(root);
    await adapter.setState(old);
    const getFileHandle = root.getFileHandle.bind(root);
    vi.spyOn(root, 'getFileHandle').mockImplementation(async (name, options) => {
      if (name === '.tabboard-before-restore.json') throw new Error('disk full');
      return getFileHandle(name, options);
    });
    await expect(adapter.setState(backup(), { backupBeforeRestore: old })).rejects.toThrow('disk full');
    expect((await initFileStorageDirectory(root)).state).toEqual(old);
  });
});
