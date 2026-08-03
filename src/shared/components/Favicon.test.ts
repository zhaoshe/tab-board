// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Favicon } from './Favicon';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount(src: string): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(Favicon, {
      src,
      size: 16,
      className: 'test-favicon',
      fallback: createElement('svg', { 'data-testid': 'fallback' }),
    }));
  });
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe('Favicon', () => {
  it('renders a fixed decorative lazy image', async () => {
    await mount('https://example.test/favicon.ico');
    const image = container?.querySelector<HTMLImageElement>('img');
    const box = container?.querySelector<HTMLElement>('.test-favicon');

    expect(box?.style.width).toBe('16px');
    expect(box?.style.height).toBe('16px');
    expect(image?.width).toBe(16);
    expect(image?.height).toBe(16);
    expect(image?.alt).toBe('');
    expect(image?.loading).toBe('lazy');
  });

  it('shows the fallback after an image error without changing the box', async () => {
    await mount('https://example.test/favicon.ico');
    const image = container?.querySelector<HTMLImageElement>('img');
    await act(async () => image?.dispatchEvent(new Event('error')));

    expect(container?.querySelector('img')).toBeNull();
    expect(container?.querySelector('[data-testid="fallback"]')).not.toBeNull();
    expect(container?.querySelector<HTMLElement>('.test-favicon')?.style.width)
      .toBe('16px');
  });
});
