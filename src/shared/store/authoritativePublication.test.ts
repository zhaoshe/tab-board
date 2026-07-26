import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyState, type TabBoardState } from '../model';
import { applyStateMutations, type StateMutation } from './stateMutations';
import {
  createAuthoritativePublication,
  type AuthoritativePublicationDependencies,
  type PublicationProjection,
} from './authoritativePublication';

const timestamp = '2026-01-01T00:00:00.000Z';

function createHarness() {
  let projection: PublicationProjection = {
    state: createEmptyState(),
    hydrated: true,
    persistenceError: null,
  };
  let authoritative = projection.state;
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
    subscribeAuthoritativeState: () => () => undefined,
    sendMutations,
    currentContext: () => 'test-context',
    onPersistenceError: vi.fn(),
    onMutationCommitted: vi.fn(),
  };
  return {
    dependencies,
    getProjection: () => projection,
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
