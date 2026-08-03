import { describe, expect, it } from 'vitest';
import {
  BIN_LIMIT,
  createEmptyState,
  createNoteRecord,
  DROP_OPERATION_LEDGER_LIMIT,
  normalizeState,
} from '../model';
import type { BinEntry, Folder, Group, TabBoardState, TabItem, Workspace } from '../model';
import {
  applyStateMutation,
  applyStateMutations,
  InvalidDropMutationError,
  RestoreCollisionError,
  isStateMutation,
  type StateMutation,
} from './stateMutations';
import {
  getDropIntentReplayStatus,
  getDropOperationDigest,
} from '../model/drop-operations';

const timestamp = '2026-01-01T00:00:00.000Z';

function folder(id: string, workspaceId = 'workspace_default', name = id): Folder {
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

function group(id: string, workspaceId = 'workspace_default', tabs: TabItem[] = []): Group {
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
    tabs,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function placedGroup(
  id: string,
  workspaceId: string,
  folderId: string | null,
  starred = false,
): Group {
  return { ...group(id, workspaceId), folderId, starred };
}

function tab(id: string, itemType: TabItem['itemType'] = 'link'): TabItem {
  if (itemType === 'note') {
    return createNoteRecord(id, {
      id,
      title: id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  return {
    id,
    itemType,
    title: id,
    url: `https://${id}.test`,
    favIconUrl: '',
    note: '',
    pinned: false,
    incognito: false,
    starred: false,
    taskStatus: '',
    browserGroup: null,
    sourceWindowId: null,
    sourceTabId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function groupBinEntry(source: Group, id = `${source.id}-bin`): BinEntry {
  return {
    id,
    kind: 'group',
    label: source.title,
    groupId: source.id,
    groupTitle: source.title,
    source: 'group',
    item: source,
    deletedAt: timestamp,
    originalWorkspaceId: source.workspaceId,
    originalFolderId: source.folderId,
  };
}

function tabBinEntry(
  source: Group,
  sourceTab: TabItem,
  id = `${sourceTab.id}-bin`,
): BinEntry {
  return {
    id,
    kind: 'tab',
    label: sourceTab.title,
    groupId: source.id,
    groupTitle: source.title,
    source: 'group',
    item: sourceTab,
    deletedAt: timestamp,
    originalGroupId: source.id,
    originalWorkspaceId: source.workspaceId,
    originalFolderId: source.folderId,
  };
}

describe('state mutations', () => {
  it('applies semantic mutations immutably and preserves both interleaved changes', () => {
    const before = createEmptyState();
    const mutations: StateMutation[] = [
      { type: 'prepend-groups', groups: [group('captured')], updatedAt: timestamp },
      { type: 'add-folder', folder: folder('folder-a', 'workspace_default', 'Work') },
    ];

    const after = applyStateMutations(before, mutations);

    expect(after.groups.map(({ id }) => id)).toEqual(['captured']);
    expect(after.folders.map(({ id }) => id)).toEqual(['folder-a']);
    expect(after).not.toBe(before);
    expect(before.groups).toEqual([]);
    expect(before.folders).toEqual([]);
  });

  it('validates duplicate category names against the latest state with exact errors', () => {
    const existing = folder('folder-a', 'workspace_default', 'Work');
    const state = applyStateMutations(createEmptyState(), [
      { type: 'add-folder', folder: existing },
    ]);

    expect(() => applyStateMutations(state, [
      { type: 'add-folder', folder: folder('folder-b', 'workspace_default', ' work ') },
    ])).toThrow('A category with this name already exists in this workspace.');
    expect(() => applyStateMutations(createEmptyState(), [
      { type: 'add-folder', folder: folder('folder-b', 'workspace_default', '   ') },
    ])).toThrow('Category name is required.');
  });

  it('updates a custom category name and color atomically while excluding itself from duplicate checks', () => {
    const existing = folder('folder-a', 'workspace_default', 'Work');
    const state = applyStateMutations(createEmptyState(), [
      { type: 'add-folder', folder: existing },
    ]);
    const mutation = {
      type: 'update-folder' as const,
      id: existing.id,
      name: ' Work ',
      color: '#fab005',
      expected: { name: 'Work', color: 'slate' },
      updatedAt: '2026-01-02T00:00:00.000Z',
    };

    expect(isStateMutation(mutation)).toBe(true);
    expect(applyStateMutation(state, mutation).folders[0]).toMatchObject({
      id: existing.id,
      name: 'Work',
      color: '#fab005',
      updatedAt: mutation.updatedAt,
    });
  });

  it('treats exact folder edit replay as success without revision or timestamp regression', () => {
    const existing = folder('folder-cas', 'workspace_default', 'Before');
    const before = applyStateMutations(createEmptyState(), [
      { type: 'add-folder', folder: existing },
    ]);
    const mutation: StateMutation = {
      type: 'update-folder',
      id: existing.id,
      name: 'After',
      color: '#40c057',
      expected: { name: 'Before', color: 'slate' },
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    const once = applyStateMutation(before, mutation);
    const replay = applyStateMutation(once, mutation);

    expect(replay).toEqual(once);
    expect(replay.mutationRevision).toBe(once.mutationRevision);
    expect(replay.updatedAt).toBe(once.updatedAt);
    expect(replay.folders[0]?.updatedAt).toBe(once.folders[0]?.updatedAt);
  });

  it('rejects independent or ABA folder target equality without the timestamp witness', () => {
    const existing = folder('folder-cas-aba', 'workspace_default', 'Before');
    const base = applyStateMutations(createEmptyState(), [
      { type: 'add-folder', folder: existing },
    ]);
    const mutation: StateMutation = {
      type: 'update-folder',
      id: existing.id,
      name: 'After',
      color: '#40c057',
      expected: { name: 'Before', color: 'slate' },
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    const independent: TabBoardState = {
      ...base,
      folders: [{
        ...base.folders[0],
        name: 'After',
        color: '#40c057',
        updatedAt: '2026-01-03T00:00:00.000Z',
      }],
      mutationRevision: base.mutationRevision + 1,
      updatedAt: '2026-01-03T00:00:00.000Z',
    };

    expect(() => applyStateMutation(independent, mutation)).toThrowError(
      expect.objectContaining({ code: 'CATEGORY_MUTATION_CONFLICT' }),
    );
  });

  it('rejects folder edit when current state differs from expected and target', () => {
    const existing = folder('folder-cas-conflict', 'workspace_default', 'Before');
    const base = applyStateMutations(createEmptyState(), [
      { type: 'add-folder', folder: existing },
    ]);
    const newer: TabBoardState = {
      ...base,
      folders: [{
        ...base.folders[0],
        name: 'Remote',
        color: '#fa5252',
        updatedAt: '2026-01-03T00:00:00.000Z',
      }],
      mutationRevision: base.mutationRevision + 1,
      updatedAt: '2026-01-03T00:00:00.000Z',
    };
    const snapshot = structuredClone(newer);

    expect(() => applyStateMutation(newer, {
      type: 'update-folder',
      id: existing.id,
      name: 'After',
      color: '#40c057',
      expected: { name: 'Before', color: 'slate' },
      updatedAt: '2026-01-02T00:00:00.000Z',
    })).toThrowError(expect.objectContaining({
      code: 'CATEGORY_MUTATION_CONFLICT',
    }));
    expect(newer).toEqual(snapshot);
  });

  it('strictly validates folder edit snapshots and supported colors', () => {
    const base = {
      type: 'update-folder',
      id: 'folder-a',
      name: 'After',
      color: '#40c057',
      expected: { name: 'Before', color: 'slate' },
      updatedAt: timestamp,
    };

    expect(isStateMutation(base)).toBe(true);
    expect(isStateMutation({ ...base, expected: { name: 'Before' } })).toBe(false);
    expect(isStateMutation({
      ...base,
      expected: { name: 'Before', color: 'slate', extra: true },
    })).toBe(false);
    expect(isStateMutation({
      ...base,
      expected: { name: ' Before ', color: 'slate' },
    })).toBe(false);
    expect(isStateMutation({
      ...base,
      expected: { name: 'Before', color: 'SLATE' },
    })).toBe(false);
    expect(isStateMutation({ ...base, color: 'transparent' })).toBe(false);
    expect(isStateMutation({ ...base, id: 'x'.repeat(129) })).toBe(false);
    expect(isStateMutation({
      ...base,
      expected: { name: 'Before', color: 'url(javascript:alert(1))' },
    })).toBe(false);
  });

  it('applies category order CAS once, replays exactly, and rejects intervening order', () => {
    const existing = folder('folder-order-cas');
    const base = applyStateMutations(createEmptyState(), [
      { type: 'add-folder', folder: existing },
    ]);
    const expectedCategoryOrder = [
      'inbox',
      'saved',
      'archive',
      `folder:${existing.id}`,
    ];
    const categoryOrder = [
      `folder:${existing.id}`,
      'inbox',
      'saved',
      'archive',
    ];
    const mutation: StateMutation = {
      type: 'set-category-order',
      workspaceId: 'workspace_default',
      expectedCategoryOrder,
      categoryOrder,
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    const once = applyStateMutation(base, mutation);
    const replay = applyStateMutation(once, mutation);

    expect(replay).toEqual(once);
    expect(replay.mutationRevision).toBe(once.mutationRevision);
    expect(replay.updatedAt).toBe(once.updatedAt);

    const newer: TabBoardState = {
      ...base,
      categoryOrderByWorkspace: {
        workspace_default: ['saved', 'inbox', 'archive', existing.id],
      },
      mutationRevision: base.mutationRevision + 1,
      updatedAt: '2026-01-03T00:00:00.000Z',
    };
    const snapshot = structuredClone(newer);
    expect(() => applyStateMutation(newer, mutation)).toThrowError(
      expect.objectContaining({ code: 'CATEGORY_MUTATION_CONFLICT' }),
    );
    expect(newer).toEqual(snapshot);
  });

  it('rejects independent or ABA target order without the top-level timestamp witness', () => {
    const existing = folder('folder-order-aba');
    const base = applyStateMutations(createEmptyState(), [
      { type: 'add-folder', folder: existing },
    ]);
    const mutation: StateMutation = {
      type: 'set-category-order',
      workspaceId: 'workspace_default',
      expectedCategoryOrder: [
        'inbox',
        'saved',
        'archive',
        `folder:${existing.id}`,
      ],
      categoryOrder: [
        `folder:${existing.id}`,
        'inbox',
        'saved',
        'archive',
      ],
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    const independent: TabBoardState = {
      ...base,
      categoryOrderByWorkspace: {
        workspace_default: [
          existing.id,
          'inbox',
          'saved',
          'archive',
        ],
      },
      mutationRevision: base.mutationRevision + 1,
      updatedAt: '2026-01-03T00:00:00.000Z',
    };

    expect(() => applyStateMutation(independent, mutation)).toThrowError(
      expect.objectContaining({ code: 'CATEGORY_MUTATION_CONFLICT' }),
    );
  });

  it('rejects incomplete expected order before already-applied replay detection', () => {
    const existing = folder('folder-order-incomplete-replay');
    const base = applyStateMutations(createEmptyState(), [
      { type: 'add-folder', folder: existing },
    ]);
    const currentTarget: TabBoardState = {
      ...base,
      categoryOrderByWorkspace: {
        workspace_default: [
          existing.id,
          'inbox',
          'saved',
          'archive',
        ],
      },
      updatedAt: '2026-01-02T00:00:00.000Z',
    };

    expect(() => applyStateMutation(currentTarget, {
      type: 'set-category-order',
      workspaceId: 'workspace_default',
      expectedCategoryOrder: ['inbox', 'saved', 'archive'],
      categoryOrder: [
        `folder:${existing.id}`,
        'inbox',
        'saved',
        'archive',
      ],
      updatedAt: '2026-01-02T00:00:00.000Z',
    })).toThrowError(expect.objectContaining({ code: 'REORDER_INVALID' }));
  });

  it('strictly validates complete dense category order snapshots', () => {
    const mutation = {
      type: 'set-category-order',
      workspaceId: 'workspace_default',
      expectedCategoryOrder: ['inbox', 'saved', 'archive'],
      categoryOrder: ['saved', 'inbox', 'archive'],
      updatedAt: timestamp,
    };
    expect(isStateMutation(mutation)).toBe(true);
    expect(isStateMutation({
      ...mutation,
      expectedCategoryOrder: new Array(1),
    })).toBe(false);
    expect(isStateMutation({
      ...mutation,
      categoryOrder: ['saved', 'saved', 'archive'],
    })).toBe(false);
    expect(isStateMutation({
      ...mutation,
      extra: true,
    })).toBe(false);
    expect(isStateMutation({
      ...mutation,
      workspaceId: 'x'.repeat(129),
    })).toBe(false);
  });

  it('accepts raw and prefixed category ids while persisting canonical ids', () => {
    const withFolder = applyStateMutation(
      createEmptyState(),
      { type: 'add-folder', folder: folder('folder-a') },
    );
    const expectedCategoryOrder = [
      'inbox',
      'saved',
      'archive',
      'folder:folder-a',
    ];
    const state = applyStateMutation(withFolder, {
      type: 'set-category-order',
      workspaceId: 'workspace_default',
      expectedCategoryOrder,
      categoryOrder: ['folder:folder-a', 'inbox', 'saved', 'archive'],
      updatedAt: timestamp,
    });

    expect(state.categoryOrderByWorkspace.workspace_default).toEqual([
      'folder-a',
      'inbox',
      'saved',
      'archive',
    ]);
  });

  it('rejects untrusted mutation payloads before applying them', () => {
    expect(isStateMutation({ type: 'add-folder', folder: 'not-a-folder' })).toBe(false);
    expect(isStateMutation({ type: 'prepend-groups', groups: [], updatedAt: 42 })).toBe(false);
    expect(() => applyStateMutations(createEmptyState(), [
      { type: 'unknown-action' } as never,
    ])).toThrow('Invalid state mutation.');
  });

  it('requires a normalized emoji in add-workspace payloads', () => {
    const workspace = {
      ...createEmptyState().workspaces[0],
      id: 'workspace-emoji-boundary',
    };
    const { emoji: _emoji, ...missingEmoji } = workspace;

    for (const candidate of [
      missingEmoji,
      { ...workspace, emoji: 'text' },
      { ...workspace, emoji: '😀😀' },
    ]) {
      const mutation = { type: 'add-workspace', workspace: candidate };
      expect(isStateMutation(mutation)).toBe(false);
      expect(() => applyStateMutation(createEmptyState(), mutation as never))
        .toThrow('Invalid state mutation.');
    }
  });

  it('updates a workspace name and emoji atomically with canonical name validation', () => {
    const workspaceA = {
      ...createEmptyState().workspaces[0],
      id: 'workspace-a',
      name: 'Research',
    };
    const workspaceB: Workspace = {
      ...workspaceA,
      id: 'workspace-b',
      name: 'Café',
    };
    const state = {
      ...createEmptyState(),
      workspaces: [workspaceA, workspaceB],
      activeWorkspaceId: workspaceA.id,
    };

    const updated = applyStateMutation(state, {
      type: 'update-workspace',
      id: workspaceA.id,
      name: '  Research Lab  ',
      emoji: '🧪',
      updatedAt: timestamp,
    } as StateMutation);

    expect(updated.workspaces[0]).toMatchObject({
      name: 'Research Lab',
      emoji: '🧪',
      updatedAt: timestamp,
    });
    expect(updated.workspaces[1]).toEqual(workspaceB);

    for (const mutation of [
      {
        type: 'update-workspace',
        id: workspaceA.id,
        name: 'cAFE\u0301',
        emoji: '🧪',
        updatedAt: timestamp,
      },
      {
        type: 'update-workspace',
        id: workspaceA.id,
        name: '   ',
        emoji: '🧪',
        updatedAt: timestamp,
      },
      {
        type: 'update-workspace',
        id: workspaceA.id,
        name: 'Research Lab',
        emoji: 'text',
        updatedAt: timestamp,
      },
    ] as StateMutation[]) {
      expect(() => applyStateMutation(state, mutation)).toThrow();
      expect(state.workspaces[0]).toEqual(workspaceA);
    }
  });

  it('sets workspace order only from a dense permutation of current workspace IDs', () => {
    const workspaceA = {
      ...createEmptyState().workspaces[0],
      id: 'workspace-a',
      name: 'A',
    };
    const workspaceB: Workspace = { ...workspaceA, id: 'workspace-b', name: 'B' };
    const workspaceC: Workspace = { ...workspaceA, id: 'workspace-c', name: 'C' };
    const state = {
      ...createEmptyState(),
      workspaces: [workspaceA, workspaceB, workspaceC],
      activeWorkspaceId: workspaceB.id,
      folders: [folder('workspace-order-folder', workspaceA.id)],
      groups: [group('workspace-order-group', workspaceC.id)],
      categoryOrderByWorkspace: {
        [workspaceA.id]: ['saved', 'inbox'],
      },
    };

    const reordered = applyStateMutation(state, {
      type: 'set-workspace-order',
      orderedWorkspaceIds: [workspaceC.id, workspaceA.id, workspaceB.id],
      updatedAt: timestamp,
    } as StateMutation);

    expect(reordered.workspaces.map(({ id }) => id)).toEqual([
      workspaceC.id,
      workspaceA.id,
      workspaceB.id,
    ]);
    expect(reordered.activeWorkspaceId).toBe(workspaceB.id);
    expect(reordered.folders).toEqual(state.folders);
    expect(reordered.groups).toEqual(state.groups);
    expect(reordered.categoryOrderByWorkspace).toEqual(state.categoryOrderByWorkspace);

    const sparse = new Array(3) as string[];
    sparse[0] = workspaceA.id;
    sparse[2] = workspaceC.id;
    const invalidOrders: unknown[] = [
      [workspaceA.id, workspaceB.id],
      [workspaceA.id, workspaceB.id, workspaceB.id],
      [workspaceA.id, workspaceB.id, workspaceC.id, 'workspace-extra'],
      [workspaceA.id, workspaceB.id, 'workspace-from-another-state'],
      sparse,
      [workspaceA.id, workspaceB.id, 42],
    ];
    for (const orderedWorkspaceIds of invalidOrders) {
      const mutation = {
        type: 'set-workspace-order',
        orderedWorkspaceIds,
        updatedAt: timestamp,
      };
      expect(() => applyStateMutation(state, mutation as StateMutation)).toThrow();
      expect(state.workspaces.map(({ id }) => id)).toEqual([
        workspaceA.id,
        workspaceB.id,
        workspaceC.id,
      ]);
    }
  });

  it('replays exact workspace updates and canonical order without advancing revision', () => {
    const workspaceA = {
      ...createEmptyState().workspaces[0],
      id: 'workspace-a',
      name: 'A',
    };
    const workspaceB: Workspace = { ...workspaceA, id: 'workspace-b', name: 'B' };
    const state = {
      ...createEmptyState(),
      workspaces: [workspaceA, workspaceB],
      activeWorkspaceId: workspaceA.id,
    };
    const update = {
      type: 'update-workspace',
      id: workspaceA.id,
      name: 'Research Lab',
      emoji: '🧪',
      updatedAt: timestamp,
    } as StateMutation;
    const order = {
      type: 'set-workspace-order',
      orderedWorkspaceIds: [workspaceB.id, workspaceA.id],
      updatedAt: timestamp,
    } as StateMutation;

    const updatedOnce = applyStateMutation(state, update);
    expect(applyStateMutation(updatedOnce, update)).toEqual(updatedOnce);
    const orderedOnce = applyStateMutation(updatedOnce, order);
    expect(applyStateMutation(orderedOnce, order)).toEqual(orderedOnce);
  });

  it('rejects sparse prepend and import group arrays before semantic validation', () => {
    const holesOnly = new Array(1) as Group[];
    const validAfterHole = new Array(2) as Group[];
    validAfterHole[1] = group('valid-after-hole');
    const before = createEmptyState();
    const snapshot = structuredClone(before);

    for (const type of ['prepend-groups', 'import-groups'] as const) {
      for (const groups of [holesOnly, validAfterHole]) {
        const mutation = { type, groups, updatedAt: timestamp };
        expect(isStateMutation(mutation)).toBe(false);
        expect(() => applyStateMutation(before, mutation as never)).toThrow('Invalid state mutation.');
        expect(before).toEqual(snapshot);
      }
    }
  });

  it('strictly validates TabItem fields recursively at the raw boundary', () => {
    const valid = tab('strict-tab');
    const malformedTabs: unknown[] = [
      { ...valid, browserGroup: { sourceGroupId: null, title: 'Browser', color: 'blue', collapsed: false, extra: true } },
      { ...valid, browserGroup: { sourceGroupId: null, title: 'Browser', color: 'blue' } },
      { ...valid, sourceWindowId: '1' },
      { ...valid, sourceTabId: {} },
      { ...valid, unexpected: true },
    ];
    const mutations = malformedTabs.map((candidate, index) => ({
      type: 'add-tab',
      groupId: 'strict-target',
      tab: candidate,
      updatedAt: timestamp,
      index,
    }));
    mutations.forEach(({ index, ...mutation }) => {
      expect(isStateMutation(mutation)).toBe(false);
      expect(() => applyStateMutations({ ...createEmptyState(), groups: [group('strict-target')] }, [mutation as never]))
        .toThrow('Invalid state mutation.');
    });

    const nestedMissingSource = { ...valid, sourceWindowId: undefined };
    const nestedDirectBin = { ...valid, sourceTabId: '1' };
    const nestedGroupBin = { ...valid, browserGroup: { sourceGroupId: null, title: 'Browser', color: 'blue', collapsed: false, extra: true } };
    const recursiveMutations: unknown[] = [
      { type: 'add-group', group: { ...group('strict-nested-group'), tabs: [nestedMissingSource] }, updatedAt: timestamp },
      {
        type: 'delete-tab',
        groupId: 'strict-target',
        tabId: nestedDirectBin.id,
        binEntry: { id: 'strict-direct-bin', kind: 'tab', item: nestedDirectBin, deletedAt: timestamp },
        updatedAt: timestamp,
      },
      {
        type: 'delete-group',
        id: 'strict-nested-bin-group',
        binEntry: {
          id: 'strict-nested-group-bin',
          kind: 'group',
          groupId: 'strict-nested-bin-group',
          item: { ...group('strict-nested-bin-group'), tabs: [nestedGroupBin] },
          deletedAt: timestamp,
        },
        updatedAt: timestamp,
      },
    ];
    recursiveMutations.forEach((mutation) => {
      expect(isStateMutation(mutation)).toBe(false);
      expect(() => applyStateMutations(createEmptyState(), [mutation as never])).toThrow('Invalid state mutation.');
    });
  });

  it('rejects invalid mutable patches and immutable field overrides', () => {
    expect(isStateMutation({
      type: 'update-group',
      id: 'group-a',
      updates: { tabs: 'invalid' },
      updatedAt: timestamp,
    })).toBe(false);
    expect(isStateMutation({
      type: 'update-group',
      id: 'group-a',
      updates: { id: 'other-id' },
      updatedAt: timestamp,
    })).toBe(false);
    expect(isStateMutation({
      type: 'update-tab',
      groupId: 'group-a',
      tabId: 'tab-a',
      updates: { itemType: 42 },
      updatedAt: timestamp,
    })).toBe(false);
    expect(isStateMutation({
      type: 'delete-group',
      id: 'group-a',
      binEntry: {
        id: 'bin-a',
        kind: 'group',
        label: 'other',
        groupId: 'other-group',
        groupTitle: 'other',
        source: 'group',
        item: group('other-group'),
        deletedAt: timestamp,
      },
      updatedAt: timestamp,
    })).toBe(false);
  });

  it('rejects patches that orphan a group from its workspace or folder', () => {
    const before = applyStateMutations(createEmptyState(), [
      { type: 'add-group', group: group('group-a'), updatedAt: timestamp },
    ]);

    expect(() => applyStateMutations(before, [{
      type: 'update-group',
      id: 'group-a',
      updates: { workspaceId: 'missing-workspace' },
      updatedAt: timestamp,
    }])).toThrow('Invalid state mutation.');
  });

  it('restores matching Bin groups at their persisted insertion index', () => {
    const source = group('deleted');
    const entry = {
      id: 'bin-group',
      kind: 'group' as const,
      label: source.title,
      groupId: source.id,
      groupTitle: source.title,
      source: 'group',
      item: source,
      deletedAt: timestamp,
    };
    const before = { ...createEmptyState(), groups: [group('before'), group('after')], bin: [entry] };
    const restored = { ...source };

    const after = applyStateMutations(before, [{
      type: 'restore-group',
      entryId: entry.id,
      group: restored,
      index: 1,
      updatedAt: timestamp,
    }]);

    expect(after.groups.map(({ id }) => id)).toEqual(['before', 'deleted', 'after']);
    expect(() => applyStateMutations(before, [{
      type: 'restore-group',
      entryId: entry.id,
      group: { ...restored, title: 'forged' },
      index: 1,
      updatedAt: timestamp,
    }])).toThrow('Invalid state mutation.');
  });

  it('rejects same-content live group IDs while preserving the Bin entry', () => {
    const source = group('restore-group-collision');
    const entry: BinEntry = {
      id: 'restore-group-collision-bin',
      kind: 'group',
      label: source.title,
      groupId: source.id,
      groupTitle: source.title,
      source: 'group',
      item: source,
      deletedAt: timestamp,
    };
    const before = { ...createEmptyState(), groups: [source], bin: [entry] };

    expect(() => applyStateMutation(before, {
      type: 'restore-group',
      entryId: entry.id,
      group: source,
      index: 0,
      updatedAt: timestamp,
    })).toThrowError(RestoreCollisionError);
    expect(before.groups).toEqual([source]);
    expect(before.bin).toEqual([entry]);
  });

  it.each([
    ['same-content', (source: TabItem) => source],
    ['different-content', (source: TabItem) => ({ ...source, title: 'unrelated-live-tab' })],
  ])('rejects %s live child-tab IDs during group restore', (_label, liveTab) => {
    const sourceTab = tab('restore-group-child-collision');
    const sourceGroup = group('restore-group-child-source', 'workspace_default', [sourceTab]);
    const entry: BinEntry = {
      id: 'restore-group-child-collision-bin',
      kind: 'group',
      label: sourceGroup.title,
      groupId: sourceGroup.id,
      groupTitle: sourceGroup.title,
      source: 'group',
      item: sourceGroup,
      deletedAt: timestamp,
    };
    const before = {
      ...createEmptyState(),
      groups: [group('restore-group-child-live', 'workspace_default', [liveTab(sourceTab)])],
      bin: [entry],
    };

    expect(() => applyStateMutation(before, {
      type: 'restore-group',
      entryId: entry.id,
      group: sourceGroup,
      index: 0,
      updatedAt: timestamp,
    })).toThrowError(RestoreCollisionError);
    expect(before.groups).toHaveLength(1);
    expect(before.groups[0].tabs).toHaveLength(1);
    expect(before.bin).toEqual([entry]);
  });

  it('rejects restore-group collisions across all Bin entities and duplicate children', () => {
    const sourceTabA = tab('restore-global-child-a');
    const sourceTabB = tab('restore-global-child-b');
    const source = group('restore-global-source', 'workspace_default', [sourceTabA, sourceTabB]);
    const selectedEntry: BinEntry = {
      id: 'restore-global-selected',
      kind: 'group',
      label: source.title,
      groupId: source.id,
      groupTitle: source.title,
      source: 'group',
      item: source,
      deletedAt: timestamp,
    };
    const directTabEntry: BinEntry = {
      id: 'restore-global-direct-tab',
      kind: 'tab',
      label: sourceTabA.title,
      groupId: 'other-group',
      groupTitle: 'Other',
      source: 'group',
      item: sourceTabA,
      deletedAt: timestamp,
    };
    const nestedTabEntry: BinEntry = {
      id: 'restore-global-nested-tab',
      kind: 'group',
      label: 'Nested',
      groupId: 'other-group',
      groupTitle: 'Other',
      source: 'group',
      item: group('other-group', 'workspace_default', [sourceTabB]),
      deletedAt: timestamp,
    };
    const otherGroupEntry: BinEntry = {
      id: 'restore-global-other-group',
      kind: 'group',
      label: source.title,
      groupId: source.id,
      groupTitle: source.title,
      source: 'group',
      item: { ...source, title: 'Other copy' },
      deletedAt: timestamp,
    };
    [directTabEntry, nestedTabEntry, otherGroupEntry].forEach((conflict) => {
      expect(() => applyStateMutation({ ...createEmptyState(), bin: [selectedEntry, conflict] }, {
        type: 'restore-group',
        entryId: selectedEntry.id,
        group: source,
        index: 0,
        updatedAt: timestamp,
      })).toThrowError(RestoreCollisionError);
    });

    const duplicateChild = tab('restore-global-duplicate-child');
    const duplicateSource = group('restore-global-duplicate-source', 'workspace_default', [duplicateChild, duplicateChild]);
    const duplicateEntry: BinEntry = { ...selectedEntry, id: 'restore-global-duplicate-entry', groupId: duplicateSource.id, groupTitle: duplicateSource.title, item: duplicateSource };
    expect(() => applyStateMutation({ ...createEmptyState(), bin: [duplicateEntry] }, {
      type: 'restore-group',
      entryId: duplicateEntry.id,
      group: duplicateSource,
      index: 0,
      updatedAt: timestamp,
    })).toThrowError(RestoreCollisionError);
  });

  it.each(['same-payload', 'different-payload'])('rejects duplicate Bin entry IDs for restore-group (%s)', (payload) => {
    const source = group('duplicate-restore-group', 'workspace_default', [tab('duplicate-restore-child')]);
    const selectedEntry: BinEntry = {
      id: 'duplicate-restore-group-entry',
      kind: 'group',
      label: source.title,
      groupId: source.id,
      groupTitle: source.title,
      source: 'group',
      item: source,
      deletedAt: timestamp,
    };
    const siblingEntry: BinEntry = {
      ...selectedEntry,
      item: payload === 'same-payload' ? source : { ...source, title: 'Sibling payload' },
    };
    const before = { ...createEmptyState(), bin: [selectedEntry, siblingEntry] };

    expect(() => applyStateMutation(before, {
      type: 'restore-group',
      entryId: selectedEntry.id,
      group: source,
      index: 0,
      updatedAt: timestamp,
    })).toThrowError(RestoreCollisionError);
    expect(before.bin).toEqual([selectedEntry, siblingEntry]);
    expect(before.groups).toEqual([]);
  });

  it.each(['same-payload', 'different-payload'])('rejects duplicate Bin entry IDs for restore-tab (%s)', (payload) => {
    const source = tab('duplicate-restore-tab');
    const selectedEntry: BinEntry = {
      id: 'duplicate-restore-tab-entry',
      kind: 'tab',
      label: source.title,
      groupId: 'duplicate-restore-target',
      groupTitle: 'Target',
      source: 'group',
      item: source,
      deletedAt: timestamp,
      originalGroupId: 'duplicate-restore-target',
      originalWorkspaceId: 'workspace_default',
      originalFolderId: null,
      originalIndex: 0,
    };
    const siblingEntry: BinEntry = {
      ...selectedEntry,
      item: payload === 'same-payload' ? source : { ...source, title: 'Sibling payload' },
    };
    const before = {
      ...createEmptyState(),
      groups: [group('duplicate-restore-target')],
      bin: [selectedEntry, siblingEntry],
    };

    expect(() => applyStateMutation(before, {
      type: 'restore-tab',
      entryId: selectedEntry.id,
      groupId: 'duplicate-restore-target',
      tab: source,
      index: 0,
      updatedAt: timestamp,
    })).toThrowError(RestoreCollisionError);
    expect(before.groups[0].tabs).toEqual([]);
    expect(before.bin).toEqual([selectedEntry, siblingEntry]);
  });

  it('requires canonical note payloads for set-group-note', () => {
    const canonical = createNoteRecord('Canonical note', {
      id: 'canonical-group-note',
      title: 'Canonical note',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const before = { ...createEmptyState(), groups: [group('canonical-note-group')] };
    const valid = {
      type: 'set-group-note' as const,
      groupId: 'canonical-note-group',
      text: 'Canonical note',
      noteTab: canonical,
      updatedAt: timestamp,
    };
    const after = applyStateMutation(before, valid);

    expect(after.groups[0].note).toBe('Canonical note');
    expect(after.groups[0].tabs[0]).toEqual(canonical);
    for (const noteTab of [
      { ...canonical, url: 'https://not-a-note.test' },
      { ...canonical, itemType: 'link' as const },
    ]) {
      expect(() => applyStateMutation(before, { ...valid, noteTab })).toThrowError(
        expect.objectContaining({ code: 'TAB_URL_INVALID' }),
      );
    }
    for (const noteTab of [
      { ...canonical, taskStatus: 'todo' },
      { ...canonical, note: 'different text' },
      { ...canonical, pinned: true },
      { ...canonical, sourceWindowId: 7 },
    ]) {
      expect(() => applyStateMutation(before, { ...valid, noteTab })).toThrowError(
        expect.objectContaining({ code: 'GROUP_NOTE_INVALID' }),
      );
    }
  });

  it('enforces existing UTF-8 bounds on persisted ordinary text fields', () => {
    const within = 'x'.repeat(512);
    const over = `${within}x`;
    const mutations = [
      { type: 'update-group', id: 'group-a', updates: { title: within }, updatedAt: timestamp },
      { type: 'update-group', id: 'group-a', updates: { note: within }, updatedAt: timestamp },
      { type: 'rename-workspace', id: 'workspace_default', name: within, updatedAt: timestamp },
      { type: 'rename-folder', id: 'folder-a', name: within, updatedAt: timestamp },
    ];
    mutations.forEach((mutation) => expect(isStateMutation(mutation)).toBe(true));
    expect(isStateMutation({ ...mutations[0], updates: { title: over } })).toBe(false);
    expect(isStateMutation({ ...mutations[1], updates: { note: over } })).toBe(false);
    expect(isStateMutation({ ...mutations[2], name: over })).toBe(false);
    expect(isStateMutation({ ...mutations[3], name: over })).toBe(false);
  });

  it('rejects partial stable generated IDs after ledger eviction without changing state', () => {
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'partial-copy',
      intent: {
        kind: 'copy-open-tabs',
        tabIds: [101, 102],
        windowId: 7,
        targetGroupId: 'partial-copy-target',
        targetIndex: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [
        { id: 101, windowId: 7, title: 'One', url: 'https://one.test', favIconUrl: '', pinned: false, index: 0, browserGroup: null, storable: true, reason: null },
        { id: 102, windowId: 7, title: 'Two', url: 'https://two.test', favIconUrl: '', pinned: false, index: 1, browserGroup: null, storable: true, reason: null },
      ],
      updatedAt: timestamp,
    };
    const applied = applyStateMutation({ ...createEmptyState(), groups: [group('partial-copy-target')] }, mutation);
    const before = {
      ...applied,
      groups: [{ ...applied.groups[0], tabs: applied.groups[0].tabs.slice(0, 1) }],
      dropOperationLedger: [],
    };
    const snapshot = structuredClone(before);

    expect(() => applyStateMutation(before, mutation)).toThrowError(InvalidDropMutationError);
    expect(before).toEqual(snapshot);
    expect(before.mutationRevision).toBe(snapshot.mutationRevision);
  });

  it('rejects an occupied generated create-session ID when replay cannot be proven', () => {
    const operationId = 'partial-create';
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId,
      intent: {
        kind: 'create-session',
        source: { kind: 'open-tabs', tabIds: [101], windowId: 7 },
        category: 'inbox',
        index: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [{ id: 101, windowId: 7, title: 'Created', url: 'https://created.test', favIconUrl: '', pinned: false, index: 0, browserGroup: null, storable: true, reason: null }],
      updatedAt: timestamp,
    };
    const before = {
      ...createEmptyState(),
      groups: [{ ...group(`drop_${operationId}_group`), title: 'unrelated' }],
      dropOperationLedger: [],
    };

    expect(() => applyStateMutation(before, mutation)).toThrowError(InvalidDropMutationError);
    expect(before.groups).toHaveLength(1);
    expect(before.mutationRevision).toBe(0);
  });

  it('rejects partially occupied create-session tab IDs after ledger eviction', () => {
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'partial-create-tab',
      intent: {
        kind: 'create-session',
        source: { kind: 'open-tabs', tabIds: [101, 102], windowId: 7 },
        category: 'inbox',
        index: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [
        { id: 101, windowId: 7, title: 'One', url: 'https://one.test', favIconUrl: '', pinned: false, index: 0, browserGroup: null, storable: true, reason: null },
        { id: 102, windowId: 7, title: 'Two', url: 'https://two.test', favIconUrl: '', pinned: false, index: 1, browserGroup: null, storable: true, reason: null },
      ],
      updatedAt: timestamp,
    };
    const applied = applyStateMutation(createEmptyState(), mutation);
    const createdGroup = applied.groups[0];
    const generatedTab = createdGroup.tabs[0];
    const before = {
      ...createEmptyState(),
      bin: [{
        id: 'partial-create-tab-bin',
        kind: 'tab' as const,
        label: generatedTab.title,
        groupId: createdGroup.id,
        groupTitle: createdGroup.title,
        source: 'group' as const,
        item: generatedTab,
        deletedAt: timestamp,
      }],
      dropOperationLedger: [],
    };

    expect(() => applyStateMutation(before, mutation)).toThrowError(InvalidDropMutationError);
    expect(before.groups).toEqual([]);
    expect(before.bin[0].item.id).toBe(generatedTab.id);
    expect(before.mutationRevision).toBe(0);
  });

  it('rejects generated ID conflicts in direct and nested Bin entries after ledger eviction', () => {
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'partial-bin-copy',
      intent: {
        kind: 'copy-open-tabs',
        tabIds: [101, 102],
        windowId: 7,
        targetGroupId: 'partial-bin-target',
        targetIndex: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [
        { id: 101, windowId: 7, title: 'One', url: 'https://one.test', favIconUrl: '', pinned: false, index: 0, browserGroup: null, storable: true, reason: null },
        { id: 102, windowId: 7, title: 'Two', url: 'https://two.test', favIconUrl: '', pinned: false, index: 1, browserGroup: null, storable: true, reason: null },
      ],
      updatedAt: timestamp,
    };
    const source = applyStateMutation({ ...createEmptyState(), groups: [group('partial-bin-target')] }, mutation);
    const generated = source.groups[0].tabs[0];
    const directBin: BinEntry = {
      id: 'partial-direct-bin', kind: 'tab', label: generated.title, groupId: 'partial-bin-target', groupTitle: 'partial-bin-target', source: 'group', item: generated, deletedAt: timestamp,
    };
    const nestedBin: BinEntry = {
      id: 'partial-nested-bin', kind: 'group', label: 'Nested', groupId: 'nested', groupTitle: 'Nested', source: 'group', item: group('nested', 'workspace_default', [source.groups[0].tabs[1]]), deletedAt: timestamp,
    };
    for (const entry of [directBin, nestedBin]) {
      const before = { ...createEmptyState(), groups: [group('partial-bin-target')], bin: [entry] };
      expect(() => applyStateMutation(before, mutation)).toThrowError(InvalidDropMutationError);
      expect(before.bin).toEqual([entry]);
      expect(before.mutationRevision).toBe(0);
    }
  });

  it('accepts canonical note replay only with canonical payload', () => {
    const note = createNoteRecord('Replay note', { id: 'replay-canonical-note', title: 'Replay note', createdAt: timestamp, updatedAt: timestamp });
    const mutation: StateMutation = { type: 'set-group-note', groupId: 'replay-note-group', text: 'Replay note', noteTab: note, updatedAt: timestamp };
    const once = applyStateMutation({ ...createEmptyState(), groups: [group('replay-note-group')] }, mutation);
    expect(applyStateMutation(once, mutation)).toEqual(once);
  });

  it('rejects same-content tab IDs outside the restore target', () => {
    const sourceTab = tab('restore-tab-collision');
    const entry: BinEntry = {
      id: 'restore-tab-collision-bin',
      kind: 'tab',
      label: sourceTab.title,
      groupId: 'restore-target',
      groupTitle: 'restore-target',
      source: 'group',
      item: sourceTab,
      deletedAt: timestamp,
      originalGroupId: 'restore-target',
      originalWorkspaceId: 'workspace_default',
      originalFolderId: null,
      originalIndex: 0,
    };
    const before = {
      ...createEmptyState(),
      groups: [group('restore-target'), group('restore-other', 'workspace_default', [sourceTab])],
      bin: [entry],
    };

    expect(() => applyStateMutation(before, {
      type: 'restore-tab',
      entryId: entry.id,
      groupId: 'restore-target',
      tab: sourceTab,
      index: 0,
      updatedAt: timestamp,
    })).toThrowError(RestoreCollisionError);
    expect(before.groups[0].tabs).toEqual([]);
    expect(before.bin).toEqual([entry]);
  });

  it('rejects restore-tab collisions in direct and nested Bin entities', () => {
    const sourceTab = tab('restore-global-tab');
    const selectedEntry: BinEntry = {
      id: 'restore-global-tab-selected',
      kind: 'tab',
      label: sourceTab.title,
      groupId: 'restore-global-target',
      groupTitle: 'Target',
      source: 'group',
      item: sourceTab,
      deletedAt: timestamp,
      originalGroupId: 'restore-global-target',
      originalWorkspaceId: 'workspace_default',
      originalFolderId: null,
      originalIndex: 0,
    };
    const directConflict: BinEntry = { ...selectedEntry, id: 'restore-global-tab-direct-conflict' };
    const nestedConflict: BinEntry = {
      ...selectedEntry,
      id: 'restore-global-tab-nested-conflict',
      kind: 'group',
      groupId: 'restore-global-nested-parent',
      groupTitle: 'Nested',
      item: group('restore-global-nested-parent', 'workspace_default', [sourceTab]),
    };
    [directConflict, nestedConflict].forEach((conflict) => {
      expect(() => applyStateMutation({ ...createEmptyState(), groups: [group('restore-global-target')], bin: [selectedEntry, conflict] }, {
        type: 'restore-tab',
        entryId: selectedEntry.id,
        groupId: 'restore-global-target',
        tab: sourceTab,
        index: 0,
        updatedAt: timestamp,
      })).toThrowError(RestoreCollisionError);
    });
  });

  it('requires restore creation metadata to match Bin evidence', () => {
    const sourceGroup = group('restore-created-group', 'workspace_default', [tab('restore-created-tab')]);
    const groupEntry: BinEntry = {
      id: 'restore-created-group-bin',
      kind: 'group',
      label: sourceGroup.title,
      groupId: sourceGroup.id,
      groupTitle: sourceGroup.title,
      source: 'group',
      item: sourceGroup,
      deletedAt: timestamp,
    };
    expect(() => applyStateMutation({ ...createEmptyState(), bin: [groupEntry] }, {
      type: 'restore-group',
      entryId: groupEntry.id,
      group: { ...sourceGroup, createdAt: '2020-01-01T00:00:00.000Z' },
      index: 0,
      updatedAt: timestamp,
    })).toThrow('Invalid state mutation.');

    const sourceTab = tab('restore-created-tab-only');
    const tabEntry: BinEntry = {
      id: 'restore-created-tab-bin',
      kind: 'tab',
      label: sourceTab.title,
      groupId: 'restore-created-target',
      groupTitle: 'restore-created-target',
      source: 'group',
      item: sourceTab,
      deletedAt: timestamp,
    };
    expect(() => applyStateMutation({ ...createEmptyState(), groups: [group('restore-created-target')], bin: [tabEntry] }, {
      type: 'restore-tab',
      entryId: tabEntry.id,
      groupId: 'restore-created-target',
      tab: { ...sourceTab, createdAt: '2020-01-01T00:00:00.000Z' },
      index: 0,
      updatedAt: timestamp,
    })).toThrow('Invalid state mutation.');
  });

  it('rejects delete-tab when the tab does not exist in the parent group', () => {
    const deletedTab = tab('delete-tab-wrong-parent');
    const parent = group('delete-tab-parent');
    const wrongParent = group('delete-tab-wrong-parent-group', 'workspace_default', [deletedTab]);
    const entry: BinEntry = {
      id: 'delete-tab-wrong-parent-bin',
      kind: 'tab',
      label: deletedTab.title,
      groupId: parent.id,
      groupTitle: parent.title,
      source: 'group',
      item: deletedTab,
      deletedAt: timestamp,
      originalGroupId: parent.id,
      originalWorkspaceId: parent.workspaceId,
      originalFolderId: parent.folderId,
      originalIndex: 0,
    };
    const before = { ...createEmptyState(), groups: [parent, wrongParent], bin: [entry] };
    const snapshot = structuredClone(before);

    expect(() => applyStateMutation(before, {
      type: 'delete-tab',
      groupId: parent.id,
      tabId: deletedTab.id,
      binEntry: entry,
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'TAB_NOT_FOUND' }));
    expect(before).toEqual(snapshot);
    expect(before.mutationRevision).toBe(snapshot.mutationRevision);
    expect(before.bin).toEqual([entry]);
  });

  it('replays delete-tab only from one exact Bin record when no live tab remains', () => {
    const deletedTab = tab('delete-tab-exact-replay');
    const parent = group('delete-tab-exact-parent');
    const entry: BinEntry = {
      id: 'delete-tab-exact-bin',
      kind: 'tab',
      label: deletedTab.title,
      groupId: parent.id,
      groupTitle: parent.title,
      source: 'group',
      item: deletedTab,
      deletedAt: timestamp,
      originalGroupId: parent.id,
      originalWorkspaceId: parent.workspaceId,
      originalFolderId: parent.folderId,
      originalIndex: 0,
    };
    const before = { ...createEmptyState(), groups: [parent], bin: [entry] };
    const replayed = applyStateMutation(before, {
      type: 'delete-tab',
      groupId: parent.id,
      tabId: deletedTab.id,
      binEntry: entry,
      updatedAt: timestamp,
    });

    expect(replayed).toEqual(before);
    expect(replayed.mutationRevision).toBe(before.mutationRevision);
  });

  it('rejects delete-tab replay when direct and nested Bin evidence share a tab ID', () => {
    const deletedTab = tab('delete-tab-direct-nested-replay');
    const parent = group('delete-tab-direct-nested-parent');
    const nestedGroup = group('delete-tab-direct-nested-bin-group', 'workspace_default', [deletedTab]);
    const directEntry: BinEntry = {
      id: 'delete-tab-direct-nested-direct-bin',
      kind: 'tab',
      label: deletedTab.title,
      groupId: parent.id,
      groupTitle: parent.title,
      source: 'group',
      item: deletedTab,
      deletedAt: timestamp,
      originalGroupId: parent.id,
      originalWorkspaceId: parent.workspaceId,
      originalFolderId: parent.folderId,
      originalIndex: 0,
    };
    const nestedEntry: BinEntry = {
      id: 'delete-tab-direct-nested-group-bin',
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
    const before = { ...createEmptyState(), groups: [parent], bin: [directEntry, nestedEntry] };
    const snapshot = structuredClone(before);

    expect(() => applyStateMutation(before, {
      type: 'delete-tab',
      groupId: parent.id,
      tabId: deletedTab.id,
      binEntry: directEntry,
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'TAB_NOT_FOUND' }));
    expect(before).toEqual(snapshot);
    expect(before.mutationRevision).toBe(snapshot.mutationRevision);
    expect(before.bin).toEqual(snapshot.bin);
  });

  it('requires complete delete parent metadata at the raw mutation boundary', () => {
    const liveGroup = group('delete-metadata-group');
    const liveTab = tab('delete-metadata-tab');
    const tabParent = group('delete-metadata-parent', 'workspace_default', [liveTab]);
    const groupEntry: BinEntry = {
      id: 'delete-metadata-group-bin',
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
    const tabEntry: BinEntry = {
      id: 'delete-metadata-tab-bin',
      kind: 'tab',
      label: liveTab.title,
      groupId: tabParent.id,
      groupTitle: tabParent.title,
      source: 'group',
      item: liveTab,
      deletedAt: timestamp,
      originalGroupId: tabParent.id,
      originalWorkspaceId: tabParent.workspaceId,
      originalFolderId: tabParent.folderId,
    };
    const cases = [
      {
        mutation: {
          type: 'delete-group' as const,
          id: liveGroup.id,
          binEntry: { ...groupEntry, originalWorkspaceId: undefined },
          updatedAt: timestamp,
        },
        state: { ...createEmptyState(), groups: [liveGroup] },
      },
      {
        mutation: {
          type: 'delete-group' as const,
          id: liveGroup.id,
          binEntry: { ...groupEntry, originalFolderId: undefined },
          updatedAt: timestamp,
        },
        state: { ...createEmptyState(), groups: [liveGroup] },
      },
      {
        mutation: {
          type: 'delete-tab' as const,
          groupId: tabParent.id,
          tabId: liveTab.id,
          binEntry: { ...tabEntry, originalGroupId: undefined },
          updatedAt: timestamp,
        },
        state: { ...createEmptyState(), groups: [tabParent] },
      },
      {
        mutation: {
          type: 'delete-tab' as const,
          groupId: tabParent.id,
          tabId: liveTab.id,
          binEntry: { ...tabEntry, originalWorkspaceId: undefined },
          updatedAt: timestamp,
        },
        state: { ...createEmptyState(), groups: [tabParent] },
      },
      {
        mutation: {
          type: 'delete-tab' as const,
          groupId: tabParent.id,
          tabId: liveTab.id,
          binEntry: { ...tabEntry, originalFolderId: undefined },
          updatedAt: timestamp,
        },
        state: { ...createEmptyState(), groups: [tabParent] },
      },
    ];

    cases.forEach(({ mutation, state: before }) => {
      const snapshot = structuredClone(before);
      expect(isStateMutation(mutation)).toBe(false);
      expect(() => applyStateMutation(before, mutation)).toThrow('Invalid state mutation.');
      expect(before).toEqual(snapshot);
      expect(before.mutationRevision).toBe(snapshot.mutationRevision);
    });
  });

  it('rejects delete replay when Bin parent metadata differs from the mutation', () => {
    const liveGroup = group('delete-replay-group');
    const liveTab = tab('delete-replay-tab');
    const tabParent = group('delete-replay-parent', 'workspace_default', [liveTab]);
    const groupEntry: BinEntry = {
      id: 'delete-replay-group-bin', kind: 'group', label: liveGroup.title,
      groupId: liveGroup.id, groupTitle: liveGroup.title, source: 'group', item: liveGroup,
      deletedAt: timestamp, originalWorkspaceId: liveGroup.workspaceId, originalFolderId: liveGroup.folderId,
    };
    const tabEntry: BinEntry = {
      id: 'delete-replay-tab-bin', kind: 'tab', label: liveTab.title,
      groupId: tabParent.id, groupTitle: tabParent.title, source: 'group', item: liveTab,
      deletedAt: timestamp, originalGroupId: tabParent.id,
      originalWorkspaceId: tabParent.workspaceId, originalFolderId: tabParent.folderId,
    };
    const groupState = { ...createEmptyState(), bin: [groupEntry] };
    const tabState = { ...createEmptyState(), groups: [group('delete-replay-parent')], bin: [tabEntry] };
    const wrongGroupMutation: StateMutation = {
      type: 'delete-group', id: liveGroup.id,
      binEntry: { ...groupEntry, originalWorkspaceId: 'other-workspace' }, updatedAt: timestamp,
    };
    const wrongTabMutation: StateMutation = {
      type: 'delete-tab', groupId: tabParent.id, tabId: liveTab.id,
      binEntry: { ...tabEntry, originalGroupId: 'other-parent' }, updatedAt: timestamp,
    };
    const wrongGroupFolderMutation: StateMutation = {
      type: 'delete-group', id: liveGroup.id,
      binEntry: { ...groupEntry, originalFolderId: 'other-folder' }, updatedAt: timestamp,
    };
    const wrongTabWorkspaceMutation: StateMutation = {
      type: 'delete-tab', groupId: tabParent.id, tabId: liveTab.id,
      binEntry: { ...tabEntry, originalWorkspaceId: 'other-workspace' }, updatedAt: timestamp,
    };
    const wrongTabFolderMutation: StateMutation = {
      type: 'delete-tab', groupId: tabParent.id, tabId: liveTab.id,
      binEntry: { ...tabEntry, originalFolderId: 'other-folder' }, updatedAt: timestamp,
    };
    const groupSnapshot = structuredClone(groupState);
    const tabSnapshot = structuredClone(tabState);

    expect(() => applyStateMutation(groupState, wrongGroupMutation)).toThrow();
    expect(() => applyStateMutation(tabState, wrongTabMutation)).toThrow();
    expect(() => applyStateMutation(groupState, wrongGroupFolderMutation)).toThrow();
    expect(() => applyStateMutation(tabState, wrongTabWorkspaceMutation)).toThrow();
    expect(() => applyStateMutation(tabState, wrongTabFolderMutation)).toThrow();
    expect(groupState).toEqual(groupSnapshot);
    expect(tabState).toEqual(tabSnapshot);
    expect(groupState.mutationRevision).toBe(groupSnapshot.mutationRevision);
    expect(tabState.mutationRevision).toBe(tabSnapshot.mutationRevision);
    expect(groupState.bin).toEqual([groupEntry]);
    expect(tabState.bin).toEqual([tabEntry]);
  });

  it('rejects live deletes when parent metadata does not match the exact live entity', () => {
    const liveGroup = group('delete-live-parent-group');
    const liveTab = tab('delete-live-parent-tab');
    const tabParent = group('delete-live-parent-tab-group', 'workspace_default', [liveTab]);
    const groupEntry: BinEntry = {
      id: 'delete-live-parent-group-bin', kind: 'group', label: liveGroup.title,
      groupId: liveGroup.id, groupTitle: liveGroup.title, source: 'group', item: liveGroup,
      deletedAt: timestamp, originalWorkspaceId: liveGroup.workspaceId, originalFolderId: liveGroup.folderId,
    };
    const tabEntry: BinEntry = {
      id: 'delete-live-parent-tab-bin', kind: 'tab', label: liveTab.title,
      groupId: tabParent.id, groupTitle: tabParent.title, source: 'group', item: liveTab,
      deletedAt: timestamp, originalGroupId: tabParent.id,
      originalWorkspaceId: tabParent.workspaceId, originalFolderId: tabParent.folderId,
    };
    const cases: Array<{ state: TabBoardState; mutation: StateMutation }> = [
      {
        state: { ...createEmptyState(), groups: [liveGroup] },
        mutation: {
          type: 'delete-group', id: liveGroup.id,
          binEntry: { ...groupEntry, originalWorkspaceId: 'wrong-workspace' }, updatedAt: timestamp,
        },
      },
      {
        state: { ...createEmptyState(), groups: [liveGroup] },
        mutation: {
          type: 'delete-group', id: liveGroup.id,
          binEntry: { ...groupEntry, originalFolderId: 'wrong-folder' }, updatedAt: timestamp,
        },
      },
      {
        state: { ...createEmptyState(), groups: [tabParent] },
        mutation: {
          type: 'delete-tab', groupId: tabParent.id, tabId: liveTab.id,
          binEntry: { ...tabEntry, originalGroupId: 'wrong-parent' }, updatedAt: timestamp,
        },
      },
      {
        state: { ...createEmptyState(), groups: [tabParent] },
        mutation: {
          type: 'delete-tab', groupId: tabParent.id, tabId: liveTab.id,
          binEntry: { ...tabEntry, originalWorkspaceId: 'wrong-workspace' }, updatedAt: timestamp,
        },
      },
      {
        state: { ...createEmptyState(), groups: [tabParent] },
        mutation: {
          type: 'delete-tab', groupId: tabParent.id, tabId: liveTab.id,
          binEntry: { ...tabEntry, originalFolderId: 'wrong-folder' }, updatedAt: timestamp,
        },
      },
    ];

    cases.forEach(({ state: before, mutation }) => {
      const snapshot = structuredClone(before);
      expect(() => applyStateMutation(before, mutation)).toThrowError(
        expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }),
      );
      expect(before).toEqual(snapshot);
      expect(before.mutationRevision).toBe(snapshot.mutationRevision);
      expect(before.bin).toEqual(snapshot.bin);
    });
  });

  it('preserves the complete state for exact delete success and replay', () => {
    const liveGroup = group('delete-full-group');
    const groupEntry: BinEntry = {
      id: 'delete-full-group-bin', kind: 'group', label: liveGroup.title,
      groupId: liveGroup.id, groupTitle: liveGroup.title, source: 'group', item: liveGroup,
      deletedAt: timestamp, originalWorkspaceId: liveGroup.workspaceId, originalFolderId: liveGroup.folderId,
    };
    const before = { ...createEmptyState(), groups: [liveGroup] };
    const after = applyStateMutation(before, {
      type: 'delete-group', id: liveGroup.id, binEntry: groupEntry, updatedAt: timestamp,
    });
    expect(after.groups).toEqual([]);
    expect(after.bin[0]).toMatchObject({
      ...groupEntry,
      originalWorkspaceId: liveGroup.workspaceId,
      originalFolderId: liveGroup.folderId,
      originalIndex: 0,
    });
    expect(after.mutationRevision).toBe(before.mutationRevision + 1);
    expect(after.updatedAt).toBe(timestamp);

    const replayed = applyStateMutation(after, {
      type: 'delete-group', id: liveGroup.id, binEntry: after.bin[0], updatedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(replayed).toEqual(after);
    expect(replayed.mutationRevision).toBe(after.mutationRevision);
    expect(replayed.bin).toEqual(after.bin);
  });

  it('rejects delete-group replay when a child tab is duplicated globally', () => {
    const child = tab('delete-group-replay-global-child');
    const deletedGroup = group('delete-group-replay-global-target', 'workspace_default', [child]);
    const binEntry = groupBinEntry(deletedGroup, 'delete-group-replay-global-bin');
    const mutation: StateMutation = {
      type: 'delete-group',
      id: deletedGroup.id,
      binEntry,
      updatedAt: timestamp,
    };
    const completed = applyStateMutation({ ...createEmptyState(), groups: [deletedGroup] }, mutation);
    const directEntry: BinEntry = {
      id: 'delete-group-replay-global-direct-bin',
      kind: 'tab',
      label: child.title,
      groupId: 'delete-group-replay-global-direct-parent',
      groupTitle: 'Direct source',
      source: 'group',
      item: child,
      deletedAt: timestamp,
      originalGroupId: 'delete-group-replay-global-direct-parent',
      originalWorkspaceId: deletedGroup.workspaceId,
      originalFolderId: deletedGroup.folderId,
    };
    const nestedGroup = group('delete-group-replay-global-nested', 'workspace_default', [child]);
    const cases: Array<{ state: TabBoardState; label: string }> = [
      {
        label: 'live group',
        state: { ...completed, groups: [group('delete-group-replay-global-live', 'workspace_default', [child])] },
      },
      {
        label: 'direct Bin tab',
        state: { ...completed, bin: [...completed.bin, directEntry] },
      },
      {
        label: 'nested Bin group',
        state: { ...completed, bin: [...completed.bin, groupBinEntry(nestedGroup)] },
      },
    ];

    for (const { state: before, label } of cases) {
      const snapshot = structuredClone(before);
      expect(() => applyStateMutation(before, mutation), label).toThrow();
      expect(before).toEqual(snapshot);
      expect(before.mutationRevision).toBe(snapshot.mutationRevision);
      expect(before.bin).toEqual(snapshot.bin);
    }
  });

  it('rejects delete-group replay when the Bin group snapshot repeats a child tab ID', () => {
    const child = tab('delete-group-replay-internal-child');
    const deletedGroup = group('delete-group-replay-internal-target', 'workspace_default', [child, child]);
    const binEntry = groupBinEntry(deletedGroup, 'delete-group-replay-internal-bin');
    const before = { ...createEmptyState(), bin: [binEntry] };
    const snapshot = structuredClone(before);

    expect(() => applyStateMutation(before, {
      type: 'delete-group', id: deletedGroup.id, binEntry, updatedAt: timestamp,
    })).toThrow();
    expect(before).toEqual(snapshot);
    expect(before.mutationRevision).toBe(snapshot.mutationRevision);
    expect(before.bin).toEqual(snapshot.bin);
  });

  it('rejects ambiguous delete-group and delete-tab replay Bin entry IDs', () => {
    const deletedGroup = group('delete-replay-bin-id-group');
    const groupEntry = groupBinEntry(deletedGroup, 'delete-replay-bin-id-shared');
    const groupBefore = {
      ...createEmptyState(),
      bin: [groupEntry, groupBinEntry(group('delete-replay-bin-id-other'), groupEntry.id)],
    };
    const groupSnapshot = structuredClone(groupBefore);

    expect(() => applyStateMutation(groupBefore, {
      type: 'delete-group', id: deletedGroup.id, binEntry: groupEntry, updatedAt: timestamp,
    })).toThrow();
    expect(groupBefore).toEqual(groupSnapshot);
    expect(groupBefore.mutationRevision).toBe(groupSnapshot.mutationRevision);
    expect(groupBefore.bin).toEqual(groupSnapshot.bin);

    const deletedTab = tab('delete-replay-bin-id-tab');
    const tabParent = group('delete-replay-bin-id-parent');
    const tabEntry: BinEntry = {
      id: groupEntry.id,
      kind: 'tab',
      label: deletedTab.title,
      groupId: tabParent.id,
      groupTitle: tabParent.title,
      source: 'group',
      item: deletedTab,
      deletedAt: timestamp,
      originalGroupId: tabParent.id,
      originalWorkspaceId: tabParent.workspaceId,
      originalFolderId: tabParent.folderId,
    };
    const tabBefore = {
      ...createEmptyState(),
      groups: [tabParent],
      bin: [tabEntry, groupBinEntry(group('delete-replay-bin-id-tab-other'), tabEntry.id)],
    };
    const tabSnapshot = structuredClone(tabBefore);

    expect(() => applyStateMutation(tabBefore, {
      type: 'delete-tab', groupId: tabParent.id, tabId: deletedTab.id, binEntry: tabEntry, updatedAt: timestamp,
    })).toThrow();
    expect(tabBefore).toEqual(tabSnapshot);
    expect(tabBefore.mutationRevision).toBe(tabSnapshot.mutationRevision);
    expect(tabBefore.bin).toEqual(tabSnapshot.bin);
  });

  it('rejects malformed delete Bin descriptors for groups and tabs at the raw boundary', () => {
    const liveGroup = group('delete-malformed-descriptor-group');
    const groupEntry = groupBinEntry(liveGroup, 'delete-malformed-descriptor-group-bin');
    const liveTab = tab('delete-malformed-descriptor-tab');
    const tabParent = group('delete-malformed-descriptor-parent', 'workspace_default', [liveTab]);
    const tabEntry: BinEntry = {
      id: 'delete-malformed-descriptor-tab-bin',
      kind: 'tab',
      label: liveTab.title,
      groupId: tabParent.id,
      groupTitle: tabParent.title,
      source: 'group',
      item: liveTab,
      deletedAt: timestamp,
      originalGroupId: tabParent.id,
      originalWorkspaceId: tabParent.workspaceId,
      originalFolderId: tabParent.folderId,
    };
    const fields = ['source', 'label', 'groupTitle'] as const;

    for (const field of fields) {
      const groupBefore = { ...createEmptyState(), groups: [liveGroup] };
      const groupSnapshot = structuredClone(groupBefore);
      const groupMutation = {
        type: 'delete-group' as const,
        id: liveGroup.id,
        binEntry: { ...groupEntry, [field]: undefined },
        updatedAt: timestamp,
      };
      expect(isStateMutation(groupMutation)).toBe(false);
      expect(() => applyStateMutation(groupBefore, groupMutation as unknown as StateMutation))
        .toThrow('Invalid state mutation.');
      expect(groupBefore).toEqual(groupSnapshot);

      const tabBefore = { ...createEmptyState(), groups: [tabParent] };
      const tabSnapshot = structuredClone(tabBefore);
      const tabMutation = {
        type: 'delete-tab' as const,
        groupId: tabParent.id,
        tabId: liveTab.id,
        binEntry: { ...tabEntry, [field]: undefined },
        updatedAt: timestamp,
      };
      expect(isStateMutation(tabMutation)).toBe(false);
      expect(() => applyStateMutation(tabBefore, tabMutation as unknown as StateMutation))
        .toThrow('Invalid state mutation.');
      expect(tabBefore).toEqual(tabSnapshot);
    }
  });

  it('replays deletes after fresh writes overwrite optional Bin metadata', () => {
    const liveGroup = group('delete-replay-derived-group');
    const groupMutation: StateMutation = {
      type: 'delete-group',
      id: liveGroup.id,
      binEntry: {
        ...groupBinEntry(liveGroup, 'delete-replay-derived-group-bin'),
        originalIndex: 99,
        originalFolderName: 'stale-folder-name',
        originalWorkspaceName: 'stale-workspace-name',
      },
      updatedAt: timestamp,
    };
    const deletedGroup = applyStateMutation({ ...createEmptyState(), groups: [liveGroup] }, groupMutation);
    expect(applyStateMutation(deletedGroup, groupMutation)).toEqual(deletedGroup);

    const liveTab = tab('delete-replay-derived-tab');
    const tabParent = group('delete-replay-derived-parent', 'workspace_default', [liveTab]);
    const tabMutation: StateMutation = {
      type: 'delete-tab',
      groupId: tabParent.id,
      tabId: liveTab.id,
      binEntry: {
        id: 'delete-replay-derived-tab-bin',
        kind: 'tab',
        label: liveTab.title,
        groupId: tabParent.id,
        groupTitle: tabParent.title,
        source: 'group',
        item: liveTab,
        deletedAt: timestamp,
        originalGroupId: tabParent.id,
        originalWorkspaceId: tabParent.workspaceId,
        originalFolderId: tabParent.folderId,
        originalIndex: 99,
        originalFolderName: 'stale-folder-name',
        originalWorkspaceName: 'stale-workspace-name',
      },
      updatedAt: timestamp,
    };
    const deletedTab = applyStateMutation({ ...createEmptyState(), groups: [tabParent] }, tabMutation);
    expect(applyStateMutation(deletedTab, tabMutation)).toEqual(deletedTab);
  });

  it('rejects delete-group when duplicate live group IDs would remove multiple groups', () => {
    const target = group('delete-duplicate-live-group-id');
    const duplicate = { ...target, title: 'Different payload' };
    const before = { ...createEmptyState(), groups: [target, duplicate] };
    const snapshot = structuredClone(before);

    expect(() => applyStateMutation(before, {
      type: 'delete-group', id: target.id, binEntry: groupBinEntry(target), updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));
    expect(before).toEqual(snapshot);
    expect(before.mutationRevision).toBe(snapshot.mutationRevision);
    expect(before.bin).toEqual(snapshot.bin);
  });

  it('rejects live deletes when matching Bin evidence already exists', () => {
    const liveGroup = group('delete-live-bin-group');
    const liveTab = tab('delete-live-bin-tab');
    const tabParent = group('delete-live-bin-parent', 'workspace_default', [liveTab]);
    const groupEntry: BinEntry = {
      id: 'delete-live-bin-group-entry', kind: 'group', label: liveGroup.title,
      groupId: liveGroup.id, groupTitle: liveGroup.title, source: 'group', item: liveGroup,
      deletedAt: timestamp, originalWorkspaceId: liveGroup.workspaceId, originalFolderId: liveGroup.folderId,
    };
    const tabEntry: BinEntry = {
      id: 'delete-live-bin-tab-entry', kind: 'tab', label: liveTab.title,
      groupId: tabParent.id, groupTitle: tabParent.title, source: 'group', item: liveTab,
      deletedAt: timestamp, originalGroupId: tabParent.id,
      originalWorkspaceId: tabParent.workspaceId, originalFolderId: tabParent.folderId,
    };
    const groupState = { ...createEmptyState(), groups: [liveGroup], bin: [groupEntry] };
    const tabState = { ...createEmptyState(), groups: [tabParent], bin: [tabEntry] };
    const groupSnapshot = structuredClone(groupState);
    const tabSnapshot = structuredClone(tabState);

    expect(() => applyStateMutation(groupState, {
      type: 'delete-group', id: liveGroup.id, binEntry: groupEntry, updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));
    expect(() => applyStateMutation(tabState, {
      type: 'delete-tab', groupId: tabParent.id, tabId: liveTab.id, binEntry: tabEntry, updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));
    expect(groupState).toEqual(groupSnapshot);
    expect(tabState).toEqual(tabSnapshot);
    expect(groupState.mutationRevision).toBe(groupSnapshot.mutationRevision);
    expect(tabState.mutationRevision).toBe(tabSnapshot.mutationRevision);
    expect(groupState.bin).toEqual([groupEntry]);
    expect(tabState.bin).toEqual([tabEntry]);
  });

  it('allows delete-group even when a child tab ID survives in another live group', () => {
    const duplicate = tab('delete-group-child-live-duplicate');
    const target = group('delete-group-child-live-target', 'workspace_default', [duplicate]);
    const other = group('delete-group-child-live-other', 'workspace_default', [duplicate]);
    const before = { ...createEmptyState(), groups: [target, other] };

    const after = applyStateMutation(before, {
      type: 'delete-group', id: target.id, binEntry: groupBinEntry(target), updatedAt: timestamp,
    });
    expect(after.groups).toHaveLength(1);
    expect(after.groups[0].id).toBe(other.id);
    expect(after.bin).toHaveLength(1);
    expect(after.bin[0].id).toBe(groupBinEntry(target).id);
    expect(after.mutationRevision).toBe(before.mutationRevision + 1);
  });

  it('allows delete-group even when a child tab ID survives in a direct Bin tab entry', () => {
    const duplicate = tab('delete-group-child-direct-duplicate');
    const target = group('delete-group-child-direct-target', 'workspace_default', [duplicate]);
    const directEntry: BinEntry = {
      id: 'delete-group-child-direct-entry',
      kind: 'tab',
      label: duplicate.title,
      groupId: 'delete-group-child-direct-source',
      groupTitle: 'delete-group-child-direct-source',
      source: 'group',
      item: duplicate,
      deletedAt: timestamp,
      originalGroupId: 'delete-group-child-direct-source',
      originalWorkspaceId: target.workspaceId,
      originalFolderId: target.folderId,
    };
    const before = { ...createEmptyState(), groups: [target], bin: [directEntry] };

    const after = applyStateMutation(before, {
      type: 'delete-group', id: target.id, binEntry: groupBinEntry(target), updatedAt: timestamp,
    });
    expect(after.groups).toHaveLength(0);
    expect(after.bin).toHaveLength(2);
    expect(after.mutationRevision).toBe(before.mutationRevision + 1);
  });

  it('allows delete-group even when a child tab ID survives in a nested Bin group', () => {
    const duplicate = tab('delete-group-child-nested-duplicate');
    const target = group('delete-group-child-nested-target', 'workspace_default', [duplicate]);
    const nested = group('delete-group-child-nested-source', 'workspace_default', [duplicate]);
    const before = { ...createEmptyState(), groups: [target], bin: [groupBinEntry(nested)] };

    const after = applyStateMutation(before, {
      type: 'delete-group', id: target.id, binEntry: groupBinEntry(target), updatedAt: timestamp,
    });
    expect(after.groups).toHaveLength(0);
    expect(after.bin).toHaveLength(2);
    expect(after.mutationRevision).toBe(before.mutationRevision + 1);
  });

  it('allows delete-group even when the live group repeats a child tab ID internally', () => {
    const duplicate = tab('delete-group-child-internal-duplicate');
    const target = group('delete-group-child-internal-target', 'workspace_default', [duplicate, duplicate]);
    const before = { ...createEmptyState(), groups: [target] };

    const after = applyStateMutation(before, {
      type: 'delete-group', id: target.id, binEntry: groupBinEntry(target), updatedAt: timestamp,
    });
    expect(after.groups).toHaveLength(0);
    expect(after.bin).toHaveLength(1);
    expect(after.mutationRevision).toBe(before.mutationRevision + 1);
  });

  it('deletes a group when each child tab ID is globally unique', () => {
    const target = group('delete-group-child-unique-target', 'workspace_default', [
      tab('delete-group-child-unique-a'),
      tab('delete-group-child-unique-b'),
    ]);
    const before = { ...createEmptyState(), groups: [target] };

    const after = applyStateMutation(before, {
      type: 'delete-group', id: target.id, binEntry: groupBinEntry(target), updatedAt: timestamp,
    });

    expect(after.groups).toEqual([]);
    expect(after.bin).toHaveLength(1);
    expect(after.bin[0]).toMatchObject({ item: target, originalIndex: 0 });
    expect(after.mutationRevision).toBe(before.mutationRevision + 1);
  });

  it('allows delete-tab even when the same tab exists inside a binned group', () => {
    const liveTab = tab('delete-nested-bin-tab');
    const liveParent = group('delete-nested-live-parent', 'workspace_default', [liveTab]);
    const binnedGroup = group('delete-nested-bin-parent', 'workspace_default', [liveTab]);
    const groupEntry: BinEntry = {
      id: 'delete-nested-bin-group-entry', kind: 'group', label: binnedGroup.title,
      groupId: binnedGroup.id, groupTitle: binnedGroup.title, source: 'group', item: binnedGroup,
      deletedAt: timestamp, originalWorkspaceId: binnedGroup.workspaceId, originalFolderId: binnedGroup.folderId,
    };
    const tabEntry: BinEntry = {
      id: 'delete-nested-bin-tab-entry', kind: 'tab', label: liveTab.title,
      groupId: liveParent.id, groupTitle: liveParent.title, source: 'group', item: liveTab,
      deletedAt: timestamp, originalGroupId: liveParent.id,
      originalWorkspaceId: liveParent.workspaceId, originalFolderId: liveParent.folderId,
    };
    const before = { ...createEmptyState(), groups: [liveParent], bin: [groupEntry] };

    const after = applyStateMutation(before, {
      type: 'delete-tab', groupId: liveParent.id, tabId: liveTab.id,
      binEntry: tabEntry, updatedAt: timestamp,
    });
    expect(after.groups[0].tabs).toHaveLength(0);
    expect(after.bin).toHaveLength(2);
    expect(after.mutationRevision).toBe(before.mutationRevision + 1);
  });

  it('compare-and-deletes only exact live group and tab snapshots', () => {
    const liveGroup = group('delete-group-snapshot', 'workspace_default', [tab('delete-group-child')]);
    const liveTab = tab('delete-tab-snapshot');
    const tabParent = group('delete-tab-snapshot-parent', 'workspace_default', [liveTab]);
    const wrongGroupEntry: BinEntry = {
      id: 'delete-group-snapshot-bin',
      kind: 'group',
      label: liveGroup.title,
      groupId: liveGroup.id,
      groupTitle: liveGroup.title,
      source: 'group',
      item: { ...liveGroup, title: 'replacement-group' },
      deletedAt: timestamp,
      originalWorkspaceId: liveGroup.workspaceId,
      originalFolderId: liveGroup.folderId,
    };
    const wrongTabEntry: BinEntry = {
      id: 'delete-tab-snapshot-bin',
      kind: 'tab',
      label: liveTab.title,
      groupId: tabParent.id,
      groupTitle: tabParent.title,
      source: 'group',
      item: { ...liveTab, title: 'replacement-tab' },
      deletedAt: timestamp,
      originalGroupId: 'replacement-parent',
      originalWorkspaceId: tabParent.workspaceId,
      originalFolderId: tabParent.folderId,
      originalIndex: 0,
    };
    const before = { ...createEmptyState(), groups: [liveGroup, tabParent] };
    const snapshot = structuredClone(before);

    expect(() => applyStateMutation(before, {
      type: 'delete-group',
      id: liveGroup.id,
      binEntry: wrongGroupEntry,
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));
    expect(() => applyStateMutation(before, {
      type: 'delete-tab',
      groupId: tabParent.id,
      tabId: liveTab.id,
      binEntry: wrongTabEntry,
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));
    expect(before).toEqual(snapshot);
    expect(before.mutationRevision).toBe(snapshot.mutationRevision);
    expect(before.bin).toEqual([]);
  });

  it('deletes exact live snapshots and records immutable Bin evidence', () => {
    const liveGroup = group('delete-exact-group', 'workspace_default', [tab('delete-exact-child')]);
    const liveTab = tab('delete-exact-tab');
    const tabParent = group('delete-exact-tab-parent', 'workspace_default', [liveTab]);
    const groupEntry: BinEntry = {
      id: 'delete-exact-group-bin', kind: 'group', label: liveGroup.title, groupId: liveGroup.id,
      groupTitle: liveGroup.title, source: 'group', item: liveGroup, deletedAt: timestamp,
      originalWorkspaceId: liveGroup.workspaceId, originalFolderId: liveGroup.folderId,
    };
    const tabEntry: BinEntry = {
      id: 'delete-exact-tab-bin', kind: 'tab', label: liveTab.title, groupId: tabParent.id,
      groupTitle: tabParent.title, source: 'group', item: liveTab, deletedAt: timestamp,
      originalGroupId: tabParent.id, originalWorkspaceId: tabParent.workspaceId,
      originalFolderId: tabParent.folderId, originalIndex: 0,
    };

    const afterGroup = applyStateMutation({ ...createEmptyState(), groups: [liveGroup] }, {
      type: 'delete-group', id: liveGroup.id, binEntry: groupEntry, updatedAt: timestamp,
    });
    const afterTab = applyStateMutation({ ...createEmptyState(), groups: [tabParent] }, {
      type: 'delete-tab', groupId: tabParent.id, tabId: liveTab.id, binEntry: tabEntry, updatedAt: timestamp,
    });

    expect(afterGroup.groups).toEqual([]);
    expect(afterGroup.bin[0]).toMatchObject({ item: liveGroup, originalWorkspaceId: liveGroup.workspaceId, originalFolderId: liveGroup.folderId });
    expect(afterTab.groups[0].tabs).toEqual([]);
    expect(afterTab.bin[0]).toMatchObject({ item: liveTab, originalGroupId: tabParent.id, originalWorkspaceId: tabParent.workspaceId, originalFolderId: tabParent.folderId });
  });

  it('does not mutate nested input records', () => {
    const source = folder('folder-a');
    const snapshot = structuredClone(source);
    const state = applyStateMutations(createEmptyState(), [
      { type: 'add-folder', folder: source },
    ]);

    expect(source).toEqual(snapshot);
    expect(state.folders[0]).not.toBe(source);
  });

  it('keeps state shape valid after a batch', () => {
    const state: TabBoardState = applyStateMutations(createEmptyState(), [
      { type: 'add-folder', folder: folder('folder-a') },
      { type: 'rename-folder', id: 'folder-a', name: 'Renamed', updatedAt: timestamp },
    ]);

    expect(state.folders[0]).toMatchObject({ id: 'folder-a', name: 'Renamed' });
  });

  it('replays every stable-id add-like mutation exactly once', () => {
    const workspace: Workspace = {
      id: 'workspace-extra',
      name: 'Extra',
      emoji: '🗂️',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const addedFolder = folder('folder-replay');
    const addedGroup = group('group-replay');
    const prependedGroup = group('group-prepend');
    const importedGroup = group('group-import');
    const addedTab = tab('tab-replay');
    const noteTab = tab('note-replay', 'note');
    const deletedGroup = group('group-deleted');
    const deletedTab = tab('tab-deleted');
    const groupBinEntry: BinEntry = {
      id: 'bin-group-replay',
      kind: 'group',
      label: deletedGroup.title,
      groupId: deletedGroup.id,
      groupTitle: deletedGroup.title,
      source: 'group',
      item: deletedGroup,
      deletedAt: timestamp,
    };
    const tabBinEntry: BinEntry = {
      id: 'bin-tab-replay',
      kind: 'tab',
      label: deletedTab.title,
      groupId: 'group-target',
      groupTitle: 'group-target',
      source: 'group',
      item: deletedTab,
      deletedAt: timestamp,
    };
    const cases: Array<{ before: TabBoardState; mutation: StateMutation }> = [
      { before: createEmptyState(), mutation: { type: 'add-workspace', workspace } },
      { before: createEmptyState(), mutation: { type: 'add-folder', folder: addedFolder } },
      { before: createEmptyState(), mutation: { type: 'add-group', group: addedGroup, updatedAt: timestamp } },
      { before: createEmptyState(), mutation: { type: 'prepend-groups', groups: [prependedGroup], updatedAt: timestamp } },
      { before: createEmptyState(), mutation: { type: 'import-groups', groups: [importedGroup], updatedAt: timestamp } },
      { before: { ...createEmptyState(), groups: [group('group-target')] }, mutation: { type: 'add-tab', groupId: 'group-target', tab: addedTab, updatedAt: timestamp } },
      { before: { ...createEmptyState(), groups: [group('group-target')] }, mutation: { type: 'set-group-note', groupId: 'group-target', text: 'note', noteTab: { ...noteTab, note: 'note' }, updatedAt: timestamp } },
      { before: { ...createEmptyState(), bin: [groupBinEntry] }, mutation: { type: 'restore-group', entryId: groupBinEntry.id, group: deletedGroup, index: 0, updatedAt: timestamp } },
      { before: { ...createEmptyState(), groups: [group('group-target')], bin: [tabBinEntry] }, mutation: { type: 'restore-tab', entryId: tabBinEntry.id, groupId: 'group-target', tab: deletedTab, index: 0, updatedAt: timestamp } },
    ];

    cases.forEach(({ before, mutation }) => {
      const once = applyStateMutations(before, [mutation]);
      const twice = applyStateMutations(once, [mutation]);
      expect(twice).toEqual(once);
    });
  });

  it('replays compound add-delete batches without recreating entities or Bin entries', () => {
    const addedGroup = group('compound-group');
    const deleteGroup: StateMutation = {
      type: 'delete-group',
      id: addedGroup.id,
      binEntry: {
        id: 'compound-group-bin',
        kind: 'group',
        label: addedGroup.title,
        groupId: addedGroup.id,
        groupTitle: addedGroup.title,
        source: 'group',
        item: addedGroup,
        deletedAt: timestamp,
        originalWorkspaceId: addedGroup.workspaceId,
        originalFolderId: addedGroup.folderId,
      },
      updatedAt: timestamp,
    };
    const groupBatch: StateMutation[] = [
      { type: 'add-group', group: addedGroup, updatedAt: timestamp },
      deleteGroup,
    ];
    const groupOnce = applyStateMutations(createEmptyState(), groupBatch);
    const groupTwice = applyStateMutations(groupOnce, groupBatch);

    expect(groupTwice).toEqual(groupOnce);
    expect(groupTwice.groups).toHaveLength(0);
    expect(groupTwice.bin.filter((entry) => entry.id === 'compound-group-bin')).toHaveLength(1);

    const target = group('compound-tab-target');
    const addedTab = tab('compound-tab');
    const deleteTab: StateMutation = {
      type: 'delete-tab',
      groupId: target.id,
      tabId: addedTab.id,
      binEntry: {
        id: 'compound-tab-bin',
        kind: 'tab',
        label: addedTab.title,
        groupId: target.id,
        groupTitle: target.title,
        source: 'group',
        item: addedTab,
        deletedAt: timestamp,
        originalGroupId: target.id,
        originalWorkspaceId: target.workspaceId,
        originalFolderId: target.folderId,
      },
      updatedAt: timestamp,
    };
    const tabBatch: StateMutation[] = [
      { type: 'add-tab', groupId: target.id, tab: addedTab, updatedAt: timestamp },
      deleteTab,
    ];
    const tabOnce = applyStateMutations({ ...createEmptyState(), groups: [target] }, tabBatch);
    const tabTwice = applyStateMutations(tabOnce, tabBatch);

    expect(tabTwice).toEqual(tabOnce);
    expect(tabTwice.groups[0].tabs).toHaveLength(0);
    expect(tabTwice.bin.filter((entry) => entry.id === 'compound-tab-bin')).toHaveLength(1);
  });

  it('deletes mixed saved items atomically and replays without duplicate Bin entries', () => {
    const link = tab('batch-link');
    const note = tab('batch-note', 'note');
    const source = group('batch-source', 'workspace_default', [link, note]);
    const before = { ...createEmptyState(), groups: [source] };
    const mutation: StateMutation = {
      type: 'delete-tabs',
      deletions: [
        {
          groupId: source.id,
          tabId: link.id,
          binEntry: tabBinEntry(source, link),
        },
        {
          groupId: source.id,
          tabId: note.id,
          binEntry: tabBinEntry(source, note),
        },
      ],
      updatedAt: timestamp,
    };

    const once = applyStateMutation(before, mutation);
    const twice = applyStateMutation(once, mutation);

    expect(once.mutationRevision).toBe(before.mutationRevision + 1);
    expect(once.groups[0]?.tabs).toEqual([]);
    expect(once.bin.map(({ id }) => id)).toEqual([
      `${link.id}-bin`,
      `${note.id}-bin`,
    ]);
    expect(twice).toEqual(once);
  });

  it('accepts 80 checked deletions and rejects a forged 81st deletion without complete evidence', () => {
    const tabs = Array.from(
      { length: BIN_LIMIT },
      (_, index) => tab(`batch-retention-${index}`),
    );
    const source = group('batch-retention-source', 'workspace_default', tabs);
    const mutation: StateMutation = {
      type: 'delete-tabs',
      deletions: tabs.map((item) => ({
        groupId: source.id,
        tabId: item.id,
        binEntry: tabBinEntry(source, item),
      })),
      updatedAt: timestamp,
    };

    const once = applyStateMutation(
      { ...createEmptyState(), groups: [source] },
      mutation,
    );
    const twice = applyStateMutation(once, mutation);

    expect(once.groups[0]?.tabs).toEqual([]);
    expect(once.bin).toHaveLength(BIN_LIMIT);
    expect(twice).toEqual(once);
    expect(twice.mutationRevision).toBe(once.mutationRevision);

    const missing = tab('batch-retention-missing-81');
    const overLimitMutation = {
      ...mutation,
      deletions: [
        ...mutation.deletions,
        {
          groupId: source.id,
          tabId: missing.id,
          binEntry: tabBinEntry(source, missing),
        },
      ],
    };
    const forgedState = {
      ...once,
      groups: [{
        ...source,
        tabs: [],
        updatedAt: mutation.updatedAt,
      }],
    };

    expect(isStateMutation(mutation)).toBe(true);
    expect(isStateMutation(overLimitMutation)).toBe(false);
    expect(() => applyStateMutation(
      forgedState,
      overLimitMutation as StateMutation,
    )).toThrow('Invalid state mutation.');
    expect(forgedState.mutationRevision).toBe(once.mutationRevision);
    expect(forgedState.bin).toEqual(once.bin);
  });

  it('rejects the whole saved-item batch when any source is locked or missing', () => {
    const unlockedTab = tab('atomic-unlocked');
    const lockedTab = tab('atomic-locked');
    const unlocked = group(
      'atomic-unlocked-group',
      'workspace_default',
      [unlockedTab],
    );
    const locked = {
      ...group('atomic-locked-group', 'workspace_default', [lockedTab]),
      locked: true,
    };
    const before = { ...createEmptyState(), groups: [unlocked, locked] };
    const lockedMutation: StateMutation = {
      type: 'delete-tabs',
      deletions: [
        {
          groupId: unlocked.id,
          tabId: unlockedTab.id,
          binEntry: tabBinEntry(unlocked, unlockedTab),
        },
        {
          groupId: locked.id,
          tabId: lockedTab.id,
          binEntry: tabBinEntry(locked, lockedTab),
        },
      ],
      updatedAt: timestamp,
    };

    expect(() => applyStateMutation(before, lockedMutation)).toThrowError(
      expect.objectContaining({ code: 'GROUP_LOCKED' }),
    );
    expect(before.groups[0]?.tabs).toEqual([unlockedTab]);
    expect(before.groups[1]?.tabs).toEqual([lockedTab]);
    expect(before.bin).toEqual([]);

    const missingMutation: StateMutation = {
      ...lockedMutation,
      deletions: [
        lockedMutation.deletions[0],
        {
          groupId: unlocked.id,
          tabId: 'missing-tab',
          binEntry: tabBinEntry(unlocked, {
            ...unlockedTab,
            id: 'missing-tab',
          }),
        },
      ],
    };
    expect(() => applyStateMutation(before, missingMutation)).toThrowError(
      expect.objectContaining({ code: 'TAB_NOT_FOUND' }),
    );
    expect(before.groups[0]?.tabs).toEqual([unlockedTab]);
    expect(before.bin).toEqual([]);
  });

  it('rejects drop intents without a persisted operation identity', () => {
    expect(isStateMutation({
      type: 'drop-intent',
      expectedRevision: 0,
      intent: {
        kind: 'copy-open-tabs',
        tabIds: [101],
        windowId: 7,
        targetGroupId: 'target',
        targetIndex: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [],
      updatedAt: timestamp,
    })).toBe(false);
  });

  it('replays copy-open-tabs exactly once using stable generated tab ids', () => {
    const before = {
      ...createEmptyState(),
      groups: [group('target')],
    };
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'drop-copy-1',
      intent: {
        kind: 'copy-open-tabs',
        tabIds: [101, 102],
        windowId: 7,
        targetGroupId: 'target',
        targetIndex: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [
        {
          id: 101,
          windowId: 7,
          title: 'One',
          url: 'https://one.test',
          favIconUrl: '',
          pinned: false,
          index: 0,
          browserGroup: null,
          storable: true,
          reason: null,
        },
        {
          id: 102,
          windowId: 7,
          title: 'Two',
          url: 'https://two.test',
          favIconUrl: '',
          pinned: false,
          index: 1,
          browserGroup: null,
          storable: true,
          reason: null,
        },
      ],
      updatedAt: timestamp,
    };

    const once = applyStateMutations(before, [mutation]);
    const twice = applyStateMutations(once, [mutation]);

    expect(once.groups[0].tabs).toHaveLength(2);
    expect(new Set(once.groups[0].tabs.map((tab) => tab.id)).size).toBe(2);
    expect(twice).toEqual(once);
  });

  it('replays open-tab session creation exactly once using a stable group id', () => {
    const before = createEmptyState();
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'drop-session-1',
      intent: {
        kind: 'create-session',
        source: { kind: 'open-tabs', tabIds: [101], windowId: 7 },
        category: 'inbox',
        index: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [{
        id: 101,
        windowId: 7,
        title: 'One',
        url: 'https://one.test',
        favIconUrl: '',
        pinned: false,
        index: 0,
        browserGroup: null,
        storable: true,
        reason: null,
      }],
      updatedAt: timestamp,
    };

    const once = applyStateMutations(before, [mutation]);
    const twice = applyStateMutations(once, [mutation]);

    expect(once.groups).toHaveLength(1);
    expect(twice).toEqual(once);
  });

  it('rejects saved-tab replay when any source reference remains globally duplicated', () => {
    const sourceTab = tab('saved-replay-tab');
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'saved-replay-global',
      intent: {
        kind: 'create-session',
        source: { kind: 'saved-tabs', refs: [{ groupId: 'saved-replay-source', tabId: sourceTab.id }] },
        category: 'inbox',
        index: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [],
      updatedAt: timestamp,
    };
    const created = applyStateMutation({
      ...createEmptyState(),
      groups: [group('saved-replay-source', 'workspace_default', [sourceTab])],
    }, mutation);
    const generated = created.groups.find((item) => item.id === 'drop_saved-replay-global_group');
    if (!generated) throw new Error('Generated saved-tab session missing.');

    const duplicateLocations: TabBoardState[] = [
      {
        ...created,
        dropOperationLedger: [],
        groups: [...created.groups, group('saved-replay-other', 'workspace_default', [sourceTab])],
      },
      {
        ...created,
        dropOperationLedger: [],
        bin: [{
          id: 'saved-replay-direct-bin',
          kind: 'tab',
          label: sourceTab.title,
          groupId: 'saved-replay-source',
          groupTitle: 'Saved source',
          source: 'group',
          item: sourceTab,
          deletedAt: timestamp,
        }],
      },
      {
        ...created,
        dropOperationLedger: [],
        bin: [{
          id: 'saved-replay-nested-bin',
          kind: 'group',
          label: 'Nested saved replay',
          groupId: 'saved-replay-nested',
          groupTitle: 'Nested saved replay',
          source: 'group',
          item: group('saved-replay-nested', 'workspace_default', [sourceTab]),
          deletedAt: timestamp,
        }],
      },
    ];
    duplicateLocations.unshift({
      ...created,
      dropOperationLedger: [],
      groups: [...created.groups, group('saved-replay-source', 'workspace_default', [sourceTab])],
    });

    duplicateLocations.forEach((before) => {
      const snapshot = structuredClone(before);
      expect(() => applyStateMutation(before, mutation)).toThrowError(InvalidDropMutationError);
      expect(before).toEqual(snapshot);
      expect(before.mutationRevision).toBe(snapshot.mutationRevision);
    });
    expect(generated.tabs.map(({ id }) => id)).toEqual([sourceTab.id]);
  });

  it('recognizes valid and absent saved-tab replay occupancy after ledger eviction', () => {
    const sourceTab = tab('saved-replay-status-tab');
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'saved-replay-status',
      intent: {
        kind: 'create-session',
        source: { kind: 'saved-tabs', refs: [{ groupId: 'saved-replay-status-source', tabId: sourceTab.id }] },
        category: 'inbox',
        index: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [],
      updatedAt: timestamp,
    };
    const before = {
      ...createEmptyState(),
      groups: [group('saved-replay-status-source', 'workspace_default', [sourceTab])],
    };
    expect(getDropIntentReplayStatus(before, mutation.intent, mutation.openTabs, mutation.operationId)).toBe('none');

    const created = applyStateMutation(before, mutation);
    const evicted = { ...created, dropOperationLedger: [] };
    expect(getDropIntentReplayStatus(evicted, mutation.intent, mutation.openTabs, mutation.operationId)).toBe('complete');
    expect(applyStateMutation(evicted, mutation)).toEqual(evicted);
  });

  it('rejects sparse saved references before matching a ledger replay', () => {
    const refs = new Array(1) as Array<{ groupId: string; tabId: string }>;
    const mutation = {
      type: 'drop-intent' as const,
      expectedRevision: 0,
      operationId: 'sparse-saved-ledger',
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

    expect(isStateMutation(mutation)).toBe(false);
    expect(() => applyStateMutation(before, mutation as unknown as StateMutation)).toThrow('Invalid state mutation.');
    expect(before).toEqual({ ...before });
  });

  it('rejects sparse move references before matching a ledger replay', () => {
    const refs = new Array(1) as Array<{ groupId: string; tabId: string }>;
    const mutation = {
      type: 'drop-intent' as const,
      expectedRevision: 0,
      operationId: 'sparse-move-ledger',
      intent: {
        kind: 'move-tabs' as const,
        refs,
        targetGroupId: 'sparse-move-target',
        targetIndex: 0,
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

    expect(isStateMutation(mutation)).toBe(false);
    expect(() => applyStateMutation(before, mutation as unknown as StateMutation)).toThrow('Invalid state mutation.');
    expect(before).toEqual({ ...before });
  });

  it('restores legacy groups into the surviving source workspace and folder', () => {
    const workspaceB: Workspace = { id: 'legacy-group-workspace-b', name: 'B', emoji: '🗂️', createdAt: timestamp, updatedAt: timestamp };
    const source = placedGroup('legacy-group-to-restore', 'workspace-a', 'folder-a');
    const entry: BinEntry = {
      id: 'legacy-group-entry',
      kind: 'group',
      label: source.title,
      groupId: 'stale-group-id',
      groupTitle: source.title,
      source: 'group',
      item: source,
      deletedAt: timestamp,
      originalGroupId: 'legacy-group-source',
      originalFolderId: 'legacy-group-folder-b',
    };
    const before = {
      ...createEmptyState(),
      workspaces: [...createEmptyState().workspaces, workspaceB],
      folders: [folder('legacy-group-folder-b', workspaceB.id)],
      groups: [group('legacy-group-source', workspaceB.id)],
      bin: [entry],
    };
    const restored = { ...source, workspaceId: workspaceB.id, folderId: 'legacy-group-folder-b' };

    const next = applyStateMutation(before, {
      type: 'restore-group',
      entryId: entry.id,
      group: restored,
      index: 0,
      updatedAt: timestamp,
    });

    expect(next.groups.find(({ id }) => id === source.id)).toMatchObject({
      workspaceId: workspaceB.id,
      folderId: 'legacy-group-folder-b',
    });
    expect(next.bin).toEqual([]);
  });

  it('restores legacy tabs into surviving source groups across workspaces', () => {
    const workspaceB: Workspace = { id: 'workspace-b', name: 'B', emoji: '🗂️', createdAt: timestamp, updatedAt: timestamp };
    const sourceTab = tab('legacy-cross-workspace-tab');
    const entry: BinEntry = {
      id: 'legacy-cross-workspace-entry',
      kind: 'tab',
      label: sourceTab.title,
      groupId: 'legacy-source-group',
      groupTitle: 'Legacy source group',
      source: 'group',
      item: sourceTab,
      deletedAt: timestamp,
      originalGroupId: 'legacy-source-group',
      originalFolderId: null,
      originalIndex: 0,
    };
    const before = {
      ...createEmptyState(),
      workspaces: [...createEmptyState().workspaces, workspaceB],
      activeWorkspaceId: 'workspace_default',
      groups: [group('legacy-source-group', workspaceB.id), group('legacy-active-inbox')],
      bin: [entry],
    };

    const next = applyStateMutation(before, {
      type: 'restore-tab',
      entryId: entry.id,
      groupId: 'legacy-source-group',
      tab: sourceTab,
      index: 0,
      updatedAt: timestamp,
    });

    expect(next.groups.find((item) => item.id === 'legacy-source-group')?.tabs).toEqual([sourceTab]);
    expect(next.groups.find((item) => item.id === 'legacy-active-inbox')?.tabs).toEqual([]);
  });

  it('uses legacy source workspace Inbox when source group is gone', () => {
    const workspaceB: Workspace = { id: 'workspace-b-inbox', name: 'B', emoji: '🗂️', createdAt: timestamp, updatedAt: timestamp };
    const sourceTab = tab('legacy-source-workspace-tab');
    const entry: BinEntry = {
      id: 'legacy-source-workspace-entry',
      kind: 'tab',
      label: sourceTab.title,
      groupId: 'legacy-missing-group',
      groupTitle: 'Legacy missing group',
      source: 'group',
      item: sourceTab,
      deletedAt: timestamp,
      originalWorkspaceId: workspaceB.id,
      originalFolderId: null,
      originalIndex: 0,
    };
    const before = {
      ...createEmptyState(),
      workspaces: [...createEmptyState().workspaces, workspaceB],
      activeWorkspaceId: 'workspace_default',
      groups: [group('legacy-source-inbox', workspaceB.id), group('legacy-active-inbox')],
      bin: [entry],
    };

    const next = applyStateMutation(before, {
      type: 'restore-tab',
      entryId: entry.id,
      groupId: 'legacy-source-inbox',
      tab: sourceTab,
      index: 0,
      updatedAt: timestamp,
    });

    expect(next.groups.find((item) => item.id === 'legacy-source-inbox')?.tabs).toEqual([sourceTab]);
    expect(next.groups.find((item) => item.id === 'legacy-active-inbox')?.tabs).toEqual([]);
  });

  it('rejects legacy restore into active workspace when source group survives elsewhere', () => {
    const workspaceB: Workspace = { id: 'workspace-b-reject', name: 'B', emoji: '🗂️', createdAt: timestamp, updatedAt: timestamp };
    const sourceTab = tab('legacy-reject-tab');
    const entry: BinEntry = {
      id: 'legacy-reject-entry',
      kind: 'tab',
      label: sourceTab.title,
      groupId: 'legacy-reject-source',
      groupTitle: 'Legacy reject source',
      source: 'group',
      item: sourceTab,
      deletedAt: timestamp,
      originalGroupId: 'legacy-reject-source',
      originalFolderId: null,
      originalIndex: 0,
    };
    const before = {
      ...createEmptyState(),
      workspaces: [...createEmptyState().workspaces, workspaceB],
      activeWorkspaceId: 'workspace_default',
      groups: [group('legacy-reject-source', workspaceB.id), group('legacy-reject-active')],
      bin: [entry],
    };

    expect(() => applyStateMutation(before, {
      type: 'restore-tab',
      entryId: entry.id,
      groupId: 'legacy-reject-active',
      tab: sourceTab,
      index: 0,
      updatedAt: timestamp,
    })).toThrow('Invalid state mutation.');
  });

  it('treats created sessions in Bin as applied after ledger eviction', () => {
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'evicted-session',
      intent: {
        kind: 'create-session',
        source: { kind: 'open-tabs', tabIds: [101], windowId: 7 },
        category: 'inbox',
        index: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [{
        id: 101,
        windowId: 7,
        title: 'Created',
        url: 'https://created.test',
        favIconUrl: '',
        pinned: false,
        index: 0,
        browserGroup: null,
        storable: true,
        reason: null,
      }],
      updatedAt: timestamp,
    };
    const created = applyStateMutation(createEmptyState(), mutation);
    const createdGroup = created.groups[0];
    const deleted = applyStateMutation(created, {
      type: 'delete-group',
      id: createdGroup.id,
      binEntry: {
        id: 'evicted-session-bin',
        kind: 'group',
        label: createdGroup.title,
        groupId: createdGroup.id,
        groupTitle: createdGroup.title,
        source: 'group',
        item: createdGroup,
        deletedAt: timestamp,
        originalWorkspaceId: createdGroup.workspaceId,
        originalFolderId: createdGroup.folderId,
      },
      updatedAt: timestamp,
    });

    const replayed = applyStateMutation({ ...deleted, dropOperationLedger: [] }, mutation);

    expect(replayed).toEqual({ ...deleted, dropOperationLedger: [] });
  });

  it('replays move-session, reorder-category, and move-tabs drops without retimestamping', () => {
    const moveSessionMutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'drop-move-session-1',
      intent: {
        kind: 'move-session',
        groupId: 'move-session-source',
        category: 'saved',
        index: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [],
      updatedAt: timestamp,
    };
    const moveSessionBefore = {
      ...createEmptyState(),
      groups: [group('move-session-source'), group('move-session-other')],
    };
    const moveSessionOnce = applyStateMutations(moveSessionBefore, [moveSessionMutation]);
    expect(applyStateMutations(moveSessionOnce, [moveSessionMutation])).toEqual(moveSessionOnce);

    const reorderMutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'drop-reorder-1',
      intent: {
        kind: 'reorder-category',
        categoryId: 'saved',
        targetCategoryId: 'inbox',
        placement: 'before',
        workspaceId: 'workspace_default',
        expectedCategoryOrder: ['inbox', 'saved', 'archive'],
      },
      openTabs: [],
      updatedAt: timestamp,
    };
    const reorderBefore = {
      ...createEmptyState(),
      categoryOrderByWorkspace: { workspace_default: ['inbox', 'saved', 'archive'] },
    };
    const reorderOnce = applyStateMutations(reorderBefore, [reorderMutation]);
    expect(applyStateMutations(reorderOnce, [reorderMutation])).toEqual(reorderOnce);

    const moveTabsMutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'drop-move-tabs-1',
      intent: {
        kind: 'move-tabs',
        refs: [{ groupId: 'move-tabs-source', tabId: 'move-tab' }],
        targetGroupId: 'move-tabs-target',
        targetIndex: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [],
      updatedAt: timestamp,
    };
    const moveTabsBefore = {
      ...createEmptyState(),
      groups: [
        group('move-tabs-source', 'workspace_default', [tab('move-tab')]),
        group('move-tabs-target', 'workspace_default', [tab('target-tab')]),
      ],
    };
    const moveTabsOnce = applyStateMutations(moveTabsBefore, [moveTabsMutation]);
    expect(applyStateMutations(moveTabsOnce, [moveTabsMutation])).toEqual(moveTabsOnce);
  });

  it('moves all source tabs past an unrelated locked sibling but still rejects locked endpoints', () => {
    const sourceTabs = [tab('all-source-a'), tab('all-source-b'), tab('all-source-c')];
    const source = group('all-source', 'workspace_default', sourceTabs);
    const target = group('all-source-target', 'workspace_default', [tab('target-existing')]);
    const lockedSibling = {
      ...group('all-source-unrelated-locked'),
      locked: true,
    };
    const before = {
      ...createEmptyState(),
      groups: [source, target, lockedSibling],
    };
    const intent = {
      kind: 'move-tabs' as const,
      refs: sourceTabs.map(({ id }) => ({ groupId: source.id, tabId: id })),
      targetGroupId: target.id,
      targetIndex: target.tabs.length,
      workspaceId: 'workspace_default',
    };
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'all-source-locked-sibling',
      intent,
      openTabs: [],
      updatedAt: timestamp,
    };

    const after = applyStateMutation(before, mutation);

    expect(after.groups.map(({ id }) => id)).toEqual([
      target.id,
      lockedSibling.id,
    ]);
    expect(after.groups[0]?.tabs.map(({ id }) => id)).toEqual([
      'target-existing',
      'all-source-a',
      'all-source-b',
      'all-source-c',
    ]);
    expect(after.groups[1]).toMatchObject({
      id: lockedSibling.id,
      locked: true,
    });

    for (const lockedEndpoint of ['source', 'target'] as const) {
      const lockedBefore = {
        ...before,
        groups: before.groups.map((item) => {
          if (lockedEndpoint === 'source' && item.id === source.id) {
            return { ...item, locked: true };
          }
          if (lockedEndpoint === 'target' && item.id === target.id) {
            return { ...item, locked: true };
          }
          return item;
        }),
      };
      expect(() => applyStateMutation(lockedBefore, {
        ...mutation,
        operationId: `all-source-locked-${lockedEndpoint}`,
      })).toThrowError(expect.objectContaining({
        message: 'Cannot modify a locked group.',
      }));
    }
  });

  it('replays committed drop mutations with their persisted timestamp', () => {
    const replayTimestamp = '2026-02-01T00:00:00.000Z';
    const copyMutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'timestamp-copy',
      intent: {
        kind: 'copy-open-tabs',
        tabIds: [101],
        windowId: 7,
        targetGroupId: 'timestamp-target',
        targetIndex: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [{
        id: 101,
        windowId: 7,
        title: 'Copied',
        url: 'https://copied.test',
        favIconUrl: '',
        pinned: false,
        index: 0,
        browserGroup: null,
        storable: true,
        reason: null,
      }],
      updatedAt: replayTimestamp,
    };
    const copied = applyStateMutation({
      ...createEmptyState(),
      groups: [group('timestamp-target')],
    }, copyMutation);
    const copiedTab = copied.groups[0].tabs[0];
    expect(copiedTab).toMatchObject({ createdAt: replayTimestamp, updatedAt: replayTimestamp });
    expect(copied.groups[0].updatedAt).toBe(replayTimestamp);
    expect(copied.updatedAt).toBe(replayTimestamp);

    const createMutation: StateMutation = {
      ...copyMutation,
      operationId: 'timestamp-create',
      intent: {
        kind: 'create-session',
        source: { kind: 'open-tabs', tabIds: [101], windowId: 7 },
        category: 'inbox',
        index: 0,
        workspaceId: 'workspace_default',
      },
    };
    const created = applyStateMutation(createEmptyState(), createMutation);
    expect(created.groups[0]).toMatchObject({ createdAt: replayTimestamp, updatedAt: replayTimestamp });
    expect(created.groups[0].tabs[0]).toMatchObject({
      createdAt: replayTimestamp,
      updatedAt: replayTimestamp,
    });
    expect(created.updatedAt).toBe(replayTimestamp);
  });

  it('replays old drop operations exactly once after intervening moves', () => {
    const moveSession: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'ledger-move-session',
      intent: {
        kind: 'move-session',
        groupId: 'ledger-session',
        category: 'saved',
        index: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [],
      updatedAt: timestamp,
    };
    const moveSessionBack: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 1,
      operationId: 'ledger-move-session-back',
      intent: {
        kind: 'move-session',
        groupId: 'ledger-session',
        category: 'inbox',
        index: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [],
      updatedAt: timestamp,
    };
    const movedSession = applyStateMutation({
      ...createEmptyState(),
      groups: [group('ledger-session')],
    }, moveSession);
    const sessionAfterIntervening = applyStateMutation(movedSession, moveSessionBack);
    expect(applyStateMutation(sessionAfterIntervening, moveSession)).toEqual(sessionAfterIntervening);

    const reorder: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'ledger-reorder',
      intent: {
        kind: 'reorder-category',
        categoryId: 'saved',
        targetCategoryId: 'inbox',
        placement: 'before',
        workspaceId: 'workspace_default',
        expectedCategoryOrder: ['inbox', 'saved', 'archive'],
      },
      openTabs: [],
      updatedAt: timestamp,
    };
    const reorderBack: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 1,
      operationId: 'ledger-reorder-back',
      intent: {
        kind: 'reorder-category',
        categoryId: 'inbox',
        targetCategoryId: 'saved',
        placement: 'before',
        workspaceId: 'workspace_default',
        expectedCategoryOrder: ['saved', 'inbox', 'archive'],
      },
      openTabs: [],
      updatedAt: timestamp,
    };
    const reordered = applyStateMutation({
      ...createEmptyState(),
      categoryOrderByWorkspace: { workspace_default: ['inbox', 'saved'] },
    }, reorder);
    const orderAfterIntervening = applyStateMutation(reordered, reorderBack);
    expect(applyStateMutation(orderAfterIntervening, reorder)).toEqual(orderAfterIntervening);

    const moveTabs: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'ledger-move-tabs',
      intent: {
        kind: 'move-tabs',
        refs: [{ groupId: 'ledger-source', tabId: 'ledger-tab' }],
        targetGroupId: 'ledger-target',
        targetIndex: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [],
      updatedAt: timestamp,
    };
    const moveTabsBack: StateMutation = {
      type: 'move-tab',
      groupId: 'ledger-target',
      tabId: 'ledger-tab',
      targetGroupId: 'ledger-source',
      targetIndex: 0,
      updatedAt: timestamp,
    };
    const movedTabs = applyStateMutation({
      ...createEmptyState(),
      groups: [
        { ...group('ledger-source', 'workspace_default', [tab('ledger-tab')]), note: 'keep source group' },
        group('ledger-target'),
      ],
    }, moveTabs);
    const tabsAfterIntervening = applyStateMutation(movedTabs, moveTabsBack);
    expect(applyStateMutation(tabsAfterIntervening, moveTabs)).toEqual(tabsAfterIntervening);
  });

  it('rejects operation ID reuse with a different drop intent', () => {
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'ledger-reused',
      intent: {
        kind: 'move-session',
        groupId: 'ledger-reused-group',
        category: 'saved',
        index: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [],
      updatedAt: timestamp,
    };
    const once = applyStateMutation({
      ...createEmptyState(),
      groups: [group('ledger-reused-group')],
    }, mutation);

    expect(() => applyStateMutation(once, {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'ledger-reused',
      intent: {
        kind: 'move-session',
        groupId: 'ledger-reused-group',
        category: 'inbox',
        index: 1,
        workspaceId: 'workspace_default',
      },
      openTabs: [],
      updatedAt: timestamp,
    })).toThrow('Drop operation ID was reused with a different intent.');
  });

  it('does not resurrect copied tabs after they move to Bin', () => {
    const copy: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'ledger-copy',
      intent: {
        kind: 'copy-open-tabs',
        tabIds: [101],
        windowId: 7,
        targetGroupId: 'ledger-copy-target',
        targetIndex: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [{
        id: 101,
        windowId: 7,
        title: 'Copied',
        url: 'https://copied.test',
        favIconUrl: '',
        pinned: false,
        index: 0,
        browserGroup: null,
        storable: true,
        reason: null,
      }],
      updatedAt: timestamp,
    };
    const copied = applyStateMutation({
      ...createEmptyState(),
      groups: [group('ledger-copy-target')],
    }, copy);
    const copiedTab = copied.groups[0].tabs[0];
    const deleted = applyStateMutation(copied, {
      type: 'delete-tab',
      groupId: 'ledger-copy-target',
      tabId: copiedTab.id,
      binEntry: {
        id: 'ledger-copy-bin',
        kind: 'tab',
        label: copiedTab.title,
        groupId: 'ledger-copy-target',
        groupTitle: 'ledger-copy-target',
        source: 'group',
        item: copiedTab,
        deletedAt: timestamp,
        originalGroupId: 'ledger-copy-target',
        originalWorkspaceId: 'workspace_default',
        originalFolderId: null,
      },
      updatedAt: timestamp,
    });

    const replayed = applyStateMutation(deleted, copy);
    expect(replayed).toEqual(deleted);
    expect(replayed.groups[0].tabs).toHaveLength(0);
    expect(replayed.bin).toHaveLength(1);
  });

  it('treats copied tabs in Bin as applied after ledger eviction', () => {
    const copy: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'evicted-copy',
      intent: {
        kind: 'copy-open-tabs',
        tabIds: [101],
        windowId: 7,
        targetGroupId: 'evicted-copy-target',
        targetIndex: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [{
        id: 101,
        windowId: 7,
        title: 'Copied',
        url: 'https://copied.test',
        favIconUrl: '',
        pinned: false,
        index: 0,
        browserGroup: null,
        storable: true,
        reason: null,
      }],
      updatedAt: timestamp,
    };
    const copied = applyStateMutation({ ...createEmptyState(), groups: [group('evicted-copy-target')] }, copy);
    const copiedTab = copied.groups[0].tabs[0];
    const deleted = applyStateMutation(copied, {
      type: 'delete-tab',
      groupId: 'evicted-copy-target',
      tabId: copiedTab.id,
      binEntry: {
        id: 'evicted-copy-bin',
        kind: 'tab',
        label: copiedTab.title,
        groupId: 'evicted-copy-target',
        groupTitle: 'evicted-copy-target',
        source: 'group',
        item: copiedTab,
        deletedAt: timestamp,
        originalGroupId: 'evicted-copy-target',
        originalWorkspaceId: 'workspace_default',
        originalFolderId: null,
      },
      updatedAt: timestamp,
    });

    const replayed = applyStateMutation({ ...deleted, dropOperationLedger: [] }, copy);

    expect(replayed).toEqual({ ...deleted, dropOperationLedger: [] });
  });

  it('rejects stable copy replay after a generated tab changes destination', () => {
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'moved-copy',
      intent: {
        kind: 'copy-open-tabs',
        tabIds: [101],
        windowId: 7,
        targetGroupId: 'moved-copy-target',
        targetIndex: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [{ id: 101, windowId: 7, title: 'Moved', url: 'https://moved.test', favIconUrl: '', pinned: false, index: 0, browserGroup: null, storable: true, reason: null }],
      updatedAt: timestamp,
    };
    const copied = applyStateMutation({ ...createEmptyState(), groups: [group('moved-copy-target')] }, mutation);
    const movedTab = copied.groups[0].tabs[0];
    const before = {
      ...copied,
      groups: [group('moved-copy-target'), group('moved-copy-other', 'workspace_default', [movedTab])],
      dropOperationLedger: [],
    };

    expect(() => applyStateMutation(before, mutation)).toThrowError(InvalidDropMutationError);
    expect(before.groups[1].tabs[0]).toEqual(movedTab);
  });

  it('normalizes legacy and bounded operation ledgers', () => {
    const entries = Array.from({ length: DROP_OPERATION_LEDGER_LIMIT + 4 }, (_, index) => ({
      operationId: `operation-${index}`,
      digest: `digest-${index}`,
      appliedAt: `2026-01-01T00:00:${String(index).padStart(2, '0')}.000Z`,
    }));
    const normalized = normalizeState({ dropOperationLedger: entries });
    expect(normalized.dropOperationLedger).toHaveLength(DROP_OPERATION_LEDGER_LIMIT);
    expect(normalized.dropOperationLedger[0].operationId).toBe('operation-4');
    expect(normalizeState({}).dropOperationLedger).toEqual([]);
  });

  it('rejects drop intents that modify locked source or target groups', () => {
    const openTab = {
      id: 101,
      windowId: 7,
      title: 'Open tab',
      url: 'https://open.test',
      favIconUrl: '',
      pinned: false,
      index: 0,
      browserGroup: null,
      storable: true,
      reason: null,
    };
    const moveSessionState = {
      ...createEmptyState(),
      groups: [{ ...group('locked-session'), locked: true }, group('other')],
    };
    expect(() => applyStateMutation(moveSessionState, {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'locked-move-session',
      intent: { kind: 'move-session', groupId: 'locked-session', category: 'saved', index: 0, workspaceId: 'workspace_default' },
      openTabs: [],
      updatedAt: timestamp,
    })).toThrow('Cannot modify a locked group.');

    const moveTabsSourceState = {
      ...createEmptyState(),
      groups: [
        { ...group('locked-source', 'workspace_default', [tab('saved')]), locked: true },
        group('move-target'),
      ],
    };
    expect(() => applyStateMutation(moveTabsSourceState, {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'locked-move-tabs-source',
      intent: { kind: 'move-tabs', refs: [{ groupId: 'locked-source', tabId: 'saved' }], targetGroupId: 'move-target', targetIndex: 0, workspaceId: 'workspace_default' },
      openTabs: [],
      updatedAt: timestamp,
    })).toThrow('Cannot modify a locked group.');

    const moveTabsTargetState = {
      ...createEmptyState(),
      groups: [group('move-source', 'workspace_default', [tab('saved')]), { ...group('locked-target'), locked: true }],
    };
    expect(() => applyStateMutation(moveTabsTargetState, {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'locked-move-tabs-target',
      intent: { kind: 'move-tabs', refs: [{ groupId: 'move-source', tabId: 'saved' }], targetGroupId: 'locked-target', targetIndex: 0, workspaceId: 'workspace_default' },
      openTabs: [],
      updatedAt: timestamp,
    })).toThrow('Cannot modify a locked group.');

    const copyTargetState = {
      ...createEmptyState(),
      groups: [{ ...group('locked-copy-target'), locked: true }],
    };
    expect(() => applyStateMutation(copyTargetState, {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'locked-copy-target',
      intent: { kind: 'copy-open-tabs', tabIds: [101], windowId: 7, targetGroupId: 'locked-copy-target', targetIndex: 0, workspaceId: 'workspace_default' },
      openTabs: [openTab],
      updatedAt: timestamp,
    })).toThrow('Cannot modify a locked group.');

    const createSessionState = {
      ...createEmptyState(),
      groups: [{ ...group('locked-create-source', 'workspace_default', [tab('saved')]), locked: true }],
    };
    expect(() => applyStateMutation(createSessionState, {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'locked-create-session',
      intent: { kind: 'create-session', source: { kind: 'saved-tabs', refs: [{ groupId: 'locked-create-source', tabId: 'saved' }] }, category: 'inbox', index: 0, workspaceId: 'workspace_default' },
      openTabs: [],
      updatedAt: timestamp,
    })).toThrow('Cannot modify a locked group.');
  });

  it('rejects forged storable Open Tabs hidden by custom filter rules', () => {
    const before = {
      ...createEmptyState(),
      settings: { ...createEmptyState().settings, customUrlFilter: 'pinned.test' },
      groups: [group('drop-target')],
    };
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'drop-forged-storable',
      intent: {
        kind: 'copy-open-tabs',
        tabIds: [101],
        windowId: 7,
        targetGroupId: 'drop-target',
        targetIndex: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [{
        id: 101,
        windowId: 7,
        title: 'Pinned',
        url: 'https://pinned.test',
        favIconUrl: '',
        pinned: true,
        index: 0,
        browserGroup: null,
        storable: true,
        reason: null,
      }],
      updatedAt: timestamp,
    };

    expect(() => applyStateMutations(before, [mutation])).toThrow('Invalid state mutation.');
  });

  it('surfaces stale semantic drop mutations instead of treating them as successful no-ops', () => {
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'drop-stale-1',
      intent: {
        kind: 'move-session',
        groupId: 'missing',
        category: 'inbox',
        index: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [],
      updatedAt: timestamp,
    };

    expect(() => applyStateMutations(createEmptyState(), [mutation])).toThrow('Invalid state mutation.');
  });

  it('replays moved add and restore tab batches without recreating deleted tabs', () => {
    const source = group('move-source');
    const target = group('move-target');
    const movedTab = tab('moved-tab');
    const moveAddedTab: StateMutation = {
      type: 'move-tab',
      groupId: source.id,
      tabId: movedTab.id,
      targetGroupId: target.id,
      targetIndex: 0,
      updatedAt: timestamp,
    };
    const deleteMovedTab: StateMutation = {
      type: 'delete-tab',
      groupId: target.id,
      tabId: movedTab.id,
      binEntry: {
        id: 'moved-tab-bin',
        kind: 'tab',
        label: movedTab.title,
        groupId: target.id,
        groupTitle: target.title,
        source: 'group',
        item: movedTab,
        deletedAt: timestamp,
        originalGroupId: target.id,
        originalWorkspaceId: target.workspaceId,
        originalFolderId: target.folderId,
      },
      updatedAt: timestamp,
    };
    const addBatch: StateMutation[] = [
      { type: 'add-tab', groupId: source.id, tab: movedTab, updatedAt: timestamp },
      moveAddedTab,
      deleteMovedTab,
    ];
    const addOnce = applyStateMutations({ ...createEmptyState(), groups: [source, target] }, addBatch);
    const addOnceRevision = addOnce.mutationRevision;

    expect(() => applyStateMutations(addOnce, addBatch)).toThrowError(
      expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }),
    );
    expect(addOnce.mutationRevision).toBe(addOnceRevision);
    expect(addOnce.groups.flatMap(({ tabs }) => tabs)).toHaveLength(0);
    expect(addOnce.bin.filter((entry) => entry.id === 'moved-tab-bin')).toHaveLength(1);

    const noteGroup = group('note-source');
    const noteTarget = group('note-target');
    const movedNote = tab('moved-note', 'note');
    const noteBatch: StateMutation[] = [
      { type: 'set-group-note', groupId: noteGroup.id, text: movedNote.note, noteTab: movedNote, updatedAt: timestamp },
      {
        type: 'move-tab',
        groupId: noteGroup.id,
        tabId: movedNote.id,
        targetGroupId: noteTarget.id,
        targetIndex: 0,
        updatedAt: timestamp,
      },
      {
        type: 'delete-tab',
        groupId: noteTarget.id,
        tabId: movedNote.id,
        binEntry: {
          id: 'moved-note-bin',
          kind: 'tab',
          label: movedNote.title,
          groupId: noteTarget.id,
          groupTitle: noteTarget.title,
          source: 'group',
          item: movedNote,
          deletedAt: timestamp,
          originalGroupId: noteTarget.id,
          originalWorkspaceId: noteTarget.workspaceId,
          originalFolderId: noteTarget.folderId,
        },
        updatedAt: timestamp,
      },
    ];
    const noteOnce = applyStateMutations({ ...createEmptyState(), groups: [noteGroup, noteTarget] }, noteBatch);
    const noteOnceRevision = noteOnce.mutationRevision;

    expect(() => applyStateMutations(noteOnce, noteBatch)).toThrowError(
      expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }),
    );
    expect(noteOnce.mutationRevision).toBe(noteOnceRevision);
    expect(noteOnce.groups.flatMap(({ tabs }) => tabs)).toHaveLength(0);
    expect(noteOnce.bin.filter((entry) => entry.id === 'moved-note-bin')).toHaveLength(1);

    const originalTab = tab('restore-original-tab');
    const restoredTab = originalTab;
    const restoreEntry: BinEntry = {
      id: 'restore-source-bin',
      kind: 'tab',
      label: originalTab.title,
      groupId: source.id,
      groupTitle: source.title,
      source: 'group',
      item: originalTab,
      deletedAt: timestamp,
    };
    const moveRestoredTab: StateMutation = {
      type: 'move-tab',
      groupId: source.id,
      tabId: restoredTab.id,
      targetGroupId: target.id,
      targetIndex: 0,
      updatedAt: timestamp,
    };
    const deleteRestoredTab: StateMutation = {
      type: 'delete-tab',
      groupId: target.id,
      tabId: restoredTab.id,
      binEntry: {
        ...restoreEntry,
        id: 'restored-moved-tab-bin',
        groupId: target.id,
        groupTitle: target.title,
        item: restoredTab,
        originalGroupId: target.id,
        originalWorkspaceId: target.workspaceId,
        originalFolderId: target.folderId,
      },
      updatedAt: timestamp,
    };
    const restoreBatch: StateMutation[] = [
      { type: 'restore-tab', entryId: restoreEntry.id, groupId: source.id, tab: restoredTab, index: 0, updatedAt: timestamp },
      moveRestoredTab,
      deleteRestoredTab,
    ];
    const restoreOnce = applyStateMutations({ ...createEmptyState(), groups: [source, target], bin: [restoreEntry] }, restoreBatch);
    const restoreTwice = applyStateMutations(restoreOnce, restoreBatch);

    expect(restoreTwice).toEqual(restoreOnce);
    expect(restoreTwice.groups.flatMap(({ tabs }) => tabs)).toHaveLength(0);
    expect(restoreTwice.bin.filter((entry) => entry.id === 'restored-moved-tab-bin')).toHaveLength(1);
  });

  it('rejects unrelated live restore ID collisions without consuming Bin evidence', () => {
    const source = group('restore-collision');
    const entry: BinEntry = {
      id: 'restore-collision-bin',
      kind: 'group',
      label: source.title,
      groupId: source.id,
      groupTitle: source.title,
      source: 'group',
      item: source,
      deletedAt: timestamp,
    };
    const conflicting = { ...source, title: 'Unrelated live group' };
    expect(() => applyStateMutation({
      ...createEmptyState(),
      groups: [conflicting],
      bin: [entry],
    }, {
      type: 'restore-group',
      entryId: entry.id,
      group: source,
      index: 0,
      updatedAt: timestamp,
    })).toThrow('Restored entity ID collides');
  });

  it('requires exact Bin entity evidence and stable child IDs for restore replay', () => {
    const source = group('restore-evidence', 'workspace_default', [tab('restore-child')]);
    const entry: BinEntry = {
      id: 'restore-evidence-bin',
      kind: 'group',
      label: source.title,
      groupId: source.id,
      groupTitle: source.title,
      source: 'group',
      item: source,
      deletedAt: timestamp,
    };
    const altered = { ...source, tabs: [{ ...source.tabs[0], id: 'altered-child' }] };
    expect(() => applyStateMutation({ ...createEmptyState(), bin: [entry] }, {
      type: 'restore-group',
      entryId: entry.id,
      group: altered,
      index: 0,
      updatedAt: timestamp,
    })).toThrow('Invalid state mutation.');
    expect(() => applyStateMutation({ ...createEmptyState(), groups: [source], updatedAt: '2026-01-01T00:00:01.000Z' }, {
      type: 'restore-group',
      entryId: entry.id,
      group: source,
      index: 0,
      updatedAt: timestamp,
    })).toThrow('Restored entity ID collides');
  });

  it('replays restored groups and tabs after unrelated ordinary mutations', () => {
    const laterTimestamp = '2026-01-02T00:00:00.000Z';
    const restoredGroup = group('restore-replay-group');
    const groupEntry: BinEntry = {
      id: 'restore-replay-group-entry',
      kind: 'group',
      label: restoredGroup.title,
      groupId: restoredGroup.id,
      groupTitle: restoredGroup.title,
      source: 'group',
      item: restoredGroup,
      deletedAt: timestamp,
    };
    const groupRestore: StateMutation = {
      type: 'restore-group',
      entryId: groupEntry.id,
      group: restoredGroup,
      index: 0,
      updatedAt: timestamp,
    };
    const afterGroup = applyStateMutation({ ...createEmptyState(), bin: [groupEntry] }, groupRestore);
    const afterGroupMutation = applyStateMutation(afterGroup, {
      type: 'add-folder',
      folder: { ...folder('restore-replay-folder'), createdAt: laterTimestamp, updatedAt: laterTimestamp },
    });
    const groupRevision = afterGroupMutation.mutationRevision;
    expect(applyStateMutation(afterGroupMutation, groupRestore)).toEqual(afterGroupMutation);
    expect(applyStateMutation(afterGroupMutation, groupRestore).mutationRevision).toBe(groupRevision);

    const restoredTab = tab('restore-replay-tab');
    const tabEntry: BinEntry = {
      id: 'restore-replay-tab-entry',
      kind: 'tab',
      label: restoredTab.title,
      groupId: 'restore-replay-target',
      groupTitle: 'Target',
      source: 'group',
      item: restoredTab,
      deletedAt: timestamp,
      originalGroupId: 'restore-replay-target',
      originalWorkspaceId: 'workspace_default',
      originalFolderId: null,
      originalIndex: 0,
    };
    const tabRestore: StateMutation = {
      type: 'restore-tab',
      entryId: tabEntry.id,
      groupId: 'restore-replay-target',
      tab: restoredTab,
      index: 0,
      updatedAt: timestamp,
    };
    const afterTab = applyStateMutation({ ...createEmptyState(), groups: [group('restore-replay-target')], bin: [tabEntry] }, tabRestore);
    const afterTabMutation = applyStateMutation(afterTab, {
      type: 'add-folder',
      folder: { ...folder('restore-replay-tab-folder'), createdAt: laterTimestamp, updatedAt: laterTimestamp },
    });
    const tabRevision = afterTabMutation.mutationRevision;
    expect(applyStateMutation(afterTabMutation, tabRestore)).toEqual(afterTabMutation);
    expect(applyStateMutation(afterTabMutation, tabRestore).mutationRevision).toBe(tabRevision);
  });

  it('isolates malformed raw drops while preserving valid sibling indexes and state', () => {
    const before = createEmptyState();
    let thrown: unknown;
    try {
      applyStateMutations(before, [
        { type: 'add-folder', folder: folder('raw-valid') },
        { type: 'drop-intent', intent: null },
        { type: 'rename-folder', id: 'raw-valid', name: 'Renamed', updatedAt: timestamp },
      ]);
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidDropMutationError);
    expect(thrown).toMatchObject({
      code: 'INVALID_DROP_INTENT',
      invalidMutationIndexes: [1],
      committedMutationIndexes: [0, 2],
    });
    expect((thrown as InvalidDropMutationError).committedState?.folders[0].name).toBe('Renamed');
  });

  it('enforces monotonic expected revisions and exact replay no-op', () => {
    const before = {
      ...createEmptyState(),
      groups: [group('revision-a'), group('revision-b')],
    };
    const batch: StateMutation[] = [
      {
        type: 'drop-intent',
        operationId: 'revision-first',
        expectedRevision: 0,
        intent: { kind: 'move-session', groupId: 'revision-a', category: 'saved', index: 0, workspaceId: 'workspace_default' },
        openTabs: [],
        updatedAt: timestamp,
      },
      {
        type: 'drop-intent',
        operationId: 'revision-second',
        expectedRevision: 1,
        intent: { kind: 'move-session', groupId: 'revision-b', category: 'saved', index: 1, workspaceId: 'workspace_default' },
        openTabs: [],
        updatedAt: timestamp,
      },
    ];

    const once = applyStateMutations(before, batch);
    const replay = applyStateMutations(once, batch);

    expect(once.mutationRevision).toBe(2);
    expect(replay).toEqual(once);
    const firstMutation = batch[0] as Extract<StateMutation, { type: 'drop-intent' }>;
    expect(() => applyStateMutation(once, {
      ...firstMutation,
      operationId: 'revision-stale',
      expectedRevision: 0,
    })).toThrow('Drop mutation revision is stale.');
  });

  it('rejects sparse top-level mutation batches before iteration while allowing empty batches', () => {
    const before = createEmptyState();
    const holeOnly = new Array(1) as StateMutation[];
    const holeThenValid = new Array(2) as StateMutation[];
    holeThenValid[1] = {
      type: 'add-folder',
      folder: folder('sparse-batch-folder'),
    };
    const snapshot = structuredClone(before);

    for (const mutations of [holeOnly, holeThenValid]) {
      expect(() => applyStateMutations(before, mutations)).toThrow('Invalid state mutation batch.');
      expect(before).toEqual(snapshot);
    }
    expect(applyStateMutations(before, [])).toEqual(before);
  });

  it('rejects live group deletion when its Bin entry ID is already occupied', () => {
    const target = group('delete-group-bin-id-target', 'workspace_default', [tab('delete-group-bin-id-child')]);
    const conflictingEntry = groupBinEntry(group('delete-group-bin-id-existing'), 'delete-group-bin-id-conflict');
    const before = { ...createEmptyState(), groups: [target], bin: [conflictingEntry] };
    const snapshot = structuredClone(before);

    expect(() => applyStateMutation(before, {
      type: 'delete-group',
      id: target.id,
      binEntry: groupBinEntry(target, conflictingEntry.id),
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));
    expect(before).toEqual(snapshot);
    expect(before.mutationRevision).toBe(snapshot.mutationRevision);
    expect(before.bin).toEqual(snapshot.bin);
  });

  it('rejects live tab deletion when its Bin entry ID is already occupied', () => {
    const targetTab = tab('delete-tab-bin-id-target');
    const parent = group('delete-tab-bin-id-parent', 'workspace_default', [targetTab]);
    const conflictingEntry = groupBinEntry(group('delete-tab-bin-id-existing'), 'delete-tab-bin-id-conflict');
    const before = { ...createEmptyState(), groups: [parent], bin: [conflictingEntry] };
    const snapshot = structuredClone(before);
    const tabEntry: BinEntry = {
      id: conflictingEntry.id,
      kind: 'tab',
      label: targetTab.title,
      groupId: parent.id,
      groupTitle: parent.title,
      source: 'group',
      item: targetTab,
      deletedAt: timestamp,
      originalGroupId: parent.id,
      originalWorkspaceId: parent.workspaceId,
      originalFolderId: parent.folderId,
    };

    expect(() => applyStateMutation(before, {
      type: 'delete-tab',
      groupId: parent.id,
      tabId: targetTab.id,
      binEntry: tabEntry,
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));
    expect(before).toEqual(snapshot);
    expect(before.mutationRevision).toBe(snapshot.mutationRevision);
    expect(before.bin).toEqual(snapshot.bin);
  });

  it('rejects unknown drop fields and oversized mutation batches before digesting', () => {
    const baseIntent = {
      kind: 'move-session',
      groupId: 'group',
      category: 'inbox',
      index: 0,
      workspaceId: 'workspace_default',
    };
    expect(isStateMutation({
      type: 'drop-intent',
      operationId: 'unknown-intent-field',
      expectedRevision: 0,
      intent: { ...baseIntent, extra: 'rejected' },
      openTabs: [],
      updatedAt: timestamp,
    })).toBe(false);
    expect(isStateMutation({
      type: 'drop-intent',
      operationId: 'unknown-envelope-field',
      expectedRevision: 0,
      intent: baseIntent,
      openTabs: [],
      updatedAt: timestamp,
      extra: 'rejected',
    })).toBe(false);
    expect(isStateMutation({
      type: 'drop-intent',
      operationId: 'unknown-record-field',
      expectedRevision: 0,
      intent: baseIntent,
      openTabs: [{
        id: undefined,
        windowId: undefined,
        title: 'title',
        url: 'https://example.test',
        favIconUrl: '',
        pinned: false,
        index: 0,
        browserGroup: null,
        storable: true,
        reason: null,
        extra: 'rejected',
      }],
      updatedAt: timestamp,
    })).toBe(false);
    expect(() => applyStateMutations(createEmptyState(), Array.from({ length: 129 }, () => ({
      type: 'set-active-workspace' as const,
      workspaceId: 'workspace_default',
      updatedAt: timestamp,
    })))).toThrow('Invalid state mutation batch.');
  });

  it('rejects bounded payload violations and non-open live records', () => {
    expect(isStateMutation({
      type: 'drop-intent',
      operationId: 'missing-revision',
      intent: { kind: 'move-session', groupId: 'group', category: 'inbox', index: 0, workspaceId: 'workspace_default' },
      openTabs: [],
      updatedAt: timestamp,
    })).toBe(false);
    expect(isStateMutation({
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'x'.repeat(129),
      intent: { kind: 'move-session', groupId: 'group', category: 'inbox', index: 0, workspaceId: 'workspace_default' },
      openTabs: [],
      updatedAt: timestamp,
    })).toBe(false);
    expect(isStateMutation({
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'bounded-open-tabs',
      intent: { kind: 'move-session', groupId: 'group', category: 'inbox', index: 0, workspaceId: 'workspace_default' },
      openTabs: [{
        id: 1,
        windowId: 1,
        title: 'unexpected',
        url: 'https://unexpected.test',
        favIconUrl: '',
        pinned: false,
        index: 0,
        browserGroup: null,
        storable: true,
        reason: null,
      }],
      updatedAt: timestamp,
    })).toBe(false);
  });

  it('rejects ordinary workspace precondition violations with a stable code', () => {
    const state = createEmptyState();
    const existing = state.workspaces[0];

    expect(() => applyStateMutation(state, {
      type: 'set-active-workspace',
      workspaceId: 'missing-workspace',
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'WORKSPACE_NOT_FOUND' }));
    expect(() => applyStateMutation(state, {
      type: 'add-workspace',
      workspace: { ...existing, name: 'Duplicate' },
    })).toThrowError(expect.objectContaining({ code: 'WORKSPACE_ID_CONFLICT' }));
    expect(() => applyStateMutation(state, {
      type: 'rename-workspace',
      id: 'missing-workspace',
      name: 'Renamed',
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'WORKSPACE_NOT_FOUND' }));
  });

  it('preserves exact workspace and folder replays before duplicate validation', () => {
    const workspace = { ...createEmptyState().workspaces[0], id: 'workspace-replay' };
    const addedWorkspace = applyStateMutation(createEmptyState(), { type: 'add-workspace', workspace });
    expect(applyStateMutation(addedWorkspace, { type: 'add-workspace', workspace })).toEqual(addedWorkspace);
    expect(() => applyStateMutation(addedWorkspace, {
      type: 'add-workspace',
      workspace: { ...workspace, emoji: '🧪' },
    })).toThrowError(expect.objectContaining({ code: 'WORKSPACE_ID_CONFLICT' }));

    const addedFolder = applyStateMutation(createEmptyState(), {
      type: 'add-folder',
      folder: folder('folder-replay', 'workspace_default', ' Work '),
    });
    expect(applyStateMutation(addedFolder, {
      type: 'add-folder',
      folder: folder('folder-replay', 'workspace_default', ' Work '),
    })).toEqual(addedFolder);
    expect(() => applyStateMutation(addedFolder, {
      type: 'add-folder',
      folder: folder('folder-replay', 'workspace_default', 'Different'),
    })).toThrowError(expect.objectContaining({ code: 'FOLDER_ID_CONFLICT' }));
  });

  it('rejects invalid workspace deletion replacements and preserves active rules', () => {
    const workspaceA = createEmptyState().workspaces[0];
    const workspaceB: Workspace = {
      id: 'workspace-b',
      name: 'B',
      emoji: '🗂️',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const workspaceC: Workspace = {
      id: 'workspace-c',
      name: 'C',
      emoji: '🗂️',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const state = {
      ...createEmptyState(),
      workspaces: [workspaceA, workspaceB, workspaceC],
      categoryOrderByWorkspace: {
        [workspaceA.id]: ['inbox'],
        [workspaceB.id]: ['saved'],
      },
    };

    const invalidDeletes: StateMutation[] = [
      { type: 'delete-workspace', id: 'missing-workspace', newActiveWorkspaceId: workspaceA.id, updatedAt: timestamp },
      { type: 'delete-workspace', id: workspaceA.id, newActiveWorkspaceId: workspaceA.id, updatedAt: timestamp },
      { type: 'delete-workspace', id: workspaceA.id, newActiveWorkspaceId: 'missing-workspace', updatedAt: timestamp },
    ];
    invalidDeletes.forEach((mutation) => {
      expect(() => applyStateMutation(state, mutation)).toThrowError(
        expect.objectContaining({ code: expect.any(String) }),
      );
    });

    const sole = createEmptyState();
    expect(() => applyStateMutation(sole, {
      type: 'delete-workspace',
      id: sole.activeWorkspaceId,
      newActiveWorkspaceId: sole.activeWorkspaceId,
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'WORKSPACE_DELETE_INVALID' }));

    expect(() => applyStateMutation(state, {
      type: 'delete-workspace',
      id: workspaceB.id,
      newActiveWorkspaceId: workspaceC.id,
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'WORKSPACE_DELETE_INVALID' }));

    const inactiveDelete = applyStateMutation(state, {
      type: 'delete-workspace',
      id: workspaceB.id,
      newActiveWorkspaceId: workspaceA.id,
      updatedAt: timestamp,
    });
    expect(inactiveDelete.activeWorkspaceId).toBe(workspaceA.id);
    expect(inactiveDelete.categoryOrderByWorkspace[workspaceB.id]).toBeUndefined();

    const activeDelete = applyStateMutation(state, {
      type: 'delete-workspace',
      id: workspaceA.id,
      newActiveWorkspaceId: workspaceB.id,
      updatedAt: timestamp,
    });
    expect(activeDelete.activeWorkspaceId).toBe(workspaceB.id);
    expect(activeDelete.categoryOrderByWorkspace[workspaceA.id]).toBeUndefined();
  });

  it('rejects missing folder targets, workspace ownership, duplicate IDs, and unknown category order workspaces', () => {
    const state = createEmptyState();
    const existing = folder('folder-existing');
    const withFolder = applyStateMutation(state, { type: 'add-folder', folder: existing });

    expect(() => applyStateMutation(state, {
      type: 'add-folder',
      folder: folder('folder-missing-workspace', 'missing-workspace'),
    })).toThrowError(expect.objectContaining({ code: 'WORKSPACE_NOT_FOUND' }));
    expect(() => applyStateMutation(withFolder, {
      type: 'add-folder',
      folder: folder(existing.id, existing.workspaceId, 'Different'),
    })).toThrowError(expect.objectContaining({ code: 'FOLDER_ID_CONFLICT' }));

    const missingTargetMutations: StateMutation[] = [
      { type: 'rename-folder', id: 'missing-folder', name: 'Renamed', updatedAt: timestamp },
      { type: 'delete-folder', id: 'missing-folder', updatedAt: timestamp },
      { type: 'set-folder-collapsed', id: 'missing-folder', collapsed: true, updatedAt: timestamp },
    ];
    missingTargetMutations.forEach((mutation) => {
      expect(() => applyStateMutation(withFolder, mutation)).toThrowError(
        expect.objectContaining({ code: 'FOLDER_NOT_FOUND' }),
      );
    });
    expect(() => applyStateMutation(withFolder, {
      type: 'set-category-order',
      workspaceId: 'missing-workspace',
      expectedCategoryOrder: [],
      categoryOrder: [],
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'WORKSPACE_NOT_FOUND' }));
  });

  it('replays exact groups but rejects same-ID group payload collisions', () => {
    const entityFolder = folder('entity-folder');
    const entityWorkspace: Workspace = {
      id: 'entity-workspace',
      name: 'Entity workspace',
      emoji: '🗂️',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const existing = {
      ...group('entity-group', 'workspace_default', [tab('entity-child')]),
      folderId: entityFolder.id,
    };
    const before = {
      ...createEmptyState(),
      workspaces: [...createEmptyState().workspaces, entityWorkspace],
      folders: [entityFolder],
      groups: [existing],
    };
    const mutation: StateMutation = { type: 'add-group', group: existing, updatedAt: timestamp };

    expect(applyStateMutation(before, mutation)).toEqual(before);
    [
      { ...existing, title: 'Different title' },
      { ...existing, workspaceId: entityWorkspace.id, folderId: null },
      { ...existing, folderId: null },
      { ...existing, tabs: [{ ...existing.tabs[0], title: 'Different child' }] },
    ].forEach((conflictingGroup) => {
      expect(() => applyStateMutation(before, { ...mutation, group: conflictingGroup })).toThrowError(
        expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }),
      );
    });
  });

  it('replays exact tabs from live or Bin evidence but rejects same-ID payload collisions', () => {
    const target = group('tab-entity-target');
    const liveTab = tab('tab-entity-live');
    const liveState = { ...createEmptyState(), groups: [{ ...target, tabs: [liveTab] }] };
    const addLive: StateMutation = { type: 'add-tab', groupId: target.id, tab: liveTab, updatedAt: timestamp };

    expect(applyStateMutation(liveState, addLive)).toEqual(liveState);
    expect(() => applyStateMutation(liveState, {
      ...addLive,
      tab: { ...liveTab, title: 'Different live tab' },
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));

    const binTab = tab('tab-entity-bin');
    const withAdded = applyStateMutation({ ...createEmptyState(), groups: [target] }, {
      type: 'add-tab',
      groupId: target.id,
      tab: binTab,
      updatedAt: timestamp,
    });
    const deleted = applyStateMutation(withAdded, {
      type: 'delete-tab',
      groupId: target.id,
      tabId: binTab.id,
      binEntry: {
        id: 'tab-entity-bin-entry',
        kind: 'tab',
        label: binTab.title,
        groupId: target.id,
        groupTitle: target.title,
        source: 'group',
        item: binTab,
        deletedAt: timestamp,
        originalGroupId: target.id,
        originalWorkspaceId: target.workspaceId,
        originalFolderId: target.folderId,
      },
      updatedAt: timestamp,
    });
    const addFromBin: StateMutation = {
      type: 'add-tab',
      groupId: target.id,
      tab: binTab,
      updatedAt: timestamp,
    };

    expect(applyStateMutation(deleted, addFromBin)).toEqual(deleted);
    expect(() => applyStateMutation(deleted, {
      ...addFromBin,
      tab: { ...binTab, note: 'Different Bin tab' },
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));

    const nestedBinTab = tab('tab-entity-nested-bin');
    const nestedBinGroup = group('tab-entity-nested-bin-group', 'workspace_default', [nestedBinTab]);
    const nestedBinEntry: BinEntry = {
      id: 'tab-entity-nested-bin-entry',
      kind: 'group',
      label: nestedBinGroup.title,
      groupId: nestedBinGroup.id,
      groupTitle: nestedBinGroup.title,
      source: 'group',
      item: nestedBinGroup,
      deletedAt: timestamp,
    };
    const nestedBinState = { ...createEmptyState(), bin: [nestedBinEntry] };
    const addFromNestedBin: StateMutation = {
      type: 'add-tab',
      groupId: target.id,
      tab: nestedBinTab,
      updatedAt: timestamp,
    };

    expect(() => applyStateMutation(nestedBinState, addFromNestedBin)).toThrowError(
      expect.objectContaining({ code: 'GROUP_NOT_FOUND' }),
    );
    expect(() => applyStateMutation(nestedBinState, {
      ...addFromNestedBin,
      tab: { ...nestedBinTab, title: 'Different nested Bin tab' },
    })).toThrowError(expect.objectContaining({ code: 'GROUP_NOT_FOUND' }));
  });

  it('keeps add-tab and group-note replay scoped to their parent group', () => {
    const candidate = tab('parent-aware-tab');
    const target = group('parent-aware-target');
    const other = group('parent-aware-other', 'workspace_default', [candidate]);
    const crossGroupState = { ...createEmptyState(), groups: [target, other] };

    expect(() => applyStateMutation(crossGroupState, {
      type: 'add-tab', groupId: target.id, tab: candidate, updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));

    const missingParentEntry: BinEntry = {
      id: 'parent-aware-missing-bin',
      kind: 'tab',
      label: candidate.title,
      groupId: 'parent-aware-missing',
      groupTitle: 'Missing',
      source: 'group',
      item: candidate,
      deletedAt: timestamp,
      originalGroupId: 'parent-aware-missing',
    };
    expect(() => applyStateMutation({ ...createEmptyState(), bin: [missingParentEntry] }, {
      type: 'add-tab', groupId: 'parent-aware-missing', tab: candidate, updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_NOT_FOUND' }));

    const noteTarget = { ...group('parent-aware-note-target'), note: 'Parent note' };
    const parentAwareNote = createNoteRecord('Parent note', {
      id: candidate.id,
      title: candidate.title,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    });
    const noteOther = group('parent-aware-note-other', 'workspace_default', [parentAwareNote]);
    const noteState = { ...createEmptyState(), groups: [noteTarget, noteOther] };
    const noteMutation: StateMutation = {
      type: 'set-group-note',
      groupId: noteTarget.id,
      text: 'Parent note',
      noteTab: parentAwareNote,
      updatedAt: timestamp,
    };
    expect(() => applyStateMutation(noteState, noteMutation)).toThrowError(
      expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }),
    );

    const parentBinEntry: BinEntry = {
      id: 'parent-aware-matching-bin',
      kind: 'tab',
      label: noteMutation.noteTab.title,
      groupId: noteTarget.id,
      groupTitle: noteTarget.title,
      source: 'group',
      item: noteMutation.noteTab,
      deletedAt: timestamp,
      originalGroupId: noteTarget.id,
    };
    const parentBinState = { ...createEmptyState(), groups: [noteTarget], bin: [parentBinEntry] };
    expect(applyStateMutation(parentBinState, {
      type: 'add-tab', groupId: noteTarget.id, tab: noteMutation.noteTab, updatedAt: timestamp,
    })).toEqual(parentBinState);
    expect(applyStateMutation(parentBinState, noteMutation)).toEqual(parentBinState);
  });

  it('skips exact binned groups before validating stale placement on partial retry', () => {
    const staleGroup = group('partial-stale-bin-group', 'deleted-workspace');
    const staleEntry: BinEntry = {
      id: 'partial-stale-bin-entry',
      kind: 'group',
      label: staleGroup.title,
      groupId: staleGroup.id,
      groupTitle: staleGroup.title,
      source: 'group',
      item: staleGroup,
      deletedAt: timestamp,
    };
    const before = { ...createEmptyState(), bin: [staleEntry] };
    const fresh = group('partial-stale-bin-fresh');

    const after = applyStateMutation(before, {
      type: 'import-groups',
      groups: [staleGroup, fresh],
      updatedAt: timestamp,
    });

    expect(after.groups.map(({ id }) => id)).toEqual([fresh.id]);
    expect(after.bin).toEqual([staleEntry]);
  });

  it.each(['prepend-groups', 'import-groups'] as const)(
    'rejects %s groups whose new nested tab ID already exists',
    (type) => {
      const existingTab = tab(`nested-${type}-existing-tab`);
      const before = {
        ...createEmptyState(),
        groups: [group(`nested-${type}-existing-group`, 'workspace_default', [existingTab])],
      };
      const incoming = group(`nested-${type}-incoming-group`, 'workspace_default', [existingTab]);

      expect(() => applyStateMutation(before, {
        type,
        groups: [incoming],
        updatedAt: timestamp,
      })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));
    },
  );

  it.each(['prepend-groups', 'import-groups'] as const)(
    'partially retries exact %s groups while adding new groups',
    (type) => {
      const existing = group(`partial-${type}-existing`);
      const fresh = group(`partial-${type}-fresh`);
      const before = { ...createEmptyState(), groups: [existing] };

      const after = applyStateMutation(before, { type, groups: [existing, fresh], updatedAt: timestamp });

      expect(after.groups.map(({ id }) => id)).toEqual(
        type === 'prepend-groups' ? [fresh.id, existing.id] : [existing.id, fresh.id],
      );
    },
  );

  it.each(['prepend-groups', 'import-groups'] as const)(
    'rejects conflicting or duplicate %s groups as a whole batch',
    (type) => {
      const existing = group(`conflict-${type}-existing`);
      const before = { ...createEmptyState(), groups: [existing] };
      const conflicting = { ...existing, title: 'Conflicting payload' };
      const fresh = group(`conflict-${type}-fresh`);

      expect(() => applyStateMutation(before, { type, groups: [conflicting, fresh], updatedAt: timestamp })).toThrowError(
        expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }),
      );
      expect(() => applyStateMutation(createEmptyState(), {
        type,
        groups: [fresh, { ...fresh }],
        updatedAt: timestamp,
      })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));
      expect(before.groups).toEqual([existing]);
    },
  );

  it('requires exact note evidence and text before replaying set-group-note', () => {
    const target = group('group-note-entity-target');
    const noteTab = { ...tab('group-note-entity-note', 'note'), note: 'Current note' };
    const mutation: StateMutation = {
      type: 'set-group-note',
      groupId: target.id,
      text: 'Current note',
      noteTab,
      updatedAt: timestamp,
    };
    const once = applyStateMutation({ ...createEmptyState(), groups: [target] }, mutation);

    expect(applyStateMutation(once, mutation)).toEqual(once);
    expect(() => applyStateMutation(once, {
      ...mutation,
      text: 'Different note text',
    })).toThrowError(expect.objectContaining({ code: 'GROUP_NOTE_INVALID' }));
    expect(() => applyStateMutation(once, {
      ...mutation,
      noteTab: { ...noteTab, title: 'Different note payload' },
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));
  });

  it('validates update-group tab replacements against every entity source', () => {
    const targetTab = tab('update-tabs-target-existing');
    const target = group('update-tabs-target', 'workspace_default', [targetTab]);
    const sameWorkspaceTab = tab('update-tabs-live-same-workspace');
    const sameWorkspace = group('update-tabs-live-group', 'workspace_default', [sameWorkspaceTab]);
    const otherWorkspace = {
      ...createEmptyState().workspaces[0],
      id: 'workspace-update-tabs-other',
      name: 'Other',
    };
    const crossWorkspaceTab = tab('update-tabs-live-other-workspace');
    const crossWorkspace = group('update-tabs-live-other-group', otherWorkspace.id, [crossWorkspaceTab]);
    const directBinTab = tab('update-tabs-direct-bin');
    const nestedBinTab = tab('update-tabs-nested-bin');
    const binnedGroup = group('update-tabs-binned-group', 'workspace_default', [nestedBinTab]);
    const state = {
      ...createEmptyState(),
      workspaces: [createEmptyState().workspaces[0], otherWorkspace],
      groups: [target, sameWorkspace, crossWorkspace],
      bin: [
        {
          id: 'update-tabs-direct-bin-entry',
          kind: 'tab' as const,
          label: directBinTab.title,
          groupId: target.id,
          groupTitle: target.title,
          source: 'group',
          item: directBinTab,
          deletedAt: timestamp,
        },
        {
          id: 'update-tabs-nested-bin-entry',
          kind: 'group' as const,
          label: binnedGroup.title,
          groupId: binnedGroup.id,
          groupTitle: binnedGroup.title,
          source: 'group',
          item: binnedGroup,
          deletedAt: timestamp,
        },
      ],
    };
    const updateTabs = (tabs: TabItem[]) => applyStateMutation(state, {
      type: 'update-group',
      id: target.id,
      updates: { tabs },
      updatedAt: timestamp,
    });

    [
      [tab('update-tabs-internal'), tab('update-tabs-internal')],
      [sameWorkspaceTab],
      [crossWorkspaceTab],
      [directBinTab],
      [nestedBinTab],
    ].forEach((tabs) => {
      expect(() => updateTabs(tabs)).toThrowError(
        expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }),
      );
    });

    const replaced = updateTabs([{ ...targetTab, title: 'updated target tab' }]);
    expect(replaced.groups.find(({ id }) => id === target.id)?.tabs).toEqual([
      { ...targetTab, title: 'updated target tab' },
    ]);
  });

  it('replaces only matching reorder slots and preserves interleaved groups', () => {
    const reorderFolder = folder('reorder-interleaved-folder');
    const first = placedGroup('reorder-interleaved-first', 'workspace_default', reorderFolder.id);
    const unrelated = group('reorder-interleaved-unrelated');
    const second = placedGroup('reorder-interleaved-second', 'workspace_default', reorderFolder.id);
    const trailing = { ...group('reorder-interleaved-trailing'), starred: true };
    const state = { ...createEmptyState(), folders: [reorderFolder], groups: [first, unrelated, second, trailing] };

    const after = applyStateMutation(state, {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: reorderFolder.id,
      starred: false,
        archived: false,
      orderedGroupIds: [second.id, first.id],
      updatedAt: timestamp,
    });

    expect(after.groups.map(({ id }) => id)).toEqual([second.id, unrelated.id, first.id, trailing.id]);
  });

  it('requires set-group-note payloads to be note tabs matching the text', () => {
    const target = group('note-payload-target');
    const state = { ...createEmptyState(), groups: [target] };
    const malformed: StateMutation[] = [
      {
        type: 'set-group-note',
        groupId: target.id,
        text: 'Expected text',
        noteTab: tab('forged-link-note'),
        updatedAt: timestamp,
      },
      {
        type: 'set-group-note',
        groupId: target.id,
        text: 'Expected text',
        noteTab: { ...tab('forged-note-text', 'note'), note: 'Different text' },
        updatedAt: timestamp,
      },
    ];

    malformed.forEach((mutation) => {
      expect(() => applyStateMutation(state, mutation)).toThrowError(
        expect.objectContaining({ code: 'GROUP_NOTE_INVALID' }),
      );
    });

    const validNote = { ...tab('valid-note', 'note'), note: 'Expected text' };
    const after = applyStateMutation(state, {
      type: 'set-group-note',
      groupId: target.id,
      text: 'Expected text',
      noteTab: validNote,
      updatedAt: timestamp,
    });
    expect(after.groups[0]).toMatchObject({ note: 'Expected text', tabs: [validNote] });
  });

  it('rebases a valid drop after preceding malformed raw drops by original index', () => {
    const before = {
      ...createEmptyState(),
      mutationRevision: 7,
      groups: [group('raw-gap-valid')],
    };
    const valid: StateMutation = {
      type: 'drop-intent',
      operationId: 'raw-gap-valid-operation',
      expectedRevision: 8,
      intent: { kind: 'move-session', groupId: 'raw-gap-valid', category: 'saved', index: 0, workspaceId: 'workspace_default' },
      openTabs: [],
      updatedAt: timestamp,
    };

    expect(() => applyStateMutations(before, [{ type: 'drop-intent', intent: null }, valid])).toThrowError(
      expect.objectContaining({
        invalidMutationIndexes: [0],
        committedMutationIndexes: [1],
        committedState: expect.objectContaining({ mutationRevision: 8 }),
      }),
    );
    const validBeforeLaterRawGap = { ...valid, expectedRevision: 7, operationId: 'raw-gap-valid-before-later-invalid' };
    expect(() => applyStateMutations(before, [validBeforeLaterRawGap, { type: 'drop-intent', intent: null }])).toThrowError(
      expect.objectContaining({ invalidMutationIndexes: [1], committedMutationIndexes: [0] }),
    );
  });

  it.each(['add-group', 'prepend-groups', 'import-groups'] as const)(
    'validates %s placement and keeps exact replays while adding fresh groups',
    (type) => {
      const otherWorkspace = {
        ...createEmptyState().workspaces[0],
        id: 'workspace-placement-other',
        name: 'Other',
      };
      const existing = placedGroup(`${type}-existing`, 'workspace_default', null);
      const fresh = placedGroup(`${type}-fresh`, 'workspace_default', null);
      const before = { ...createEmptyState(), groups: [existing], workspaces: [createEmptyState().workspaces[0], otherWorkspace] };
      const input = type === 'add-group' ? { type, group: fresh, updatedAt: timestamp } : { type, groups: [existing, fresh], updatedAt: timestamp };

      const after = applyStateMutation(before, input as StateMutation);
      expect(after.groups.map(({ id }) => id)).toEqual(
        type === 'add-group' || type === 'import-groups'
          ? [existing.id, fresh.id]
          : [fresh.id, existing.id],
      );

      const invalid = type === 'add-group'
        ? { type, group: placedGroup(`${type}-invalid`, otherWorkspace.id, 'missing-folder'), updatedAt: timestamp }
        : { type, groups: [placedGroup(`${type}-invalid`, otherWorkspace.id, 'missing-folder')], updatedAt: timestamp };
      expect(() => applyStateMutation(before, invalid as StateMutation)).toThrowError(
        expect.objectContaining({ code: 'FOLDER_NOT_FOUND' }),
      );
    },
  );

  it('rejects forged import placement across workspaces', () => {
    const otherWorkspace = {
      ...createEmptyState().workspaces[0],
      id: 'workspace-import-placement-other',
      name: 'Other',
    };
    const foreignFolder = folder('import-foreign-folder', otherWorkspace.id);
    const before = {
      ...createEmptyState(),
      workspaces: [createEmptyState().workspaces[0], otherWorkspace],
      folders: [foreignFolder],
    };

    expect(() => applyStateMutation(before, {
      type: 'import-groups',
      groups: [placedGroup('import-forged-placement', 'workspace_default', foreignFolder.id)],
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_PLACEMENT_INVALID' }));
  });

  it('merges update-group placement with explicit null and validates omitted folderId', () => {
    const otherWorkspace = {
      ...createEmptyState().workspaces[0],
      id: 'workspace-update-other',
      name: 'Other',
    };
    const sourceFolder = folder('update-source-folder');
    const source = placedGroup('update-placement-group', 'workspace_default', sourceFolder.id);
    const state = {
      ...createEmptyState(),
      workspaces: [createEmptyState().workspaces[0], otherWorkspace],
      folders: [sourceFolder],
      groups: [source],
    };

    const moved = applyStateMutation(state, {
      type: 'update-group',
      id: source.id,
      updates: { workspaceId: otherWorkspace.id, folderId: null },
      updatedAt: timestamp,
    });
    expect(moved.groups[0]).toMatchObject({ workspaceId: otherWorkspace.id, folderId: null });

    expect(() => applyStateMutation(state, {
      type: 'update-group',
      id: source.id,
      updates: { workspaceId: otherWorkspace.id },
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_PLACEMENT_INVALID' }));
  });

  it('validates move-group targets and accepts same-workspace placement', () => {
    const otherWorkspace = {
      ...createEmptyState().workspaces[0],
      id: 'workspace-move-group-other',
      name: 'Other',
    };
    const localFolder = folder('move-group-local-folder');
    const foreignFolder = folder('move-group-foreign-folder', 'workspace-move-group-other');
    const moved = group('move-group-target');
    const state = {
      ...createEmptyState(),
      workspaces: [createEmptyState().workspaces[0], otherWorkspace],
      folders: [localFolder, foreignFolder],
      groups: [moved],
    };

    const placed = applyStateMutation(state, {
      type: 'move-group', groupId: moved.id, targetFolderId: localFolder.id, starred: false, archived: false, index: 0, updatedAt: timestamp,
    });
    expect(placed.groups[0]).toMatchObject({ folderId: localFolder.id, starred: false });
    expect(() => applyStateMutation(state, {
      type: 'move-group', groupId: moved.id, targetFolderId: foreignFolder.id, starred: false, archived: false, index: 0, updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_PLACEMENT_INVALID' }));
    expect(() => applyStateMutation(state, {
      type: 'move-group', groupId: moved.id, targetFolderId: localFolder.id, starred: true, archived: false, index: 0, updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_PLACEMENT_INVALID' }));
  });

  it('requires existing groups and tabs for ordinary references', () => {
    const target = group('ordinary-target', 'workspace_default', [tab('ordinary-tab')]);
    const state = { ...createEmptyState(), groups: [target] };
    const missingGroupMutations: StateMutation[] = [
      { type: 'update-group', id: 'missing-group', updates: { title: 'x' }, updatedAt: timestamp },
      { type: 'delete-group', id: 'missing-group', binEntry: {
        id: 'missing-group-bin', kind: 'group', label: '', groupId: 'missing-group', groupTitle: '', source: 'group', item: group('missing-group'), deletedAt: timestamp,
        originalWorkspaceId: 'workspace_default', originalFolderId: null,
      }, updatedAt: timestamp },
      { type: 'move-group', groupId: 'missing-group', targetFolderId: null, starred: false, archived: false, index: 0, updatedAt: timestamp },
      { type: 'add-tab', groupId: 'missing-group', tab: tab('new-tab'), updatedAt: timestamp },
      { type: 'set-group-flags', id: 'missing-group', starred: true, updatedAt: timestamp },
      { type: 'set-group-note', groupId: 'missing-group', text: 'x', noteTab: tab('missing-group-note', 'note'), updatedAt: timestamp },
      { type: 'move-tab', groupId: 'missing-group', tabId: 'ordinary-tab', targetGroupId: target.id, targetIndex: 0, updatedAt: timestamp },
      { type: 'move-tab', groupId: target.id, tabId: 'ordinary-tab', targetGroupId: 'missing-target', targetIndex: 0, updatedAt: timestamp },
    ];
    missingGroupMutations.forEach((mutation) => {
      expect(() => applyStateMutation(state, mutation)).toThrowError(
        expect.objectContaining({ code: 'GROUP_NOT_FOUND' }),
      );
    });

    const missingTabMutations: StateMutation[] = [
      { type: 'update-tab', groupId: target.id, tabId: 'missing-tab', updates: { title: 'x' }, updatedAt: timestamp },
      { type: 'delete-tab', groupId: target.id, tabId: 'missing-tab', binEntry: {
        id: 'missing-tab-bin', kind: 'tab', label: '', groupId: target.id, groupTitle: target.title, source: 'group', item: tab('missing-tab'), deletedAt: timestamp,
        originalGroupId: target.id, originalWorkspaceId: target.workspaceId, originalFolderId: target.folderId,
      }, updatedAt: timestamp },
      { type: 'set-tab-note', groupId: target.id, tabId: 'missing-tab', text: 'x', updatedAt: timestamp },
      { type: 'move-tab', groupId: target.id, tabId: 'missing-tab', targetGroupId: target.id, targetIndex: 0, updatedAt: timestamp },
    ];
    missingTabMutations.forEach((mutation) => {
      expect(() => applyStateMutation(state, mutation)).toThrowError(
        expect.objectContaining({ code: 'TAB_NOT_FOUND' }),
      );
    });
  });

  it('validates move-tab references and workspace boundaries while allowing same-group moves', () => {
    const otherWorkspace = {
      ...createEmptyState().workspaces[0],
      id: 'workspace-move-tab-other',
      name: 'Other',
    };
    const source = group('move-tab-source', 'workspace_default', [tab('move-tab-item'), tab('move-tab-other')]);
    const target = group('move-tab-target');
    const foreign = group('move-tab-foreign', otherWorkspace.id);
    const state = {
      ...createEmptyState(),
      workspaces: [createEmptyState().workspaces[0], otherWorkspace],
      groups: [source, target, foreign],
    };

    const sameGroup = applyStateMutation(state, {
      type: 'move-tab', groupId: source.id, tabId: 'move-tab-item', targetGroupId: source.id, targetIndex: 1, updatedAt: timestamp,
    });
    expect(sameGroup.groups.find(({ id }) => id === source.id)?.tabs.map(({ id }) => id)).toEqual(['move-tab-other', 'move-tab-item']);

    expect(() => applyStateMutation(state, {
      type: 'move-tab', groupId: source.id, tabId: 'move-tab-item', targetGroupId: foreign.id, targetIndex: 0, updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_PLACEMENT_INVALID' }));
  });

  it('rejects cross-group moves when target already contains tab ID', () => {
    const sourceTab = tab('move-tab-duplicate-target');
    const source = group('move-tab-duplicate-source', 'workspace_default', [sourceTab]);
    const target = group('move-tab-duplicate-target-group', 'workspace_default', [tab('move-tab-duplicate-target')]);
    const state = { ...createEmptyState(), groups: [source, target] };

    expect(() => applyStateMutation(state, {
      type: 'move-tab',
      groupId: source.id,
      tabId: sourceTab.id,
      targetGroupId: target.id,
      targetIndex: 0,
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));
    expect(state.groups.map((item) => item.tabs.map(({ id }) => id))).toEqual([
      [sourceTab.id],
      [sourceTab.id],
    ]);
  });

  it('moves same-workspace tabs immutably with requested placement and timestamps', () => {
    const moveTimestamp = '2026-01-02T00:00:00.000Z';
    const moved = tab('move-detailed-tab');
    const remaining = tab('move-detailed-remaining');
    const source = group('move-detailed-source', 'workspace_default', [moved]);
    const target = group('move-detailed-target', 'workspace_default', [remaining]);
    const before = { ...createEmptyState(), groups: [source, target] };
    const beforeSnapshot = structuredClone(before);

    const after = applyStateMutation(before, {
      type: 'move-tab',
      groupId: source.id,
      tabId: moved.id,
      targetGroupId: target.id,
      targetIndex: 0,
      updatedAt: moveTimestamp,
    });

    expect(after.groups.find(({ id }) => id === source.id)?.tabs).toEqual([]);
    expect(after.groups.find(({ id }) => id === target.id)?.tabs).toEqual([
      { ...moved, updatedAt: moveTimestamp },
      remaining,
    ]);
    expect(after.groups.find(({ id }) => id === source.id)?.updatedAt).toBe(moveTimestamp);
    expect(after.groups.find(({ id }) => id === target.id)?.updatedAt).toBe(moveTimestamp);
    expect(after.updatedAt).toBe(moveTimestamp);
    expect(after.mutationRevision).toBe(before.mutationRevision + 1);
    expect(before).toEqual(beforeSnapshot);
  });

  it('validates reorder category references and preserves unlisted category members', () => {
    const otherWorkspace = {
      ...createEmptyState().workspaces[0],
      id: 'workspace-reorder-other',
      name: 'Other',
    };
    const reorderFolder = folder('reorder-folder');
    const anotherFolder = folder('reorder-another-folder');
    const first = placedGroup('reorder-first', 'workspace_default', reorderFolder.id);
    const second = placedGroup('reorder-second', 'workspace_default', reorderFolder.id);
    const remaining = placedGroup('reorder-remaining', 'workspace_default', reorderFolder.id);
    const foreign = placedGroup('reorder-foreign', otherWorkspace.id, null);
    const wrongCategory = placedGroup('reorder-wrong-category', 'workspace_default', anotherFolder.id);
    const state = {
      ...createEmptyState(),
      workspaces: [createEmptyState().workspaces[0], otherWorkspace],
      folders: [reorderFolder, anotherFolder],
      groups: [first, second, remaining, foreign, wrongCategory],
    };

    const reordered = applyStateMutation(state, {
      type: 'reorder-groups', workspaceId: 'workspace_default', folderId: reorderFolder.id, starred: false,
        archived: false,
      orderedGroupIds: [second.id], updatedAt: timestamp,
    });
    expect(reordered.groups.filter(({ folderId }) => folderId === reorderFolder.id).map(({ id }) => id)).toEqual([
      second.id, first.id, remaining.id,
    ]);

    const invalidMutations: StateMutation[] = [
      { type: 'reorder-groups', workspaceId: 'missing-workspace', folderId: null, starred: false, archived: false, orderedGroupIds: [], updatedAt: timestamp },
      { type: 'reorder-groups', workspaceId: 'workspace_default', folderId: 'missing-folder', starred: false, archived: false, orderedGroupIds: [], updatedAt: timestamp },
      { type: 'reorder-groups', workspaceId: 'workspace_default', folderId: otherWorkspace.id, starred: false, archived: false, orderedGroupIds: [], updatedAt: timestamp },
      { type: 'reorder-groups', workspaceId: 'workspace_default', folderId: reorderFolder.id, starred: false, archived: false, orderedGroupIds: [foreign.id], updatedAt: timestamp },
      { type: 'reorder-groups', workspaceId: 'workspace_default', folderId: reorderFolder.id, starred: false, archived: false, orderedGroupIds: ['missing-group'], updatedAt: timestamp },
      { type: 'reorder-groups', workspaceId: 'workspace_default', folderId: reorderFolder.id, starred: false, archived: false, orderedGroupIds: [first.id, first.id], updatedAt: timestamp },
      { type: 'reorder-groups', workspaceId: 'workspace_default', folderId: reorderFolder.id, starred: false, archived: false, orderedGroupIds: [wrongCategory.id], updatedAt: timestamp },
      { type: 'reorder-groups', workspaceId: 'workspace_default', folderId: reorderFolder.id, starred: true, archived: false, orderedGroupIds: [], updatedAt: timestamp },
    ];
    invalidMutations.forEach((mutation) => {
      expect(() => applyStateMutation(state, mutation)).toThrowError(
        expect.objectContaining({ code: expect.any(String) }),
      );
    });
  });

  it('rejects every ordinary mutation that changes a locked group while allowing unlocked siblings', () => {
    const lockedTab = tab('locked-tab');
    const unlockedTab = tab('unlocked-tab');
    const locked = { ...group('locked-group', 'workspace_default', [lockedTab]), locked: true };
    const target = group('unlocked-target', 'workspace_default', [unlockedTab]);
    const deleteGroupEntry: BinEntry = {
      id: 'locked-group-bin', kind: 'group', label: locked.title, groupId: locked.id,
      groupTitle: locked.title, source: 'group', item: locked, deletedAt: timestamp,
      originalWorkspaceId: locked.workspaceId, originalFolderId: locked.folderId,
    };
    const deleteTabEntry: BinEntry = {
      id: 'locked-tab-bin', kind: 'tab', label: lockedTab.title, groupId: locked.id,
      groupTitle: locked.title, source: 'group', item: lockedTab, deletedAt: timestamp,
      originalGroupId: locked.id, originalWorkspaceId: locked.workspaceId, originalFolderId: locked.folderId,
    };
    const noteTab = { ...tab('locked-note', 'note'), note: 'note' };
    const state = { ...createEmptyState(), groups: [locked, target] };
    const mutations: StateMutation[] = [
      { type: 'update-group', id: locked.id, updates: { title: 'changed' }, updatedAt: timestamp },
      { type: 'delete-group', id: locked.id, binEntry: deleteGroupEntry, updatedAt: timestamp },
      { type: 'move-group', groupId: locked.id, targetFolderId: null, starred: true, archived: false, index: 0, updatedAt: timestamp },
      { type: 'add-tab', groupId: locked.id, tab: tab('new-locked-tab'), updatedAt: timestamp },
      { type: 'update-tab', groupId: locked.id, tabId: lockedTab.id, updates: { title: 'changed' }, updatedAt: timestamp },
      { type: 'delete-tab', groupId: locked.id, tabId: lockedTab.id, binEntry: deleteTabEntry, updatedAt: timestamp },
      { type: 'move-tab', groupId: locked.id, tabId: lockedTab.id, targetGroupId: target.id, targetIndex: 0, updatedAt: timestamp },
      { type: 'move-tab', groupId: target.id, tabId: unlockedTab.id, targetGroupId: locked.id, targetIndex: 0, updatedAt: timestamp },
      { type: 'set-group-note', groupId: locked.id, text: 'note', noteTab, updatedAt: timestamp },
      { type: 'set-tab-note', groupId: locked.id, tabId: lockedTab.id, text: 'note', updatedAt: timestamp },
    ];

    mutations.forEach((mutation) => {
      expect(() => applyStateMutation(state, mutation)).toThrowError(
        expect.objectContaining({ code: 'GROUP_LOCKED' }),
      );
    });

    const updated = applyStateMutation(state, {
      type: 'update-group', id: target.id, updates: { title: 'updated' }, updatedAt: timestamp,
    });
    expect(updated.groups.find(({ id }) => id === target.id)?.title).toBe('updated');
  });

  it('rejects cascading mutations that would change locked groups', () => {
    const lockedTab = tab('cascade-locked-tab');
    const locked = { ...group('cascade-locked-group', 'workspace_default', [lockedTab]), locked: true };
    const sibling = group('cascade-sibling-group');
    const reorderState = { ...createEmptyState(), groups: [locked, sibling] };
    const deleteWorkspaceState: TabBoardState = {
      ...reorderState,
      workspaces: [
        ...reorderState.workspaces,
        { id: 'cascade-workspace', name: 'Cascade', emoji: '🗂️', createdAt: timestamp, updatedAt: timestamp },
      ],
      groups: [{ ...locked, workspaceId: 'cascade-workspace' }, sibling],
    };
    const folderState = {
      ...createEmptyState(),
      folders: [folder('cascade-folder')],
      groups: [{ ...locked, folderId: 'cascade-folder' }],
    };
    const cases: StateMutation[] = [
      {
        type: 'delete-workspace',
        id: 'cascade-workspace',
        newActiveWorkspaceId: 'workspace_default',
        updatedAt: timestamp,
      },
      { type: 'delete-folder', id: 'cascade-folder', updatedAt: timestamp },
      {
        type: 'remove-restored-refs',
        refs: [{ source: 'group', groupId: locked.id, tabId: lockedTab.id }],
        updatedAt: timestamp,
      },
      {
        type: 'reorder-groups',
        workspaceId: 'workspace_default',
        folderId: null,
        starred: false,
        archived: false,
        orderedGroupIds: [sibling.id, locked.id],
        updatedAt: timestamp,
      },
    ];

    expect(() => applyStateMutation(deleteWorkspaceState, cases[0])).toThrowError(
      expect.objectContaining({ code: 'GROUP_LOCKED' }),
    );
    expect(() => applyStateMutation(folderState, cases[1])).toThrowError(
      expect.objectContaining({ code: 'GROUP_LOCKED' }),
    );
    expect(() => applyStateMutation(reorderState, cases[2])).toThrowError(
      expect.objectContaining({ code: 'GROUP_LOCKED' }),
    );
    expect(() => applyStateMutation(reorderState, cases[3])).toThrowError(
      expect.objectContaining({ code: 'GROUP_LOCKED' }),
    );
    expect(() => applyStateMutation(reorderState, {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
        archived: false,
      orderedGroupIds: [locked.id, sibling.id],
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));
  });

  it('allows reordering unlocked siblings when locked placement is unchanged', () => {
    const first = group('reorder-unlocked-first');
    const second = group('reorder-unlocked-second');
    const locked = { ...group('reorder-locked-sibling'), locked: true };
    const trailing = group('reorder-unlocked-trailing');
    const state = { ...createEmptyState(), groups: [first, second, locked, trailing] };
    const mutation: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
        archived: false,
      orderedGroupIds: [second.id, first.id],
      updatedAt: timestamp,
    };

    const next = applyStateMutation(state, mutation);

    expect(next.groups.map(({ id }) => id)).toEqual([second.id, first.id, locked.id, trailing.id]);
    expect(next.groups.find(({ id }) => id === locked.id)).toEqual(locked);
  });

  it('allows valid link-note item-type transitions and rejects incomplete transitions', () => {
    const link = tab('transition-link');
    const note = tab('transition-note', 'note');
    const target = group('transition-target', 'workspace_default', [link, note]);
    const state = { ...createEmptyState(), groups: [target] };

    expect(applyStateMutation(state, {
      type: 'update-tab',
      groupId: target.id,
      tabId: link.id,
      updates: { itemType: 'note', url: '' },
      updatedAt: timestamp,
    }).groups[0].tabs[0]).toMatchObject({ itemType: 'note', url: '' });
    expect(applyStateMutation(state, {
      type: 'update-tab',
      groupId: target.id,
      tabId: note.id,
      updates: { itemType: 'link', url: 'https://transition-note.test' },
      updatedAt: timestamp,
    }).groups[0].tabs[1]).toMatchObject({ itemType: 'link', url: 'https://transition-note.test' });

    for (const updates of [
      { itemType: 'note' as const },
      { itemType: 'link' as const },
    ]) {
      expect(() => applyStateMutation(state, {
        type: 'update-tab',
        groupId: target.id,
        tabId: updates.itemType === 'note' ? link.id : note.id,
        updates,
        updatedAt: timestamp,
      })).toThrowError(expect.objectContaining({ code: 'TAB_URL_INVALID' }));
    }
  });

  it('allows only a single-field unlock on locked groups and preserves unlocked flag behavior', () => {
    const locked = { ...group('unlock-target'), locked: true };
    const state = { ...createEmptyState(), groups: [locked] };

    expect(applyStateMutation(state, {
      type: 'set-group-flags', id: locked.id, locked: false, updatedAt: timestamp,
    }).groups[0].locked).toBe(false);
    for (const mutation of [
      { type: 'set-group-flags' as const, id: locked.id, updatedAt: timestamp },
      { type: 'set-group-flags' as const, id: locked.id, locked: undefined, updatedAt: timestamp },
      { type: 'set-group-flags' as const, id: locked.id, locked: true, updatedAt: timestamp },
      { type: 'set-group-flags' as const, id: locked.id, locked: false, starred: true, updatedAt: timestamp },
      { type: 'set-group-flags' as const, id: locked.id, locked: false, collapsed: true, updatedAt: timestamp },
    ]) {
      expect(() => applyStateMutation(state, mutation)).toThrowError(
        expect.objectContaining({ code: 'GROUP_LOCKED' }),
      );
    }

    const unlocked = applyStateMutation(state, {
      type: 'set-group-flags', id: locked.id, locked: false, updatedAt: timestamp,
    });
    expect(applyStateMutation(unlocked, {
      type: 'set-group-flags', id: locked.id, starred: true, updatedAt: timestamp,
    }).groups[0]).toMatchObject({ locked: false, starred: true });
  });

  it('enforces link and note URL invariants at raw and merged semantic boundaries', () => {
    const target = group('url-target', 'workspace_default', [tab('url-link'), tab('url-note', 'note')]);
    const state = { ...createEmptyState(), groups: [target] };
    const emptyLink = { ...tab('empty-link'), url: '' };
    const nonEmptyNote = { ...tab('non-empty-note', 'note'), url: 'https://invalid-note.test' };
    const rawFullMutations: unknown[] = [
      { type: 'add-tab', groupId: target.id, tab: emptyLink, updatedAt: timestamp },
      { type: 'add-group', group: { ...group('raw-group', 'workspace_default', [emptyLink]) }, updatedAt: timestamp },
      { type: 'prepend-groups', groups: [{ ...group('raw-prepend', 'workspace_default', [nonEmptyNote]) }], updatedAt: timestamp },
      { type: 'import-groups', groups: [{ ...group('raw-import', 'workspace_default', [emptyLink]) }], updatedAt: timestamp },
      { type: 'restore-group', entryId: 'raw-group-bin', group: { ...group('raw-restore-group', 'workspace_default', [emptyLink]) }, index: 0, updatedAt: timestamp },
      { type: 'restore-tab', entryId: 'raw-tab-bin', groupId: target.id, tab: nonEmptyNote, index: 0, updatedAt: timestamp },
      { type: 'delete-tab', groupId: target.id, tabId: emptyLink.id, binEntry: {
        id: 'raw-tab-bin', kind: 'tab', label: emptyLink.title, groupId: target.id, groupTitle: target.title,
        source: 'group', item: emptyLink, deletedAt: timestamp, originalGroupId: target.id,
        originalWorkspaceId: target.workspaceId, originalFolderId: target.folderId,
      }, updatedAt: timestamp },
    ];

    rawFullMutations.forEach((mutation) => {
      expect(isStateMutation(mutation)).toBe(false);
      expect(() => applyStateMutation(state, mutation as never)).toThrowError(
        expect.objectContaining({ code: 'TAB_URL_INVALID' }),
      );
    });

    expect(() => applyStateMutation(state, {
      type: 'update-tab', groupId: target.id, tabId: 'url-link', updates: { url: '' }, updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'TAB_URL_INVALID' }));
    expect(() => applyStateMutation(state, {
      type: 'update-tab', groupId: target.id, tabId: 'url-note', updates: { url: 'https://invalid-note.test' }, updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'TAB_URL_INVALID' }));
    expect(applyStateMutation(state, {
      type: 'update-tab', groupId: target.id, tabId: 'url-note', updates: { note: 'still a note' }, updatedAt: timestamp,
    }).groups[0].tabs[1]).toMatchObject({ itemType: 'note', url: '' });
    expect(applyStateMutation(state, {
      type: 'update-tab', groupId: target.id, tabId: 'url-link', updates: { url: 'https://valid.test' }, updatedAt: timestamp,
    }).groups[0].tabs[0].url).toBe('https://valid.test');
  });

  it('replays exact ordinary mutations after affected groups become locked', () => {
    const original = tab('ordinary-replay-tab');
    const target = group('ordinary-replay-target', 'workspace_default', [original]);
    const before = { ...createEmptyState(), groups: [target] };
    const mutations: StateMutation[] = [
      { type: 'add-tab', groupId: target.id, tab: tab('ordinary-replay-added'), updatedAt: timestamp },
      { type: 'update-tab', groupId: target.id, tabId: original.id, updates: { title: 'updated' }, updatedAt: timestamp },
      { type: 'move-group', groupId: target.id, targetFolderId: null, starred: false, archived: false, index: 0, updatedAt: timestamp },
    ];

    for (const mutation of mutations) {
      const once = applyStateMutation(before, mutation);
      const locked = applyStateMutation(once, {
        type: 'set-group-flags', id: target.id, locked: true, updatedAt: timestamp,
      });
      expect(applyStateMutation(locked, mutation)).toEqual(locked);
    }
  });

  it('preserves newer group metadata on stale reorder retries', () => {
    const laterTimestamp = '2026-01-02T00:00:00.000Z';
    const first = group('replay-stale-first');
    const second = group('replay-stale-second');
    const mutation: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
        archived: false,
      orderedGroupIds: [second.id, first.id],
      updatedAt: timestamp,
    };
    const reordered = applyStateMutation({ ...createEmptyState(), groups: [first, second] }, mutation);
    const newer = applyStateMutation(reordered, {
      type: 'update-group',
      id: second.id,
      updates: { title: 'newer title' },
      updatedAt: laterTimestamp,
    });

    expect(applyStateMutation(newer, mutation)).toEqual(newer);
  });

  it('replays exact reorder when an unlisted sibling shares the mutation timestamp', () => {
    const locked = group('replay-shared-timestamp-locked');
    const listed = group('replay-shared-timestamp-listed');
    const unlisted = group('replay-shared-timestamp-unlisted');
    const mutation: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
        archived: false,
      orderedGroupIds: [listed.id, locked.id],
      updatedAt: timestamp,
    };
    const before = {
      ...createEmptyState(),
      groups: [{ ...locked, updatedAt: '2026-01-02T00:00:00.000Z' }, listed, unlisted],
    };
    const reordered = applyStateMutation(before, mutation);
    const lockedLater = applyStateMutation(reordered, {
      type: 'set-group-flags',
      id: locked.id,
      locked: true,
      updatedAt: '2026-01-03T00:00:00.000Z',
    });

    expect(applyStateMutation(lockedLater, mutation)).toEqual(lockedLater);
  });

  it('rejects same-order forged replays involving locked groups', () => {
    const first = { ...group('replay-forged-locked-first'), locked: true, updatedAt: '2026-07-18T00:00:00.000Z' };
    const second = { ...group('replay-forged-locked-second'), locked: true, updatedAt: '2026-07-18T00:00:00.000Z' };
    const fullState = { ...createEmptyState(), groups: [first, second] };
    const fullMutation: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
        archived: false,
      orderedGroupIds: [first.id, second.id],
      updatedAt: '2026-07-18T00:00:01.000Z',
    };
    expect(() => applyStateMutation(fullState, fullMutation)).toThrowError(
      expect.objectContaining({ code: 'GROUP_LOCKED' }),
    );

    const trailing = group('replay-forged-locked-trailing');
    const subsetState = { ...createEmptyState(), groups: [first, second, trailing] };
    expect(() => applyStateMutation(subsetState, {
      ...fullMutation,
      orderedGroupIds: [first.id, second.id],
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));
  });

  it('replays an exact reorder after every listed group becomes locked', () => {
    const first = group('replay-all-locked-first');
    const second = group('replay-all-locked-second');
    const trailing = group('replay-all-locked-trailing');
    const before = { ...createEmptyState(), groups: [first, second, trailing] };
    const mutation: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
        archived: false,
      orderedGroupIds: [second.id, first.id],
      updatedAt: '2026-07-18T00:00:01.000Z',
    };
    const reordered = applyStateMutation(before, mutation);
    const trailingUpdated = applyStateMutation(reordered, {
      type: 'update-group',
      id: trailing.id,
      updates: { title: 'unrelated update' },
      updatedAt: mutation.updatedAt,
    });
    const firstLocked = applyStateMutation(trailingUpdated, {
      type: 'set-group-flags', id: first.id, locked: true, updatedAt: '2026-07-18T00:00:02.000Z',
    });
    const bothLocked = applyStateMutation(firstLocked, {
      type: 'set-group-flags', id: second.id, locked: true, updatedAt: '2026-07-18T00:00:03.000Z',
    });

    expect(applyStateMutation(bothLocked, mutation)).toEqual(bothLocked);
  });

  it('replays an exact singleton reorder when its untouched sibling shares the timestamp', () => {
    const listed = group('replay-singleton-listed');
    const sibling = group('replay-singleton-sibling');
    const mutation: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
        archived: false,
      orderedGroupIds: [listed.id],
      updatedAt: timestamp,
    };
    const reordered = applyStateMutation({ ...createEmptyState(), groups: [sibling, listed] }, mutation);
    const locked = applyStateMutation(reordered, {
      type: 'set-group-flags', id: listed.id, locked: true, updatedAt: timestamp,
    });
    const later = applyStateMutation(locked, {
      type: 'update-settings',
      updates: { theme: 'dark' },
      updatedAt: '2026-07-18T00:00:02.000Z',
    });

    expect(applyStateMutation(later, mutation)).toEqual(later);
  });

  it('rejects forged older reorder replays after an unrelated group locks', () => {
    const originalTimestamp = '2026-07-18T00:00:01.000Z';
    const forgedTimestamp = '2026-07-18T00:00:00.000Z';
    const lockTimestamp = '2026-07-18T00:00:02.000Z';
    const first = { ...group('replay-older-first'), updatedAt: forgedTimestamp };
    const second = { ...group('replay-older-second'), updatedAt: forgedTimestamp };
    const locked = { ...group('replay-older-unrelated-locked'), updatedAt: forgedTimestamp };
    const before = { ...createEmptyState(), groups: [first, second, locked] };
    const original: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
        archived: false,
      orderedGroupIds: [second.id, first.id],
      updatedAt: originalTimestamp,
    };
    const reordered = applyStateMutation(before, original);
    const lockedLater = applyStateMutation(reordered, {
      type: 'set-group-flags', id: locked.id, locked: true, updatedAt: lockTimestamp,
    });

    expect(applyStateMutation(lockedLater, original)).toEqual(lockedLater);
    expect(() => applyStateMutation(lockedLater, {
      ...original,
      updatedAt: forgedTimestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));
    expect(() => applyStateMutation(lockedLater, {
      ...original,
      orderedGroupIds: [second.id, first.id, locked.id],
      updatedAt: forgedTimestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));
  });

  it('rejects forged older replays when an untouched sibling shares the forged timestamp', () => {
    const originalTimestamp = '2026-07-18T00:00:01.000Z';
    const forgedTimestamp = '2026-07-18T00:00:00.000Z';
    const lockTimestamp = '2026-07-18T00:00:02.000Z';
    const first = { ...group('replay-older-shared-first'), updatedAt: forgedTimestamp };
    const second = { ...group('replay-older-shared-second'), updatedAt: forgedTimestamp };
    const locked = { ...group('replay-older-shared-locked'), updatedAt: forgedTimestamp };
    const untouched = { ...group('replay-older-shared-untouched'), createdAt: forgedTimestamp, updatedAt: forgedTimestamp };
    const before = { ...createEmptyState(), groups: [first, second, locked, untouched] };
    const original: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
        archived: false,
      orderedGroupIds: [second.id, first.id],
      updatedAt: originalTimestamp,
    };
    const reordered = applyStateMutation(before, original);
    const lockedLater = applyStateMutation(reordered, {
      type: 'set-group-flags', id: locked.id, locked: true, updatedAt: lockTimestamp,
    });
    const snapshot = structuredClone(lockedLater);

    for (const orderedGroupIds of [
      [second.id, first.id],
      [second.id, first.id, locked.id],
    ]) {
      expect(() => applyStateMutation(lockedLater, {
        ...original,
        orderedGroupIds,
        updatedAt: forgedTimestamp,
      })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));
      expect(lockedLater).toEqual(snapshot);
      expect(lockedLater.mutationRevision).toBe(snapshot.mutationRevision);
    }
  });

  it('replays exact tab notes and reorder operations after later locking', () => {
    const laterTimestamp = '2026-01-02T00:00:00.000Z';
    const noteTab = tab('replay-note-tab');
    const noteGroup = group('replay-note-group', 'workspace_default', [noteTab]);
    const noteMutation: StateMutation = {
      type: 'set-tab-note',
      groupId: noteGroup.id,
      tabId: noteTab.id,
      text: 'saved note',
      updatedAt: timestamp,
    };
    const noted = applyStateMutation({ ...createEmptyState(), groups: [noteGroup] }, noteMutation);
    const notedLocked = applyStateMutation(noted, {
      type: 'set-group-flags', id: noteGroup.id, locked: true, updatedAt: laterTimestamp,
    });
    expect(applyStateMutation(notedLocked, noteMutation)).toEqual(notedLocked);
    expect(() => applyStateMutation(notedLocked, { ...noteMutation, text: 'forged note' })).toThrowError(
      expect.objectContaining({ code: 'GROUP_LOCKED' }),
    );

    const first = group('replay-reorder-first');
    const second = group('replay-reorder-second');
    const third = { ...group('replay-reorder-unlisted'), updatedAt: '2025-12-31T00:00:00.000Z' };
    const reorderMutation: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
        archived: false,
      orderedGroupIds: [second.id, first.id],
      updatedAt: timestamp,
    };
    const reordered = applyStateMutation({ ...createEmptyState(), groups: [first, second, third] }, reorderMutation);
    const reorderedLocked = applyStateMutation(reordered, {
      type: 'set-group-flags', id: second.id, locked: true, updatedAt: laterTimestamp,
    });
    expect(applyStateMutation(reorderedLocked, reorderMutation)).toEqual(reorderedLocked);
    expect(() => applyStateMutation(reorderedLocked, {
      ...reorderMutation,
      orderedGroupIds: [first.id, second.id],
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));
    expect(() => applyStateMutation(reorderedLocked, {
      ...reorderMutation,
      orderedGroupIds: [second.id, first.id, third.id],
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));
    expect(() => applyStateMutation(reorderedLocked, {
      ...reorderMutation,
      orderedGroupIds: [second.id],
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));
    expect(() => applyStateMutation(reorderedLocked, {
      ...reorderMutation,
      updatedAt: laterTimestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));

    const singleFirst = { ...group('replay-single-first'), updatedAt: timestamp };
    const singleSecond = group('replay-single-second');
    const singleMutation: StateMutation = {
      type: 'reorder-groups',
      workspaceId: 'workspace_default',
      folderId: null,
      starred: false,
        archived: false,
      orderedGroupIds: [singleSecond.id],
      updatedAt: timestamp,
    };
    const singleReordered = applyStateMutation({
      ...createEmptyState(),
      groups: [singleFirst, singleSecond],
    }, singleMutation);
    const singleLocked = applyStateMutation(singleReordered, {
      type: 'set-group-flags', id: singleSecond.id, locked: true, updatedAt: laterTimestamp,
    });
    expect(applyStateMutation(singleLocked, singleMutation)).toEqual(singleLocked);
  });

  it('replays exact same-group tab moves after locking and rejects altered retries', () => {
    const first = tab('same-group-replay-first');
    const moved = tab('same-group-replay-moved');
    const last = tab('same-group-replay-last');
    const source = group('same-group-replay-source', 'workspace_default', [first, moved, last]);
    const before = { ...createEmptyState(), groups: [source] };
    const mutation: StateMutation = {
      type: 'move-tab',
      groupId: source.id,
      tabId: moved.id,
      targetGroupId: source.id,
      targetIndex: 0,
      updatedAt: '2026-07-18T00:00:01.000Z',
    };
    const once = applyStateMutation(before, mutation);
    expect(once.groups[0].tabs.map(({ id }) => id)).toEqual([moved.id, first.id, last.id]);
    expect(once.groups[0].tabs[0].updatedAt).toBe(mutation.updatedAt);
    const locked = applyStateMutation(once, {
      type: 'set-group-flags', id: source.id, locked: true, updatedAt: '2026-07-18T00:00:02.000Z',
    });
    const snapshot = structuredClone(locked);

    expect(applyStateMutation(locked, mutation)).toEqual(snapshot);
    for (const forged of [
      { ...mutation, targetIndex: 1 },
      { ...mutation, updatedAt: '2026-07-18T00:00:00.000Z' },
    ]) {
      expect(() => applyStateMutation(locked, forged)).toThrowError(
        expect.objectContaining({ code: 'GROUP_LOCKED' }),
      );
      expect(locked).toEqual(snapshot);
    }
  });

  it('replays exact move-tab mutations after source and target become locked', () => {
    const moved = tab('ordinary-replay-moved-tab');
    const source = group('ordinary-replay-source', 'workspace_default', [moved]);
    const target = group('ordinary-replay-destination');
    const before = { ...createEmptyState(), groups: [source, target] };
    const mutation: StateMutation = {
      type: 'move-tab', groupId: source.id, tabId: moved.id, targetGroupId: target.id, targetIndex: 0, updatedAt: timestamp,
    };
    const once = applyStateMutation(before, mutation);
    const locked = applyStateMutation(once, {
      type: 'set-group-flags', id: target.id, locked: true, updatedAt: timestamp,
    });
    expect(applyStateMutation(locked, mutation)).toEqual(locked);
  });

  it('replays exact drop ledger and stable-generated operations after later locking', () => {
    const openTab = {
      id: 301,
      windowId: 7,
      title: 'Replay open tab',
      url: 'https://replay-open.test',
      favIconUrl: '',
      pinned: false,
      index: 0,
      browserGroup: null,
      storable: true,
      reason: null,
    };
    const target = group('drop-replay-locked-target');
    const mutation: StateMutation = {
      type: 'drop-intent',
      operationId: 'drop-replay-ledger',
      expectedRevision: 0,
      intent: { kind: 'copy-open-tabs', tabIds: [openTab.id], windowId: openTab.windowId, targetGroupId: target.id, targetIndex: 0, workspaceId: 'workspace_default' },
      openTabs: [openTab],
      updatedAt: timestamp,
    };
    const once = applyStateMutation({ ...createEmptyState(), groups: [target] }, mutation);
    const locked = applyStateMutation(once, {
      type: 'set-group-flags', id: target.id, locked: true, updatedAt: timestamp,
    });
    expect(applyStateMutation(locked, mutation)).toEqual(locked);

    const stableReplayState = { ...locked, dropOperationLedger: [] };
    expect(applyStateMutation(stableReplayState, mutation)).toEqual(stableReplayState);
    expect(() => applyStateMutation(stableReplayState, {
      ...mutation,
      openTabs: [{ ...openTab, url: 'https://altered.test' }],
    })).toThrowError(InvalidDropMutationError);
  });

  it('rejects explicit undefined and unknown locked-group flag fields', () => {
    const locked = { ...group('strict-unlock-target'), locked: true };
    const state = { ...createEmptyState(), groups: [locked] };
    const explicitUndefined = [
      { type: 'set-group-flags' as const, id: locked.id, locked: false, starred: undefined, updatedAt: timestamp },
      { type: 'set-group-flags' as const, id: locked.id, locked: false, collapsed: undefined, updatedAt: timestamp },
    ];
    explicitUndefined.forEach((mutation) => {
      expect(isStateMutation(mutation)).toBe(true);
      expect(() => applyStateMutation(state, mutation)).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));
    });
    const unknown = { type: 'set-group-flags', id: locked.id, locked: false, unexpected: true, updatedAt: timestamp };
    expect(isStateMutation(unknown)).toBe(false);
    expect(() => applyStateMutation(state, unknown as never)).toThrow('Invalid state mutation.');
  });

  it('surfaces structured URL errors for raw full TabItems', () => {
    const target = group('raw-url-error-target');
    const emptyLink = { ...tab('raw-url-error-link'), url: '' };
    const nonEmptyNote = { ...tab('raw-url-error-note', 'note'), url: 'https://invalid-note.test' };
    const mutations: unknown[] = [
      { type: 'add-tab', groupId: target.id, tab: emptyLink, updatedAt: timestamp },
      { type: 'add-group', group: { ...group('raw-url-error-group', 'workspace_default', [nonEmptyNote]) }, updatedAt: timestamp },
      { type: 'prepend-groups', groups: [{ ...group('raw-url-error-prepend', 'workspace_default', [emptyLink]) }], updatedAt: timestamp },
      { type: 'import-groups', groups: [{ ...group('raw-url-error-import', 'workspace_default', [nonEmptyNote]) }], updatedAt: timestamp },
      { type: 'restore-group', entryId: 'raw-url-error-group-bin', group: { ...group('raw-url-error-restore', 'workspace_default', [emptyLink]) }, index: 0, updatedAt: timestamp },
      { type: 'restore-tab', entryId: 'raw-url-error-tab-bin', groupId: target.id, tab: nonEmptyNote, index: 0, updatedAt: timestamp },
      { type: 'delete-tab', groupId: target.id, tabId: emptyLink.id, binEntry: {
        id: 'raw-url-error-tab-bin', kind: 'tab', label: emptyLink.title, groupId: target.id, groupTitle: target.title,
        source: 'group', item: emptyLink, deletedAt: timestamp, originalGroupId: target.id,
        originalWorkspaceId: target.workspaceId, originalFolderId: target.folderId,
      }, updatedAt: timestamp },
    ];
    const state = { ...createEmptyState(), groups: [target] };
    mutations.forEach((mutation) => {
      expect(isStateMutation(mutation)).toBe(false);
      expect(() => applyStateMutation(state, mutation as never)).toThrowError(
        expect.objectContaining({ code: 'TAB_URL_INVALID' }),
      );
    });
  });

  it('rejects moves that change locked sibling placement but allows immaterial moves', () => {
    const moving = group('placement-moving');
    const locked = { ...group('placement-locked'), locked: true };
    const sameCategory = { ...createEmptyState(), groups: [moving, locked] };
    expect(() => applyStateMutation(sameCategory, {
      type: 'move-group', groupId: moving.id, targetFolderId: null, starred: false, archived: false, index: 1, updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));

    const valid = { ...createEmptyState(), groups: [locked, moving] };
    expect(applyStateMutation(valid, {
      type: 'move-group', groupId: moving.id, targetFolderId: null, starred: false, archived: false, index: 1, updatedAt: timestamp,
    }).groups.map(({ id }) => id)).toEqual([locked.id, moving.id]);

    const folderA = folder('placement-folder-a');
    const crossCategory = { ...createEmptyState(), folders: [folderA], groups: [moving, locked] };
    expect(() => applyStateMutation(crossCategory, {
      type: 'move-group', groupId: moving.id, targetFolderId: folderA.id, starred: false, archived: false, index: 0, updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));

    const dropState = { ...createEmptyState(), groups: [moving, locked] };
    expect(() => applyStateMutation(dropState, {
      type: 'drop-intent', expectedRevision: 0, operationId: 'placement-drop',
      intent: { kind: 'move-session', groupId: moving.id, category: 'inbox', index: 1, workspaceId: 'workspace_default' },
      openTabs: [], updatedAt: timestamp,
    })).toThrowError(InvalidDropMutationError);
  });

  it('rejects placement-capable ordinary mutations that shift locked siblings', () => {
    const folderA = folder('placement-capable-folder');
    const otherWorkspace = {
      ...createEmptyState().workspaces[0],
      id: 'placement-capable-other-workspace',
      name: 'Other',
    };
    const locked = { ...group('placement-capable-locked'), locked: true };
    const moving = group('placement-capable-moving');
    const base = {
      ...createEmptyState(),
      workspaces: [...createEmptyState().workspaces, otherWorkspace],
      folders: [folderA],
      groups: [moving, locked],
    };

    expect(() => applyStateMutation(base, {
      type: 'set-group-flags', id: moving.id, starred: true, updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));
    expect(() => applyStateMutation(base, {
      type: 'update-group', id: moving.id, updates: { folderId: folderA.id }, updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));
    expect(() => applyStateMutation(base, {
      type: 'update-group', id: moving.id, updates: { starred: true }, updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));
    expect(() => applyStateMutation(base, {
      type: 'update-group', id: moving.id, updates: { workspaceId: otherWorkspace.id }, updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));

    expect(applyStateMutation(base, {
      type: 'update-group', id: moving.id, updates: { title: 'renamed' }, updatedAt: timestamp,
    }).groups.find(({ id }) => id === moving.id)?.title).toBe('renamed');
    expect(() => applyStateMutation(base, {
      type: 'update-group', id: locked.id, updates: { title: 'forbidden' }, updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));
  });

  it('deletes only same-workspace folder placements when stale IDs cross workspaces', () => {
    const target = folder('workspace-scoped-delete-folder');
    const otherWorkspace: Workspace = {
      ...createEmptyState().workspaces[0],
      id: 'workspace-other-delete',
      name: 'Other',
    };
    const local = {
      ...group('workspace-scoped-local'),
      folderId: target.id,
    };
    const staleLocked = {
      ...group('workspace-scoped-stale', otherWorkspace.id),
      folderId: target.id,
      locked: true,
    };
    const before: TabBoardState = {
      ...createEmptyState(),
      workspaces: [...createEmptyState().workspaces, otherWorkspace],
      folders: [target],
      groups: [local, staleLocked],
    };

    const after = applyStateMutation(before, {
      type: 'delete-folder',
      id: target.id,
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(after.folders).toEqual([]);
    expect(after.groups.find(({ id }) => id === local.id)).toMatchObject({
      folderId: null,
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(after.groups.find(({ id }) => id === staleLocked.id)).toEqual(
      staleLocked,
    );
  });

  it('replays a locked create-session after ledger eviction and rejects altered input', () => {
    const openTab = {
      id: 401,
      windowId: 11,
      title: 'Generated replay tab',
      url: 'https://generated-replay.test',
      favIconUrl: '',
      pinned: false,
      index: 0,
      browserGroup: null,
      storable: true,
      reason: null,
    };
    const mutation: StateMutation = {
      type: 'drop-intent',
      operationId: 'generated-session-lock-replay',
      expectedRevision: 0,
      intent: {
        kind: 'create-session',
        source: { kind: 'open-tabs', tabIds: [openTab.id], windowId: openTab.windowId },
        category: 'inbox',
        index: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [openTab],
      updatedAt: timestamp,
    };
    const once = applyStateMutation(createEmptyState(), mutation);
    const generated = once.groups.find((group) => group.id === 'drop_generated-session-lock-replay_group');
    if (!generated) throw new Error('Generated session missing.');
    const locked = applyStateMutation(once, {
      type: 'set-group-flags', id: generated.id, locked: true, updatedAt: timestamp,
    });
    const evicted = { ...locked, dropOperationLedger: [] };

    expect(applyStateMutation(evicted, mutation)).toEqual(evicted);
    expect(() => applyStateMutation(evicted, {
      ...mutation,
      openTabs: [{ ...openTab, url: 'https://forged-generated-replay.test' }],
    })).toThrowError(InvalidDropMutationError);
  });

  it('returns TAB_URL_INVALID for raw set-group-note tabs', () => {
    const target = group('raw-group-note-url-target');
    const state = { ...createEmptyState(), groups: [target] };
    const cases = [
      { ...tab('raw-group-note-link'), url: '' },
      { ...tab('raw-group-note-note', 'note'), url: 'https://invalid-note.test' },
    ];

    cases.forEach((noteTab) => {
      const mutation = {
        type: 'set-group-note' as const,
        groupId: target.id,
        text: 'note text',
        noteTab,
        updatedAt: timestamp,
      };
      expect(isStateMutation(mutation)).toBe(true);
      expect(() => applyStateMutation(state, mutation)).toThrowError(
        expect.objectContaining({ code: 'TAB_URL_INVALID' }),
      );
    });
  });

  it('rejects ordinary group insertions, removals, and cleanup that shift locked siblings', () => {
    const locked = { ...group('placement-gap-locked'), locked: true };
    const unlocked = group('placement-gap-unlocked');
    const folderA = folder('placement-gap-folder');
    const base = {
      ...createEmptyState(),
      folders: [folderA],
      groups: [unlocked, locked],
    };

    expect(() => applyStateMutation(base, {
      type: 'delete-group',
      id: unlocked.id,
      binEntry: groupBinEntry(unlocked, 'placement-gap-delete-bin'),
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));

    expect(() => applyStateMutation({
      ...base,
      groups: [{ ...unlocked, folderId: folderA.id }, locked],
    }, {
      type: 'delete-folder',
      id: folderA.id,
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));

    expect(() => applyStateMutation({ ...createEmptyState(), groups: [locked] }, {
      type: 'prepend-groups',
      groups: [unlocked],
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));

    const restored = group('placement-gap-restored');
    const restoreEntry = groupBinEntry(restored, 'placement-gap-restore-bin');
    expect(() => applyStateMutation({ ...createEmptyState(), groups: [locked], bin: [restoreEntry] }, {
      type: 'restore-group',
      entryId: restoreEntry.id,
      group: restored,
      index: 0,
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));

    const removableTab = tab('placement-gap-removable-tab');
    const removable = { ...unlocked, tabs: [removableTab] };
    expect(() => applyStateMutation({ ...createEmptyState(), groups: [removable, locked] }, {
      type: 'remove-restored-refs',
      refs: [{ source: 'group', groupId: removable.id, tabId: removableTab.id }],
      updatedAt: timestamp,
    })).toThrowError(expect.objectContaining({ code: 'GROUP_LOCKED' }));
  });
});
