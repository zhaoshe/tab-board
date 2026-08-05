// @vitest-environment happy-dom
import { StrictMode, act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopupApp } from './PopupApp';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface MountedPopup {
  container: HTMLDivElement;
  root: Root;
}

const tabs = [
  {
    id: 7,
    title: 'Example',
    url: 'https://example.test/',
    favIconUrl: '',
    pinned: false,
    active: true,
    windowId: 1,
  },
];

const queryTabs = vi.fn();
const sendMessage = vi.fn();
const getExtensionUrl = vi.fn(() => 'chrome-extension://test/');
let activeMount: MountedPopup | null = null;
const popupSettingsState = vi.hoisted(() => ({
  hydrated: true,
  error: null as string | null,
  settings: {
    customUrlFilter: '',
    excludePinned: false,
    includeChromeUrls: true,
    includeFileUrls: true,
    closeTabsAfterSave: true,
    theme: 'system' as const,
  },
}));

vi.mock('./usePopupSettings', () => ({
  usePopupSettings: () => popupSettingsState,
}));

function getSaveButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    '[data-popup-save]',
  );
  if (!button) throw new Error('Missing save button.');
  return button;
}

async function waitForDom(assertion: () => void): Promise<void> {
  await vi.waitFor(assertion, { timeout: 1_000, interval: 10 });
}

async function mountPopup(expectedButtonText: string): Promise<MountedPopup> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(PopupApp));
  });
  await waitForDom(() => expect(getSaveButton().textContent).toContain(expectedButtonText));
  const mounted = { container, root };
  activeMount = mounted;
  return mounted;
}

async function mountPopupWithoutWaiting(strict = false): Promise<MountedPopup> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      strict
        ? createElement(StrictMode, null, createElement(PopupApp))
        : createElement(PopupApp),
    );
  });
  const mounted = { container, root };
  activeMount = mounted;
  return mounted;
}

async function clickSave(): Promise<void> {
  await act(async () => {
    getSaveButton().click();
  });
}

beforeEach(() => {
  popupSettingsState.hydrated = true;
  popupSettingsState.error = null;
  popupSettingsState.settings = {
    customUrlFilter: '',
    excludePinned: false,
    includeChromeUrls: true,
    includeFileUrls: true,
    closeTabsAfterSave: true,
    theme: 'system',
  };
  queryTabs.mockReset().mockResolvedValue(tabs);
  sendMessage.mockReset();
  getExtensionUrl.mockClear();
  vi.stubGlobal('chrome', {
    tabs: { query: queryTabs },
    runtime: { sendMessage, getURL: getExtensionUrl },
  });
  document.body.innerHTML = '';
});

afterEach(async () => {
  if (activeMount) {
    await act(async () => activeMount?.root.unmount());
    activeMount.container.remove();
    activeMount = null;
  }
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('PopupApp save response protocol', () => {
  it('defines the fixed P2 compact action geometry in the Popup style owner', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/popup/popup.css'),
      'utf8',
    );
    expect(css).not.toMatch(/letter-spacing:\s*(?!0(?:[;\s]|$))/);
    expect(css).toMatch(
      /\.popup-app__save\.mantine-Button-root[\s\S]*?width:\s*80px[\s\S]*?height:\s*32px/,
    );
    expect(css).toMatch(
      /\.popup-app__dedupe\.mantine-Button-root[\s\S]*?width:\s*80px[\s\S]*?height:\s*32px/,
    );
    expect(css).toMatch(
      /\.popup-app__(?:count|duplicate)[\s\S]*?font-size:\s*13px[\s\S]*?line-height:\s*18px/,
    );
  });

  it('renders a main landmark, page heading, and visible hydration status', async () => {
    popupSettingsState.hydrated = false;
    await mountPopupWithoutWaiting();

    expect(document.querySelector('main')).not.toBeNull();
    expect(document.querySelector('h1')?.textContent).toBe('TabBoard');
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Loading current window…');
  });

  it('summarizes the current window instead of rendering tab rows', async () => {
    await mountPopup('Save');

    expect(document.body.textContent).toContain('1 tab');
    expect(document.body.textContent).not.toContain('Example');
    expect(getSaveButton().getAttribute('data-variant')).toBe('default');
    expect(document.querySelector('[translate="no"]')?.textContent).toBe('TabBoard');
    const brand = document.querySelector<HTMLImageElement>('.popup-app__brand-icon');
    expect(brand?.getAttribute('src')).toBe('/icons/icon-32.png');
    expect(brand?.width).toBe(22);
    expect(brand?.height).toBe(22);
  });

  it('shows only the pinned capture option and keeps grouped tabs in scope', async () => {
    queryTabs.mockResolvedValue([
      { ...tabs[0], pinned: true, groupId: 7 },
      { ...tabs[0], id: 8, active: false, groupId: 7 },
    ]);
    await mountPopup('Save');

    expect(document.querySelector<HTMLInputElement>('input[name="include-pinned-tabs"]'))
      .not.toBeNull();
    expect(document.querySelector<HTMLInputElement>('input[name="include-tab-groups"]'))
      .toBeNull();
    expect(document.body.textContent).not.toContain('group');
  });

  it('uses generic Save copy, hides selected ratios, and updates the scoped count', async () => {
    queryTabs.mockResolvedValue([
      { ...tabs[0], pinned: true, groupId: 7 },
      { ...tabs[0], id: 8, active: false, pinned: false, groupId: 7 },
      { ...tabs[0], id: 9, active: false, pinned: false, groupId: -1 },
    ]);
    await mountPopup('Save');

    expect(getSaveButton().textContent?.trim()).toBe('Save');
    expect(document.querySelector('[data-popup-selection-summary]')).toBeNull();
    expect(document.body.textContent).not.toContain('of 3');
    expect(document.querySelector('.popup-app__count')?.textContent).toContain('3 tabs');

    const pinned = document.querySelector<HTMLInputElement>(
      'input[name="include-pinned-tabs"]',
    );
    await act(async () => pinned?.click());

    expect(getSaveButton().textContent?.trim()).toBe('Save');
    expect(document.querySelector('.popup-app__count')?.textContent).toContain('2 tabs');
  });

  it('explains pinned inclusion below its checkbox and disables Save at zero scope', async () => {
    queryTabs.mockResolvedValue([
      { ...tabs[0], pinned: true, groupId: 7 },
    ]);
    await mountPopup('Save');
    expect(document.querySelector('.popup-app__pinned-helper')?.textContent)
      .toContain('Pinned tabs will be saved and stay open after capture.');

    const pinned = document.querySelector<HTMLInputElement>(
      'input[name="include-pinned-tabs"]',
    );
    await act(async () => pinned?.click());

    expect(getSaveButton().disabled).toBe(true);
    expect(document.querySelector('.popup-app__count')?.textContent).toContain('0 tabs');
    expect(document.querySelector('.popup-app__pinned-helper')?.textContent)
      .toContain('Pinned tabs will not be saved and will stay open.');
  });

  it('uses the global close setting only for the main helper', async () => {
    await mountPopup('Save');
    expect(document.querySelector('.popup-app__save-helper')?.textContent)
      .toBe('Save and close tabs');

    await act(async () => activeMount?.root.unmount());
    activeMount?.container.remove();
    activeMount = null;
    popupSettingsState.settings = {
      ...popupSettingsState.settings,
      closeTabsAfterSave: false,
    };
    await mountPopup('Save');

    expect(document.querySelector('.popup-app__save-helper')?.textContent)
      .toBe('Save and keep tabs open');
  });

  it('removes the entire pinned region when no pinned tab exists', async () => {
    await mountPopup('Save');

    expect(document.querySelector('.popup-app__pinned')).toBeNull();
    expect(document.querySelector('.popup-app__pinned-helper')).toBeNull();
  });

  it('renders duplicate cleanup as one secondary maintenance row', async () => {
    queryTabs.mockResolvedValue([...tabs, { ...tabs[0], id: 8, active: false }]);
    await mountPopup('Save');

    expect(document.querySelector('.popup-app__duplicate-row')?.textContent)
      .toContain('1 duplicate tab');
    expect(document.querySelector('.popup-app__duplicate-helper')?.textContent)
      .toBe('Keep one copy in this window');
    expect(document.querySelector('.popup-app__dedupe')?.textContent?.trim())
      .toBe('Remove');
  });

  it('explains protected pinned duplicates without adding them to the Remove count', async () => {
    queryTabs.mockResolvedValue([
      { ...tabs[0], pinned: true },
      { ...tabs[0], id: 8, active: false, pinned: false },
    ]);
    await mountPopup('Save');

    expect(document.querySelector('.popup-app__duplicate')?.textContent)
      .toContain('1 duplicate tab');
    expect(document.querySelector('.popup-app__duplicate-helper')?.textContent)
      .toBe('Pinned duplicates stay open');
  });

  it('does not offer duplicate removal when every duplicate candidate is pinned', async () => {
    queryTabs.mockResolvedValue([
      { ...tabs[0], pinned: true },
      { ...tabs[0], id: 8, active: false, pinned: true },
    ]);
    await mountPopup('Save');

    expect(document.querySelector('.popup-app__duplicate-row')).toBeNull();
    expect(document.body.textContent).not.toContain('duplicate');
  });

  it('shows a duplicate-removal action only when duplicate tabs exist', async () => {
    await mountPopup('Save');
    expect(document.querySelector('.popup-app__duplicate-row')).toBeNull();

    await act(async () => activeMount?.root.unmount());
    activeMount?.container.remove();
    activeMount = null;
    queryTabs.mockResolvedValue([...tabs, { ...tabs[0], id: 8, active: false }]);

    await mountPopup('Save');
    expect(document.querySelector('.popup-app__duplicate-row')?.textContent)
      .toContain('Remove');
    expect(document.querySelector('.popup-app__duplicate-row')?.textContent)
      .toContain('1 duplicate tab');
  });

  it('removes duplicate browser tabs directly without a confirmation dialog', async () => {
    queryTabs.mockResolvedValue([...tabs, { ...tabs[0], id: 8, active: false }]);
    sendMessage.mockResolvedValue({ ok: true });
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);

    await mountPopup('Save');
    const dedupe = document.querySelector<HTMLButtonElement>(
      '[aria-label="Remove Duplicate Tabs from This Window"]',
    );
    await act(async () => dedupe?.click());

    await waitForDom(() => expect(sendMessage).toHaveBeenCalledWith({ action: 'dedupe-window' }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('treats a successful worker envelope as saved and closes after the existing delay', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    let closeCallback: (() => void) | null = null;
    const originalSetTimeout = globalThis.setTimeout;
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay) => {
      if (delay === 800 && typeof callback === 'function') {
        closeCallback = callback;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      }
      return originalSetTimeout(callback, delay);
    });
    sendMessage.mockResolvedValue({ ok: true, result: { storedTabs: 1 } });

    await mountPopup('Save');
    await clickSave();
    await waitForDom(() => expect(getSaveButton().textContent).toContain('Saved'));

    expect(document.querySelector('[role="status"]')?.textContent)
      .toContain('Tabs saved. Closing popup…');
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 800);
    expect(close).not.toHaveBeenCalled();

    await act(async () => {
      closeCallback?.();
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('announces a loading action while saving', async () => {
    let resolveSave!: (value: { ok: true }) => void;
    sendMessage.mockImplementation(() => new Promise((resolve) => {
      resolveSave = resolve;
    }));

    await mountPopup('Save');
    await act(async () => {
      getSaveButton().click();
      await Promise.resolve();
    });

    expect(getSaveButton().textContent).toContain('Saving…');
    expect(getSaveButton().getAttribute('aria-label')).toBe('Saving Selected Tabs…');

    await act(async () => {
      resolveSave({ ok: true });
      await Promise.resolve();
    });
  });

  it('shows the worker error from an unsuccessful envelope without closing', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sendMessage.mockResolvedValue({ ok: false, error: 'Selected tabs could not be saved.' });

    await mountPopup('Save');
    await clickSave();
    await waitForDom(() => expect(document.querySelector('[role="alert"]')?.textContent)
      .toContain('Selected tabs could not be saved.'));
    expect(getSaveButton().textContent).toContain('Save');
    expect(close).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows a rejected worker error without logging it or closing', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sendMessage.mockRejectedValue(new Error('Worker unavailable.'));

    await mountPopup('Save');
    await clickSave();
    await waitForDom(() => expect(document.querySelector('[role="alert"]')?.textContent)
      .toContain('Worker unavailable.'));
    expect(getSaveButton().textContent).toContain('Save');
    expect(close).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('filters extension tabs through the capture policy and sends only visible capturable IDs', async () => {
    queryTabs.mockResolvedValue([
      ...tabs,
      {
        id: 8,
        title: 'Chrome settings',
        url: 'chrome://settings/',
        favIconUrl: '',
        pinned: false,
        active: false,
        windowId: 1,
      },
      {
        id: 9,
        title: 'Extension options',
        url: 'chrome-extension://test/options.html',
        favIconUrl: '',
        pinned: false,
        active: false,
        windowId: 1,
      },
      {
        id: 10,
        title: 'Preview manager',
        url: `${window.location.origin}/dev/manager-preview.html`,
        favIconUrl: '',
        pinned: false,
        active: false,
        windowId: 1,
      },
    ]);
    sendMessage.mockResolvedValue({ ok: true, result: { storedTabs: 2 } });

    await mountPopup('Save');
    expect(document.body.textContent).not.toContain('Extension options');
    await clickSave();
    await waitForDom(() => expect(getSaveButton().textContent).toContain('Saved'));

    expect(sendMessage).toHaveBeenCalledWith({
      action: 'saveSelectedTabs',
      tabIds: [7, 8],
    });
  });

  it('shows a visible error when loading current tabs fails without an unhandled rejection', async () => {
    const unhandledRejection = vi.fn();
    queryTabs.mockRejectedValue(new Error('Tabs unavailable.'));
    window.addEventListener('unhandledrejection', unhandledRejection);

    await mountPopup('Save');
    await waitForDom(() => expect(document.querySelector('[role="alert"]')?.textContent)
      .toContain('Tabs unavailable.'));

    expect(unhandledRejection).not.toHaveBeenCalled();
    window.removeEventListener('unhandledrejection', unhandledRejection);
  });

  it('starts the current-window tab query before settings hydration settles', async () => {
    popupSettingsState.hydrated = false;

    await mountPopupWithoutWaiting();

    expect(queryTabs).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.popup-app--loading')).not.toBeNull();
    expect(document.querySelector('[data-popup-save]')).toBeNull();
  });

  it('queries the current window once under Strict Mode', async () => {
    await mountPopupWithoutWaiting(true);

    await waitForDom(() => expect(getSaveButton().textContent).toContain('Save'));
    expect(queryTabs).toHaveBeenCalledTimes(1);
  });

  it('renders default-settings content with a settings read error after tabs load', async () => {
    popupSettingsState.error = 'Settings unavailable.';

    await mountPopup('Save');

    expect(document.querySelector('[role="alert"]')?.textContent)
      .toContain('Settings unavailable.');
    expect(document.querySelector('.popup-app__save-helper')?.textContent)
      .toBe('Save and close tabs');
  });

  it('clears the delayed close timer when the popup unmounts', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const originalSetTimeout = globalThis.setTimeout;
    const timerId = 77 as unknown as ReturnType<typeof setTimeout>;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay) => {
      if (delay === 800 && typeof callback === 'function') return timerId;
      return originalSetTimeout(callback, delay);
    });
    sendMessage.mockResolvedValue({ ok: true, result: { storedTabs: 1 } });

    const mounted = await mountPopup('Save');
    await clickSave();
    await waitForDom(() => expect(getSaveButton().textContent).toContain('Saved'));

    await act(async () => mounted.root.unmount());
    mounted.container.remove();
    activeMount = null;

    expect(clearTimeoutSpy).toHaveBeenCalledWith(timerId);
    expect(close).not.toHaveBeenCalled();
  });
});
