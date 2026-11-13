import { normalizeState, nowIso, type TabBoardState } from '../shared/model';
import {
  createMutationBatch,
  InvalidDropMutationError,
  type MutationBatchEvaluation,
  type VerifiedMutationBatchContinuation,
} from '../shared/store/stateMutations';
import type { StateWriteOptions } from '../shared/store/storageAdapter';

interface LockManagerLike {
  request<T>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<T>): Promise<T>;
}

export interface StatePersistenceDependencies {
  getState: () => Promise<TabBoardState>;
  setState: (state: TabBoardState, options?: StateWriteOptions) => Promise<void>;
  locks?: LockManagerLike;
}

export interface StatePersistence {
  applyMutations(mutations: readonly unknown[]): Promise<TabBoardState>;
  applyBatch(batch: VerifiedMutationBatchContinuation): Promise<MutationBatchEvaluation>;
  ensureState(): Promise<TabBoardState>;
}

export function createStatePersistence({
  getState,
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

  return { applyMutations, applyBatch, ensureState: ensurePersistedState };
}
