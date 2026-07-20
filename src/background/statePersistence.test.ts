import { describe, expect, it, vi } from 'vitest';
import { createEmptyState, createNoteRecord } from '../shared/model';
import type { BinEntry, Folder, Group, TabBoardState, TabItem } from '../shared/model';
import { createStatePersistence } from './statePersistence';
import type { StateMutation } from '../shared/store/stateMutations';
import { getDropOperationDigest } from '../manager/core/commands';

const timestamp = '2026-01-01T00:00:00.000Z';

function folder(id: string, name = id): Folder {
  return {
    id,
    name,
    color: 'slate',
    workspaceId: 'workspace_default',
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

function group(id: string, tabs: TabItem[] = []): Group {
  return {
    id,
    title: id,
    note: '',
    workspaceId: 'workspace_default',
    folderId: null,
    locked: false,
    starred: false,
    collapsed: false,
    tabs,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function mutationBatch(...mutations: StateMutation[]): StateMutation[] {
  return mutations;
}

describe('state persistence queue', () => {
  it('serializes concurrent page batches without navigator.locks', async () => {
    let stored = createEmptyState();
    const writes: TabBoardState[] = [];
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState: async (next) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        stored = structuredClone(next);
        writes.push(structuredClone(next));
      },
    });

    await Promise.all([
      persistence.applyMutations(mutationBatch({
        type: 'prepend-groups',
        groups: [group('captured')],
        updatedAt: timestamp,
      })),
      persistence.applyMutations(mutationBatch({
        type: 'add-folder',
        folder: folder('folder-a', 'Work'),
      })),
    ]);

    expect(stored.groups.map(({ id }) => id)).toEqual(['captured']);
    expect(stored.folders.map(({ id }) => id)).toEqual(['folder-a']);
    expect(writes).toHaveLength(2);
  });

  it('applies ordinary and category mutations in one ordered transaction', async () => {
    let stored = createEmptyState();
    const setState = vi.fn(async (next: TabBoardState) => {
      stored = structuredClone(next);
    });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    const result = await persistence.applyMutations([
      { type: 'prepend-groups', groups: [group('captured')], updatedAt: timestamp },
      { type: 'add-folder', folder: folder('folder-a', 'Work') },
    ]);

    expect(result.groups[0].id).toBe('captured');
    expect(result.folders[0].name).toBe('Work');
    expect(setState).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed TabItem payloads before persistence', async () => {
    const before = { ...createEmptyState(), groups: [group('trust-target')] };
    const malformed = {
      ...tab('trust-tab'),
      sourceWindowId: '1',
      browserGroup: { sourceGroupId: null, title: 'Browser', color: 'blue', collapsed: false, unexpected: true },
    };
    const setState = vi.fn(async () => undefined);
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(before),
      setState,
    });

    await expect(persistence.applyMutations([{
      type: 'add-tab',
      groupId: 'trust-target',
      tab: malformed,
      updatedAt: timestamp,
    }])).rejects.toThrow('Invalid state mutation.');
    expect(setState).not.toHaveBeenCalled();
    expect(before.groups).toEqual([group('trust-target')]);
    expect(before.mutationRevision).toBe(0);
  });

  it('persists canonical group notes and preserves every canonical TabItem field', async () => {
    const noteTab = createNoteRecord('Persisted note', {
      id: 'persisted-canonical-note',
      title: 'Persisted note',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const before = { ...createEmptyState(), groups: [group('persisted-note-group')] };
    let stored = structuredClone(before);
    const setState = vi.fn(async (next: TabBoardState) => {
      stored = structuredClone(next);
    });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    await persistence.applyMutations([{
      type: 'set-group-note',
      groupId: 'persisted-note-group',
      text: 'Persisted note',
      noteTab,
      updatedAt: timestamp,
    }]);

    expect(setState).toHaveBeenCalledTimes(1);
    expect(stored.groups[0].tabs[0]).toEqual(noteTab);
    expect(stored.groups[0].tabs[0]).toMatchObject({ itemType: 'note', url: '', taskStatus: 'none', note: 'Persisted note' });
  });

  it('rejects over-limit persisted ordinary text without writing', async () => {
    const before = { ...createEmptyState(), groups: [group('bounded-group')] };
    const setState = vi.fn(async () => undefined);
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(before),
      setState,
    });

    await expect(persistence.applyMutations([{
      type: 'update-group',
      id: 'bounded-group',
      updates: { title: `${'x'.repeat(512)}x` },
      updatedAt: timestamp,
    }])).rejects.toThrow('Invalid state mutation.');
    expect(setState).not.toHaveBeenCalled();
    expect(before).toEqual({ ...before });
  });

  it('does not partially persist a restore collision or remove its Bin entry', async () => {
    const source = group('atomic-restore-collision');
    const entry: BinEntry = {
      id: 'atomic-restore-collision-bin',
      kind: 'group',
      label: source.title,
      groupId: source.id,
      groupTitle: source.title,
      source: 'group',
      item: source,
      deletedAt: timestamp,
    };
    const before = { ...createEmptyState(), groups: [source], bin: [entry] };
    const setState = vi.fn(async () => undefined);
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(before),
      setState,
    });

    await expect(persistence.applyMutations([
      { type: 'add-folder', folder: folder('before-collision') },
      { type: 'restore-group', entryId: entry.id, group: source, index: 0, updatedAt: timestamp },
    ])).rejects.toMatchObject({ code: 'RESTORE_ID_COLLISION' });
    expect(setState).not.toHaveBeenCalled();
    expect(before.groups).toEqual([source]);
    expect(before.bin).toEqual([entry]);
  });

  it('rejects duplicate Bin entry IDs for restore without writing or deleting siblings', async () => {
    const sourceGroup = group('duplicate-persist-group');
    const groupEntry: BinEntry = {
      id: 'duplicate-persist-group-entry', kind: 'group', label: sourceGroup.title, groupId: sourceGroup.id, groupTitle: sourceGroup.title,
      source: 'group', item: sourceGroup, deletedAt: timestamp,
    };
    const sourceTab = tab('duplicate-persist-tab');
    const tabEntry: BinEntry = {
      id: 'duplicate-persist-tab-entry', kind: 'tab', label: sourceTab.title, groupId: 'duplicate-persist-target', groupTitle: 'Target',
      source: 'group', item: sourceTab, deletedAt: timestamp, originalGroupId: 'duplicate-persist-target', originalWorkspaceId: 'workspace_default', originalFolderId: null, originalIndex: 0,
    };
    const before = {
      ...createEmptyState(),
      groups: [group('duplicate-persist-target')],
      bin: [groupEntry, { ...groupEntry, item: { ...sourceGroup, title: 'Sibling' } }, tabEntry, { ...tabEntry, item: { ...sourceTab, title: 'Sibling' } }],
    };
    const setState = vi.fn(async () => undefined);
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(before),
      setState,
    });

    await expect(persistence.applyMutations([
      { type: 'restore-group', entryId: groupEntry.id, group: sourceGroup, index: 0, updatedAt: timestamp },
    ])).rejects.toMatchObject({ code: 'RESTORE_ID_COLLISION' });
    await expect(persistence.applyMutations([
      { type: 'restore-tab', entryId: tabEntry.id, groupId: 'duplicate-persist-target', tab: sourceTab, index: 0, updatedAt: timestamp },
    ])).rejects.toMatchObject({ code: 'RESTORE_ID_COLLISION' });
    expect(setState).not.toHaveBeenCalled();
    expect(before.bin).toHaveLength(4);
  });

  it('atomically rejects a group restore when a child tab ID collides', async () => {
    const sourceTab = tab('atomic-child-collision-tab');
    const source = group('atomic-child-collision-group', [sourceTab]);
    const entry: BinEntry = {
      id: 'atomic-child-collision-bin',
      kind: 'group',
      label: source.title,
      groupId: source.id,
      groupTitle: source.title,
      source: 'group',
      item: source,
      deletedAt: timestamp,
    };
    const before = {
      ...createEmptyState(),
      groups: [group('unrelated-live-group', [sourceTab])],
      bin: [entry],
    };
    const setState = vi.fn(async () => undefined);
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(before),
      setState,
    });

    await expect(persistence.applyMutations([{
      type: 'restore-group',
      entryId: entry.id,
      group: source,
      index: 0,
      updatedAt: timestamp,
    }])).rejects.toMatchObject({ code: 'RESTORE_ID_COLLISION' });
    expect(setState).not.toHaveBeenCalled();
    expect(before.groups[0].tabs).toEqual([sourceTab]);
    expect(before.bin).toEqual([entry]);
  });

  it('atomically rejects restore collisions from direct and nested Bin entities', async () => {
    const sourceTab = tab('atomic-global-restore-tab');
    const source = group('atomic-global-restore-group', [sourceTab]);
    const selectedEntry: BinEntry = {
      id: 'atomic-global-selected',
      kind: 'group',
      label: source.title,
      groupId: source.id,
      groupTitle: source.title,
      source: 'group',
      item: source,
      deletedAt: timestamp,
    };
    const nestedConflict: BinEntry = {
      id: 'atomic-global-nested-conflict',
      kind: 'group',
      label: 'Nested',
      groupId: 'nested-parent',
      groupTitle: 'Nested',
      source: 'group',
      item: group('nested-parent', [sourceTab]),
      deletedAt: timestamp,
    };
    const before = { ...createEmptyState(), bin: [selectedEntry, nestedConflict] };
    const setState = vi.fn(async () => undefined);
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(before),
      setState,
    });

    await expect(persistence.applyMutations([{
      type: 'restore-group',
      entryId: selectedEntry.id,
      group: source,
      index: 0,
      updatedAt: timestamp,
    }])).rejects.toMatchObject({ code: 'RESTORE_ID_COLLISION' });
    expect(setState).not.toHaveBeenCalled();
    expect(before.bin).toEqual([selectedEntry, nestedConflict]);
  });

  it('atomically rejects restore-tab collisions from another Bin entity', async () => {
    const sourceTab = tab('atomic-global-restore-tab-only');
    const selectedEntry: BinEntry = {
      id: 'atomic-global-tab-selected',
      kind: 'tab',
      label: sourceTab.title,
      groupId: 'atomic-global-target',
      groupTitle: 'Target',
      source: 'group',
      item: sourceTab,
      deletedAt: timestamp,
      originalGroupId: 'atomic-global-target',
      originalWorkspaceId: 'workspace_default',
      originalFolderId: null,
      originalIndex: 0,
    };
    const before = {
      ...createEmptyState(),
      groups: [group('atomic-global-target')],
      bin: [selectedEntry, { ...selectedEntry, id: 'atomic-global-tab-other' }],
    };
    const setState = vi.fn(async () => undefined);
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(before),
      setState,
    });

    await expect(persistence.applyMutations([{
      type: 'restore-tab',
      entryId: selectedEntry.id,
      groupId: 'atomic-global-target',
      tab: sourceTab,
      index: 0,
      updatedAt: timestamp,
    }])).rejects.toMatchObject({ code: 'RESTORE_ID_COLLISION' });
    expect(setState).not.toHaveBeenCalled();
    expect(before.groups[0].tabs).toEqual([]);
  });

  it('validates category duplicates against current queued state', async () => {
    let stored = createEmptyState();
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState: async (next) => {
        stored = structuredClone(next);
      },
    });

    await persistence.applyMutations([{ type: 'add-folder', folder: folder('folder-a', 'Work') }]);

    await expect(persistence.applyMutations([
      { type: 'add-folder', folder: folder('folder-b', ' work ') },
    ])).rejects.toThrow('A category with this name already exists in this workspace.');
    expect(stored.folders.map(({ id }) => id)).toEqual(['folder-a']);
  });

  it('reports invalid drop indexes without writing a mixed batch', async () => {
    let stored = {
      ...createEmptyState(),
      groups: [group('valid-drop'), group('invalid-drop')],
    };
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState: async (next) => {
        stored = structuredClone(next);
      },
    });
    const batch: StateMutation[] = [
      {
        type: 'drop-intent',
        expectedRevision: 0,
        operationId: 'valid-drop-operation',
        intent: { kind: 'move-session', groupId: 'valid-drop', category: 'starred', index: 0, workspaceId: 'workspace_default' },
        openTabs: [],
        updatedAt: timestamp,
      },
      {
        type: 'drop-intent',
        expectedRevision: 0,
        operationId: 'invalid-drop-operation',
        intent: { kind: 'move-session', groupId: 'missing-drop', category: 'starred', index: 0, workspaceId: 'workspace_default' },
        openTabs: [],
        updatedAt: timestamp,
      },
      { type: 'add-folder', folder: folder('following-folder', 'Following') },
    ];

    await expect(persistence.applyMutations(batch)).rejects.toMatchObject({
      code: 'INVALID_DROP_INTENT',
      invalidMutationIndexes: [1],
      committedMutationIndexes: [0, 2],
    });
    expect(stored.groups.map(({ id }) => id)).toEqual(['invalid-drop', 'valid-drop']);
    expect(stored.groups.find(({ id }) => id === 'valid-drop')?.starred).toBe(true);
    expect(stored.folders.map(({ name }) => name)).toEqual(['Following']);
  });

  it('rebases a legal sibling after an invalid drop gap within one transaction', async () => {
    let stored = {
      ...createEmptyState(),
      mutationRevision: 7,
      groups: [group('valid-drop')],
    };
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState: async (next) => {
        stored = structuredClone(next);
      },
    });
    const batch: StateMutation[] = [
      {
        type: 'drop-intent',
        expectedRevision: 7,
        operationId: 'invalid-gap-operation',
        intent: { kind: 'move-session', groupId: 'missing-drop', category: 'starred', index: 0, workspaceId: 'workspace_default' },
        openTabs: [],
        updatedAt: timestamp,
      },
      {
        type: 'drop-intent',
        expectedRevision: 8,
        operationId: 'valid-after-gap-operation',
        intent: { kind: 'move-session', groupId: 'valid-drop', category: 'starred', index: 0, workspaceId: 'workspace_default' },
        openTabs: [],
        updatedAt: timestamp,
      },
    ];

    await expect(persistence.applyMutations(batch)).rejects.toMatchObject({
      code: 'INVALID_DROP_INTENT',
      invalidMutationIndexes: [0],
      committedMutationIndexes: [1],
    });
    expect(stored.groups.find(({ id }) => id === 'valid-drop')?.starred).toBe(true);
    expect(stored.mutationRevision).toBe(8);
  });

  it('does not rebase a batch whose initial revision is externally stale', async () => {
    let stored = {
      ...createEmptyState(),
      mutationRevision: 8,
      groups: [group('valid-drop')],
    };
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState: async (next) => {
        stored = structuredClone(next);
      },
    });
    const batch: StateMutation[] = [
      {
        type: 'drop-intent',
        expectedRevision: 7,
        operationId: 'externally-stale-invalid-operation',
        intent: { kind: 'move-session', groupId: 'missing-drop', category: 'starred', index: 0, workspaceId: 'workspace_default' },
        openTabs: [],
        updatedAt: timestamp,
      },
      {
        type: 'drop-intent',
        expectedRevision: 8,
        operationId: 'externally-stale-valid-operation',
        intent: { kind: 'move-session', groupId: 'valid-drop', category: 'starred', index: 0, workspaceId: 'workspace_default' },
        openTabs: [],
        updatedAt: timestamp,
      },
    ];

    await expect(persistence.applyMutations(batch)).rejects.toMatchObject({
      code: 'INVALID_DROP_INTENT',
      invalidMutationIndexes: [0, 1],
      committedMutationIndexes: [],
    });
    expect(stored.groups.find(({ id }) => id === 'valid-drop')?.starred).toBe(false);
    expect(stored.mutationRevision).toBe(8);
  });

  it('isolates malformed raw drops at persistence boundary', async () => {
    let stored = createEmptyState();
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState: async (next) => {
        stored = structuredClone(next);
      },
    });

    await expect(persistence.applyMutations([
      { type: 'add-folder', folder: folder('raw-folder') },
      { type: 'drop-intent', intent: null },
      { type: 'rename-folder', id: 'raw-folder', name: 'Renamed', updatedAt: timestamp },
    ])).rejects.toMatchObject({
      code: 'INVALID_DROP_INTENT',
      invalidMutationIndexes: [1],
      committedMutationIndexes: [0, 2],
    });
    expect(stored.folders[0].name).toBe('Renamed');
  });

  it('atomically rejects update-group tab collisions and forged group notes', async () => {
    const existingTab = tab('persistence-existing-tab');
    const target = group('persistence-update-target', [existingTab]);
    const other = group('persistence-update-other', [tab('persistence-live-collision')]);
    let stored = { ...createEmptyState(), groups: [target, other] };
    const setState = vi.fn(async (next: TabBoardState) => {
      stored = structuredClone(next);
    });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    await expect(persistence.applyMutations([{
      type: 'update-group',
      id: target.id,
      updates: { tabs: [other.tabs[0]] },
      updatedAt: timestamp,
    }])).rejects.toMatchObject({ code: 'DUPLICATE_ENTITY_ID' });
    await expect(persistence.applyMutations([{
      type: 'set-group-note',
      groupId: target.id,
      text: 'Expected note',
      noteTab: tab('persistence-forged-note'),
      updatedAt: timestamp,
    }])).rejects.toMatchObject({ code: 'GROUP_NOTE_INVALID' });
    expect(setState).not.toHaveBeenCalled();
    expect(stored.groups).toEqual([target, other]);
  });

  it('atomically rejects cross-group tab moves into duplicate target IDs', async () => {
    const movedTab = tab('persistence-move-duplicate-tab');
    const source = group('persistence-move-source', [movedTab]);
    const target = group('persistence-move-target', [tab(movedTab.id)]);
    const before = { ...createEmptyState(), groups: [source, target] };
    const setState = vi.fn(async () => undefined);
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(before),
      setState,
    });

    await expect(persistence.applyMutations([{
      type: 'move-tab',
      groupId: source.id,
      tabId: movedTab.id,
      targetGroupId: target.id,
      targetIndex: 0,
      updatedAt: timestamp,
    }])).rejects.toMatchObject({ code: 'DUPLICATE_ENTITY_ID' });
    expect(setState).not.toHaveBeenCalled();
    expect(before.groups.map((item) => item.tabs.map(({ id }) => id))).toEqual([
      [movedTab.id],
      [movedTab.id],
    ]);
  });

  it('persists same-workspace tab moves with placement and timestamps', async () => {
    const moveTimestamp = '2026-01-02T00:00:00.000Z';
    const moved = tab('persistence-move-detailed-tab');
    const remaining = tab('persistence-move-detailed-remaining');
    const source = group('persistence-move-detailed-source', [moved]);
    const target = group('persistence-move-detailed-target', [remaining]);
    let stored = { ...createEmptyState(), groups: [source, target] };
    const setState = vi.fn(async (next: TabBoardState) => {
      stored = structuredClone(next);
    });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    const result = await persistence.applyMutations([{
      type: 'move-tab',
      groupId: source.id,
      tabId: moved.id,
      targetGroupId: target.id,
      targetIndex: 0,
      updatedAt: moveTimestamp,
    }]);

    expect(result.groups.find(({ id }) => id === source.id)?.tabs).toEqual([]);
    expect(result.groups.find(({ id }) => id === target.id)?.tabs).toEqual([
      { ...moved, updatedAt: moveTimestamp },
      remaining,
    ]);
    expect(result.groups.find(({ id }) => id === source.id)?.updatedAt).toBe(moveTimestamp);
    expect(result.groups.find(({ id }) => id === target.id)?.updatedAt).toBe(moveTimestamp);
    expect(result.updatedAt).toBe(moveTimestamp);
    expect(result.mutationRevision).toBe(1);
    expect(setState).toHaveBeenCalledTimes(1);
  });

  it('rebases valid drops after raw malformed gaps by original index', async () => {
    let stored = { ...createEmptyState(), mutationRevision: 7, groups: [group('persistence-raw-gap')] };
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState: async (next) => {
        stored = structuredClone(next);
      },
    });
    const valid: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 8,
      operationId: 'persistence-raw-gap-valid',
      intent: { kind: 'move-session', groupId: 'persistence-raw-gap', category: 'starred', index: 0, workspaceId: 'workspace_default' },
      openTabs: [],
      updatedAt: timestamp,
    };

    await expect(persistence.applyMutations([{ type: 'drop-intent', intent: null }, valid])).rejects.toMatchObject({
      code: 'INVALID_DROP_INTENT',
      invalidMutationIndexes: [0],
      committedMutationIndexes: [1],
    });
    expect(stored.mutationRevision).toBe(8);
    expect(stored.groups[0].starred).toBe(true);

    let orderedStored = { ...createEmptyState(), mutationRevision: 7, groups: [group('persistence-raw-order')] };
    const orderedPersistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(orderedStored),
      setState: async (next) => {
        orderedStored = structuredClone(next);
      },
    });
    const orderedValid: StateMutation = {
      ...valid,
      operationId: 'persistence-raw-order-valid',
      intent: { kind: 'move-session', groupId: 'persistence-raw-order', category: 'starred', index: 0, workspaceId: 'workspace_default' },
      expectedRevision: 7,
    };
    await expect(orderedPersistence.applyMutations([orderedValid, { type: 'drop-intent', intent: null }])).rejects.toMatchObject({
      invalidMutationIndexes: [1],
      committedMutationIndexes: [0],
    });
    expect(orderedStored.mutationRevision).toBe(8);
    expect(orderedStored.groups[0].starred).toBe(true);
  });

  it('does not partially write an invalid ordinary batch and keeps the queue usable', async () => {
    let stored = createEmptyState();
    const setState = vi.fn(async (next: TabBoardState) => {
      stored = structuredClone(next);
    });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    await expect(persistence.applyMutations([
      { type: 'add-folder', folder: folder('atomic-ordinary-folder') },
      { type: 'rename-folder', id: 'missing-folder', name: 'Rejected', updatedAt: timestamp },
    ])).rejects.toMatchObject({ code: 'FOLDER_NOT_FOUND' });
    expect(setState).not.toHaveBeenCalled();
    expect(stored.folders).toEqual([]);

    await persistence.applyMutations([{ type: 'add-folder', folder: folder('after-invalid-batch') }]);
    expect(stored.folders.map(({ id }) => id)).toEqual(['after-invalid-batch']);
    expect(setState).toHaveBeenCalledTimes(1);
  });

  it('does not partially write a failed batch and remains usable', async () => {
    let stored = createEmptyState();
    let fail = true;
    const setState = vi.fn(async (next: TabBoardState) => {
      if (fail) {
        fail = false;
        throw new Error('storage unavailable');
      }
      stored = structuredClone(next);
    });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });
    const batch: StateMutation[] = [
      { type: 'prepend-groups', groups: [group('not-written')], updatedAt: timestamp },
    ];

    await expect(persistence.applyMutations(batch)).rejects.toThrow('storage unavailable');
    expect(stored.groups).toEqual([]);
    expect(setState).toHaveBeenCalledTimes(1);

    await persistence.applyMutations([{ type: 'prepend-groups', groups: [group('retry')], updatedAt: timestamp }]);
    expect(stored.groups.map(({ id }) => id)).toEqual(['retry']);
  });

  it('atomically rejects a conflicting group batch and keeps the persistence queue usable', async () => {
    const existing = group('persistence-conflict-existing');
    let stored = { ...createEmptyState(), groups: [existing] };
    const setState = vi.fn(async (next: TabBoardState) => {
      stored = structuredClone(next);
    });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    await expect(persistence.applyMutations([{
      type: 'import-groups',
      groups: [{ ...existing, title: 'Conflicting payload' }, group('persistence-conflict-fresh')],
      updatedAt: timestamp,
    }])).rejects.toMatchObject({ code: 'DUPLICATE_ENTITY_ID' });
    expect(setState).not.toHaveBeenCalled();
    expect(stored.groups).toEqual([existing]);

    await persistence.applyMutations([{
      type: 'import-groups',
      groups: [group('persistence-after-conflict')],
      updatedAt: timestamp,
    }]);
    expect(stored.groups.map(({ id }) => id)).toEqual([
      existing.id,
      'persistence-after-conflict',
    ]);
    expect(setState).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate saved references without writing', async () => {
    const sourceTab = tab('persist-duplicate-saved-tab');
    const before = {
      ...createEmptyState(),
      groups: [group('persist-duplicate-saved-source', [sourceTab])],
    };
    const setState = vi.fn(async () => undefined);
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(before),
      setState,
    });
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'persist-duplicate-saved',
      intent: {
        kind: 'create-session',
        source: { kind: 'saved-tabs', refs: [
          { groupId: 'persist-duplicate-saved-source', tabId: sourceTab.id },
          { groupId: 'persist-duplicate-saved-source', tabId: sourceTab.id },
        ] },
        category: 'inbox',
        index: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [],
      updatedAt: timestamp,
    };

    await expect(persistence.applyMutations([mutation])).rejects.toMatchObject({ code: 'INVALID_DROP_INTENT' });
    expect(setState).not.toHaveBeenCalled();
    expect(before).toEqual({ ...before });
  });

  it('rejects sparse saved references before ledger replay without writing', async () => {
    const refs = new Array(1) as Array<{ groupId: string; tabId: string }>;
    const mutation = {
      type: 'drop-intent' as const,
      expectedRevision: 0,
      operationId: 'persist-sparse-saved',
      intent: {
        kind: 'create-session' as const,
        source: { kind: 'saved-tabs' as const, refs },
        category: 'inbox' as const,
        index: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [],
      updatedAt: timestamp,
    };
    const before = {
      ...createEmptyState(),
      dropOperationLedger: [{
        operationId: mutation.operationId,
        digest: getDropOperationDigest(mutation.intent, mutation.openTabs),
        appliedAt: timestamp,
      }],
    };
    const setState = vi.fn(async () => undefined);
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(before),
      setState,
    });

    await expect(persistence.applyMutations([mutation])).rejects.toMatchObject({ code: 'INVALID_DROP_INTENT' });
    expect(setState).not.toHaveBeenCalled();
    expect(before).toEqual({ ...before });
  });

  it('rejects cross-workspace legacy restore without writing', async () => {
    const workspaceB = { id: 'persist-legacy-workspace-b', name: 'B', createdAt: timestamp, updatedAt: timestamp };
    const sourceTab = tab('persist-legacy-cross-workspace-tab');
    const entry: BinEntry = {
      id: 'persist-legacy-cross-workspace-entry',
      kind: 'tab',
      label: sourceTab.title,
      groupId: 'persist-legacy-source',
      groupTitle: 'Legacy source',
      source: 'group',
      item: sourceTab,
      deletedAt: timestamp,
      originalGroupId: 'persist-legacy-source',
      originalFolderId: null,
      originalIndex: 0,
    };
    const before = {
      ...createEmptyState(),
      workspaces: [...createEmptyState().workspaces, workspaceB],
      activeWorkspaceId: 'workspace_default',
      groups: [group('persist-legacy-source'), group('persist-legacy-active')].map((item) =>
        item.id === 'persist-legacy-source' ? { ...item, workspaceId: workspaceB.id } : item),
      bin: [entry],
    };
    const setState = vi.fn(async () => undefined);
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(before),
      setState,
    });

    await expect(persistence.applyMutations([{
      type: 'restore-tab',
      entryId: entry.id,
      groupId: 'persist-legacy-active',
      tab: sourceTab,
      index: 0,
      updatedAt: timestamp,
    }])).rejects.toThrow('Invalid state mutation.');
    expect(setState).not.toHaveBeenCalled();
    expect(before).toEqual({ ...before });
  });

  it('persists legacy restore into the surviving source workspace Inbox', async () => {
    const workspaceB = { id: 'persist-legacy-inbox-b', name: 'B', createdAt: timestamp, updatedAt: timestamp };
    const sourceTab = tab('persist-legacy-inbox-tab');
    const entry: BinEntry = {
      id: 'persist-legacy-inbox-entry',
      kind: 'tab',
      label: sourceTab.title,
      groupId: 'persist-legacy-missing-group',
      groupTitle: 'Legacy missing group',
      source: 'group',
      item: sourceTab,
      deletedAt: timestamp,
      originalWorkspaceId: workspaceB.id,
      originalFolderId: null,
      originalIndex: 0,
    };
    let stored = {
      ...createEmptyState(),
      workspaces: [...createEmptyState().workspaces, workspaceB],
      activeWorkspaceId: 'workspace_default',
      groups: [group('persist-legacy-inbox', [/* no source group */]), group('persist-legacy-active')].map((item) =>
        item.id === 'persist-legacy-inbox' ? { ...item, workspaceId: workspaceB.id } : item),
      bin: [entry],
    };
    const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    await persistence.applyMutations([{
      type: 'restore-tab',
      entryId: entry.id,
      groupId: 'persist-legacy-inbox',
      tab: sourceTab,
      index: 0,
      updatedAt: timestamp,
    }]);

    expect(setState).toHaveBeenCalledTimes(1);
    expect(stored.groups.find((item) => item.id === 'persist-legacy-inbox')?.tabs).toEqual([sourceTab]);
  });

  it('atomically rejects compare-and-delete snapshot mismatches without writing', async () => {
    const liveGroup = group('persistence-delete-group', [tab('persistence-delete-child')]);
    const liveTab = tab('persistence-delete-tab');
    const tabParent = group('persistence-delete-parent', [liveTab]);
    const before = { ...createEmptyState(), groups: [liveGroup, tabParent] };
    const snapshot = structuredClone(before);
    const setState = vi.fn(async () => undefined);
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(before),
      setState,
    });

    await expect(persistence.applyMutations([{
      type: 'delete-group',
      id: liveGroup.id,
      binEntry: {
        id: 'persistence-delete-group-bin', kind: 'group', label: liveGroup.title,
        groupId: liveGroup.id, groupTitle: liveGroup.title, source: 'group',
        item: { ...liveGroup, title: 'replacement' }, deletedAt: timestamp,
        originalWorkspaceId: liveGroup.workspaceId, originalFolderId: liveGroup.folderId,
      },
      updatedAt: timestamp,
    }])).rejects.toMatchObject({ code: 'DUPLICATE_ENTITY_ID' });

    await expect(persistence.applyMutations([{
      type: 'delete-tab',
      groupId: tabParent.id,
      tabId: liveTab.id,
      binEntry: {
        id: 'persistence-delete-tab-bin', kind: 'tab', label: liveTab.title,
        groupId: tabParent.id, groupTitle: tabParent.title, source: 'group',
        item: { ...liveTab, title: 'replacement' }, deletedAt: timestamp,
        originalGroupId: 'wrong-parent', originalWorkspaceId: tabParent.workspaceId,
        originalFolderId: tabParent.folderId, originalIndex: 0,
      },
      updatedAt: timestamp,
    }])).rejects.toMatchObject({ code: 'DUPLICATE_ENTITY_ID' });

    expect(setState).not.toHaveBeenCalled();
    expect(before).toEqual(snapshot);
    expect(before.mutationRevision).toBe(0);
    expect(before.bin).toEqual([]);
  });

  it('persists exact delete transactions and replays them without state changes', async () => {
    const liveGroup = group('persistence-exact-group', [tab('persistence-exact-child')]);
    const groupEntry: BinEntry = {
      id: 'persistence-exact-group-bin', kind: 'group', label: liveGroup.title,
      groupId: liveGroup.id, groupTitle: liveGroup.title, source: 'group', item: liveGroup,
      deletedAt: timestamp, originalWorkspaceId: liveGroup.workspaceId, originalFolderId: liveGroup.folderId,
    };
    const groupBefore = { ...createEmptyState(), groups: [liveGroup] };
    let groupStored = structuredClone(groupBefore);
    const groupSetState = vi.fn(async (next: TabBoardState) => { groupStored = structuredClone(next); });
    const groupPersistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(groupStored),
      setState: groupSetState,
    });
    const groupMutation: StateMutation = {
      type: 'delete-group', id: liveGroup.id, binEntry: groupEntry, updatedAt: timestamp,
    };

    const firstGroupResult = await groupPersistence.applyMutations([groupMutation]);
    expect(groupStored).toEqual(firstGroupResult);
    expect(groupStored).toEqual({
      ...groupBefore,
      groups: [],
      bin: [{
        ...groupEntry,
        originalGroupId: undefined,
        originalIndex: 0,
        originalFolderName: undefined,
        originalWorkspaceName: 'Personal',
      }],
      updatedAt: timestamp,
      mutationRevision: 1,
    });
    expect(groupStored.groups).toEqual([]);
    expect(groupStored.bin).toHaveLength(1);
    expect(groupStored.bin[0]).toMatchObject({
      item: liveGroup,
      originalWorkspaceId: liveGroup.workspaceId,
      originalFolderId: liveGroup.folderId,
    });
    expect(groupStored.mutationRevision).toBe(1);
    expect(groupSetState).toHaveBeenCalledTimes(1);

    const groupReplaySnapshot = structuredClone(groupStored);
    const replayedGroupResult = await groupPersistence.applyMutations([groupMutation]);
    expect(replayedGroupResult).toEqual(groupReplaySnapshot);
    expect(groupStored).toEqual(groupReplaySnapshot);
    expect(groupSetState).toHaveBeenCalledTimes(2);

    const liveTab = tab('persistence-exact-tab');
    const tabParent = group('persistence-exact-parent', [liveTab]);
    const tabEntry: BinEntry = {
      id: 'persistence-exact-tab-bin', kind: 'tab', label: liveTab.title,
      groupId: tabParent.id, groupTitle: tabParent.title, source: 'group', item: liveTab,
      deletedAt: timestamp, originalGroupId: tabParent.id,
      originalWorkspaceId: tabParent.workspaceId, originalFolderId: tabParent.folderId,
    };
    const tabBefore = { ...createEmptyState(), groups: [tabParent] };
    let tabStored = structuredClone(tabBefore);
    const tabSetState = vi.fn(async (next: TabBoardState) => { tabStored = structuredClone(next); });
    const tabPersistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(tabStored),
      setState: tabSetState,
    });
    const tabMutation: StateMutation = {
      type: 'delete-tab', groupId: tabParent.id, tabId: liveTab.id, binEntry: tabEntry, updatedAt: timestamp,
    };

    const firstTabResult = await tabPersistence.applyMutations([tabMutation]);
    expect(tabStored).toEqual(firstTabResult);
    expect(tabStored).toEqual({
      ...tabBefore,
      groups: [{ ...tabParent, tabs: [] }],
      bin: [{
        ...tabEntry,
        originalIndex: 0,
        originalFolderName: undefined,
        originalWorkspaceName: 'Personal',
      }],
      updatedAt: timestamp,
      mutationRevision: 1,
    });
    expect(tabStored.groups[0].tabs).toEqual([]);
    expect(tabStored.bin).toHaveLength(1);
    expect(tabStored.bin[0]).toMatchObject({
      item: liveTab,
      originalGroupId: tabParent.id,
      originalWorkspaceId: tabParent.workspaceId,
      originalFolderId: tabParent.folderId,
      originalIndex: 0,
    });
    expect(tabStored.mutationRevision).toBe(1);
    expect(tabSetState).toHaveBeenCalledTimes(1);

    const tabReplaySnapshot = structuredClone(tabStored);
    const replayedTabResult = await tabPersistence.applyMutations([tabMutation]);
    expect(replayedTabResult).toEqual(tabReplaySnapshot);
    expect(tabStored).toEqual(tabReplaySnapshot);
    expect(tabSetState).toHaveBeenCalledTimes(2);
  });

  it('rejects delete-group replay when child tabs are duplicated globally', async () => {
    const child = tab('persistence-delete-group-replay-global-child');
    const deletedGroup = group('persistence-delete-group-replay-global-target', [child]);
    const groupEntry: BinEntry = {
      id: 'persistence-delete-group-replay-global-bin',
      kind: 'group',
      label: deletedGroup.title,
      groupId: deletedGroup.id,
      groupTitle: deletedGroup.title,
      source: 'group',
      item: deletedGroup,
      deletedAt: timestamp,
      originalWorkspaceId: deletedGroup.workspaceId,
      originalFolderId: deletedGroup.folderId,
      originalIndex: 0,
    };
    const mutation: StateMutation = {
      type: 'delete-group', id: deletedGroup.id, binEntry: groupEntry, updatedAt: timestamp,
    };
    const directEntry: BinEntry = {
      id: 'persistence-delete-group-replay-global-direct-bin',
      kind: 'tab',
      label: child.title,
      groupId: 'persistence-delete-group-replay-global-direct-parent',
      groupTitle: 'Direct source',
      source: 'group',
      item: child,
      deletedAt: timestamp,
      originalGroupId: 'persistence-delete-group-replay-global-direct-parent',
      originalWorkspaceId: deletedGroup.workspaceId,
      originalFolderId: deletedGroup.folderId,
    };
    const nestedGroup = group('persistence-delete-group-replay-global-nested', [child]);
    const nestedEntry: BinEntry = {
      id: 'persistence-delete-group-replay-global-nested-bin',
      kind: 'group',
      label: nestedGroup.title,
      groupId: nestedGroup.id,
      groupTitle: nestedGroup.title,
      source: 'group',
      item: nestedGroup,
      deletedAt: timestamp,
      originalWorkspaceId: nestedGroup.workspaceId,
      originalFolderId: nestedGroup.folderId,
    };
    const duplicateGroup = group('persistence-delete-group-replay-global-duplicate', [child, child]);
    const duplicateEntry: BinEntry = { ...groupEntry, item: duplicateGroup, groupId: duplicateGroup.id, groupTitle: duplicateGroup.title, label: duplicateGroup.title };
    const cases: Array<{ before: TabBoardState; mutation: StateMutation }> = [
      {
        before: { ...createEmptyState(), bin: [groupEntry], groups: [group('persistence-delete-group-replay-global-live', [child])] },
        mutation,
      },
      {
        before: { ...createEmptyState(), bin: [groupEntry, directEntry] },
        mutation,
      },
      {
        before: { ...createEmptyState(), bin: [groupEntry, nestedEntry] },
        mutation,
      },
      {
        before: { ...createEmptyState(), bin: [duplicateEntry] },
        mutation: { ...mutation, binEntry: duplicateEntry },
      },
    ];

    for (const { before, mutation: replayMutation } of cases) {
      let stored = structuredClone(before);
      const snapshot = structuredClone(before);
      const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
      const persistence = createStatePersistence({
        locks: undefined,
        getState: async () => structuredClone(stored),
        setState,
      });

      await expect(persistence.applyMutations([replayMutation])).rejects.toThrow();
      expect(setState).not.toHaveBeenCalled();
      expect(stored).toEqual(snapshot);
      expect(stored.mutationRevision).toBe(snapshot.mutationRevision);
      expect(stored.bin).toEqual(snapshot.bin);
    }
  });

  it('rejects replay when a matching group Bin entry ID is ambiguous', async () => {
    const deletedGroup = group('persistence-delete-replay-bin-id-group');
    const groupEntry: BinEntry = {
      id: 'persistence-delete-replay-bin-id-shared',
      kind: 'group',
      label: deletedGroup.title,
      groupId: deletedGroup.id,
      groupTitle: deletedGroup.title,
      source: 'group',
      item: deletedGroup,
      deletedAt: timestamp,
      originalWorkspaceId: deletedGroup.workspaceId,
      originalFolderId: deletedGroup.folderId,
    };
    const unrelatedEntry: BinEntry = {
      ...groupEntry,
      item: group('persistence-delete-replay-bin-id-other'),
      groupId: 'persistence-delete-replay-bin-id-other',
      groupTitle: 'persistence-delete-replay-bin-id-other',
      label: 'persistence-delete-replay-bin-id-other',
    };
    const before = { ...createEmptyState(), bin: [groupEntry, unrelatedEntry] };
    let stored = structuredClone(before);
    const snapshot = structuredClone(before);
    const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    await expect(persistence.applyMutations([{
      type: 'delete-group', id: deletedGroup.id, binEntry: groupEntry, updatedAt: timestamp,
    }])).rejects.toThrow();
    expect(setState).not.toHaveBeenCalled();
    expect(stored).toEqual(snapshot);
    expect(stored.mutationRevision).toBe(snapshot.mutationRevision);
    expect(stored.bin).toEqual(snapshot.bin);
  });

  it('rejects malformed delete Bin descriptors before persistence', async () => {
    const liveGroup = group('persistence-delete-malformed-descriptor-group');
    const entry: BinEntry = {
      id: 'persistence-delete-malformed-descriptor-bin',
      kind: 'group',
      label: liveGroup.title,
      groupId: liveGroup.id,
      groupTitle: liveGroup.title,
      source: 'group',
      item: liveGroup,
      deletedAt: timestamp,
      originalWorkspaceId: liveGroup.workspaceId,
      originalFolderId: liveGroup.folderId,
    };
    const before = { ...createEmptyState(), groups: [liveGroup] };
    const snapshot = structuredClone(before);
    const setState = vi.fn(async () => undefined);
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(before),
      setState,
    });

    await expect(persistence.applyMutations([{
      type: 'delete-group',
      id: liveGroup.id,
      binEntry: { ...entry, source: undefined },
      updatedAt: timestamp,
    }])).rejects.toThrow('Invalid state mutation.');
    expect(setState).not.toHaveBeenCalled();
    expect(before).toEqual(snapshot);
    expect(before.mutationRevision).toBe(snapshot.mutationRevision);
    expect(before.bin).toEqual(snapshot.bin);
  });

  it('rejects delete-tab replay when direct and nested Bin evidence share a tab ID', async () => {
    const deletedTab = tab('persistence-delete-tab-direct-nested');
    const parent = group('persistence-delete-tab-direct-nested-parent');
    const nestedGroup = group('persistence-delete-tab-direct-nested-bin-group', [deletedTab]);
    const directEntry: BinEntry = {
      id: 'persistence-delete-tab-direct-nested-direct-bin', kind: 'tab', label: deletedTab.title,
      groupId: parent.id, groupTitle: parent.title, source: 'group', item: deletedTab,
      deletedAt: timestamp, originalGroupId: parent.id,
      originalWorkspaceId: parent.workspaceId, originalFolderId: parent.folderId,
    };
    const nestedEntry: BinEntry = {
      id: 'persistence-delete-tab-direct-nested-group-bin', kind: 'group', label: nestedGroup.title,
      groupId: nestedGroup.id, groupTitle: nestedGroup.title, source: 'group', item: nestedGroup,
      deletedAt: timestamp, originalWorkspaceId: nestedGroup.workspaceId,
      originalFolderId: nestedGroup.folderId,
    };
    const before = { ...createEmptyState(), groups: [parent], bin: [directEntry, nestedEntry] };
    let stored = structuredClone(before);
    const snapshot = structuredClone(before);
    const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    await expect(persistence.applyMutations([{
      type: 'delete-tab',
      groupId: parent.id,
      tabId: deletedTab.id,
      binEntry: directEntry,
      updatedAt: timestamp,
    }])).rejects.toMatchObject({ code: 'TAB_NOT_FOUND' });

    expect(setState).not.toHaveBeenCalled();
    expect(stored).toEqual(snapshot);
    expect(stored.mutationRevision).toBe(snapshot.mutationRevision);
    expect(stored.bin).toEqual(snapshot.bin);
  });

  it('rejects delete replay metadata conflicts without writing', async () => {
    const deletedGroup = group('persistence-replay-group');
    const deletedTab = tab('persistence-replay-tab');
    const tabParent = group('persistence-replay-parent');
    const groupEntry: BinEntry = {
      id: 'persistence-replay-group-entry', kind: 'group', label: deletedGroup.title,
      groupId: deletedGroup.id, groupTitle: deletedGroup.title, source: 'group', item: deletedGroup,
      deletedAt: timestamp, originalWorkspaceId: deletedGroup.workspaceId, originalFolderId: deletedGroup.folderId,
    };
    const tabEntry: BinEntry = {
      id: 'persistence-replay-tab-entry', kind: 'tab', label: deletedTab.title,
      groupId: tabParent.id, groupTitle: tabParent.title, source: 'group', item: deletedTab,
      deletedAt: timestamp, originalGroupId: tabParent.id,
      originalWorkspaceId: tabParent.workspaceId, originalFolderId: tabParent.folderId,
    };
    const before = { ...createEmptyState(), groups: [tabParent], bin: [groupEntry, tabEntry] };
    let stored = structuredClone(before);
    const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });
    const mutations: StateMutation[] = [
      {
        type: 'delete-group', id: deletedGroup.id,
        binEntry: { ...groupEntry, originalWorkspaceId: 'wrong-workspace' }, updatedAt: timestamp,
      },
      {
        type: 'delete-group', id: deletedGroup.id,
        binEntry: { ...groupEntry, originalFolderId: 'wrong-folder' }, updatedAt: timestamp,
      },
      {
        type: 'delete-tab', groupId: tabParent.id, tabId: deletedTab.id,
        binEntry: { ...tabEntry, originalGroupId: 'wrong-parent' }, updatedAt: timestamp,
      },
      {
        type: 'delete-tab', groupId: tabParent.id, tabId: deletedTab.id,
        binEntry: { ...tabEntry, originalWorkspaceId: 'wrong-workspace' }, updatedAt: timestamp,
      },
      {
        type: 'delete-tab', groupId: tabParent.id, tabId: deletedTab.id,
        binEntry: { ...tabEntry, originalFolderId: 'wrong-folder' }, updatedAt: timestamp,
      },
    ];
    const snapshot = structuredClone(before);

    for (const mutation of mutations) {
      await expect(persistence.applyMutations([mutation])).rejects.toThrow();
    }
    expect(setState).not.toHaveBeenCalled();
    expect(stored).toEqual(snapshot);
    expect(stored.mutationRevision).toBe(snapshot.mutationRevision);
    expect(stored.bin).toEqual(snapshot.bin);
  });

  it('atomically rejects live deletes when matching Bin evidence already exists', async () => {
    const liveGroup = group('persistence-live-bin-group');
    const groupEntry: BinEntry = {
      id: 'persistence-live-bin-group-entry', kind: 'group', label: liveGroup.title,
      groupId: liveGroup.id, groupTitle: liveGroup.title, source: 'group', item: liveGroup,
      deletedAt: timestamp, originalWorkspaceId: liveGroup.workspaceId, originalFolderId: liveGroup.folderId,
    };
    const liveTab = tab('persistence-live-bin-tab');
    const tabParent = group('persistence-live-bin-parent', [liveTab]);
    const tabEntry: BinEntry = {
      id: 'persistence-live-bin-tab-entry', kind: 'tab', label: liveTab.title,
      groupId: tabParent.id, groupTitle: tabParent.title, source: 'group', item: liveTab,
      deletedAt: timestamp, originalGroupId: tabParent.id,
      originalWorkspaceId: tabParent.workspaceId, originalFolderId: tabParent.folderId,
    };
    const before = { ...createEmptyState(), groups: [liveGroup, tabParent], bin: [groupEntry, tabEntry] };
    const snapshot = structuredClone(before);
    const setState = vi.fn(async () => undefined);
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(before),
      setState,
    });

    await expect(persistence.applyMutations([
      { type: 'delete-group', id: liveGroup.id, binEntry: groupEntry, updatedAt: timestamp },
    ])).rejects.toMatchObject({ code: 'DUPLICATE_ENTITY_ID' });
    await expect(persistence.applyMutations([
      { type: 'delete-tab', groupId: tabParent.id, tabId: liveTab.id, binEntry: tabEntry, updatedAt: timestamp },
    ])).rejects.toMatchObject({ code: 'DUPLICATE_ENTITY_ID' });
    expect(setState).not.toHaveBeenCalled();
    expect(before).toEqual(snapshot);
    expect(before.mutationRevision).toBe(0);
    expect(before.bin).toEqual([groupEntry, tabEntry]);
  });

  it('atomically rejects live delete when the mutation Bin entry ID is already occupied', async () => {
    const target = group('persistence-delete-bin-id-target', [tab('persistence-delete-bin-id-child')]);
    const conflictingEntry: BinEntry = {
      id: 'persistence-delete-bin-id-conflict',
      kind: 'group',
      label: 'Existing Bin group',
      groupId: 'persistence-delete-bin-id-existing',
      groupTitle: 'Existing Bin group',
      source: 'group',
      item: group('persistence-delete-bin-id-existing'),
      deletedAt: timestamp,
      originalWorkspaceId: target.workspaceId,
      originalFolderId: target.folderId,
    };
    const before = { ...createEmptyState(), groups: [target], bin: [conflictingEntry] };
    let stored = structuredClone(before);
    const snapshot = structuredClone(before);
    const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    await expect(persistence.applyMutations([{
      type: 'delete-group',
      id: target.id,
      binEntry: {
        id: conflictingEntry.id,
        kind: 'group',
        label: target.title,
        groupId: target.id,
        groupTitle: target.title,
        source: 'group',
        item: target,
        deletedAt: timestamp,
        originalWorkspaceId: target.workspaceId,
        originalFolderId: target.folderId,
      },
      updatedAt: timestamp,
    }])).rejects.toMatchObject({ code: 'DUPLICATE_ENTITY_ID' });
    expect(setState).not.toHaveBeenCalled();
    expect(stored).toEqual(snapshot);
    expect(stored.mutationRevision).toBe(snapshot.mutationRevision);
    expect(stored.bin).toEqual(snapshot.bin);
  });

  it('atomically rejects delete-group child tab collisions from live and direct Bin state', async () => {
    const duplicateLiveTab = tab('persistence-delete-group-live-child');
    const liveTarget = group('persistence-delete-group-live-target', [duplicateLiveTab]);
    const liveOther = group('persistence-delete-group-live-other', [duplicateLiveTab]);
    const duplicateBinTab = tab('persistence-delete-group-bin-child');
    const binTarget = group('persistence-delete-group-bin-target', [duplicateBinTab]);
    const directEntry: BinEntry = {
      id: 'persistence-delete-group-bin-child-entry', kind: 'tab', label: duplicateBinTab.title,
      groupId: 'persistence-delete-group-bin-source', groupTitle: 'persistence-delete-group-bin-source',
      source: 'group', item: duplicateBinTab, deletedAt: timestamp,
      originalGroupId: 'persistence-delete-group-bin-source',
      originalWorkspaceId: binTarget.workspaceId, originalFolderId: binTarget.folderId,
    };
    const makeGroupEntry = (liveGroup: Group): BinEntry => ({
      id: `${liveGroup.id}-entry`, kind: 'group', label: liveGroup.title,
      groupId: liveGroup.id, groupTitle: liveGroup.title, source: 'group', item: liveGroup,
      deletedAt: timestamp, originalWorkspaceId: liveGroup.workspaceId, originalFolderId: liveGroup.folderId,
    });
    const cases = [
      {
        before: { ...createEmptyState(), groups: [liveTarget, liveOther] },
        target: liveTarget,
      },
      {
        before: { ...createEmptyState(), groups: [binTarget], bin: [directEntry] },
        target: binTarget,
      },
    ];

    for (const { before, target } of cases) {
      let stored = structuredClone(before);
      const snapshot = structuredClone(before);
      const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
      const persistence = createStatePersistence({
        locks: undefined,
        getState: async () => structuredClone(stored),
        setState,
      });

      await expect(persistence.applyMutations([{
        type: 'delete-group', id: target.id, binEntry: makeGroupEntry(target), updatedAt: timestamp,
      }])).rejects.toMatchObject({ code: 'DUPLICATE_ENTITY_ID' });
      expect(setState).not.toHaveBeenCalled();
      expect(stored).toEqual(snapshot);
      expect(stored.mutationRevision).toBe(snapshot.mutationRevision);
      expect(stored.bin).toEqual(snapshot.bin);
    }
  });

  it('atomically rejects delete-group child tab collisions from a nested Bin group', async () => {
    const duplicate = tab('persistence-delete-group-nested-child');
    const target = group('persistence-delete-group-nested-target', [duplicate]);
    const nested = group('persistence-delete-group-nested-source', [duplicate]);
    const nestedEntry: BinEntry = {
      id: 'persistence-delete-group-nested-entry', kind: 'group', label: nested.title,
      groupId: nested.id, groupTitle: nested.title, source: 'group', item: nested,
      deletedAt: timestamp, originalWorkspaceId: nested.workspaceId, originalFolderId: nested.folderId,
    };
    const before = { ...createEmptyState(), groups: [target], bin: [nestedEntry] };
    let stored = structuredClone(before);
    const snapshot = structuredClone(before);
    const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    await expect(persistence.applyMutations([{
      type: 'delete-group',
      id: target.id,
      binEntry: {
        id: 'persistence-delete-group-nested-target-entry', kind: 'group', label: target.title,
        groupId: target.id, groupTitle: target.title, source: 'group', item: target,
        deletedAt: timestamp, originalWorkspaceId: target.workspaceId, originalFolderId: target.folderId,
      },
      updatedAt: timestamp,
    }])).rejects.toMatchObject({ code: 'DUPLICATE_ENTITY_ID' });
    expect(setState).not.toHaveBeenCalled();
    expect(stored).toEqual(snapshot);
    expect(stored.mutationRevision).toBe(snapshot.mutationRevision);
    expect(stored.bin).toEqual(snapshot.bin);
  });

  it('rejects delete mutations with missing metadata before persistence', async () => {
    const liveGroup = group('persistence-missing-metadata-group');
    const liveTab = tab('persistence-missing-metadata-tab');
    const tabParent = group('persistence-missing-metadata-parent', [liveTab]);
    const groupEntry: BinEntry = {
      id: 'persistence-missing-metadata-group-bin', kind: 'group', label: liveGroup.title,
      groupId: liveGroup.id, groupTitle: liveGroup.title, source: 'group', item: liveGroup,
      deletedAt: timestamp, originalFolderId: liveGroup.folderId,
    };
    const tabEntry: BinEntry = {
      id: 'persistence-missing-metadata-tab-bin', kind: 'tab', label: liveTab.title,
      groupId: tabParent.id, groupTitle: tabParent.title, source: 'group', item: liveTab,
      deletedAt: timestamp, originalWorkspaceId: tabParent.workspaceId, originalFolderId: tabParent.folderId,
    };
    const before = { ...createEmptyState(), groups: [liveGroup, tabParent] };
    const snapshot = structuredClone(before);
    const setState = vi.fn(async () => undefined);
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(before),
      setState,
    });

    const mutations: StateMutation[] = [
      { type: 'delete-group', id: liveGroup.id, binEntry: groupEntry, updatedAt: timestamp },
      {
        type: 'delete-group', id: liveGroup.id,
        binEntry: { ...groupEntry, originalWorkspaceId: liveGroup.workspaceId, originalFolderId: undefined },
        updatedAt: timestamp,
      },
      { type: 'delete-tab', groupId: tabParent.id, tabId: liveTab.id, binEntry: tabEntry, updatedAt: timestamp },
      {
        type: 'delete-tab', groupId: tabParent.id, tabId: liveTab.id,
        binEntry: { ...tabEntry, originalGroupId: tabParent.id, originalWorkspaceId: undefined }, updatedAt: timestamp,
      },
      {
        type: 'delete-tab', groupId: tabParent.id, tabId: liveTab.id,
        binEntry: {
          ...tabEntry,
          originalGroupId: tabParent.id,
          originalWorkspaceId: tabParent.workspaceId,
          originalFolderId: undefined,
        },
        updatedAt: timestamp,
      },
    ];
    for (const mutation of mutations) {
      await expect(persistence.applyMutations([mutation])).rejects.toThrow('Invalid state mutation.');
    }
    expect(setState).not.toHaveBeenCalled();
    expect(before).toEqual(snapshot);
    expect(before.mutationRevision).toBe(0);
    expect(before.bin).toEqual([]);
  });

  it('atomically rejects ordinary semantic errors without persisting earlier mutations', async () => {
    let stored = createEmptyState();
    const setState = vi.fn(async (next: TabBoardState) => {
      stored = structuredClone(next);
    });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    await expect(persistence.applyMutations([
      { type: 'add-folder', folder: folder('persistence-before-semantic-error') },
      {
        type: 'reorder-groups',
        workspaceId: 'workspace_default',
        folderId: 'missing-persistence-folder',
        starred: false,
        orderedGroupIds: [],
        updatedAt: timestamp,
      },
    ])).rejects.toMatchObject({ code: 'FOLDER_NOT_FOUND' });
    expect(setState).not.toHaveBeenCalled();
    expect(stored.folders).toEqual([]);
  });

  it('rejects forged older reorder replays without persistence writes', async () => {
    const originalTimestamp = '2026-07-18T00:00:01.000Z';
    const forgedTimestamp = '2026-07-18T00:00:00.000Z';
    const lockTimestamp = '2026-07-18T00:00:02.000Z';
    const first = { ...group('persistence-replay-first'), updatedAt: forgedTimestamp };
    const second = { ...group('persistence-replay-second'), updatedAt: forgedTimestamp };
    const locked = { ...group('persistence-replay-locked'), updatedAt: forgedTimestamp };
    const untouched = { ...group('persistence-replay-untouched'), createdAt: forgedTimestamp, updatedAt: forgedTimestamp };
    let stored = {
      ...createEmptyState(),
      groups: [first, second, locked, untouched],
    };
    const setState = vi.fn(async (next: TabBoardState) => {
      stored = structuredClone(next);
    });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });
    const original: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
      orderedGroupIds: [second.id, first.id],
      updatedAt: originalTimestamp,
    };

    await persistence.applyMutations([original]);
    await persistence.applyMutations([{
      type: 'set-group-flags', id: locked.id, locked: true, updatedAt: lockTimestamp,
    }]);
    const snapshot = structuredClone(stored);
    const writesBeforeReplay = setState.mock.calls.length;

    for (const orderedGroupIds of [
      [second.id, first.id],
      [second.id, first.id, locked.id],
    ]) {
      await expect(persistence.applyMutations([{
        ...original,
        orderedGroupIds,
        updatedAt: forgedTimestamp,
      }])).rejects.toMatchObject({ code: 'GROUP_LOCKED' });
      expect(setState).toHaveBeenCalledTimes(writesBeforeReplay);
      expect(stored).toEqual(snapshot);
      expect(stored.mutationRevision).toBe(snapshot.mutationRevision);
    }
  });

  it('rejects locked and invalid-URL ordinary mutations without writes, then recovers', async () => {
    const locked = group('persistence-locked', [tab('persistence-locked-tab')]);
    const unlocked = group('persistence-unlocked', [tab('persistence-link-tab')]);
    const before = { ...createEmptyState(), groups: [{ ...locked, locked: true }, unlocked] };
    let stored = structuredClone(before);
    const setState = vi.fn(async (next: TabBoardState) => {
      stored = structuredClone(next);
    });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    await expect(persistence.applyMutations([{
      type: 'update-group',
      id: locked.id,
      updates: { title: 'forged update' },
      updatedAt: timestamp,
    }])).rejects.toMatchObject({ code: 'GROUP_LOCKED' });
    expect(setState).not.toHaveBeenCalled();
    expect(stored).toEqual(before);

    await expect(persistence.applyMutations([{
      type: 'update-tab',
      groupId: unlocked.id,
      tabId: 'persistence-link-tab',
      updates: { url: '' },
      updatedAt: timestamp,
    }])).rejects.toMatchObject({ code: 'TAB_URL_INVALID' });
    expect(setState).not.toHaveBeenCalled();
    expect(stored).toEqual(before);

    await persistence.applyMutations([{
      type: 'update-group',
      id: unlocked.id,
      updates: { title: 'accepted update' },
      updatedAt: timestamp,
    }]);
    expect(setState).toHaveBeenCalledTimes(1);
    expect(stored.groups.find((item) => item.id === unlocked.id)?.title).toBe('accepted update');
    expect(stored.mutationRevision).toBe(before.mutationRevision + 1);
  });

  it('returns structured URL errors for raw nested tabs without writing, then recovers', async () => {
    const target = group('persistence-raw-url-target');
    const invalidLink = { ...tab('persistence-raw-empty-link'), url: '' };
    const invalidGroupNoteLink = { ...tab('persistence-raw-group-note-link'), url: '' };
    const invalidNote = {
      ...createNoteRecord('persistence-raw-nonempty-note', {
        id: 'persistence-raw-nonempty-note',
        title: 'persistence-raw-nonempty-note',
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
      url: 'https://invalid-note.test',
    };
    const before = { ...createEmptyState(), groups: [target] };
    let stored = structuredClone(before);
    const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });
    const invalidMutations: unknown[] = [
      { type: 'add-tab', groupId: target.id, tab: invalidLink, updatedAt: timestamp },
      { type: 'import-groups', groups: [{ ...group('persistence-raw-url-group', [invalidNote]) }], updatedAt: timestamp },
      { type: 'set-group-note', groupId: target.id, text: 'invalid link note', noteTab: invalidGroupNoteLink, updatedAt: timestamp },
      { type: 'set-group-note', groupId: target.id, text: 'invalid note url', noteTab: invalidNote, updatedAt: timestamp },
    ];

    for (const mutation of invalidMutations) {
      await expect(persistence.applyMutations([mutation])).rejects.toMatchObject({ code: 'TAB_URL_INVALID' });
      expect(setState).not.toHaveBeenCalled();
      expect(stored).toEqual(before);
    }

    await persistence.applyMutations([{ type: 'update-group', id: target.id, updates: { title: 'recovered' }, updatedAt: timestamp }]);
    expect(stored.groups[0].title).toBe('recovered');
    expect(setState).toHaveBeenCalledTimes(1);
  });

  it('rejects locked-sibling placement changes atomically and recovers', async () => {
    const moving = group('persistence-placement-moving');
    const locked = { ...group('persistence-placement-locked'), locked: true };
    const placementFolder = folder('persistence-placement-folder');
    const otherWorkspace = {
      ...createEmptyState().workspaces[0],
      id: 'persistence-placement-other-workspace',
      name: 'Other',
    };
    const before = {
      ...createEmptyState(),
      workspaces: [...createEmptyState().workspaces, otherWorkspace],
      folders: [placementFolder],
      groups: [moving, locked],
    };
    let stored = structuredClone(before);
    const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });
    const invalidMutations: StateMutation[] = [
      { type: 'set-group-flags', id: moving.id, starred: true, updatedAt: timestamp },
      { type: 'update-group', id: moving.id, updates: { folderId: placementFolder.id }, updatedAt: timestamp },
      { type: 'update-group', id: moving.id, updates: { workspaceId: otherWorkspace.id }, updatedAt: timestamp },
    ];

    for (const mutation of invalidMutations) {
      await expect(persistence.applyMutations([mutation])).rejects.toMatchObject({ code: 'GROUP_LOCKED' });
      expect(setState).not.toHaveBeenCalled();
      expect(stored).toEqual(before);
    }

    await persistence.applyMutations([{
      type: 'update-group', id: moving.id, updates: { title: 'recovered' }, updatedAt: timestamp,
    }]);
    expect(setState).toHaveBeenCalledTimes(1);
    expect(stored.groups.find(({ id }) => id === moving.id)?.title).toBe('recovered');
  });

  it('rejects other locked-sibling placement shifts atomically and recovers', async () => {
    const locked = { ...group('persistence-placement-extra-locked'), locked: true };
    const unlocked = group('persistence-placement-extra-unlocked');
    const recovery = group('persistence-placement-extra-recovery');
    const placementFolder = folder('persistence-placement-extra-folder');
    const restoreEntry: BinEntry = {
      id: 'persistence-placement-extra-restore-bin',
      kind: 'group',
      label: unlocked.title,
      groupId: unlocked.id,
      groupTitle: unlocked.title,
      source: 'group',
      item: unlocked,
      deletedAt: timestamp,
      originalWorkspaceId: unlocked.workspaceId,
      originalFolderId: unlocked.folderId,
    };
    const removableTab = tab('persistence-placement-extra-tab');
    const cases: Array<{ before: TabBoardState; mutation: StateMutation; recoveryId: string }> = [
      {
        before: { ...createEmptyState(), groups: [unlocked, locked] },
        mutation: {
          type: 'delete-group', id: unlocked.id,
          binEntry: { ...restoreEntry, id: 'persistence-placement-extra-delete-bin' },
          updatedAt: timestamp,
        },
        recoveryId: unlocked.id,
      },
      {
        before: {
          ...createEmptyState(),
          folders: [placementFolder],
          groups: [{ ...unlocked, folderId: placementFolder.id }, locked],
        },
        mutation: { type: 'delete-folder', id: placementFolder.id, updatedAt: timestamp },
        recoveryId: unlocked.id,
      },
      {
        before: { ...createEmptyState(), groups: [locked, recovery] },
        mutation: { type: 'prepend-groups', groups: [unlocked], updatedAt: timestamp },
        recoveryId: recovery.id,
      },
      {
        before: { ...createEmptyState(), groups: [locked, recovery], bin: [restoreEntry] },
        mutation: { type: 'restore-group', entryId: restoreEntry.id, group: unlocked, index: 0, updatedAt: timestamp },
        recoveryId: recovery.id,
      },
      {
        before: { ...createEmptyState(), groups: [{ ...unlocked, tabs: [removableTab] }, locked, recovery] },
        mutation: {
          type: 'remove-restored-refs',
          refs: [{ source: 'group', groupId: unlocked.id, tabId: removableTab.id }],
          updatedAt: timestamp,
        },
        recoveryId: recovery.id,
      },
    ];

    for (const { before, mutation, recoveryId } of cases) {
      let stored = structuredClone(before);
      const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
      const persistence = createStatePersistence({
        locks: undefined,
        getState: async () => structuredClone(stored),
        setState,
      });
      await expect(persistence.applyMutations([mutation])).rejects.toMatchObject({ code: 'GROUP_LOCKED' });
      expect(setState).not.toHaveBeenCalled();
      expect(stored).toEqual(before);

      await persistence.applyMutations([{
        type: 'update-group', id: recoveryId, updates: { title: 'recovered' }, updatedAt: timestamp,
      }]);
      expect(setState).toHaveBeenCalledTimes(1);
      expect(stored.groups.find(({ id }) => id === recoveryId)?.title).toBe('recovered');
    }
  });

  it('allows unlocked sibling reorder and rejects locked placement shifts atomically', async () => {
    const first = group('persistence-reorder-unlocked-first');
    const second = group('persistence-reorder-unlocked-second');
    const locked = { ...group('persistence-reorder-locked-sibling'), locked: true };
    const trailing = group('persistence-reorder-unlocked-trailing');
    const before = { ...createEmptyState(), groups: [first, second, locked, trailing] };
    const successMutation: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
      orderedGroupIds: [second.id, first.id],
      updatedAt: timestamp,
    };
    let stored = structuredClone(before);
    const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    await persistence.applyMutations([successMutation]);
    expect(stored.groups.map(({ id }) => id)).toEqual([second.id, first.id, locked.id, trailing.id]);
    expect(stored.groups.find(({ id }) => id === locked.id)).toEqual(locked);
    expect(setState).toHaveBeenCalledTimes(1);

    const rejectedBefore = structuredClone(stored);
    const rejectedMutation: StateMutation = {
      ...successMutation,
      orderedGroupIds: [second.id, first.id, trailing.id],
    };
    await expect(persistence.applyMutations([rejectedMutation])).rejects.toMatchObject({ code: 'GROUP_LOCKED' });
    expect(setState).toHaveBeenCalledTimes(1);
    expect(stored).toEqual(rejectedBefore);
  });

  it('preserves stale reorder retries and shared-timestamp replays', async () => {
    const laterTimestamp = '2026-01-02T00:00:00.000Z';
    const first = group('persistence-replay-stale-first');
    const second = group('persistence-replay-stale-second');
    const staleMutation: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
      orderedGroupIds: [second.id, first.id],
      updatedAt: timestamp,
    };
    let stored = { ...createEmptyState(), groups: [first, second] };
    const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    await persistence.applyMutations([staleMutation]);
    await persistence.applyMutations([{
      type: 'update-group',
      id: second.id,
      updates: { title: 'newer title' },
      updatedAt: laterTimestamp,
    }]);
    const newer = structuredClone(stored);
    await persistence.applyMutations([staleMutation]);
    expect(stored).toEqual(newer);

    const locked = group('persistence-replay-shared-timestamp-locked');
    const listed = group('persistence-replay-shared-timestamp-listed');
    const unlisted = group('persistence-replay-shared-timestamp-unlisted');
    const sharedMutation: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
      orderedGroupIds: [listed.id, locked.id],
      updatedAt: timestamp,
    };
    stored = { ...createEmptyState(), groups: [locked, listed, unlisted] };
    const sharedPersistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    await sharedPersistence.applyMutations([sharedMutation]);
    await sharedPersistence.applyMutations([{
      type: 'set-group-flags',
      id: locked.id,
      locked: true,
      updatedAt: laterTimestamp,
    }]);
    const lockedSnapshot = structuredClone(stored);
    await sharedPersistence.applyMutations([sharedMutation]);
    expect(stored).toEqual(lockedSnapshot);
  });

  it('rejects forged locked replays and accepts an exact all-locked retry atomically', async () => {
    const forgedTimestamp = '2026-07-18T00:00:01.000Z';
    const lockedFirst = { ...group('persistence-forged-locked-first'), locked: true, updatedAt: timestamp };
    const lockedSecond = { ...group('persistence-forged-locked-second'), locked: true, updatedAt: timestamp };
    const forgedBefore = { ...createEmptyState(), groups: [lockedFirst, lockedSecond] };
    let stored = structuredClone(forgedBefore);
    const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });
    const forgedMutation: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
      orderedGroupIds: [lockedFirst.id, lockedSecond.id],
      updatedAt: forgedTimestamp,
    };

    await expect(persistence.applyMutations([forgedMutation])).rejects.toMatchObject({ code: 'GROUP_LOCKED' });
    expect(setState).not.toHaveBeenCalled();
    expect(stored).toEqual(forgedBefore);

    const first = group('persistence-all-locked-first');
    const second = group('persistence-all-locked-second');
    const trailing = group('persistence-all-locked-trailing');
    const mutation: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
      orderedGroupIds: [second.id, first.id],
      updatedAt: forgedTimestamp,
    };
    stored = { ...createEmptyState(), groups: [first, second, trailing] };
    const exactPersistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    await exactPersistence.applyMutations([mutation]);
    await exactPersistence.applyMutations([{
      type: 'update-group', id: trailing.id, updates: { title: 'unrelated update' }, updatedAt: forgedTimestamp,
    }]);
    await exactPersistence.applyMutations([{
      type: 'set-group-flags', id: first.id, locked: true, updatedAt: '2026-07-18T00:00:02.000Z',
    }]);
    await exactPersistence.applyMutations([{
      type: 'set-group-flags', id: second.id, locked: true, updatedAt: '2026-07-18T00:00:03.000Z',
    }]);
    const beforeRetry = structuredClone(stored);
    await exactPersistence.applyMutations([mutation]);
    expect(stored).toEqual(beforeRetry);
  });

  it('replays a singleton reorder when its untouched sibling shares the timestamp', async () => {
    const listed = group('persistence-singleton-listed');
    const sibling = group('persistence-singleton-sibling');
    const mutation: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
      orderedGroupIds: [listed.id],
      updatedAt: timestamp,
    };
    let stored = { ...createEmptyState(), groups: [sibling, listed] };
    const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    await persistence.applyMutations([mutation]);
    await persistence.applyMutations([{
      type: 'set-group-flags', id: listed.id, locked: true, updatedAt: timestamp,
    }]);
    await persistence.applyMutations([{
      type: 'update-settings', updates: { theme: 'dark' }, updatedAt: '2026-07-18T00:00:02.000Z',
    }]);
    const lockedSnapshot = structuredClone(stored);
    await persistence.applyMutations([mutation]);
    expect(stored).toEqual(lockedSnapshot);
  });

  it('rejects forged older reorder replays atomically after an unrelated group locks', async () => {
    const originalTimestamp = '2026-07-18T00:00:01.000Z';
    const forgedTimestamp = '2026-07-18T00:00:00.000Z';
    const lockTimestamp = '2026-07-18T00:00:02.000Z';
    const first = { ...group('persistence-replay-older-first'), updatedAt: forgedTimestamp };
    const second = { ...group('persistence-replay-older-second'), updatedAt: forgedTimestamp };
    const locked = { ...group('persistence-replay-older-unrelated-locked'), updatedAt: forgedTimestamp };
    const before = { ...createEmptyState(), groups: [first, second, locked] };
    const original: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
      orderedGroupIds: [second.id, first.id],
      updatedAt: originalTimestamp,
    };
    let stored = structuredClone(before);
    const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });

    await persistence.applyMutations([original]);
    await persistence.applyMutations([{
      type: 'set-group-flags', id: locked.id, locked: true, updatedAt: lockTimestamp,
    }]);
    const lockedSnapshot = structuredClone(stored);
    await expect(persistence.applyMutations([original])).resolves.toEqual(lockedSnapshot);

    for (const mutation of [
      { ...original, updatedAt: forgedTimestamp },
      { ...original, orderedGroupIds: [second.id, first.id, locked.id], updatedAt: forgedTimestamp },
    ]) {
      await expect(persistence.applyMutations([mutation])).rejects.toMatchObject({ code: 'GROUP_LOCKED' });
      expect(stored).toEqual(lockedSnapshot);
    }
    expect(setState).toHaveBeenCalledTimes(3);
  });

  it('replays exact same-group tab moves after locking without forged writes', async () => {
    const first = tab('persistence-same-group-first');
    const moved = tab('persistence-same-group-moved');
    const last = tab('persistence-same-group-last');
    const source = group('persistence-same-group-source', [first, moved, last]);
    let stored = { ...createEmptyState(), groups: [source] };
    const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(stored),
      setState,
    });
    const mutation: StateMutation = {
      type: 'move-tab',
      groupId: source.id,
      tabId: moved.id,
      targetGroupId: source.id,
      targetIndex: 0,
      updatedAt: '2026-07-18T00:00:01.000Z',
    };

    await persistence.applyMutations([mutation]);
    await persistence.applyMutations([{
      type: 'set-group-flags', id: source.id, locked: true, updatedAt: '2026-07-18T00:00:02.000Z',
    }]);
    const lockedSnapshot = structuredClone(stored);
    const writesBeforeExactReplay = setState.mock.calls.length;

    await expect(persistence.applyMutations([mutation])).resolves.toEqual(lockedSnapshot);
    expect(stored).toEqual(lockedSnapshot);
    expect(setState).toHaveBeenCalledTimes(writesBeforeExactReplay + 1);
    const writesBeforeForgedReplay = setState.mock.calls.length;
    for (const forged of [
      { ...mutation, targetIndex: 1 },
      { ...mutation, updatedAt: '2026-07-18T00:00:00.000Z' },
    ]) {
      await expect(persistence.applyMutations([forged])).rejects.toMatchObject({ code: 'GROUP_LOCKED' });
      expect(setState).toHaveBeenCalledTimes(writesBeforeForgedReplay);
      expect(stored).toEqual(lockedSnapshot);
    }
  });

  it('replays exact note and reorder mutations after later locking', async () => {
    const laterTimestamp = '2026-01-02T00:00:00.000Z';
    const reorderThird = { ...group('persistence-replay-unlisted'), updatedAt: '2025-12-31T00:00:00.000Z' };
    const singleReorderFirst = { ...group('persistence-replay-single-first'), updatedAt: timestamp };
    const cases: Array<{ before: TabBoardState; mutation: StateMutation; lockId: string; forged?: StateMutation[] }> = [
      {
        before: { ...createEmptyState(), groups: [group('persistence-replay-note-group', [tab('persistence-replay-note-tab')])] },
        mutation: {
          type: 'set-tab-note',
          groupId: 'persistence-replay-note-group',
          tabId: 'persistence-replay-note-tab',
          text: 'saved note',
          updatedAt: timestamp,
        },
        lockId: 'persistence-replay-note-group',
      },
      {
        before: {
          ...createEmptyState(),
          groups: [group('persistence-replay-first'), group('persistence-replay-second'), reorderThird],
        },
        mutation: {
          type: 'reorder-groups',
          workspaceId: 'workspace_default',
          folderId: null,
          starred: false,
          orderedGroupIds: ['persistence-replay-second', 'persistence-replay-first'],
          updatedAt: timestamp,
        },
        lockId: 'persistence-replay-second',
        forged: [
          {
            type: 'reorder-groups',
            workspaceId: 'workspace_default',
            folderId: null,
            starred: false,
            orderedGroupIds: ['persistence-replay-second', 'persistence-replay-first', reorderThird.id],
            updatedAt: timestamp,
          },
          {
            type: 'reorder-groups',
            workspaceId: 'workspace_default',
            folderId: null,
            starred: false,
            orderedGroupIds: ['persistence-replay-second'],
            updatedAt: timestamp,
          },
          {
            type: 'reorder-groups',
            workspaceId: 'workspace_default',
            folderId: null,
            starred: false,
            orderedGroupIds: ['persistence-replay-second', 'persistence-replay-first'],
            updatedAt: laterTimestamp,
          },
        ],
      },
      {
        before: {
          ...createEmptyState(),
          groups: [singleReorderFirst, group('persistence-replay-single-second')],
        },
        mutation: {
          type: 'reorder-groups',
          workspaceId: 'workspace_default',
          folderId: null,
          starred: false,
          orderedGroupIds: ['persistence-replay-single-second'],
          updatedAt: timestamp,
        },
        lockId: 'persistence-replay-single-second',
      },
    ];

    for (const { before, mutation, lockId, forged } of cases) {
      let stored = structuredClone(before);
      const setState = vi.fn(async (next: TabBoardState) => { stored = structuredClone(next); });
      const persistence = createStatePersistence({
        locks: undefined,
        getState: async () => structuredClone(stored),
        setState,
      });
      await persistence.applyMutations([mutation]);
      await persistence.applyMutations([{
        type: 'set-group-flags', id: lockId, locked: true, updatedAt: laterTimestamp,
      }]);
      const lockedSnapshot = structuredClone(stored);

      await expect(persistence.applyMutations([mutation])).resolves.toEqual(lockedSnapshot);
      expect(stored).toEqual(lockedSnapshot);
      for (const forgedMutation of forged || []) {
        await expect(persistence.applyMutations([forgedMutation])).rejects.toMatchObject({ code: 'GROUP_LOCKED' });
        expect(stored).toEqual(lockedSnapshot);
      }
    }
  });
});
