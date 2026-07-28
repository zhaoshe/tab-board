import { useEffect, useState } from 'react';
import type { Settings } from '../model';

export type ColorScheme = 'light' | 'dark';

function getSystemColorScheme(): ColorScheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function usePreferredColorScheme(
  preference: Settings['theme'],
): ColorScheme {
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(getSystemColorScheme);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemScheme(mediaQuery.matches ? 'dark' : 'light');
    const handler = (event: MediaQueryListEvent) => {
      setSystemScheme(event.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return systemScheme;
}
