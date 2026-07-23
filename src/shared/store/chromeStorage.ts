import { normalizeState, type TabBoardState } from '../model';
import { logBreadcrumb, logWarning } from '../utils/diagnostics';
import {
  applyStateMutations,
  InvalidDropMutationError,
} from './stateMutations';
import { createChromeStorageAdapter } from './chromeStorageAdapter';
import type { StorageAdapter } from './storageAdapter';

// Default adapter instance used by all the exported convenience functions.
// Call sites that import the legacy function API keep working transparently;
// new code can import createChromeStorageAdapter() directly.
const defaultAdapter: StorageAdapter = createChromeStorageAdapter();

export async function getState(): Promise<TabBoardState> {
  return defaultAdapter.getState();
}

export async function setState(state: TabBoardState): Promise<void> {
  return defaultAdapter.setState(state);
}

let localHarnessChrome: unknown;
let localHarnessState: TabBoardState | null = null;

export class StatePersistenceError extends Error {
  readonly code?: string;
  readonly invalidMutationIndexes: number[];
  readonly committedMutationIndexes: number[];
  readonly committedState?: TabBoardState;

  constructor(
    message: string,
    code?: string,
    invalidMutationIndexes: readonly number[] = [],
    committedMutationIndexes: readonly number[] = [],
    committedState?: TabBoardState,
  ) {
    super(message);
    this.name = 'StatePersistenceError';
    this.code = code;
    this.invalidMutationIndexes = [...invalidMutationIndexes];
    this.committedMutationIndexes = [...committedMutationIndexes];
    this.committedState = committedState;
  }
}

function responseError(response: unknown): StatePersistenceError {
  const value = response && typeof response === 'object' ? response as {
    error?: unknown;
    code?: unknown;
    invalidMutationIndexes?: unknown;
    committedMutationIndexes?: unknown;
    state?: unknown;
  } : {};
  const committedState = value.state && typeof value.state === 'object'
    ? normalizeState(value.state)
    : undefined;
  return new StatePersistenceError(
    String(value.error || 'State persistence failed.'),
    typeof value.code === 'string' ? value.code : undefined,
    Array.isArray(value.invalidMutationIndexes) ? value.invalidMutationIndexes.filter(
      (index): index is number => Number.isSafeInteger(index) && index >= 0,
    ) : [],
    Array.isArray(value.committedMutationIndexes) ? value.committedMutationIndexes.filter(
      (index): index is number => Number.isSafeInteger(index) && index >= 0,
    ) : [],
    committedState,
  );
}

async function applyMutationsLocally(
  current: TabBoardState,
  mutations: readonly unknown[],
): Promise<TabBoardState> {
  return normalizeState(applyStateMutations(current, mutations));
}

export async function sendStateMutations(
  mutations: readonly unknown[],
): Promise<TabBoardState> {
  if (typeof chrome.runtime?.sendMessage !== 'function') {
    if (localHarnessChrome !== chrome) {
      localHarnessChrome = chrome;
      localHarnessState = null;
    }
    const current = localHarnessState || await getState();
    try {
      const next = await applyMutationsLocally(current, mutations);
      await setState(next);
      localHarnessState = next;
      return next;
    } catch (error: unknown) {
      if (error instanceof InvalidDropMutationError && error.committedState) {
        await setState(error.committedState);
        localHarnessState = error.committedState;
      }
      throw error;
    }
  }
  const response = await chrome.runtime.sendMessage({
    type: 'tabboard-state-mutations',
    mutations,
  });
  if (!response?.ok) {
    throw responseError(response);
  }
  return normalizeState(response.result);
}

export async function ensureStateViaWorker(): Promise<TabBoardState> {
  if (typeof chrome.runtime?.sendMessage !== 'function') {
    return ensureState();
  }
  const response = await chrome.runtime.sendMessage({ type: 'tabboard-ensure-state' });
  if (!response?.ok) {
    throw responseError(response);
  }
  return normalizeState(response.result);
}

/**
 * Hydration-safe state read.
 *
 * The manager page does not actually need the MV3 service worker to display: it
 * only needs the persisted state, which lives in `chrome.storage.local` and is
 * readable directly. We still prefer the worker (it wakes it and seeds default
 * state on first install), but an idle/cold worker must never blank the page.
 * On any worker/messaging failure we fall back to reading storage locally, so
 * the UI always comes up. Writes still go through the worker for cross-page
 * serialization; only this read is decoupled.
 */
export async function ensureStateForHydration(): Promise<TabBoardState> {
  try {
    const viaWorker = await ensureStateViaWorker();
    logBreadcrumb('hydration', 'ensured state via service worker');
    return viaWorker;
  } catch (error: unknown) {
    // Worker asleep, cold-start race, or torn-down message port. Read the
    // authoritative state straight from local storage instead of failing.
    logWarning('hydration', 'worker ensure-state failed, falling back to local storage', error);
    const local = await ensureState();
    logBreadcrumb('hydration', 'ensured state via local storage fallback');
    return local;
  }
}

export async function updateState(
  updater: (state: TabBoardState) => TabBoardState
): Promise<TabBoardState> {
  const current = await getState();
  const next = normalizeState(updater(current));
  await setState(next);
  return next;
}

export async function getSettings() {
  const state = await getState();
  return state.settings;
}

export async function ensureState(): Promise<TabBoardState> {
  return defaultAdapter.ensureState();
}

export function subscribeState(callback: (state: TabBoardState) => void): () => void {
  return defaultAdapter.subscribeState(callback);
}
