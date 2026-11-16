import { normalizeState, nowIso, type TabBoardState } from '../shared/model';
import {
  createMutationBatch,
  InvalidDropMutationError,
  type MutationBatchEvaluation,
  type VerifiedMutationBatchContinuation,
} from '../shared/store/stateMutations';
import { fingerprintRestoreRequest, markRestoreOutcome, restoreError, sameOrigin, type BoundSnapshot, type RestoreRequest, type MutationCommitAck, type RestoreReceipt } from '../shared/store/restoreCommit';
import type { StateWriteOptions } from '../shared/store/storageAdapter';

interface LockManagerLike {
  request<T>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<T>): Promise<T>;
}

export interface StatePersistenceDependencies {
  getBoundState?: () => Promise<BoundSnapshot>;
  getState: () => Promise<TabBoardState>;
  setState: (state: TabBoardState, options?: StateWriteOptions) => Promise<void>;
  locks?: LockManagerLike;
}

export interface StatePersistence {
  applyRestoreRequest(request: RestoreRequest, prepare: (state: TabBoardState) => Promise<VerifiedMutationBatchContinuation>): Promise<MutationCommitAck>;
  applyMutations(mutations: readonly unknown[]): Promise<TabBoardState>;
  applyBatch(batch: VerifiedMutationBatchContinuation): Promise<MutationBatchEvaluation>;
  ensureState(): Promise<TabBoardState>;
}

export function createStatePersistence({
  getState,
  getBoundState,
  setState,
  ensureState,
  locks = globalThis.navigator?.locks as LockManagerLike | undefined,
}: StatePersistenceDependencies & { ensureState?: () => Promise<TabBoardState> }): StatePersistence {
  let queue: Promise<unknown> = Promise.resolve();

  const transaction = async (batch: {
    evaluate(state: TabBoardState, appliedAt?: string): MutationBatchEvaluation;
    finalizeFailure(evaluation: MutationBatchEvaluation, committedState: TabBoardState): InvalidDropMutationError | undefined;
  }): Promise<MutationBatchEvaluation> => {
    const current = await getState();
    const appliedAt = nowIso();
    const evaluated = batch.evaluate(current, appliedAt);
    const committedState = normalizeState(evaluated.state);
    if (evaluated.acceptedMutationIndexes.length) {
      await setState(committedState, evaluated.backupBeforeRestore
        ? { backupBeforeRestore: evaluated.backupBeforeRestore }
        : undefined);
    }
    const failure = batch.finalizeFailure(evaluated, committedState);
    return { ...evaluated, state: committedState, failure };
  };

  const enqueueLocked = <T>(operation: () => Promise<T>): Promise<T> => {
    const run = queue.then(() => typeof locks?.request === 'function'
      ? locks.request('tabboard-state-write', { mode: 'exclusive' }, operation)
      : operation());
    queue = run.then(() => undefined, () => undefined);
    return run;
  };

  const applyRestoreRequest = (request: RestoreRequest, prepare: (state: TabBoardState) => Promise<VerifiedMutationBatchContinuation>): Promise<MutationCommitAck> =>
    enqueueLocked(async () => {
      let fingerprint: string;
      let current: BoundSnapshot;
      try {
        fingerprint = await fingerprintRestoreRequest(request);
        if (!getBoundState) throw restoreError('RESTORE_ORIGIN_UNAVAILABLE', 'A bound restore snapshot is required.');
        current = await getBoundState();
      } catch (error) { throw markRestoreOutcome(error, 'proof-unavailable'); }
      const stored = current.metadata.receipts.find(r => r.requestId === request.requestId);
      if (stored) {
        if (stored.requestFingerprint !== fingerprint || !sameOrigin(stored.origin, request.origin)) {
          throw markRestoreOutcome(restoreError('RESTORE_REQUEST_MISMATCH', 'This restore request identity was already used with different data.'), 'proof-unavailable');
        }
        if (stored.failure) throw Object.assign(restoreError(stored.failure.code, stored.failure.message), {
          invalidMutationIndexes: stored.failure.invalidMutationIndexes,
          committedMutationIndexes: stored.acceptedMutationIndexes,
          committedState: current.state, committedOrigin: current.metadata.origin, confirmedByReceipt: true,
        });
        return { state: current.state, origin: current.metadata.origin, confirmedByReceipt: true, acceptedMutationIndexes: stored.acceptedMutationIndexes };
      }
      if (!sameOrigin(current.metadata.origin, request.origin)) throw markRestoreOutcome(restoreError('RESTORE_ORIGIN_CHANGED', 'The storage source changed after this restore preview. Review the backup again.'), 'proof-unavailable');
      if (current.metadata.receipts.some(r => r.restoreAttempts.some(a => request.restoreAttempts.some(b => a.attemptId === b.attemptId)))) {
        throw markRestoreOutcome(restoreError('RESTORE_ATTEMPT_COMMITTED', 'This restore attempt already committed in a different request.'), 'proof-unavailable');
      }
      let batch: VerifiedMutationBatchContinuation;
      let evaluated: MutationBatchEvaluation;
      try {
        batch = await prepare(current.state);
        evaluated = batch.evaluate(current.state, nowIso());
      } catch (error) { throw markRestoreOutcome(error, 'not-committed'); }
      const committedState = normalizeState(evaluated.state);
      const failure = batch.finalizeFailure(evaluated, committedState);
      if (evaluated.acceptedMutationIndexes.length) {
        const receipt: RestoreReceipt = {
          requestId: request.requestId, requestFingerprint: fingerprint, origin: request.origin,
          restoreAttempts: request.restoreAttempts, committedRevision: committedState.mutationRevision,
          acceptedMutationIndexes: evaluated.acceptedMutationIndexes,
          ...(failure ? { failure: { code: failure.code, message: failure.message, invalidMutationIndexes: failure.invalidMutationIndexes } } : {}),
        };
        await setState(committedState, {
          ...(evaluated.backupBeforeRestore ? { backupBeforeRestore: evaluated.backupBeforeRestore } : {}),
          restoreMetadata: { ...current.metadata, receipts: [...current.metadata.receipts, receipt] },
        });
      }
      if (failure) throw failure;
      return { state: committedState, origin: current.metadata.origin, confirmedByReceipt: false, acceptedMutationIndexes: evaluated.acceptedMutationIndexes };
    });

  const applyBatch = (batch: VerifiedMutationBatchContinuation): Promise<MutationBatchEvaluation> =>
    enqueueLocked(() => transaction(batch));

  const applyMutations = async (mutations: readonly unknown[]): Promise<TabBoardState> => {
    const batch = createMutationBatch(mutations);
    const evaluation = await enqueueLocked(() => transaction(batch));
    if (evaluation.failure) throw evaluation.failure;
    return evaluation.state;
  };

  const ensurePersistedState = (): Promise<TabBoardState> =>
    enqueueLocked(async () => {
      if (!ensureState) {
        return getState();
      }
      return ensureState();
    });

  return { applyMutations, applyBatch, applyRestoreRequest, ensureState: ensurePersistedState };
}
