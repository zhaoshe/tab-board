import { useEffect, useState } from 'react';
import { readStorageStatusProjection, subscribeStorageStatusProjection } from '../store/fsBootstrap';
import type { StorageStatusProjection } from '../store/settingsProjection';

export function useStorageStatusProjection(): StorageStatusProjection | null {
  const [status, setStatus] = useState<StorageStatusProjection | null>(null);
  useEffect(() => {
    let disposed = false;
    let received = false;
    const unsubscribe = subscribeStorageStatusProjection(next => {
      if (disposed) return;
      received = true;
      setStatus(next);
    });
    void readStorageStatusProjection().then(initial => {
      if (!disposed && !received) setStatus(initial);
    }).catch(() => undefined);
    return () => { disposed = true; unsubscribe(); };
  }, []);
  return status;
}
