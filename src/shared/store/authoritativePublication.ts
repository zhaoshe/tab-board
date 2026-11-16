import { restoreOutcome, isOrigin, restoreError, sameOrigin, type BoundSnapshot, type OriginScope, type RestorePreview, type RestoreRequest, type MutationCommitAck } from './restoreCommit';
import { DROP_OPERATION_LEDGER_LIMIT, type TabBoardState } from '../model';
import type { StorageObservation } from './storageAdapter';
import {
  applyStateMutation,
  CategoryValidationError,
  InvalidDropMutationError,
  type StateMutation,
} from './stateMutations';
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
  { type: 'add-folder' | 'rename-folder' | 'update-folder' | 'delete-folder' | 'set-category-order' }
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
  initializeAuthoritativeState(): Promise<TabBoardState>;
  readRestoreSnapshot?(): Promise<BoundSnapshot>;
  subscribeAuthoritativeState(callback: (state: TabBoardState, observation?: StorageObservation) => void): () => void;
  sendMutations(mutations: readonly StateMutation[], request?: RestoreRequest): Promise<TabBoardState | MutationCommitAck>;
  currentContext(): unknown;
  currentDataset(): unknown;
  onPersistenceError(error: unknown, notify: boolean): void;
  onMutationCommitted(mutation: StateMutation): void;
}

export interface AuthoritativePublication {
  captureRestorePreview(): Promise<RestorePreview>;
  commitCompleteRestore(mutation: Extract<StateMutation, { type: 'restore-backup' }>, preview: RestorePreview): Promise<void>;
  reconcileCaptureCommit(canonical: TabBoardState): void;
  commit(mutation: StateMutation): void;
  commitChecked(mutation: StateMutation): Promise<void>;
  commitRestore(mutation: RestoreStateMutation): void;
  commitDrop(mutation: DropStateMutation): Promise<void>;
  commitCategory(mutation: CategoryStateMutation): Promise<void>;
  hydrate(): Promise<void>;
  releaseHydration(): void;
  dispose(): void;
}

const SAVE_DELAY_MS = 100;
const PERSISTENCE_RETRY_DELAYS_MS = [250, 1_000, 4_000] as const;

interface PendingPersistenceWaiter {
  mutation: StateMutation;
  resolve: () => void;
  reject: (error: unknown) => void;
}

function sameMutation(left: StateMutation, right: StateMutation): boolean {
  return left === right || (
    left.type === 'drop-intent'
    && right.type === 'drop-intent'
    && left.operationId === right.operationId
  );
}

function isCategoryMutation(mutation: StateMutation): boolean {
  return mutation.type === 'add-folder'
    || mutation.type === 'rename-folder'
    || mutation.type === 'update-folder'
    || mutation.type === 'delete-folder'
    || mutation.type === 'set-category-order';
}

function isCategoryValidationError(error: unknown): boolean {
  return Boolean(
    error instanceof CategoryValidationError
    || (
      error
      && typeof error === 'object'
      && 'code' in error
      && (error as { code?: unknown }).code === 'CATEGORY_VALIDATION'
    ),
  );
}

function isRestoreCollisionError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === 'RESTORE_ID_COLLISION',
  );
}

function persistenceErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function isTerminalSemanticError(error: unknown): boolean {
  const code = persistenceErrorCode(error);
  return Boolean(
    code
    && code !== 'INVALID_DROP_INTENT'
    && code !== 'RESTORE_ID_COLLISION',
  );
}

function invalidDropIndexes(
  error: unknown,
  batch: readonly StateMutation[],
): Set<number> {
  const code = error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
  const indexes = error
    && typeof error === 'object'
    && 'invalidMutationIndexes' in error
    ? (error as { invalidMutationIndexes?: unknown }).invalidMutationIndexes
    : undefined;
  if (code !== 'INVALID_DROP_INTENT' || !Array.isArray(indexes)) {
    return batch.length === 1
      && batch[0]?.type === 'drop-intent'
      && error instanceof InvalidDropMutationError
      ? new Set([0])
      : new Set();
  }
  return new Set(indexes.filter((index): index is number =>
    Number.isSafeInteger(index) && index >= 0 && index < batch.length,
  ));
}

function committedMutationIndexes(
  error: unknown,
  batch: readonly StateMutation[],
): Set<number> {
  const indexes = error
    && typeof error === 'object'
    && 'committedMutationIndexes' in error
    ? (error as { committedMutationIndexes?: unknown }).committedMutationIndexes
    : undefined;
  if (!Array.isArray(indexes)) return new Set();
  return new Set(indexes.filter((index): index is number =>
    Number.isSafeInteger(index) && index >= 0 && index < batch.length,
  ));
}

function committedState(error: unknown): TabBoardState | null {
  const value = error
    && typeof error === 'object'
    && 'committedState' in error
    ? (error as { committedState?: unknown }).committedState
    : undefined;
  return value && typeof value === 'object'
    ? value as TabBoardState
    : null;
}

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
  return remoteStateTimestamp(buffered) > remoteStateTimestamp(authoritative)
    ? buffered
    : authoritative;
}

interface RemoteObservation {
  state: TabBoardState;
  explicitReread: boolean;
}

function remoteObservation(
  state: TabBoardState,
  observation?: StorageObservation,
): RemoteObservation {
  return {
    state,
    explicitReread: observation?.kind === 'explicit-reread',
  };
}

function sameRemoteClock(left: TabBoardState, right: TabBoardState): boolean {
  return left.mutationRevision === right.mutationRevision
    && remoteStateTimestamp(left) === remoteStateTimestamp(right);
}

function newestRemoteObservation(
  incumbent: RemoteObservation,
  incoming: RemoteObservation,
): RemoteObservation {
  const newest = newestRemoteState(incumbent.state, incoming.state);
  if (newest === incoming.state) return incoming;
  if (incoming.explicitReread && sameRemoteClock(incumbent.state, incoming.state)) {
    return incoming;
  }
  return incumbent;
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

function selectCanonicalState(
  incoming: TabBoardState,
  buffered: RemoteObservation | null,
  incumbent: TabBoardState | null,
  observation?: StorageObservation,
): TabBoardState {
  let selected: RemoteObservation = incumbent
    ? remoteObservation(incumbent)
    : buffered || remoteObservation(incoming, observation);
  if (buffered) selected = newestRemoteObservation(selected, buffered);
  return newestRemoteObservation(selected, remoteObservation(incoming, observation)).state;
}

function selectCanonicalObservation(
  incoming: RemoteObservation,
  buffered: RemoteObservation | null,
  incumbent: TabBoardState | null,
): RemoteObservation {
  let selected = incumbent ? remoteObservation(incumbent) : buffered || incoming;
  if (buffered) selected = newestRemoteObservation(selected, buffered);
  return newestRemoteObservation(selected, incoming);
}

// Preview rebases only a display copy; settlement keeps the real CAS mutation.
function evaluateOrderedReplay(
  base: TabBoardState,
  mutations: readonly StateMutation[],
  preview = false,
): { state: TabBoardState; retained: StateMutation[]; projected: StateMutation[]; failures: ReconciliationFailure[] } {
  let state = base;
  const retained: StateMutation[] = [];
  const projected: StateMutation[] = [];
  const failures: ReconciliationFailure[] = [];
  mutations.forEach((mutation) => {
    const replay = preview && mutation.type === 'drop-intent'
      ? { ...mutation, expectedRevision: state.mutationRevision }
      : mutation;
    try {
      state = applyStateMutation(state, replay);
      retained.push(mutation);
      projected.push(mutation);
    } catch (error: unknown) {
      if (mutation.type === 'drop-intent') retained.push(mutation);
      if (preview || mutation.type !== 'drop-intent') failures.push({ mutation, error });
    }
  });
  return { state, retained, projected, failures };
}

export function createAuthoritativePublication(
  dependencies: AuthoritativePublicationDependencies,
): AuthoritativePublication {
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  let persistenceRetryAttempt = 0;
  let suppressRetrySchedule = false;
  let canonicalOrigin: OriginScope | undefined;
  const restorePreviews = new WeakMap<StateMutation, RestorePreview>();
  const restoreAttempts = new WeakMap<StateMutation, string>();
  let frozenRestore: { batch: StateMutation[]; request: RestoreRequest } | null = null;
  const unwrap = (value: TabBoardState | BoundSnapshot | MutationCommitAck): TabBoardState => {
    if ('metadata' in value) { canonicalOrigin = value.metadata.origin; return value.state; }
    if ('confirmedByReceipt' in value) { canonicalOrigin = value.origin; return value.state; }
    return value;
  };
  let pendingMutations: StateMutation[] = [];
  let inFlightMutations: StateMutation[] | null = null;
  let projectedMutations = new Set<StateMutation>();
  let pendingRemoteState: RemoteObservation | null = null;
  let lastAuthoritativeState: TabBoardState | null = null;
  let pendingPersistenceWaiters: PendingPersistenceWaiter[] = [];
  let inFlightPersistenceWaiters: PendingPersistenceWaiter[] = [];
  let publicationQueue: Promise<unknown> = Promise.resolve();
  let persistenceContext: unknown;
  let canonicalDataset = dependencies.currentDataset();
  let publicationGeneration = 0;
  let hydrationPromise: Promise<void> | null = null;
  let hydrationUnsubscribe: (() => void) | null = null;
  let hydrationGeneration = 0;
  let disposed = false;

  const publishOptimisticMutation = (mutation: StateMutation): void => {
    const projection = dependencies.readProjection();
    if (!lastAuthoritativeState && !pendingMutations.length && !inFlightMutations) {
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
    projectedMutations.add(mutation);
  };

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const run = publicationQueue.then(operation);
    publicationQueue = run.then(() => undefined, () => undefined);
    return run;
  };

  const takePendingMutations = (): StateMutation[] => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    const batch = pendingMutations;
    pendingMutations = [];
    return batch;
  };

  const takePersistenceWaiters = (
    batch: readonly StateMutation[],
  ): PendingPersistenceWaiter[] => {
    const waiters = pendingPersistenceWaiters.filter(({ mutation }) =>
      batch.some((candidate) => sameMutation(candidate, mutation)),
    );
    pendingPersistenceWaiters = pendingPersistenceWaiters.filter(({ mutation }) =>
      !batch.some((candidate) => sameMutation(candidate, mutation)),
    );
    return waiters;
  };

  const settlePersistenceWaiters = (
    waiters: readonly PendingPersistenceWaiter[],
    batch: readonly StateMutation[],
    error?: unknown,
    committedIndexes: ReadonlySet<number> = new Set(),
    retainedIndexes: ReadonlySet<number> = new Set(),
    errorsByMutation: ReadonlyMap<StateMutation, unknown> = new Map(),
  ): void => {
    const retained = waiters.filter(({ mutation }) =>
      retainedIndexes.has(
        batch.findIndex((candidate) => sameMutation(candidate, mutation)),
      ),
    );
    if (retained.length) {
      pendingPersistenceWaiters = [
        ...retained,
        ...pendingPersistenceWaiters,
      ];
    }
    waiters.forEach(({ mutation, resolve, reject }) => {
      const index = batch.findIndex((candidate) =>
        sameMutation(candidate, mutation),
      );
      if (!error || committedIndexes.has(index)) {
        resolve();
        return;
      }
      if (!retainedIndexes.has(index)) {
        reject(errorsByMutation.get(mutation) || error);
      }
    });
  };

  const rejectPendingPersistenceWaiters = (error: unknown): void => {
    const waiters = [
      ...pendingPersistenceWaiters,
      ...inFlightPersistenceWaiters,
    ];
    pendingPersistenceWaiters = [];
    inFlightPersistenceWaiters = [];
    waiters.forEach(({ reject }) => reject(error));
  };

  const syncPersistenceContext = (): void => {
    const context = dependencies.currentContext();
    if (persistenceContext !== undefined && persistenceContext !== context) {
      const hadOutstandingWork = pendingMutations.length > 0
        || inFlightMutations !== null
        || pendingPersistenceWaiters.length > 0
        || inFlightPersistenceWaiters.length > 0;
      publicationGeneration += 1;
      if (saveTimeout) clearTimeout(saveTimeout);
      if (retryTimeout) clearTimeout(retryTimeout);
      saveTimeout = null;
      retryTimeout = null;
      const projection = dependencies.readProjection();
      if (hadOutstandingWork && lastAuthoritativeState) {
        dependencies.publishProjection(
          structurallyShareState(projection.state, lastAuthoritativeState),
          {
            hydrated: projection.hydrated,
            persistenceError: projection.persistenceError,
          },
        );
      }
      pendingMutations = [];
      frozenRestore = null;
      canonicalOrigin = undefined;
      inFlightMutations = null;
      projectedMutations.clear();
      pendingRemoteState = null;
      lastAuthoritativeState = null;
      persistenceRetryAttempt = 0;
      suppressRetrySchedule = false;
      publicationQueue = Promise.resolve();
      rejectPendingPersistenceWaiters(
        new Error('Persistence context changed.'),
      );
    }
    persistenceContext = context;
  };

  const syncCanonicalDataset = (): boolean => {
    const dataset = dependencies.currentDataset();
    if (canonicalDataset === dataset) return false;
    canonicalDataset = dataset;
    // Revisions order observations only within the selected dataset; queued work keeps its own lifecycle.
    lastAuthoritativeState = null;
    pendingRemoteState = null;
    return true;
  };

  const reconcileAuthoritativeState = (
    authoritative: TabBoardState,
    committedMutations: readonly StateMutation[] = [],
  ): ReconciliationFailure[] => {
    syncCanonicalDataset();
    const projection = dependencies.readProjection();
    const buffered = pendingRemoteState;
    pendingRemoteState = null;
    const reconciledRemoteState = selectCanonicalState(authoritative, buffered, lastAuthoritativeState);
    const shouldReplayCommitted = hasDistinctNewerRemoteState(authoritative, reconciledRemoteState)
      || Boolean(
        buffered?.explicitReread
        && reconciledRemoteState !== authoritative
        && sameRemoteClock(authoritative, buffered.state),
      );
    const reconciledBase = shouldReplayCommitted
      ? replayCommittedMutations(
        reconciledRemoteState,
        authoritative,
        committedMutations,
      )
      : reconciledRemoteState;
    const replay = evaluateOrderedReplay(reconciledBase, pendingMutations);
    pendingMutations = replay.retained;
    projectedMutations = new Set(replay.projected);
    lastAuthoritativeState = structurallyShareState(
      lastAuthoritativeState || projection.state,
      reconciledBase,
    );
    dependencies.publishProjection(
      structurallyShareState(projection.state, replay.state),
      {
        hydrated: projection.hydrated,
        persistenceError: projection.persistenceError,
      },
    );
    return replay.failures;
  };

  const recoverAuthoritativeState = async (): Promise<TabBoardState | null> => {
    syncCanonicalDataset();
    let recovered: TabBoardState | null = null;
    try {
      recovered = unwrap(await dependencies.initializeAuthoritativeState());
    } catch {
      recovered = null;
    }
    syncCanonicalDataset();
    if (recovered) {
      return selectCanonicalState(recovered, pendingRemoteState, lastAuthoritativeState);
    }
    if (lastAuthoritativeState) {
      return pendingRemoteState
        ? newestRemoteObservation(remoteObservation(lastAuthoritativeState), pendingRemoteState).state
        : lastAuthoritativeState;
    }
    return null;
  };

  const rebasePendingDropRevisions = (
    authoritative: TabBoardState,
  ): void => {
    let simulated = authoritative;
    pendingMutations = pendingMutations.map((mutation) => {
      if (mutation.type === 'drop-intent') {
        const next = mutation.expectedRevision === simulated.mutationRevision
          ? mutation
          : { ...mutation, expectedRevision: simulated.mutationRevision };
        if (projectedMutations.delete(mutation)) projectedMutations.add(next);
        try {
          simulated = applyStateMutation(simulated, next);
        } catch {
          // Keep the drop queued; the authority remains final validator.
        }
        return next;
      }
      try {
        simulated = applyStateMutation(simulated, mutation);
      } catch {
        // Reconciliation removes ordinary mutations that no longer apply.
      }
      return mutation;
    });
  };

  const acceptRemoteState = (state: TabBoardState, observation?: StorageObservation): void => {
    if (observation?.origin) {
      if (canonicalOrigin && !sameOrigin(canonicalOrigin, observation.origin)) {
        lastAuthoritativeState = null;
        pendingRemoteState = null;
      }
      canonicalOrigin = observation.origin;
    }
    if (disposed) return;
    syncCanonicalDataset();
    const incoming = remoteObservation(state, observation);
    if (pendingMutations.length || inFlightMutations) {
      const selected = selectCanonicalObservation(incoming, pendingRemoteState, lastAuthoritativeState);
      pendingRemoteState = selected;
      if (incoming.explicitReread) {
        const projection = dependencies.readProjection();
        const outstanding = [...(inFlightMutations || []), ...pendingMutations]
          .filter((mutation) => projectedMutations.has(mutation));
        const preview = evaluateOrderedReplay(selected.state, outstanding, true);
        if (!preview.failures.length) {
          const activeWorkspaceId = preview.state.workspaces.some(({ id }) => id === projection.state.activeWorkspaceId)
            ? projection.state.activeWorkspaceId
            : selected.state.activeWorkspaceId;
          const projectedState = activeWorkspaceId === preview.state.activeWorkspaceId
            ? preview.state
            : { ...preview.state, activeWorkspaceId };
          dependencies.publishProjection(structurallyShareState(projection.state, projectedState), {
            hydrated: projection.hydrated,
            persistenceError: projection.persistenceError,
          });
        }
      }
      return;
    }
    const projection = dependencies.readProjection();
    const shared = structurallyShareState(
      projection.state,
      selectCanonicalState(state, pendingRemoteState, lastAuthoritativeState, observation),
    );
    lastAuthoritativeState = shared;
    dependencies.publishProjection(shared, {
      hydrated: projection.hydrated,
      persistenceError: projection.persistenceError,
    });
  };

  const reconcileCaptureCommit = (canonical: TabBoardState): void => {
    if (disposed) throw new Error('Authoritative publication is disposed.');
    if (persistenceContext !== undefined && persistenceContext !== dependencies.currentContext()) {
      throw new Error('Persistence context changed.');
    }
    persistenceContext = dependencies.currentContext();
    syncCanonicalDataset();
    const projection = dependencies.readProjection();
    const base = selectCanonicalState(canonical, pendingRemoteState, lastAuthoritativeState);
    // Keep even a failed observation for the existing settlement/recovery path.
    pendingRemoteState = remoteObservation(base);
    lastAuthoritativeState = structurallyShareState(lastAuthoritativeState || projection.state, base);
    const outstanding = [...(inFlightMutations || []), ...pendingMutations]
      .filter((mutation) => projectedMutations.has(mutation));
    const preview = evaluateOrderedReplay(base, outstanding, true);
    if (preview.failures.length) throw preview.failures[0].error;
    const activeWorkspaceId = preview.state.workspaces.some(({ id }) => id === projection.state.activeWorkspaceId)
      ? projection.state.activeWorkspaceId
      : base.activeWorkspaceId;
    const state = activeWorkspaceId === preview.state.activeWorkspaceId
      ? preview.state
      : { ...preview.state, activeWorkspaceId };
    dependencies.publishProjection(structurallyShareState(projection.state, state), {
      hydrated: projection.hydrated,
      persistenceError: projection.persistenceError,
    });
  };

  interface IsolatedBatchResult {
    error: unknown;
    canRetry: boolean;
    succeeded: StateMutation[];
    failures: Array<{ mutation: StateMutation; error: unknown }>;
    authoritative: TabBoardState | null;
  }

  const isolateTerminalOrdinaryBatch = async (
    batch: readonly StateMutation[],
    initialError: unknown,
    generation: number,
  ): Promise<IsolatedBatchResult> => {
    const candidates: StateMutation[] = batch.filter(
      (mutation) => mutation.type !== 'drop-intent',
    );
    let remaining: StateMutation[] = [...candidates];
    let queuedOutsideBatch = [...pendingMutations];
    let firstError = initialError;
    let reconciliationError: unknown;
    let canRetry = false;
    let authoritative: TabBoardState | null = null;
    const succeeded: StateMutation[] = [];
    const failures: Array<{ mutation: StateMutation; error: unknown }> = [];
    const captureQueuedMutations = (): void => {
      const known = new Set([...remaining, ...queuedOutsideBatch]);
      const newlyQueued = pendingMutations.filter(
        (mutation) => !known.has(mutation),
      );
      queuedOutsideBatch = [...queuedOutsideBatch, ...newlyQueued];
    };

    for (const mutation of candidates) {
      if (!remaining.includes(mutation)) continue;
      remaining = remaining.filter((candidate) => candidate !== mutation);
      pendingMutations = [...remaining, ...queuedOutsideBatch];
      inFlightMutations = [mutation];
      const requestDataset = dependencies.currentDataset();
      let request: RestoreRequest | undefined;
      let receivedOutcome = false;
      try {
        const preview = restorePreviews.get(mutation);
        request = mutation.type === 'restore-backup' && preview ? {
          requestId: crypto.randomUUID(), origin: preview.origin, mutations: JSON.parse(JSON.stringify([mutation])),
          restoreAttempts: [{ originalIndex: 0, attemptId: restoreAttempts.get(mutation) ?? crypto.randomUUID() }],
        } : undefined;
        const response = await (request ? dependencies.sendMutations([mutation], request) : dependencies.sendMutations([mutation]));
        receivedOutcome = true;
        const historical = 'confirmedByReceipt' in response && response.confirmedByReceipt;
        let persisted: TabBoardState | null = unwrap(response);
        const sameDataset = requestDataset === dependencies.currentDataset();
        if (!sameDataset) persisted = await recoverAuthoritativeState();
        if (generation !== publicationGeneration || disposed) {
          return {
            error: new Error('Persistence context changed.'),
            canRetry: false,
            succeeded: [],
            failures: [],
            authoritative: null,
          };
        }
        authoritative = persisted;
        succeeded.push(mutation);
        inFlightMutations = null;
        captureQueuedMutations();
        pendingMutations = [...remaining, ...queuedOutsideBatch];
        const reconciliationFailures = persisted ? reconcileAuthoritativeState(
          persisted,
          sameDataset && !historical ? [mutation] : [],
        ) : [];
        if (persisted) rebasePendingDropRevisions(lastAuthoritativeState || persisted);
        if (reconciliationFailures.length) {
          failures.push(...reconciliationFailures);
          reconciliationError = reconciliationFailures[0]?.error;
        }
        dependencies.onMutationCommitted(mutation);
        remaining = remaining.filter((candidate) =>
          pendingMutations.includes(candidate),
        );
        queuedOutsideBatch = pendingMutations.filter(
          (candidate) => !remaining.includes(candidate),
        );
      } catch (error: unknown) {
        inFlightMutations = null;
        if (request && !receivedOutcome && !restoreOutcome(error)
          && !committedMutationIndexes(error, [mutation]).size) {
          frozenRestore = { batch: [mutation], request };
          captureQueuedMutations();
          remaining = [mutation, ...remaining];
          pendingMutations = [...remaining, ...queuedOutsideBatch];
          canRetry = true;
          // Only the exact receipt retry can settle this uncertain commit.
          // Recovery replay would prune this original mutation as CAS-stale.
          break;
        }
        if (request && restoreOutcome(error) === 'proof-unavailable') {
          captureQueuedMutations();
          pendingMutations = [...remaining, ...queuedOutsideBatch];
          failures.push({ mutation, error });
          firstError = error;
          break;
        }
        const terminalFailure = (isTerminalSemanticError(error)
          || (request && restoreOutcome(error) === 'not-committed'))
          && !isRestoreCollisionError(error);
        captureQueuedMutations();
        remaining = terminalFailure ? remaining : [mutation, ...remaining];
        pendingMutations = [...remaining, ...queuedOutsideBatch];
        const recovery = await recoverAuthoritativeState();
        if (generation !== publicationGeneration || disposed) {
          return {
            error: new Error('Persistence context changed.'),
            canRetry: false,
            succeeded: [],
            failures: [],
            authoritative: null,
          };
        }
        captureQueuedMutations();
        if (recovery) {
          const reconciliationFailures = reconcileAuthoritativeState(recovery);
          rebasePendingDropRevisions(lastAuthoritativeState || recovery);
          if (reconciliationFailures.length) {
            failures.push(...reconciliationFailures);
            reconciliationError = reconciliationFailures[0]?.error;
          }
          remaining = remaining.filter((candidate) =>
            pendingMutations.includes(candidate),
          );
          queuedOutsideBatch = pendingMutations.filter(
            (candidate) => !remaining.includes(candidate),
          );
        }
        if (terminalFailure) {
          failures.push({ mutation, error });
          firstError = error;
        }
        if (!terminalFailure) {
          canRetry = true;
          break;
        }
      }
    }
    inFlightMutations = null;
    pendingMutations = [...remaining, ...queuedOutsideBatch];
    return {
      error: reconciliationError || firstError,
      canRetry: canRetry || pendingMutations.length > 0,
      succeeded,
      failures,
      authoritative,
    };
  };

  let sendPendingBatch: (
    additional?: readonly StateMutation[],
  ) => Promise<TabBoardState | null>;

  const schedulePendingRetry = (): void => {
    if (suppressRetrySchedule) {
      suppressRetrySchedule = false;
      return;
    }
    if (
      !pendingMutations.length
      || retryTimeout
      || persistenceRetryAttempt >= PERSISTENCE_RETRY_DELAYS_MS.length
    ) {
      return;
    }
    const delay = PERSISTENCE_RETRY_DELAYS_MS[persistenceRetryAttempt];
    persistenceRetryAttempt += 1;
    retryTimeout = setTimeout(() => {
      retryTimeout = null;
      void sendPendingBatch().catch(() => schedulePendingRetry());
    }, delay);
  };

  sendPendingBatch = (
    additional: readonly StateMutation[] = [],
  ): Promise<TabBoardState | null> => {
    const generation = publicationGeneration;
    return enqueue(async () => {
      if (generation !== publicationGeneration || disposed) return null;
      let batch: StateMutation[];
      let request: RestoreRequest | undefined;
      if (frozenRestore) {
        pendingMutations = [...pendingMutations, ...additional];
        batch = frozenRestore.batch;
        pendingMutations = pendingMutations.filter(m => !batch.includes(m));
        request = frozenRestore.request;
      } else {
        batch = [...takePendingMutations(), ...additional];
        const restores = batch.flatMap((m, originalIndex) => m.type === 'restore-backup' ? [{ m, originalIndex }] : []);
        if (restores.length) {
          const preview = restorePreviews.get(restores[0].m);
          if (!preview || restores.some(({ m }) => !sameOrigin(restorePreviews.get(m)?.origin, preview.origin))) {
            // No request has been sent. Keep ordinary siblings for their normal batch.
            pendingMutations = [...batch.filter(m => m.type !== 'restore-backup'), ...pendingMutations];
            const error = restoreError('RESTORE_PREVIEW_REQUIRED', 'Review the complete backup in the current storage source before restoring it.');
            const missing = takePersistenceWaiters(batch.filter(m => m.type === 'restore-backup'));
            settlePersistenceWaiters(missing, batch.filter(m => m.type === 'restore-backup'), error, new Set());
            throw error;
          }
          request = {
            requestId: crypto.randomUUID(), origin: preview.origin,
            mutations: JSON.parse(JSON.stringify(batch)),
            restoreAttempts: restores.map(({ m, originalIndex }) => {
              let attemptId = restoreAttempts.get(m);
              if (!attemptId) { attemptId = crypto.randomUUID(); restoreAttempts.set(m, attemptId); }
              return { originalIndex, attemptId };
            }),
          };
        }
      }
      if (additional.length > 0) suppressRetrySchedule = false;
      const waiters = takePersistenceWaiters(batch);
      inFlightPersistenceWaiters = waiters;
      if (!batch.length || disposed) return null;
      inFlightMutations = batch;
      const requestDataset = dependencies.currentDataset();
      let receivedOutcome = false;
      try {
        const response = await (request ? dependencies.sendMutations(batch, request) : dependencies.sendMutations(batch));
        receivedOutcome = true;
        const historical = 'confirmedByReceipt' in response && response.confirmedByReceipt;
        let authoritative: TabBoardState | null = unwrap(response);
        frozenRestore = null;
        const sameDataset = requestDataset === dependencies.currentDataset();
        // An old request may finish after selection; its outcome remains real, its snapshot belongs to the retired dataset.
        if (!sameDataset) authoritative = await recoverAuthoritativeState();
        if (generation !== publicationGeneration || disposed) return null;
        inFlightMutations = null;
        settlePersistenceWaiters(waiters, batch);
        inFlightPersistenceWaiters = [];
        const failures = authoritative ? reconcileAuthoritativeState(authoritative, sameDataset && !historical ? batch : []) : [];
        batch.forEach(dependencies.onMutationCommitted);
        persistenceRetryAttempt = 0;
        suppressRetrySchedule = false;
        if (retryTimeout) clearTimeout(retryTimeout);
        retryTimeout = null;
        if (failures.length) {
          const reconciliationError = failures[0].error;
          dependencies.onPersistenceError(reconciliationError, true);
          return Promise.reject(reconciliationError);
        }
        if (dependencies.readProjection().persistenceError) {
          dependencies.patchStatus({ persistenceError: null });
        }
        if (pendingMutations.length) scheduleSave();
        return authoritative;
      } catch (error: unknown) {
        if (generation !== publicationGeneration || disposed) return null;
        inFlightMutations = null;
        const historical = !!(error && typeof error === 'object' && 'confirmedByReceipt' in error && error.confirmedByReceipt);
        if (historical && error && typeof error === 'object' && 'committedOrigin' in error && isOrigin(error.committedOrigin)) canonicalOrigin = error.committedOrigin;
        const unknownRestoreOutcome = !!request && !receivedOutcome && !restoreOutcome(error)
          && !historical && !committedMutationIndexes(error, batch).size;
        frozenRestore = unknownRestoreOutcome ? { batch, request: request! } : null;
        const restoreProofFailure = !!request && restoreOutcome(error) === 'proof-unavailable';
        if (restoreProofFailure) {
          // A retired/inconsistent source cannot prove which siblings committed.
          // Reject this whole request; ordinary semantic isolation is safe only
          // when this source proves the transaction never committed.
          const recovered = await recoverAuthoritativeState();
          if (generation !== publicationGeneration || disposed) return null;
          if (recovered) reconcileAuthoritativeState(recovered);
          settlePersistenceWaiters(waiters, batch, error, new Set());
          inFlightPersistenceWaiters = [];
          if (retryTimeout) clearTimeout(retryTimeout);
          retryTimeout = null;
          persistenceRetryAttempt = 0;
          const owned = new Set(waiters.map(w => w.mutation));
          dependencies.onPersistenceError(error, batch.some(m => !owned.has(m)));
          if (pendingMutations.length) scheduleSave();
          throw error;
        }
        const validationFailure = isCategoryValidationError(error);
        const restoreCollision = isRestoreCollisionError(error);
        const invalidIndexes = invalidDropIndexes(error, batch);
        const committedIndexes = committedMutationIndexes(error, batch);
        const invalidDrop = invalidIndexes.size > 0;
        const terminalOrdinaryFailure = !unknownRestoreOutcome
          && (isTerminalSemanticError(error) || (!!request && restoreOutcome(error) === 'not-committed'))
          && !validationFailure
          && !restoreCollision
          && !invalidDrop;
        const hasOrdinarySibling = batch.some(
          (mutation) => mutation.type !== 'drop-intent',
        );
        if (
          terminalOrdinaryFailure
          && batch.length > 1
          && hasOrdinarySibling
        ) {
          const hasRetryBudget =
            persistenceRetryAttempt < PERSISTENCE_RETRY_DELAYS_MS.length;
          const retainedDrops = hasRetryBudget
            ? batch.filter((mutation) => mutation.type === 'drop-intent')
            : [];
          pendingMutations = [...retainedDrops, ...pendingMutations];
          const isolated = await isolateTerminalOrdinaryBatch(
            batch,
            error,
            generation,
          );
          if (generation !== publicationGeneration || disposed) return null;
          const isolatedCommittedIndexes = new Set(
            batch.map((mutation, index) =>
              isolated.succeeded.includes(mutation) ? index : -1,
            ).filter((index) => index >= 0),
          );
          const retainedIndexes = isolated.canRetry
            ? new Set(
              batch.map((mutation, index) =>
                pendingMutations.some((candidate) =>
                  sameMutation(candidate, mutation),
                ) ? index : -1,
              ).filter((index) => index >= 0),
            )
            : new Set<number>();
          const errorsByMutation = new Map(
            isolated.failures.map(({ mutation, error: failure }) =>
              [mutation, failure],
            ),
          );
          settlePersistenceWaiters(
            waiters,
            batch,
            error,
            isolatedCommittedIndexes,
            retainedIndexes,
            errorsByMutation,
          );
          inFlightPersistenceWaiters = [];
          if (isolated.canRetry) {
            persistenceRetryAttempt = 0;
            suppressRetrySchedule = false;
            schedulePendingRetry();
          } else {
            persistenceRetryAttempt = 0;
            suppressRetrySchedule = true;
            if (retryTimeout) clearTimeout(retryTimeout);
            retryTimeout = null;
          }
          dependencies.onPersistenceError(isolated.error, true);
          const additionalSucceeded = additional.length > 0
            && additional.every((mutation) =>
              isolated.succeeded.includes(mutation),
            );
          if (additionalSucceeded) return isolated.authoritative;
          return Promise.reject(isolated.error);
        }

        const retainedBatch = batch.filter(
          (_, index) =>
            !invalidIndexes.has(index) && !committedIndexes.has(index),
        );
        const retryableBatch = restoreCollision
          ? retainedBatch.filter((mutation) =>
            mutation.type !== 'restore-group'
            && mutation.type !== 'restore-tab',
          )
          : retainedBatch;
        const hasRetryBudget =
          persistenceRetryAttempt < PERSISTENCE_RETRY_DELAYS_MS.length;
        const nextPendingBatch = validationFailure
          ? batch.filter(
            (mutation, index) =>
              !isCategoryMutation(mutation) && !committedIndexes.has(index),
          )
          : terminalOrdinaryFailure
            ? hasRetryBudget
              ? retryableBatch.filter(
                (mutation) => mutation.type === 'drop-intent',
              )
              : []
            : hasRetryBudget
              ? retryableBatch
              : retryableBatch.filter(
                (mutation) => mutation.type !== 'drop-intent',
              );
        const nonDropRetryBatch = nextPendingBatch.filter(
          (mutation) => mutation.type !== 'drop-intent',
        );
        const persisted = committedState(error);
        pendingMutations = [...nextPendingBatch, ...pendingMutations];
        const terminalDropWithRetainedOrdinary = !validationFailure
          && !hasRetryBudget
          && batch.some((mutation) => mutation.type === 'drop-intent')
          && nonDropRetryBatch.length > 0;
        const shouldResetRetryBudget = terminalOrdinaryFailure
          || (
            nonDropRetryBatch.length > 0
            && (
              validationFailure
              || restoreCollision
              || terminalDropWithRetainedOrdinary
            )
          );
        if (shouldResetRetryBudget) {
          persistenceRetryAttempt = 0;
          suppressRetrySchedule = false;
        }
        const removedNonDropMutation = restoreCollision && batch.some(
          (mutation, index) =>
            mutation.type !== 'drop-intent'
            && !committedIndexes.has(index)
            && !retryableBatch.some((candidate) =>
              sameMutation(candidate, mutation),
            ),
        );
        const sameDataset = requestDataset === dependencies.currentDataset();
        let reconciliationState = sameDataset ? persisted : await recoverAuthoritativeState();
        if (
          !reconciliationState
          && (
            terminalOrdinaryFailure
            || restoreCollision
            || (
              !hasRetryBudget
              && batch.some((mutation) => mutation.type === 'drop-intent')
            )
          )
        ) {
          reconciliationState = await recoverAuthoritativeState();
        }
        let reconciliationFailures: ReconciliationFailure[] = [];
        if (reconciliationState) {
          const committedMutations = sameDataset && !historical ? batch.filter(
            (_, index) => committedIndexes.has(index),
          ) : [];
          reconciliationFailures = reconcileAuthoritativeState(
            reconciliationState,
            committedMutations,
          );
          const shouldRebasePendingDrops = !invalidDrop && (
            (
              terminalOrdinaryFailure
              && batch.every((mutation) => mutation.type !== 'drop-intent')
            )
            || removedNonDropMutation
          );
          if (shouldRebasePendingDrops) {
            rebasePendingDropRevisions(
              lastAuthoritativeState || reconciliationState,
            );
          }
        }
        batch.forEach((mutation, index) => {
          if (committedIndexes.has(index)) {
            dependencies.onMutationCommitted(mutation);
          }
        });
        const canRetry = pendingMutations.length > 0
          && persistenceRetryAttempt < PERSISTENCE_RETRY_DELAYS_MS.length;
        if (canRetry) {
          schedulePendingRetry();
        } else {
          persistenceRetryAttempt = 0;
          suppressRetrySchedule = true;
          if (retryTimeout) clearTimeout(retryTimeout);
          retryTimeout = null;
        }
        const retainedIndexes = canRetry
          ? new Set(
            batch.map((mutation, index) =>
              pendingMutations.some((candidate) =>
                sameMutation(candidate, mutation),
              ) ? index : -1,
            ).filter((index) => index >= 0),
          )
          : new Set<number>();
        settlePersistenceWaiters(
          waiters,
          batch,
          error,
          committedIndexes,
          retainedIndexes,
        );
        inFlightPersistenceWaiters = [];
        const waiterMutations = new Set(
          waiters.map(({ mutation }) => mutation),
        );
        const hasUnownedFailure = batch.some((mutation, index) =>
          !committedIndexes.has(index)
          && !retainedIndexes.has(index)
          && !waiterMutations.has(mutation),
        );
        const deferErrorNotification = canRetry
          && !validationFailure
          && !invalidDrop
          && !restoreCollision
          && !terminalOrdinaryFailure
          && reconciliationFailures.length === 0;
        const shouldNotify = terminalDropWithRetainedOrdinary
          || (
            waiters.length > 0
              ? hasUnownedFailure
              : !deferErrorNotification
          );
        const surfacedError = reconciliationFailures[0]?.error || error;
        dependencies.onPersistenceError(surfacedError, shouldNotify);
        throw surfacedError;
      }
    });
  };

  const scheduleSave = (): void => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveTimeout = null;
      void sendPendingBatch().catch(() => schedulePendingRetry());
    }, SAVE_DELAY_MS);
  };

  const commit = (mutation: StateMutation): void => {
    if (disposed) return;
    syncPersistenceContext();
    publishOptimisticMutation(mutation);
    scheduleSave();
  };

  const commitRestore = (mutation: RestoreStateMutation): void => {
    if (disposed) return;
    syncPersistenceContext();
    try {
      publishOptimisticMutation(mutation);
    } catch (error: unknown) {
      dependencies.onPersistenceError(error, true);
      return;
    }
    scheduleSave();
  };

  const commitChecked = (mutation: StateMutation): Promise<void> => {
    if (disposed) {
      return Promise.reject(new Error('Authoritative publication is disposed.'));
    }
    syncPersistenceContext();
    const persistence = new Promise<void>((resolve, reject) => {
      pendingPersistenceWaiters = [
        ...pendingPersistenceWaiters,
        { mutation, resolve, reject },
      ];
      void sendPendingBatch([mutation]).catch(() => undefined);
    });
    persistence.catch(() => undefined);
    return persistence;
  };

  const commitDrop = (mutation: DropStateMutation): Promise<void> => {
    if (disposed) {
      return Promise.reject(new Error('Authoritative publication is disposed.'));
    }
    syncPersistenceContext();
    try {
      publishOptimisticMutation(mutation);
    } catch (error: unknown) {
      dependencies.onPersistenceError(error, false);
      const persistence = Promise.reject<void>(error);
      persistence.catch(() => undefined);
      return persistence;
    }
    const persistence = new Promise<void>((resolve, reject) => {
      pendingPersistenceWaiters = [
        ...pendingPersistenceWaiters,
        { mutation, resolve, reject },
      ];
      scheduleSave();
    });
    persistence.catch(() => undefined);
    return persistence;
  };

  const commitCategory = (
    mutation: CategoryStateMutation,
  ): Promise<void> => {
    if (disposed) {
      return Promise.reject(new Error('Authoritative publication is disposed.'));
    }
    syncPersistenceContext();
    const persistence = new Promise<void>((resolve, reject) => {
      pendingPersistenceWaiters = [
        ...pendingPersistenceWaiters,
        { mutation, resolve, reject },
      ];
      void sendPendingBatch([mutation]).catch(() => undefined);
    });
    persistence.catch(() => undefined);
    return persistence;
  };

  return {
    captureRestorePreview: async () => {
      const dataset = dependencies.currentDataset();
      const context = dependencies.currentContext();
      if (!dependencies.readRestoreSnapshot) throw restoreError('RESTORE_ORIGIN_UNAVAILABLE', 'A bound complete backup preview is unavailable.');
      const snapshot = await dependencies.readRestoreSnapshot();
      if (context !== dependencies.currentContext() || dataset !== dependencies.currentDataset()) throw restoreError('RESTORE_ORIGIN_CHANGED', 'The storage source changed while previewing the backup. Review it again.');
      const changed = canonicalOrigin && !sameOrigin(canonicalOrigin, snapshot.metadata.origin);
      if (changed) { lastAuthoritativeState = null; pendingRemoteState = null; }
      canonicalOrigin = snapshot.metadata.origin;
      reconcileCaptureCommit(snapshot.state);
      return { expectedRevision: dependencies.readProjection().state.mutationRevision, origin: { ...snapshot.metadata.origin } };
    },
    commitCompleteRestore: (mutation, preview) => {
      if (!preview || typeof preview !== 'object' || !preview.origin || preview.expectedRevision !== mutation.expectedRevision) return Promise.reject(restoreError('RESTORE_PREVIEW_REQUIRED', 'A captured complete backup preview is required.'));
      restorePreviews.set(mutation, { expectedRevision: preview.expectedRevision, origin: { ...preview.origin } });
      return commitChecked(mutation);
    },
    reconcileCaptureCommit,
    commit,
    commitChecked,
    commitRestore,
    commitDrop,
    commitCategory,
    hydrate: () => {
      syncPersistenceContext();
      syncCanonicalDataset();
      if (hydrationPromise) return hydrationPromise;
      const generation = hydrationGeneration;
      const hydration = (async () => {
        let pendingHydrationState: RemoteObservation | null = null;
        try {
          hydrationUnsubscribe?.();
          hydrationUnsubscribe = dependencies.subscribeAuthoritativeState(
            (state, observation) => {
              if (disposed || generation !== hydrationGeneration) return;
              if (syncCanonicalDataset()) pendingHydrationState = null;
              if (!dependencies.readProjection().hydrated) {
                pendingHydrationState = selectCanonicalObservation(
                  remoteObservation(state, observation),
                  pendingHydrationState,
                  lastAuthoritativeState,
                );
                return;
              }
              acceptRemoteState(state, observation);
            },
          );
          const authoritative = unwrap(await dependencies.initializeAuthoritativeState());
          if (disposed || generation !== hydrationGeneration) return;
          if (syncCanonicalDataset()) pendingHydrationState = null;
          const projection = dependencies.readProjection();
          const shared = structurallyShareState(
            projection.state,
            selectCanonicalState(authoritative, pendingHydrationState, lastAuthoritativeState),
          );
          pendingHydrationState = null;
          lastAuthoritativeState = shared;
          dependencies.publishProjection(shared, {
            hydrated: true,
            persistenceError: null,
          });
        } catch (error: unknown) {
          if (disposed || generation !== hydrationGeneration) return;
          hydrationUnsubscribe?.();
          hydrationUnsubscribe = null;
          dependencies.onPersistenceError(error, false);
          dependencies.patchStatus({ hydrated: false });
          throw error;
        }
      })();
      hydrationPromise = hydration.catch((error: unknown) => {
        if (!disposed && generation === hydrationGeneration) {
          hydrationPromise = null;
        }
        throw error;
      });
      return hydrationPromise;
    },
    releaseHydration: () => {
      hydrationGeneration += 1;
      hydrationUnsubscribe?.();
      hydrationUnsubscribe = null;
      hydrationPromise = null;
      dependencies.patchStatus({ hydrated: false });
    },
    dispose: () => {
      disposed = true;
      publicationGeneration += 1;
      hydrationGeneration += 1;
      if (saveTimeout) clearTimeout(saveTimeout);
      if (retryTimeout) clearTimeout(retryTimeout);
      saveTimeout = null;
      retryTimeout = null;
      pendingMutations = [];
      frozenRestore = null;
      canonicalOrigin = undefined;
      inFlightMutations = null;
      projectedMutations.clear();
      pendingRemoteState = null;
      lastAuthoritativeState = null;
      persistenceRetryAttempt = 0;
      suppressRetrySchedule = false;
      rejectPendingPersistenceWaiters(
        new Error('Authoritative publication is disposed.'),
      );
      hydrationUnsubscribe?.();
      hydrationUnsubscribe = null;
      hydrationPromise = null;
    },
  };
}
