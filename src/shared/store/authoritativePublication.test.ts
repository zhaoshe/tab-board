import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyState,
  type Group,
  type TabBoardState,
} from '../model';
import { applyStateMutations, type StateMutation } from './stateMutations';
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
    ensureState: async () => authoritative,
    readAuthoritativeState: async () => authoritative,
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
