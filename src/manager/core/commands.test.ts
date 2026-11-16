import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyState, exportToText } from '../../shared/model';
import type { BinEntry, Folder, Group, TabBoardState, Workspace } from '../../shared/model';
import {
  restoreGroupFromBin,
} from '../../shared/model/session-operations';
import {
  moveSessionToCategory,
  reorderCategoryIds,
} from '../../shared/model/categories';
import {
  dropOperationGroupId,
  dropOperationTabId,
  executeDropIntent,
  getDropIntentReplayStatus,
} from '../../shared/model/drop-operations';
import { applyStateMutation, type StateMutation } from '../../shared/store/stateMutations';
import { MAX_ENTITY_ID_BYTES, utf8ByteLength } from '../../shared/store/mutationValidation';
import { resetActiveAdapterForTests } from '../../shared/store/activeAdapter';
import { useTabBoardStore } from '../../shared/store/useTabBoardStore';

const timestamp = '2026-01-01T00:00:00.000Z';

function workspace(id: string): Workspace {
  return { id, name: id, emoji: '🗂️', createdAt: timestamp, updatedAt: timestamp };
}

function folder(id: string, workspaceId: string, name = id): Folder {
  return {
    id,
    name,
    color: 'slate',
    workspaceId,
    collapsed: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function group(id: string, workspaceId: string, overrides: Partial<Group> = {}): Group {
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
    folders: [folder('folder-a', 'workspace-a'), folder('folder-b', 'workspace-b')],
    groups: [
      group('group-1', 'workspace-a', { starred: true, folderId: null }),
      group('group-2', 'workspace-a', { folderId: 'folder-a' }),
      group('group-3', 'workspace-a', { folderId: 'folder-a' }),
      group('other-workspace', 'workspace-b'),
    ],
    ...overrides,
  };
}

function groupById(board: TabBoardState, id: string): Group {
  const value = board.groups.find((item) => item.id === id);
  if (!value) throw new Error(`Missing group ${id}`);
  return value;
}

function savedTab(id: string) {
  return {
    id,
    itemType: 'link' as const,
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

describe('category commands', () => {
  it('bounds generated operation entity IDs without changing short IDs', () => {
    const shortOperationId = 'short-operation';
    const longOperationId = 'x'.repeat(127) + 'a';
    const otherLongOperationId = 'x'.repeat(127) + 'b';

    expect(dropOperationGroupId(shortOperationId)).toBe('drop_short-operation_group');
    expect(dropOperationTabId(shortOperationId, 42)).toBe('drop_short-operation_tab_42');
    expect(utf8ByteLength(dropOperationGroupId(longOperationId))).toBeLessThanOrEqual(MAX_ENTITY_ID_BYTES);
    expect(utf8ByteLength(dropOperationTabId(longOperationId, 42))).toBeLessThanOrEqual(MAX_ENTITY_ID_BYTES);
    expect(dropOperationGroupId(longOperationId)).toBe(dropOperationGroupId(longOperationId));
    expect(dropOperationTabId(longOperationId, 42)).toBe(dropOperationTabId(longOperationId, 42));
    expect(dropOperationGroupId(longOperationId)).not.toBe(dropOperationGroupId(otherLongOperationId));
  });

  it('preserves unrelated empty groups when moving saved tabs', () => {
    const before = state({
      groups: [
        group('source', 'workspace-a', { tabs: [savedTab('moved')] }),
        group('target', 'workspace-a', { tabs: [savedTab('existing')] }),
        group('unrelated-empty', 'workspace-a'),
      ],
    });

    const next = executeDropIntent(before, {
      kind: 'move-tabs',
      refs: [{ groupId: 'source', tabId: 'moved' }],
      targetGroupId: 'target',
      targetIndex: 1,
      workspaceId: 'workspace-a',
    });

    expect(next.groups.map(({ id }) => id)).toEqual(['target', 'unrelated-empty']);
    expect(groupById(next, 'target').tabs.map(({ id }) => id)).toEqual(['existing', 'moved']);
  });

  it('preserves unrelated empty groups when creating a session from saved tabs', () => {
    const before = state({
      groups: [
        group('source', 'workspace-a', { tabs: [savedTab('moved')] }),
        group('unrelated-empty', 'workspace-a'),
      ],
    });

    const next = executeDropIntent(before, {
      kind: 'create-session',
      source: { kind: 'saved-tabs', refs: [{ groupId: 'source', tabId: 'moved' }] },
      category: 'inbox',
      index: 0,
      workspaceId: 'workspace-a',
    });

    expect(next.groups.map(({ id }) => id)).toContain('unrelated-empty');
    expect(next.groups).toHaveLength(2);
    expect(next.groups.find(({ id }) => id !== 'unrelated-empty')?.tabs.map(({ id }) => id)).toEqual(['moved']);
  });

  it('replays saved-tab session creation with refs treated as an unordered set after ledger eviction', () => {
    const first = savedTab('saved-order-a');
    const second = savedTab('saved-order-b');
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'saved-order-replay',
      intent: {
        kind: 'create-session',
        source: { kind: 'saved-tabs', refs: [
          { groupId: 'saved-order-source', tabId: second.id },
          { groupId: 'saved-order-source', tabId: first.id },
        ] },
        category: 'inbox',
        index: 0,
        workspaceId: 'workspace-a',
      },
      openTabs: [],
      updatedAt: timestamp,
    };
    const before = state({
      groups: [group('saved-order-source', 'workspace-a', { tabs: [first, second] }), group('saved-order-other', 'workspace-a')],
    });

    const once = applyStateMutation(before, mutation);
    const generated = once.groups.find((item) => item.id === 'drop_saved-order-replay_group');
    if (!generated) throw new Error('Generated saved-tab session missing.');
    expect(generated.tabs.map(({ id }) => id)).toEqual([first.id, second.id]);

    const evicted = { ...once, dropOperationLedger: [] };
    expect(getDropIntentReplayStatus(evicted, mutation.intent, mutation.openTabs, mutation.operationId)).toBe('complete');
    const replayed = applyStateMutation(evicted, mutation);

    expect(replayed).toEqual(evicted);
    expect(replayed.mutationRevision).toBe(evicted.mutationRevision);
  });

  it('rejects ledger-evicted replay when saved refs and generated tabs duplicate an ID', () => {
    const duplicate = savedTab('saved-duplicate');
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'saved-duplicate-replay',
      intent: {
        kind: 'create-session',
        source: { kind: 'saved-tabs', refs: [
          { groupId: 'saved-duplicate-source', tabId: duplicate.id },
          { groupId: 'saved-duplicate-source', tabId: duplicate.id },
        ] },
        category: 'inbox',
        index: 0,
        workspaceId: 'workspace-a',
      },
      openTabs: [],
      updatedAt: timestamp,
    };
    const evicted = state({
      groups: [group(dropOperationGroupId(mutation.operationId), 'workspace-a', {
        tabs: [duplicate, { ...duplicate }],
      })],
      dropOperationLedger: [],
    });
    const snapshot = structuredClone(evicted);

    expect(getDropIntentReplayStatus(
      evicted,
      mutation.intent,
      mutation.openTabs,
      mutation.operationId,
    )).toBe('conflict');
    expect(() => applyStateMutation(evicted, mutation)).toThrow('Stable generated drop entity IDs are partially occupied.');
    expect(evicted).toEqual(snapshot);
    expect(evicted.mutationRevision).toBe(snapshot.mutationRevision);
  });

  it('moves a folder session and clears starred without mutating input', () => {
    const before = state();
    const snapshot = structuredClone(before);

    const next = moveSessionToCategory(before, {
      groupId: 'group-1',
      category: 'folder:folder-a',
      index: 0,
    });

    expect(groupById(next, 'group-1')).toMatchObject({ folderId: 'folder-a', starred: false });
    expect(next).not.toBe(before);
    expect(before).toEqual(snapshot);
  });

  it('moves a session to Starred and clears folderId', () => {
    const next = moveSessionToCategory(state(), {
      groupId: 'group-2',
      category: 'saved',
      index: 0,
    });

    expect(groupById(next, 'group-2')).toMatchObject({ folderId: null, starred: true });
  });

  it('keeps an empty-category move inside the source workspace block', () => {
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

    expect(next.groups.map(({ id }) => id)).toEqual(['other-workspace', 'remaining', 'source']);
  });

  it('keeps the original global position when the source workspace becomes empty', () => {
    const before = state({
      groups: [group('source', 'workspace-a'), group('other-workspace', 'workspace-b')],
    });

    const next = moveSessionToCategory(before, {
      groupId: 'source',
      category: 'saved',
      index: 0,
    });

    expect(next.groups.map(({ id }) => id)).toEqual(['source', 'other-workspace']);
  });

  it('moves a session to Inbox and clears both folder and starred', () => {
    const next = moveSessionToCategory(
      state({ groups: [group('group-1', 'workspace-a', { starred: true, folderId: null })] }),
      { groupId: 'group-1', category: 'inbox', index: 0 },
    );

    expect(groupById(next, 'group-1')).toMatchObject({ folderId: null, starred: false });
  });

  it('rejects unknown groups, non-finite indexes, and folders outside the group workspace', () => {
    const board = state();

    expect(() => moveSessionToCategory(board, {
      groupId: 'missing',
      category: 'inbox',
      index: 0,
    })).toThrow('Group not found: missing.');
    expect(() => moveSessionToCategory(board, {
      groupId: 'group-1',
      category: 'inbox',
      index: Number.NaN,
    })).toThrow('Session index must be finite.');
    expect(() => moveSessionToCategory(board, {
      groupId: 'group-1',
      category: 'folder:folder-b',
      index: 0,
    })).toThrow('Target category is outside the group workspace.');
    expect(() => moveSessionToCategory(board, {
      groupId: 'group-1',
      category: 'folder:missing',
      index: 0,
    })).toThrow('Target category does not exist.');
  });

  it('preserves unrelated group order while inserting at a category index', () => {
    const board = state({
      groups: [
        group('a', 'workspace-a', { folderId: 'folder-a' }),
        group('unrelated-1', 'workspace-a'),
        group('b', 'workspace-a', { folderId: 'folder-a' }),
        group('unrelated-2', 'workspace-a'),
        group('other-workspace-category', 'workspace-b', { folderId: 'folder-a' }),
      ],
    });

    const next = moveSessionToCategory(board, {
      groupId: 'unrelated-2',
      category: 'folder:folder-a',
      index: 1,
    });

    expect(next.groups.map(({ id }) => id)).toEqual([
      'a',
      'unrelated-1',
      'unrelated-2',
      'b',
      'other-workspace-category',
    ]);
    expect(board.groups.map(({ id }) => id)).toEqual([
      'a',
      'unrelated-1',
      'b',
      'unrelated-2',
      'other-workspace-category',
    ]);
  });

  it('reorders before and after without mutating the source array', () => {
    const source = ['inbox', 'folder:a', 'folder:b', 'saved'];

    const before = reorderCategoryIds(source, 'folder:b', 'folder:a', 'before');
    const after = reorderCategoryIds(source, 'folder:a', 'folder:b', 'after');

    expect(before).toEqual(['inbox', 'folder:b', 'folder:a', 'saved']);
    expect(after).toEqual(['inbox', 'folder:b', 'folder:a', 'saved']);
    expect(before).not.toBe(source);
    expect(after).not.toBe(source);
    expect(source).toEqual(['inbox', 'folder:a', 'folder:b', 'saved']);
    expect(reorderCategoryIds(source, 'missing', 'folder:a', 'before')).toEqual(source);
  });

  it('restores a group into its valid original folder and removes its bin entry', () => {
    const original = group('deleted', 'workspace-a', { folderId: 'folder-a' });
    const entry: BinEntry = {
      id: 'bin-1',
      kind: 'group',
      label: original.title,
      groupId: original.id,
      groupTitle: original.title,
      source: 'group',
      item: original,
      deletedAt: timestamp,
      originalWorkspaceId: 'workspace-a',
      originalFolderId: 'folder-a',
    };
    const before = state({ groups: [], bin: [entry] });

    const next = restoreGroupFromBin(before, entry.id);
    const restored = next.groups[0];

    expect(restored).toMatchObject({ workspaceId: 'workspace-a', folderId: 'folder-a', starred: false });
    expect(restored.id).toBe(original.id);
    expect(next.bin).toEqual([]);
    expect(before.groups).toEqual([]);
    expect(before.bin).toEqual([entry]);
  });

  it('resolves legacy group restore workspace from surviving group before folder and snapshot data', () => {
    const original = group('legacy-placement-group', 'workspace-a', { folderId: 'folder-a' });
    const entry: BinEntry = {
      id: 'legacy-placement-entry',
      kind: 'group',
      label: original.title,
      groupId: 'stale-group-id',
      groupTitle: original.title,
      source: 'group',
      item: original,
      deletedAt: timestamp,
      originalGroupId: 'legacy-placement-source',
      originalFolderId: 'folder-b',
    };
    const before = state({
      folders: [folder('folder-a', 'workspace-a'), folder('folder-b', 'workspace-b')],
      groups: [group('legacy-placement-source', 'workspace-b'), group('active-inbox', 'workspace-a')],
      bin: [entry],
    });

    const next = restoreGroupFromBin(before, entry.id, timestamp);

    expect(next.groups.find(({ id }) => id === original.id)).toMatchObject({
      workspaceId: 'workspace-b',
      folderId: 'folder-b',
      starred: false,
    });
    expect(next.bin).toEqual([]);
  });

  it('resolves legacy group restore workspace from a surviving folder when group is gone', () => {
    const original = group('legacy-folder-placement-group', 'workspace-a', { folderId: 'folder-a' });
    const entry: BinEntry = {
      id: 'legacy-folder-placement-entry',
      kind: 'group',
      label: original.title,
      groupId: original.id,
      groupTitle: original.title,
      source: 'group',
      item: original,
      deletedAt: timestamp,
      originalFolderId: 'folder-b',
    };
    const next = restoreGroupFromBin(state({
      folders: [folder('folder-a', 'workspace-a'), folder('folder-b', 'workspace-b')],
      groups: [group('active-inbox', 'workspace-a')],
      bin: [entry],
    }), entry.id, timestamp);

    expect(next.groups.find(({ id }) => id === original.id)).toMatchObject({
      workspaceId: 'workspace-b',
      folderId: 'folder-b',
    });
  });

  it('preserves group and tab creation metadata while updating restore timestamps', () => {
    const originalTab = { ...savedTab('original-tab'), createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2021-01-01T00:00:00.000Z' };
    const original = group('metadata-group', 'workspace-a', {
      createdAt: '2020-02-01T00:00:00.000Z',
      updatedAt: '2021-02-01T00:00:00.000Z',
      tabs: [originalTab],
    });
    const entry: BinEntry = {
      id: 'metadata-bin',
      kind: 'group',
      label: original.title,
      groupId: original.id,
      groupTitle: original.title,
      source: 'group',
      item: original,
      deletedAt: timestamp,
      originalWorkspaceId: 'workspace-a',
      originalFolderId: null,
    };

    const restored = restoreGroupFromBin(
      state({ groups: [], bin: [entry] }),
      entry.id,
      '2026-02-01T00:00:00.000Z',
    ).groups[0];

    expect(restored).toMatchObject({
      createdAt: original.createdAt,
      updatedAt: '2026-02-01T00:00:00.000Z',
      tabs: [{ createdAt: originalTab.createdAt, updatedAt: '2026-02-01T00:00:00.000Z' }],
    });
  });

  it('restores deleted group at its original order when index is available', () => {
    const entry: BinEntry = {
      id: 'bin-ordered',
      kind: 'group',
      label: 'Deleted',
      groupId: 'deleted',
      groupTitle: 'Deleted',
      source: 'group',
      item: group('deleted', 'workspace-a'),
      deletedAt: timestamp,
      originalWorkspaceId: 'workspace-a',
      originalFolderId: null,
      originalIndex: 1,
    };
    const before = state({
      groups: [group('before', 'workspace-a'), group('after', 'workspace-a')],
      workspaces: [workspace('workspace-a')],
      bin: [entry],
    });

    const next = restoreGroupFromBin(before, entry.id);

    expect(next.groups.map(({ title }) => title)).toEqual(['before', 'deleted', 'after']);
  });

  it('falls back to Inbox when the original folder is invalid or the group is starred', () => {
    const invalidFolderGroup = group('invalid-folder', 'workspace-a', { folderId: 'folder-a' });
    const starredGroup = group('saved', 'workspace-a', { starred: true, folderId: 'folder-a' });
    const entries: BinEntry[] = [
      {
        id: 'bin-invalid',
        kind: 'group',
        label: invalidFolderGroup.title,
        groupId: invalidFolderGroup.id,
        groupTitle: invalidFolderGroup.title,
        source: 'group',
        item: invalidFolderGroup,
        deletedAt: timestamp,
        originalWorkspaceId: 'workspace-a',
        originalFolderId: 'folder-b',
      },
      {
        id: 'bin-starred',
        kind: 'group',
        label: starredGroup.title,
        groupId: starredGroup.id,
        groupTitle: starredGroup.title,
        source: 'group',
        item: starredGroup,
        deletedAt: timestamp,
        originalWorkspaceId: 'workspace-a',
        originalFolderId: 'folder-a',
      },
    ];
    const before = state({ groups: [], folders: [folder('folder-a', 'workspace-a')], bin: entries });

    const invalidFolderNext = restoreGroupFromBin(before, 'bin-invalid');
    const starredNext = restoreGroupFromBin(invalidFolderNext, 'bin-starred');

    expect(invalidFolderNext.groups[0]).toMatchObject({ folderId: null, starred: false });
    expect(starredNext.groups[1]).toMatchObject({ folderId: null, starred: true });
    expect(starredNext.bin).toEqual([]);
  });
});

describe('store category mutation lock', () => {
  afterEach(() => {
    resetActiveAdapterForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function waitForPendingWrites(
    pendingWrites: Array<() => void>,
    count: number,
  ): Promise<void> {
    for (let attempt = 0; attempt < 100 && pendingWrites.length < count; attempt += 1) {
      await Promise.resolve();
    }
    if (pendingWrites.length < count) {
      throw new Error(`Expected ${count} pending storage writes, received ${pendingWrites.length}.`);
    }
  }

  it('validates two queued creates against the latest state', async () => {
    vi.useFakeTimers();
    let storedState: unknown = createEmptyState();
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ tabboardState: storedState })),
          set: vi.fn(async (value: { tabboardState: unknown }) => {
            storedState = value.tabboardState;
          }),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    let tail = Promise.resolve();
    vi.stubGlobal('navigator', {
      locks: {
        request: vi.fn((_name: string, _options: unknown, callback: () => Promise<void>) => {
          const run = tail.then(callback);
          tail = run.then(() => undefined, () => undefined);
          return run;
        }),
      },
    });

    useTabBoardStore.setState({ ...createEmptyState(), hydrated: true });
    const first = useTabBoardStore.getState().addFolder('workspace_default', ' Work ');
    const second = useTabBoardStore.getState().addFolder('workspace_default', 'work');

    await expect(first).resolves.toBeUndefined();
    await expect(second).rejects.toThrow('A category with this name already exists in this workspace.');
    expect(useTabBoardStore.getState().folders).toHaveLength(1);
    vi.runAllTimers();
  });

  it('rejects a duplicate found in the latest persisted state', async () => {
    vi.useFakeTimers();
    const persisted = state({
      folders: [folder('persisted-folder', 'workspace-a', 'Existing')],
    });
    let storedState: unknown = persisted;
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ tabboardState: storedState })),
          set: vi.fn(async (value: { tabboardState: unknown }) => {
            storedState = value.tabboardState;
          }),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    useTabBoardStore.setState({ ...state({ folders: [] }), hydrated: true });

    await expect(useTabBoardStore.getState().addFolder('workspace-a', ' existing ')).rejects.toThrow(
      'A category with this name already exists in this workspace.',
    );
    expect(useTabBoardStore.getState().folders).toEqual([]);
    vi.runAllTimers();
  });

  it('preserves an ordinary mutation before a category mutation in memory and storage', async () => {
    vi.useFakeTimers();
    let storedState: unknown = createEmptyState();
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ tabboardState: storedState })),
          set: vi.fn(async (value: { tabboardState: unknown }) => {
            storedState = value.tabboardState;
          }),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    const groupInput = group('saved-group', 'workspace_default');
    useTabBoardStore.setState({ ...createEmptyState(), hydrated: true });

    useTabBoardStore.getState().addGroup(groupInput);
    const folderPromise = useTabBoardStore.getState().addFolder('workspace_default', 'Saved folder');
    await folderPromise;

    expect(useTabBoardStore.getState().groups.map((item) => item.title)).toContain('saved-group');
    expect(useTabBoardStore.getState().folders.map((item) => item.name)).toContain('Saved folder');
    vi.runAllTimers();
    await Promise.resolve();
    const persisted = storedState as TabBoardState;
    expect(persisted.groups.map((item) => item.title)).toContain('saved-group');
    expect(persisted.folders.map((item) => item.name)).toContain('Saved folder');
  });

  it('canonicalizes prefixed persisted category order for text export', () => {
    const legacy = state({
      folders: [
        folder('folder-a', 'workspace-a', 'Folder A'),
        folder('folder-b', 'workspace-a', 'Folder B'),
      ],
      groups: [
        group('group-a', 'workspace-a', { folderId: 'folder-a' }),
        group('group-b', 'workspace-a', { folderId: 'folder-b' }),
      ],
      categoryOrderByWorkspace: {
        'workspace-a': ['folder:folder-b', 'folder:folder-a'],
      },
    });

    const text = exportToText(legacy);
    expect(text.indexOf('--- Folder B ---')).toBeLessThan(text.indexOf('--- Folder A ---'));
  });

  it('preserves ordinary mutations that happen while a category read is pending', async () => {
    vi.useFakeTimers();
    let storedState: unknown = createEmptyState();
    let resolveRead: ((value: { tabboardState: unknown }) => void) | undefined;
    const pendingRead = new Promise<{ tabboardState: unknown }>((resolve) => {
      resolveRead = resolve;
    });
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(() => pendingRead),
          set: vi.fn(async (value: { tabboardState: unknown }) => {
            storedState = value.tabboardState;
          }),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    useTabBoardStore.setState({ ...createEmptyState(), hydrated: true });

    const folderPromise = useTabBoardStore.getState().addFolder('workspace_default', 'Pending folder');
    await Promise.resolve();
    const groupInput = group('during-category', 'workspace_default');
    useTabBoardStore.getState().addGroup(groupInput);
    vi.advanceTimersByTime(100);
    resolveRead?.({ tabboardState: storedState });
    await folderPromise;
    await vi.runAllTimersAsync();

    expect(useTabBoardStore.getState().groups.map((item) => item.title)).toContain('during-category');
    expect(useTabBoardStore.getState().folders.map((item) => item.name)).toContain('Pending folder');
    const persisted = storedState as TabBoardState;
    expect(persisted.groups.map((item) => item.title)).toContain('during-category');
    expect(persisted.folders.map((item) => item.name)).toContain('Pending folder');
  });

  it('rechecks pending ordinary snapshots after every delayed category write', async () => {
    vi.useFakeTimers();
    let storedState: unknown = createEmptyState();
    const pendingWrites: Array<() => void> = [];
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ tabboardState: storedState })),
          set: vi.fn((value: { tabboardState: unknown }) => {
            if (pendingWrites.length >= 3) {
              storedState = value.tabboardState;
              return Promise.resolve();
            }
            return new Promise<void>((resolve) => {
              pendingWrites.push(() => {
                storedState = value.tabboardState;
                resolve();
              });
            });
          }),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    useTabBoardStore.setState({ ...createEmptyState(), hydrated: true });

    const folderPromise = useTabBoardStore.getState().addFolder('workspace_default', 'Stable folder');
    await waitForPendingWrites(pendingWrites, 1);
    useTabBoardStore.getState().addGroup(group('group-one', 'workspace_default'));
    vi.advanceTimersByTime(100);
    pendingWrites[0]();
    await waitForPendingWrites(pendingWrites, 2);

    useTabBoardStore.getState().addGroup(group('group-two', 'workspace_default'));
    vi.advanceTimersByTime(100);
    pendingWrites[1]();
    await waitForPendingWrites(pendingWrites, 3);
    pendingWrites[2]();
    await folderPromise;
    await vi.runAllTimersAsync();

    expect(useTabBoardStore.getState().folders.map((item) => item.name)).toContain('Stable folder');
    expect(useTabBoardStore.getState().groups.map((item) => item.title)).toEqual([
      'group-one',
      'group-two',
    ]);
    const persisted = storedState as TabBoardState;
    expect(persisted.folders.map((item) => item.name)).toContain('Stable folder');
    expect(persisted.groups.map((item) => item.title)).toEqual(['group-one', 'group-two']);
  });

  it('preserves a concurrent group when deleteFolder reads delayed storage', async () => {
    vi.useFakeTimers();
    const initial = state({
      folders: [folder('folder-a', 'workspace-a', 'Folder A')],
      groups: [group('folder-group', 'workspace-a', { folderId: 'folder-a' })],
    });
    let storedState: unknown = initial;
    let resolveRead: ((value: { tabboardState: unknown }) => void) | undefined;
    const pendingRead = new Promise<{ tabboardState: unknown }>((resolve) => {
      resolveRead = resolve;
    });
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(() => pendingRead),
          set: vi.fn(async (value: { tabboardState: unknown }) => {
            storedState = value.tabboardState;
          }),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    useTabBoardStore.setState({ ...initial, hydrated: true });

    const deletePromise = useTabBoardStore.getState().deleteFolder('folder-a');
    await Promise.resolve();
    useTabBoardStore.getState().addGroup(group('during-delete', 'workspace-a'));
    resolveRead?.({ tabboardState: storedState });
    await deletePromise;
    await vi.runAllTimersAsync();

    expect(useTabBoardStore.getState().folders).toEqual([]);
    expect(useTabBoardStore.getState().groups.map((item) => item.title)).toEqual([
      'folder-group',
      'during-delete',
    ]);
    const persisted = storedState as TabBoardState;
    expect(persisted.folders).toEqual([]);
    expect(persisted.groups.map((item) => item.title)).toEqual([
      'folder-group',
      'during-delete',
    ]);
    expect(persisted.groups.every((item) => item.folderId === null)).toBe(true);
  });

  it('reports category persistence failures through the store error channel', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ tabboardState: createEmptyState() })),
          set: vi.fn(async () => {
            throw new Error('category storage unavailable');
          }),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    useTabBoardStore.setState({ ...createEmptyState(), hydrated: true });

    const folderPromise = useTabBoardStore.getState().addFolder('workspace_default', 'Broken folder');
    folderPromise.catch(() => undefined);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(250 + 1_000 + 4_000 + 1);
    await expect(folderPromise).rejects.toThrow('category storage unavailable');
    expect(useTabBoardStore.getState()).toHaveProperty(
      'persistenceError',
      'category storage unavailable',
    );
  });

  it('deduplicates mixed raw and prefixed category order during text export', () => {
    const mixed = state({
      folders: [folder('folder-a', 'workspace-a', 'Folder A')],
      groups: [group('group-a', 'workspace-a', { folderId: 'folder-a' })],
      categoryOrderByWorkspace: {
        'workspace-a': ['folder:folder-a', 'folder-a'],
      },
    });

    const text = exportToText(mixed);
    expect(text.match(/group-a/g)).toHaveLength(1);
  });

  it('exposes ordinary persistence failures through the store error channel', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ tabboardState: createEmptyState() })),
          set: vi.fn(async () => {
            throw new Error('storage unavailable');
          }),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    const groupInput = group('failed-group', 'workspace_default');
    useTabBoardStore.setState({ ...createEmptyState(), hydrated: true });

    useTabBoardStore.getState().addGroup(groupInput);
    await vi.runAllTimersAsync();

    expect(useTabBoardStore.getState()).toHaveProperty('persistenceError', 'storage unavailable');
  });

  it('normalizes category order to current workspace categories', async () => {
    vi.useFakeTimers();
    let storedState: unknown;
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ tabboardState: storedState })),
          set: vi.fn(async (value: { tabboardState: unknown }) => {
            storedState = value.tabboardState;
          }),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    const board = state({
      categoryOrderByWorkspace: {
        'workspace-a': ['inbox', 'saved', 'folder:folder-a', 'stale'],
      },
      folders: [folder('folder-a', 'workspace-a'), folder('folder-c', 'workspace-a')],
    });
    storedState = board;
    useTabBoardStore.setState({ ...board, hydrated: true });

    await useTabBoardStore.getState().updateCategoryOrder(
      'workspace-a',
      [
        'folder:folder-c',
        'folder:folder-a',
        'inbox',
        'saved',
        'bookmarks',
        'archive',
      ],
      {
        expectedCategoryOrder: [
          'inbox',
          'saved',
          'folder:folder-a',
          'bookmarks',
          'archive',
          'folder:folder-c',
        ],
      },
    );

    expect(useTabBoardStore.getState().categoryOrderByWorkspace['workspace-a']).toEqual([
      'folder-c',
      'folder-a',
      'inbox',
      'saved',
      'bookmarks',
      'archive',
    ]);
    vi.runAllTimers();
  });

  it('keeps raw folder order compatible with text export while accepting prefixed input', async () => {
    vi.useFakeTimers();
    let storedState: unknown;
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ tabboardState: storedState })),
          set: vi.fn(async (value: { tabboardState: unknown }) => {
            storedState = value.tabboardState;
          }),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    const board = state({
      folders: [
        folder('folder-a', 'workspace-a', 'Folder A'),
        folder('folder-b', 'workspace-a', 'Folder B'),
      ],
      groups: [
        group('group-a', 'workspace-a', { folderId: 'folder-a' }),
        group('group-b', 'workspace-a', { folderId: 'folder-b' }),
      ],
      categoryOrderByWorkspace: {
        'workspace-a': ['folder-b', 'folder-a'],
      },
    });
    const legacyExport = exportToText(board);
    expect(legacyExport.indexOf('--- Folder B ---')).toBeLessThan(legacyExport.indexOf('--- Folder A ---'));
    storedState = board;
    useTabBoardStore.setState({ ...board, hydrated: true });

    await useTabBoardStore.getState().updateCategoryOrder(
      'workspace-a',
      [
        'folder:folder-a',
        'folder:folder-b',
        'inbox',
        'saved',
        'bookmarks',
        'archive',
      ],
      {
        expectedCategoryOrder: [
          'folder:folder-b',
          'folder:folder-a',
          'inbox',
          'saved',
          'bookmarks',
          'archive',
        ],
      },
    );

    expect(useTabBoardStore.getState().categoryOrderByWorkspace['workspace-a']).toEqual([
      'folder-a',
      'folder-b',
      'inbox',
      'saved',
      'bookmarks',
      'archive',
    ]);
    const updatedExport = exportToText(useTabBoardStore.getState());
    expect(updatedExport.indexOf('--- Folder A ---')).toBeLessThan(updatedExport.indexOf('--- Folder B ---'));
    vi.runAllTimers();
  });
});
