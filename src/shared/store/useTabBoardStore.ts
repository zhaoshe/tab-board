import { create } from 'zustand';
import type { TabBoardState, Workspace, Folder, Group, TabItem, Settings, BinEntry } from '../model';
import {
  createEmptyState,
  nowIso,
  createId,
  exportToJson,
  createNoteRecord,
  DROP_OPERATION_LEDGER_LIMIT,
} from '../model';
import { ensureStateForHydration, sendStateMutations } from './chromeStorage';
import {
  getActiveState,
  onFallback,
  subscribeActiveState,
} from './activeAdapter';
import type { StateMutation } from './stateMutations';
import {
  applyStateMutation,
  applyStateMutations,
  CategoryValidationError,
  resolveRestoreWorkspaceId,
  InvalidDropMutationError,
} from './stateMutations';
import {
  importText,
  restoreGroupFromBin,
} from '../../manager/core/commands';
import type { DropIntent } from '../../manager/core/dnd';
import type { OpenTabInfo } from '../openTabs';
import { emitEvent, AppEvents } from '../utils/events';
import { structurallyShareState } from './stateStructuralSharing';

// Subscribe to file-storage fallback events so that a degraded backend (file
// mode failed, dropped back to browser storage) surfaces as a persistenceError
// in the UI. The subscription is module-level so it lives for the lifetime of
// the page; we don't want to miss a fallback that happens before hydrate().
const unsubscribeFallback = onFallback((reason: string) => {
  // eslint-disable-next-line no-console
  console.warn('[TabBoard] Storage adapter fell back to browser storage:', reason);
  useTabBoardStore.setState({ persistenceError: reason });
});

// Best-effort cleanup on page unload (no-op if the page is already terminating).
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeunload', () => {
    try { unsubscribeFallback(); } catch { /* ignore */ }
  }, { once: true });
}

interface TabBoardStore extends TabBoardState {
  hydrated: boolean;
  persistenceError: string | null;
  hydrate: () => Promise<void>;
  releaseHydration: () => void;
  setActiveWorkspace: (workspaceId: string) => void;
  addWorkspace: (name: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;
  addFolder: (workspaceId: string, name: string, color?: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  addGroup: (group: Omit<Group, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateGroup: (id: string, updates: Partial<Group>) => void;
  deleteGroup: (id: string) => void;
  moveGroup: (groupId: string, targetFolderId: string | null, index: number) => void;
  addTabToGroup: (groupId: string, tab: Omit<TabItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateTab: (groupId: string, tabId: string, updates: Partial<TabItem>) => void;
  deleteTab: (groupId: string, tabId: string) => void;
  restoreFromBin: (binEntryId: string) => void;
  deleteBinEntry: (binEntryId: string) => void;
  clearBin: () => void;
  updateSettings: (updates: Partial<Settings>) => void;
  moveTab: (groupId: string, tabId: string, targetGroupId: string, targetIndex: number) => void;
  applyDropIntent: (intent: DropIntent, openTabs?: readonly OpenTabInfo[]) => Promise<void>;
  reorderGroupsInFolder: (workspaceId: string, folderId: string | null, starred: boolean, archived: boolean, orderedGroupIds: string[]) => void;
  starGroup: (groupId: string) => void;
  lockGroup: (groupId: string) => void;
  collapseGroup: (groupId: string) => void;
  addNoteToGroup: (groupId: string, text: string) => void;
  addTabNote: (groupId: string, tabId: string, text: string) => void;
  updateCategoryOrder: (workspaceId: string, categoryOrder: string[]) => Promise<void>;
  importGroups: (text: string, options?: { workspaceId?: string; folderId?: string | null }) => void;
  exportAll: () => string;
  toggleFolderCollapsed: (folderId: string) => void;
}

const PERSISTENCE_RETRY_DELAYS_MS = [250, 1_000, 4_000] as const;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;
let persistenceRetryAttempt = 0;
let suppressRetrySchedule = false;
let pendingMutations: StateMutation[] = [];
let inFlightMutations: StateMutation[] | null = null;
let pendingRemoteState: TabBoardState | null = null;
let lastAuthoritativeState: TabBoardState | null = null;
let persistenceQueue: Promise<unknown> = Promise.resolve();
let persistenceContext: unknown;
let activeHydrationUnsubscribe: (() => void) | null = null;
let hydrationPromise: Promise<void> | null = null;
let hydrationGeneration = 0;

function releaseHydrationLifecycle(): void {
  hydrationGeneration += 1;
  activeHydrationUnsubscribe?.();
  activeHydrationUnsubscribe = null;
  hydrationPromise = null;
  useTabBoardStore.setState({ hydrated: false });
}

interface PendingPersistenceWaiter {
  mutation: StateMutation;
  resolve: () => void;
  reject: (error: unknown) => void;
}

let pendingPersistenceWaiters: PendingPersistenceWaiter[] = [];

function rejectPendingPersistenceWaiters(error: unknown): void {
  const waiters = pendingPersistenceWaiters;
  pendingPersistenceWaiters = [];
  waiters.forEach(({ reject }) => reject(error));
}

function sameMutation(left: StateMutation, right: StateMutation): boolean {
  return left === right || (left.type === 'drop-intent' && right.type === 'drop-intent'
    && left.operationId === right.operationId);
}

function takePersistenceWaiters(batch: readonly StateMutation[]): PendingPersistenceWaiter[] {
  const waiters = pendingPersistenceWaiters.filter(({ mutation }) => batch.some((candidate) => sameMutation(candidate, mutation)));
  pendingPersistenceWaiters = pendingPersistenceWaiters.filter(({ mutation }) => !batch.some((candidate) => sameMutation(candidate, mutation)));
  return waiters;
}

function settlePersistenceWaiters(
  waiters: readonly PendingPersistenceWaiter[],
  batch: readonly StateMutation[],
  error?: unknown,
  committedIndexes: ReadonlySet<number> = new Set(),
  retainedIndexes: ReadonlySet<number> = new Set(),
  errorsByMutation: ReadonlyMap<StateMutation, unknown> = new Map(),
): void {
  const retained = waiters.filter(({ mutation }) => retainedIndexes.has(batch.findIndex((candidate) => sameMutation(candidate, mutation))));
  if (retained.length) {
    pendingPersistenceWaiters = [...retained, ...pendingPersistenceWaiters];
  }
  waiters.forEach(({ mutation, resolve, reject }) => {
    const index = batch.findIndex((candidate) => sameMutation(candidate, mutation));
    if (!error || committedIndexes.has(index)) {
      resolve();
      return;
    }
    if (!retainedIndexes.has(index)) reject(errorsByMutation.get(mutation) || error);
  });
}

function syncPersistenceContext(): void {
  const context = globalThis.chrome;
  if (persistenceContext !== undefined && persistenceContext !== context) {
    pendingMutations = [];
    inFlightMutations = null;
    pendingRemoteState = null;
    lastAuthoritativeState = null;
    rejectPendingPersistenceWaiters(new Error('Persistence context changed.'));
    if (retryTimeout) clearTimeout(retryTimeout);
    retryTimeout = null;
    persistenceRetryAttempt = 0;
    suppressRetrySchedule = false;
  }
  persistenceContext = context;
}

function persistenceErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reportError(
  error: unknown,
  source: 'persistence' | 'import' = 'persistence',
  notify = true,
): void {
  const message = persistenceErrorMessage(error);
  useTabBoardStore.setState({ persistenceError: message });
  if (notify) emitEvent(AppEvents.ERROR, { source, message });
}

function reportPersistenceError(error: unknown, notify = true): void {
  reportError(error, 'persistence', notify);
}

export function persistedSnapshot(state: TabBoardState): TabBoardState {
  return {
    version: state.version,
    mutationRevision: state.mutationRevision,
    workspaces: state.workspaces,
    activeWorkspaceId: state.activeWorkspaceId,
    groups: state.groups,
    folders: state.folders,
    categoryOrderByWorkspace: state.categoryOrderByWorkspace,
    bin: state.bin,
    dropOperationLedger: state.dropOperationLedger,
    settings: state.settings,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

function findRestoreTabTargetGroup(state: TabBoardState, entry: BinEntry): Group | undefined {
  const workspaceId = resolveRestoreWorkspaceId(state, entry, state.activeWorkspaceId);
  const originalGroup = entry.originalGroupId
    ? state.groups.find((group) => group.id === entry.originalGroupId && group.workspaceId === workspaceId)
    : undefined;
  if (originalGroup) return originalGroup;

  if (entry.originalFolderId) {
    const folderExists = state.folders.some((folder) => folder.id === entry.originalFolderId
      && folder.workspaceId === workspaceId);
    const folderGroup = state.groups.find((group) => group.workspaceId === workspaceId
      && group.folderId === entry.originalFolderId && !group.starred);
    if (folderGroup) return folderGroup;
    if (folderExists) return undefined;
  }

  return state.groups.find((group) => group.workspaceId === workspaceId
    && group.folderId === null && !group.starred);
}

function enqueuePersistence<T>(operation: () => Promise<T>): Promise<T> {
  const run = persistenceQueue.then(operation);
  persistenceQueue = run.then(() => undefined, () => undefined);
  return run;
}

function seedCommittedDropLedger(
  base: TabBoardState,
  authoritative: TabBoardState,
  mutations: readonly StateMutation[],
): TabBoardState {
  const committedOperationIds = new Set(
    mutations.flatMap((mutation) => mutation.type === 'drop-intent' ? [mutation.operationId] : []),
  );
  if (!committedOperationIds.size) return base;
  const entries = new Map((base.dropOperationLedger || []).map((entry) => [entry.operationId, entry]));
  (authoritative.dropOperationLedger || [])
    .filter((entry) => committedOperationIds.has(entry.operationId))
    .forEach((entry) => entries.set(entry.operationId, entry));
  return {
    ...base,
    mutationRevision: Math.max(base.mutationRevision, authoritative.mutationRevision),
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

function isMutationAlreadyReflected(state: TabBoardState, mutation: StateMutation): boolean {
  try {
    return stateFingerprintWithoutVolatileMetadata(state) ===
      stateFingerprintWithoutVolatileMetadata(applyStateMutation(state, mutation));
  } catch {
    return false;
  }
}

function replayCommittedMutations(
  newestRemoteState: TabBoardState,
  authoritative: TabBoardState,
  committedMutations: readonly StateMutation[],
): TabBoardState {
  const replayBase = seedCommittedDropLedger(newestRemoteState, authoritative, committedMutations);
  const committedDropOperationIds = new Set(
    committedMutations.flatMap((mutation) => mutation.type === 'drop-intent' ? [mutation.operationId] : []),
  );
  const replayed = committedMutations.reduce((current, mutation) => {
    if (mutation.type === 'drop-intent' && committedDropOperationIds.has(mutation.operationId)) {
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
    : { ...replayed, mutationRevision: replayBase.mutationRevision, updatedAt: replayBase.updatedAt };
}

function remoteStateTimestamp(state: TabBoardState): number {
  const timestamp = Date.parse(state.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function newestRemoteState(
  authoritative: TabBoardState,
  buffered: TabBoardState | null,
): TabBoardState {
  if (!buffered) return authoritative;
  if (buffered.mutationRevision !== authoritative.mutationRevision) {
    return buffered.mutationRevision > authoritative.mutationRevision ? buffered : authoritative;
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

interface ReconciliationResult {
  failures: ReconciliationFailure[];
}

function reconcileAuthoritativeState(
  authoritative: TabBoardState,
  committedMutations: readonly StateMutation[] = [],
): ReconciliationResult {
  const state = useTabBoardStore.getState();
  const buffered = pendingRemoteState;
  pendingRemoteState = null;
  const reconciledRemoteState = newestRemoteState(authoritative, buffered);
  const reconciledBase = hasDistinctNewerRemoteState(authoritative, buffered)
    ? replayCommittedMutations(reconciledRemoteState, authoritative, committedMutations)
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
  const sharedOptimistic = structurallyShareState(persistedSnapshot(state), optimistic);
  lastAuthoritativeState = structurallyShareState(
    lastAuthoritativeState || persistedSnapshot(state),
    reconciledBase,
  );
  useTabBoardStore.setState({
    ...sharedOptimistic,
    hydrated: state.hydrated,
    persistenceError: useTabBoardStore.getState().persistenceError,
  });
  failures.forEach(({ mutation, error }) => {
    const waiters = pendingPersistenceWaiters.filter(({ mutation: pending }) => sameMutation(pending, mutation));
    pendingPersistenceWaiters = pendingPersistenceWaiters.filter(({ mutation: pending }) => !sameMutation(pending, mutation));
    waiters.forEach(({ reject }) => reject(error));
  });
  return { failures };
}

function applyOptimisticMutation(mutation: StateMutation): void {
  const state = useTabBoardStore.getState();
  if (!pendingMutations.length && !inFlightMutations) {
    lastAuthoritativeState = persistedSnapshot(state);
  }
  const next = applyStateMutation(persistedSnapshot(state), mutation);
  useTabBoardStore.setState({
    ...next,
    hydrated: state.hydrated,
    persistenceError: state.persistenceError,
  });
  pendingMutations = [...pendingMutations, mutation];
}

function takePendingMutations(): StateMutation[] {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  const batch = pendingMutations;
  pendingMutations = [];
  return batch;
}

function isCategoryMutation(mutation: StateMutation): boolean {
  return mutation.type === 'add-folder' || mutation.type === 'rename-folder' ||
    mutation.type === 'delete-folder' || mutation.type === 'set-category-order';
}

function isCategoryValidationError(error: unknown): boolean {
  return Boolean(error instanceof CategoryValidationError
    || (error && typeof error === 'object' && 'code' in error
      && (error as { code?: unknown }).code === 'CATEGORY_VALIDATION'));
}

function isRestoreCollisionError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error
    && (error as { code?: unknown }).code === 'RESTORE_ID_COLLISION');
}

function persistenceErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function isTerminalSemanticError(error: unknown): boolean {
  const code = persistenceErrorCode(error);
  return Boolean(code && code !== 'INVALID_DROP_INTENT' && code !== 'RESTORE_ID_COLLISION');
}

function invalidDropIndexes(error: unknown, batch: readonly StateMutation[]): Set<number> {
  const code = error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
  const indexes = error && typeof error === 'object' && 'invalidMutationIndexes' in error
    ? (error as { invalidMutationIndexes?: unknown }).invalidMutationIndexes
    : undefined;
  if (code !== 'INVALID_DROP_INTENT' || !Array.isArray(indexes)) {
    return batch.length === 1 && batch[0]?.type === 'drop-intent' && error instanceof InvalidDropMutationError
      ? new Set([0])
      : new Set();
  }
  return new Set(indexes.filter((index): index is number =>
    Number.isSafeInteger(index) && index >= 0 && index < batch.length,
  ));
}

function committedMutationIndexes(error: unknown, batch: readonly StateMutation[]): Set<number> {
  const indexes = error && typeof error === 'object' && 'committedMutationIndexes' in error
    ? (error as { committedMutationIndexes?: unknown }).committedMutationIndexes
    : undefined;
  if (!Array.isArray(indexes)) return new Set();
  return new Set(indexes.filter((index): index is number =>
    Number.isSafeInteger(index) && index >= 0 && index < batch.length,
  ));
}

function committedState(error: unknown): TabBoardState | null {
  const value = error && typeof error === 'object' && 'committedState' in error
    ? (error as { committedState?: unknown }).committedState
    : undefined;
  return value && typeof value === 'object' ? value as TabBoardState : null;
}

async function recoverAuthoritativeState(): Promise<TabBoardState | null> {
  let recovered: TabBoardState | null = null;
  try {
    recovered = await getActiveState();
  } catch {
    recovered = null;
  }
  if (recovered) return newestRemoteState(recovered, pendingRemoteState);
  if (lastAuthoritativeState) return newestRemoteState(lastAuthoritativeState, pendingRemoteState);
  return null;
}

function rebasePendingDropRevisions(authoritative: TabBoardState): void {
  let simulated = authoritative;
  const rebased = pendingMutations.map((mutation) => {
    if (mutation.type === 'drop-intent') {
      const next = mutation.expectedRevision === simulated.mutationRevision
        ? mutation
        : { ...mutation, expectedRevision: simulated.mutationRevision };
      try {
        simulated = applyStateMutation(simulated, next);
      } catch {
        // Keep the drop queued; the worker remains authoritative for final validation.
      }
      return next;
    }
    try {
      simulated = applyStateMutation(simulated, mutation);
    } catch {
      // Invalid queued ordinary mutations are removed by reconciliation.
    }
    return mutation;
  });
  pendingMutations = rebased;
}

interface IsolatedBatchResult {
  error: unknown;
  canRetry: boolean;
  succeeded: StateMutation[];
  failures: Array<{ mutation: StateMutation; error: unknown }>;
  authoritative: TabBoardState | null;
}

async function isolateTerminalOrdinaryBatch(
  batch: readonly StateMutation[],
  initialError: unknown,
): Promise<IsolatedBatchResult> {
  const candidates: StateMutation[] = batch.filter((mutation) => mutation.type !== 'drop-intent');
  let remaining: StateMutation[] = [...candidates];
  let queuedOutsideBatch = [...pendingMutations];
  let firstError: unknown = initialError;
  let reconciliationError: unknown;
  let canRetry = false;
  let authoritative: TabBoardState | null = null;
  const succeeded: StateMutation[] = [];
  const failures: Array<{ mutation: StateMutation; error: unknown }> = [];
  const captureQueuedMutations = (): void => {
    const known = new Set([...remaining, ...queuedOutsideBatch]);
    const newlyQueued = pendingMutations.filter((mutation) => !known.has(mutation));
    queuedOutsideBatch = [...queuedOutsideBatch, ...newlyQueued];
  };

  for (const mutation of candidates) {
    if (!remaining.includes(mutation)) continue;
    remaining = remaining.filter((candidate) => candidate !== mutation);
    pendingMutations = [...remaining, ...queuedOutsideBatch];
    inFlightMutations = [mutation];
    try {
      const persisted = await sendStateMutations([mutation]);
      authoritative = persisted;
      succeeded.push(mutation);
      inFlightMutations = null;
      captureQueuedMutations();
      pendingMutations = [...remaining, ...queuedOutsideBatch];
      const reconciliation = reconcileAuthoritativeState(persisted, [mutation]);
      rebasePendingDropRevisions(lastAuthoritativeState || persisted);
      if (reconciliation.failures.length) {
        failures.push(...reconciliation.failures);
        reconciliationError = reconciliation.failures[0]?.error;
      }
      emitRestoreSuccesses([mutation]);
      emitMutationSuccesses([mutation]);
      remaining = remaining.filter((candidate) => pendingMutations.includes(candidate));
      queuedOutsideBatch = pendingMutations.filter((candidate) => !remaining.includes(candidate));
    } catch (error: unknown) {
      inFlightMutations = null;
      const isTerminalFailure = isTerminalSemanticError(error)
        && !isRestoreCollisionError(error)
        && mutation.type !== 'drop-intent';
      captureQueuedMutations();
      remaining = isTerminalFailure ? remaining : [mutation, ...remaining];
      pendingMutations = [...remaining, ...queuedOutsideBatch];
      const recovery = await recoverAuthoritativeState();
      captureQueuedMutations();
      if (recovery) {
        const reconciliation = reconcileAuthoritativeState(recovery);
        rebasePendingDropRevisions(lastAuthoritativeState || recovery);
        if (reconciliation.failures.length) {
          failures.push(...reconciliation.failures);
          reconciliationError = reconciliation.failures[0]?.error;
        }
        remaining = remaining.filter((candidate) => pendingMutations.includes(candidate));
        queuedOutsideBatch = pendingMutations.filter((candidate) => !remaining.includes(candidate));
      }
      if (isTerminalFailure) {
        failures.push({ mutation, error });
        firstError = error;
      } else {
        firstError = firstError || error;
      }
      if (!isTerminalFailure) {
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
}

function schedulePendingRetry(): void {
  if (suppressRetrySchedule) {
    suppressRetrySchedule = false;
    return;
  }
  if (!pendingMutations.length || retryTimeout || persistenceRetryAttempt >= PERSISTENCE_RETRY_DELAYS_MS.length) return;
  const delay = PERSISTENCE_RETRY_DELAYS_MS[persistenceRetryAttempt];
  persistenceRetryAttempt += 1;
  retryTimeout = setTimeout(() => {
    retryTimeout = null;
    void sendPendingBatch().catch(() => schedulePendingRetry());
  }, delay);
}

function sendPendingBatch(additional: readonly StateMutation[] = []): Promise<TabBoardState | null> {
  return enqueuePersistence(async () => {
    const batch = [...takePendingMutations(), ...additional];
    if (additional.length > 0) suppressRetrySchedule = false;
    const waiters = takePersistenceWaiters(batch);
    if (!batch.length) return null;
    inFlightMutations = batch;
    try {
      const authoritative = await sendStateMutations(batch);
      inFlightMutations = null;
      settlePersistenceWaiters(waiters, batch);
      const reconciliation = reconcileAuthoritativeState(authoritative, batch);
      emitRestoreSuccesses(batch);
      emitMutationSuccesses(batch);
      persistenceRetryAttempt = 0;
      suppressRetrySchedule = false;
      if (retryTimeout) clearTimeout(retryTimeout);
      retryTimeout = null;
      if (reconciliation.failures.length) {
        const reconciliationError = reconciliation.failures[0]?.error;
        reportPersistenceError(reconciliationError);
        return Promise.reject(reconciliationError);
      }
      if (useTabBoardStore.getState().persistenceError) {
        useTabBoardStore.setState({ persistenceError: null });
      }
      return authoritative;
    } catch (error: unknown) {
      inFlightMutations = null;
      const isValidationFailure = isCategoryValidationError(error);
      const isRestoreCollision = isRestoreCollisionError(error);
      const invalidIndexes = invalidDropIndexes(error, batch);
      const committedIndexes = committedMutationIndexes(error, batch);
      const isInvalidDrop = invalidIndexes.size > 0;
      const isTerminalOrdinaryFailure = isTerminalSemanticError(error)
        && !isValidationFailure
        && !isRestoreCollision
        && !isInvalidDrop;
      const hasOrdinarySibling = batch.some((mutation) => mutation.type !== 'drop-intent');
      if (isTerminalOrdinaryFailure && batch.length > 1 && hasOrdinarySibling) {
        const hasRetryBudget = persistenceRetryAttempt < PERSISTENCE_RETRY_DELAYS_MS.length;
        const retainedDrops = hasRetryBudget
          ? batch.filter((mutation) => mutation.type === 'drop-intent')
          : [];
        pendingMutations = [...retainedDrops, ...pendingMutations];
        const isolated = await isolateTerminalOrdinaryBatch(batch, error);
        const committedIndexes = new Set(batch.map((mutation, index) =>
          isolated.succeeded.includes(mutation) ? index : -1,
        ).filter((index) => index >= 0));
        const retainedIndexes = isolated.canRetry
          ? new Set(batch.map((mutation, index) => pendingMutations.some((candidate) => sameMutation(candidate, mutation)) ? index : -1)
            .filter((index) => index >= 0))
          : new Set<number>();
        const errorsByMutation = new Map(isolated.failures.map(({ mutation, error: failure }) => [mutation, failure]));
        settlePersistenceWaiters(
          waiters,
          batch,
          error,
          committedIndexes,
          retainedIndexes,
          errorsByMutation,
        );
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
        reportPersistenceError(isolated.error);
        const didAdditionalMutationsSucceed = additional.length > 0
          && additional.every((mutation) => isolated.succeeded.includes(mutation));
        if (didAdditionalMutationsSucceed) return isolated.authoritative;
        return Promise.reject(isolated.error);
      }
      const retainedBatch = batch.filter((_, index) => !invalidIndexes.has(index) && !committedIndexes.has(index));
      const retryableBatch = isRestoreCollision
        ? retainedBatch.filter((mutation) => mutation.type !== 'restore-group' && mutation.type !== 'restore-tab')
        : retainedBatch;
      const hasRetryBudget = persistenceRetryAttempt < PERSISTENCE_RETRY_DELAYS_MS.length;
      const nextPendingBatch = isValidationFailure
        ? batch.filter((mutation, index) => !isCategoryMutation(mutation) && !committedIndexes.has(index))
        : isTerminalOrdinaryFailure
          ? hasRetryBudget
            ? retryableBatch.filter((mutation) => mutation.type === 'drop-intent')
            : []
          : hasRetryBudget
            ? retryableBatch
            : retryableBatch.filter((mutation) => mutation.type !== 'drop-intent');
      const nonDropRetryBatch = nextPendingBatch.filter((mutation) => mutation.type !== 'drop-intent');
      const persisted = committedState(error);
      pendingMutations = [...nextPendingBatch, ...pendingMutations];
      const hasTerminalDropWithRetainedOrdinary = !isValidationFailure && !hasRetryBudget
        && batch.some((mutation) => mutation.type === 'drop-intent')
        && nonDropRetryBatch.length > 0;
      const shouldResetRetryBudget = isTerminalOrdinaryFailure
        || (nonDropRetryBatch.length > 0
          && (isValidationFailure || isRestoreCollision || hasTerminalDropWithRetainedOrdinary));
      if (shouldResetRetryBudget) {
        persistenceRetryAttempt = 0;
        suppressRetrySchedule = false;
      }
      const removedNonDropMutation = isRestoreCollision && batch.some((mutation, index) =>
        mutation.type !== 'drop-intent'
        && !committedIndexes.has(index)
        && !retryableBatch.some((candidate) => sameMutation(candidate, mutation)),
      );
      let reconciliationState = persisted;
      if (!reconciliationState && (isTerminalOrdinaryFailure || isRestoreCollision || (!hasRetryBudget
        && batch.some((mutation) => mutation.type === 'drop-intent')))) {
        try {
          reconciliationState = await getActiveState();
        } catch {
          reconciliationState = null;
        }
        if (!reconciliationState && lastAuthoritativeState) {
          reconciliationState = newestRemoteState(lastAuthoritativeState, pendingRemoteState);
        }
      }
      let reconciliationFailures: ReconciliationFailure[] = [];
      if (reconciliationState) {
        const committedMutations = batch.filter((_, index) => committedIndexes.has(index));
        const reconciliation = reconcileAuthoritativeState(
          reconciliationState,
          pendingRemoteState ? committedMutations : [],
        );
        reconciliationFailures = reconciliation.failures;
        const shouldRebasePendingDrops = !isInvalidDrop && (
          (isTerminalOrdinaryFailure && batch.every((mutation) => mutation.type !== 'drop-intent'))
          || removedNonDropMutation
        );
        if (shouldRebasePendingDrops) {
          rebasePendingDropRevisions(lastAuthoritativeState || reconciliationState);
        }
      }
      emitRestoreSuccesses(batch, committedIndexes);
      emitMutationSuccesses(batch, committedIndexes);
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
        ? new Set(batch.map((mutation, index) => pendingMutations.some((candidate) => sameMutation(candidate, mutation)) ? index : -1)
          .filter((index) => index >= 0))
        : new Set<number>();
      settlePersistenceWaiters(waiters, batch, error, committedIndexes, retainedIndexes);
      const waiterMutations = new Set(waiters.map(({ mutation }) => mutation));
      const hasUnownedFailure = batch.some((mutation, index) =>
        !committedIndexes.has(index)
        && !retainedIndexes.has(index)
        && !waiterMutations.has(mutation),
      );
      const terminalDropWithRetainedOrdinary = !isValidationFailure && !hasRetryBudget
        && batch.some((mutation) => mutation.type === 'drop-intent')
        && nonDropRetryBatch.length > 0;
      const deferErrorNotification = canRetry
        && !isValidationFailure
        && !isInvalidDrop
        && !isRestoreCollision
        && !isTerminalOrdinaryFailure
        && reconciliationFailures.length === 0;
      const shouldNotify = terminalDropWithRetainedOrdinary
        || (waiters.length > 0 ? hasUnownedFailure : !deferErrorNotification);
      const surfacedError = reconciliationFailures[0]?.error || error;
      reportPersistenceError(surfacedError, shouldNotify);
      throw surfacedError;
    }
  });
}

function scheduleSave(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    void sendPendingBatch().catch(() => schedulePendingRetry());
  }, 100);
}

function emitRestoreSuccesses(
  batch: readonly StateMutation[],
  committedIndexes?: ReadonlySet<number>,
): void {
  batch.forEach((mutation, index) => {
    if (committedIndexes && !committedIndexes.has(index)) return;
    if (mutation.type === 'restore-group') {
      emitEvent(AppEvents.RESTORE_SUCCESS, {
        type: 'group',
        count: mutation.group.tabs.length,
        label: mutation.group.title,
      });
    } else if (mutation.type === 'restore-tab') {
      emitEvent(AppEvents.RESTORE_SUCCESS, {
        type: 'tab',
        count: 1,
        label: mutation.tab.title,
      });
    }
  });
}

function emitMutationSuccesses(
  batch: readonly StateMutation[],
  committedIndexes?: ReadonlySet<number>,
): void {
  batch.forEach((mutation, index) => {
    if (committedIndexes && !committedIndexes.has(index)) return;
    if (mutation.type === 'add-group') {
      emitEvent(AppEvents.SAVE_SUCCESS, {
        title: mutation.group.title,
        tabCount: mutation.group.tabs.length,
      });
    } else if (mutation.type === 'import-groups') {
      emitEvent(AppEvents.IMPORT_SUCCESS, {
        groupCount: mutation.groups.length,
        tabCount: mutation.groups.reduce((sum, group) => sum + group.tabs.length, 0),
      });
    }
  });
}

function commitMutation(mutation: StateMutation): void {
  syncPersistenceContext();
  applyOptimisticMutation(mutation);
  scheduleSave();
}

function commitRestoreMutation(mutation: Extract<StateMutation, { type: 'restore-group' | 'restore-tab' }>): void {
  syncPersistenceContext();
  try {
    applyOptimisticMutation(mutation);
  } catch (error: unknown) {
    reportPersistenceError(error);
    return;
  }
  scheduleSave();
}

function commitDropMutation(mutation: StateMutation): Promise<void> {
  syncPersistenceContext();
  try {
    applyOptimisticMutation(mutation);
  } catch (error: unknown) {
    reportPersistenceError(error, false);
    const persistence = Promise.reject<void>(error);
    persistence.catch(() => undefined);
    return persistence;
  }
  const persistence = new Promise<void>((resolve, reject) => {
    pendingPersistenceWaiters = [...pendingPersistenceWaiters, { mutation, resolve, reject }];
    scheduleSave();
  });
  persistence.catch(() => undefined);
  return persistence;
}

function commitCategoryMutation(mutation: StateMutation): Promise<void> {
  syncPersistenceContext();
  const persistence = new Promise<void>((resolve, reject) => {
    pendingPersistenceWaiters = [...pendingPersistenceWaiters, { mutation, resolve, reject }];
    void sendPendingBatch([mutation]).catch(() => undefined);
  });
  persistence.catch(() => undefined);
  return persistence;
}

export const useTabBoardStore = create<TabBoardStore>((set, get) => ({
  ...createEmptyState(),
  hydrated: false,
  persistenceError: null,

  hydrate: () => {
    if (hydrationPromise) return hydrationPromise;
    const generation = hydrationGeneration;
    const hydration = (async () => {
      let pendingHydrationState: TabBoardState | null = null;
      try {
        await ensureStateForHydration();
        if (generation !== hydrationGeneration) return;

        activeHydrationUnsubscribe?.();
        activeHydrationUnsubscribe = subscribeActiveState((newState) => {
          if (generation !== hydrationGeneration) return;
          if (!get().hydrated) {
            pendingHydrationState = newState;
            return;
          }
          if (pendingMutations.length || inFlightMutations) {
            pendingRemoteState = newState;
            return;
          }
          const current = persistedSnapshot(get());
          const sharedState = structurallyShareState(current, newState);
          lastAuthoritativeState = sharedState;
          set({ ...sharedState, hydrated: true });
        });

        const saved = await getActiveState();
        if (generation !== hydrationGeneration) return;

        const hydratedState = newestRemoteState(saved, pendingHydrationState);
        const sharedState = structurallyShareState(persistedSnapshot(get()), hydratedState);
        lastAuthoritativeState = sharedState;
        set({ ...sharedState, hydrated: true, persistenceError: null });
        pendingHydrationState = null;
      } catch (error: unknown) {
        if (generation !== hydrationGeneration) return;
        activeHydrationUnsubscribe?.();
        activeHydrationUnsubscribe = null;
        reportPersistenceError(error, false);
        set({ hydrated: false });
        throw error;
      }
    })();
    hydrationPromise = hydration.catch((error: unknown) => {
      if (generation === hydrationGeneration) hydrationPromise = null;
      throw error;
    });
    return hydrationPromise;
  },
  releaseHydration: releaseHydrationLifecycle,

  setActiveWorkspace: (workspaceId) => {
    commitMutation({ type: 'set-active-workspace', workspaceId, updatedAt: nowIso() });
  },

  addWorkspace: (name) => {
    const timestamp = nowIso();
    const workspace: Workspace = {
      id: createId('workspace'),
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    commitMutation({ type: 'add-workspace', workspace });
  },

  renameWorkspace: (id, name) => {
    commitMutation({ type: 'rename-workspace', id, name, updatedAt: nowIso() });
  },

  deleteWorkspace: (id) => {
    const state = get();
    if (state.workspaces.length <= 1) return;
    const remaining = state.workspaces.filter((w) => w.id !== id);
    const newActiveId = state.activeWorkspaceId === id ? remaining[0].id : state.activeWorkspaceId;
    commitMutation({ type: 'delete-workspace', id, newActiveWorkspaceId: newActiveId, updatedAt: nowIso() });
  },

  addFolder: async (workspaceId, name, color = 'slate') => {
    const timestamp = nowIso();
    const folder: Folder = {
      id: createId('folder'),
      name,
      color,
      workspaceId,
      collapsed: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await commitCategoryMutation({ type: 'add-folder', folder });
  },

  renameFolder: async (id, name) => {
    await commitCategoryMutation({ type: 'rename-folder', id, name, updatedAt: nowIso() });
  },

  deleteFolder: async (id) => {
    await commitCategoryMutation({ type: 'delete-folder', id, updatedAt: nowIso() });
  },

  addGroup: (group) => {
    const timestamp = nowIso();
    const newGroup: Group = {
      ...group,
      id: createId('group'),
      tabs: group.tabs.map((t) => ({
        ...t,
        id: createId('tab'),
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    commitMutation({ type: 'add-group', group: newGroup, updatedAt: timestamp });
  },

  updateGroup: (id, updates) => {
    commitMutation({ type: 'update-group', id, updates, updatedAt: nowIso() });
  },

  deleteGroup: (id) => {
    const state = get();
    const group = state.groups.find((g) => g.id === id);
    if (!group) return;
    const timestamp = nowIso();
    const categoryIndex = state.groups
      .filter((item) => item.workspaceId === group.workspaceId && item.folderId === group.folderId && item.starred === group.starred && item.archived === group.archived)
      .findIndex((item) => item.id === id);
    const workspace = state.workspaces.find((w) => w.id === group.workspaceId);
    const folder = group.folderId ? state.folders.find((f) => f.id === group.folderId) : null;
    const binEntry: BinEntry = {
      id: createId('bin'),
      kind: 'group',
      label: group.title,
      groupId: group.id,
      groupTitle: group.title,
      source: 'group',
      item: group,
      deletedAt: timestamp,
      originalWorkspaceId: group.workspaceId,
      originalFolderId: group.folderId,
      originalWorkspaceName: workspace?.name,
      originalFolderName: folder?.name,
      originalIndex: categoryIndex >= 0 ? categoryIndex : undefined,
    };
    commitMutation({ type: 'delete-group', id, binEntry, updatedAt: timestamp });
  },

  moveGroup: (groupId, targetFolderId, index) => {
    const state = get();
    const group = state.groups.find((item) => item.id === groupId);
    if (!group) return;
    const timestamp = nowIso();
    commitMutation({
      type: 'move-group',
      groupId,
      targetFolderId,
      starred: false,
      archived: false,
      index,
      updatedAt: timestamp,
    });
  },

  addTabToGroup: (groupId, tab) => {
    const timestamp = nowIso();
    const newTab: TabItem = {
      ...tab,
      id: createId('tab'),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    commitMutation({ type: 'add-tab', groupId, tab: newTab, updatedAt: timestamp });
  },

  updateTab: (groupId, tabId, updates) => {
    commitMutation({ type: 'update-tab', groupId, tabId, updates, updatedAt: nowIso() });
  },

  deleteTab: (groupId, tabId) => {
    const state = get();
    const group = state.groups.find((g) => g.id === groupId);
    const tab = group?.tabs.find((t) => t.id === tabId);
    if (!group || !tab) return;
    const timestamp = nowIso();
    const tabIndex = group.tabs.findIndex((t) => t.id === tabId);
    const workspace = state.workspaces.find((w) => w.id === group.workspaceId);
    const folder = group.folderId ? state.folders.find((f) => f.id === group.folderId) : null;
    const binEntry = {
      id: createId('bin'),
      kind: 'tab' as const,
      label: tab.title,
      groupId: group.id,
      groupTitle: group.title,
      source: 'group',
      item: tab,
      deletedAt: timestamp,
      originalGroupId: group.id,
      originalIndex: tabIndex,
      originalWorkspaceId: group.workspaceId,
      originalFolderId: group.folderId,
      originalWorkspaceName: workspace?.name,
      originalFolderName: folder?.name,
    };
    commitMutation({ type: 'delete-tab', groupId, tabId, binEntry, updatedAt: timestamp });
  },

  restoreFromBin: (binEntryId) => {
    const state = get();
    const entry = state.bin.find((item) => item.id === binEntryId);
    if (!entry) return;
    const timestamp = nowIso();
    if (entry.kind === 'group') {
      const restoredState = restoreGroupFromBin(persistedSnapshot(state), binEntryId, timestamp);
      const restoredGroup = restoredState.groups.find((group) =>
        group.id === (entry.item as Group).id && group.updatedAt === timestamp,
      );
      if (!restoredGroup) return;
      const restoredIndex = restoredState.groups
        .filter((group) => group.workspaceId === restoredGroup.workspaceId &&
          group.folderId === restoredGroup.folderId && group.starred === restoredGroup.starred)
        .findIndex((group) => group.id === restoredGroup.id && group.updatedAt === timestamp);
      commitRestoreMutation({
        type: 'restore-group',
        entryId: binEntryId,
        group: restoredGroup,
        index: restoredIndex,
        updatedAt: timestamp,
      });
      return;
    }
    const originalTab = entry.item as TabItem;
    const targetGroup = findRestoreTabTargetGroup(state, entry);
    if (!targetGroup) {
      reportPersistenceError(new Error('Unable to restore tab: no legal target group exists in the original workspace/category.'));
      return;
    }
    const index = typeof entry.originalIndex === 'number' && entry.originalIndex >= 0
      ? Math.min(entry.originalIndex, targetGroup.tabs.length)
      : targetGroup.tabs.length;
    const restoredTab: TabItem = { ...originalTab, id: originalTab.id, createdAt: originalTab.createdAt, updatedAt: timestamp };
    commitRestoreMutation({ type: 'restore-tab', entryId: binEntryId, groupId: targetGroup.id, tab: restoredTab, index, updatedAt: timestamp });
  },

  deleteBinEntry: (binEntryId) => {
    commitMutation({ type: 'delete-bin-entry', entryId: binEntryId, updatedAt: nowIso() });
  },

  clearBin: () => {
    commitMutation({ type: 'clear-bin', updatedAt: nowIso() });
  },

  updateSettings: (updates) => {
    commitMutation({ type: 'update-settings', updates, updatedAt: nowIso() });
  },

  moveTab: (groupId, tabId, targetGroupId, targetIndex) => {
    const state = get();
    const sourceGroup = state.groups.find((g) => g.id === groupId);
    const targetGroup = state.groups.find((g) => g.id === targetGroupId);
    if (!sourceGroup || !targetGroup) return;

    const tabIndex = sourceGroup.tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    const timestamp = nowIso();
    commitMutation({ type: 'move-tab', groupId, tabId, targetGroupId, targetIndex, updatedAt: timestamp });
  },

  applyDropIntent: (intent, openTabs = []) => commitDropMutation({
    type: 'drop-intent',
    operationId: createId('drop-operation'),
    intent,
    openTabs: [...openTabs],
    expectedRevision: get().mutationRevision,
    updatedAt: nowIso(),
  }),

  reorderGroupsInFolder: (workspaceId, folderId, starred, archived, orderedGroupIds) => {
    commitMutation({ type: 'reorder-groups', workspaceId, folderId, starred, archived, orderedGroupIds, updatedAt: nowIso() });
  },

  starGroup: (groupId) => {
    const group = get().groups.find((item) => item.id === groupId);
    if (!group) return;
    commitMutation({ type: 'set-group-flags', id: groupId, starred: !group.starred, updatedAt: nowIso() });
  },

  lockGroup: (groupId) => {
    const group = get().groups.find((item) => item.id === groupId);
    if (!group) return;
    commitMutation({ type: 'set-group-flags', id: groupId, locked: !group.locked, updatedAt: nowIso() });
  },

  collapseGroup: (groupId) => {
    const group = get().groups.find((item) => item.id === groupId);
    if (!group) return;
    commitMutation({ type: 'set-group-flags', id: groupId, collapsed: !group.collapsed, updatedAt: nowIso() });
  },

  addNoteToGroup: (groupId, text) => {
    if (!get().groups.some((group) => group.id === groupId)) return;
    const timestamp = nowIso();
    commitMutation({ type: 'set-group-note', groupId, text, noteTab: createNoteRecord(text), updatedAt: timestamp });
  },

  addTabNote: (groupId, tabId, text) => {
    const group = get().groups.find((item) => item.id === groupId);
    if (!group?.tabs.some((tab) => tab.id === tabId)) return;
    commitMutation({ type: 'set-tab-note', groupId, tabId, text, updatedAt: nowIso() });
  },

  updateCategoryOrder: async (workspaceId, categoryOrder) => {
    await commitCategoryMutation({ type: 'set-category-order', workspaceId, categoryOrder, updatedAt: nowIso() });
  },

  importGroups: (text, options = {}) => {
    const state = get();
    const workspaceId = options.workspaceId || state.activeWorkspaceId;
    const folderId = options.folderId ?? null;
    try {
      const importedState = importText(persistedSnapshot(state), text, { workspaceId, folderId });
      const existingIds = new Set(state.groups.map((group) => group.id));
      const newGroups = importedState.groups.filter((group) => !existingIds.has(group.id));
      const updatedAt = importedState.updatedAt;
      commitMutation({ type: 'import-groups', groups: newGroups, updatedAt });
    } catch (error: unknown) {
      reportError(error, 'import');
      throw error;
    }
  },

  exportAll: () => exportToJson(persistedSnapshot(get())),

  toggleFolderCollapsed: (folderId) => {
    const folder = get().folders.find((item) => item.id === folderId);
    if (!folder) return;
    commitMutation({ type: 'set-folder-collapsed', id: folderId, collapsed: !folder.collapsed, updatedAt: nowIso() });
  },
}));
