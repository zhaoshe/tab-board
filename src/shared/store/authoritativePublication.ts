import { DROP_OPERATION_LEDGER_LIMIT, type TabBoardState } from '../model';
import { applyStateMutation, type StateMutation } from './stateMutations';
import { structurallyShareState } from './stateStructuralSharing';

export interface PublicationProjection {
  state: TabBoardState;
  hydrated: boolean;
  persistenceError: string | null;
}

type PublicationStatus = Partial<
  Pick<PublicationProjection, 'hydrated' | 'persistenceError'>
>;

export type CategoryStateMutation = Extract<
  StateMutation,
  { type: 'add-folder' | 'rename-folder' | 'delete-folder' | 'set-category-order' }
>;

type RestoreStateMutation = Extract<
  StateMutation,
  { type: 'restore-group' | 'restore-tab' }
>;

type DropStateMutation = Extract<StateMutation, { type: 'drop-intent' }>;

export interface AuthoritativePublicationDependencies {
  readProjection(): PublicationProjection;
  publishProjection(state: TabBoardState, status?: PublicationStatus): void;
  patchStatus(status: PublicationStatus): void;
  ensureState(): Promise<TabBoardState>;
  readAuthoritativeState(): Promise<TabBoardState>;
  subscribeAuthoritativeState(callback: (state: TabBoardState) => void): () => void;
  sendMutations(mutations: readonly StateMutation[]): Promise<TabBoardState>;
  currentContext(): unknown;
  onPersistenceError(error: unknown, notify: boolean): void;
  onMutationCommitted(mutation: StateMutation): void;
}

export interface AuthoritativePublication {
  commit(mutation: StateMutation): void;
  commitRestore(mutation: RestoreStateMutation): void;
  commitDrop(mutation: DropStateMutation): Promise<void>;
  commitCategory(mutation: CategoryStateMutation): Promise<void>;
  hydrate(): Promise<void>;
  releaseHydration(): void;
  dispose(): void;
}

const SAVE_DELAY_MS = 100;

function seedCommittedDropLedger(
  base: TabBoardState,
  authoritative: TabBoardState,
  mutations: readonly StateMutation[],
): TabBoardState {
  const committedOperationIds = new Set(
    mutations.flatMap((mutation) => mutation.type === 'drop-intent'
      ? [mutation.operationId]
      : []),
  );
  if (!committedOperationIds.size) return base;
  const entries = new Map(
    (base.dropOperationLedger || []).map((entry) => [entry.operationId, entry]),
  );
  (authoritative.dropOperationLedger || [])
    .filter((entry) => committedOperationIds.has(entry.operationId))
    .forEach((entry) => entries.set(entry.operationId, entry));
  return {
    ...base,
    mutationRevision: Math.max(
      base.mutationRevision,
      authoritative.mutationRevision,
    ),
    dropOperationLedger: [...entries.values()]
      .sort((left, right) => left.appliedAt.localeCompare(right.appliedAt))
      .slice(-DROP_OPERATION_LEDGER_LIMIT),
  };
}

function stateFingerprintWithoutVolatileMetadata(state: TabBoardState): string {
  return JSON.stringify(state, (key, value) =>
    key === 'updatedAt' || key === 'mutationRevision' ? undefined : value,
  );
}

function isMutationAlreadyReflected(
  state: TabBoardState,
  mutation: StateMutation,
): boolean {
  try {
    return stateFingerprintWithoutVolatileMetadata(state) ===
      stateFingerprintWithoutVolatileMetadata(
        applyStateMutation(state, mutation),
      );
  } catch {
    return false;
  }
}

function replayCommittedMutations(
  newestRemoteState: TabBoardState,
  authoritative: TabBoardState,
  committedMutations: readonly StateMutation[],
): TabBoardState {
  const replayBase = seedCommittedDropLedger(
    newestRemoteState,
    authoritative,
    committedMutations,
  );
  const committedDropOperationIds = new Set(
    committedMutations.flatMap((mutation) => mutation.type === 'drop-intent'
      ? [mutation.operationId]
      : []),
  );
  const replayed = committedMutations.reduce((current, mutation) => {
    if (mutation.type === 'drop-intent'
      && committedDropOperationIds.has(mutation.operationId)) {
      return current;
    }
    if (isMutationAlreadyReflected(current, mutation)) return current;
    try {
      return applyStateMutation(current, mutation);
    } catch {
      return current;
    }
  }, replayBase);
  return replayed === replayBase
    ? replayBase
    : {
      ...replayed,
      mutationRevision: replayBase.mutationRevision,
      updatedAt: replayBase.updatedAt,
    };
}

function remoteStateTimestamp(state: TabBoardState): number {
  const timestamp = Date.parse(state.updatedAt);
  return Number.isFinite(timestamp)
    ? timestamp
    : Number.NEGATIVE_INFINITY;
}

function newestRemoteState(
  authoritative: TabBoardState,
  buffered: TabBoardState | null,
): TabBoardState {
  if (!buffered) return authoritative;
  if (buffered.mutationRevision !== authoritative.mutationRevision) {
    return buffered.mutationRevision > authoritative.mutationRevision
      ? buffered
      : authoritative;
  }
  return remoteStateTimestamp(buffered) >= remoteStateTimestamp(authoritative)
    ? buffered
    : authoritative;
}

function hasDistinctNewerRemoteState(
  authoritative: TabBoardState,
  buffered: TabBoardState | null,
): boolean {
  if (!buffered) return false;
  if (buffered.mutationRevision !== authoritative.mutationRevision) {
    return buffered.mutationRevision > authoritative.mutationRevision;
  }
  return remoteStateTimestamp(buffered) > remoteStateTimestamp(authoritative);
}

interface ReconciliationFailure {
  mutation: StateMutation;
  error: unknown;
}

export function createAuthoritativePublication(
  dependencies: AuthoritativePublicationDependencies,
): AuthoritativePublication {
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingMutations: StateMutation[] = [];
  let inFlightMutations: StateMutation[] | null = null;
  let pendingRemoteState: TabBoardState | null = null;
  let lastAuthoritativeState: TabBoardState | null = null;
  let publicationQueue: Promise<unknown> = Promise.resolve();
  let hydrationPromise: Promise<void> | null = null;
  let hydrationUnsubscribe: (() => void) | null = null;
  let disposed = false;

  const publishOptimisticMutation = (mutation: StateMutation): void => {
    const projection = dependencies.readProjection();
    if (!pendingMutations.length && !inFlightMutations) {
      lastAuthoritativeState = projection.state;
    }
    const next = applyStateMutation(projection.state, mutation);
    dependencies.publishProjection(
      structurallyShareState(projection.state, next),
      {
        hydrated: projection.hydrated,
        persistenceError: projection.persistenceError,
      },
    );
    pendingMutations = [...pendingMutations, mutation];
  };

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const run = publicationQueue.then(operation);
    publicationQueue = run.then(() => undefined, () => undefined);
    return run;
  };

  const reconcileAuthoritativeState = (
    authoritative: TabBoardState,
    committedMutations: readonly StateMutation[] = [],
  ): ReconciliationFailure[] => {
    const projection = dependencies.readProjection();
    const buffered = pendingRemoteState;
    pendingRemoteState = null;
    const reconciledRemoteState = newestRemoteState(authoritative, buffered);
    const reconciledBase = hasDistinctNewerRemoteState(authoritative, buffered)
      ? replayCommittedMutations(
        reconciledRemoteState,
        authoritative,
        committedMutations,
      )
      : reconciledRemoteState;
    const failures: ReconciliationFailure[] = [];
    const retainedPending: StateMutation[] = [];
    let optimistic = reconciledBase;
    pendingMutations.forEach((mutation) => {
      try {
        optimistic = applyStateMutation(optimistic, mutation);
        retainedPending.push(mutation);
      } catch (error: unknown) {
        if (mutation.type === 'drop-intent') {
          retainedPending.push(mutation);
        } else {
          failures.push({ mutation, error });
        }
      }
    });
    pendingMutations = retainedPending;
    lastAuthoritativeState = structurallyShareState(
      lastAuthoritativeState || projection.state,
      reconciledBase,
    );
    dependencies.publishProjection(
      structurallyShareState(projection.state, optimistic),
      {
        hydrated: projection.hydrated,
        persistenceError: projection.persistenceError,
      },
    );
    return failures;
  };

  const acceptRemoteState = (state: TabBoardState): void => {
    if (disposed) return;
    if (pendingMutations.length || inFlightMutations) {
      pendingRemoteState = newestRemoteState(state, pendingRemoteState);
      return;
    }
    const projection = dependencies.readProjection();
    const shared = structurallyShareState(projection.state, state);
    lastAuthoritativeState = shared;
    dependencies.publishProjection(shared, {
      hydrated: projection.hydrated,
      persistenceError: projection.persistenceError,
    });
  };

  const sendPendingBatch = (): Promise<TabBoardState | null> => enqueue(async () => {
    const batch = pendingMutations;
    pendingMutations = [];
    if (!batch.length || disposed) return null;
    inFlightMutations = batch;
    const authoritative = await dependencies.sendMutations(batch);
    inFlightMutations = null;
    const failures = reconcileAuthoritativeState(authoritative, batch);
    batch.forEach(dependencies.onMutationCommitted);
    if (failures.length) {
      dependencies.onPersistenceError(failures[0].error, true);
    }
    return authoritative;
  });

  const scheduleSave = (): void => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveTimeout = null;
      void sendPendingBatch().catch((error: unknown) => {
        dependencies.onPersistenceError(error, true);
      });
    }, SAVE_DELAY_MS);
  };

  const commit = (mutation: StateMutation): void => {
    if (disposed) return;
    publishOptimisticMutation(mutation);
    scheduleSave();
  };

  return {
    commit,
    commitRestore: commit,
    commitDrop: (mutation) => {
      commit(mutation);
      return Promise.resolve();
    },
    commitCategory: (mutation) => {
      commit(mutation);
      return Promise.resolve();
    },
    hydrate: () => {
      if (hydrationPromise) return hydrationPromise;
      hydrationPromise = (async () => {
        await dependencies.ensureState();
        if (disposed) return;
        hydrationUnsubscribe?.();
        hydrationUnsubscribe = dependencies.subscribeAuthoritativeState(
          acceptRemoteState,
        );
        const authoritative = await dependencies.readAuthoritativeState();
        if (disposed) return;
        const projection = dependencies.readProjection();
        const shared = structurallyShareState(
          projection.state,
          newestRemoteState(authoritative, pendingRemoteState),
        );
        pendingRemoteState = null;
        lastAuthoritativeState = shared;
        dependencies.publishProjection(shared, {
          hydrated: true,
          persistenceError: null,
        });
      })();
      return hydrationPromise;
    },
    releaseHydration: () => {
      hydrationUnsubscribe?.();
      hydrationUnsubscribe = null;
      hydrationPromise = null;
      dependencies.patchStatus({ hydrated: false });
    },
    dispose: () => {
      disposed = true;
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = null;
      pendingMutations = [];
      inFlightMutations = null;
      pendingRemoteState = null;
      lastAuthoritativeState = null;
      hydrationUnsubscribe?.();
      hydrationUnsubscribe = null;
      hydrationPromise = null;
    },
  };
}
