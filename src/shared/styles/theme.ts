import {
  createTheme,
  useMantineTheme,
  type MantineTheme,
  type MantineThemeOverride,
} from '@mantine/core';
import './accessibility.css';
import './tooltip.css';

export interface TabBoardThemeTokens {
  icon: {
    toolbarSize: number;
    menuSize: number;
    emptySize: number;
    strokeWidth: number;
  };
  action: {
    desktopSize: number;
    touchSize: number;
    states: {
      selectedColor: string;
      selectedBackground: string;
      dangerColor: string;
      disabledOpacity: number;
    };
  };
}

declare module '@mantine/core' {
  interface MantineThemeOther {
    tabBoard: TabBoardThemeTokens;
  }
}

export const tabBoardThemeTokens: TabBoardThemeTokens = {
  icon: {
    toolbarSize: 18,
    menuSize: 16,
    emptySize: 48,
    strokeWidth: 1.75,
  },
  action: {
    desktopSize: 32,
    touchSize: 44,
    states: {
      selectedColor: 'var(--tabboard-accent)',
      selectedBackground: 'var(--tabboard-accent-soft)',
      dangerColor: 'var(--tabboard-danger)',
      disabledOpacity: 0.45,
    },
  },
};

export function getTabBoardThemeTokens(
  currentTheme: Pick<MantineTheme, 'other'>,
): TabBoardThemeTokens {
  return currentTheme.other.tabBoard ?? tabBoardThemeTokens;
}

export function useTabBoardThemeTokens(): TabBoardThemeTokens {
  return getTabBoardThemeTokens(useMantineTheme());
}

const baseTheme: MantineThemeOverride = {
  primaryColor: 'cobalt',
  primaryShade: { light: 6, dark: 4 },
  defaultRadius: 'sm',
  other: {
    tabBoard: tabBoardThemeTokens,
  },
  radius: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '8px',
    xl: '8px',
  },
  colors: {
    cobalt: [
      '#f2f5fd',
      '#eaf0fc',
      '#dce6fa',
      '#c7d5f7',
      '#5a80dd',
      '#476fda',
      '#315ec9',
      '#294fac',
      '#234492',
      '#1d397c',
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
    Modal: {
      defaultProps: {
        transitionProps: { duration: 0 },
        portalProps: {},
      },
    },
  },
});
