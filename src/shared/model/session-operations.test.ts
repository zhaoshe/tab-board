import { describe, expect, it } from 'vitest';
import { exportToText } from './import-export';
import { createEmptyState, createNoteRecord } from './schema';
import type {
  BinEntry,
  Folder,
  Group,
  TabBoardState,
  TabItem,
  Workspace,
} from './types';
import {
  importText,
  parseImportedText,
  restoreGroupFromBin,
} from './session-operations';

const timestamp = '2026-01-01T00:00:00.000Z';

function workspace(id: string): Workspace {
  return { id, name: id, emoji: '🗂️', createdAt: timestamp, updatedAt: timestamp };
}

function folder(id: string, workspaceId: string): Folder {
  return {
    id,
    name: id,
    color: 'slate',
    workspaceId,
    collapsed: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function tab(id: string, title = id, url = `https://${id}.test`): TabItem {
  return {
    id,
    itemType: 'link',
    title,
    url,
    favIconUrl: '',
    note: '',
    pinned: false,
    incognito: false,
    starred: false,
    taskStatus: 'none',
    browserGroup: null,
    sourceWindowId: null,
    sourceTabId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function group(
  id: string,
  workspaceId = 'workspace-a',
  overrides: Partial<Group> = {},
): Group {
  return {
    id,
    title: id,
    note: '',
    workspaceId,
    folderId: null,
    locked: false,
    starred: false,
    archived: false,
    collapsed: false,
    tabs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function state(overrides: Partial<TabBoardState> = {}): TabBoardState {
  return {
    ...createEmptyState(),
    workspaces: [workspace('workspace-a'), workspace('workspace-b')],
    activeWorkspaceId: 'workspace-a',
    folders: [
      folder('folder-a', 'workspace-a'),
      folder('folder-b', 'workspace-b'),
    ],
    groups: [],
    ...overrides,
  };
}

describe('shared session operations', () => {
  it('restores a group into its valid category at the original index', () => {
    const deleted = group('deleted', 'workspace-a', {
      folderId: 'folder-a',
      tabs: [tab('restored-tab')],
    });
    const entry: BinEntry = {
      id: 'restore-entry',
      kind: 'group',
      label: deleted.title,
      groupId: deleted.id,
      groupTitle: deleted.title,
      source: 'group',
      item: deleted,
      deletedAt: timestamp,
      originalWorkspaceId: 'workspace-a',
      originalFolderId: 'folder-a',
      originalIndex: 1,
    };
    const before = state({
      groups: [
        group('before', 'workspace-a', { folderId: 'folder-a' }),
        group('after', 'workspace-a', { folderId: 'folder-a' }),
      ],
      bin: [entry],
    });

    const next = restoreGroupFromBin(
      before,
      entry.id,
      '2026-02-01T00:00:00.000Z',
    );

    expect(next.groups.map(({ id }) => id)).toEqual([
      'before',
      'deleted',
      'after',
    ]);
    expect(next.groups[1]).toMatchObject({
      workspaceId: 'workspace-a',
      folderId: 'folder-a',
      createdAt: deleted.createdAt,
      updatedAt: '2026-02-01T00:00:00.000Z',
      tabs: [{
        id: 'restored-tab',
        createdAt: timestamp,
        updatedAt: '2026-02-01T00:00:00.000Z',
      }],
    });
    expect(next.bin).toEqual([]);
    expect(before.bin).toEqual([entry]);
  });

  it('resolves legacy restore placement from surviving group and folder evidence', () => {
    const deleted = group('legacy-deleted', 'workspace-a', {
      folderId: 'folder-a',
    });
    const entry: BinEntry = {
      id: 'legacy-entry',
      kind: 'group',
      label: deleted.title,
      groupId: 'stale-id',
      groupTitle: deleted.title,
      source: 'group',
      item: deleted,
      deletedAt: timestamp,
      originalGroupId: 'legacy-source',
      originalFolderId: 'folder-b',
    };
    const before = state({
      groups: [group('legacy-source', 'workspace-b')],
      bin: [entry],
    });

    const next = restoreGroupFromBin(before, entry.id, timestamp);

    expect(next.groups.find(({ id }) => id === deleted.id)).toMatchObject({
      workspaceId: 'workspace-b',
      folderId: 'folder-b',
      starred: false,
    });
  });

  it('parses Markdown OneTab and TabBoard text without turning headers into notes', () => {
    const markdown = parseImportedText(
      '# Project links\n'
      + '- [Alpha docs](https://alpha.example)\n'
      + '- [Beta docs](https://beta.example)',
    );
    expect(markdown).toHaveLength(1);
    expect(markdown[0]).toMatchObject({ title: 'Project links' });
    expect(markdown[0].tabs.map(({ title }) => title)).toEqual([
      'Alpha docs',
      'Beta docs',
    ]);

    const before = state({
      workspaces: [workspace('workspace-a')],
      folders: [folder('folder-a', 'workspace-a')],
      groups: [group('exported', 'workspace-a', {
        title: 'Session title',
        folderId: 'folder-a',
        tabs: [
          tab('docs', 'Docs title', 'https://docs.example'),
          createNoteRecord('First note', {
            id: 'note',
            title: 'First note',
            createdAt: timestamp,
            updatedAt: timestamp,
          }),
        ],
      })],
    });
    const roundTrip = parseImportedText(exportToText(before));

    expect(roundTrip).toHaveLength(1);
    expect(roundTrip[0]).toMatchObject({
      title: 'Session title',
      folderId: null,
      starred: false,
    });
    expect(roundTrip[0].tabs.map(({ itemType, title }) => [itemType, title]))
      .toEqual([
        ['link', 'Docs title'],
        ['note', 'First note'],
      ]);
  });

  it('imports groups into the requested target with regenerated IDs', () => {
    const before = state({
      groups: [group('existing', 'workspace-a', { starred: true })],
    });

    const after = importText(
      before,
      '# One\nhttps://one.example\n\n# Two\nhttps://two.example',
      { workspaceId: 'workspace-a', folderId: 'folder-a' },
    );
    const imported = after.groups.filter(({ id }) => id !== 'existing');

    expect(imported).toHaveLength(2);
    expect(imported.every((candidate) =>
      candidate.workspaceId === 'workspace-a'
      && candidate.folderId === 'folder-a'
      && !candidate.starred)).toBe(true);
    expect(new Set(imported.map(({ id }) => id)).size).toBe(2);
    expect(before.groups).toEqual([
      group('existing', 'workspace-a', { starred: true }),
    ]);
  });

  it('rejects invalid import targets without mutating input', () => {
    const before = state();
    const snapshot = structuredClone(before);

    expect(() => importText(before, 'https://example.com', {
      workspaceId: 'missing',
      folderId: null,
    })).toThrow('Workspace not found.');
    expect(() => importText(before, 'https://example.com', {
      workspaceId: 'workspace-a',
      folderId: 'folder-b',
    })).toThrow('Folder does not belong to the requested workspace.');
    expect(before).toEqual(snapshot);
  });
});
