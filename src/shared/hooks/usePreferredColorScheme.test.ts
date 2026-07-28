import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreferredColorScheme } from './usePreferredColorScheme';

function SchemeProbe({
  preference,
}: {
  preference: 'system' | 'light' | 'dark';
}) {
  const colorScheme = usePreferredColorScheme(preference);
  return createElement('div', { 'data-color-scheme': colorScheme });
}

beforeEach(() => {
  vi.stubGlobal('window', {
    matchMedia: vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

describe('usePreferredColorScheme', () => {
  it('uses the system preference without a store dependency', () => {
    const markup = renderToStaticMarkup(
      createElement(SchemeProbe, { preference: 'system' }),
    );
    expect(markup).toContain('data-color-scheme="dark"');
  });

  it('honors explicit light and dark preferences', () => {
    expect(renderToStaticMarkup(
      createElement(SchemeProbe, { preference: 'light' }),
    )).toContain('data-color-scheme="light"');
    expect(renderToStaticMarkup(
      createElement(SchemeProbe, { preference: 'dark' }),
    )).toContain('data-color-scheme="dark"');
  });
});
