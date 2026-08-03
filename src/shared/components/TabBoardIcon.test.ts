// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  createTheme,
  MantineProvider,
  type MantineThemeOverride,
} from '@mantine/core';
import { Search } from 'lucide-react';
import { TabBoardIcon, type TabBoardIconSize } from './TabBoardIcon';
import {
  getTabBoardThemeTokens,
  theme,
  type TabBoardThemeTokens,
} from '../styles/theme';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderIcon(
  size?: TabBoardIconSize,
  providerTheme: MantineThemeOverride = theme,
): Promise<SVGSVGElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(
      MantineProvider,
      { theme: providerTheme },
      createElement(TabBoardIcon, { icon: Search, size }),
    ));
  });

  return container.querySelector('svg')!;
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe('TabBoardIcon', () => {
  it.each([
    ['toolbar', undefined, '18'],
    ['menu', 'menu', '16'],
    ['empty', 'empty', '48'],
  ] as const)('renders %s geometry with the shared Lucide stroke', async (_, size, pixels) => {
    const icon = await renderIcon(size);

    expect(icon.getAttribute('width')).toBe(pixels);
    expect(icon.getAttribute('height')).toBe(pixels);
    expect(icon.getAttribute('stroke-width')).toBe('1.75');
  });

  it('keeps the SVG decorative and non-focusable', async () => {
    const icon = await renderIcon();

    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.getAttribute('focusable')).toBe('false');
    expect(icon.hasAttribute('aria-label')).toBe(false);
    expect(icon.getAttribute('role')).not.toBe('img');
  });

  it('marks menu icons as the shared 16px leading slot', async () => {
    const icon = await renderIcon('menu');

    expect(icon.classList).toContain('tabboard-leading-icon');
  });

  it('renders from the typed Mantine token contract', async () => {
    const customTokens: TabBoardThemeTokens = {
      icon: {
        toolbarSize: 21,
        menuSize: 17,
        emptySize: 52,
        strokeWidth: 1.5,
      },
      action: {
        desktopSize: 36,
        touchSize: 48,
        states: {
          selectedColor: '#123456',
          selectedBackground: '#ddeeff',
          dangerColor: '#aa1122',
          disabledOpacity: 0.4,
        },
      },
    };
    const customTheme = createTheme({ other: { tabBoard: customTokens } });
    const icon = await renderIcon('menu', customTheme);
    const tokens = getTabBoardThemeTokens({ other: { tabBoard: customTokens } });

    expect(icon.getAttribute('width')).toBe('17');
    expect(icon.getAttribute('height')).toBe('17');
    expect(icon.getAttribute('stroke-width')).toBe('1.5');
    expect(icon.style.width).toBe('17px');
    expect(icon.style.height).toBe('17px');
    expect(tokens).toBe(customTokens);
    expectTypeOf(tokens).toEqualTypeOf<TabBoardThemeTokens>();
  });
});
