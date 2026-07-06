import { STATE_KEY, clone, normalizeState, nowIso } from "./model.js";

export async function getState() {
  const result = await chrome.storage.local.get(STATE_KEY);
  return normalizeState(result[STATE_KEY]);
}

export async function setState(nextState) {
  const normalized = normalizeState(nextState);
  normalized.updatedAt = nowIso();
  await chrome.storage.local.set({ [STATE_KEY]: normalized });
  return normalized;
}

export async function updateState(updater) {
  const current = await getState();
  const draft = clone(current);
  const result = (await updater(draft)) || draft;
  return setState(result);
}

export async function getSettings() {
  return (await getState()).settings;
}

export async function ensureState() {
  return setState(await getState());
}
