import {
  DEFAULT_SETTINGS,
  SETTINGS_PROJECTION_KEY,
  type Settings,
  type TabBoardState,
} from '../model';

export interface SettingsProjection {
  settings: Settings;
  mutationRevision: number;
  updatedAt: string;
}

function normalizeSettings(value: unknown): Settings | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (!Object.hasOwn(candidate, key)
      || typeof candidate[key] !== typeof DEFAULT_SETTINGS[key]) {
      return null;
    }
    (settings[key] as unknown) = candidate[key];
  }
  return settings;
}

export function parseSettingsProjection(value: unknown): SettingsProjection | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SettingsProjection>;
  const settings = normalizeSettings(candidate.settings);
  if (!settings
    || !Number.isSafeInteger(candidate.mutationRevision)
    || (candidate.mutationRevision as number) < 0
    || typeof candidate.updatedAt !== 'string'
    || !candidate.updatedAt) {
    return null;
  }
  return {
    settings,
    mutationRevision: candidate.mutationRevision as number,
    updatedAt: candidate.updatedAt,
  };
}

export function projectionFromState(state: TabBoardState): SettingsProjection {
  return {
    settings: { ...state.settings },
    mutationRevision: state.mutationRevision,
    updatedAt: state.updatedAt,
  };
}

export async function writeSettingsProjection(state: TabBoardState): Promise<void> {
  await chrome.storage.local.set({
    [SETTINGS_PROJECTION_KEY]: projectionFromState(state),
  });
}

export async function readSettingsProjection({
  readCanonicalState,
}: {
  readCanonicalState: () => Promise<TabBoardState>;
}): Promise<SettingsProjection> {
  const result = await chrome.storage.local.get(SETTINGS_PROJECTION_KEY);
  const projection = parseSettingsProjection(result[SETTINGS_PROJECTION_KEY]);
  if (projection) return projection;

  const state = await readCanonicalState();
  const repaired = projectionFromState(state);
  await chrome.storage.local.set({ [SETTINGS_PROJECTION_KEY]: repaired });
  return repaired;
}

export function subscribeSettingsProjection(
  callback: (projection: SettingsProjection) => void,
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== 'local' || !changes[SETTINGS_PROJECTION_KEY]) return;
    const projection = parseSettingsProjection(
      changes[SETTINGS_PROJECTION_KEY].newValue,
    );
    if (projection) callback(projection);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
