import { useEffect, useState } from 'react';
import { useTabBoardStore } from '../store/useTabBoardStore';

export function useStoreHydration() {
  const hydrate = useTabBoardStore((state) => state.hydrate);
  const hydrated = useTabBoardStore((state) => state.hydrated);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    void hydrate();
    setMounted(true);
  }, [hydrate]);

  return { hydrated: hydrated && mounted };
}
