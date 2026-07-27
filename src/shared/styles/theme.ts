import { createTheme, type MantineThemeOverride } from '@mantine/core';
import './accessibility.css';
import './tooltip.css';

const baseTheme: MantineThemeOverride = {
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
        transitionProps: { duration: 0 },
      },
    },
    Menu: {
      defaultProps: {
        transitionProps: { duration: 0 },
      },
    },
    Modal: {
      defaultProps: {
        transitionProps: { duration: 0 },
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
};

export const theme: MantineThemeOverride = createTheme(baseTheme);

export const managerTheme: MantineThemeOverride = createTheme({
  ...baseTheme,
  components: {
    ...baseTheme.components,
    Tooltip: {
      defaultProps: {
        openDelay: 1000,
        transitionProps: { duration: 0 },
        portalProps: { target: '#manager-main' },
        zIndex: 1100,
      },
    },
    Menu: {
      defaultProps: {
        transitionProps: { duration: 0 },
        portalProps: { target: '#manager-main' },
      },
    },
  },
});
