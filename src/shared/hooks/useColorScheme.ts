import { useTabBoardStore } from '../store/useTabBoardStore';
import { usePreferredColorScheme, type ColorScheme } from './usePreferredColorScheme';

export function useColorScheme(): ColorScheme {
  const theme = useTabBoardStore((state) => state.settings.theme);
  return usePreferredColorScheme(theme);
}
