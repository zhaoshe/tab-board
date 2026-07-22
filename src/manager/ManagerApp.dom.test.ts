// @vitest-environment happy-dom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installPreviewChrome, type PreviewChromeHarness } from '../dev/previewChrome';
import { ManagerApp } from './ManagerApp';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let harness: PreviewChromeHarness | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  container.id = 'root';
  document.body.append(container);
  harness = installPreviewChrome();
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  harness?.uninstall();
  harness = null;
  vi.restoreAllMocks();
});

describe('ManagerApp hydration', () => {
  it('mounts once under StrictMode without exceeding React update depth', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    root = createRoot(container!);

    await act(async () => {
      root?.render(createElement(StrictMode, null, createElement(ManagerApp)));
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.manager-shell')).not.toBeNull();
    }, { timeout: 2_000, interval: 10 });

    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/maximum update depth|error #185/i);
  });

  it('enters open-tab selection mode without exceeding React update depth', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    root = createRoot(container!);

    await act(async () => {
      root?.render(createElement(StrictMode, null, createElement(ManagerApp)));
    });

    const checkbox = await vi.waitFor(() => {
      const element = document.querySelector<HTMLInputElement>('input[aria-label="Select Active HTTP tab"]');
      expect(element).not.toBeNull();
      return element!;
    }, { timeout: 2_000, interval: 10 });

    await act(async () => {
      checkbox.click();
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('1 Selected');
    }, { timeout: 2_000, interval: 10 });

    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/maximum update depth|error #185/i);
  });

  it('keeps overlay positioning stable after opening a saved tab and returning focus', async () => {
    harness?.uninstall();
    harness = installPreviewChrome({
      tabs: Array.from({ length: 80 }, (_, index) => ({
        id: index + 1,
        windowId: 1,
        index,
        active: index === 0,
        title: `Open tab ${index + 1}`,
        url: `https://example.test/${index + 1}`,
      })),
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    root = createRoot(container!);

    await act(async () => {
      root?.render(createElement(StrictMode, null, createElement(ManagerApp)));
    });

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.manager-open-tab-row')).toHaveLength(80);
    }, { timeout: 2_000, interval: 10 });

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-category-id="saved"]')?.click();
    });
    const savedLink = await vi.waitFor(() => {
      const element = document.querySelector<HTMLButtonElement>('.tab-item-row__title');
      expect(element).not.toBeNull();
      return element!;
    }, { timeout: 2_000, interval: 10 });
    await act(async () => {
      savedLink?.click();
    });

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.manager-open-tab-row')).toHaveLength(81);
    }, { timeout: 2_000, interval: 10 });
    expect(document.querySelector('.manager-info-popover')).toBeNull();

    await act(async () => {
      window.dispatchEvent(new FocusEvent('focus'));
      window.dispatchEvent(new FocusEvent('focus'));
    });

    const openTabTrigger = document.querySelector<HTMLButtonElement>('[data-info-popover="open"]');
    expect(openTabTrigger).not.toBeNull();
    await act(async () => {
      openTabTrigger?.click();
    });

    expect(document.querySelector('.manager-info-popover')).not.toBeNull();
    expect(document.querySelector('.tabboard-error-boundary')).toBeNull();
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/maximum update depth|error #185|sync render loop/i);
  });
});
