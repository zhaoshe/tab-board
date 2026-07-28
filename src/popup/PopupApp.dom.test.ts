// @vitest-environment happy-dom
import { act, createElement } from 'react';
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
const hydrationState = vi.hoisted(() => ({ hydrated: true }));

vi.mock('../shared/hooks/useStoreHydration', () => ({
  useStoreHydration: () => ({ hydrated: hydrationState.hydrated }),
}));

vi.mock('../shared/store/useTabBoardStore', () => ({
  useTabBoardStore: (selector: (state: { settings: {
    customUrlFilter: string;
    excludePinned: boolean;
    includeChromeUrls: boolean;
    includeFileUrls: boolean;
  } }) => unknown) => selector({
    settings: {
      customUrlFilter: '',
      excludePinned: false,
      includeChromeUrls: true,
      includeFileUrls: true,
    },
  }),
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

async function mountPopupWithoutWaiting(): Promise<MountedPopup> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(PopupApp));
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
  hydrationState.hydrated = true;
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
  it('defines compact touch targets in the Popup style owner', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/popup/popup.css'),
      'utf8',
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.popup-app__save[\s\S]*?min-height: 44px/,
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.popup-app__footer \.mantine-ActionIcon-root[\s\S]*?width: 44px[\s\S]*?height: 44px/,
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.popup-app__filters \.mantine-Checkbox-root[\s\S]*?min-height: 44px/,
    );
  });

  it('renders a main landmark, page heading, and visible hydration status', async () => {
    hydrationState.hydrated = false;
    await mountPopupWithoutWaiting();

    expect(document.querySelector('main')).not.toBeNull();
    expect(document.querySelector('h1')?.textContent).toBe('TabBoard');
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Loading current window…');
  });

  it('summarizes the current window instead of rendering tab rows', async () => {
    await mountPopup('Save');

    expect(document.body.textContent).toContain('1 Tab');
    expect(document.body.textContent).not.toContain('Example');
    expect(document.querySelector('[translate="no"]')?.textContent).toBe('TabBoard');
  });

  it('gives capture-option checkboxes stable form names', async () => {
    queryTabs.mockResolvedValue([
      { ...tabs[0], pinned: true, groupId: 7 },
      { ...tabs[0], id: 8, active: false, groupId: 7 },
    ]);
    await mountPopup('Save');

    expect(document.querySelector<HTMLInputElement>('input[name="include-pinned-tabs"]'))
      .not.toBeNull();
    expect(document.querySelector<HTMLInputElement>('input[name="include-tab-groups"]'))
      .not.toBeNull();
  });

  it('shows the actual selected result and keeps button copy in sync with filters', async () => {
    queryTabs.mockResolvedValue([
      { ...tabs[0], pinned: true, groupId: 7 },
      { ...tabs[0], id: 8, active: false, pinned: false, groupId: 7 },
      { ...tabs[0], id: 9, active: false, pinned: false, groupId: -1 },
    ]);
    await mountPopup('Save 3 Tabs');

    expect(document.querySelector('[data-popup-selection-summary]')?.textContent)
      .toContain('3 of 3 tabs selected');
    expect(getSaveButton().getAttribute('aria-label'))
      .toBe('Save 3 Tabs as a Session');

    const pinned = document.querySelector<HTMLInputElement>(
      'input[name="include-pinned-tabs"]',
    );
    await act(async () => pinned?.click());

    expect(getSaveButton().textContent).toContain('Save 2 Tabs');
    expect(document.querySelector('[data-popup-selection-summary]')?.textContent)
      .toContain('2 of 3 tabs selected');
  });

  it('explains when capture filters exclude every tab', async () => {
    queryTabs.mockResolvedValue([
      { ...tabs[0], pinned: true, groupId: 7 },
    ]);
    await mountPopup('Save 1 Tab');

    const pinned = document.querySelector<HTMLInputElement>(
      'input[name="include-pinned-tabs"]',
    );
    await act(async () => pinned?.click());

    expect(getSaveButton().disabled).toBe(true);
    expect(document.querySelector('[data-popup-selection-summary]')?.textContent)
      .toContain('No tabs selected. Include pinned tabs or tab groups to save this window.');
  });

  it('uses contrast-safe duplicate text and action variants', async () => {
    queryTabs.mockResolvedValue([...tabs, { ...tabs[0], id: 8, active: false }]);
    await mountPopup('Save');

    expect(document.querySelector('.popup-app__duplicate')?.classList)
      .toContain('popup-app__duplicate--contrast');
    expect(document.querySelector('.popup-app__dedupe')?.getAttribute('data-variant'))
      .toBe('default');
  });

  it('shows a duplicate-removal action only when duplicate tabs exist', async () => {
    await mountPopup('Save');
    expect(document.body.textContent).not.toContain('Dedupe');

    await act(async () => activeMount?.root.unmount());
    activeMount?.container.remove();
    activeMount = null;
    queryTabs.mockResolvedValue([...tabs, { ...tabs[0], id: 8, active: false }]);

    await mountPopup('Save');
    expect(document.body.textContent).toContain('Dedupe');
  });

  it('confirms before closing duplicate browser tabs', async () => {
    queryTabs.mockResolvedValue([...tabs, { ...tabs[0], id: 8, active: false }]);
    sendMessage.mockResolvedValue({ ok: true });
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);

    await mountPopup('Save');
    const dedupe = document.querySelector<HTMLButtonElement>(
      '[aria-label="Remove Duplicate Tabs from This Window"]',
    );
    await act(async () => dedupe?.click());

    expect(sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')?.textContent)
      .toContain('Close 1 duplicate tab in this window?');

    const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Remove Duplicate Tab');
    await act(async () => confirm?.click());
    await waitForDom(() => expect(sendMessage).toHaveBeenCalledWith({ action: 'dedupe-window' }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('restores focus to Dedupe after cancelling its confirmation', async () => {
    queryTabs.mockResolvedValue([...tabs, { ...tabs[0], id: 8, active: false }]);
    await mountPopup('Save');
    const dedupe = document.querySelector<HTMLButtonElement>(
      '[aria-label="Remove Duplicate Tabs from This Window"]',
    );
    await act(async () => dedupe?.click());

    const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Cancel');
    await act(async () => cancel?.click());

    await waitForDom(() => expect(document.activeElement).toBe(dedupe));
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

    await mountPopup('No Tabs');
    await waitForDom(() => expect(document.querySelector('[role="alert"]')?.textContent)
      .toContain('Tabs unavailable.'));

    expect(unhandledRejection).not.toHaveBeenCalled();
    window.removeEventListener('unhandledrejection', unhandledRejection);
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
