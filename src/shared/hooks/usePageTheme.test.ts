// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { usePageTheme } from './usePageTheme';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function ThemeProbe({ scheme }: { scheme: 'light' | 'dark' }) {
  usePageTheme(scheme);
  return null;
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.head.innerHTML = '';
  document.documentElement.style.colorScheme = '';
});

describe('usePageTheme', () => {
  it('synchronizes native color scheme and browser theme color', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(ThemeProbe, { scheme: 'dark' }));
    });

    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe('#1a1e24');

    await act(async () => {
      root?.render(createElement(ThemeProbe, { scheme: 'light' }));
    });

    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe('#f3f5f8');
  });
});
