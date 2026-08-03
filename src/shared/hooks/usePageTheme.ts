import { useEffect } from 'react';

export type PageColorScheme = 'light' | 'dark';

export const LIGHT_THEME_COLOR = '#f3f5f8';
export const DARK_THEME_COLOR = '#1a1e24';

export function usePageTheme(colorScheme: PageColorScheme): void {
  useEffect(() => {
    document.documentElement.style.colorScheme = colorScheme;

    let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeColor) {
      themeColor = document.createElement('meta');
      themeColor.name = 'theme-color';
      document.head.append(themeColor);
    }
    themeColor.content = colorScheme === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
  }, [colorScheme]);
}
