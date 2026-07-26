import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyStateMutations, type StateMutation } from './stateMutations';
import { getDropOperationDigest } from '../../manager/core/commands';
import { createEmptyState, type Group, type TabBoardState, type BinEntry, type TabItem } from '../model';
import { persistedSnapshot, useTabBoardStore } from './useTabBoardStore';

const timestamp = '2026-01-01T00:00:00.000Z';

function group(id: string, workspaceId = 'workspace_default', overrides: Partial<Group> = {}): Group {
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

afterEach(() => {
  useTabBoardStore.getState().releaseHydration();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('TabBoard store remote persistence reconciliation', () => {
  it('preserves current-workspace entity references for an authoritative write in another workspace', async () => {
    const workspaceA = {
      id: 'workspace-a',
      name: 'A',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const workspaceB = {
      id: 'workspace-b',
      name: 'B',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const folderA = {
      id: 'folder-a',
      name: 'Folder A',
      color: 'slate',
      workspaceId: 'workspace-a',
      collapsed: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    let stored: TabBoardState = {
      ...createEmptyState(),
      workspaces: [workspaceA, workspaceB],
      activeWorkspaceId: 'workspace-a',
      folders: [folderA],
      groups: [group('group-a', 'workspace-a'), group('group-b', 'workspace-b')],
    };
    const listeners: Array<(changes: Record<string, { newValue: TabBoardState }>, area: string) => void> = [];
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn(async () => ({ ok: true, result: structuredClone(stored) })),
      },
      storage: {
        local: { get: vi.fn(async () => ({ tabboardState: structuredClone(stored) })) },
        onChanged: {
          addListener: (listener: (changes: Record<string, { newValue: TabBoardState }>, area: string) => void) => {
            listeners.push(listener);
          },
          removeListener: vi.fn(),
        },
      },
    });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    await useTabBoardStore.getState().hydrate();
    const before = useTabBoardStore.getState();
    const currentGroup = before.groups.find(({ id }) => id === 'group-a');
    const currentFolder = before.folders.find(({ id }) => id === 'folder-a');
    const currentWorkspace = before.workspaces.find(({ id }) => id === 'workspace-a');

    stored = {
      ...stored,
      mutationRevision: stored.mutationRevision + 1,
      groups: stored.groups.map((item) => item.id === 'group-b'
        ? { ...item, title: 'Remote workspace B update' }
        : item),
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    listeners.forEach((listener) => listener({
      tabboardState: { newValue: structuredClone(stored) },
    }, 'local'));

    const after = useTabBoardStore.getState();
    expect(after.groups.find(({ id }) => id === 'group-a')).toBe(currentGroup);
    expect(after.folders.find(({ id }) => id === 'folder-a')).toBe(currentFolder);
    expect(after.workspaces.find(({ id }) => id === 'workspace-a')).toBe(currentWorkspace);
    expect(after.groups.find(({ id }) => id === 'group-b')?.title).toBe('Remote workspace B update');
  });

  it('keeps newer remote storage state observed during an in-flight RPC', async () => {
    let stored: TabBoardState = applyStateMutations(createEmptyState(), [{
      type: 'add-group',
      group: group('local-group'),
      updatedAt: timestamp,
    }]);
    const listeners: Array<(changes: Record<string, { newValue: TabBoardState }>, area: string) => void> = [];
    let sentMutations: StateMutation[] | undefined;
    let resolveRpc: ((response: unknown) => void) | undefined;
    const chromeMock = {
      runtime: {
        sendMessage: vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
          if (message.type === 'tabboard-ensure-state') {
            return Promise.resolve({ ok: true, result: structuredClone(stored) });
          }
          sentMutations = message.mutations;
          return new Promise((resolve) => {
            resolveRpc = resolve;
          });
        }),
      },
      storage: {
        local: {
          get: vi.fn(async () => ({ tabboardState: structuredClone(stored) })),
          set: vi.fn(async (value: { tabboardState: TabBoardState }) => {
            stored = structuredClone(value.tabboardState);
          }),
        },
        onChanged: {
          addListener: (listener: (changes: Record<string, { newValue: TabBoardState }>, area: string) => void) => {
            listeners.push(listener);
          },
          removeListener: vi.fn(),
        },
      },
    };
    vi.stubGlobal('chrome', chromeMock);
    const { useTabBoardStore } = await import('./useTabBoardStore');

    await useTabBoardStore.getState().hydrate();
    useTabBoardStore.getState().updateSettings({ theme: 'dark' });
    const addFolderPromise = useTabBoardStore.getState().addFolder('workspace_default', 'Work');
    await vi.waitFor(() => expect(sentMutations).toBeDefined());

    const remoteState: TabBoardState = {
      ...stored,
      mutationRevision: stored.mutationRevision + 3,
      groups: [group('remote-group')],
      updatedAt: '9999-01-01T00:00:00.000Z',
    };
    expect(listeners).toHaveLength(1);
    listeners.forEach((listener) => listener({ tabboardState: { newValue: remoteState } }, 'local'));

    const mutations = sentMutations;
    const respond = resolveRpc;
    if (!mutations || !respond) throw new Error('Mutation RPC was not started.');
    const authoritative = applyStateMutations(stored, mutations);
    respond({ ok: true, result: authoritative });
    await addFolderPromise;

    const result = useTabBoardStore.getState();
    expect(result.groups.map(({ id }) => id)).toEqual(['remote-group']);
    expect(result.folders.map(({ name }) => name)).toEqual(['Work']);
    expect(result.settings.theme).toBe('dark');
  });

  it('does not replay committed settings when the worker authoritative result is the reconciliation base', async () => {
    vi.useFakeTimers();
    let stored: TabBoardState = {
      ...createEmptyState(),
      groups: [group('drop-source')],
    };
    const sentBatches: StateMutation[][] = [];
    const authoritativeUpdatedAt = '2026-01-02T00:00:00.000Z';
    const sendMessage = vi.fn(async (message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return { ok: true, result: structuredClone(stored) };
      }
      const mutations = message.mutations || [];
      sentBatches.push(structuredClone(mutations));
      const base = mutations[0]?.type === 'drop-intent' && mutations[0].expectedRevision !== stored.mutationRevision
        ? { ...stored, mutationRevision: mutations[0].expectedRevision }
        : stored;
      const next = applyStateMutations(base, mutations);
      stored = { ...next, updatedAt: authoritativeUpdatedAt };
      return { ok: true, result: structuredClone(stored) };
    });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: {
        local: { get: vi.fn(async () => ({ tabboardState: structuredClone(stored) })) },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    await useTabBoardStore.getState().hydrate();

    useTabBoardStore.getState().updateSettings({ theme: 'dark' });
    const firstDrop = useTabBoardStore.getState().applyDropIntent({
      kind: 'move-session',
      groupId: 'drop-source',
      category: 'saved',
      index: 0,
      workspaceId: 'workspace_default',
    });
    await vi.advanceTimersByTimeAsync(100);
    await firstDrop;

    expect(useTabBoardStore.getState().updatedAt).toBe(authoritativeUpdatedAt);
    expect(useTabBoardStore.getState().mutationRevision).toBe(2);

    const secondDrop = useTabBoardStore.getState().applyDropIntent({
      kind: 'move-session',
      groupId: 'drop-source',
      category: 'inbox',
      index: 0,
      workspaceId: 'workspace_default',
    });
    await vi.advanceTimersByTimeAsync(100);
    await secondDrop;

    expect(sentBatches[1]?.[0]).toMatchObject({ type: 'drop-intent', expectedRevision: 2 });
  });

  it.each([false, true])('does not replay a committed drop onto newer remote state after ledger eviction (authoritative ledger evicted: %s)', async (evictCommittedLedger: boolean) => {
    let stored: TabBoardState = {
      ...createEmptyState(),
      groups: [group('drop-source')],
    };
    const listeners: Array<(changes: Record<string, { newValue: TabBoardState }>, area: string) => void> = [];
    let sentMutations: StateMutation[] | undefined;
    let resolveRpc: ((response: unknown) => void) | undefined;
    const chromeMock = {
      runtime: {
        sendMessage: vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
          if (message.type === 'tabboard-ensure-state') return Promise.resolve({ ok: true, result: structuredClone(stored) });
          sentMutations = message.mutations;
          return new Promise((resolve) => { resolveRpc = resolve; });
        }),
      },
      storage: {
        local: { get: vi.fn(async () => ({ tabboardState: structuredClone(stored) })) },
        onChanged: {
          addListener: (listener: (changes: Record<string, { newValue: TabBoardState }>, area: string) => void) => { listeners.push(listener); },
          removeListener: vi.fn(),
        },
      },
    };
    vi.stubGlobal('chrome', chromeMock);
    const { useTabBoardStore } = await import('./useTabBoardStore');
    await useTabBoardStore.getState().hydrate();
    const persistencePromise = useTabBoardStore.getState().applyDropIntent({
      kind: 'move-session',
      groupId: 'drop-source',
      category: 'saved',
      index: 0,
      workspaceId: 'workspace_default',
    });
    await vi.waitFor(() => expect(sentMutations).toBeDefined());

    const mutations = sentMutations;
    const respond = resolveRpc;
    if (!mutations || !respond) throw new Error('Mutation RPC was not started.');
    const authoritative = applyStateMutations(stored, mutations);
    const authoritativeResponse = evictCommittedLedger
      ? {
        ...authoritative,
        dropOperationLedger: Array.from({ length: 128 }, (_, index) => ({
          operationId: `authoritative-later-${index}`,
          digest: `authoritative-digest-${index}`,
          appliedAt: timestamp,
        })),
      }
      : authoritative;
    const remoteState: TabBoardState = {
      ...stored,
      mutationRevision: authoritative.mutationRevision + 1,
      groups: [group('drop-source')],
      dropOperationLedger: Array.from({ length: 128 }, (_, index) => ({
        operationId: `later-${index}`,
        digest: `digest-${index}`,
        appliedAt: timestamp,
      })),
      updatedAt: timestamp,
    };
    listeners.forEach((listener) => listener({ tabboardState: { newValue: remoteState } }, 'local'));
    respond({ ok: true, result: authoritativeResponse });
    await persistencePromise;

    expect(useTabBoardStore.getState().groups.find(({ id }) => id === 'drop-source')?.starred).toBe(false);
  });

  it('preserves concurrent entities while replaying committed category order', async () => {
    let stored: TabBoardState = {
      ...createEmptyState(),
      groups: [group('local-group')],
      categoryOrderByWorkspace: { workspace_default: ['inbox', 'saved', 'archive'] },
    };
    const listeners: Array<(changes: Record<string, { newValue: TabBoardState }>, area: string) => void> = [];
    let sentMutations: StateMutation[] | undefined;
    let resolveRpc: ((response: unknown) => void) | undefined;
    const chromeMock = {
      runtime: {
        sendMessage: vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
          if (message.type === 'tabboard-ensure-state') return Promise.resolve({ ok: true, result: structuredClone(stored) });
          sentMutations = message.mutations;
          return new Promise((resolve) => { resolveRpc = resolve; });
        }),
      },
      storage: {
        local: { get: vi.fn(async () => ({ tabboardState: structuredClone(stored) })) },
        onChanged: {
          addListener: (listener: (changes: Record<string, { newValue: TabBoardState }>, area: string) => void) => { listeners.push(listener); },
          removeListener: vi.fn(),
        },
      },
    };
    vi.stubGlobal('chrome', chromeMock);
    const { useTabBoardStore } = await import('./useTabBoardStore');
    await useTabBoardStore.getState().hydrate();
    const orderPromise = useTabBoardStore.getState().updateCategoryOrder('workspace_default', ['saved', 'inbox']);
    await vi.waitFor(() => expect(sentMutations).toBeDefined());

    const remoteState: TabBoardState = {
      ...stored,
      mutationRevision: stored.mutationRevision + 1,
      groups: [group('remote-group')],
      categoryOrderByWorkspace: { workspace_default: ['inbox', 'saved', 'archive'] },
      updatedAt: '9999-01-01T00:00:00.000Z',
    };
    listeners.forEach((listener) => listener({ tabboardState: { newValue: remoteState } }, 'local'));
    const mutations = sentMutations;
    const respond = resolveRpc;
    if (!mutations || !respond) throw new Error('Mutation RPC was not started.');
    respond({ ok: true, result: applyStateMutations(stored, mutations) });
    await orderPromise;

    const result = useTabBoardStore.getState();
    expect(result.categoryOrderByWorkspace.workspace_default).toEqual(['saved', 'inbox', 'archive']);
    expect(result.groups.map(({ id }) => id)).toEqual(['remote-group']);
    expect(result.mutationRevision).toBe(remoteState.mutationRevision);
  });

  it('replays a committed group rename onto the latest remote group fields', async () => {
    let stored: TabBoardState = {
      ...createEmptyState(),
      groups: [group('rename-target', 'workspace_default', { title: 'Before' })],
    };
    const listeners: Array<(changes: Record<string, { newValue: TabBoardState }>, area: string) => void> = [];
    let sentMutations: StateMutation[] | undefined;
    let resolveRpc: ((response: unknown) => void) | undefined;
    const chromeMock = {
      runtime: {
        sendMessage: vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
          if (message.type === 'tabboard-ensure-state') return Promise.resolve({ ok: true, result: structuredClone(stored) });
          sentMutations = message.mutations;
          return new Promise((resolve) => { resolveRpc = resolve; });
        }),
      },
      storage: {
        local: { get: vi.fn(async () => ({ tabboardState: structuredClone(stored) })) },
        onChanged: {
          addListener: (listener: (changes: Record<string, { newValue: TabBoardState }>, area: string) => void) => { listeners.push(listener); },
          removeListener: vi.fn(),
        },
      },
    };
    vi.stubGlobal('chrome', chromeMock);
    const { useTabBoardStore } = await import('./useTabBoardStore');
    await useTabBoardStore.getState().hydrate();
    useTabBoardStore.getState().updateGroup('rename-target', { title: 'Renamed' });
    await vi.waitFor(() => expect(sentMutations).toBeDefined());

    const remoteState: TabBoardState = {
      ...stored,
      mutationRevision: stored.mutationRevision + 1,
      groups: [group('rename-target', 'workspace_default', { title: 'Before', collapsed: true })],
      updatedAt: '9999-01-01T00:00:00.000Z',
    };
    listeners.forEach((listener) => listener({ tabboardState: { newValue: remoteState } }, 'local'));
    const mutations = sentMutations;
    const respond = resolveRpc;
    if (!mutations || !respond) throw new Error('Mutation RPC was not started.');
    respond({ ok: true, result: applyStateMutations(stored, mutations) });
    await vi.waitFor(() => expect(useTabBoardStore.getState().groups[0]).toMatchObject({ title: 'Renamed', collapsed: true }));

    expect(useTabBoardStore.getState().groups[0]).toMatchObject({ title: 'Renamed', collapsed: true });
  });

  it('replays a committed folder rename onto the latest remote folder fields', async () => {
    let stored: TabBoardState = {
      ...createEmptyState(),
      folders: [{
        id: 'folder-target', name: 'Before', color: 'slate', workspaceId: 'workspace_default',
        collapsed: false, createdAt: timestamp, updatedAt: timestamp,
      }],
    };
    const listeners: Array<(changes: Record<string, { newValue: TabBoardState }>, area: string) => void> = [];
    let sentMutations: StateMutation[] | undefined;
    let resolveRpc: ((response: unknown) => void) | undefined;
    const chromeMock = {
      runtime: {
        sendMessage: vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
          if (message.type === 'tabboard-ensure-state') return Promise.resolve({ ok: true, result: structuredClone(stored) });
          sentMutations = message.mutations;
          return new Promise((resolve) => { resolveRpc = resolve; });
        }),
      },
      storage: {
        local: { get: vi.fn(async () => ({ tabboardState: structuredClone(stored) })) },
        onChanged: {
          addListener: (listener: (changes: Record<string, { newValue: TabBoardState }>, area: string) => void) => { listeners.push(listener); },
          removeListener: vi.fn(),
        },
      },
    };
    vi.stubGlobal('chrome', chromeMock);
    const { useTabBoardStore } = await import('./useTabBoardStore');
    await useTabBoardStore.getState().hydrate();
    const renamePromise = useTabBoardStore.getState().renameFolder('folder-target', 'Renamed');
    await vi.waitFor(() => expect(sentMutations).toBeDefined());

    const remoteState: TabBoardState = {
      ...stored,
      mutationRevision: stored.mutationRevision + 1,
      folders: [{ ...stored.folders[0], collapsed: true }],
      updatedAt: '9999-01-01T00:00:00.000Z',
    };
    listeners.forEach((listener) => listener({ tabboardState: { newValue: remoteState } }, 'local'));
    const mutations = sentMutations;
    const respond = resolveRpc;
    if (!mutations || !respond) throw new Error('Mutation RPC was not started.');
    respond({ ok: true, result: applyStateMutations(stored, mutations) });
    await renamePromise;

    expect(useTabBoardStore.getState().folders[0]).toMatchObject({ name: 'Renamed', collapsed: true });
  });

  it('replays a committed cross-entity tab move without losing a remote target tab', async () => {
    let stored: TabBoardState = {
      ...createEmptyState(),
      groups: [
        group('move-source', 'workspace_default', { tabs: [tab('move-tab')] }),
        group('move-target'),
      ],
    };
    const listeners: Array<(changes: Record<string, { newValue: TabBoardState }>, area: string) => void> = [];
    let sentMutations: StateMutation[] | undefined;
    let resolveRpc: ((response: unknown) => void) | undefined;
    const chromeMock = {
      runtime: {
        sendMessage: vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
          if (message.type === 'tabboard-ensure-state') return Promise.resolve({ ok: true, result: structuredClone(stored) });
          sentMutations = message.mutations;
          return new Promise((resolve) => { resolveRpc = resolve; });
        }),
      },
      storage: {
        local: { get: vi.fn(async () => ({ tabboardState: structuredClone(stored) })) },
        onChanged: {
          addListener: (listener: (changes: Record<string, { newValue: TabBoardState }>, area: string) => void) => { listeners.push(listener); },
          removeListener: vi.fn(),
        },
      },
    };
    vi.stubGlobal('chrome', chromeMock);
    const { useTabBoardStore } = await import('./useTabBoardStore');
    await useTabBoardStore.getState().hydrate();
    useTabBoardStore.getState().moveTab('move-source', 'move-tab', 'move-target', 0);
    await vi.waitFor(() => expect(sentMutations).toBeDefined());

    const remoteState: TabBoardState = {
      ...stored,
      mutationRevision: stored.mutationRevision + 1,
      groups: [
        group('move-source', 'workspace_default', { tabs: [tab('move-tab')] }),
        group('move-target', 'workspace_default', { tabs: [tab('remote-target-tab')] }),
      ],
      updatedAt: '9999-01-01T00:00:00.000Z',
    };
    listeners.forEach((listener) => listener({ tabboardState: { newValue: remoteState } }, 'local'));
    const mutations = sentMutations;
    const respond = resolveRpc;
    if (!mutations || !respond) throw new Error('Mutation RPC was not started.');
    respond({ ok: true, result: applyStateMutations(stored, mutations) });
    await vi.waitFor(() => expect(useTabBoardStore.getState().groups.find(({ id }) => id === 'move-target')?.tabs).toHaveLength(2));

    expect(useTabBoardStore.getState().groups.find(({ id }) => id === 'move-target')?.tabs.map(({ id }) => id)).toEqual([
      'move-tab',
      'remote-target-tab',
    ]);
  });

  it('preserves unrelated settings while replaying a partial settings mutation', async () => {
    let stored: TabBoardState = createEmptyState();
    const listeners: Array<(changes: Record<string, { newValue: TabBoardState }>, area: string) => void> = [];
    let sentMutations: StateMutation[] | undefined;
    let resolveRpc: ((response: unknown) => void) | undefined;
    const chromeMock = {
      runtime: {
        sendMessage: vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
          if (message.type === 'tabboard-ensure-state') return Promise.resolve({ ok: true, result: structuredClone(stored) });
          sentMutations = message.mutations;
          return new Promise((resolve) => { resolveRpc = resolve; });
        }),
      },
      storage: {
        local: { get: vi.fn(async () => ({ tabboardState: structuredClone(stored) })) },
        onChanged: {
          addListener: (listener: (changes: Record<string, { newValue: TabBoardState }>, area: string) => void) => { listeners.push(listener); },
          removeListener: vi.fn(),
        },
      },
    };
    vi.stubGlobal('chrome', chromeMock);
    const { useTabBoardStore } = await import('./useTabBoardStore');
    await useTabBoardStore.getState().hydrate();
    useTabBoardStore.getState().updateSettings({ theme: 'dark' });
    await vi.waitFor(() => expect(sentMutations).toBeDefined());

    const remoteState: TabBoardState = {
      ...stored,
      mutationRevision: stored.mutationRevision + 1,
      settings: { ...stored.settings, closeTabsAfterSave: false },
      updatedAt: '9999-01-01T00:00:00.000Z',
    };
    listeners.forEach((listener) => listener({ tabboardState: { newValue: remoteState } }, 'local'));
    const mutations = sentMutations;
    const respond = resolveRpc;
    if (!mutations || !respond) throw new Error('Mutation RPC was not started.');
    respond({ ok: true, result: applyStateMutations(stored, mutations) });
    await vi.waitFor(() => expect(useTabBoardStore.getState().settings.closeTabsAfterSave).toBe(false));

    expect(useTabBoardStore.getState().settings.theme).toBe('dark');
  });

  it('reconciles cross-entity moves while preserving unrelated remote groups', async () => {
    let stored: TabBoardState = {
      ...createEmptyState(),
      groups: [
        group('move-source', 'workspace_default', { tabs: [tab('move-tab')] }),
        group('move-target'),
      ],
    };
    const listeners: Array<(changes: Record<string, { newValue: TabBoardState }>, area: string) => void> = [];
    let sentMutations: StateMutation[] | undefined;
    let resolveRpc: ((response: unknown) => void) | undefined;
    const chromeMock = {
      runtime: {
        sendMessage: vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
          if (message.type === 'tabboard-ensure-state') return Promise.resolve({ ok: true, result: structuredClone(stored) });
          sentMutations = message.mutations;
          return new Promise((resolve) => { resolveRpc = resolve; });
        }),
      },
      storage: {
        local: { get: vi.fn(async () => ({ tabboardState: structuredClone(stored) })) },
        onChanged: {
          addListener: (listener: (changes: Record<string, { newValue: TabBoardState }>, area: string) => void) => { listeners.push(listener); },
          removeListener: vi.fn(),
        },
      },
    };
    vi.stubGlobal('chrome', chromeMock);
    const { useTabBoardStore } = await import('./useTabBoardStore');
    await useTabBoardStore.getState().hydrate();
    useTabBoardStore.getState().moveTab('move-source', 'move-tab', 'move-target', 0);
    await vi.waitFor(() => expect(sentMutations).toBeDefined());

    const remoteState: TabBoardState = {
      ...stored,
      mutationRevision: stored.mutationRevision + 1,
      groups: [...stored.groups, group('remote-unrelated')],
      updatedAt: '9999-01-01T00:00:00.000Z',
    };
    listeners.forEach((listener) => listener({ tabboardState: { newValue: remoteState } }, 'local'));
    const mutations = sentMutations;
    const respond = resolveRpc;
    if (!mutations || !respond) throw new Error('Mutation RPC was not started.');
    respond({ ok: true, result: applyStateMutations(stored, mutations) });
    await vi.waitFor(() => expect(useTabBoardStore.getState().groups.map(({ id }) => id)).toContain('remote-unrelated'));

    const result = useTabBoardStore.getState();
    expect(result.groups.map(({ id }) => id)).toContain('remote-unrelated');
    expect(result.groups.find((group) => group.id === 'move-source')?.tabs).toHaveLength(0);
    expect(result.groups.find((group) => group.id === 'move-target')?.tabs.map(({ id }) => id)).toEqual(['move-tab']);
  });

  it('returns a drop promise that waits for worker persistence', async () => {
    vi.useFakeTimers();
    const persisted: TabBoardState = {
      ...createEmptyState(),
      groups: [group('drop-source')],
    };
    let resolveRpc: ((response: unknown) => void) | undefined;
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: structuredClone(persisted) });
      }
      return new Promise((resolve) => { resolveRpc = resolve; });
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...persisted, hydrated: true, persistenceError: null });

    const persistencePromise = useTabBoardStore.getState().applyDropIntent({
      kind: 'move-session',
      groupId: 'drop-source',
      category: 'saved',
      index: 0,
      workspaceId: 'workspace_default',
    });
    vi.advanceTimersByTime(100);
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));

    let settled = false;
    void persistencePromise.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    const request = sendMessage.mock.calls[0]?.[0];
    resolveRpc?.({
      ok: true,
      result: applyStateMutations(persisted, request?.mutations || []),
    });
    await expect(persistencePromise).resolves.toBeUndefined();
  });

  it('keeps a drop promise pending through transient retry recovery', async () => {
    vi.useFakeTimers();
    const persisted: TabBoardState = {
      ...createEmptyState(),
      groups: [group('retry-drop-source')],
    };
    let attempts = 0;
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: structuredClone(persisted) });
      }
      attempts += 1;
      if (attempts === 1) return Promise.reject(new Error('temporary drop failure'));
      return Promise.resolve({
        ok: true,
        result: applyStateMutations(persisted, message.mutations || []),
      });
    });
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...persisted, hydrated: true, persistenceError: null });

    const persistencePromise = useTabBoardStore.getState().applyDropIntent({
      kind: 'move-session',
      groupId: 'retry-drop-source',
      category: 'saved',
      index: 0,
      workspaceId: 'workspace_default',
    });
    vi.advanceTimersByTime(100);
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(dispatchEvent).not.toHaveBeenCalled();

    let settled = false;
    void persistencePromise.then(() => { settled = true; }, () => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(250);
    await expect(persistencePromise).resolves.toBeUndefined();
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('does not emit a generic error for a drop after retries are exhausted', async () => {
    vi.useFakeTimers();
    const persisted: TabBoardState = {
      ...createEmptyState(),
      groups: [group('failed-drop-source')],
    };
    const dispatchEvent = vi.fn();
    const sendMessage = vi.fn((message: { type: string }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: structuredClone(persisted) });
      }
      return Promise.reject(new Error('permanent drop failure'));
    });
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...persisted, hydrated: true, persistenceError: null });

    const persistencePromise = useTabBoardStore.getState().applyDropIntent({
      kind: 'move-session',
      groupId: 'failed-drop-source',
      category: 'saved',
      index: 0,
      workspaceId: 'workspace_default',
    });
    await vi.advanceTimersByTimeAsync(100 + 250 + 1_000 + 4_000 + 1);

    await expect(persistencePromise).rejects.toThrow('permanent drop failure');
    expect(sendMessage).toHaveBeenCalledTimes(4);
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(useTabBoardStore.getState().persistenceError).toBe('permanent drop failure');
  });

  it('rolls back terminal failed drops when authoritative recovery also fails', async () => {
    vi.useFakeTimers();
    const persisted: TabBoardState = {
      ...createEmptyState(),
      groups: [group('rollback-drop-source')],
    };
    const storageGet = vi.fn(async () => ({ tabboardState: structuredClone(persisted) }));
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: structuredClone(persisted) });
      }
      return Promise.reject(new Error('unrecoverable drop failure'));
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: {
        local: { get: storageGet },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    await useTabBoardStore.getState().hydrate();
    storageGet.mockRejectedValue(new Error('storage recovery unavailable'));

    const persistencePromise = useTabBoardStore.getState().applyDropIntent({
      kind: 'move-session',
      groupId: 'rollback-drop-source',
      category: 'saved',
      index: 0,
      workspaceId: 'workspace_default',
    });
    await vi.advanceTimersByTimeAsync(100 + 250 + 1_000 + 4_000 + 1);

    await expect(persistencePromise).rejects.toThrow('unrecoverable drop failure');
    expect(useTabBoardStore.getState().groups[0]?.starred).toBe(false);

    useTabBoardStore.getState().updateSettings({ theme: 'dark' });
    await vi.advanceTimersByTimeAsync(100);
    const latestBatch = sendMessage.mock.calls.at(-1)?.[0]?.mutations || [];
    expect(latestBatch).toHaveLength(1);
    expect(latestBatch[0]?.type).toBe('update-settings');
  });

  it('retains persistence error state for a synchronous invalid drop', async () => {
    const persisted: TabBoardState = {
      ...createEmptyState(),
      groups: [group('locked-drop-source', 'workspace_default', { locked: true })],
    };
    const dispatchEvent = vi.fn();
    const sendMessage = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...persisted, hydrated: true, persistenceError: null });

    const persistencePromise = useTabBoardStore.getState().applyDropIntent({
      kind: 'move-session',
      groupId: 'locked-drop-source',
      category: 'saved',
      index: 0,
      workspaceId: 'workspace_default',
    });

    await expect(persistencePromise).rejects.toThrow();
    expect(useTabBoardStore.getState().persistenceError).toBeTruthy();
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('keeps a generic error for an unowned ordinary mutation in a mixed batch', async () => {
    vi.useFakeTimers();
    const persisted: TabBoardState = {
      ...createEmptyState(),
      groups: [group('mixed-drop-source')],
    };
    const dispatchEvent = vi.fn();
    const sendMessage = vi.fn((message: { type: string }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: structuredClone(persisted) });
      }
      return Promise.reject(new Error('mixed batch failure'));
    });
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...persisted, hydrated: true, persistenceError: null });

    const persistencePromise = useTabBoardStore.getState().applyDropIntent({
      kind: 'move-session',
      groupId: 'mixed-drop-source',
      category: 'saved',
      index: 0,
      workspaceId: 'workspace_default',
    });
    useTabBoardStore.getState().updateSettings({ theme: 'dark' });
    await vi.advanceTimersByTimeAsync(100 + 250 + 1_000 + 4_000 + 1);

    await expect(persistencePromise).rejects.toThrow('mixed batch failure');
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('does not emit a generic error for a final invalid drop', async () => {
    vi.useFakeTimers();
    const persisted: TabBoardState = {
      ...createEmptyState(),
      groups: [group('invalid-drop-source')],
    };
    const dispatchEvent = vi.fn();
    const sendMessage = vi.fn((message: { type: string }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: structuredClone(persisted) });
      }
      return Promise.resolve({
        ok: false,
        code: 'INVALID_DROP_INTENT',
        error: 'Invalid drop intent.',
        invalidMutationIndexes: [0],
      });
    });
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...persisted, hydrated: true, persistenceError: null });

    const persistencePromise = useTabBoardStore.getState().applyDropIntent({
      kind: 'move-session',
      groupId: 'invalid-drop-source',
      category: 'saved',
      index: 0,
      workspaceId: 'workspace_default',
    });
    await vi.advanceTimersByTimeAsync(100);

    await expect(persistencePromise).rejects.toThrow('Invalid drop intent.');
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(useTabBoardStore.getState().persistenceError).toBe('Invalid drop intent.');
  });

  it('retries failed ordinary persistence with bounded backoff and clears the error after recovery', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const sentBatches: StateMutation[][] = [];
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: createEmptyState() });
      }
      attempts += 1;
      sentBatches.push(structuredClone(message.mutations || []));
      if (attempts === 1) return Promise.reject(new Error('temporary RPC failure'));
      return Promise.resolve({
        ok: true,
        result: applyStateMutations(createEmptyState(), message.mutations || []),
      });
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');

    useTabBoardStore.getState().updateSettings({ theme: 'dark' });
    useTabBoardStore.getState().updateSettings({ closeTabsAfterSave: false });
    await vi.advanceTimersByTimeAsync(100);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(useTabBoardStore.getState().persistenceError).toBe('temporary RPC failure');

    await vi.advanceTimersByTimeAsync(249);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sentBatches[1]).toEqual(sentBatches[0]);
    expect(useTabBoardStore.getState().settings.theme).toBe('dark');
    expect(useTabBoardStore.getState().persistenceError).toBeNull();
  });

  it('stops retrying after the bounded ordinary persistence attempts', async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: createEmptyState() });
      }
      return Promise.reject(new Error('persistent RPC failure'));
    });
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');

    useTabBoardStore.getState().updateSettings({ theme: 'dark' });
    await vi.advanceTimersByTimeAsync(100 + 250 + 1000 + 4000 + 1);

    expect(sendMessage).toHaveBeenCalledTimes(4);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(useTabBoardStore.getState().persistenceError).toBe('persistent RPC failure');
  });

  it('rejects category validation failures without scheduling an automatic retry', async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: createEmptyState() });
      }
      return Promise.resolve({ ok: false, code: 'CATEGORY_VALIDATION', error: 'Category name is required.' });
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');

    await expect(useTabBoardStore.getState().addFolder('workspace_default', '   '))
      .rejects.toThrow('Category name is required.');
    await vi.advanceTimersByTimeAsync(10_000);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(useTabBoardStore.getState().persistenceError).toBe('Category name is required.');
  });

  it('keeps a category waiter pending through a transient retry until success', async () => {
    vi.useFakeTimers();
    const persisted = createEmptyState();
    let attempts = 0;
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: structuredClone(persisted) });
      }
      attempts += 1;
      if (attempts === 1) return Promise.reject(new Error('temporary category failure'));
      return Promise.resolve({
        ok: true,
        result: applyStateMutations(persisted, message.mutations || []),
      });
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');

    let settled = false;
    const folderPromise = useTabBoardStore.getState().addFolder('workspace_default', 'Retry folder');
    folderPromise.then(
      () => { settled = true; },
      () => { settled = true; },
    );
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(250);
    await folderPromise;

    expect(attempts).toBe(2);
    expect(useTabBoardStore.getState().folders.map(({ name }) => name)).toEqual(['Retry folder']);
  });

  it('clears a terminal category waiter so a later category mutation can succeed', async () => {
    const persisted = createEmptyState();
    let attempts = 0;
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: structuredClone(persisted) });
      }
      attempts += 1;
      if (attempts === 1) {
        return Promise.resolve({ ok: false, code: 'CATEGORY_VALIDATION', error: 'Category name is required.' });
      }
      return Promise.resolve({
        ok: true,
        result: applyStateMutations(persisted, message.mutations || []),
      });
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');

    await expect(useTabBoardStore.getState().addFolder('workspace_default', '   '))
      .rejects.toMatchObject({ code: 'CATEGORY_VALIDATION' });
    await expect(useTabBoardStore.getState().addFolder('workspace_default', 'Valid folder'))
      .resolves.toBeUndefined();

    expect(attempts).toBe(2);
    expect(useTabBoardStore.getState().folders.map(({ name }) => name)).toEqual(['Valid folder']);
  });

  it('reconciles pending remote state when mixed mutation RPC commits are reported', async () => {
    vi.useFakeTimers();
    const persisted: TabBoardState = {
      ...createEmptyState(),
      groups: [group('valid-source'), group('invalid-source')],
    };
    const listeners: Array<(changes: Record<string, { newValue: TabBoardState }>, area: string) => void> = [];
    let sentBatch: StateMutation[] = [];
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: structuredClone(persisted) });
      }
      sentBatch = message.mutations || [];
      const committedState = applyStateMutations(
        persisted,
        sentBatch.filter((_, index) => index !== 1),
      );
      const remoteState: TabBoardState = {
        ...committedState,
        mutationRevision: committedState.mutationRevision + 1,
        groups: [...committedState.groups, group('remote-group')],
        updatedAt: '9999-01-01T00:00:00.000Z',
      };
      listeners.forEach((listener) => listener({ tabboardState: { newValue: remoteState } }, 'local'));
      return Promise.resolve({
        ok: false,
        code: 'INVALID_DROP_INTENT',
        error: 'Invalid state mutation.',
        invalidMutationIndexes: [1],
        committedMutationIndexes: [0, 2],
        state: committedState,
      });
    });
    const chromeMock = {
      runtime: { sendMessage },
      storage: {
        local: { get: vi.fn(async () => ({ tabboardState: structuredClone(persisted) })) },
        onChanged: {
          addListener: (listener: (changes: Record<string, { newValue: TabBoardState }>, area: string) => void) => { listeners.push(listener); },
          removeListener: vi.fn(),
        },
      },
    };
    vi.stubGlobal('chrome', chromeMock);
    const { useTabBoardStore } = await import('./useTabBoardStore');
    await useTabBoardStore.getState().hydrate();

    useTabBoardStore.getState().applyDropIntent({
      kind: 'move-session',
      groupId: 'valid-source',
      category: 'saved',
      index: 0,
      workspaceId: 'workspace_default',
    });
    useTabBoardStore.getState().applyDropIntent({
      kind: 'move-session',
      groupId: 'invalid-source',
      category: 'saved',
      index: 0,
      workspaceId: 'workspace_default',
    });
    useTabBoardStore.getState().updateSettings({ theme: 'dark' });
    await vi.advanceTimersByTimeAsync(100);

    const result = useTabBoardStore.getState();
    expect(sentBatch).toHaveLength(3);
    expect(result.groups.map(({ id }) => id)).toContain('remote-group');
    expect(result.groups.find(({ id }) => id === 'valid-source')?.starred).toBe(true);
    expect(result.groups.find(({ id }) => id === 'invalid-source')?.starred).toBe(false);
    expect(result.settings.theme).toBe('dark');
  });

  it('isolates one invalid drop while retaining valid drops and following mutations', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const sentBatches: StateMutation[][] = [];
    const persisted = {
      ...createEmptyState(),
      groups: [group('valid-drop-source'), group('invalid-drop-source')],
    };
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: structuredClone(persisted) });
      }
      attempts += 1;
      sentBatches.push(structuredClone(message.mutations || []));
      if (attempts === 1) {
        return Promise.resolve({
          ok: false,
          code: 'INVALID_DROP_INTENT',
          invalidMutationIndexes: [1],
          error: 'Invalid state mutation.',
        });
      }
      return Promise.resolve({
        ok: true,
        result: applyStateMutations(persisted, message.mutations || []),
      });
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({
      ...persisted,
      hydrated: true,
      persistenceError: null,
    });

    useTabBoardStore.getState().applyDropIntent({
      kind: 'move-session',
      groupId: 'valid-drop-source',
      category: 'saved',
      index: 0,
      workspaceId: 'workspace_default',
    });
    useTabBoardStore.getState().applyDropIntent({
      kind: 'move-session',
      groupId: 'invalid-drop-source',
      category: 'saved',
      index: 0,
      workspaceId: 'workspace_default',
    });
    useTabBoardStore.getState().updateSettings({ theme: 'dark' });

    await vi.advanceTimersByTimeAsync(100);
    expect(sentBatches[0].map(({ type }) => type)).toEqual(['drop-intent', 'drop-intent', 'update-settings']);
    await vi.advanceTimersByTimeAsync(251);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sentBatches[1].map(({ type }) => type)).toEqual(['drop-intent', 'update-settings']);
    expect(useTabBoardStore.getState().settings.theme).toBe('dark');
    expect(useTabBoardStore.getState().persistenceError).toBeNull();
  });

  it('retries retained ordinary mutations independently after terminal drop exhaustion', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const sentBatches: StateMutation[][] = [];
    const persisted: TabBoardState = {
      ...createEmptyState(),
      groups: [group('failed-drop-source')],
    };
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: structuredClone(persisted) });
      }
      attempts += 1;
      const mutations = structuredClone(message.mutations || []);
      sentBatches.push(mutations);
      if (attempts <= 4 && mutations.some((mutation) => mutation.type === 'drop-intent')) {
        return Promise.reject(new Error('drop persistence failure'));
      }
      return Promise.resolve({
        ok: true,
        result: applyStateMutations(persisted, mutations),
      });
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...persisted, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().applyDropIntent({
      kind: 'move-session',
      groupId: 'failed-drop-source',
      category: 'saved',
      index: 0,
      workspaceId: 'workspace_default',
    });
    useTabBoardStore.getState().updateSettings({ theme: 'dark' });

    await vi.advanceTimersByTimeAsync(100 + 250 + 1_000 + 4_000 + 249);
    expect(sendMessage).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);

    expect(sendMessage).toHaveBeenCalledTimes(5);
    expect(sentBatches[4]?.map(({ type }) => type)).toEqual(['update-settings']);
    expect(useTabBoardStore.getState().settings.theme).toBe('dark');
  });

  it('retries retained ordinary mutations after a mixed restore collision', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const sentBatches: StateMutation[][] = [];
    const restoredTab = tab('restore-collision-retry-tab');
    const entry: BinEntry = {
      id: 'restore-collision-retry-bin',
      kind: 'tab',
      label: restoredTab.title,
      groupId: 'restore-collision-retry-group',
      groupTitle: 'Restore collision retry group',
      source: 'group',
      item: restoredTab,
      deletedAt: timestamp,
      originalWorkspaceId: 'workspace_default',
      originalFolderId: null,
      originalGroupId: 'restore-collision-retry-group',
      originalIndex: 0,
    };
    const persisted: TabBoardState = {
      ...createEmptyState(),
      groups: [group('restore-collision-retry-group')],
      bin: [entry],
    };
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: structuredClone(persisted) });
      }
      attempts += 1;
      sentBatches.push(structuredClone(message.mutations || []));
      if (attempts === 1) {
        return Promise.resolve({
          ok: false,
          code: 'RESTORE_ID_COLLISION',
          error: 'Restored entity ID collides with an unrelated live entity.',
        });
      }
      return Promise.resolve({
        ok: true,
        result: applyStateMutations(persisted, message.mutations || []),
      });
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...persisted, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().restoreFromBin(entry.id);
    useTabBoardStore.getState().updateSettings({ theme: 'dark' });

    await vi.advanceTimersByTimeAsync(100);
    expect(sentBatches[0].map(({ type }) => type)).toEqual(['restore-tab', 'update-settings']);
    await vi.advanceTimersByTimeAsync(250);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sentBatches[1].map(({ type }) => type)).toEqual(['update-settings']);
    expect(useTabBoardStore.getState().settings.theme).toBe('dark');
  });

  it('retries retained ordinary mutations after rejecting a mixed invalid category batch', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const sentBatches: StateMutation[][] = [];
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: createEmptyState() });
      }
      attempts += 1;
      sentBatches.push(structuredClone(message.mutations || []));
      if (attempts === 1) return Promise.resolve({ ok: false, code: 'CATEGORY_VALIDATION', error: 'Category name is required.' });
      return Promise.resolve({
        ok: true,
        result: applyStateMutations(createEmptyState(), message.mutations || []),
      });
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');

    useTabBoardStore.getState().addGroup(group('pending-group'));
    const invalidCategory = useTabBoardStore.getState().addFolder('workspace_default', '   ');
    await expect(invalidCategory).rejects.toThrow('Category name is required.');
    expect(sentBatches[0].map(({ type }) => type)).toEqual(['add-group', 'add-folder']);

    await vi.advanceTimersByTimeAsync(249);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sentBatches[1].map(({ type }) => type)).toEqual(['add-group']);
    expect(useTabBoardStore.getState().groups).toHaveLength(1);
    expect(useTabBoardStore.getState().persistenceError).toBeNull();
  });
});

describe('Task191 persistence feedback and terminal failures', () => {
  it('rolls back a terminal ordinary rejection and allows the next mutation through', async () => {
    vi.useFakeTimers();
    const persisted = {
      ...createEmptyState(),
      groups: [group('terminal-group', 'workspace_default', { title: 'Original' })],
    };
    const sentBatches: StateMutation[][] = [];
    let attempts = 0;
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') return Promise.resolve({ ok: true, result: structuredClone(persisted) });
      attempts += 1;
      const mutations = structuredClone(message.mutations || []);
      sentBatches.push(mutations);
      if (attempts === 1) return Promise.resolve({
        ok: false,
        code: 'GROUP_LOCKED',
        error: 'Cannot modify a locked group.',
      });
      return Promise.resolve({ ok: true, result: applyStateMutations(persisted, mutations) });
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...persisted, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().updateGroup('terminal-group', { title: 'Optimistic title' });
    await vi.advanceTimersByTimeAsync(100);

    expect(sentBatches[0]).toHaveLength(1);
    expect(sentBatches[0][0]).toMatchObject({ type: 'update-group', id: 'terminal-group' });
    expect(useTabBoardStore.getState().groups[0]?.title).toBe('Original');
    expect(useTabBoardStore.getState().persistenceError).toBe('Cannot modify a locked group.');

    useTabBoardStore.getState().updateSettings({ theme: 'dark' });
    await vi.advanceTimersByTimeAsync(100);

    expect(sentBatches[1].map(({ type }) => type)).toEqual(['update-settings']);
    expect(useTabBoardStore.getState().settings.theme).toBe('dark');
  });

  it.each([
    ['first', ['invalid', 'settings-a', 'settings-b']],
    ['middle', ['settings-a', 'invalid', 'settings-b']],
    ['last', ['settings-a', 'settings-b', 'invalid']],
  ] as const)('isolates a terminal ordinary failure when it is %s in an atomic batch', async (_position, order) => {
    vi.useFakeTimers();
    let remoteState: TabBoardState = {
      ...createEmptyState(),
      groups: [group('terminal-batch-group')],
    };
    const sentBatches: StateMutation[][] = [];
    const sendMessage = vi.fn(async (message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') return { ok: true, result: structuredClone(remoteState) };
      const mutations = structuredClone(message.mutations || []);
      sentBatches.push(mutations);
      if (mutations.some((mutation) => mutation.type === 'update-group')) {
        return { ok: false, code: 'GROUP_LOCKED', error: 'Cannot modify a locked group.' };
      }
      remoteState = applyStateMutations(remoteState, mutations);
      return { ok: true, result: structuredClone(remoteState) };
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...remoteState, hydrated: true, persistenceError: null });

    order.forEach((operation) => {
      if (operation === 'invalid') {
        useTabBoardStore.getState().updateGroup('terminal-batch-group', { title: 'Rejected title' });
      } else if (operation === 'settings-a') {
        useTabBoardStore.getState().updateSettings({ theme: 'dark' });
      } else {
        useTabBoardStore.getState().updateSettings({ closeTabsAfterSave: false });
      }
    });
    await vi.advanceTimersByTimeAsync(100);

    expect(sentBatches[0].map(({ type }) => type)).toEqual(order.map((operation) =>
      operation === 'invalid' ? 'update-group' : 'update-settings'));
    expect(sentBatches.slice(1).every((batch) => batch.length === 1)).toBe(true);
    expect(sentBatches.filter((batch) => batch.some((mutation) => mutation.type === 'update-group'))).toHaveLength(2);
    expect(remoteState.settings).toMatchObject({ theme: 'dark', closeTabsAfterSave: false });
    expect(useTabBoardStore.getState().settings).toMatchObject({ theme: 'dark', closeTabsAfterSave: false });
    expect(useTabBoardStore.getState().groups[0]?.title).toBe('terminal-batch-group');
  });

  it('resolves a successful category sibling after isolating a terminal ordinary failure', async () => {
    const persisted: TabBoardState = {
      ...createEmptyState(),
      groups: [group('category-sibling-group')],
    };
    let remoteState = structuredClone(persisted);
    const sentBatches: StateMutation[][] = [];
    const sendMessage = vi.fn(async (message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') return { ok: true, result: structuredClone(remoteState) };
      const mutations = structuredClone(message.mutations || []);
      sentBatches.push(mutations);
      if (mutations.some((mutation) => mutation.type === 'update-group')) {
        return { ok: false, code: 'GROUP_LOCKED', error: 'Cannot modify a locked group.' };
      }
      remoteState = applyStateMutations(remoteState, mutations);
      return { ok: true, result: structuredClone(remoteState) };
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...remoteState, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().updateGroup('category-sibling-group', { title: 'Rejected title' });
    const categoryPromise = useTabBoardStore.getState().addFolder('workspace_default', 'Work');

    await expect(categoryPromise).resolves.toBeUndefined();
    expect(sentBatches.map((batch) => batch.map(({ type }) => type))).toEqual([
      ['update-group', 'add-folder'],
      ['update-group'],
      ['add-folder'],
    ]);
    expect(useTabBoardStore.getState().folders.map(({ name }) => name)).toEqual(['Work']);
    expect(useTabBoardStore.getState().groups[0]?.title).toBe('category-sibling-group');
  });

  it('rejects a category sibling with its own terminal validation error', async () => {
    const persisted: TabBoardState = {
      ...createEmptyState(),
      groups: [group('category-validation-group')],
    };
    const sentBatches: StateMutation[][] = [];
    const sendMessage = vi.fn(async (message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') return { ok: true, result: structuredClone(persisted) };
      const mutations = structuredClone(message.mutations || []);
      sentBatches.push(mutations);
      if (mutations.some((mutation) => mutation.type === 'update-group')) {
        return { ok: false, code: 'GROUP_LOCKED', error: 'Cannot modify a locked group.' };
      }
      return { ok: false, code: 'CATEGORY_VALIDATION', error: 'Category name is required.' };
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...persisted, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().updateGroup('category-validation-group', { title: 'Rejected title' });
    const categoryPromise = useTabBoardStore.getState().addFolder('workspace_default', 'Work');

    await expect(categoryPromise).rejects.toMatchObject({ code: 'CATEGORY_VALIDATION' });
    expect(sentBatches.map((batch) => batch.map(({ type }) => type))).toEqual([
      ['update-group', 'add-folder'],
      ['update-group'],
      ['add-folder'],
    ]);
    expect(useTabBoardStore.getState().folders).toEqual([]);
  });

  it('isolates ordinary failures while retaining drop siblings for retry', async () => {
    vi.useFakeTimers();
    let remoteState: TabBoardState = {
      ...createEmptyState(),
      groups: [group('mixed-drop-source')],
    };
    let attempts = 0;
    const sentBatches: StateMutation[][] = [];
    const sendMessage = vi.fn(async (message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') return { ok: true, result: structuredClone(remoteState) };
      const mutations = structuredClone(message.mutations || []);
      sentBatches.push(mutations);
      if (mutations.some((mutation) => mutation.type === 'update-group')) {
        return { ok: false, code: 'GROUP_LOCKED', error: 'Cannot modify a locked group.' };
      }
      attempts += 1;
      remoteState = applyStateMutations(remoteState, mutations);
      return { ok: true, result: structuredClone(remoteState) };
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...remoteState, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().updateGroup('mixed-drop-source', { title: 'Rejected title' });
    const dropPromise = useTabBoardStore.getState().applyDropIntent({
      kind: 'move-session',
      groupId: 'mixed-drop-source',
      category: 'saved',
      index: 0,
      workspaceId: 'workspace_default',
    });
    useTabBoardStore.getState().updateSettings({ theme: 'dark' });
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => expect(sentBatches).toHaveLength(3));
    await vi.advanceTimersByTimeAsync(1_000);
    await dropPromise;

    expect(attempts).toBe(2);
    expect(sentBatches[0]?.map(({ type }) => type)).toEqual(['update-group', 'drop-intent', 'update-settings']);
    expect(sentBatches[1]?.map(({ type }) => type)).toEqual(['update-group']);
    expect(sentBatches[2]?.map(({ type }) => type)).toEqual(['update-settings']);
    expect(sentBatches[3]?.map(({ type }) => type)).toEqual(['drop-intent']);
    expect(remoteState.settings.theme).toBe('dark');
    expect(remoteState.groups[0]?.starred).toBe(true);
  });

  it('retains mutations queued while isolating a terminal batch', async () => {
    vi.useFakeTimers();
    let remoteState: TabBoardState = {
      ...createEmptyState(),
      groups: [group('isolation-queue-group')],
    };
    let resolveInvalid: ((response: unknown) => void) | undefined;
    const sentBatches: StateMutation[][] = [];
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') return Promise.resolve({ ok: true, result: structuredClone(remoteState) });
      const mutations = structuredClone(message.mutations || []);
      sentBatches.push(mutations);
      if (mutations.some((mutation) => mutation.type === 'update-group')) {
        if (mutations.length === 1) return new Promise((resolve) => { resolveInvalid = resolve; });
        return Promise.resolve({ ok: false, code: 'GROUP_LOCKED', error: 'Cannot modify a locked group.' });
      }
      remoteState = applyStateMutations(remoteState, mutations);
      return Promise.resolve({ ok: true, result: structuredClone(remoteState) });
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...remoteState, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().updateGroup('isolation-queue-group', { title: 'Rejected title' });
    useTabBoardStore.getState().updateSettings({ theme: 'dark' });
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => expect(sentBatches).toHaveLength(2));

    useTabBoardStore.getState().updateSettings({ closeTabsAfterSave: false });
    resolveInvalid?.({ ok: false, code: 'GROUP_LOCKED', error: 'Cannot modify a locked group.' });
    await vi.waitFor(() => expect(sentBatches).toHaveLength(3));
    await vi.advanceTimersByTimeAsync(250);

    expect(sentBatches.at(-1)?.every(({ type }) => type === 'update-settings')).toBe(true);
    expect(remoteState.settings).toMatchObject({ theme: 'dark', closeTabsAfterSave: false });
  });

  it('retries a category mutation queued during terminal isolation', async () => {
    vi.useFakeTimers();
    const persisted: TabBoardState = {
      ...createEmptyState(),
      groups: [group('queued-category-isolation-group')],
    };
    let remoteState = structuredClone(persisted);
    let resolveInvalid: ((response: unknown) => void) | undefined;
    let categoryAttempts = 0;
    const sentBatches: StateMutation[][] = [];
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: structuredClone(remoteState) });
      }
      const mutations = structuredClone(message.mutations || []);
      sentBatches.push(mutations);
      if (mutations.some((mutation) => mutation.type === 'update-group')) {
        if (mutations.length === 1) {
          return new Promise((resolve) => { resolveInvalid = resolve; });
        }
        return Promise.resolve({ ok: false, code: 'GROUP_LOCKED', error: 'Cannot modify a locked group.' });
      }
      if (mutations.some((mutation) => mutation.type === 'add-folder')) {
        categoryAttempts += 1;
        if (categoryAttempts === 2) return Promise.reject(new Error('temporary category failure'));
      }
      remoteState = applyStateMutations(remoteState, mutations);
      return Promise.resolve({ ok: true, result: structuredClone(remoteState) });
    });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: {
        local: {
          get: vi.fn(async () => ({ tabboardState: structuredClone(remoteState) })),
          set: vi.fn(async () => {}),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...persisted, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().updateGroup('queued-category-isolation-group', { title: 'Rejected title' });
    useTabBoardStore.getState().updateSettings({ theme: 'dark' });
    const firstFolderPromise = useTabBoardStore.getState().addFolder('workspace_default', 'Initial folder');
    const firstFolderOutcome = firstFolderPromise.then(() => 'resolved', (error: unknown) => error);
    await vi.waitFor(() => expect(sentBatches).toHaveLength(2));

    const queuedFolderPromise = useTabBoardStore.getState().addFolder('workspace_default', 'Queued folder');
    const queuedFolderOutcome = queuedFolderPromise.then(() => 'resolved', (error: unknown) => error);
    resolveInvalid?.({ ok: false, code: 'GROUP_LOCKED', error: 'Cannot modify a locked group.' });
    await vi.waitFor(() => expect(sentBatches).toHaveLength(5), { timeout: 2000 });
    expect(sentBatches.map((batch) => batch.map(({ type }) => type))).toEqual([
      ['update-group', 'update-settings', 'add-folder'],
      ['update-group'],
      ['update-settings'],
      ['add-folder'],
      ['add-folder'],
    ]);
    await expect(firstFolderOutcome).resolves.toBe('resolved');

    await vi.advanceTimersByTimeAsync(249);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(sentBatches).toHaveLength(6), { timeout: 2000 });
    await expect(queuedFolderOutcome).resolves.toBe('resolved');

    expect(categoryAttempts).toBe(3);
    expect(remoteState.folders.map(({ name }) => name)).toEqual(['Initial folder', 'Queued folder']);
  });

  it('retains an isolated mutation after a transient candidate failure', async () => {
    vi.useFakeTimers();
    const persisted = {
      ...createEmptyState(),
      groups: [group('transient-isolation-group')],
    };
    let settingsAttempts = 0;
    const sentBatches: StateMutation[][] = [];
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') return Promise.resolve({ ok: true, result: structuredClone(persisted) });
      const mutations = structuredClone(message.mutations || []);
      sentBatches.push(mutations);
      if (mutations.some((mutation) => mutation.type === 'update-group')) {
        return Promise.resolve({ ok: false, code: 'GROUP_LOCKED', error: 'Cannot modify a locked group.' });
      }
      settingsAttempts += 1;
      if (settingsAttempts === 1) return Promise.reject(new Error('temporary candidate failure'));
      return Promise.resolve({ ok: true, result: applyStateMutations(persisted, mutations) });
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...persisted, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().updateGroup('transient-isolation-group', { title: 'Rejected title' });
    useTabBoardStore.getState().updateSettings({ theme: 'dark' });
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => expect(sentBatches).toHaveLength(3));
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(sentBatches.length).toBeGreaterThanOrEqual(4));

    expect(sentBatches.at(-1)?.map(({ type }) => type)).toEqual(['update-settings']);
    expect(useTabBoardStore.getState().settings.theme).toBe('dark');
  });

  it('reports reconciliation failure after committed save success and removes invalid pending mutation', async () => {
    vi.useFakeTimers();
    const persisted: TabBoardState = {
      ...createEmptyState(),
      groups: [group('removed-by-remote')],
    };
    let resolveAdd: ((response: unknown) => void) | undefined;
    const listeners: Array<(changes: Record<string, { newValue: TabBoardState }>, area: string) => void> = [];
    const dispatchEvent = vi.fn();
    const sentBatches: StateMutation[][] = [];
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') return Promise.resolve({ ok: true, result: structuredClone(persisted) });
      const mutations = structuredClone(message.mutations || []);
      sentBatches.push(mutations);
      if (mutations.some((mutation) => mutation.type === 'add-group')) {
        return new Promise((resolve) => { resolveAdd = resolve; });
      }
      return Promise.resolve({ ok: false, code: 'GROUP_NOT_FOUND', error: 'Group not found.' });
    });
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: {
        local: { get: vi.fn(async () => ({ tabboardState: structuredClone(persisted) })) },
        onChanged: {
          addListener: (listener: (changes: Record<string, { newValue: TabBoardState }>, area: string) => void) => { listeners.push(listener); },
          removeListener: vi.fn(),
        },
      },
    });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    await useTabBoardStore.getState().hydrate();

    useTabBoardStore.getState().addGroup(group('committed-save'));
    await vi.advanceTimersByTimeAsync(100);
    useTabBoardStore.getState().updateGroup('removed-by-remote', { title: 'Rejected update' });
    await vi.advanceTimersByTimeAsync(100);

    const newerState: TabBoardState = {
      ...persisted,
      groups: [],
      mutationRevision: persisted.mutationRevision + 1,
      updatedAt: '9999-01-01T00:00:00.000Z',
    };
    listeners.forEach((listener) => listener({ tabboardState: { newValue: newerState } }, 'local'));
    resolveAdd?.({
      ok: true,
      result: applyStateMutations(persisted, sentBatches[0] || []),
    });
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => expect(dispatchEvent.mock.calls.length).toBeGreaterThanOrEqual(2));

    expect(dispatchEvent.mock.calls.slice(0, 2).map(([event]) => event.type)).toEqual([
      'tabboard:save-success',
      'tabboard:error',
    ]);
    expect(sentBatches).toHaveLength(1);
    expect(useTabBoardStore.getState().groups.map(({ title }) => title)).toEqual(['committed-save']);
    expect(useTabBoardStore.getState().persistenceError).toBe('Group not found.');
  });

  it('surfaces isolation reconciliation failures after removing invalid queued mutations', async () => {
    vi.useFakeTimers();
    const persisted: TabBoardState = {
      ...createEmptyState(),
      groups: [group('isolation-trigger'), group('isolation-removed')],
    };
    let remoteState = structuredClone(persisted);
    let resolveTrigger: ((response: unknown) => void) | undefined;
    const listeners: Array<(changes: Record<string, { newValue: TabBoardState }>, area: string) => void> = [];
    const sentBatches: StateMutation[][] = [];
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') return Promise.resolve({ ok: true, result: structuredClone(remoteState) });
      const mutations = structuredClone(message.mutations || []);
      sentBatches.push(mutations);
      if (mutations.length > 1 && mutations.some((mutation) => mutation.type === 'update-group')) {
        return Promise.resolve({ ok: false, code: 'GROUP_LOCKED', error: 'Cannot modify a locked group.' });
      }
      if (mutations[0]?.type === 'update-group' && mutations[0].id === 'isolation-trigger') {
        return new Promise((resolve) => { resolveTrigger = resolve; });
      }
      if (mutations[0]?.type === 'update-group' && mutations[0].id === 'isolation-removed') {
        return Promise.resolve({ ok: false, code: 'GROUP_NOT_FOUND', error: 'Group not found.' });
      }
      remoteState = applyStateMutations(remoteState, mutations);
      return Promise.resolve({ ok: true, result: structuredClone(remoteState) });
    });
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: {
        local: { get: vi.fn(async () => ({ tabboardState: structuredClone(remoteState) })) },
        onChanged: {
          addListener: (listener: (changes: Record<string, { newValue: TabBoardState }>, area: string) => void) => { listeners.push(listener); },
          removeListener: vi.fn(),
        },
      },
    });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    await useTabBoardStore.getState().hydrate();

    useTabBoardStore.getState().updateGroup('isolation-trigger', { title: 'Rejected trigger' });
    useTabBoardStore.getState().updateSettings({ theme: 'dark' });
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => expect(sentBatches).toHaveLength(2));

    useTabBoardStore.getState().updateGroup('isolation-removed', { title: 'Rejected queued update' });
    remoteState = {
      ...remoteState,
      groups: remoteState.groups.filter(({ id }) => id !== 'isolation-removed'),
      mutationRevision: remoteState.mutationRevision + 1,
      updatedAt: '9999-01-01T00:00:00.000Z',
    };
    listeners.forEach((listener) => listener({ tabboardState: { newValue: remoteState } }, 'local'));
    resolveTrigger?.({ ok: false, code: 'GROUP_LOCKED', error: 'Cannot modify a locked group.' });
    await vi.waitFor(() => expect(sentBatches).toHaveLength(3));
    await vi.advanceTimersByTimeAsync(100);

    expect(sentBatches.some((batch) => batch.some((mutation) =>
      mutation.type === 'update-group' && mutation.id === 'isolation-removed'))).toBe(false);
    expect(useTabBoardStore.getState().groups.map(({ id }) => id)).toEqual(['isolation-trigger']);
    expect(useTabBoardStore.getState().persistenceError).toBe('Group not found.');
  });

  it('emits save success only after authoritative persistence resolves', async () => {
    vi.useFakeTimers();
    const persisted = createEmptyState();
    let resolveMutation: ((response: unknown) => void) | undefined;
    const dispatchEvent = vi.fn();
    const sendMessage = vi.fn((message: { type: string }) => {
      if (message.type === 'tabboard-ensure-state') return Promise.resolve({ ok: true, result: structuredClone(persisted) });
      return new Promise((resolve) => { resolveMutation = resolve; });
    });
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...persisted, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().addGroup(group('save-success-group'));
    expect(dispatchEvent).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).not.toHaveBeenCalled();

    const request = sendMessage.mock.calls[0]?.[0] as { mutations?: StateMutation[] };
    resolveMutation?.({ ok: true, result: applyStateMutations(persisted, request.mutations || []) });
    await vi.waitFor(() => expect(dispatchEvent).toHaveBeenCalledTimes(1));

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0]?.[0]?.type).toBe('tabboard:save-success');
  });

  it('emits save success for mutations committed in a partial drop response', async () => {
    vi.useFakeTimers();
    const persisted = {
      ...createEmptyState(),
      groups: [group('partial-drop-source')],
    };
    const dispatchEvent = vi.fn();
    const sendMessage = vi.fn(async (message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') return { ok: true, result: structuredClone(persisted) };
      const mutations = message.mutations || [];
      return {
        ok: false,
        code: 'INVALID_DROP_INTENT',
        error: 'Invalid drop intent.',
        invalidMutationIndexes: [1],
        committedMutationIndexes: [0],
        state: applyStateMutations(persisted, mutations.slice(0, 1)),
      };
    });
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...persisted, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().addGroup(group('partial-save-group'));
    const dropPromise = useTabBoardStore.getState().applyDropIntent({
      kind: 'move-session',
      groupId: 'partial-drop-source',
      category: 'saved',
      index: 0,
      workspaceId: 'workspace_default',
    });
    await vi.advanceTimersByTimeAsync(100);

    await expect(dropPromise).rejects.toMatchObject({ code: 'INVALID_DROP_INTENT' });
    expect(dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual(['tabboard:save-success']);
  });

  it('rebases a queued drop after terminal in-flight ordinary rejection', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    vi.stubGlobal('crypto', { randomUUID: () => '01234567-89ab-cdef-0123-456789abcdef' });
    const ordinaryTarget = group('rebase-ordinary-target');
    const dropTarget = group('rebase-drop-target');
    const localState: TabBoardState = {
      ...createEmptyState(),
      groups: [ordinaryTarget, dropTarget],
    };
    let authoritative = structuredClone(localState);
    let resolveOrdinary: ((response: unknown) => void) | undefined;
    const sentBatches: StateMutation[][] = [];
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: structuredClone(authoritative) });
      }
      const mutations = structuredClone(message.mutations || []);
      sentBatches.push(mutations);
      if (mutations.some((mutation) => mutation.type === 'update-group')) {
        return new Promise((resolve) => { resolveOrdinary = resolve; });
      }
      const drop = mutations.find((mutation) => mutation.type === 'drop-intent');
      if (drop?.type === 'drop-intent' && drop.expectedRevision !== authoritative.mutationRevision) {
        return Promise.resolve({ ok: false, code: 'INVALID_DROP_INTENT', error: 'Drop mutation revision is stale.' });
      }
      authoritative = applyStateMutations(authoritative, mutations);
      return Promise.resolve({ ok: true, result: structuredClone(authoritative) });
    });
    const storage = {
      local: { get: vi.fn(async () => ({ tabboardState: structuredClone(authoritative) })) },
    };
    vi.stubGlobal('chrome', { runtime: { sendMessage }, storage });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...localState, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().updateGroup(ordinaryTarget.id, { title: 'Rejected title' });
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => expect(sentBatches).toHaveLength(1));

    const dropIntent = {
      kind: 'move-session' as const,
      groupId: dropTarget.id,
      category: 'saved' as const,
      index: 0,
      workspaceId: 'workspace_default',
    };
    const expectedOperationId = `drop-operation_${Date.now().toString(36)}_0123456789ab`;
    const dropPromise = useTabBoardStore.getState().applyDropIntent(dropIntent);
    const dropOutcome = dropPromise.then(() => null, (error: unknown) => error);
    expect(useTabBoardStore.getState().mutationRevision).toBe(2);

    authoritative = {
      ...authoritative,
      groups: authoritative.groups.map((current) => current.id === ordinaryTarget.id
        ? { ...current, locked: true }
        : current),
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    resolveOrdinary?.({ ok: false, code: 'GROUP_LOCKED', error: 'Cannot modify a locked group.' });
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(sentBatches.length).toBeGreaterThanOrEqual(2));

    const retriedDrop = sentBatches[1]?.[0];
    expect(retriedDrop).toMatchObject({
      type: 'drop-intent',
      operationId: expectedOperationId,
      expectedRevision: 0,
      intent: dropIntent,
      openTabs: [],
    });
    if (!retriedDrop || retriedDrop.type !== 'drop-intent') throw new Error('Expected retried drop mutation.');
    await expect(dropOutcome).resolves.toBeNull();

    const ledgerEntry = authoritative.dropOperationLedger.find(({ operationId }) => operationId === expectedOperationId);
    expect(ledgerEntry?.digest).toBe(getDropOperationDigest(retriedDrop.intent, retriedDrop.openTabs));
    expect(authoritative.groups.find(({ id }) => id === dropTarget.id)?.starred).toBe(true);
    expect(useTabBoardStore.getState().persistenceError).toBeNull();
  });

  it('rebases queued drops against newer buffered authoritative state', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    vi.stubGlobal('crypto', { randomUUID: () => '01234567-89ab-cdef-0123-456789abcdef' });
    const ordinaryTarget = group('buffered-ordinary-target');
    const dropTarget = group('buffered-drop-target');
    const localState: TabBoardState = {
      ...createEmptyState(),
      groups: [ordinaryTarget, dropTarget],
    };
    let recoveredState = structuredClone(localState);
    let remoteState = structuredClone(localState);
    let resolveOrdinary: ((response: unknown) => void) | undefined;
    const listeners: Array<(changes: Record<string, { newValue: TabBoardState }>, area: string) => void> = [];
    const sentBatches: StateMutation[][] = [];
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: structuredClone(recoveredState) });
      }
      const mutations = structuredClone(message.mutations || []);
      sentBatches.push(mutations);
      if (mutations.some((mutation) => mutation.type === 'update-group')) {
        return new Promise((resolve) => { resolveOrdinary = resolve; });
      }
      const drop = mutations.find((mutation) => mutation.type === 'drop-intent');
      if (drop?.type === 'drop-intent' && drop.expectedRevision !== remoteState.mutationRevision) {
        return Promise.resolve({ ok: false, code: 'INVALID_DROP_INTENT', error: 'Drop mutation revision is stale.' });
      }
      remoteState = applyStateMutations(remoteState, mutations);
      return Promise.resolve({ ok: true, result: structuredClone(remoteState) });
    });
    const storage = {
      local: { get: vi.fn(async () => ({ tabboardState: structuredClone(recoveredState) })) },
      onChanged: {
        addListener: (listener: (changes: Record<string, { newValue: TabBoardState }>, area: string) => void) => {
          listeners.push(listener);
        },
        removeListener: vi.fn(),
      },
    };
    vi.stubGlobal('chrome', { runtime: { sendMessage }, storage });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    await useTabBoardStore.getState().hydrate();

    useTabBoardStore.getState().updateGroup(ordinaryTarget.id, { title: 'Rejected title' });
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => expect(sentBatches).toHaveLength(1));

    const dropIntent = {
      kind: 'move-session' as const,
      groupId: dropTarget.id,
      category: 'saved' as const,
      index: 0,
      workspaceId: 'workspace_default',
    };
    const expectedOperationId = `drop-operation_${Date.now().toString(36)}_0123456789ab`;
    const dropPromise = useTabBoardStore.getState().applyDropIntent(dropIntent);
    const dropOutcome = dropPromise.then(() => null, (error: unknown) => error);
    recoveredState = {
      ...recoveredState,
      groups: recoveredState.groups.map((current) => current.id === ordinaryTarget.id
        ? { ...current, locked: true }
        : current),
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    remoteState = {
      ...recoveredState,
      mutationRevision: 1,
      settings: { ...recoveredState.settings, theme: 'dark' },
      updatedAt: '2026-01-03T00:00:00.000Z',
    };
    listeners.forEach((listener) => listener({ tabboardState: { newValue: structuredClone(remoteState) } }, 'local'));
    resolveOrdinary?.({ ok: false, code: 'GROUP_LOCKED', error: 'Cannot modify a locked group.' });
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(sentBatches.length).toBeGreaterThanOrEqual(2));

    const retriedDrop = sentBatches[1]?.[0];
    expect(retriedDrop).toMatchObject({
      type: 'drop-intent',
      operationId: expectedOperationId,
      expectedRevision: 1,
      intent: dropIntent,
      openTabs: [],
    });
    if (!retriedDrop || retriedDrop.type !== 'drop-intent') throw new Error('Expected retried drop mutation.');
    await expect(dropOutcome).resolves.toBeNull();

    const ledgerEntry = remoteState.dropOperationLedger.find(({ operationId }) => operationId === expectedOperationId);
    expect(ledgerEntry?.digest).toBe(getDropOperationDigest(retriedDrop.intent, retriedDrop.openTabs));
    expect(remoteState.groups.find(({ id }) => id === dropTarget.id)?.starred).toBe(true);
  });

  it('rebases a queued drop after restore collision removes an optimistic restore', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    vi.stubGlobal('crypto', { randomUUID: () => '01234567-89ab-cdef-0123-456789abcdef' });
    const restoredTab = tab('restore-collision-drop-tab');
    const entry: BinEntry = {
      id: 'restore-collision-drop-bin',
      kind: 'tab',
      label: restoredTab.title,
      groupId: 'restore-collision-drop-target',
      groupTitle: 'Restore collision drop target',
      source: 'group',
      item: restoredTab,
      deletedAt: timestamp,
      originalWorkspaceId: 'workspace_default',
      originalFolderId: null,
      originalGroupId: 'restore-collision-drop-target',
      originalIndex: 0,
    };
    const restoredTarget = group('restore-collision-drop-target');
    const dropTarget = group('restore-collision-drop-source');
    const persisted: TabBoardState = {
      ...createEmptyState(),
      groups: [restoredTarget, dropTarget],
      bin: [entry],
    };
    let authoritative = structuredClone(persisted);
    const sentBatches: StateMutation[][] = [];
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') {
        return Promise.resolve({ ok: true, result: structuredClone(authoritative) });
      }
      const mutations = structuredClone(message.mutations || []);
      sentBatches.push(mutations);
      if (mutations.some((mutation) => mutation.type === 'restore-tab')) {
        return Promise.resolve({
          ok: false,
          code: 'RESTORE_ID_COLLISION',
          error: 'Restored entity ID collides with an unrelated live entity.',
        });
      }
      const drop = mutations.find((mutation) => mutation.type === 'drop-intent');
      if (drop?.type === 'drop-intent' && drop.expectedRevision !== authoritative.mutationRevision) {
        return Promise.resolve({ ok: false, code: 'INVALID_DROP_INTENT', error: 'Drop mutation revision is stale.' });
      }
      authoritative = applyStateMutations(authoritative, mutations);
      return Promise.resolve({ ok: true, result: structuredClone(authoritative) });
    });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: {
        local: { get: vi.fn(async () => ({ tabboardState: structuredClone(authoritative) })) },
      },
    });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...persisted, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().restoreFromBin(entry.id);
    const dropIntent = {
      kind: 'move-session' as const,
      groupId: dropTarget.id,
      category: 'saved' as const,
      index: 0,
      workspaceId: 'workspace_default',
    };
    const expectedOperationId = `drop-operation_${Date.now().toString(36)}_0123456789ab`;
    const dropPromise = useTabBoardStore.getState().applyDropIntent(dropIntent);
    const dropOutcome = dropPromise.then(() => null, (error: unknown) => error);
    expect(useTabBoardStore.getState().mutationRevision).toBe(2);

    await vi.advanceTimersByTimeAsync(100);
    expect(sentBatches[0]?.map(({ type }) => type)).toEqual(['restore-tab', 'drop-intent']);
    await vi.advanceTimersByTimeAsync(250);
    for (let attempt = 0; attempt < 20 && sentBatches.length < 2; attempt += 1) {
      await Promise.resolve();
    }

    const retriedDrop = sentBatches[1]?.[0];
    expect(retriedDrop).toMatchObject({
      type: 'drop-intent',
      operationId: expectedOperationId,
      expectedRevision: 0,
      intent: dropIntent,
      openTabs: [],
    });
    if (!retriedDrop || retriedDrop.type !== 'drop-intent') throw new Error('Expected retried drop mutation.');
    await expect(dropOutcome).resolves.toBeNull();

    const ledgerEntry = authoritative.dropOperationLedger.find(({ operationId }) => operationId === expectedOperationId);
    expect(ledgerEntry?.digest).toBe(getDropOperationDigest(retriedDrop.intent, retriedDrop.openTabs));
    expect(authoritative.groups.find(({ id }) => id === dropTarget.id)?.starred).toBe(true);
    expect(useTabBoardStore.getState().persistenceError).toBeNull();
  });

  it('does not emit import success when worker persistence rejects', async () => {
    vi.useFakeTimers();
    const persisted = createEmptyState();
    const dispatchEvent = vi.fn();
    const sendMessage = vi.fn(async (message: { type: string }) => {
      if (message.type === 'tabboard-ensure-state') return { ok: true, result: structuredClone(persisted) };
      return { ok: false, code: 'DUPLICATE_ENTITY_ID', error: 'Entity ID already exists.' };
    });
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...persisted, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().importGroups('# Imported\nhttps://example.com');
    expect(dispatchEvent).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);

    expect(dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual(['tabboard:error']);
    expect(useTabBoardStore.getState().groups).toEqual([]);
  });

  it('emits import success only after deferred worker persistence resolves', async () => {
    vi.useFakeTimers();
    const persisted = createEmptyState();
    const dispatchEvent = vi.fn();
    let resolveMutation: ((response: unknown) => void) | undefined;
    const sendMessage = vi.fn((message: { type: string; mutations?: StateMutation[] }) => {
      if (message.type === 'tabboard-ensure-state') return Promise.resolve({ ok: true, result: structuredClone(persisted) });
      return new Promise((resolve) => { resolveMutation = resolve; });
    });
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { useTabBoardStore } = await import('./useTabBoardStore');
    useTabBoardStore.setState({ ...persisted, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().importGroups('# Imported\nhttps://example.com');
    await vi.advanceTimersByTimeAsync(100);

    expect(dispatchEvent).not.toHaveBeenCalled();
    const request = sendMessage.mock.calls[0]?.[0];
    resolveMutation?.({
      ok: true,
      result: applyStateMutations(persisted, request?.mutations || []),
    });
    await vi.waitFor(() => expect(dispatchEvent).toHaveBeenCalledTimes(1));

    expect(dispatchEvent.mock.calls[0]?.[0]?.type).toBe('tabboard:import-success');
  });
});

describe('TabBoard store hydration lifecycle', () => {
  type StorageListener = (
    changes: Record<string, { newValue: TabBoardState }>,
    area: string,
  ) => void;

  function setupChrome() {
    const persisted = createEmptyState();
    const activeListeners: StorageListener[] = [];
    const registeredListeners: StorageListener[] = [];
    const removeListener = vi.fn((listener: StorageListener) => {
      const index = activeListeners.indexOf(listener);
      if (index >= 0) activeListeners.splice(index, 1);
    });
    const chromeMock = {
      runtime: {
        sendMessage: vi.fn(async (message: { type: string }) => {
          if (message.type === 'tabboard-ensure-state') {
            return { ok: true, result: structuredClone(persisted) };
          }
          return { ok: true, result: structuredClone(persisted) };
        }),
      },
      storage: {
        local: {
          get: vi.fn(async (key: string) => (
            key === 'tabboardStorageConfig'
              ? {}
              : { tabboardState: structuredClone(persisted) }
          )),
        },
        onChanged: {
          addListener: vi.fn((listener: StorageListener) => {
            activeListeners.push(listener);
            registeredListeners.push(listener);
          }),
          removeListener,
        },
      },
    };
    vi.stubGlobal('chrome', chromeMock);
    const publishState = (state: TabBoardState) => {
      activeListeners.forEach((listener) => listener(
        { tabboardState: { newValue: state } },
        'local',
      ));
    };
    return {
      activeListeners,
      registeredListeners,
      removeListener,
      chromeMock,
      persisted,
      publishState,
    };
  }

  it('keeps at most one active listener across repeated hydrate calls', async () => {
    const { activeListeners, chromeMock } = setupChrome();

    await useTabBoardStore.getState().hydrate();
    await useTabBoardStore.getState().hydrate();

    expect(chromeMock.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
    expect(activeListeners).toHaveLength(1);
  });

  it('disconnects store publication on hydration cleanup without tearing down the authority backend', async () => {
    const { activeListeners, publishState, persisted } = setupChrome();

    await useTabBoardStore.getState().hydrate();
    useTabBoardStore.getState().releaseHydration();
    const before = useTabBoardStore.getState();
    publishState({
      ...persisted,
      groups: [group('ignored-after-release')],
      updatedAt: '9999-01-01T00:00:00.000Z',
    });

    expect(activeListeners).toHaveLength(1);
    expect(useTabBoardStore.getState().groups).toEqual(before.groups);
    expect(useTabBoardStore.getState().hydrated).toBe(false);
  });

  it('captures a storage update during the initial state read', async () => {
    const { activeListeners, chromeMock, persisted } = setupChrome();
    const remoteState = {
      ...persisted,
      groups: [group('during-hydrate')],
      updatedAt: '9999-01-01T00:00:00.000Z',
    };
    chromeMock.storage.local.get.mockImplementation(async (key: string) => {
      if (key === 'tabboardStorageConfig') return {};
      activeListeners.forEach((listener) => listener(
        { tabboardState: { newValue: remoteState } },
        'local',
      ));
      return { tabboardState: structuredClone(persisted) };
    });

    await useTabBoardStore.getState().hydrate();

    expect(useTabBoardStore.getState().groups.map(({ id }) => id)).toEqual(['during-hydrate']);
  });

  it('prefers a newer initial read over an older buffered storage event', async () => {
    const { activeListeners, chromeMock, persisted } = setupChrome();
    const olderRemoteState = {
      ...persisted,
      groups: [group('older-event')],
      updatedAt: '2020-01-01T00:00:00.000Z',
    };
    const newerReadState = {
      ...persisted,
      groups: [group('newer-read')],
      updatedAt: '9999-01-01T00:00:00.000Z',
    };
    chromeMock.storage.local.get.mockImplementation(async (key: string) => {
      if (key === 'tabboardStorageConfig') return {};
      activeListeners.forEach((listener) => listener(
        { tabboardState: { newValue: olderRemoteState } },
        'local',
      ));
      return { tabboardState: structuredClone(newerReadState) };
    });

    await useTabBoardStore.getState().hydrate();

    expect(useTabBoardStore.getState().groups.map(({ id }) => id)).toEqual(['newer-read']);
  });

  it('shares one in-flight hydrate request and subscription', async () => {
    const { activeListeners, chromeMock, persisted } = setupChrome();
    let resolveEnsure: ((response: { ok: boolean; result: TabBoardState }) => void) | undefined;
    chromeMock.runtime.sendMessage.mockImplementationOnce(() => new Promise<{ ok: boolean; result: TabBoardState }>((resolve) => {
      resolveEnsure = resolve;
    }));

    const first = useTabBoardStore.getState().hydrate();
    const second = useTabBoardStore.getState().hydrate();

    expect(second).toBe(first);
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledTimes(1);
    resolveEnsure?.({ ok: true, result: structuredClone(persisted) });
    await Promise.all([first, second]);

    expect(chromeMock.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
    expect(activeListeners).toHaveLength(1);
  });

  it('hydrates from local storage when the ensure-state worker call fails', async () => {
    // An idle/cold MV3 worker (or torn-down message port) must not blank the
    // manager: hydration is decoupled from the worker and reads storage directly.
    const { chromeMock } = setupChrome();
    chromeMock.runtime.sendMessage.mockRejectedValueOnce(new Error('worker unavailable'));

    await useTabBoardStore.getState().hydrate();

    expect(useTabBoardStore.getState().hydrated).toBe(true);
    expect(useTabBoardStore.getState().persistenceError).toBeNull();
    // Fell back to reading chrome.storage.local rather than failing.
    expect(chromeMock.storage.local.get).toHaveBeenCalled();
  });

  it('records a hydration failure and permits retry when storage is also unreachable', async () => {
    const { chromeMock } = setupChrome();
    chromeMock.runtime.sendMessage.mockRejectedValueOnce(new Error('worker unavailable'));
    chromeMock.storage.local.get.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(useTabBoardStore.getState().hydrate()).rejects.toThrow('storage unavailable');
    expect(useTabBoardStore.getState().persistenceError).toBe('storage unavailable');

    await useTabBoardStore.getState().hydrate();
    expect(useTabBoardStore.getState().hydrated).toBe(true);
    expect(useTabBoardStore.getState().persistenceError).toBeNull();
  });

  it('hydrates and subscribes again after a cleanup and new setup', async () => {
    const { activeListeners, publishState, persisted } = setupChrome();

    await useTabBoardStore.getState().hydrate();
    useTabBoardStore.getState().releaseHydration();
    publishState({
      ...persisted,
      groups: [group('ignored-between-hydrations')],
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(useTabBoardStore.getState().groups).toEqual([]);

    await useTabBoardStore.getState().hydrate();
    publishState({
      ...persisted,
      groups: [group('accepted-after-rehydrate')],
      updatedAt: '9999-01-01T00:00:00.000Z',
    });

    expect(activeListeners).toHaveLength(1);
    expect(useTabBoardStore.getState().groups.map(({ id }) => id)).toEqual(['accepted-after-rehydrate']);
  });

  it('does not attach a stale listener when cleanup wins an in-flight hydrate', async () => {
    const { activeListeners, chromeMock, persisted } = setupChrome();
    let resolveEnsure: ((response: { ok: boolean; result: TabBoardState }) => void) | undefined;
    chromeMock.runtime.sendMessage.mockImplementationOnce(() => new Promise<{ ok: boolean; result: TabBoardState }>((resolve) => {
      resolveEnsure = resolve;
    }));

    const hydration = useTabBoardStore.getState().hydrate();
    useTabBoardStore.getState().releaseHydration();
    resolveEnsure?.({ ok: true, result: structuredClone(persisted) });
    await hydration;

    expect(activeListeners).toHaveLength(0);
    expect(chromeMock.storage.onChanged.addListener).not.toHaveBeenCalled();
    expect(useTabBoardStore.getState().hydrated).toBe(false);
  });

  it('ignores storage changes delivered to a listener after cleanup', async () => {
    const { registeredListeners, persisted } = setupChrome();

    await useTabBoardStore.getState().hydrate();
    const staleListener = registeredListeners[0];
    useTabBoardStore.getState().releaseHydration();
    const before = useTabBoardStore.getState();
    const remoteState = {
      ...persisted,
      groups: [group('stale-remote-group')],
    };

    staleListener({ tabboardState: { newValue: remoteState } }, 'local');

    expect(useTabBoardStore.getState().groups).toEqual(before.groups);
    expect(useTabBoardStore.getState().hydrated).toBe(false);
  });
});

describe('restore-group category placement', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('preserves restore creation metadata and emits success only after persistence', async () => {
    vi.useFakeTimers();
    const originalTab = { ...tab('restored-tab'), createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2021-01-01T00:00:00.000Z' };
    const deleted = group('metadata-group', 'workspace_default', {
      createdAt: '2020-02-01T00:00:00.000Z',
      updatedAt: '2021-02-01T00:00:00.000Z',
      tabs: [originalTab],
    });
    const entry: BinEntry = {
      id: 'metadata-restore-bin',
      kind: 'group',
      label: deleted.title,
      groupId: deleted.id,
      groupTitle: deleted.title,
      source: 'group',
      item: deleted,
      deletedAt: timestamp,
      originalWorkspaceId: 'workspace_default',
      originalFolderId: null,
      originalIndex: 0,
    };
    const before = { ...createEmptyState(), bin: [entry] };
    const sendMessage = vi.fn(async (message: { type: string; mutations?: StateMutation[] }) => ({
      ok: true,
      result: applyStateMutations(before, message.mutations || []),
    }));
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    useTabBoardStore.setState({ ...before, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().restoreFromBin(entry.id);
    expect(dispatchEvent).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);

    const mutation = sendMessage.mock.calls[0]?.[0]?.mutations?.[0] as StateMutation | undefined;
    expect(mutation).toMatchObject({
      type: 'restore-group',
      group: {
        createdAt: deleted.createdAt,
        tabs: [{ createdAt: originalTab.createdAt }],
      },
    });
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0]?.[0]?.type).toBe('tabboard:restore-success');
  });

  it('reports a restore collision once without throwing or emitting success', async () => {
    vi.useFakeTimers();
    const source = group('store-restore-collision');
    const entry: BinEntry = {
      id: 'store-restore-collision-bin',
      kind: 'group',
      label: source.title,
      groupId: source.id,
      groupTitle: source.title,
      source: 'group',
      item: source,
      deletedAt: timestamp,
      originalWorkspaceId: 'workspace_default',
      originalFolderId: null,
    };
    const before = { ...createEmptyState(), groups: [source], bin: [entry] };
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    useTabBoardStore.setState({ ...before, hydrated: true, persistenceError: null });

    expect(() => useTabBoardStore.getState().restoreFromBin(entry.id)).not.toThrow();

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0]?.[0]?.type).toBe('tabboard:error');
    expect(useTabBoardStore.getState().persistenceError).toContain('collides');
    expect(useTabBoardStore.getState().bin).toEqual([entry]);
  });

  it('does not emit restore success when persistence rejects a restore', async () => {
    vi.useFakeTimers();
    const deleted = group('failed-restore');
    const entry: BinEntry = {
      id: 'failed-restore-bin',
      kind: 'group',
      label: deleted.title,
      groupId: deleted.id,
      groupTitle: deleted.title,
      source: 'group',
      item: deleted,
      deletedAt: timestamp,
      originalWorkspaceId: 'workspace_default',
      originalFolderId: null,
      originalIndex: 0,
    };
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: false,
          code: 'RESTORE_ID_COLLISION',
          error: 'Restored entity ID collides with an unrelated live entity.',
        })),
      },
    });
    useTabBoardStore.setState({ ...createEmptyState(), bin: [entry], hydrated: true, persistenceError: null });

    useTabBoardStore.getState().restoreFromBin(entry.id);
    await vi.advanceTimersByTimeAsync(100);

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0]?.[0]?.type).toBe('tabboard:error');
    expect(useTabBoardStore.getState().persistenceError).toContain('collides');
  });

  const restoreTabTargetCases = [
    ['folder', { originalGroupId: 'missing-group', originalFolderId: 'folder-a' }, 'folder-target'],
    ['inbox', { originalGroupId: 'missing-group', originalFolderId: null }, 'inbox-target'],
    ['starred original group', { originalGroupId: 'starred-source', originalFolderId: null }, 'starred-source'],
  ] as const;

  it.each(restoreTabTargetCases)('selects the %s category target without using an unrelated group', async (_label, metadata, expectedGroupId) => {
    vi.useFakeTimers();
    const sourceTab = tab(`restore-target-${expectedGroupId}`);
    const entry: BinEntry = {
      id: `restore-target-bin-${expectedGroupId}`,
      kind: 'tab',
      label: sourceTab.title,
      groupId: metadata.originalGroupId || 'deleted-group',
      groupTitle: 'Deleted group',
      source: 'group',
      item: sourceTab,
      deletedAt: timestamp,
      originalWorkspaceId: 'workspace_default',
      originalFolderId: metadata.originalFolderId,
      originalGroupId: metadata.originalGroupId,
      originalIndex: 0,
    };
    const folder = {
      id: 'folder-a',
      name: 'A',
      color: 'slate',
      workspaceId: 'workspace_default',
      collapsed: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const before: TabBoardState = {
      ...createEmptyState(),
      folders: [folder],
      groups: [
        group('unrelated-starred', 'workspace_default', { starred: true }),
        group('inbox-target'),
        group('folder-target', 'workspace_default', { folderId: folder.id }),
        group('starred-source', 'workspace_default', { starred: true }),
        group('other-workspace-inbox', 'other-workspace'),
      ],
      bin: [entry],
    };
    let persisted = structuredClone(before);
    const sendMessage = vi.fn(async (message: { type: string; mutations?: StateMutation[] }) => {
      persisted = applyStateMutations(persisted, message.mutations || []);
      return { ok: true, result: persisted };
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    useTabBoardStore.setState({ ...before, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().restoreFromBin(entry.id);
    await vi.advanceTimersByTimeAsync(100);

    const mutation = sendMessage.mock.calls[0]?.[0]?.mutations?.[0] as StateMutation | undefined;
    expect(mutation).toMatchObject({ type: 'restore-tab', groupId: expectedGroupId });
  });

  it('does not fall back to Inbox when original folder still exists without a target group', () => {
    const sourceTab = tab('restore-folder-without-target');
    const folder = {
      id: 'restore-folder-without-target-folder',
      name: 'Original folder',
      color: 'slate',
      workspaceId: 'workspace_default',
      collapsed: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const entry: BinEntry = {
      id: 'restore-folder-without-target-bin',
      kind: 'tab',
      label: sourceTab.title,
      groupId: 'deleted-group',
      groupTitle: 'Deleted group',
      source: 'group',
      item: sourceTab,
      deletedAt: timestamp,
      originalWorkspaceId: 'workspace_default',
      originalFolderId: folder.id,
      originalGroupId: 'missing-group',
      originalIndex: 0,
    };
    const before = {
      ...createEmptyState(),
      folders: [folder],
      groups: [group('inbox-target')],
      bin: [entry],
    };
    const dispatchEvent = vi.fn();
    const sendMessage = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    useTabBoardStore.setState({ ...before, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().restoreFromBin(entry.id);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(useTabBoardStore.getState().persistenceError).toContain('target group');
    expect(useTabBoardStore.getState().bin).toEqual([entry]);
  });

  it('selects a surviving legacy source group globally before active workspace fallback', async () => {
    vi.useFakeTimers();
    const sourceTab = tab('legacy-store-cross-workspace-tab');
    const workspaceB = { id: 'legacy-store-workspace-b', name: 'B', createdAt: timestamp, updatedAt: timestamp };
    const entry: BinEntry = {
      id: 'legacy-store-cross-workspace-entry',
      kind: 'tab',
      label: sourceTab.title,
      groupId: 'legacy-store-source-group',
      groupTitle: 'Legacy source group',
      source: 'group',
      item: sourceTab,
      deletedAt: timestamp,
      originalGroupId: 'legacy-store-source-group',
      originalFolderId: null,
      originalIndex: 0,
    };
    const before: TabBoardState = {
      ...createEmptyState(),
      workspaces: [...createEmptyState().workspaces, workspaceB],
      activeWorkspaceId: 'workspace_default',
      groups: [group('legacy-store-source-group', workspaceB.id), group('legacy-store-active-inbox')],
      bin: [entry],
    };
    let persisted = structuredClone(before);
    const sendMessage = vi.fn(async (message: { type: string; mutations?: StateMutation[] }) => {
      persisted = applyStateMutations(persisted, message.mutations || []);
      return { ok: true, result: persisted };
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    useTabBoardStore.setState({ ...before, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().restoreFromBin(entry.id);
    await vi.advanceTimersByTimeAsync(100);

    const mutation = sendMessage.mock.calls[0]?.[0]?.mutations?.[0] as StateMutation | undefined;
    expect(mutation).toMatchObject({ type: 'restore-tab', groupId: 'legacy-store-source-group' });
  });

  it('selects source workspace Inbox when legacy source group is missing', async () => {
    vi.useFakeTimers();
    const sourceTab = tab('legacy-store-inbox-tab');
    const workspaceB = { id: 'legacy-store-inbox-workspace-b', name: 'B', createdAt: timestamp, updatedAt: timestamp };
    const entry: BinEntry = {
      id: 'legacy-store-inbox-entry',
      kind: 'tab',
      label: sourceTab.title,
      groupId: 'legacy-store-missing-group',
      groupTitle: 'Legacy missing group',
      source: 'group',
      item: sourceTab,
      deletedAt: timestamp,
      originalWorkspaceId: workspaceB.id,
      originalFolderId: null,
      originalIndex: 0,
    };
    const before: TabBoardState = {
      ...createEmptyState(),
      workspaces: [...createEmptyState().workspaces, workspaceB],
      activeWorkspaceId: 'workspace_default',
      groups: [group('legacy-store-source-inbox', workspaceB.id), group('legacy-store-active-inbox')],
      bin: [entry],
    };
    let persisted = structuredClone(before);
    const sendMessage = vi.fn(async (message: { type: string; mutations?: StateMutation[] }) => {
      persisted = applyStateMutations(persisted, message.mutations || []);
      return { ok: true, result: persisted };
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    useTabBoardStore.setState({ ...before, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().restoreFromBin(entry.id);
    await vi.advanceTimersByTimeAsync(100);

    const mutation = sendMessage.mock.calls[0]?.[0]?.mutations?.[0] as StateMutation | undefined;
    expect(mutation).toMatchObject({ type: 'restore-tab', groupId: 'legacy-store-source-inbox' });
  });

  it('falls back to active workspace Inbox only when no legacy source workspace exists', async () => {
    vi.useFakeTimers();
    const sourceTab = tab('legacy-store-active-fallback-tab');
    const entry: BinEntry = {
      id: 'legacy-store-active-fallback-entry',
      kind: 'tab',
      label: sourceTab.title,
      groupId: 'legacy-store-gone-group',
      groupTitle: 'Legacy gone group',
      source: 'group',
      item: sourceTab,
      deletedAt: timestamp,
      originalFolderId: null,
      originalIndex: 0,
    };
    const before: TabBoardState = {
      ...createEmptyState(),
      activeWorkspaceId: 'workspace_default',
      groups: [group('legacy-store-active-fallback-inbox')],
      bin: [entry],
    };
    let persisted = structuredClone(before);
    const sendMessage = vi.fn(async (message: { type: string; mutations?: StateMutation[] }) => {
      persisted = applyStateMutations(persisted, message.mutations || []);
      return { ok: true, result: persisted };
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    useTabBoardStore.setState({ ...before, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().restoreFromBin(entry.id);
    await vi.advanceTimersByTimeAsync(100);

    const mutation = sendMessage.mock.calls[0]?.[0]?.mutations?.[0] as StateMutation | undefined;
    expect(mutation).toMatchObject({ type: 'restore-tab', groupId: 'legacy-store-active-fallback-inbox' });
  });

  it('prefers the original group after it moves category', async () => {
    vi.useFakeTimers();
    const sourceTab = tab('restore-moved-original-group');
    const folder = {
      id: 'restore-moved-original-folder',
      name: 'Original folder',
      color: 'slate',
      workspaceId: 'workspace_default',
      collapsed: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const entry: BinEntry = {
      id: 'restore-moved-original-group-bin',
      kind: 'tab',
      label: sourceTab.title,
      groupId: 'moved-original-group',
      groupTitle: 'Moved original group',
      source: 'group',
      item: sourceTab,
      deletedAt: timestamp,
      originalWorkspaceId: 'workspace_default',
      originalFolderId: folder.id,
      originalGroupId: 'moved-original-group',
      originalIndex: 0,
    };
    const before: TabBoardState = {
      ...createEmptyState(),
      folders: [folder],
      groups: [group('moved-original-group')],
      bin: [entry],
    };
    let persisted = structuredClone(before);
    const sendMessage = vi.fn(async (message: { type: string; mutations?: StateMutation[] }) => {
      persisted = applyStateMutations(persisted, message.mutations || []);
      return { ok: true, result: persisted };
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    useTabBoardStore.setState({ ...before, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().restoreFromBin(entry.id);
    await vi.advanceTimersByTimeAsync(100);

    const mutation = sendMessage.mock.calls[0]?.[0]?.mutations?.[0] as StateMutation | undefined;
    expect(mutation).toMatchObject({ type: 'restore-tab', groupId: 'moved-original-group' });
  });

  it('reports a readable error and preserves Bin when no legal tab target exists', () => {
    const sourceTab = tab('restore-no-target');
    const entry: BinEntry = {
      id: 'restore-no-target-bin',
      kind: 'tab',
      label: sourceTab.title,
      groupId: 'deleted-group',
      groupTitle: 'Deleted group',
      source: 'group',
      item: sourceTab,
      deletedAt: timestamp,
      originalWorkspaceId: 'workspace_default',
      originalFolderId: null,
      originalGroupId: 'missing-group',
      originalIndex: 0,
    };
    const before = { ...createEmptyState(), groups: [group('only-starred', 'workspace_default', { starred: true })], bin: [entry] };
    const dispatchEvent = vi.fn();
    const sendMessage = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    useTabBoardStore.setState({ ...before, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().restoreFromBin(entry.id);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0]?.[0]?.type).toBe('tabboard:error');
    expect(useTabBoardStore.getState().persistenceError).toContain('target group');
    expect(useTabBoardStore.getState().bin).toEqual([entry]);
  });

  it('restores a legacy group into the surviving source folder and uses the snapshot group ID', async () => {
    vi.useFakeTimers();
    const workspaceB = { id: 'legacy-store-group-workspace-b', name: 'B', createdAt: timestamp, updatedAt: timestamp };
    const folderB = {
      id: 'legacy-store-group-folder-b', name: 'B folder', color: 'slate', workspaceId: workspaceB.id,
      collapsed: false, createdAt: timestamp, updatedAt: timestamp,
    };
    const deleted = group('legacy-store-restored-group', 'workspace_default', { folderId: 'missing-folder' });
    const entry: BinEntry = {
      id: 'legacy-store-group-entry',
      kind: 'group',
      label: deleted.title,
      groupId: 'stale-bin-group-id',
      groupTitle: deleted.title,
      source: 'group',
      item: deleted,
      deletedAt: timestamp,
      originalGroupId: 'legacy-store-group-source',
      originalFolderId: folderB.id,
    };
    const before: TabBoardState = {
      ...createEmptyState(),
      workspaces: [...createEmptyState().workspaces, workspaceB],
      folders: [folderB],
      groups: [group('legacy-store-group-source', workspaceB.id), group('legacy-store-group-active')],
      bin: [entry],
    };
    let persisted = structuredClone(before);
    const sendMessage = vi.fn(async (message: { type: string; mutations?: StateMutation[] }) => {
      persisted = applyStateMutations(persisted, message.mutations || []);
      return { ok: true, result: persisted };
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    useTabBoardStore.setState({ ...before, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().restoreFromBin(entry.id);
    await vi.advanceTimersByTimeAsync(100);

    const mutation = sendMessage.mock.calls[0]?.[0]?.mutations?.[0] as StateMutation | undefined;
    expect(mutation).toMatchObject({
      type: 'restore-group',
      group: { id: deleted.id, workspaceId: workspaceB.id, folderId: folderB.id },
    });
    expect(persisted.groups.find(({ id }) => id === deleted.id)).toMatchObject({
      workspaceId: workspaceB.id,
      folderId: folderB.id,
    });
  });

  it('sends a category-local index when another category precedes the restored group', async () => {
    vi.useFakeTimers();
    const base = createEmptyState();
    const folder = {
      id: 'folder-a',
      name: 'A',
      color: 'slate',
      workspaceId: 'workspace_default',
      collapsed: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const deleted = group('deleted', 'workspace_default', { folderId: folder.id });
    const entry: BinEntry = {
      id: 'bin-restored',
      kind: 'group',
      label: deleted.title,
      groupId: deleted.id,
      groupTitle: deleted.title,
      source: 'group',
      item: deleted,
      deletedAt: timestamp,
      originalWorkspaceId: 'workspace_default',
      originalFolderId: folder.id,
      originalIndex: 1,
    };
    const before: TabBoardState = {
      ...base,
      folders: [folder],
      groups: [
        group('inbox-before', 'workspace_default'),
        group('folder-before', 'workspace_default', { folderId: folder.id }),
        group('starred-before', 'workspace_default', { starred: true }),
      ],
      bin: [entry],
    };
    let persisted = structuredClone(before);
    const sendMessage = vi.fn(async (message: { type: string; mutations?: StateMutation[] }) => {
      persisted = applyStateMutations(persisted, message.mutations || []);
      return { ok: true, result: persisted };
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    useTabBoardStore.setState({ ...before, hydrated: true, persistenceError: null });

    useTabBoardStore.getState().restoreFromBin(entry.id);
    await vi.advanceTimersByTimeAsync(100);

    const [request] = sendMessage.mock.calls;
    const mutation = request?.[0]?.mutations?.[0] as StateMutation | undefined;
    expect(mutation).toMatchObject({
      type: 'restore-group',
      group: { folderId: folder.id, starred: false },
      index: 1,
    });
  });

  it('accepts a plain TabBoardState as a persisted snapshot source', () => {
    const pureState = createEmptyState();

    expect(persistedSnapshot(pureState)).toEqual(pureState);
  });

  it('exports a pure persisted snapshot without Zustand actions', () => {
    const pureState: TabBoardState = {
      ...createEmptyState(),
      groups: [group('export-group', 'workspace_default', { tabs: [tab('export-tab')] })],
    };
    useTabBoardStore.setState({ ...pureState, hydrated: true, persistenceError: null });

    const exported = useTabBoardStore.getState().exportAll();

    expect(JSON.parse(exported)).toEqual(pureState);
  });
});
