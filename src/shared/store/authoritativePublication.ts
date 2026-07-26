import type { TabBoardState } from '../model';
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

export function createAuthoritativePublication(
  dependencies: AuthoritativePublicationDependencies,
): AuthoritativePublication {
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingMutations: StateMutation[] = [];
  let publicationQueue: Promise<unknown> = Promise.resolve();
  let disposed = false;

  const publishOptimisticMutation = (mutation: StateMutation): void => {
    const projection = dependencies.readProjection();
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

  const sendPendingBatch = (): Promise<TabBoardState | null> => enqueue(async () => {
    const batch = pendingMutations;
    pendingMutations = [];
    if (!batch.length || disposed) return null;
    const authoritative = await dependencies.sendMutations(batch);
    const projection = dependencies.readProjection();
    dependencies.publishProjection(
      structurallyShareState(projection.state, authoritative),
      {
        hydrated: projection.hydrated,
        persistenceError: projection.persistenceError,
      },
    );
    batch.forEach(dependencies.onMutationCommitted);
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
    hydrate: async () => undefined,
    releaseHydration: () => undefined,
    dispose: () => {
      disposed = true;
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = null;
      pendingMutations = [];
    },
  };
}
