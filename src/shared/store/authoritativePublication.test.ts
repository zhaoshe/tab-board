import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyState,
  type BinEntry,
  type Folder,
  type Group,
  type TabItem,
  type TabBoardState,
} from '../model';
import {
  applyStateMutations,
  CategoryValidationError,
  InvalidDropMutationError,
  RestoreCollisionError,
  type StateMutation,
} from './stateMutations';
import {
  createAuthoritativePublication,
  type AuthoritativePublicationDependencies,
  type PublicationProjection,
} from './authoritativePublication';

const timestamp = '2026-01-01T00:00:00.000Z';

function group(id: string, overrides: Partial<Group> = {}): Group {
  return {
    id,
    title: id,
    note: '',
    workspaceId: 'workspace_default',
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

function dropMutation(
  operationId: string,
  groupId: string,
  expectedRevision = 0,
): Extract<StateMutation, { type: 'drop-intent' }> {
  return {
    type: 'drop-intent',
    operationId,
    intent: {
      kind: 'move-session',
      groupId,
      category: 'saved',
      index: 0,
      workspaceId: 'workspace_default',
    },
    openTabs: [],
    expectedRevision,
    updatedAt: timestamp,
  };
}

function createHarness(initialState: TabBoardState = createEmptyState()) {
  let projection: PublicationProjection = {
    state: initialState,
    hydrated: true,
    persistenceError: null,
  };
  let authoritative = projection.state;
  let subscriber: ((state: TabBoardState) => void) | null = null;
  const sentBatches: StateMutation[][] = [];
  const sendMutations = vi.fn(async (mutations: readonly StateMutation[]) => {
    const batch = [...mutations];
    sentBatches.push(batch);
    authoritative = applyStateMutations(authoritative, batch);
    return authoritative;
  });
  const dependencies: AuthoritativePublicationDependencies = {
    readProjection: () => projection,
    publishProjection: (state, status = {}) => {
      projection = {
        state,
        hydrated: status.hydrated ?? projection.hydrated,
        persistenceError: status.persistenceError === undefined
          ? projection.persistenceError
          : status.persistenceError,
      };
    },
    patchStatus: (status) => {
      projection = { ...projection, ...status };
    },
    initializeAuthoritativeState: async () => authoritative,
    subscribeAuthoritativeState: (callback) => {
      subscriber = callback;
      return () => {
        if (subscriber === callback) subscriber = null;
      };
    },
    sendMutations,
    currentContext: () => 'test-context',
    onPersistenceError: vi.fn(),
    onMutationCommitted: vi.fn(),
  };
  return {
    dependencies,
    getProjection: () => projection,
    publishRemote: (state: TabBoardState) => subscriber?.(state),
    setAuthoritative: (state: TabBoardState) => {
      authoritative = state;
    },
    sentBatches,
    sendMutations,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('authoritative publication optimistic commits', () => {
  it('publishes an optimistic mutation immediately and debounces persistence', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const publication = createAuthoritativePublication(harness.dependencies);

    publication.commit({
      type: 'update-settings',
      updates: { theme: 'dark' },
      updatedAt: timestamp,
    });

    expect(harness.getProjection().state.settings.theme).toBe('dark');
    expect(harness.sendMutations).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(99);
    expect(harness.sendMutations).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(harness.sentBatches.map((batch) => batch.map(({ type }) => type)))
      .toEqual([['update-settings']]);
  });

  it('preserves references for entities unaffected by an optimistic mutation', () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const before = harness.getProjection().state;
    const workspace = before.workspaces[0];
    const publication = createAuthoritativePublication(harness.dependencies);

    publication.commit({
      type: 'update-settings',
      updates: { theme: 'dark' },
      updatedAt: timestamp,
    });

    expect(harness.getProjection().state.workspaces[0]).toBe(workspace);
  });

  it('keeps checked mutations non-optimistic and settles only from authority', async () => {
    const initial = createEmptyState();
    const harness = createHarness(initial);
    let resolveAuthority: ((state: TabBoardState) => void) | undefined;
    harness.dependencies.sendMutations = vi.fn(
      () => new Promise<TabBoardState>((resolve) => {
        resolveAuthority = resolve;
      }),
    );
    const publication = createAuthoritativePublication(harness.dependencies);
    const mutation: StateMutation = {
      type: 'update-settings',
      updates: { theme: 'dark' },
      updatedAt: timestamp,
    };

    const persistence = publication.commitChecked(mutation);
    let settled = false;
    void persistence.finally(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(harness.dependencies.sendMutations).toHaveBeenCalledWith([mutation]);
    expect(harness.getProjection().state).toBe(initial);
    expect(harness.getProjection().state.settings.theme).toBe('system');
    expect(settled).toBe(false);

    resolveAuthority?.(applyStateMutations(initial, [mutation]));
    await persistence;

    expect(settled).toBe(true);
    expect(harness.getProjection().state.settings.theme).toBe('dark');
  });

  it('rejects checked mutations without changing the projection', async () => {
    const initial = createEmptyState();
    const harness = createHarness(initial);
    harness.dependencies.sendMutations = vi.fn(async () => {
      throw Object.assign(
        new Error('checked authority rejected'),
        { code: 'GROUP_LOCKED' },
      );
    });
    const publication = createAuthoritativePublication(harness.dependencies);

    await expect(publication.commitChecked({
      type: 'update-settings',
      updates: { theme: 'dark' },
      updatedAt: timestamp,
    })).rejects.toThrow('checked authority rejected');

    expect(harness.getProjection().state).toEqual(initial);
    expect(harness.getProjection().state.settings.theme).toBe('system');
  });
});

describe('authoritative publication reconciliation', () => {
  it('replays a committed mutation onto a newer remote state without replacing unaffected entities', async () => {
    vi.useFakeTimers();
    const initial: TabBoardState = {
      ...createEmptyState(),
      groups: [group('rename-target'), group('unaffected-group')],
    };
    const harness = createHarness(initial);
    let sentBatch: StateMutation[] | undefined;
    let resolveSend: ((state: TabBoardState) => void) | undefined;
    harness.dependencies.sendMutations = vi.fn((mutations: readonly StateMutation[]) => {
      sentBatch = [...mutations];
      return new Promise<TabBoardState>((resolve) => {
        resolveSend = resolve;
      });
    });
    const publication = createAuthoritativePublication(harness.dependencies);
    await publication.hydrate();
    const unaffected = harness.getProjection().state.groups[1];

    publication.commit({
      type: 'update-group',
      id: 'rename-target',
      updates: { title: 'Renamed' },
      updatedAt: timestamp,
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(sentBatch?.map(({ type }) => type)).toEqual(['update-group']);

    const remoteState: TabBoardState = {
      ...initial,
      mutationRevision: initial.mutationRevision + 2,
      groups: [
        group('rename-target', { collapsed: true }),
        initial.groups[1],
        group('remote-group'),
      ],
      updatedAt: '9999-01-01T00:00:00.000Z',
    };
    harness.publishRemote(remoteState);
    const workerState = applyStateMutations(initial, sentBatch || []);
    resolveSend?.(workerState);
    await vi.waitFor(() => {
      expect(harness.getProjection().state.groups[0]).toMatchObject({
        title: 'Renamed',
        collapsed: true,
      });
    });

    expect(harness.getProjection().state.groups.map(({ id }) => id))
      .toEqual(['rename-target', 'unaffected-group', 'remote-group']);
    expect(harness.getProjection().state.groups[1]).toBe(unaffected);
    expect(harness.getProjection().state.mutationRevision).toBe(remoteState.mutationRevision);
  });

  it('does not replay a committed drop onto a newer remote state after ledger eviction', async () => {
    vi.useFakeTimers();
    const initial: TabBoardState = {
      ...createEmptyState(),
      groups: [group('drop-source')],
    };
    const harness = createHarness(initial);
    let sentBatch: StateMutation[] | undefined;
    let resolveSend: ((state: TabBoardState) => void) | undefined;
    harness.dependencies.sendMutations = vi.fn((mutations: readonly StateMutation[]) => {
      sentBatch = [...mutations];
      return new Promise<TabBoardState>((resolve) => {
        resolveSend = resolve;
      });
    });
    const publication = createAuthoritativePublication(harness.dependencies);
    await publication.hydrate();

    publication.commit({
      type: 'drop-intent',
      operationId: 'drop-operation',
      intent: {
        kind: 'move-session',
        groupId: 'drop-source',
        category: 'saved',
        index: 0,
        workspaceId: 'workspace_default',
      },
      openTabs: [],
      expectedRevision: initial.mutationRevision,
      updatedAt: timestamp,
    });
    await vi.advanceTimersByTimeAsync(100);

    const workerState = applyStateMutations(initial, sentBatch || []);
    const remoteState: TabBoardState = {
      ...initial,
      mutationRevision: workerState.mutationRevision + 1,
      dropOperationLedger: Array.from({ length: 128 }, (_, index) => ({
        operationId: `later-${index}`,
        digest: `digest-${index}`,
        appliedAt: timestamp,
      })),
      updatedAt: '9999-01-01T00:00:00.000Z',
    };
    harness.publishRemote(remoteState);
    resolveSend?.({
      ...workerState,
      dropOperationLedger: Array.from({ length: 128 }, (_, index) => ({
        operationId: `worker-later-${index}`,
        digest: `worker-digest-${index}`,
        appliedAt: timestamp,
      })),
    });
    await vi.waitFor(() => {
      expect(harness.getProjection().state.mutationRevision).toBe(remoteState.mutationRevision);
    });

    expect(harness.getProjection().state.groups[0]?.starred).toBe(false);
  });

  it('removes an ordinary pending mutation that no longer applies after reconciliation', async () => {
    vi.useFakeTimers();
    const initial: TabBoardState = {
      ...createEmptyState(),
      groups: [group('removed-remotely')],
    };
    const harness = createHarness(initial);
    let sentBatch: StateMutation[] | undefined;
    let resolveSend: ((state: TabBoardState) => void) | undefined;
    harness.dependencies.sendMutations = vi.fn((mutations: readonly StateMutation[]) => {
      sentBatch = [...mutations];
      return new Promise<TabBoardState>((resolve) => {
        resolveSend = resolve;
      });
    });
    const publication = createAuthoritativePublication(harness.dependencies);
    await publication.hydrate();

    publication.commit({
      type: 'update-settings',
      updates: { theme: 'dark' },
      updatedAt: timestamp,
    });
    await vi.advanceTimersByTimeAsync(100);
    publication.commit({
      type: 'update-group',
      id: 'removed-remotely',
      updates: { title: 'Cannot apply' },
      updatedAt: timestamp,
    });
    harness.publishRemote({
      ...initial,
      mutationRevision: initial.mutationRevision + 2,
      groups: [],
      updatedAt: '9999-01-01T00:00:00.000Z',
    });
    resolveSend?.(applyStateMutations(initial, sentBatch || []));

    await vi.waitFor(() => {
      expect(harness.dependencies.onPersistenceError).toHaveBeenCalledTimes(1);
    });
    expect(harness.getProjection().state.groups).toEqual([]);

    await vi.advanceTimersByTimeAsync(100);
    expect(harness.dependencies.sendMutations).toHaveBeenCalledTimes(1);
  });
});

describe('authoritative publication persistence outcomes', () => {
  it('commits an All Source move past an unrelated locked sibling and rejects locked endpoints', async () => {
    vi.useFakeTimers();
    const sourceTabs = [tab('authority-all-a'), tab('authority-all-b')];
    const source = group('authority-all-source', { tabs: sourceTabs });
    const target = group('authority-all-target', {
      tabs: [tab('authority-target-existing')],
    });
    const lockedSibling = group('authority-unrelated-locked', { locked: true });
    const initial: TabBoardState = {
      ...createEmptyState(),
      groups: [source, target, lockedSibling],
    };
    const mutation: Extract<StateMutation, { type: 'drop-intent' }> = {
      type: 'drop-intent',
      operationId: 'authority-all-source-move',
      intent: {
        kind: 'move-tabs',
        refs: sourceTabs.map(({ id }) => ({ groupId: source.id, tabId: id })),
        targetGroupId: target.id,
        targetIndex: target.tabs.length,
        workspaceId: 'workspace_default',
      },
      openTabs: [],
      expectedRevision: 0,
      updatedAt: timestamp,
    };
    const harness = createHarness(initial);
    const publication = createAuthoritativePublication(harness.dependencies);

    const persistence = publication.commitDrop(mutation);
    await vi.advanceTimersByTimeAsync(100);
    await expect(persistence).resolves.toBeUndefined();
    expect(harness.getProjection().state.groups.map(({ id }) => id)).toEqual([
      target.id,
      lockedSibling.id,
    ]);

    for (const lockedEndpoint of ['source', 'target'] as const) {
      const lockedInitial = {
        ...initial,
        groups: initial.groups.map((item) => {
          if (lockedEndpoint === 'source' && item.id === source.id) {
            return { ...item, locked: true };
          }
          if (lockedEndpoint === 'target' && item.id === target.id) {
            return { ...item, locked: true };
          }
          return item;
        }),
      };
      const lockedHarness = createHarness(lockedInitial);
      const lockedPublication = createAuthoritativePublication(
        lockedHarness.dependencies,
      );
      await expect(lockedPublication.commitDrop({
        ...mutation,
        operationId: `authority-locked-${lockedEndpoint}`,
      })).rejects.toThrow('Cannot modify a locked group.');
      expect(lockedHarness.dependencies.sendMutations).not.toHaveBeenCalled();
    }
  });

  it('keeps a drop waiter pending through a transient retry and resolves after commit', async () => {
    vi.useFakeTimers();
    const initial: TabBoardState = {
      ...createEmptyState(),
      groups: [group('retry-drop')],
    };
    const harness = createHarness(initial);
    let attempts = 0;
    harness.dependencies.sendMutations = vi.fn(async (
      mutations: readonly StateMutation[],
    ) => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary drop failure');
      const committed = applyStateMutations(initial, mutations);
      harness.setAuthoritative(committed);
      return committed;
    });
    const publication = createAuthoritativePublication(harness.dependencies);

    let settled = false;
    const persistence = publication.commitDrop(
      dropMutation('retry-drop-operation', 'retry-drop'),
    );
    persistence.then(
      () => { settled = true; },
      () => { settled = true; },
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(249);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(persistence).resolves.toBeUndefined();
    expect(harness.getProjection().state.groups[0]?.starred).toBe(true);
    expect(attempts).toBe(2);
  });

  it('rejects a drop after bounded retries and restores the authoritative state', async () => {
    vi.useFakeTimers();
    const initial: TabBoardState = {
      ...createEmptyState(),
      groups: [group('failed-drop')],
    };
    const harness = createHarness(initial);
    harness.dependencies.sendMutations = vi.fn(async () => {
      throw new Error('permanent drop failure');
    });
    const publication = createAuthoritativePublication(harness.dependencies);
    const persistence = publication.commitDrop(
      dropMutation('failed-drop-operation', 'failed-drop'),
    );
    const outcome = persistence.then(
      () => 'resolved' as const,
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(100 + 250 + 1_000 + 4_000 + 1);

    await expect(outcome).resolves.toMatchObject({
      message: 'permanent drop failure',
    });
    expect(harness.dependencies.sendMutations).toHaveBeenCalledTimes(4);
    expect(harness.getProjection().state.groups[0]?.starred).toBe(false);
    expect(harness.dependencies.onPersistenceError).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'permanent drop failure' }),
      false,
    );
  });

  it('rejects category validation without retrying or publishing optimistic state', async () => {
    vi.useFakeTimers();
    const initial = createEmptyState();
    const harness = createHarness(initial);
    harness.dependencies.sendMutations = vi.fn(async () => {
      throw new CategoryValidationError('Category name is required.');
    });
    const publication = createAuthoritativePublication(harness.dependencies);

    const persistence = publication.commitCategory({
      type: 'add-folder',
      folder: folder('invalid-folder', 'Work'),
    });

    await expect(persistence).rejects.toMatchObject({
      code: 'CATEGORY_VALIDATION',
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(harness.dependencies.sendMutations).toHaveBeenCalledTimes(1);
    expect(harness.getProjection().state.folders).toEqual([]);
  });

  it('resolves a response-lost category retry through exact CAS replay', async () => {
    vi.useFakeTimers();
    const initial: TabBoardState = {
      ...createEmptyState(),
      folders: [folder('folder-response-lost', 'Before')],
    };
    const harness = createHarness(initial);
    let authoritative = initial;
    let attempts = 0;
    harness.dependencies.sendMutations = vi.fn(async (
      mutations: readonly StateMutation[],
    ) => {
      attempts += 1;
      authoritative = applyStateMutations(authoritative, mutations);
      harness.setAuthoritative(authoritative);
      if (attempts === 1) throw new Error('response lost after commit');
      return authoritative;
    });
    const publication = createAuthoritativePublication(harness.dependencies);
    const mutation: StateMutation = {
      type: 'update-folder',
      id: 'folder-response-lost',
      name: 'After',
      color: '#40c057',
      expected: { name: 'Before', color: 'slate' },
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    const persistence = publication.commitCategory(mutation);

    await vi.advanceTimersByTimeAsync(250);
    await expect(persistence).resolves.toBeUndefined();
    expect(harness.dependencies.sendMutations).toHaveBeenCalledTimes(2);
    expect(authoritative.folders[0]).toMatchObject({
      name: 'After',
      color: '#40c057',
      updatedAt: mutation.updatedAt,
    });
    expect(authoritative.mutationRevision).toBe(initial.mutationRevision + 1);
  });

  it('rejects a category waiter when recovery contains an intervening newer edit', async () => {
    vi.useFakeTimers();
    const initial: TabBoardState = {
      ...createEmptyState(),
      folders: [folder('folder-conflict', 'Before')],
    };
    const newer: TabBoardState = {
      ...initial,
      folders: [{
        ...initial.folders[0],
        name: 'Remote',
        color: '#fa5252',
        updatedAt: '2026-01-03T00:00:00.000Z',
      }],
      mutationRevision: initial.mutationRevision + 1,
      updatedAt: '2026-01-03T00:00:00.000Z',
    };
    const harness = createHarness(initial);
    let attempts = 0;
    harness.dependencies.sendMutations = vi.fn(async (
      mutations: readonly StateMutation[],
    ) => {
      attempts += 1;
      if (attempts === 1) {
        harness.setAuthoritative(newer);
        throw new Error('response lost before conflict recovery');
      }
      return applyStateMutations(newer, mutations);
    });
    const publication = createAuthoritativePublication(harness.dependencies);
    const persistence = publication.commitCategory({
      type: 'update-folder',
      id: 'folder-conflict',
      name: 'After',
      color: '#40c057',
      expected: { name: 'Before', color: 'slate' },
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    const outcome = persistence.then(
      () => 'resolved' as const,
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(250);
    await expect(outcome).resolves.toMatchObject({
      code: 'CATEGORY_MUTATION_CONFLICT',
    });
    expect(harness.getProjection().state.folders[0]).toMatchObject({
      name: 'Remote',
      color: '#fa5252',
    });
  });

  it('retries an exact category order after response loss without a second revision', async () => {
    vi.useFakeTimers();
    const custom = folder('folder-order-response-lost', 'Work');
    const initial: TabBoardState = {
      ...createEmptyState(),
      folders: [custom],
      categoryOrderByWorkspace: {
        workspace_default: ['inbox', 'saved', 'bookmarks', 'archive', custom.id],
      },
    };
    const harness = createHarness(initial);
    let authoritative = initial;
    let attempts = 0;
    harness.dependencies.sendMutations = vi.fn(async (
      mutations: readonly StateMutation[],
    ) => {
      attempts += 1;
      authoritative = applyStateMutations(authoritative, mutations);
      harness.setAuthoritative(authoritative);
      if (attempts === 1) throw new Error('order response lost after commit');
      return authoritative;
    });
    const publication = createAuthoritativePublication(harness.dependencies);
    const mutation: StateMutation = {
      type: 'set-category-order',
      workspaceId: 'workspace_default',
      expectedCategoryOrder: [
        'inbox',
        'saved',
        'bookmarks',
        'archive',
        `folder:${custom.id}`,
      ],
      categoryOrder: [
        `folder:${custom.id}`,
        'inbox',
        'saved',
        'bookmarks',
        'archive',
      ],
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    const persistence = publication.commitCategory(mutation);

    await vi.advanceTimersByTimeAsync(250);
    await expect(persistence).resolves.toBeUndefined();
    expect(harness.dependencies.sendMutations).toHaveBeenCalledTimes(2);
    expect(authoritative.mutationRevision).toBe(initial.mutationRevision + 1);
    expect(authoritative.updatedAt).toBe(mutation.updatedAt);
  });

  it('rejects a category order waiter and retains an intervening newer order', async () => {
    vi.useFakeTimers();
    const custom = folder('folder-order-conflict', 'Work');
    const initial: TabBoardState = {
      ...createEmptyState(),
      folders: [custom],
      categoryOrderByWorkspace: {
        workspace_default: ['inbox', 'saved', 'bookmarks', 'archive', custom.id],
      },
    };
    const newer: TabBoardState = {
      ...initial,
      categoryOrderByWorkspace: {
        workspace_default: ['saved', 'inbox', 'bookmarks', 'archive', custom.id],
      },
      mutationRevision: initial.mutationRevision + 1,
      updatedAt: '2026-01-03T00:00:00.000Z',
    };
    const harness = createHarness(initial);
    let attempts = 0;
    harness.dependencies.sendMutations = vi.fn(async (
      mutations: readonly StateMutation[],
    ) => {
      attempts += 1;
      if (attempts === 1) {
        harness.setAuthoritative(newer);
        throw new Error('order response lost before conflict recovery');
      }
      return applyStateMutations(newer, mutations);
    });
    const publication = createAuthoritativePublication(harness.dependencies);
    const persistence = publication.commitCategory({
      type: 'set-category-order',
      workspaceId: 'workspace_default',
      expectedCategoryOrder: [
        'inbox',
        'saved',
        'bookmarks',
        'archive',
        `folder:${custom.id}`,
      ],
      categoryOrder: [
        `folder:${custom.id}`,
        'inbox',
        'saved',
        'bookmarks',
        'archive',
      ],
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    const outcome = persistence.then(
      () => 'resolved' as const,
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(250);
    await expect(outcome).resolves.toMatchObject({
      code: 'CATEGORY_MUTATION_CONFLICT',
    });
    expect(harness.getProjection().state.categoryOrderByWorkspace.workspace_default)
      .toEqual(['saved', 'inbox', 'bookmarks', 'archive', custom.id]);
  });

  it('settles drop waiters by partial-commit indexes and publishes committed siblings', async () => {
    vi.useFakeTimers();
    const initial: TabBoardState = {
      ...createEmptyState(),
      groups: [group('valid-drop'), group('invalid-drop')],
    };
    const harness = createHarness(initial);
    harness.dependencies.sendMutations = vi.fn(async (
      mutations: readonly StateMutation[],
    ) => {
      const committedState = applyStateMutations(
        initial,
        mutations.filter((_, index) => index !== 1),
      );
      throw new InvalidDropMutationError(
        'Invalid drop intent.',
        [1],
        [0, 2],
        committedState,
      );
    });
    const publication = createAuthoritativePublication(harness.dependencies);
    const valid = publication.commitDrop(
      dropMutation('valid-drop-operation', 'valid-drop'),
    );
    const invalid = publication.commitDrop(
      dropMutation('invalid-drop-operation', 'invalid-drop', 1),
    );
    const invalidOutcome = invalid.then(
      () => 'resolved' as const,
      (error: unknown) => error,
    );
    publication.commit({
      type: 'update-settings',
      updates: { theme: 'dark' },
      updatedAt: timestamp,
    });

    await vi.advanceTimersByTimeAsync(100);

    await expect(valid).resolves.toBeUndefined();
    await expect(invalidOutcome).resolves.toMatchObject({
      code: 'INVALID_DROP_INTENT',
    });
    expect(
      harness.getProjection().state.groups.find(({ id }) => id === 'valid-drop')
        ?.starred,
    ).toBe(true);
    expect(
      harness.getProjection().state.groups.find(({ id }) => id === 'invalid-drop')
        ?.starred,
    ).toBe(false);
    expect(harness.getProjection().state.settings.theme).toBe('dark');
  });

  it('removes a colliding restore while retaining its ordinary sibling for retry', async () => {
    vi.useFakeTimers();
    const restoredGroup = group('restored-group');
    const entry: BinEntry = {
      id: 'restore-entry',
      kind: 'group',
      label: restoredGroup.title,
      groupId: restoredGroup.id,
      groupTitle: restoredGroup.title,
      source: 'group',
      item: restoredGroup,
      deletedAt: timestamp,
      originalWorkspaceId: 'workspace_default',
      originalFolderId: null,
      originalIndex: 0,
    };
    const initial: TabBoardState = {
      ...createEmptyState(),
      bin: [entry],
    };
    const harness = createHarness(initial);
    let attempts = 0;
    harness.dependencies.sendMutations = vi.fn(async (
      mutations: readonly StateMutation[],
    ) => {
      attempts += 1;
      if (attempts === 1) throw new RestoreCollisionError();
      const committed = applyStateMutations(initial, mutations);
      harness.setAuthoritative(committed);
      return committed;
    });
    const publication = createAuthoritativePublication(harness.dependencies);

    publication.commitRestore({
      type: 'restore-group',
      entryId: entry.id,
      group: restoredGroup,
      index: 0,
      updatedAt: timestamp,
    });
    publication.commit({
      type: 'update-settings',
      updates: { theme: 'dark' },
      updatedAt: timestamp,
    });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(250);

    expect(harness.dependencies.sendMutations).toHaveBeenCalledTimes(2);
    expect(harness.dependencies.sendMutations).toHaveBeenLastCalledWith([
      expect.objectContaining({ type: 'update-settings' }),
    ]);
    expect(harness.getProjection().state.groups).toEqual([]);
    expect(harness.getProjection().state.bin).toEqual([entry]);
    expect(harness.getProjection().state.settings.theme).toBe('dark');
  });

  it('isolates a terminal ordinary mutation and commits valid siblings', async () => {
    const initial: TabBoardState = {
      ...createEmptyState(),
      groups: [group('locked-group')],
    };
    const harness = createHarness(initial);
    let authoritative = initial;
    const sentTypes: string[][] = [];
    harness.dependencies.sendMutations = vi.fn(async (
      mutations: readonly StateMutation[],
    ) => {
      sentTypes.push(mutations.map(({ type }) => type));
      if (mutations.some(({ type }) => type === 'update-group')) {
        throw Object.assign(
          new Error('Cannot modify a locked group.'),
          { code: 'GROUP_LOCKED' },
        );
      }
      authoritative = applyStateMutations(authoritative, mutations);
      harness.setAuthoritative(authoritative);
      return authoritative;
    });
    const publication = createAuthoritativePublication(harness.dependencies);
    publication.commit({
      type: 'update-group',
      id: 'locked-group',
      updates: { title: 'Rejected title' },
      updatedAt: timestamp,
    });
    publication.commit({
      type: 'update-settings',
      updates: { theme: 'dark' },
      updatedAt: timestamp,
    });
    const category = publication.commitCategory({
      type: 'add-folder',
      folder: folder('work-folder', 'Work'),
    });

    await expect(category).resolves.toBeUndefined();

    expect(sentTypes).toEqual([
      ['update-group', 'update-settings', 'add-folder'],
      ['update-group'],
      ['update-settings'],
      ['add-folder'],
    ]);
    expect(harness.getProjection().state.groups[0]?.title).toBe('locked-group');
    expect(harness.getProjection().state.settings.theme).toBe('dark');
    expect(harness.getProjection().state.folders.map(({ name }) => name))
      .toEqual(['Work']);
  });

  it('retains a mutation committed while terminal isolation is in flight', async () => {
    vi.useFakeTimers();
    const initial: TabBoardState = {
      ...createEmptyState(),
      groups: [group('isolation-queue-group')],
    };
    const harness = createHarness(initial);
    let authoritative = initial;
    let rejectIsolated: ((error: unknown) => void) | undefined;
    const sentTypes: string[][] = [];
    harness.dependencies.sendMutations = vi.fn((
      mutations: readonly StateMutation[],
    ) => {
      sentTypes.push(mutations.map(({ type }) => type));
      if (mutations.length > 1
        && mutations.some(({ type }) => type === 'update-group')) {
        return Promise.reject(Object.assign(
          new Error('Cannot modify a locked group.'),
          { code: 'GROUP_LOCKED' },
        ));
      }
      if (mutations[0]?.type === 'update-group') {
        return new Promise<TabBoardState>((_resolve, reject) => {
          rejectIsolated = reject;
        });
      }
      authoritative = applyStateMutations(authoritative, mutations);
      harness.setAuthoritative(authoritative);
      return Promise.resolve(authoritative);
    });
    const publication = createAuthoritativePublication(harness.dependencies);
    publication.commit({
      type: 'update-group',
      id: 'isolation-queue-group',
      updates: { title: 'Rejected title' },
      updatedAt: timestamp,
    });
    publication.commit({
      type: 'update-settings',
      updates: { theme: 'dark' },
      updatedAt: timestamp,
    });
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => expect(sentTypes).toHaveLength(2));

    publication.commit({
      type: 'update-settings',
      updates: { closeTabsAfterSave: false },
      updatedAt: timestamp,
    });
    rejectIsolated?.(Object.assign(
      new Error('Cannot modify a locked group.'),
      { code: 'GROUP_LOCKED' },
    ));
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => {
      expect(harness.getProjection().state.settings).toMatchObject({
        theme: 'dark',
        closeTabsAfterSave: false,
      });
    });

    expect(harness.getProjection().state.groups[0]?.title)
      .toBe('isolation-queue-group');
  });

  it('rejects a category sibling with its own validation error during isolation', async () => {
    const initial: TabBoardState = {
      ...createEmptyState(),
      groups: [group('category-validation-group')],
    };
    const harness = createHarness(initial);
    harness.dependencies.sendMutations = vi.fn(async (
      mutations: readonly StateMutation[],
    ) => {
      if (mutations.some(({ type }) => type === 'update-group')) {
        throw Object.assign(
          new Error('Cannot modify a locked group.'),
          { code: 'GROUP_LOCKED' },
        );
      }
      throw new CategoryValidationError('Category name is required.');
    });
    const publication = createAuthoritativePublication(harness.dependencies);
    publication.commit({
      type: 'update-group',
      id: 'category-validation-group',
      updates: { title: 'Rejected title' },
      updatedAt: timestamp,
    });

    const category = publication.commitCategory({
      type: 'add-folder',
      folder: folder('invalid-isolated-folder', 'Invalid'),
    });

    await expect(category).rejects.toMatchObject({
      code: 'CATEGORY_VALIDATION',
    });
    expect(harness.getProjection().state.folders).toEqual([]);
    expect(harness.getProjection().state.groups[0]?.title)
      .toBe('category-validation-group');
  });
});

describe('authoritative publication lifecycle', () => {
  it('shares one in-flight hydration and creates one subscription', async () => {
    const harness = createHarness();
    harness.dependencies.patchStatus({ hydrated: false });
    let resolveInitialize: ((state: TabBoardState) => void) | undefined;
    harness.dependencies.initializeAuthoritativeState = vi.fn(() =>
      new Promise<TabBoardState>((resolve) => {
        resolveInitialize = resolve;
      }),
    );
    const subscribe = vi.fn(harness.dependencies.subscribeAuthoritativeState);
    harness.dependencies.subscribeAuthoritativeState = subscribe;
    const publication = createAuthoritativePublication(harness.dependencies);

    const first = publication.hydrate();
    const second = publication.hydrate();

    expect(second).toBe(first);
    expect(harness.dependencies.initializeAuthoritativeState).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    resolveInitialize?.(harness.getProjection().state);
    await Promise.all([first, second]);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(harness.getProjection().hydrated).toBe(true);
  });

  it.each([
    {
      name: 'newer publication',
      readUpdatedAt: '2026-01-02T00:00:00.000Z',
      eventUpdatedAt: '9999-01-01T00:00:00.000Z',
      expectedGroupId: 'event-group',
    },
    {
      name: 'newer read',
      readUpdatedAt: '9999-01-01T00:00:00.000Z',
      eventUpdatedAt: '2026-01-02T00:00:00.000Z',
      expectedGroupId: 'read-group',
    },
  ])('chooses the $name observed across the initial read gap', async ({
    readUpdatedAt,
    eventUpdatedAt,
    expectedGroupId,
  }) => {
    const initial = createEmptyState();
    const harness = createHarness(initial);
    harness.dependencies.patchStatus({ hydrated: false });
    let subscriber: ((state: TabBoardState) => void) | undefined;
    harness.dependencies.subscribeAuthoritativeState = (callback) => {
      subscriber = callback;
      return () => undefined;
    };
    const readState: TabBoardState = {
      ...initial,
      groups: [group('read-group')],
      updatedAt: readUpdatedAt,
    };
    const eventState: TabBoardState = {
      ...initial,
      groups: [group('event-group')],
      updatedAt: eventUpdatedAt,
    };
    harness.dependencies.initializeAuthoritativeState = vi.fn(async () => {
      subscriber?.(eventState);
      return readState;
    });
    const publication = createAuthoritativePublication(harness.dependencies);

    await publication.hydrate();

    expect(harness.getProjection().state.groups.map(({ id }) => id))
      .toEqual([expectedGroupId]);
  });

  it('unsubscribes when release wins an in-flight initialization', async () => {
    const harness = createHarness();
    harness.dependencies.patchStatus({ hydrated: false });
    let resolveInitialize: ((state: TabBoardState) => void) | undefined;
    harness.dependencies.initializeAuthoritativeState = () =>
      new Promise<TabBoardState>((resolve) => {
        resolveInitialize = resolve;
      });
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(harness.dependencies.subscribeAuthoritativeState);
    harness.dependencies.subscribeAuthoritativeState = (callback) => {
      subscribe(callback);
      return unsubscribe;
    };
    const publication = createAuthoritativePublication(harness.dependencies);

    const hydration = publication.hydrate();
    publication.releaseHydration();
    resolveInitialize?.(harness.getProjection().state);
    await hydration;

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.getProjection().hydrated).toBe(false);
  });

  it('ignores a stale subscription callback after release', async () => {
    const initial = createEmptyState();
    const harness = createHarness(initial);
    harness.dependencies.patchStatus({ hydrated: false });
    let staleCallback: ((state: TabBoardState) => void) | undefined;
    harness.dependencies.subscribeAuthoritativeState = (callback) => {
      staleCallback = callback;
      return () => undefined;
    };
    const publication = createAuthoritativePublication(harness.dependencies);
    await publication.hydrate();
    publication.releaseHydration();

    staleCallback?.({
      ...initial,
      groups: [group('stale-group')],
      updatedAt: '9999-01-01T00:00:00.000Z',
    });

    expect(harness.getProjection().state.groups).toEqual([]);
    expect(harness.getProjection().hydrated).toBe(false);
  });

  it('reports hydration failure without notification and permits retry', async () => {
    const harness = createHarness();
    harness.dependencies.patchStatus({ hydrated: false });
    let attempts = 0;
    harness.dependencies.initializeAuthoritativeState = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('storage unavailable');
      return harness.getProjection().state;
    });
    const publication = createAuthoritativePublication(harness.dependencies);

    await expect(publication.hydrate()).rejects.toThrow('storage unavailable');
    expect(harness.dependencies.onPersistenceError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'storage unavailable' }),
      false,
    );
    expect(harness.getProjection().hydrated).toBe(false);

    await expect(publication.hydrate()).resolves.toBeUndefined();
    expect(attempts).toBe(2);
    expect(harness.getProjection().hydrated).toBe(true);
  });

  it('rejects old waiters and sends only new work after context replacement', async () => {
    vi.useFakeTimers();
    const initial: TabBoardState = {
      ...createEmptyState(),
      groups: [group('context-drop')],
    };
    const harness = createHarness(initial);
    let context = 'context-a';
    harness.dependencies.currentContext = () => context;
    const publication = createAuthoritativePublication(harness.dependencies);
    const oldDrop = publication.commitDrop(
      dropMutation('context-drop-operation', 'context-drop'),
    );
    const oldDropOutcome = oldDrop.then(
      () => 'resolved' as const,
      (error: unknown) => error,
    );

    context = 'context-b';
    publication.commit({
      type: 'update-settings',
      updates: { theme: 'dark' },
      updatedAt: timestamp,
    });
    await vi.advanceTimersByTimeAsync(100);

    await expect(oldDropOutcome).resolves.toMatchObject({
      message: 'Persistence context changed.',
    });
    expect(harness.sentBatches.map((batch) => batch.map(({ type }) => type)))
      .toEqual([['update-settings']]);
    expect(harness.getProjection().state.groups[0]?.starred).toBe(false);
    expect(harness.getProjection().state.settings.theme).toBe('dark');
  });

  it('does not let an old in-flight context overwrite new-context publication', async () => {
    vi.useFakeTimers();
    const initial = createEmptyState();
    const harness = createHarness(initial);
    let context = 'context-a';
    let resolveOld: ((state: TabBoardState) => void) | undefined;
    let newAuthoritative = initial;
    harness.dependencies.currentContext = () => context;
    harness.dependencies.sendMutations = vi.fn((
      mutations: readonly StateMutation[],
    ) => {
      const settings = mutations[0]?.type === 'update-settings'
        ? mutations[0].updates
        : {};
      if (settings.theme === 'dark') {
        return new Promise<TabBoardState>((resolve) => {
          resolveOld = resolve;
        });
      }
      newAuthoritative = applyStateMutations(newAuthoritative, mutations);
      harness.setAuthoritative(newAuthoritative);
      return Promise.resolve(newAuthoritative);
    });
    const publication = createAuthoritativePublication(harness.dependencies);
    publication.commit({
      type: 'update-settings',
      updates: { theme: 'dark' },
      updatedAt: timestamp,
    });
    await vi.advanceTimersByTimeAsync(100);

    context = 'context-b';
    publication.commit({
      type: 'update-settings',
      updates: { closeTabsAfterSave: false },
      updatedAt: timestamp,
    });
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => {
      expect(harness.getProjection().state.settings.closeTabsAfterSave)
        .toBe(false);
    });

    resolveOld?.(applyStateMutations(initial, [{
      type: 'update-settings',
      updates: { theme: 'dark' },
      updatedAt: timestamp,
    }]));
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.getProjection().state.settings).toMatchObject({
      theme: 'system',
      closeTabsAfterSave: false,
    });
  });

  it('dispose cancels a scheduled retry and rejects its waiter', async () => {
    vi.useFakeTimers();
    const initial: TabBoardState = {
      ...createEmptyState(),
      groups: [group('dispose-drop')],
    };
    const harness = createHarness(initial);
    harness.dependencies.sendMutations = vi.fn(async () => {
      throw new Error('temporary failure');
    });
    const publication = createAuthoritativePublication(harness.dependencies);
    const persistence = publication.commitDrop(
      dropMutation('dispose-drop-operation', 'dispose-drop'),
    );
    const outcome = persistence.then(
      () => 'resolved' as const,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(100);

    publication.dispose();
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(outcome).resolves.toMatchObject({
      message: 'Authoritative publication is disposed.',
    });
    expect(harness.dependencies.sendMutations).toHaveBeenCalledTimes(1);
  });
});
