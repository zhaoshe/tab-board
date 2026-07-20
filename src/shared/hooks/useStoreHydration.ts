import { useEffect, useState } from 'react';
import { useTabBoardStore } from '../store/useTabBoardStore';

export function useStoreHydration() {
  const hydrate = useTabBoardStore((state) => state.hydrate);
  const releaseHydration = useTabBoardStore((state) => state.releaseHydration);
  const hydrated = useTabBoardStore((state) => state.hydrated);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let isActive = true;
    void hydrate().catch(() => {
      if (isActive) setMounted(false);
    });
    setMounted(true);
    return () => {
      isActive = false;
      releaseHydration();
    };
  }, [hydrate, releaseHydration]);

  return { hydrated: hydrated && mounted };
}
