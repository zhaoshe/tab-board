import { describe, expect, it } from 'vitest';
import type { Folder, Group, TabBoardState, Workspace } from './types';
import {
  categoryForGroup,
  categoryMatches,
  categoryOrder,
  insertGroupAtCategoryIndex,
  isOwnedCategory,
  moveSessionToCategory,
  reorderCategoryIds,
} from './categories';

const timestamp = '2026-01-01T00:00:00.000Z';

function workspace(id: string): Workspace {
  return {
    id,
    name: id,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
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
    version: 1,
    mutationRevision: 0,
    workspaces: [workspace('workspace-a'), workspace('workspace-b')],
    activeWorkspaceId: 'workspace-a',
    groups: [
      group('inbox'),
      group('folder-session', 'workspace-a', { folderId: 'folder-a' }),
      group('saved', 'workspace-a', { starred: true }),
      group('archived', 'workspace-a', { archived: true }),
    ],
    folders: [
      folder('folder-a', 'workspace-a'),
      folder('folder-b', 'workspace-b'),
    ],
    categoryOrderByWorkspace: {},
    bin: [],
    dropOperationLedger: [],
    settings: {
      actionClick: 'store',
      closeTabsAfterSave: true,
      dedupeOnSave: true,
      deleteRestoredTabs: true,
      customUrlFilter: '',
      excludePinned: false,
      focusRestoredTabs: true,
      includeChromeUrls: false,
      includeFileUrls: false,
      openManagerAfterSave: true,
      restoreGroupsInNewWindow: false,
      restoreNextToCurrent: true,
      theme: 'system',
      confirmBeforeDestructive: true,
      storageMode: 'browser',
      storageFolderName: '',
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe('shared session categories', () => {
  it('derives one canonical category and treats orphan folders as Inbox', () => {
    const board = state();

    expect(categoryForGroup(board, group('orphan', 'workspace-a', {
      folderId: 'missing',
    }))).toBe('inbox');
    expect(categoryForGroup(board, group('foldered', 'workspace-a', {
      folderId: 'folder-a',
    }))).toBe('folder:folder-a');
    expect(categoryForGroup(board, group('saved-group', 'workspace-a', {
      starred: true,
      archived: true,
      folderId: 'folder-a',
    }))).toBe('saved');
    expect(categoryForGroup(board, group('archived-group', 'workspace-a', {
      archived: true,
      folderId: 'folder-a',
    }))).toBe('archive');
    expect(categoryMatches(
      board,
      group('orphan', 'workspace-a', { folderId: 'missing' }),
      'inbox',
    )).toBe(true);
  });

  it('validates custom category ownership and canonicalizes category order', () => {
    const board = state({
      categoryOrderByWorkspace: {
        'workspace-a': ['folder-a', 'saved', 'missing', 'inbox'],
      },
    });

    expect(isOwnedCategory(board, 'folder:folder-a', 'workspace-a')).toBe(true);
    expect(isOwnedCategory(board, 'folder:folder-b', 'workspace-a')).toBe(false);
    expect(isOwnedCategory(board, 'folder:missing', 'workspace-a')).toBe(false);
    expect(categoryOrder(board, 'workspace-a')).toEqual([
      'folder:folder-a',
      'saved',
      'inbox',
      'archive',
    ]);
  });

  it('moves sessions immutably while preserving unrelated global order', () => {
    const before = state({
      groups: [
        group('folder-a-first', 'workspace-a', { folderId: 'folder-a' }),
        group('unrelated-a', 'workspace-a'),
        group('folder-a-second', 'workspace-a', { folderId: 'folder-a' }),
        group('moving', 'workspace-a'),
        group('other-workspace', 'workspace-b'),
      ],
    });
    const snapshot = structuredClone(before);

    const next = moveSessionToCategory(before, {
      groupId: 'moving',
      category: 'folder:folder-a',
      index: 1,
    }, '2026-01-02T00:00:00.000Z');

    expect(next.groups.map(({ id }) => id)).toEqual([
      'folder-a-first',
      'unrelated-a',
      'moving',
      'folder-a-second',
      'other-workspace',
    ]);
    expect(next.groups.find(({ id }) => id === 'moving')).toMatchObject({
      folderId: 'folder-a',
      starred: false,
      archived: false,
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(before).toEqual(snapshot);
  });

  it('keeps empty-category insertion in the source workspace block', () => {
    const before = state({
      groups: [
        group('source', 'workspace-a'),
        group('other-workspace', 'workspace-b'),
        group('remaining', 'workspace-a'),
      ],
    });

    const next = moveSessionToCategory(before, {
      groupId: 'source',
      category: 'saved',
      index: 0,
    });

    expect(next.groups.map(({ id }) => id)).toEqual([
      'other-workspace',
      'remaining',
      'source',
    ]);
  });

  it('rejects invalid session move ownership and indexes', () => {
    const board = state();

    expect(() => moveSessionToCategory(board, {
      groupId: 'missing',
      category: 'inbox',
      index: 0,
    })).toThrow('Group not found: missing.');
    expect(() => moveSessionToCategory(board, {
      groupId: 'inbox',
      category: 'inbox',
      index: Number.NaN,
    })).toThrow('Session index must be finite.');
    expect(() => moveSessionToCategory(board, {
      groupId: 'inbox',
      category: 'folder:folder-b',
      index: 0,
    })).toThrow('Target category is outside the group workspace.');
    expect(() => moveSessionToCategory(board, {
      groupId: 'inbox',
      category: 'folder:missing',
      index: 0,
    })).toThrow('Target category does not exist.');
  });

  it('reorders categories and inserts new sessions through the same semantics', () => {
    expect(reorderCategoryIds(
      ['inbox', 'folder:folder-a', 'saved'],
      'saved',
      'folder:folder-a',
      'before',
    )).toEqual(['inbox', 'saved', 'folder:folder-a']);

    const board = state({
      groups: [
        group('inbox-a'),
        group('saved-a', 'workspace-a', { starred: true }),
        group('other', 'workspace-b'),
      ],
    });
    const inserted = insertGroupAtCategoryIndex(
      board,
      group('saved-b'),
      'saved',
      1,
      undefined,
      '2026-01-02T00:00:00.000Z',
    );

    expect(inserted.groups.map(({ id }) => id)).toEqual([
      'inbox-a',
      'saved-a',
      'saved-b',
      'other',
    ]);
    expect(inserted.groups.find(({ id }) => id === 'saved-b')).toMatchObject({
      starred: true,
      archived: false,
      folderId: null,
    });
  });
});
