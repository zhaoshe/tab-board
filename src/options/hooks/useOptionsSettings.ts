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
}

const EMPTY_PROJECTION = projectionFromState(createEmptyState());

let snapshot: OptionsSettingsSnapshot = {
  hydrated: false,
  persistenceError: null,
  projection: EMPTY_PROJECTION,
};
let hydrationPromise: Promise<void> | null = null;
let projectionUnsubscribe: (() => void) | null = null;
let consumers = 0;
let mutationQueue: Promise<void> = Promise.resolve();
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
      hydrated: true,
      persistenceError: null,
      projection: newerProjection(snapshot.projection, projection),
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
    });
  }).catch((error: unknown) => {
    setSnapshot({
      ...snapshot,
      hydrated: false,
      persistenceError: error instanceof Error ? error.message : String(error),
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
  snapshot = {
    hydrated: false,
    persistenceError: null,
    projection: EMPTY_PROJECTION,
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

export function useOptionsSettings() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    consumers += 1;
    void hydrate().catch(() => undefined);
    return release;
  }, []);

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    const previous = snapshot.projection;
    const optimistic: SettingsProjection = {
      settings: { ...previous.settings, ...updates },
      mutationRevision: previous.mutationRevision,
      updatedAt: nowIso(),
    };
    setSnapshot({
      hydrated: true,
      persistenceError: null,
      projection: optimistic,
    });

    mutationQueue = mutationQueue.then(async () => {
      try {
        const authoritative = await sendSettingsMutation(updates);
        setSnapshot({
          hydrated: true,
          persistenceError: null,
          projection: projectionFromState(authoritative),
        });
      } catch (error: unknown) {
        setSnapshot({
          hydrated: true,
          persistenceError: error instanceof Error ? error.message : String(error),
          projection: previous,
        });
      }
    });
  }, []);

  return {
    hydrated: current.hydrated,
    persistenceError: current.persistenceError,
    projection: current.projection,
    settings: current.projection.settings,
    updateSettings,
  };
}
