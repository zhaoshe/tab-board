import { describe, expect, it } from 'vitest';
import { createEmptyState, normalizeState } from './schema';
import type { DropIntent } from './drop-intent';
import type {
  Folder,
  Group,
  TabBoardState,
  TabItem,
  Workspace,
} from './types';
import type { OpenTabInfo } from '../openTabs';
import { MAX_ENTITY_ID_BYTES, utf8ByteLength } from '../validation';
import {
  dropOperationGroupId,
  dropOperationTabId,
  executeDropIntent,
  getDropIntentReplayStatus,
  getDropOperationDigest,
  isDropIntentAlreadyApplied,
} from './drop-operations';

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

function tab(id: string): TabItem {
  return {
    id,
    itemType: 'link',
    title: id,
    url: `https://${id}.test`,
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
    categoryOrderByWorkspace: {
      'workspace-a': ['inbox', 'saved', 'folder:folder-a'],
    },
    groups: [
      group('source', 'workspace-a', {
        tabs: [tab('a'), tab('b'), tab('c')],
      }),
      group('target', 'workspace-a', {
        tabs: [tab('target-a')],
      }),
      group('folder-group', 'workspace-a', {
        folderId: 'folder-a',
        tabs: [tab('folder-tab')],
      }),
      group('other-workspace', 'workspace-b', {
        tabs: [tab('other-tab')],
      }),
    ],
    ...overrides,
  };
}

function openTab(id: number): OpenTabInfo {
  return {
    id,
    windowId: 7,
    title: `Open ${id}`,
    url: `https://open-${id}.test`,
    favIconUrl: '',
    pinned: false,
    index: id,
    browserGroup: null,
    storable: true,
    reason: null,
  };
}

describe('shared drop operations', () => {
  it('bounds generated entity IDs without changing short operation IDs', () => {
    const shortId = 'short-operation';
    const longId = 'x'.repeat(127) + 'a';
    const otherLongId = 'x'.repeat(127) + 'b';

    expect(dropOperationGroupId(shortId)).toBe('drop_short-operation_group');
    expect(dropOperationTabId(shortId, 42))
      .toBe('drop_short-operation_tab_42');
    expect(utf8ByteLength(dropOperationGroupId(longId)))
      .toBeLessThanOrEqual(MAX_ENTITY_ID_BYTES);
    expect(utf8ByteLength(dropOperationTabId(longId, 42)))
      .toBeLessThanOrEqual(MAX_ENTITY_ID_BYTES);
    expect(dropOperationGroupId(longId))
      .not.toBe(dropOperationGroupId(otherLongId));
  });

  it('executes all five intent kinds immutably', () => {
    const before = state();
    const openTabs = [openTab(101), openTab(102)];
    const intents: DropIntent[] = [
      {
        kind: 'move-session',
        groupId: 'source',
        category: 'folder:folder-a',
        index: 1,
        workspaceId: 'workspace-a',
      },
      {
        kind: 'reorder-category',
        categoryId: 'folder:folder-a',
        targetCategoryId: 'saved',
        placement: 'before',
        workspaceId: 'workspace-a',
        expectedCategoryOrder: [
          'inbox',
          'saved',
          'bookmarks',
          'archive',
          'folder:folder-a',
        ],
      },
      {
        kind: 'move-tabs',
        refs: [
          { groupId: 'source', tabId: 'b' },
          { groupId: 'source', tabId: 'c' },
        ],
        targetGroupId: 'target',
        targetIndex: 1,
        workspaceId: 'workspace-a',
      },
      {
        kind: 'copy-open-tabs',
        tabIds: [101, 102],
        windowId: 7,
        targetGroupId: 'target',
        targetIndex: 1,
        workspaceId: 'workspace-a',
      },
      {
        kind: 'create-session',
        source: {
          kind: 'saved-tabs',
          refs: [{ groupId: 'source', tabId: 'b' }],
        },
        category: 'folder:folder-a',
        index: 1,
        workspaceId: 'workspace-a',
      },
      {
        kind: 'create-session',
        source: {
          kind: 'open-tabs',
          tabIds: [101, 102],
          windowId: 7,
        },
        category: 'saved',
        index: 0,
        workspaceId: 'workspace-a',
      },
    ];

    const movedSession = executeDropIntent(
      before,
      intents[0],
      [],
      'move-session-operation',
      timestamp,
    );
    const reordered = executeDropIntent(
      before,
      intents[1],
      [],
      'reorder-operation',
      timestamp,
    );
    const movedTabs = executeDropIntent(
      before,
      intents[2],
      [],
      'move-tabs-operation',
      timestamp,
    );
    const copiedTabs = executeDropIntent(
      before,
      intents[3],
      openTabs,
      'copy-tabs-operation',
      timestamp,
    );
    const savedSession = executeDropIntent(
      before,
      intents[4],
      [],
      'saved-session-operation',
      timestamp,
    );
    const openSession = executeDropIntent(
      before,
      intents[5],
      openTabs,
      'open-session-operation',
      timestamp,
    );

    expect(movedSession.groups.find(({ id }) => id === 'source'))
      .toMatchObject({ folderId: 'folder-a' });
    expect(reordered.categoryOrderByWorkspace['workspace-a']).toEqual([
      'inbox',
      'folder:folder-a',
      'saved',
      'bookmarks',
      'archive',
    ]);
    expect(movedTabs.groups.find(({ id }) => id === 'target')?.tabs
      .map(({ id }) => id)).toEqual(['target-a', 'b', 'c']);
    expect(copiedTabs.groups.find(({ id }) => id === 'target')?.tabs)
      .toHaveLength(3);
    expect(savedSession.groups.find(
      ({ id }) => id === dropOperationGroupId('saved-session-operation'),
    )?.tabs.map(({ id }) => id)).toEqual(['b']);
    expect(openSession.groups.find(
      ({ id }) => id === dropOperationGroupId('open-session-operation'),
    )).toMatchObject({ starred: true, folderId: null });
    expect(before.groups.find(({ id }) => id === 'source')?.tabs
      .map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the existing saved tab but replaces its title from a duplicate saved-tab drop', () => {
    const existing = {
      ...tab('existing'),
      title: 'Temporary title',
      url: 'https://duplicate.test',
      note: 'Keep this note',
      favIconUrl: 'https://duplicate.test/old.ico',
    };
    const incoming = {
      ...tab('incoming'),
      title: 'Loaded title',
      url: existing.url,
      note: 'Discard this note',
      favIconUrl: 'https://duplicate.test/new.ico',
    };
    const before = state({
      groups: [
        group('source', 'workspace-a', {
          tabs: [tab('source-before'), incoming, tab('source-after')],
        }),
        group('target', 'workspace-a', {
          tabs: [tab('target-before'), existing, tab('target-after')],
        }),
      ],
    });
    const result = normalizeState(executeDropIntent(before, {
      kind: 'move-tabs',
      refs: [{ groupId: 'source', tabId: incoming.id }],
      targetGroupId: 'target',
      targetIndex: 0,
      workspaceId: 'workspace-a',
    }, [], 'saved-duplicate', timestamp));
    const target = result.groups.find(({ id }) => id === 'target');

    expect(target?.tabs.map(({ id }) => id)).toEqual([
      'target-before',
      existing.id,
      'target-after',
    ]);
    expect(target?.tabs[1]).toEqual({
      ...existing,
      title: incoming.title,
    });
  });

  it('uses the first dragged open-tab title while preserving a duplicate saved tab', () => {
    const existing = {
      ...tab('existing'),
      title: 'Temporary title',
      url: 'https://duplicate.test',
      note: 'Keep this note',
      favIconUrl: 'https://duplicate.test/old.ico',
    };
    const first = {
      ...openTab(101),
      title: 'First loaded title',
      url: existing.url,
      favIconUrl: 'https://duplicate.test/first.ico',
    };
    const second = {
      ...openTab(102),
      title: 'Second loaded title',
      url: existing.url,
      favIconUrl: 'https://duplicate.test/second.ico',
    };
    const before = state({
      groups: [
        group('target', 'workspace-a', {
          tabs: [tab('target-before'), existing, tab('target-after')],
        }),
      ],
    });
    const result = normalizeState(executeDropIntent(before, {
      kind: 'copy-open-tabs',
      tabIds: [first.id!, second.id!],
      windowId: first.windowId!,
      targetGroupId: 'target',
      targetIndex: 0,
      workspaceId: 'workspace-a',
    }, [first, second], 'open-duplicate', timestamp));
    const target = result.groups.find(({ id }) => id === 'target');

    expect(target?.tabs.map(({ id }) => id)).toEqual([
      'target-before',
      existing.id,
      'target-after',
    ]);
    expect(target?.tabs[1]).toEqual({
      ...existing,
      title: first.title,
    });
  });

  it('rejects forged workspace intents and partial source references', () => {
    const before = state();
    const forged: DropIntent = {
      kind: 'move-session',
      groupId: 'source',
      category: 'inbox',
      index: 0,
      workspaceId: 'workspace-b',
    };
    const partial: DropIntent = {
      kind: 'create-session',
      source: {
        kind: 'saved-tabs',
        refs: [
          { groupId: 'source', tabId: 'b' },
          { groupId: 'source', tabId: 'missing' },
        ],
      },
      category: 'inbox',
      index: 0,
      workspaceId: 'workspace-a',
    };

    expect(executeDropIntent(before, forged)).toBe(before);
    expect(executeDropIntent(before, partial)).toBe(before);
  });

  it('recognizes stable generated replay after ledger eviction', () => {
    const before = state();
    const intent: DropIntent = {
      kind: 'create-session',
      source: {
        kind: 'open-tabs',
        tabIds: [101, 102],
        windowId: 7,
      },
      category: 'inbox',
      index: 0,
      workspaceId: 'workspace-a',
    };
    const openTabs = [openTab(101), openTab(102)];
    const operationId = 'stable-open-session';
    const applied = executeDropIntent(
      before,
      intent,
      openTabs,
      operationId,
      timestamp,
    );

    expect(getDropIntentReplayStatus(
      applied,
      intent,
      openTabs,
      operationId,
    )).toBe('complete');
    expect(isDropIntentAlreadyApplied(
      applied,
      intent,
      openTabs,
      operationId,
    )).toBe(true);

    const generated = applied.groups.find(
      ({ id }) => id === dropOperationGroupId(operationId),
    );
    if (!generated) throw new Error('Generated session missing.');
    const conflicting = {
      ...applied,
      groups: applied.groups.map((candidate) =>
        candidate.id === generated.id
          ? {
            ...candidate,
            tabs: candidate.tabs.map((item, index) => index === 0
              ? { ...item, url: 'https://conflicting.test' }
              : item),
          }
          : candidate),
    };
    expect(getDropIntentReplayStatus(
      conflicting,
      intent,
      openTabs,
      operationId,
    )).toBe('conflict');
  });

  it('uses the canonical digest for ledger replay evidence', () => {
    const before = state();
    const intent: DropIntent = {
      kind: 'move-session',
      groupId: 'source',
      category: 'saved',
      index: 0,
      workspaceId: 'workspace-a',
    };
    const digest = getDropOperationDigest(intent, []);
    const withLedger: TabBoardState = {
      ...before,
      dropOperationLedger: [{
        operationId: 'ledger-operation',
        digest,
        appliedAt: timestamp,
      }],
    };

    expect(isDropIntentAlreadyApplied(
      withLedger,
      intent,
      [],
      'ledger-operation',
    )).toBe(true);
    expect(getDropIntentReplayStatus(
      withLedger,
      intent,
      [],
      'ledger-operation',
    )).toBe('complete');
  });
});
