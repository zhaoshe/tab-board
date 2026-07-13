import { STATE_KEY, LEGACY_STATE_KEY } from '../model/constants';
import { normalizeState, type TabBoardState } from '../model';

export async function getState(): Promise<TabBoardState> {
  const result = await chrome.storage.local.get(STATE_KEY);
  return normalizeState(result[STATE_KEY]);
}

export async function setState(state: TabBoardState): Promise<void> {
  await chrome.storage.local.set({ [STATE_KEY]: state });
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

export async function migrateFromLegacy(): Promise<{ migrated: boolean; tabCount: number; groupCount: number }> {
  const storage = await chrome.storage.local.get([STATE_KEY, LEGACY_STATE_KEY]);

  if (storage[STATE_KEY]) {
    return { migrated: false, tabCount: 0, groupCount: 0 };
  }

  if (!storage[LEGACY_STATE_KEY]) {
    return { migrated: false, tabCount: 0, groupCount: 0 };
  }

  const migratedState = normalizeState(storage[LEGACY_STATE_KEY]);

  await setState(migratedState);

  const tabCount = migratedState.groups.reduce((sum, g) => sum + g.tabs.length, 0);
  const groupCount = migratedState.groups.length;

  console.log(
    `[TabBoard] Migrated legacy data: ${groupCount} sessions, ${tabCount} tabs`
  );

  return { migrated: true, tabCount, groupCount };
}

export async function ensureState(): Promise<TabBoardState> {
  const result = await chrome.storage.local.get(STATE_KEY);
  if (result[STATE_KEY]) {
    return normalizeState(result[STATE_KEY]);
  }

  const migrationResult = await migrateFromLegacy();
  if (migrationResult.migrated) {
    return getState();
  }

  const state = normalizeState(null);
  await setState(state);
  return state;
}

export function subscribeState(callback: (state: TabBoardState) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string
  ) => {
    if (area !== 'local' || !changes[STATE_KEY]) {
      return;
    }
    callback(normalizeState(changes[STATE_KEY].newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
