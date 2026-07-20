import { normalizeState, nowIso, type TabBoardState } from '../shared/model';
import {
  applyStateMutation,
  createDropMutationBatchContext,
  InvalidDropMutationError,
  markInvalidDropMutationForBatch,
  prepareDropMutationForBatch,
  validateMutationBatch,
  type StateMutation,
} from '../shared/store/stateMutations';
import { isDropIntentAlreadyApplied } from '../manager/core/commands';

interface LockManagerLike {
  request<T>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<T>): Promise<T>;
}

export interface StatePersistenceDependencies {
  getState: () => Promise<TabBoardState>;
  setState: (state: TabBoardState) => Promise<void>;
  locks?: LockManagerLike;
}

export interface StatePersistence {
  applyMutations(mutations: readonly unknown[]): Promise<TabBoardState>;
  ensureState(): Promise<TabBoardState>;
}

export function createStatePersistence({
  getState,
  setState,
  ensureState,
  locks = globalThis.navigator?.locks as LockManagerLike | undefined,
}: StatePersistenceDependencies & { ensureState?: () => Promise<TabBoardState> }): StatePersistence {
  let queue: Promise<unknown> = Promise.resolve();

  const transaction = async (input: readonly unknown[]): Promise<TabBoardState> => {
    const validated = validateMutationBatch(input);
    const current = await getState();
    const appliedAt = nowIso();
    let replayed = current;
    let revisionContext = createDropMutationBatchContext(validated.invalidDropIndexes);
    const invalidMutationIndexes = [...validated.invalidDropIndexes];
    const committedMutationIndexes: number[] = [];

    for (const [index, mutation] of validated.mutations.entries()) {
      const originalIndex = validated.originalIndexes[index];
      const prepared = prepareDropMutationForBatch(replayed, mutation, revisionContext, originalIndex);
      revisionContext = prepared.context;
      try {
        if (prepared.stale
          && !(prepared.mutation.type === 'drop-intent'
            && isDropIntentAlreadyApplied(
              replayed,
              prepared.mutation.intent,
              prepared.mutation.openTabs,
              prepared.mutation.operationId,
            ))) {
          throw new InvalidDropMutationError('Drop mutation revision is stale.');
        }
        replayed = applyStateMutation(replayed, prepared.mutation, appliedAt);
        committedMutationIndexes.push(validated.originalIndexes[index]);
      } catch (error: unknown) {
        if (mutation.type === 'drop-intent' && error instanceof InvalidDropMutationError) {
          invalidMutationIndexes.push(validated.originalIndexes[index]);
          if (!prepared.stale) {
            revisionContext = markInvalidDropMutationForBatch(revisionContext);
          }
          continue;
        }
        throw error;
      }
    }

    const committedState = normalizeState(replayed);
    if (committedMutationIndexes.length) {
      await setState(committedState);
    }
    if (invalidMutationIndexes.length) {
      throw new InvalidDropMutationError(
        'Invalid drop intent.',
        invalidMutationIndexes.sort((left, right) => left - right),
        committedMutationIndexes.sort((left, right) => left - right),
        committedState,
      );
    }
    return committedState;
  };

  const enqueueLocked = <T>(operation: () => Promise<T>): Promise<T> => {
    const run = queue.then(() => typeof locks?.request === 'function'
      ? locks.request('tabboard-state-write', { mode: 'exclusive' }, operation)
      : operation());
    queue = run.then(() => undefined, () => undefined);
    return run;
  };

  const applyMutations = (mutations: readonly StateMutation[]): Promise<TabBoardState> =>
    enqueueLocked(() => transaction(mutations));

  const ensurePersistedState = (): Promise<TabBoardState> =>
    enqueueLocked(async () => {
      if (!ensureState) {
        return getState();
      }
      return ensureState();
    });

  return { applyMutations, ensureState: ensurePersistedState };
}
