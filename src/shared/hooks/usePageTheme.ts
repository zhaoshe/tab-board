import { useEffect } from 'react';

export type PageColorScheme = 'light' | 'dark';

export const LIGHT_THEME_COLOR = '#ffffff';
export const DARK_THEME_COLOR = '#242424';

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
