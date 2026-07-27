import { useState, useEffect } from 'react';
import { useTabBoardStore } from '../store/useTabBoardStore';

type ColorScheme = 'light' | 'dark';

function getSystemColorScheme(): ColorScheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useColorScheme(): ColorScheme {
  const settings = useTabBoardStore((state) => state.settings);
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(getSystemColorScheme);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemScheme(mediaQuery.matches ? 'dark' : 'light');

    const handler = (e: MediaQueryListEvent) => {
      setSystemScheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  if (settings.theme === 'dark') return 'dark';
  if (settings.theme === 'light') return 'light';
  return systemScheme;
}
