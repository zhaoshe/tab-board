import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  createEmptyState,
  nowIso,
  type Settings,
  type TabBoardState,
} from '../../shared/model';
import {
  projectionFromState,
  readSettingsProjection,
  subscribeSettingsProjection,
  type SettingsProjection,
} from '../../shared/store/settingsProjection';
import type { StateMutation } from '../../shared/store/stateMutations';

interface OptionsSettingsSnapshot {
  hydrated: boolean;
  persistenceError: string | null;
  projection: SettingsProjection;
  saveStatus: OptionsSaveStatus;
}

export type OptionsSaveStatus =
  | 'loading'
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error';

const EMPTY_PROJECTION = projectionFromState(createEmptyState());

let snapshot: OptionsSettingsSnapshot = {
  hydrated: false,
  persistenceError: null,
  projection: EMPTY_PROJECTION,
  saveStatus: 'loading',
};
let hydrationPromise: Promise<void> | null = null;
let projectionUnsubscribe: (() => void) | null = null;
let consumers = 0;
let mutationQueue: Promise<void> = Promise.resolve();
let nextMutationId = 1;
let pendingMutations: Array<{
  id: number;
  updates: Partial<Settings>;
  previous: Partial<Settings>;
}> = [];
let lastFailedUpdates: Partial<Settings> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setSnapshot(next: OptionsSettingsSnapshot): void {
  snapshot = next;
  emit();
}

function newerProjection(
  left: SettingsProjection,
  right: SettingsProjection,
): SettingsProjection {
  if (right.mutationRevision !== left.mutationRevision) {
    return right.mutationRevision > left.mutationRevision ? right : left;
  }
  return Date.parse(right.updatedAt) >= Date.parse(left.updatedAt) ? right : left;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): OptionsSettingsSnapshot {
  return snapshot;
}

async function hydrate(): Promise<void> {
  if (hydrationPromise) return hydrationPromise;
  projectionUnsubscribe ??= subscribeSettingsProjection((projection) => {
    setSnapshot({
      ...snapshot,
      hydrated: true,
      projection: newerProjection(snapshot.projection, projection),
      saveStatus: pendingMutations.length > 0
        ? 'saving'
        : lastFailedUpdates
          ? 'error'
          : snapshot.saveStatus === 'loading'
            ? 'idle'
            : snapshot.saveStatus,
    });
  });
  const run = readSettingsProjection({
    readCanonicalState: async () => (
      await import('../../shared/store/activeAdapter')
    ).getActiveState(),
  }).then((projection) => {
    setSnapshot({
      hydrated: true,
      persistenceError: null,
      projection: newerProjection(snapshot.projection, projection),
      saveStatus: 'idle',
    });
  }).catch((error: unknown) => {
    setSnapshot({
      ...snapshot,
      hydrated: false,
      persistenceError: error instanceof Error ? error.message : String(error),
      saveStatus: 'error',
    });
    throw error;
  });
  hydrationPromise = run.finally(() => {
    hydrationPromise = null;
  });
  return hydrationPromise;
}

function release(): void {
  consumers -= 1;
  if (consumers > 0) return;
  consumers = 0;
  projectionUnsubscribe?.();
  projectionUnsubscribe = null;
  hydrationPromise = null;
  mutationQueue = Promise.resolve();
  nextMutationId = 1;
  pendingMutations = [];
  lastFailedUpdates = null;
  snapshot = {
    hydrated: false,
    persistenceError: null,
    projection: EMPTY_PROJECTION,
    saveStatus: 'loading',
  };
}

async function sendSettingsMutation(
  updates: Partial<Settings>,
): Promise<TabBoardState> {
  const mutation: StateMutation = {
    type: 'update-settings',
    updates,
    updatedAt: nowIso(),
  };
  const response = await chrome.runtime.sendMessage({
    type: 'tabboard-state-mutations',
    mutations: [mutation],
  });
  if (!response?.ok) {
    throw new Error(String(response?.error || 'Settings persistence failed.'));
  }
  return response.result as TabBoardState;
}

function overlayPendingSettings(
  settings: Settings,
): Settings {
  return pendingMutations.reduce(
    (current, pending) => ({ ...current, ...pending.updates }),
    settings,
  );
}

function withoutUpdatedKeys(
  failed: Partial<Settings> | null,
  updates: Partial<Settings>,
): Partial<Settings> | null {
  if (!failed) return null;
  const remaining = Object.fromEntries(
    Object.entries(failed).filter(([key]) =>
      !Object.prototype.hasOwnProperty.call(updates, key)),
  ) as Partial<Settings>;
  return Object.keys(remaining).length > 0 ? remaining : null;
}

function enqueueSettingsMutation(updates: Partial<Settings>): void {
  const previous = Object.fromEntries(
    Object.keys(updates).map((key) => [
      key,
      snapshot.projection.settings[key as keyof Settings],
    ]),
  ) as Partial<Settings>;
  const operation = {
    id: nextMutationId,
    updates,
    previous,
  };
  nextMutationId += 1;
  pendingMutations.push(operation);
  setSnapshot({
    hydrated: true,
    persistenceError: null,
    projection: {
      settings: { ...snapshot.projection.settings, ...updates },
      mutationRevision: snapshot.projection.mutationRevision,
      updatedAt: nowIso(),
    },
    saveStatus: 'saving',
  });

  mutationQueue = mutationQueue.then(async () => {
    try {
      const authoritative = await sendSettingsMutation(updates);
      pendingMutations = pendingMutations.filter(({ id }) => id !== operation.id);
      const projection = projectionFromState(authoritative);
      setSnapshot({
        hydrated: true,
        persistenceError: lastFailedUpdates ? snapshot.persistenceError : null,
        projection: {
          ...projection,
          settings: overlayPendingSettings(projection.settings),
        },
        saveStatus: lastFailedUpdates
          ? 'error'
          : pendingMutations.length > 0
            ? 'saving'
            : 'saved',
      });
    } catch (error: unknown) {
      pendingMutations = pendingMutations.filter(({ id }) => id !== operation.id);
      const nextSettings = { ...snapshot.projection.settings };
      const retryableUpdates: Partial<Settings> = {};
      for (const key of Object.keys(updates) as Array<keyof Settings>) {
        const hasNewerValue = pendingMutations.some((pending) =>
          Object.prototype.hasOwnProperty.call(pending.updates, key));
        if (!hasNewerValue) {
          Object.assign(nextSettings, { [key]: operation.previous[key] });
          Object.assign(retryableUpdates, { [key]: updates[key] });
        }
      }
      if (Object.keys(retryableUpdates).length > 0) {
        lastFailedUpdates = {
          ...lastFailedUpdates,
          ...retryableUpdates,
        };
      }
      const hasFailure = lastFailedUpdates !== null;
      setSnapshot({
        hydrated: true,
        persistenceError: hasFailure
          ? error instanceof Error ? error.message : String(error)
          : null,
        projection: {
          ...snapshot.projection,
          settings: nextSettings,
        },
        saveStatus: hasFailure
          ? 'error'
          : pendingMutations.length > 0
            ? 'saving'
            : 'saved',
      });
    }
  });
}

export function useOptionsSettings() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    consumers += 1;
    void hydrate().catch(() => undefined);
    return release;
  }, []);

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    lastFailedUpdates = withoutUpdatedKeys(lastFailedUpdates, updates);
    enqueueSettingsMutation(updates);
  }, []);

  const retryLastFailedMutation = useCallback(() => {
    if (!lastFailedUpdates) return;
    const updates = lastFailedUpdates;
    lastFailedUpdates = null;
    enqueueSettingsMutation(updates);
  }, []);

  return {
    hydrated: current.hydrated,
    persistenceError: current.persistenceError,
    projection: current.projection,
    retryLastFailedMutation,
    saveStatus: current.saveStatus,
    settings: current.projection.settings,
    updateSettings,
  };
}
