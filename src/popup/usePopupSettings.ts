import { useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type Settings,
} from '../shared/model';
import {
  readSettingsProjection,
  subscribeSettingsProjection,
  type SettingsProjection,
} from '../shared/store/settingsProjection';

export interface PopupSettingsSnapshot {
  hydrated: boolean;
  error: string | null;
  settings: Settings;
}

const DEFAULT_SNAPSHOT: PopupSettingsSnapshot = {
  hydrated: false,
  error: null,
  settings: { ...DEFAULT_SETTINGS },
};

let inFlightRead: Promise<SettingsProjection> | null = null;

function readProjectionOnce(): Promise<SettingsProjection> {
  if (inFlightRead) return inFlightRead;
  const request = readSettingsProjection({
    readCanonicalState: async () => (
      await import('../shared/store/activeAdapter')
    ).getActiveState(),
  });
  let shared!: Promise<SettingsProjection>;
  shared = request.finally(() => {
    if (inFlightRead === shared) inFlightRead = null;
  });
  inFlightRead = shared;
  return shared;
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

export function usePopupSettings(): PopupSettingsSnapshot {
  const [snapshot, setSnapshot] = useState<PopupSettingsSnapshot>(
    DEFAULT_SNAPSHOT,
  );

  useEffect(() => {
    let active = true;
    let latestProjection: SettingsProjection | null = null;
    const publishProjection = (projection: SettingsProjection) => {
      if (!active) return;
      latestProjection = latestProjection
        ? newerProjection(latestProjection, projection)
        : projection;
      setSnapshot({
        hydrated: true,
        error: null,
        settings: { ...latestProjection.settings },
      });
    };
    const unsubscribe = subscribeSettingsProjection(publishProjection);

    void readProjectionOnce()
      .then(publishProjection)
      .catch((error: unknown) => {
        if (!active || latestProjection) return;
        setSnapshot({
          hydrated: true,
          error: error instanceof Error ? error.message : String(error),
          settings: { ...DEFAULT_SETTINGS },
        });
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return snapshot;
}
