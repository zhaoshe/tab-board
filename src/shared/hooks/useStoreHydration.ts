import { useEffect, useRef, useState } from 'react';
import { useTabBoardStore } from '../store/useTabBoardStore';

export function useStoreHydration() {
  const hydrated = useTabBoardStore((state) => state.hydrated);
  const hydrateRef = useRef<() => Promise<void>>();
  const releaseRef = useRef<() => void>();
  const [mounted, setMounted] = useState(false);

  hydrateRef.current = useTabBoardStore.getState().hydrate;
  releaseRef.current = useTabBoardStore.getState().releaseHydration;

  useEffect(() => {
    let isActive = true;
    hydrateRef.current?.().catch(() => {
      if (isActive) setMounted(false);
    });
    setMounted(true);
    return () => {
      isActive = false;
      releaseRef.current?.();
    };
  }, []);

  return { hydrated: hydrated && mounted };
}
