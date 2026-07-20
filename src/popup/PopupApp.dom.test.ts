// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopupApp } from './PopupApp';

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

vi.mock('../shared/hooks/useStoreHydration', () => ({
  useStoreHydration: () => ({ hydrated: true }),
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
  const button = document.querySelector<HTMLButtonElement>('[aria-label="Save selected tabs as a session"]');
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

async function clickSave(): Promise<void> {
  await act(async () => {
    getSaveButton().click();
  });
}

beforeEach(() => {
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
  it('summarizes the current window instead of rendering tab rows', async () => {
    await mountPopup('Save');

    expect(document.body.textContent).toContain('1 Tab');
    expect(document.body.textContent).not.toContain('Example');
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

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 800);
    expect(close).not.toHaveBeenCalled();

    await act(async () => {
      closeCallback?.();
    });
    expect(close).toHaveBeenCalledTimes(1);
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

    await mountPopup('No tabs');
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
