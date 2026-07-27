import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useColorScheme } from './useColorScheme';

const harness = vi.hoisted(() => ({
  theme: 'system' as 'system' | 'light' | 'dark',
}));

vi.mock('../store/useTabBoardStore', () => ({
  useTabBoardStore: (selector: (state: unknown) => unknown) => selector({
    settings: { theme: harness.theme },
  }),
}));

function SchemeProbe() {
  const colorScheme = useColorScheme();
  return createElement('div', { 'data-color-scheme': colorScheme });
}

beforeEach(() => {
  harness.theme = 'system';
  vi.stubGlobal('window', {
    matchMedia: vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

describe('useColorScheme', () => {
  it('uses the current system preference on the first client render', () => {
    const markup = renderToStaticMarkup(createElement(SchemeProbe));

    expect(markup).toContain('data-color-scheme="dark"');
  });
});
