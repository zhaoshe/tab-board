import { createTheme, type MantineThemeOverride } from '@mantine/core';
import './tooltip.css';

export const theme: MantineThemeOverride = createTheme({
  primaryColor: 'blue',
  primaryShade: 6,
  colors: {
    nord: [
      '#f0f4f8',
      '#d9e2ec',
      '#bcccdc',
      '#9fb3c8',
      '#829ab1',
      '#627d98',
      '#486581',
      '#334e68',
      '#243b53',
      '#102a43',
    ],
  },
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace: 'JetBrains Mono, Monaco, Menlo, monospace',
  headings: {
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  components: {
    Tooltip: {
      defaultProps: {
        openDelay: 1000,
      },
    },
    Button: {
      defaultProps: {
        size: 'sm',
      },
    },
    TextInput: {
      defaultProps: {
        size: 'sm',
      },
    },
    Card: {
      defaultProps: {
        shadow: 'sm',
        radius: 'md',
        padding: 'md',
        withBorder: true,
      },
    },
    ScrollArea: {
      defaultProps: {
        scrollbarSize: 6,
      },
    },
  },
});
