import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyState,
  restoreRefKey,
  SETTINGS_PROJECTION_KEY,
  type BrowserGroup,
  type Group,
  type TabBoardState,
} from '../shared/model';
import { projectionFromState } from '../shared/store/settingsProjection';
import type { StateMutation } from '../shared/store/stateMutations';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TRUSTED_EXTENSION_ID = 'test-extension-id';

describe('service worker file-storage module ownership', () => {
  it('installs static file modules before the first Storage Authority operation', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/background/service-worker.ts'),
      'utf8',
    );
    const loaderInstall = source.indexOf('_setActiveAdapterModuleLoadersForWorker({');
    const firstAuthorityCall = source.indexOf('chrome.runtime.onInstalled.addListener');

    expect(loaderInstall).toBeGreaterThanOrEqual(0);
    expect(loaderInstall).toBeLessThan(firstAuthorityCall);
  });
});

interface EventHarness {
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  getListener: () => ((...args: unknown[]) => unknown) | undefined;
}

interface MultiEventHarness extends EventHarness {
  emit: (...args: unknown[]) => void;
  listenerCount: () => number;
}

function createEvent(): EventHarness {
  let listener: ((...args: unknown[]) => unknown) | undefined;
  return {
    addListener: vi.fn((next: (...args: unknown[]) => unknown) => {
      listener = next;
    }),
    removeListener: vi.fn((current: (...args: unknown[]) => unknown) => {
      if (listener === current) listener = undefined;
    }),
    getListener: () => listener,
  };
}

function createMultiEvent(): MultiEventHarness {
  const listeners = new Set<(...args: unknown[]) => unknown>();
  return {
    addListener: vi.fn((listener: (...args: unknown[]) => unknown) => {
      listeners.add(listener);
    }),
    removeListener: vi.fn((listener: (...args: unknown[]) => unknown) => {
      listeners.delete(listener);
    }),
    getListener: () => [...listeners].at(-1),
    emit: (...args: unknown[]) => {
      listeners.forEach((listener) => listener(...args));
    },
    listenerCount: () => listeners.size,
  };
}

function createTab(
  id: number,
  title = `Tab ${id}`,
  overrides: Partial<chrome.tabs.Tab> = {},
): chrome.tabs.Tab {
  return {
    id,
    index: id,
    title,
    url: `https://example.test/${id}`,
    windowId: 1,
    active: id === 1,
    highlighted: false,
    pinned: false,
    incognito: false,
    selected: id === 1,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
    ...overrides,
  };
}

function createTabGroup(id: number, windowId = 1): chrome.tabGroups.TabGroup {
  return {
    id,
    windowId,
    title: `Group ${id}`,
    color: 'blue',
    collapsed: false,
  };
}

function createState(): TabBoardState {
  const state = createEmptyState();
  return {
    ...state,
    workspaces: [
      { id: 'workspace-a', name: 'A', emoji: '🗂️', createdAt: state.createdAt, updatedAt: state.updatedAt },
      { id: 'workspace-b', name: 'B', emoji: '🗂️', createdAt: state.createdAt, updatedAt: state.updatedAt },
    ],
    activeWorkspaceId: 'workspace-a',
  };
}

function createSavedTab(id = 'saved-tab') {
  const timestamp = '2026-01-01T00:00:00.000Z';
  return {
    id,
    itemType: 'link' as const,
    title: id,
    url: `https://${id}.test`,
    favIconUrl: '',
    note: '',
    pinned: false,
    incognito: false,
    starred: false,
    taskStatus: 'none',
    browserGroup: null,
    sourceWindowId: null,
    sourceTabId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createSavedGroup(id = 'target', overrides: Partial<Group> = {}): Group {
  const timestamp = '2026-01-01T00:00:00.000Z';
  return {
    id,
    title: id,
    note: '',
    workspaceId: 'workspace-a',
    folderId: null,
    locked: false,
    starred: false,
    archived: false,
    collapsed: false,
    tabs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

interface ChromeHarnessOptions {
  tabs?: chrome.tabs.Tab[];
  windows?: chrome.windows.Window[];
  bookmarks?: chrome.bookmarks.BookmarkTreeNode[];
  getTab?: (tabId: number) => chrome.tabs.Tab | undefined | Promise<chrome.tabs.Tab | undefined>;
  getTabGroup?: (groupId: number) => chrome.tabGroups.TabGroup | Promise<chrome.tabGroups.TabGroup>;
}

function createChromeHarness(initialState: TabBoardState, options: ChromeHarnessOptions = {}) {
  const action = createEvent();
  const commands = createEvent();
  const contextMenus = createEvent();
  const runtimeMessage = createEvent();
  const startup = createEvent();
  const tabsUpdated = createMultiEvent();
  const state = { current: structuredClone(initialState) };
  const writes: TabBoardState[] = [];
  const tabs = options.tabs || [createTab(1), createTab(2)];
  const openWindows = options.windows || [{
    id: 1,
    type: 'normal',
    incognito: false,
    focused: true,
    tabs,
  }];
  const getTab = options.getTab || ((tabId: number) => tabs.find((tab) => tab.id === tabId));

  const chromeMock = {
    action: {
      onClicked: action,
      setPopup: vi.fn(async () => undefined),
      setTitle: vi.fn(async () => undefined),
    },
    commands: { onCommand: commands },
    contextMenus: {
      onClicked: contextMenus,
      removeAll: vi.fn((callback: () => void) => callback()),
      create: vi.fn(),
    },
    omnibox: {
      setDefaultSuggestion: vi.fn(),
      onInputChanged: createEvent(),
      onInputEntered: createEvent(),
    },
    runtime: {
      id: TRUSTED_EXTENSION_ID,
      getURL: vi.fn((path: string) => `chrome-extension://${TRUSTED_EXTENSION_ID}/${path}`),
      onInstalled: createEvent(),
      onStartup: startup,
      onMessage: runtimeMessage,
      sendMessage: vi.fn(async () => undefined),
      openOptionsPage: vi.fn(),
    },
    storage: {
      local: {
        get: vi.fn(async (_keys?: unknown): Promise<Record<string, unknown>> => ({
          tabboardState: structuredClone(state.current),
          [SETTINGS_PROJECTION_KEY]: projectionFromState(state.current),
        })),
        set: vi.fn(async (value: Record<string, unknown>) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          if (!value.tabboardState) return;
          const nextState = structuredClone(value.tabboardState as TabBoardState);
          writes.push(nextState);
          state.current = nextState;
        }),
      },
      onChanged: createEvent(),
    },
    tabs: {
      query: vi.fn(async (query: chrome.tabs.QueryInfo = {}) => {
        if (query.windowId !== undefined) return tabs.filter((tab) => tab.windowId === query.windowId);
        if (query.active) return tabs.filter((tab) => tab.active);
        return tabs;
      }),
      get: vi.fn(async (tabId: number) => getTab(tabId)),
      create: vi.fn(async (properties: chrome.tabs.CreateProperties) => ({ ...tabs[0], ...properties })),
      update: vi.fn(async (tabId: number, properties: chrome.tabs.UpdateProperties) => ({ ...tabs.find((tab) => tab.id === tabId), ...properties })),
      remove: vi.fn(async () => undefined),
      onUpdated: tabsUpdated,
    },
    windows: {
      get: vi.fn(async (windowId: number) => openWindows.find((window) => window.id === windowId)),
      getAll: vi.fn(async () => openWindows),
      create: vi.fn(async (_properties: chrome.windows.CreateData): Promise<chrome.windows.Window> => {
        throw new Error('Window creation is not configured for this test.');
      }),
      update: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    },
    tabGroups: {
      get: vi.fn(async (groupId: number) => options.getTabGroup?.(groupId) || {
        id: groupId,
        windowId: 1,
        title: `Group ${groupId}`,
        color: 'blue',
        collapsed: false,
      }),
    },
    bookmarks: {
      getTree: vi.fn(async () => options.bookmarks ?? []),
      onCreated: createEvent(),
      onChanged: createEvent(),
      onMoved: createEvent(),
      onRemoved: createEvent(),
      onImportEnded: createEvent(),
    },
  };

  return {
    action,
    contextMenus,
    runtimeMessage,
    startup,
    state,
    tabs,
    tabsUpdated,
    writes,
    chromeMock,
  };
}

function sendMessage(
  listener: ((...args: unknown[]) => unknown) | undefined,
  message: Record<string, unknown>,
  sender?: unknown,
): Promise<unknown> {
  if (!listener) throw new Error('Message listener was not registered.');
  const actualSender = arguments.length >= 3 ? sender : { id: TRUSTED_EXTENSION_ID };
  return new Promise((resolve) => {
    listener(message, actualSender, resolve);
  });
}

async function switchWorkspace(
  runtimeMessage: EventHarness,
  workspaceId: string,
): Promise<unknown> {
  const mutation: StateMutation = {
    type: 'set-active-workspace',
    workspaceId,
    updatedAt: new Date().toISOString(),
  };
  return sendMessage(runtimeMessage.getListener(), {
    type: 'tabboard-state-mutations',
    mutations: [mutation],
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('Chrome action settings synchronization', () => {
  it('reads only the settings projection during browser startup', async () => {
    const state = createState();
    state.settings.actionClick = 'popup';
    const harness = createChromeHarness(state);
    harness.chromeMock.storage.local.get.mockImplementation(async (keys: unknown) => (
      keys === SETTINGS_PROJECTION_KEY
        ? { [SETTINGS_PROJECTION_KEY]: projectionFromState(state) }
        : { tabboardState: structuredClone(state) }
    ));
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const listener = harness.startup.getListener();
    if (!listener) throw new Error('Expected startup listener was not registered.');
    await listener();

    expect(harness.chromeMock.storage.local.get).toHaveBeenCalledWith(
      SETTINGS_PROJECTION_KEY,
    );
    expect(harness.chromeMock.storage.local.get).not.toHaveBeenCalledWith(
      'tabboardState',
    );
    expect(harness.chromeMock.action.setPopup).toHaveBeenCalledWith({
      popup: 'popup.html',
    });
  });

  it('does not update the action when an unrelated state write keeps actionClick unchanged', async () => {
    const state = createState();
    const harness = createChromeHarness(state);
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const listener = harness.chromeMock.storage.onChanged.getListener();
    if (!listener) throw new Error('Expected storage change listener was not registered.');

    listener({
      tabboardState: {
        oldValue: state,
        newValue: {
          ...state,
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      },
    }, 'local');
    await Promise.resolve();

    expect(harness.chromeMock.action.setPopup).not.toHaveBeenCalled();
    expect(harness.chromeMock.action.setTitle).not.toHaveBeenCalled();
  });

  it('updates the action when actionClick changes', async () => {
    const state = createState();
    state.settings.actionClick = 'store';
    const harness = createChromeHarness(state);
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const listener = harness.chromeMock.storage.onChanged.getListener();
    if (!listener) throw new Error('Expected storage change listener was not registered.');

    listener({
      tabboardState: {
        oldValue: state,
        newValue: {
          ...state,
          settings: { ...state.settings, actionClick: 'popup' },
        },
      },
    }, 'local');
    await vi.waitFor(() => {
      expect(harness.chromeMock.action.setPopup).toHaveBeenCalledWith({ popup: 'popup.html' });
    });

    expect(harness.chromeMock.action.setTitle).toHaveBeenCalledWith({ title: 'Open TabBoard' });
  });

  it('refreshes the action popup when a file ping arrives', async () => {
    const state = createState();
    const harness = createChromeHarness(state);
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    // Simulate another context having switched settings to popup mode and
    // written a file ping (without a STATE_KEY change, since file mode does
    // not write STATE_KEY).
    harness.state.current = {
      ...state,
      settings: { ...state.settings, actionClick: 'popup' },
    };
    harness.chromeMock.storage.local.get.mockResolvedValue({
      [SETTINGS_PROJECTION_KEY]: projectionFromState(harness.state.current),
    });

    const listener = harness.chromeMock.storage.onChanged.getListener();
    if (!listener) throw new Error('Expected storage change listener was not registered.');

    listener({
      tabboardFilePing: {
        oldValue: undefined,
        newValue: { mutationRevision: 7, updatedAt: '2026-01-02T00:00:00.000Z' },
      },
    }, 'local');
    await vi.waitFor(() => {
      expect(harness.chromeMock.action.setPopup).toHaveBeenCalledWith({ popup: 'popup.html' });
    });
    expect(harness.chromeMock.action.setTitle).toHaveBeenCalledWith({ title: 'Open TabBoard' });
    expect(harness.chromeMock.storage.local.get).toHaveBeenCalledWith(
      SETTINGS_PROJECTION_KEY,
    );
    expect(harness.chromeMock.storage.local.get).not.toHaveBeenCalledWith(
      'tabboardState',
    );
  });
});

describe('tabboard-storage-switched message', () => {
  it('resets the active adapter and re-ensures state without breaking the queue', async () => {
    const state = createState();
    const harness = createChromeHarness(state);
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const listener = harness.runtimeMessage.getListener();
    if (!listener) throw new Error('Expected message listener was not registered.');

    // Drive a mutation through so the persistence promise is cached.
    await sendMessage(listener, {
      type: 'tabboard-state-mutations',
      mutations: [{
        type: 'set-active-workspace',
        workspaceId: 'workspace-b',
        updatedAt: new Date().toISOString(),
      }],
    });
    expect(harness.state.current.activeWorkspaceId).toBe('workspace-b');

    // Send the storage-switched notification. It should reset the adapter and
    // re-run ensureState, returning ok and leaving the queue usable.
    const switchResp = await sendMessage(listener, { type: 'tabboard-storage-switched' }) as {
      ok: boolean;
    };
    expect(switchResp.ok).toBe(true);

    // Subsequent mutations still flow through to storage.
    await sendMessage(listener, {
      type: 'tabboard-state-mutations',
      mutations: [{
        type: 'set-active-workspace',
        workspaceId: 'workspace-a',
        updatedAt: new Date().toISOString(),
      }],
    });
    expect(harness.state.current.activeWorkspaceId).toBe('workspace-a');
  });
});

describe('restore-refs outcomes', () => {
  it('keeps successful source refs when deleteRestoredTabs is disabled', async () => {
    vi.useFakeTimers();
    const success = createSavedTab('restore-keep-success');
    const source = createSavedGroup('restore-keep-source', {
      tabs: [success],
      workspaceId: 'workspace-a',
    });
    const state: TabBoardState = {
      ...createState(),
      groups: [source],
      settings: {
        ...createState().settings,
        deleteRestoredTabs: false,
      },
    };
    const liveTabs = new Map<number, chrome.tabs.Tab>();
    const harness = createChromeHarness(state, {
      getTab: (tabId) => liveTabs.get(tabId),
    });
    harness.chromeMock.tabs.create.mockImplementation(async (properties) => {
      const created = createTab(91, String(properties.url), {
        ...properties,
        id: 91,
        status: 'loading',
        title: String(properties.url),
        url: String(properties.url),
      });
      liveTabs.set(91, created);
      return created;
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');
    const ref = {
      source: 'group',
      groupId: source.id,
      tabId: success.id,
    };

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'restore-refs',
      refs: [ref],
    });
    await vi.waitFor(() => {
      expect(harness.tabsUpdated.listenerCount()).toBe(1);
    });
    const finalTab = {
      ...liveTabs.get(91)!,
      status: 'complete' as const,
      title: 'Final kept title',
    };
    liveTabs.set(91, finalTab);
    harness.tabsUpdated.emit(
      91,
      { status: 'complete', title: finalTab.title },
      finalTab,
    );
    await vi.advanceTimersByTimeAsync(500);
    const response = await responsePromise;

    expect(response).toMatchObject({
      ok: true,
      result: {
        restoredTabs: 1,
        outcomes: [{
          key: restoreRefKey(ref),
          groupId: source.id,
          tabId: success.id,
          status: 'restored',
        }],
      },
    });
    expect(harness.state.current.groups.find(({ id }) => id === source.id)?.tabs)
      .toContainEqual(expect.objectContaining({
        id: success.id,
        title: 'Final kept title',
      }));
    expect(harness.writes).toHaveLength(1);
  });

  it('reports ordered success/missing/create-failed outcomes and removes only successes', async () => {
    const success = createSavedTab('restore-success');
    const restricted = {
      ...createSavedTab('restore-restricted'),
      url: 'chrome://settings/',
    };
    const source = createSavedGroup('restore-source', {
      tabs: [success, restricted],
      workspaceId: 'workspace-a',
    });
    const state: TabBoardState = {
      ...createState(),
      groups: [source],
      settings: {
        ...createState().settings,
        deleteRestoredTabs: true,
      },
    };
    const harness = createChromeHarness(state);
    harness.chromeMock.tabs.create.mockImplementation(
      async (properties: chrome.tabs.CreateProperties) => {
        if (properties.url === restricted.url) {
          throw new Error('Restricted URL');
        }
        return { ...harness.tabs[0], ...properties };
      },
    );
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');
    const listener = harness.runtimeMessage.getListener();
    const refs = [
      { source: 'group', groupId: source.id, tabId: success.id },
      { source: 'group', groupId: source.id, tabId: 'restore-missing' },
      { source: 'group', groupId: source.id, tabId: restricted.id },
    ];

    const response = await sendMessage(listener, {
      type: 'restore-refs',
      refs,
    });

    expect(response).toMatchObject({
      ok: true,
      result: {
        restoredTabs: 1,
        outcomes: [
          {
            key: restoreRefKey(refs[0]),
            groupId: refs[0].groupId,
            tabId: refs[0].tabId,
            status: 'restored',
          },
          {
            key: restoreRefKey(refs[1]),
            groupId: refs[1].groupId,
            tabId: refs[1].tabId,
            status: 'failed',
            error: 'missing',
          },
          {
            key: restoreRefKey(refs[2]),
            groupId: refs[2].groupId,
            tabId: refs[2].tabId,
            status: 'failed',
            error: 'create-failed',
          },
        ],
      },
    });
    await vi.waitFor(() => {
      const remaining = harness.state.current.groups.find(
        ({ id }) => id === source.id,
      )?.tabs;
      expect(remaining).not.toContainEqual(expect.objectContaining({
        id: success.id,
      }));
      expect(remaining).toContainEqual(expect.objectContaining({
        id: restricted.id,
      }));
    });
  });

  it('rejects duplicate restore refs before creating any browser tab', async () => {
    const success = createSavedTab('restore-duplicate');
    const source = createSavedGroup('restore-duplicate-source', {
      tabs: [success],
      workspaceId: 'workspace-a',
    });
    const state = { ...createState(), groups: [source] };
    const harness = createChromeHarness(state);
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');
    const listener = harness.runtimeMessage.getListener();
    const ref = { source: 'group', groupId: source.id, tabId: success.id };

    for (const invalidRefs of [
      [ref, ref],
      [ref, { source: 'group', groupId: '', tabId: 'malformed' }],
    ]) {
      const response = await sendMessage(listener, {
        type: 'restore-refs',
        refs: invalidRefs,
      }) as { ok: boolean; error?: string };
      expect(response.ok).toBe(false);
      expect(response.error).toMatch(/unique|valid/);
    }
    expect(harness.chromeMock.tabs.create).not.toHaveBeenCalled();
  });
});

describe('saved tab title refresh', () => {
  it('reuses the loaded title from an already-open exact URL', async () => {
    const url = 'https://refresh.example/article';
    const openTab = createTab(7, 'Loaded article title', {
      url,
      status: 'complete',
    });
    const harness = createChromeHarness(createState(), { tabs: [openTab] });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'refresh-saved-tab-title',
      url,
    });

    expect(response).toEqual({ ok: true, result: openTab.title });
    expect(harness.chromeMock.windows.create).not.toHaveBeenCalled();
    expect(harness.chromeMock.windows.remove).not.toHaveBeenCalled();
  });

  it('prefers a completed exact-URL tab over an earlier matching tab that is still loading', async () => {
    vi.useFakeTimers();
    const url = 'https://refresh.example/article';
    const loading = createTab(7, 'Temporary title', {
      url,
      status: 'loading',
    });
    const complete = createTab(8, 'Loaded article title', {
      url,
      status: 'complete',
    });
    const harness = createChromeHarness(createState(), {
      tabs: [loading, complete],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'refresh-saved-tab-title',
      url,
    });
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(responsePromise).resolves.toEqual({
      ok: true,
      result: complete.title,
    });
    expect(harness.chromeMock.windows.create).not.toHaveBeenCalled();
  });

  it('loads a missing URL in a minimized unfocused window and removes it after the title settles', async () => {
    vi.useFakeTimers();
    const url = 'https://refresh.example/article';
    const temporaryTab = createTab(99, url, {
      url,
      windowId: 9,
      status: 'loading',
    });
    const harness = createChromeHarness(createState(), { tabs: [] });
    harness.chromeMock.windows.create.mockResolvedValue({
      id: 9,
      type: 'normal',
      incognito: false,
      focused: false,
      state: 'minimized',
      alwaysOnTop: false,
      tabs: [temporaryTab],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'refresh-saved-tab-title',
      url,
    });
    await vi.waitFor(() => {
      expect(harness.tabsUpdated.getListener()).toBeTypeOf('function');
    });
    harness.tabsUpdated.getListener()?.(
      temporaryTab.id!,
      { status: 'complete', title: 'Loaded article title' },
      { ...temporaryTab, status: 'complete', title: 'Loaded article title' },
    );
    await vi.advanceTimersByTimeAsync(500);

    await expect(responsePromise).resolves.toEqual({
      ok: true,
      result: 'Loaded article title',
    });
    expect(harness.chromeMock.windows.create).toHaveBeenCalledWith({
      url,
      focused: false,
      state: 'minimized',
      type: 'popup',
    });
    expect(harness.chromeMock.windows.remove).toHaveBeenCalledWith(9);
  });

  it('discards a candidate title when the page starts loading again before it settles', async () => {
    vi.useFakeTimers();
    const url = 'https://refresh.example/article';
    const temporaryTab = createTab(103, url, {
      url,
      windowId: 13,
      status: 'loading',
    });
    const harness = createChromeHarness(createState(), { tabs: [] });
    harness.chromeMock.windows.create.mockResolvedValue({
      id: 13,
      type: 'normal',
      incognito: false,
      focused: false,
      state: 'minimized',
      alwaysOnTop: false,
      tabs: [temporaryTab],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'refresh-saved-tab-title',
      url,
    });
    await vi.waitFor(() => {
      expect(harness.tabsUpdated.getListener()).toBeTypeOf('function');
    });
    harness.tabsUpdated.getListener()?.(
      temporaryTab.id!,
      { status: 'complete', title: 'Temporary title' },
      { ...temporaryTab, status: 'complete', title: 'Temporary title' },
    );
    await vi.advanceTimersByTimeAsync(200);
    harness.tabsUpdated.getListener()?.(
      temporaryTab.id!,
      { status: 'loading' },
      { ...temporaryTab, status: 'loading', title: 'Temporary title' },
    );
    await vi.advanceTimersByTimeAsync(200);
    harness.tabsUpdated.getListener()?.(
      temporaryTab.id!,
      { status: 'complete', title: 'Final title' },
      { ...temporaryTab, status: 'complete', title: 'Final title' },
    );
    await vi.advanceTimersByTimeAsync(400);

    await expect(responsePromise).resolves.toEqual({
      ok: true,
      result: 'Final title',
    });
    expect(harness.chromeMock.windows.remove).toHaveBeenCalledWith(13);
  });

  it('reads the current temporary tab after listener registration so an early title event is not lost', async () => {
    vi.useFakeTimers();
    const url = 'https://refresh.example/article';
    const temporaryTab = createTab(101, url, {
      url,
      windowId: 11,
      status: 'loading',
    });
    const loadedTab = {
      ...temporaryTab,
      status: 'complete' as const,
      title: 'Loaded article title',
    };
    const harness = createChromeHarness(createState(), {
      tabs: [],
      getTab: (tabId) => tabId === temporaryTab.id ? loadedTab : undefined,
    });
    harness.chromeMock.windows.create.mockResolvedValue({
      id: 11,
      type: 'normal',
      incognito: false,
      focused: false,
      state: 'minimized',
      alwaysOnTop: false,
      tabs: [temporaryTab],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'refresh-saved-tab-title',
      url,
    });
    await vi.waitFor(() => {
      expect(harness.tabsUpdated.getListener()).toBeTypeOf('function');
    });
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(responsePromise).resolves.toEqual({
      ok: true,
      result: loadedTab.title,
    });
    expect(harness.chromeMock.tabs.get).toHaveBeenCalledWith(temporaryTab.id);
    expect(harness.chromeMock.windows.remove).toHaveBeenCalledWith(11);
  });

  it('removes the temporary window when no usable title loads', async () => {
    vi.useFakeTimers();
    const url = 'https://refresh.example/never-loads';
    const temporaryTab = createTab(100, url, {
      url,
      windowId: 10,
      status: 'loading',
    });
    const harness = createChromeHarness(createState(), { tabs: [] });
    harness.chromeMock.windows.create.mockResolvedValue({
      id: 10,
      type: 'normal',
      incognito: false,
      focused: false,
      state: 'minimized',
      alwaysOnTop: false,
      tabs: [temporaryTab],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'refresh-saved-tab-title',
      url,
    });
    await vi.waitFor(() => {
      expect(harness.tabsUpdated.getListener()).toBeTypeOf('function');
    });
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(responsePromise).resolves.toMatchObject({
      ok: false,
      error: 'Unable to load a page title.',
    });
    expect(harness.chromeMock.windows.remove).toHaveBeenCalledWith(10);
  });

  it('ignores a tabs.get result that arrives after the title request times out', async () => {
    vi.useFakeTimers();
    const url = 'https://refresh.example/late-title';
    const temporaryTab = createTab(104, url, {
      url,
      windowId: 14,
      status: 'loading',
    });
    let resolveCurrentTab: ((tab: chrome.tabs.Tab) => void) | undefined;
    const harness = createChromeHarness(createState(), {
      tabs: [],
      getTab: () => new Promise<chrome.tabs.Tab>((resolve) => {
        resolveCurrentTab = resolve;
      }),
    });
    harness.chromeMock.windows.create.mockResolvedValue({
      id: 14,
      type: 'normal',
      incognito: false,
      focused: false,
      state: 'minimized',
      alwaysOnTop: false,
      tabs: [temporaryTab],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'refresh-saved-tab-title',
      url,
    });
    await vi.waitFor(() => {
      expect(resolveCurrentTab).toBeTypeOf('function');
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(responsePromise).resolves.toEqual({
      ok: false,
      error: 'Unable to load a page title.',
    });

    resolveCurrentTab?.({
      ...temporaryTab,
      status: 'complete',
      title: 'Late title',
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(vi.getTimerCount()).toBe(0);
    expect(harness.chromeMock.windows.remove).toHaveBeenCalledTimes(1);
  });

  it('keeps the loaded title when the temporary window was already closed', async () => {
    vi.useFakeTimers();
    const url = 'https://refresh.example/already-closed';
    const temporaryTab = createTab(105, url, {
      url,
      windowId: 15,
      status: 'loading',
    });
    const harness = createChromeHarness(createState(), { tabs: [] });
    harness.chromeMock.windows.create.mockResolvedValue({
      id: 15,
      type: 'normal',
      incognito: false,
      focused: false,
      state: 'minimized',
      alwaysOnTop: false,
      tabs: [temporaryTab],
    });
    harness.chromeMock.windows.remove.mockRejectedValue(
      new Error('No window with id: 15'),
    );
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'refresh-saved-tab-title',
      url,
    });
    await vi.waitFor(() => {
      expect(harness.tabsUpdated.getListener()).toBeTypeOf('function');
    });
    harness.tabsUpdated.getListener()?.(
      temporaryTab.id!,
      { status: 'complete', title: 'Loaded title' },
      { ...temporaryTab, status: 'complete', title: 'Loaded title' },
    );
    await vi.advanceTimersByTimeAsync(400);

    await expect(responsePromise).resolves.toEqual({
      ok: true,
      result: 'Loaded title',
    });
    expect(harness.chromeMock.windows.remove).toHaveBeenCalledWith(15);
  });

  it('rejects an oversized loaded title before returning it to the manager', async () => {
    const url = 'https://refresh.example/oversized';
    const openTab = createTab(12, 'x'.repeat(513), {
      url,
      status: 'complete',
    });
    const harness = createChromeHarness(createState(), { tabs: [openTab] });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'refresh-saved-tab-title',
      url,
    });

    expect(response).toEqual({
      ok: false,
      error: 'Loaded page title is too long.',
    });
  });

  it('rejects an oversized title received from the temporary tab update event', async () => {
    vi.useFakeTimers();
    const url = 'https://refresh.example/oversized-event';
    const temporaryTab = createTab(102, url, {
      url,
      windowId: 12,
      status: 'loading',
    });
    const harness = createChromeHarness(createState(), { tabs: [] });
    harness.chromeMock.windows.create.mockResolvedValue({
      id: 12,
      type: 'normal',
      incognito: false,
      focused: false,
      state: 'minimized',
      alwaysOnTop: false,
      tabs: [temporaryTab],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'refresh-saved-tab-title',
      url,
    });
    await vi.waitFor(() => {
      expect(harness.tabsUpdated.getListener()).toBeTypeOf('function');
    });
    harness.tabsUpdated.getListener()?.(
      temporaryTab.id!,
      { status: 'complete', title: 'x'.repeat(513) },
      { ...temporaryTab, status: 'complete', title: 'x'.repeat(513) },
    );

    await expect(responsePromise).resolves.toEqual({
      ok: false,
      error: 'Loaded page title is too long.',
    });
    expect(harness.chromeMock.windows.remove).toHaveBeenCalledWith(12);
  });
});

describe('restore title synchronization', () => {
  it('updates a retained saved tab from the final stable title instead of the loading placeholder', async () => {
    vi.useFakeTimers();
    const saved = {
      ...createSavedTab('restore-title-single'),
      title: 'Temporary saved title',
    };
    const source = createSavedGroup('restore-title-single-source', {
      tabs: [saved],
    });
    const state = {
      ...createState(),
      groups: [source],
      settings: {
        ...createState().settings,
        deleteRestoredTabs: false,
      },
    };
    const liveTabs = new Map<number, chrome.tabs.Tab>();
    const harness = createChromeHarness(state, {
      getTab: (tabId) => liveTabs.get(tabId),
    });
    harness.chromeMock.tabs.create.mockImplementation(async (properties) => {
      const created = createTab(101, String(properties.url), {
        ...properties,
        id: 101,
        status: 'loading',
        title: String(properties.url),
        url: String(properties.url),
      });
      liveTabs.set(101, created);
      return created;
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'restore-tab',
      source: 'group',
      groupId: source.id,
      tabId: saved.id,
    });
    await vi.waitFor(() => {
      expect(harness.tabsUpdated.listenerCount()).toBe(1);
    });
    const finalTab = {
      ...liveTabs.get(101)!,
      status: 'complete' as const,
      title: 'Final loaded title',
    };
    liveTabs.set(101, finalTab);
    harness.tabsUpdated.emit(
      101,
      { status: 'complete', title: finalTab.title },
      finalTab,
    );
    await vi.advanceTimersByTimeAsync(500);

    await expect(responsePromise).resolves.toMatchObject({
      ok: true,
      result: { restoredTabs: 1 },
    });
    expect(harness.state.current.groups[0]?.tabs[0]).toEqual({
      ...saved,
      title: 'Final loaded title',
      updatedAt: expect.any(String),
    });
  });

  it('waits for restored session titles concurrently and writes them in one batch', async () => {
    vi.useFakeTimers();
    const first = { ...createSavedTab('restore-title-first'), title: 'First temporary' };
    const second = { ...createSavedTab('restore-title-second'), title: 'Second temporary' };
    const source = createSavedGroup('restore-title-group', {
      tabs: [first, second],
      locked: true,
    });
    const state = {
      ...createState(),
      groups: [source],
      settings: {
        ...createState().settings,
        deleteRestoredTabs: true,
      },
    };
    const liveTabs = new Map<number, chrome.tabs.Tab>();
    let nextTabId = 201;
    const harness = createChromeHarness(state, {
      getTab: (tabId) => liveTabs.get(tabId),
    });
    harness.chromeMock.tabs.create.mockImplementation(async (properties) => {
      const id = nextTabId++;
      const created = createTab(id, String(properties.url), {
        ...properties,
        id,
        status: 'loading',
        title: String(properties.url),
        url: String(properties.url),
      });
      liveTabs.set(id, created);
      return created;
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'restore-group',
      groupId: source.id,
    });
    await vi.waitFor(() => {
      expect(harness.tabsUpdated.listenerCount()).toBe(2);
    });
    for (const [id, title] of [[201, 'First final'], [202, 'Second final']] as const) {
      const finalTab = {
        ...liveTabs.get(id)!,
        status: 'complete' as const,
        title,
      };
      liveTabs.set(id, finalTab);
      harness.tabsUpdated.emit(
        id,
        { status: 'complete', title },
        finalTab,
      );
    }
    await vi.advanceTimersByTimeAsync(500);

    await expect(responsePromise).resolves.toMatchObject({
      ok: true,
      result: { restoredTabs: 2 },
    });
    expect(harness.state.current.groups[0]?.tabs.map(({ title }) => title))
      .toEqual(['First final', 'Second final']);
    expect(harness.writes).toHaveLength(1);
  });

  it('skips final-title waiting after delete-on-restore removes an unlocked saved tab', async () => {
    vi.useFakeTimers();
    const saved = createSavedTab('restore-title-deleted');
    const source = createSavedGroup('restore-title-deleted-source', {
      tabs: [saved],
    });
    const state = {
      ...createState(),
      groups: [source],
      settings: {
        ...createState().settings,
        deleteRestoredTabs: true,
      },
    };
    const harness = createChromeHarness(state);
    harness.chromeMock.tabs.create.mockResolvedValue(createTab(301, saved.url, {
      id: 301,
      status: 'loading',
      title: saved.url,
      url: saved.url,
    }));
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'restore-tab',
      source: 'group',
      groupId: source.id,
      tabId: saved.id,
    });
    await vi.advanceTimersByTimeAsync(50);

    await expect(responsePromise).resolves.toMatchObject({
      ok: true,
      result: { restoredTabs: 1 },
    });
    expect(harness.tabsUpdated.listenerCount()).toBe(0);
    expect(harness.state.current.groups).toEqual([]);
  });

  it('keeps restore successful when one selected title times out and updates successful siblings', async () => {
    vi.useFakeTimers();
    const first = { ...createSavedTab('restore-title-timeout'), title: 'First temporary' };
    const second = { ...createSavedTab('restore-title-success'), title: 'Second temporary' };
    const source = createSavedGroup('restore-title-partial-source', {
      tabs: [first, second],
      locked: true,
    });
    const state = {
      ...createState(),
      groups: [source],
      settings: {
        ...createState().settings,
        deleteRestoredTabs: true,
      },
    };
    const liveTabs = new Map<number, chrome.tabs.Tab>();
    let nextTabId = 401;
    const harness = createChromeHarness(state, {
      getTab: (tabId) => liveTabs.get(tabId),
    });
    harness.chromeMock.tabs.create.mockImplementation(async (properties) => {
      const id = nextTabId++;
      const created = createTab(id, String(properties.url), {
        ...properties,
        id,
        status: 'loading',
        title: String(properties.url),
        url: String(properties.url),
      });
      liveTabs.set(id, created);
      return created;
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'restore-refs',
      refs: [
        { source: 'group', groupId: source.id, tabId: first.id },
        { source: 'group', groupId: source.id, tabId: second.id },
      ],
    });
    await vi.waitFor(() => {
      expect(harness.tabsUpdated.listenerCount()).toBe(2);
    });
    const finalTab = {
      ...liveTabs.get(402)!,
      status: 'complete' as const,
      title: 'Second final',
    };
    liveTabs.set(402, finalTab);
    harness.tabsUpdated.emit(
      402,
      { status: 'complete', title: finalTab.title },
      finalTab,
    );
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(responsePromise).resolves.toMatchObject({
      ok: true,
      result: {
        restoredTabs: 2,
        outcomes: [
          { tabId: first.id, status: 'restored' },
          { tabId: second.id, status: 'restored' },
        ],
      },
    });
    expect(harness.state.current.groups[0]?.tabs.map(({ title }) => title))
      .toEqual(['First temporary', 'Second final']);
  });

  it('syncs retained records and skips deleted records during restore all', async () => {
    vi.useFakeTimers();
    const unlockedTab = {
      ...createSavedTab('restore-all-deleted'),
      title: 'Unlocked temporary',
    };
    const lockedTab = {
      ...createSavedTab('restore-all-retained'),
      title: 'Locked temporary',
    };
    const unlocked = createSavedGroup('restore-all-unlocked', {
      tabs: [unlockedTab],
    });
    const locked = createSavedGroup('restore-all-locked', {
      tabs: [lockedTab],
      locked: true,
    });
    const state = {
      ...createState(),
      groups: [locked, unlocked],
      settings: {
        ...createState().settings,
        deleteRestoredTabs: true,
        restoreGroupsInNewWindow: false,
      },
    };
    const liveTabs = new Map<number, chrome.tabs.Tab>();
    let nextTabId = 501;
    const harness = createChromeHarness(state, {
      getTab: (tabId) => liveTabs.get(tabId),
    });
    harness.chromeMock.tabs.create.mockImplementation(async (properties) => {
      const id = nextTabId++;
      const created = createTab(id, String(properties.url), {
        ...properties,
        id,
        status: 'loading',
        title: String(properties.url),
        url: String(properties.url),
      });
      liveTabs.set(id, created);
      return created;
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'restore-all',
    });
    await vi.waitFor(() => {
      expect(harness.chromeMock.tabs.create).toHaveBeenCalledTimes(2);
    });
    await vi.advanceTimersByTimeAsync(50);
    await vi.waitFor(() => {
      expect(harness.state.current.groups.map(({ id }) => id))
        .toEqual([locked.id]);
    });
    await vi.waitFor(() => {
      expect(harness.tabsUpdated.listenerCount()).toBe(1);
    });
    const finalTab = {
      ...liveTabs.get(501)!,
      status: 'complete' as const,
      title: 'Locked final',
    };
    liveTabs.set(501, finalTab);
    harness.tabsUpdated.emit(
      501,
      { status: 'complete', title: finalTab.title },
      finalTab,
    );
    await vi.advanceTimersByTimeAsync(500);

    await expect(responsePromise).resolves.toMatchObject({
      ok: true,
      result: { restoredTabs: 2 },
    });
    expect(harness.state.current.groups).toEqual([
      expect.objectContaining({
        id: locked.id,
        tabs: [expect.objectContaining({
          id: lockedTab.id,
          title: 'Locked final',
        })],
      }),
    ]);
  });

  it('skips title write when the saved URL changes while the restored page loads', async () => {
    vi.useFakeTimers();
    const saved = createSavedTab('restore-title-url-changed');
    const source = createSavedGroup('restore-title-url-changed-source', {
      tabs: [saved],
      locked: true,
    });
    const state = {
      ...createState(),
      groups: [source],
      settings: {
        ...createState().settings,
        deleteRestoredTabs: false,
      },
    };
    const liveTabs = new Map<number, chrome.tabs.Tab>();
    const harness = createChromeHarness(state, {
      getTab: (tabId) => liveTabs.get(tabId),
    });
    harness.chromeMock.tabs.create.mockImplementation(async (properties) => {
      const created = createTab(601, String(properties.url), {
        ...properties,
        id: 601,
        status: 'loading',
        title: String(properties.url),
        url: String(properties.url),
      });
      liveTabs.set(601, created);
      return created;
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'restore-tab',
      source: 'group',
      groupId: source.id,
      tabId: saved.id,
    });
    await vi.waitFor(() => {
      expect(harness.tabsUpdated.listenerCount()).toBe(1);
    });
    const changed = {
      ...harness.state.current,
      groups: [{
        ...source,
        tabs: [{ ...saved, url: 'https://changed.example/' }],
      }],
    };
    harness.state.current = changed;
    const finalTab = {
      ...liveTabs.get(601)!,
      status: 'complete' as const,
      title: 'Final original title',
    };
    liveTabs.set(601, finalTab);
    harness.tabsUpdated.emit(
      601,
      { status: 'complete', title: finalTab.title },
      finalTab,
    );
    await vi.advanceTimersByTimeAsync(500);

    await expect(responsePromise).resolves.toMatchObject({
      ok: true,
      result: { restoredTabs: 1 },
    });
    expect(harness.state.current.groups[0]?.tabs[0]).toMatchObject({
      url: 'https://changed.example/',
      title: saved.title,
    });
  });
});

describe('refresh saved group titles', () => {
  it('refreshes links with a concurrency limit of three and one mutation batch', async () => {
    const links = Array.from({ length: 5 }, (_, index) => ({
      ...createSavedTab(`refresh-group-${index + 1}`),
      title: `Temporary ${index + 1}`,
    }));
    const note = {
      ...createSavedTab('refresh-group-note'),
      itemType: 'note' as const,
      title: 'Note',
      url: '',
      note: 'Keep note',
    };
    const source = createSavedGroup('refresh-group-source', {
      tabs: [...links, note],
      locked: true,
    });
    const state = { ...createState(), groups: [source] };
    const harness = createChromeHarness(state);
    const pending: Array<{
      resolve: (tabs: chrome.tabs.Tab[]) => void;
      reject: (error: Error) => void;
    }> = [];
    let active = 0;
    let maxActive = 0;
    harness.chromeMock.tabs.query.mockImplementation(() =>
      new Promise<chrome.tabs.Tab[]>((resolve, reject) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        pending.push({
          resolve: (tabs) => {
            active -= 1;
            resolve(tabs);
          },
          reject: (error) => {
            active -= 1;
            reject(error);
          },
        });
      }));
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'refresh-saved-group-titles',
      groupId: source.id,
    });
    await vi.waitFor(() => {
      expect(pending).toHaveLength(3);
    });
    expect(maxActive).toBe(3);
    expect(harness.chromeMock.tabs.query).toHaveBeenCalledTimes(3);

    pending[0].resolve([createTab(701, 'Final 1', {
      url: links[0].url,
      status: 'complete',
    })]);
    pending[1].reject(new Error('Page unavailable'));
    pending[2].resolve([createTab(703, 'Final 3', {
      url: links[2].url,
      status: 'complete',
    })]);
    await vi.waitFor(() => {
      expect(pending).toHaveLength(5);
    });
    expect(maxActive).toBe(3);
    pending[3].resolve([createTab(704, 'Final 4', {
      url: links[3].url,
      status: 'complete',
    })]);
    pending[4].resolve([createTab(705, 'Final 5', {
      url: links[4].url,
      status: 'complete',
    })]);

    await expect(responsePromise).resolves.toEqual({
      ok: true,
      result: { refreshed: 4, failed: 1 },
    });
    expect(harness.state.current.groups[0]?.tabs.map(({ title }) => title))
      .toEqual(['Final 1', 'Temporary 2', 'Final 3', 'Final 4', 'Final 5', 'Note']);
    expect(harness.writes).toHaveLength(1);
    expect(harness.chromeMock.windows.create).not.toHaveBeenCalled();
  });

  it('counts records removed or URL-changed during refresh as failed', async () => {
    const first = createSavedTab('refresh-race-first');
    const second = createSavedTab('refresh-race-second');
    const source = createSavedGroup('refresh-race-source', {
      tabs: [first, second],
    });
    const state = { ...createState(), groups: [source] };
    const pending: Array<(tabs: chrome.tabs.Tab[]) => void> = [];
    const harness = createChromeHarness(state);
    harness.chromeMock.tabs.query.mockImplementation(() =>
      new Promise<chrome.tabs.Tab[]>((resolve) => pending.push(resolve)));
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'refresh-saved-group-titles',
      groupId: source.id,
    });
    await vi.waitFor(() => {
      expect(pending).toHaveLength(2);
    });
    harness.state.current = {
      ...state,
      groups: [{
        ...source,
        tabs: [{ ...first, url: 'https://changed.example/' }],
      }],
    };
    pending[0]([createTab(711, 'First final', {
      url: first.url,
      status: 'complete',
    })]);
    pending[1]([createTab(712, 'Second final', {
      url: second.url,
      status: 'complete',
    })]);

    await expect(responsePromise).resolves.toEqual({
      ok: true,
      result: { refreshed: 0, failed: 2 },
    });
    expect(harness.writes).toHaveLength(0);
  });

  it('rejects a missing saved group before resolving any title', async () => {
    const harness = createChromeHarness(createState());
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    await expect(sendMessage(harness.runtimeMessage.getListener(), {
      type: 'refresh-saved-group-titles',
      groupId: 'missing-group',
    })).resolves.toEqual({
      ok: false,
      error: 'Saved group not found',
    });
    expect(harness.chromeMock.tabs.query).not.toHaveBeenCalled();
  });
});

describe('title refresh activity messages', () => {
  it('wraps a manual saved-tab refresh with matching start and finish events', async () => {
    const url = 'https://activity.example/page';
    const openTab = createTab(801, 'Final activity title', {
      url,
      status: 'complete',
    });
    const harness = createChromeHarness(createState(), { tabs: [openTab] });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    await expect(sendMessage(harness.runtimeMessage.getListener(), {
      type: 'refresh-saved-tab-title',
      url,
      groupId: 'group-a',
      tabId: 'tab-a',
    })).resolves.toEqual({
      ok: true,
      result: 'Final activity title',
    });

    const activities = (
      harness.chromeMock.runtime.sendMessage.mock.calls as unknown[][]
    )
      .map(([message]) => message)
      .filter((message) =>
        (message as { type?: string }).type === 'tabboard-title-refresh-activity');
    expect(activities).toEqual([
      {
        type: 'tabboard-title-refresh-activity',
        groupId: 'group-a',
        tabId: 'tab-a',
        operationId: expect.any(String),
        status: 'start',
      },
      {
        type: 'tabboard-title-refresh-activity',
        groupId: 'group-a',
        tabId: 'tab-a',
        operationId: expect.any(String),
        status: 'finish',
      },
    ]);
    expect((activities[0] as { operationId: string }).operationId)
      .toBe((activities[1] as { operationId: string }).operationId);
  });

  it('starts only the three active Session batch items before queued items', async () => {
    const links = Array.from({ length: 4 }, (_, index) =>
      createSavedTab(`activity-batch-${index + 1}`));
    const source = createSavedGroup('activity-batch-group', { tabs: links });
    const harness = createChromeHarness({
      ...createState(),
      groups: [source],
    });
    const pending: Array<(tabs: chrome.tabs.Tab[]) => void> = [];
    harness.chromeMock.tabs.query.mockImplementation(() =>
      new Promise<chrome.tabs.Tab[]>((resolve) => pending.push(resolve)));
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'refresh-saved-group-titles',
      groupId: source.id,
    });
    await vi.waitFor(() => {
      expect(pending).toHaveLength(3);
    });
    const activities = () => (
      harness.chromeMock.runtime.sendMessage.mock.calls as unknown[][]
    )
      .map(([message]) => message as {
        type?: string;
        tabId?: string;
        status?: string;
      })
      .filter(({ type }) => type === 'tabboard-title-refresh-activity');
    expect(activities()).toEqual(links.slice(0, 3).map(({ id }) =>
      expect.objectContaining({ tabId: id, status: 'start' })));

    pending[0]([createTab(811, 'Final 1', {
      url: links[0].url,
      status: 'complete',
    })]);
    await vi.waitFor(() => {
      expect(pending).toHaveLength(4);
    });
    expect(activities()).toEqual(expect.arrayContaining([
      expect.objectContaining({ tabId: links[0].id, status: 'finish' }),
      expect.objectContaining({ tabId: links[3].id, status: 'start' }),
    ]));

    pending[1]([createTab(812, 'Final 2', { url: links[1].url, status: 'complete' })]);
    pending[2]([createTab(813, 'Final 3', { url: links[2].url, status: 'complete' })]);
    pending[3]([createTab(814, 'Final 4', { url: links[3].url, status: 'complete' })]);
    await expect(responsePromise).resolves.toMatchObject({ ok: true });
  });

  it('does not emit activity for restored records deleted before title sync', async () => {
    const saved = createSavedTab('activity-deleted');
    const source = createSavedGroup('activity-deleted-group', { tabs: [saved] });
    const harness = createChromeHarness({
      ...createState(),
      groups: [source],
      settings: {
        ...createState().settings,
        deleteRestoredTabs: true,
      },
    });
    harness.chromeMock.tabs.create.mockResolvedValue(createTab(821, saved.url, {
      id: 821,
      status: 'loading',
      title: saved.url,
      url: saved.url,
    }));
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    await expect(sendMessage(harness.runtimeMessage.getListener(), {
      type: 'restore-tab',
      source: 'group',
      groupId: source.id,
      tabId: saved.id,
    })).resolves.toMatchObject({ ok: true });
    expect(harness.chromeMock.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabboard-title-refresh-activity' }),
    );
  });
});

describe('Task194 runtime sender allowlist', () => {
  it('allows trusted extension senders with missing or own extension URLs', async () => {
    const harness = createChromeHarness(createState());
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const extensionBaseUrl = harness.chromeMock.runtime.getURL('');
    const senderUrls = [
      undefined,
      `${extensionBaseUrl}manager.html`,
      `${extensionBaseUrl}popup.html`,
      `${extensionBaseUrl}options.html`,
      `${extensionBaseUrl}newtab.html`,
    ];

    for (const url of senderUrls) {
      const response = await sendMessage(harness.runtimeMessage.getListener(), {
        type: 'list-open-tabs',
      }, { id: harness.chromeMock.runtime.id, url }) as { ok: boolean; code?: string };
      expect(response).toEqual({ ok: true, result: { windows: expect.any(Array) } });
    }
  });

  it('omits extension pages from open tabs listings', async () => {
    const extensionBaseUrl = `chrome-extension://${TRUSTED_EXTENSION_ID}/`;
    const ownManagerTab = createTab(1, 'TabBoard manager', { url: `${extensionBaseUrl}manager.html` });
    const ownOptionsTab = createTab(2, 'TabBoard options', { url: `${extensionBaseUrl}options.html` });
    const externalTab = createTab(3, 'External page', { url: 'https://external.example/' });
    const otherExtensionTab = createTab(4, 'Other extension', { url: 'chrome-extension://other-extension/options.html' });
    const harness = createChromeHarness(createState(), {
      tabs: [ownManagerTab, ownOptionsTab, externalTab, otherExtensionTab],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'list-open-tabs',
    }) as {
      ok: boolean;
      result: { windows: Array<{ tabCount: number; tabs: Array<{ id?: number; url: string }> }> };
    };

    expect(response.ok).toBe(true);
    expect(response.result.windows[0]).toMatchObject({
      tabCount: 1,
      tabs: [{ id: externalTab.id, url: externalTab.url }],
    });
  });

  it('lists Chrome bookmarks as read-only flattened sessions', async () => {
    const harness = createChromeHarness(createState(), {
      bookmarks: [{
        id: '0',
        title: '',
        children: [{
          id: '10',
          title: '一级文件夹',
          children: [{
            id: '11',
            title: '一级链接',
            url: 'https://one.example/',
          }, {
            id: '12',
            title: '二级文件夹',
            children: [{
              id: '13',
              title: '二级链接',
              url: 'https://two.example/',
            }],
          }],
        }],
      }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'list-bookmarks',
      workspaceId: 'workspace-a',
    }) as {
      ok: boolean;
      result: { groups: Array<{ id: string; title: string; locked: boolean; tabs: Array<{ id: string; url: string }> }> };
    };

    expect(response.ok).toBe(true);
    expect(response.result.groups.map(({ id, title, locked }) => ({ id, title, locked }))).toEqual([{
      id: 'bookmark-folder-10',
      title: '一级文件夹',
      locked: true,
    }, {
      id: 'bookmark-folder-12',
      title: '一级文件夹/二级文件夹',
      locked: true,
    }]);
    expect(response.result.groups.flatMap(({ tabs }) => tabs.map(({ id, url }) => ({ id, url })))).toEqual([{
      id: 'bookmark-11',
      url: 'https://one.example/',
    }, {
      id: 'bookmark-13',
      url: 'https://two.example/',
    }]);
  });

  it.each([
    {
      name: 'same extension id from a web page',
      sender: { id: TRUSTED_EXTENSION_ID, url: 'https://evil.test/content-script.js' },
      message: {
        type: 'tabboard-state-mutations',
        mutations: [],
      },
    },
    {
      name: 'foreign extension',
      sender: { id: 'foreign-extension-id' },
      message: { type: 'close-open-tab', tabId: 1 },
    },
    {
      name: 'empty sender',
      sender: {},
      message: { type: 'tabboard-state-mutations', mutations: [] },
    },
    {
      name: 'missing sender',
      sender: undefined,
      message: { type: 'list-open-tabs' },
    },
    {
      name: 'unknown action',
      sender: { id: 'foreign-extension-id' },
      message: { type: 'unknown-action' },
    },
  ])('rejects $name before side effects', async ({ sender, message }) => {
    const harness = createChromeHarness(createState());
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), message, sender) as {
      ok: boolean;
      code?: string;
    };

    expect(response).toMatchObject({ ok: false, code: 'UNTRUSTED_RUNTIME_SENDER' });
    expect(harness.writes).toHaveLength(0);
    expect(harness.chromeMock.storage.local.get).not.toHaveBeenCalled();
    expect(harness.chromeMock.storage.local.set).not.toHaveBeenCalled();
    expect(harness.chromeMock.tabs.query).not.toHaveBeenCalled();
    expect(harness.chromeMock.tabs.get).not.toHaveBeenCalled();
    expect(harness.chromeMock.tabs.create).not.toHaveBeenCalled();
    expect(harness.chromeMock.tabs.update).not.toHaveBeenCalled();
    expect(harness.chromeMock.tabs.remove).not.toHaveBeenCalled();
    expect(harness.chromeMock.windows.get).not.toHaveBeenCalled();
    expect(harness.chromeMock.windows.getAll).not.toHaveBeenCalled();
    expect(harness.chromeMock.windows.update).not.toHaveBeenCalled();
  });
});

describe('listOpenTabs browser group metadata', () => {
  it('deduplicates same-group lookups while preserving tab order', async () => {
    const first = createTab(20, 'First', { groupId: 7, index: 0 });
    const second = createTab(10, 'Second', { groupId: 7, index: 1 });
    const third = createTab(30, 'Third', { groupId: 3, index: 2 });
    const getTabGroup = vi.fn((groupId: number) => createTabGroup(groupId));
    const harness = createChromeHarness(createState(), {
      tabs: [first, second, third],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [first, second, third] }],
      getTabGroup,
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'list-open-tabs',
    }) as {
      ok: boolean;
      result: { windows: Array<{ tabs: Array<{ id: number; browserGroup: BrowserGroup | null }> }> };
    };

    expect(response.ok).toBe(true);
    expect(response.result.windows[0]?.tabs.map((tab) => tab.id)).toEqual([20, 10, 30]);
    expect(harness.chromeMock.tabGroups.get).toHaveBeenCalledTimes(2);
    expect(harness.chromeMock.tabGroups.get).toHaveBeenNthCalledWith(1, 7);
    expect(harness.chromeMock.tabGroups.get).toHaveBeenNthCalledWith(2, 3);
    expect(response.result.windows[0]?.tabs.slice(0, 2).map((tab) => tab.browserGroup?.sourceGroupId)).toEqual([7, 7]);
  });

  it('starts different-group reads concurrently across windows', async () => {
    const first = createTab(1, 'First', { groupId: 11, windowId: 1 });
    const second = createTab(2, 'Second', { groupId: 22, windowId: 2 });
    const pending = new Map<number, () => void>();
    let activeReads = 0;
    let maxActiveReads = 0;
    const getTabGroup = vi.fn((groupId: number) => new Promise<chrome.tabGroups.TabGroup>((resolve) => {
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      pending.set(groupId, () => {
        activeReads -= 1;
        resolve(createTabGroup(groupId, groupId === 11 ? 1 : 2));
      });
    }));
    const harness = createChromeHarness(createState(), {
      tabs: [first, second],
      windows: [
        { id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [first] },
        { id: 2, type: 'normal', incognito: false, focused: false, alwaysOnTop: false, tabs: [second] },
      ],
      getTabGroup,
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const responsePromise = sendMessage(harness.runtimeMessage.getListener(), {
      type: 'list-open-tabs',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getTabGroup).toHaveBeenCalledTimes(2);
    expect(maxActiveReads).toBe(2);
    pending.get(11)?.();
    pending.get(22)?.();
    const response = await responsePromise as { ok: boolean; result: { windows: Array<{ tabs: Array<{ id: number }> }> } };

    expect(response.ok).toBe(true);
    expect(response.result.windows.map((window) => window.tabs.map((tab) => tab.id))).toEqual([[1], [2]]);
  });

  it('does not query tab groups for ungrouped tabs', async () => {
    const tab = createTab(1, 'Ungrouped');
    const getTabGroup = vi.fn((groupId: number) => createTabGroup(groupId));
    const harness = createChromeHarness(createState(), {
      tabs: [tab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [tab] }],
      getTabGroup,
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'list-open-tabs',
    }) as { ok: boolean; result: { windows: Array<{ tabs: Array<{ browserGroup: BrowserGroup | null }> }> } };

    expect(response.ok).toBe(true);
    expect(harness.chromeMock.tabGroups.get).not.toHaveBeenCalled();
    expect(response.result.windows[0]?.tabs[0]?.browserGroup).toBeNull();
  });

  it('keeps the listing successful when a tab group read rejects', async () => {
    const tab = createTab(1, 'Unavailable group', { groupId: 9 });
    const harness = createChromeHarness(createState(), {
      tabs: [tab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [tab] }],
      getTabGroup: () => Promise.reject(new Error('group unavailable')),
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'list-open-tabs',
    }) as {
      ok: boolean;
      result: { windows: Array<{ tabCount: number; tabs: Array<{ browserGroup: BrowserGroup | null }> }> };
    };

    expect(response.ok).toBe(true);
    expect(response.result.windows[0]).toMatchObject({ tabCount: 1, tabs: [{ browserGroup: null }] });
  });
});

describe('Task198 raw mutation validation', () => {
  it('rejects malformed TabItem payloads without writing storage', async () => {
    const initial = createState();
    initial.groups = [createSavedGroup('trust-worker-target')];
    const harness = createChromeHarness(initial);
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [{
        type: 'add-tab',
        groupId: 'trust-worker-target',
        tab: {
          ...createSavedTab('trust-worker-tab'),
          sourceTabId: '1',
          browserGroup: { sourceGroupId: null, title: 'Browser', color: 'blue', collapsed: false, unexpected: true },
        },
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    }) as { ok: boolean; error?: string };

    expect(response.ok).toBe(false);
    expect(response.error).toContain('Invalid state mutation.');
    expect(harness.writes).toHaveLength(0);
    expect(harness.state.current.mutationRevision).toBe(initial.mutationRevision);
    expect(harness.state.current.groups[0].tabs).toEqual([]);
  });
});

describe('window dedupe', () => {
  it('keeps the active duplicate before older matches', async () => {
    const active = createTab(1, 'Active duplicate', {
      url: 'https://same.example/', active: true, lastAccessed: 1,
    });
    const recent = createTab(2, 'Recent duplicate', {
      url: 'https://same.example/', active: false, lastAccessed: 3,
    });
    const older = createTab(3, 'Older duplicate', {
      url: 'https://same.example/', active: false, lastAccessed: 2,
    });
    const harness = createChromeHarness(createState(), {
      tabs: [active, recent, older],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [active, recent, older] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), { type: 'dedupe-window' }) as {
      ok: boolean;
      result?: { removedTabs: number };
    };

    expect(response).toMatchObject({ ok: true, result: { removedTabs: 2 } });
    expect(harness.chromeMock.tabs.remove).toHaveBeenNthCalledWith(1, 2);
    expect(harness.chromeMock.tabs.remove).toHaveBeenNthCalledWith(2, 3);
  });

  it('counts and removes only non-pinned duplicates when a pinned copy exists', async () => {
    const pinned = createTab(1, 'Pinned copy', {
      url: 'https://same.example/', active: false, pinned: true, lastAccessed: 1,
    });
    const regular = createTab(2, 'Regular copy', {
      url: 'https://same.example/', active: true, pinned: false, lastAccessed: 3,
    });
    const harness = createChromeHarness(createState(), {
      tabs: [pinned, regular],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [pinned, regular] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');
    const listener = harness.runtimeMessage.getListener();

    const count = await sendMessage(listener, { type: 'count-window-duplicates' }) as {
      ok: boolean;
      result?: { duplicateTabCount: number };
    };
    const dedupe = await sendMessage(listener, { type: 'dedupe-window' }) as {
      ok: boolean;
      result?: { removedTabs: number };
    };

    expect(count).toMatchObject({ ok: true, result: { duplicateTabCount: 1 } });
    expect(dedupe).toMatchObject({ ok: true, result: { removedTabs: 1 } });
    expect(harness.chromeMock.tabs.remove).toHaveBeenCalledOnce();
    expect(harness.chromeMock.tabs.remove).toHaveBeenCalledWith(2);
  });

  it('does not count or remove duplicates when every copy is pinned', async () => {
    const first = createTab(1, 'First pinned copy', {
      url: 'https://same.example/', active: true, pinned: true,
    });
    const second = createTab(2, 'Second pinned copy', {
      url: 'https://same.example/', active: false, pinned: true,
    });
    const harness = createChromeHarness(createState(), {
      tabs: [first, second],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [first, second] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');
    const listener = harness.runtimeMessage.getListener();

    const count = await sendMessage(listener, { type: 'count-window-duplicates' }) as {
      ok: boolean;
      result?: { duplicateTabCount: number };
    };
    const dedupe = await sendMessage(listener, { type: 'dedupe-window' }) as {
      ok: boolean;
      result?: { removedTabs: number };
    };

    expect(count).toMatchObject({ ok: true, result: { duplicateTabCount: 0 } });
    expect(dedupe).toMatchObject({ ok: true, result: { removedTabs: 0 } });
    expect(harness.chromeMock.tabs.remove).not.toHaveBeenCalled();
  });
});

describe('Task112 live Open Tabs validation', () => {
  it('lists Chrome favicons within the 4KB boundary unchanged', async () => {
    const favIconUrl = `data:image/png;base64,${'a'.repeat(3_000)}`;
    const tab = createTab(1, 'Known', {
      favIconUrl,
    });
    const harness = createChromeHarness(createState(), {
      tabs: [tab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [tab] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'list-open-tabs',
    }) as {
      ok: boolean;
      result?: { windows: Array<{ tabs: Array<{ favIconUrl: string }> }> };
      error?: string;
    };

    expect(response.ok, response.error).toBe(true);
    expect(response.result?.windows[0]?.tabs[0]?.favIconUrl).toBe(favIconUrl);
  });

  it('uses live Chrome tab fields instead of caller-supplied OpenTabInfo', async () => {
    const liveTab = createTab(1, 'Live title', { url: 'https://live.test/1', windowId: 1 });
    const initial = createState();
    initial.groups = [createSavedGroup()];
    const harness = createChromeHarness(initial, {
      tabs: [liveTab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [liveTab] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [{
        type: 'drop-intent',
        expectedRevision: 0,
        operationId: 'live-copy',
        intent: {
          kind: 'copy-open-tabs',
          tabIds: [1],
          windowId: 1,
          targetGroupId: 'target',
          targetIndex: 0,
          workspaceId: 'workspace-a',
        },
        openTabs: [{
          id: 1,
          windowId: 1,
          title: 'Forged title',
          url: 'https://forged.test',
          favIconUrl: '',
          pinned: false,
          index: 99,
          browserGroup: null,
          storable: true,
          reason: null,
        }],
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    }) as { ok: boolean; error?: string };

    expect(response.ok, response.error).toBe(true);
    expect(harness.state.current.groups[0]?.tabs[0]).toMatchObject({
      title: 'Live title',
      url: 'https://live.test/1',
      sourceTabId: 1,
    });
  });

  it('retries an applied live drop without requiring source tab availability', async () => {
    const liveTab = createTab(1, 'Live title');
    const initial = createState();
    initial.groups = [createSavedGroup()];
    let available = true;
    const harness = createChromeHarness(initial, {
      tabs: [liveTab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [liveTab] }],
      getTab: () => available ? liveTab : undefined,
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');
    const mutation: StateMutation = {
      type: 'drop-intent',
      expectedRevision: 0,
      operationId: 'retryable-live-copy',
      intent: {
        kind: 'copy-open-tabs',
        tabIds: [1],
        windowId: 1,
        targetGroupId: 'target',
        targetIndex: 0,
        workspaceId: 'workspace-a',
      },
      openTabs: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const first = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [mutation],
    }) as { ok: boolean; error?: string };
    expect(first.ok, first.error).toBe(true);
    available = false;

    const second = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [mutation],
    }) as { ok: boolean; error?: string };
    expect(second.ok, second.error).toBe(true);
    expect(harness.state.current.groups[0]?.tabs).toHaveLength(1);
  });

  it('rejects missing or newly non-storable live tabs atomically', async () => {
    const liveTab = createTab(1, 'Pinned live tab', { pinned: true });
    const initial = createState();
    initial.settings = { ...initial.settings, excludePinned: true };
    initial.groups = [createSavedGroup()];
    const harness = createChromeHarness(initial, {
      tabs: [liveTab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [liveTab] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [{
        type: 'drop-intent',
        expectedRevision: 0,
        operationId: 'live-invalid',
        intent: {
          kind: 'create-session',
          source: { kind: 'open-tabs', tabIds: [1, 999], windowId: 1 },
          category: 'inbox',
          index: 0,
          workspaceId: 'workspace-a',
        },
        openTabs: [1, 999].map((id) => ({
          id,
          windowId: 1,
          title: 'Forged',
          url: 'https://forged.test',
          favIconUrl: '',
          pinned: false,
          index: 0,
          browserGroup: null,
          storable: true,
          reason: null,
        })),
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    }) as { ok: boolean; code?: string };

    expect(response).toMatchObject({ ok: false, code: 'INVALID_DROP_INTENT' });
    expect(harness.state.current.groups).toHaveLength(1);
    expect(harness.state.current.groups[0].tabs).toHaveLength(0);
  });

  it('commits valid sibling mutations around an invalid live drop', async () => {
    const initial = createState();
    initial.groups = [createSavedGroup('valid-source'), createSavedGroup('invalid-target')];
    const liveTab = createTab(1, 'Live tab');
    const harness = createChromeHarness(initial, {
      tabs: [liveTab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [liveTab] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [
        {
          type: 'drop-intent',
          expectedRevision: 0,
        operationId: 'valid-before-invalid-live',
          intent: {
            kind: 'move-session',
            groupId: 'valid-source',
            category: 'saved',
            index: 0,
            workspaceId: 'workspace-a',
          },
          openTabs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          type: 'drop-intent',
          expectedRevision: 0,
        operationId: 'invalid-live-drop',
          intent: {
            kind: 'copy-open-tabs',
            tabIds: [999],
            windowId: 1,
            targetGroupId: 'invalid-target',
            targetIndex: 0,
            workspaceId: 'workspace-a',
          },
          openTabs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          type: 'update-settings',
          updates: { theme: 'dark' },
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ] satisfies StateMutation[],
    }) as { ok: boolean; code?: string; invalidMutationIndexes?: number[]; committedMutationIndexes?: number[] };

    expect(response).toMatchObject({
      ok: false,
      code: 'INVALID_DROP_INTENT',
      invalidMutationIndexes: [1],
      committedMutationIndexes: [0, 2],
    });
    expect(harness.state.current.groups.find((group) => group.id === 'valid-source')?.starred).toBe(true);
    expect(harness.state.current.settings.theme).toBe('dark');
    expect(harness.state.current.groups.find((group) => group.id === 'invalid-target')?.tabs).toEqual([]);
  });

  it('rejects ordinary semantic batches atomically and keeps the queue usable', async () => {
    const initial = createState();
    initial.groups = [createSavedGroup('ordinary-worker-target')];
    const harness = createChromeHarness(initial);
    const before = structuredClone(harness.state.current);
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const failed = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [
        { type: 'set-group-flags', id: 'ordinary-worker-target', starred: true, updatedAt: '2026-01-02T00:00:00.000Z' },
        { type: 'update-group', id: 'missing-ordinary-group', updates: { title: 'invalid' }, updatedAt: '2026-01-02T00:00:00.000Z' },
      ],
    }) as { ok: boolean; code?: string };

    expect(failed).toMatchObject({ ok: false, code: 'GROUP_NOT_FOUND' });
    expect(harness.writes).toHaveLength(0);
    expect(harness.state.current).toEqual(before);

    const succeeded = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [{
        type: 'add-folder',
        folder: {
          id: 'ordinary-worker-folder',
          name: 'Folder',
          color: 'slate',
          workspaceId: 'workspace-a',
          collapsed: false,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      }],
    }) as { ok: boolean; error?: string };
    expect(succeeded.ok, succeeded.error).toBe(true);
    expect(harness.writes).toHaveLength(1);
    expect(harness.state.current.folders.map(({ id }) => id)).toContain('ordinary-worker-folder');
  });

  it('returns stable locked and invalid-URL errors without writes, then recovers', async () => {
    const initial = createState();
    initial.groups = [
      createSavedGroup('worker-locked', { locked: true, tabs: [createSavedTab('worker-locked-tab')] }),
      createSavedGroup('worker-unlocked', { tabs: [createSavedTab('worker-link-tab')] }),
    ];
    const before = structuredClone(initial);
    const harness = createChromeHarness(initial);
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const lockedFailure = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [{
        type: 'update-group',
        id: 'worker-locked',
        updates: { title: 'forged update' },
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    }) as { ok: boolean; code?: string };
    expect(lockedFailure).toMatchObject({ ok: false, code: 'GROUP_LOCKED' });
    expect(harness.writes).toHaveLength(0);
    expect(harness.state.current).toEqual(before);

    const urlFailure = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [{
        type: 'update-tab',
        groupId: 'worker-unlocked',
        tabId: 'worker-link-tab',
        updates: { url: '' },
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    }) as { ok: boolean; code?: string };
    expect(urlFailure).toMatchObject({ ok: false, code: 'TAB_URL_INVALID' });
    expect(harness.writes).toHaveLength(0);
    expect(harness.state.current).toEqual(before);

    const succeeded = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [{
        type: 'update-group',
        id: 'worker-unlocked',
        updates: { title: 'accepted update' },
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    }) as { ok: boolean; error?: string };
    expect(succeeded.ok, succeeded.error).toBe(true);
    expect(harness.writes).toHaveLength(1);
    expect(harness.state.current.groups.find((group) => group.id === 'worker-unlocked')?.title).toBe('accepted update');
    expect(harness.state.current.mutationRevision).toBe(before.mutationRevision + 1);
  });

  it('returns structured URL errors for raw worker tabs without writes, then recovers', async () => {
    const initial = createState();
    initial.groups = [createSavedGroup('worker-raw-url-target')];
    const before = structuredClone(initial);
    const harness = createChromeHarness(initial);
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');
    const invalidLink = { ...createSavedTab('worker-raw-empty-link'), url: '' };
    const invalidNote = { ...createSavedTab('worker-raw-nonempty-note'), itemType: 'note' as const, url: 'https://invalid-note.test' };

    for (const mutation of [
      { type: 'add-tab', groupId: 'worker-raw-url-target', tab: invalidLink, updatedAt: '2026-01-01T00:00:00.000Z' },
      { type: 'import-groups', groups: [createSavedGroup('worker-raw-url-group', { tabs: [invalidNote] })], updatedAt: '2026-01-01T00:00:00.000Z' },
      { type: 'set-group-note', groupId: 'worker-raw-url-target', text: 'invalid link note', noteTab: invalidLink, updatedAt: '2026-01-01T00:00:00.000Z' },
      { type: 'set-group-note', groupId: 'worker-raw-url-target', text: 'invalid note url', noteTab: invalidNote, updatedAt: '2026-01-01T00:00:00.000Z' },
    ]) {
      const response = await sendMessage(harness.runtimeMessage.getListener(), {
        type: 'tabboard-state-mutations', mutations: [mutation],
      }) as { ok: boolean; code?: string };
      expect(response).toMatchObject({ ok: false, code: 'TAB_URL_INVALID' });
      expect(harness.writes).toHaveLength(0);
      expect(harness.state.current).toEqual(before);
    }

    const succeeded = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [{ type: 'update-group', id: 'worker-raw-url-target', updates: { title: 'recovered' }, updatedAt: '2026-01-01T00:00:00.000Z' }],
    }) as { ok: boolean; error?: string };
    expect(succeeded.ok, succeeded.error).toBe(true);
    expect(harness.writes).toHaveLength(1);
  });

  it('rejects worker move-session placement changes to locked siblings', async () => {
    const initial = createState();
    initial.groups = [createSavedGroup('worker-placement-moving'), createSavedGroup('worker-placement-locked', { locked: true })];
    const harness = createChromeHarness(initial);
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [{
        type: 'drop-intent',
        expectedRevision: 0,
        operationId: 'worker-placement-locked-sibling',
        intent: { kind: 'move-session', groupId: 'worker-placement-moving', category: 'inbox', index: 1, workspaceId: 'workspace-a' },
        openTabs: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    }) as { ok: boolean; code?: string };
    expect(response).toMatchObject({ ok: false, code: 'INVALID_DROP_INTENT' });
    expect(harness.writes).toHaveLength(0);
    expect(harness.state.current.groups.map(({ id }) => id)).toEqual(initial.groups.map(({ id }) => id));
  });

  it('rebases valid worker drops after raw malformed gaps by original index', async () => {
    const initial = createState();
    initial.mutationRevision = 7;
    initial.groups = [createSavedGroup('worker-raw-gap')];
    const harness = createChromeHarness(initial);
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [
        { type: 'drop-intent', intent: null },
        {
          type: 'drop-intent',
          expectedRevision: 8,
          operationId: 'worker-raw-gap-valid',
          intent: {
            kind: 'move-session',
            groupId: 'worker-raw-gap',
            category: 'saved',
            index: 0,
            workspaceId: 'workspace-a',
          },
          openTabs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }) as { ok: boolean; code?: string; invalidMutationIndexes?: number[]; committedMutationIndexes?: number[] };

    expect(response).toMatchObject({
      ok: false,
      code: 'INVALID_DROP_INTENT',
      invalidMutationIndexes: [0],
      committedMutationIndexes: [1],
    });
    expect(harness.state.current.mutationRevision).toBe(8);
    expect(harness.state.current.groups[0].starred).toBe(true);
  });

  it('does not rebase worker drops before later raw malformed gaps', async () => {
    const initial = createState();
    initial.mutationRevision = 7;
    initial.groups = [createSavedGroup('worker-raw-order')];
    const harness = createChromeHarness(initial);
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [
        {
          type: 'drop-intent',
          expectedRevision: 7,
          operationId: 'worker-raw-order-valid',
          intent: {
            kind: 'move-session',
            groupId: 'worker-raw-order',
            category: 'saved',
            index: 0,
            workspaceId: 'workspace-a',
          },
          openTabs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        { type: 'drop-intent', intent: null },
      ],
    }) as { ok: boolean; code?: string; invalidMutationIndexes?: number[]; committedMutationIndexes?: number[] };

    expect(response).toMatchObject({
      ok: false,
      code: 'INVALID_DROP_INTENT',
      invalidMutationIndexes: [1],
      committedMutationIndexes: [0],
    });
    expect(harness.state.current.mutationRevision).toBe(8);
    expect(harness.state.current.groups[0].starred).toBe(true);
  });

  it('rejects a live drop when the requested tab moved windows', async () => {
    const requested = createTab(1, 'Moved', { windowId: 1 });
    const initial = createState();
    initial.groups = [createSavedGroup()];
    const harness = createChromeHarness(initial, {
      tabs: [requested],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [requested] }],
      getTab: () => ({ ...requested, windowId: 2 }),
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [{
        type: 'drop-intent',
        expectedRevision: 0,
        operationId: 'live-window-changed',
        intent: {
          kind: 'copy-open-tabs',
          tabIds: [1],
          windowId: 1,
          targetGroupId: 'target',
          targetIndex: 0,
          workspaceId: 'workspace-a',
        },
        openTabs: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    }) as { ok: boolean; code?: string };

    expect(response).toMatchObject({ ok: false, code: 'INVALID_DROP_INTENT' });
    expect(harness.state.current.groups[0].tabs).toEqual([]);
  });

  it('rejects create-session(open-tabs) with an incognito tab atomically and preserves valid siblings', async () => {
    const normalTab = createTab(1, 'Normal');
    const incognitoTab = createTab(2, 'Incognito', { incognito: true });
    const initial = createState();
    initial.groups = [createSavedGroup('valid-source')];
    const harness = createChromeHarness(initial, {
      tabs: [normalTab, incognitoTab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [normalTab, incognitoTab] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [
        {
          type: 'drop-intent',
          expectedRevision: 0,
          operationId: 'valid-before-incognito-create',
          intent: {
            kind: 'move-session',
            groupId: 'valid-source',
            category: 'saved',
            index: 0,
            workspaceId: 'workspace-a',
          },
          openTabs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          type: 'drop-intent',
          expectedRevision: 0,
          operationId: 'incognito-create-session',
          intent: {
            kind: 'create-session',
            source: { kind: 'open-tabs', tabIds: [1, 2], windowId: 1 },
            category: 'inbox',
            index: 0,
            workspaceId: 'workspace-a',
          },
          openTabs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          type: 'update-settings',
          updates: { theme: 'dark' },
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ] satisfies StateMutation[],
    }) as {
      ok: boolean;
      code?: string;
      invalidMutationIndexes?: number[];
      committedMutationIndexes?: number[];
    };

    expect(response).toMatchObject({
      ok: false,
      code: 'INVALID_DROP_INTENT',
      invalidMutationIndexes: [1],
      committedMutationIndexes: [0, 2],
    });
    expect(harness.state.current.groups).toHaveLength(1);
    expect(harness.state.current.groups[0]?.starred).toBe(true);
    expect(harness.state.current.groups[0]?.tabs).toEqual([]);
    expect(harness.state.current.settings.theme).toBe('dark');
  });

  it.each([
    ['incognito', { type: 'normal' as const, incognito: true }],
    ['non-normal', { type: 'popup' as const, incognito: false }],
  ])('rejects create-session(open-tabs) from a %s source window', async (_label, windowOptions) => {
    const normalTab = createTab(1, 'Normal');
    const initial = createState();
    const harness = createChromeHarness(initial, {
      tabs: [normalTab],
      windows: [{
        id: 1,
        type: windowOptions.type,
        incognito: windowOptions.incognito,
        focused: true,
        alwaysOnTop: false,
        tabs: [normalTab],
      }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [{
        type: 'drop-intent',
        expectedRevision: 0,
        operationId: `invalid-${_label}-create-session`,
        intent: {
          kind: 'create-session',
          source: { kind: 'open-tabs', tabIds: [1], windowId: 1 },
          category: 'inbox',
          index: 0,
          workspaceId: 'workspace-a',
        },
        openTabs: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    }) as {
      ok: boolean;
      code?: string;
      invalidMutationIndexes?: number[];
      committedMutationIndexes?: number[];
    };

    expect(response).toMatchObject({
      ok: false,
      code: 'INVALID_DROP_INTENT',
      invalidMutationIndexes: [0],
      committedMutationIndexes: [],
    });
    expect(harness.state.current.groups).toEqual([]);
  });

  it('uses updated settings when verifying a later open-tabs drop', async () => {
    const pinnedTab = createTab(1, 'Pinned', { pinned: true });
    const initial = createState();
    initial.settings = { ...initial.settings, excludePinned: true };
    const harness = createChromeHarness(initial, {
      tabs: [pinnedTab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [pinnedTab] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [
        { type: 'update-settings', updates: { excludePinned: false }, updatedAt: '2026-01-01T00:00:00.000Z' },
        {
          type: 'drop-intent',
          expectedRevision: 1,
          operationId: 'settings-before-open-tabs',
          intent: {
            kind: 'create-session',
            source: { kind: 'open-tabs', tabIds: [1], windowId: 1 },
            category: 'inbox',
            index: 0,
            workspaceId: 'workspace-a',
          },
          openTabs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ] satisfies StateMutation[],
    }) as { ok: boolean; error?: string };

    expect(response.ok, response.error).toBe(true);
    expect(harness.state.current.settings.excludePinned).toBe(false);
    expect(harness.state.current.groups[0]?.tabs).toHaveLength(1);
  });

  it('uses an unlocked working target for a later open-tabs drop', async () => {
    const initial = createState();
    initial.groups = [createSavedGroup('locked-target', { locked: true })];
    const liveTab = createTab(1, 'Open tab');
    const harness = createChromeHarness(initial, {
      tabs: [liveTab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [liveTab] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [
        { type: 'set-group-flags', id: 'locked-target', locked: false, updatedAt: '2026-01-01T00:00:00.000Z' },
        {
          type: 'drop-intent',
          expectedRevision: 1,
          operationId: 'unlock-before-open-tabs',
          intent: {
            kind: 'copy-open-tabs',
            tabIds: [1],
            windowId: 1,
            targetGroupId: 'locked-target',
            targetIndex: 0,
            workspaceId: 'workspace-a',
          },
          openTabs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ] satisfies StateMutation[],
    }) as { ok: boolean; error?: string };

    expect(response.ok, response.error).toBe(true);
    expect(harness.state.current.groups[0]?.locked).toBe(false);
    expect(harness.state.current.groups[0]?.tabs).toHaveLength(1);
  });

  it('does not advance working state after an invalid preceding drop', async () => {
    const initial = createState();
    initial.groups = [createSavedGroup('locked-target', { locked: true })];
    const liveTab = createTab(1, 'Open tab');
    const harness = createChromeHarness(initial, {
      tabs: [liveTab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [liveTab] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [
        { type: 'set-group-flags', id: 'locked-target', locked: false, updatedAt: '2026-01-01T00:00:00.000Z' },
        {
          type: 'drop-intent',
          expectedRevision: 1,
          operationId: 'invalid-before-valid-open-tabs',
          intent: {
            kind: 'copy-open-tabs',
            tabIds: [999],
            windowId: 1,
            targetGroupId: 'locked-target',
            targetIndex: 0,
            workspaceId: 'workspace-a',
          },
          openTabs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          type: 'drop-intent',
          expectedRevision: 1,
          operationId: 'valid-after-invalid-open-tabs',
          intent: {
            kind: 'copy-open-tabs',
            tabIds: [1],
            windowId: 1,
            targetGroupId: 'locked-target',
            targetIndex: 0,
            workspaceId: 'workspace-a',
          },
          openTabs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ] satisfies StateMutation[],
    }) as {
      ok: boolean;
      code?: string;
      invalidMutationIndexes?: number[];
      committedMutationIndexes?: number[];
    };

    expect(response).toMatchObject({
      ok: false,
      code: 'INVALID_DROP_INTENT',
      invalidMutationIndexes: [1],
      committedMutationIndexes: [0, 2],
    });
    expect(harness.state.current.groups[0]?.locked).toBe(false);
    expect(harness.state.current.groups[0]?.tabs).toHaveLength(1);
  });

  it('rebases a saved sibling after an unavailable live drop in one worker batch', async () => {
    const initial = createState();
    initial.groups = [createSavedGroup('valid-source'), createSavedGroup('valid-target')];
    const harness = createChromeHarness(initial);
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [
        {
          type: 'drop-intent',
          expectedRevision: 0,
          operationId: 'unavailable-live-before-saved',
          intent: {
            kind: 'copy-open-tabs',
            tabIds: [999],
            windowId: 1,
            targetGroupId: 'valid-target',
            targetIndex: 0,
            workspaceId: 'workspace-a',
          },
          openTabs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          type: 'drop-intent',
          expectedRevision: 1,
          operationId: 'saved-after-unavailable-live',
          intent: {
            kind: 'move-session',
            groupId: 'valid-source',
            category: 'saved',
            index: 0,
            workspaceId: 'workspace-a',
          },
          openTabs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ] satisfies StateMutation[],
    }) as {
      ok: boolean;
      code?: string;
      invalidMutationIndexes?: number[];
      committedMutationIndexes?: number[];
    };

    expect(response).toMatchObject({
      ok: false,
      code: 'INVALID_DROP_INTENT',
      invalidMutationIndexes: [0],
      committedMutationIndexes: [1],
    });
    expect(harness.state.current.groups.find((group) => group.id === 'valid-source')?.starred).toBe(true);
  });

  it('rejects incognito windows and tabs at copy-open-tabs live drop verification boundary', async () => {
    const incognitoTab = createTab(1, 'Incognito', { incognito: true });
    const initial = createState();
    initial.groups = [createSavedGroup()];
    const harness = createChromeHarness(initial, {
      tabs: [incognitoTab],
      windows: [{ id: 1, type: 'normal', incognito: true, focused: true, alwaysOnTop: false, tabs: [incognitoTab] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [{
        type: 'drop-intent',
        expectedRevision: 0,
        operationId: 'incognito-copy',
        intent: {
          kind: 'copy-open-tabs',
          tabIds: [1],
          windowId: 1,
          targetGroupId: 'target',
          targetIndex: 0,
          workspaceId: 'workspace-a',
        },
        openTabs: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    }) as { ok: boolean; code?: string };

    expect(response).toMatchObject({ ok: false, code: 'INVALID_DROP_INTENT' });
    expect(harness.state.current.groups[0].tabs).toEqual([]);
  });

  it('enforces locked drop sources and targets at the worker boundary', async () => {
    const initial = createState();
    initial.groups = [
      createSavedGroup('locked-session', { locked: true }),
      createSavedGroup('locked-source', { locked: true, tabs: [createSavedTab('move-source-tab')] }),
      createSavedGroup('move-target'),
      createSavedGroup('locked-target', { locked: true }),
      createSavedGroup('create-source', { locked: true, tabs: [createSavedTab('create-source-tab')] }),
      createSavedGroup('copy-target', { locked: true }),
    ];
    const liveTab = createTab(1, 'Open tab');
    const harness = createChromeHarness(initial, {
      tabs: [liveTab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [liveTab] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'tabboard-state-mutations',
      mutations: [
        {
          type: 'drop-intent',
          expectedRevision: 0,
        operationId: 'locked-session-operation',
          intent: { kind: 'move-session', groupId: 'locked-session', category: 'saved', index: 0, workspaceId: 'workspace-a' },
          openTabs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          type: 'drop-intent',
          expectedRevision: 0,
        operationId: 'locked-source-operation',
          intent: { kind: 'move-tabs', refs: [{ groupId: 'locked-source', tabId: 'move-source-tab' }], targetGroupId: 'move-target', targetIndex: 0, workspaceId: 'workspace-a' },
          openTabs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          type: 'drop-intent',
          expectedRevision: 0,
        operationId: 'locked-target-operation',
          intent: { kind: 'move-tabs', refs: [{ groupId: 'move-target', tabId: 'missing-tab' }], targetGroupId: 'locked-target', targetIndex: 0, workspaceId: 'workspace-a' },
          openTabs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          type: 'drop-intent',
          expectedRevision: 0,
        operationId: 'locked-copy-operation',
          intent: { kind: 'copy-open-tabs', tabIds: [1], windowId: 1, targetGroupId: 'copy-target', targetIndex: 0, workspaceId: 'workspace-a' },
          openTabs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          type: 'drop-intent',
          expectedRevision: 0,
        operationId: 'locked-create-operation',
          intent: { kind: 'create-session', source: { kind: 'saved-tabs', refs: [{ groupId: 'create-source', tabId: 'create-source-tab' }] }, category: 'inbox', index: 0, workspaceId: 'workspace-a' },
          openTabs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ] satisfies StateMutation[],
    }) as { ok: boolean; code?: string; invalidMutationIndexes?: number[] };

    expect(response).toMatchObject({
      ok: false,
      code: 'INVALID_DROP_INTENT',
      invalidMutationIndexes: [0, 1, 2, 3, 4],
    });
    expect(harness.state.current.groups).toHaveLength(6);
  });
});

describe('Task107 selected capture boundary', () => {
  it('ignores selected and focused incognito windows during normal-window fallback', async () => {
    const normalTab = createTab(1, 'Normal', { windowId: 1, active: true });
    const selectedIncognitoTab = createTab(2, 'Selected incognito', { windowId: 2, active: false, incognito: true });
    const focusedIncognitoTab = createTab(3, 'Focused incognito', { windowId: 3, active: false, incognito: true });
    const harness = createChromeHarness(createState(), {
      tabs: [normalTab, selectedIncognitoTab, focusedIncognitoTab],
      windows: [
        { id: 2, type: 'normal', incognito: true, focused: false, alwaysOnTop: false, tabs: [selectedIncognitoTab] },
        { id: 3, type: 'normal', incognito: true, focused: true, alwaysOnTop: false, tabs: [focusedIncognitoTab] },
        { id: 1, type: 'normal', incognito: false, focused: false, alwaysOnTop: false, tabs: [normalTab] },
      ],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');
    const listener = harness.runtimeMessage.getListener();

    const selectedIncognitoResponse = await sendMessage(listener, {
      type: 'saveSelectedTabs',
      selectedWindowId: 2,
      tabIds: [1],
    }) as {
      ok: boolean;
      result?: {
        storedTabs: number;
        storedGroups: number;
        cleanedDuplicates: number;
        createdGroupIds: string[];
      };
      error?: string;
    };
    const focusedIncognitoResponse = await sendMessage(listener, {
      type: 'saveSelectedTabs',
      selectedWindowId: 999,
      tabIds: [1],
    }) as { ok: boolean; result?: { storedTabs: number }; error?: string };

    expect(selectedIncognitoResponse.ok, selectedIncognitoResponse.error).toBe(true);
    expect(selectedIncognitoResponse).toMatchObject({
      result: {
        storedTabs: 1,
        storedGroups: 1,
        cleanedDuplicates: 0,
        createdGroupIds: expect.any(Array),
      },
    });
    expect(focusedIncognitoResponse.ok, focusedIncognitoResponse.error).toBe(true);
    expect(focusedIncognitoResponse).toMatchObject({ result: { storedTabs: 1 } });
    expect(harness.state.current.groups[0]?.tabs[0]?.sourceWindowId).toBe(1);
  });

  it('rejects mixed-window requested IDs instead of silently filtering them', async () => {
    const firstWindowTab = createTab(1, 'First window', { windowId: 1, active: true });
    const secondWindowTab = createTab(2, 'Second window', { windowId: 2, active: false });
    const harness = createChromeHarness(createState(), {
      tabs: [firstWindowTab, secondWindowTab],
      windows: [
        { id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [firstWindowTab] },
        { id: 2, type: 'normal', incognito: false, focused: false, alwaysOnTop: false, tabs: [secondWindowTab] },
      ],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'saveSelectedTabs',
      selectedWindowId: 1,
      tabIds: [1, 2],
    }) as { ok: boolean; error?: string };

    expect(response.ok).toBe(false);
    expect(response.error).toContain('2');
    expect(harness.state.current.groups).toHaveLength(0);
  });

  it('rejects an empty selected tab list', async () => {
    const tab = createTab(1, 'Known', { windowId: 1, active: true });
    const harness = createChromeHarness(createState(), {
      tabs: [tab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [tab] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'saveSelectedTabs',
      selectedWindowId: 1,
      tabIds: [],
    }) as { ok: boolean; error?: string };

    expect(response.ok).toBe(false);
    expect(response.error).toContain('non-empty');
    expect(harness.state.current.groups).toHaveLength(0);
  });

  it('rejects a selected workspace that no longer exists', async () => {
    const tab = createTab(1, 'Known', { windowId: 1, active: true });
    const harness = createChromeHarness(createState(), {
      tabs: [tab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [tab] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'saveSelectedTabs',
      selectedWindowId: 1,
      tabIds: [1],
      workspaceId: 'workspace-deleted',
    }) as { ok: boolean; error?: string };

    expect(response.ok).toBe(false);
    expect(response.error).toContain('workspace');
    expect(harness.state.current.groups).toHaveLength(0);
  });

  it('rejects unknown and non-storable requested IDs', async () => {
    const unknownTab = createTab(1, 'Known', { windowId: 1, active: true });
    const firstHarness = createChromeHarness(createState(), {
      tabs: [unknownTab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [unknownTab] }],
    });
    vi.stubGlobal('chrome', firstHarness.chromeMock);
    await import('./service-worker');

    const unknownResponse = await sendMessage(firstHarness.runtimeMessage.getListener(), {
      type: 'saveSelectedTabs',
      selectedWindowId: 1,
      tabIds: [999],
    }) as { ok: boolean; error?: string };
    expect(unknownResponse.ok).toBe(false);
    expect(unknownResponse.error).toContain('999');

    vi.resetModules();
    const pinnedTab = createTab(2, 'Pinned', { windowId: 1, active: true, pinned: true });
    const pinnedState = createState();
    pinnedState.settings = { ...pinnedState.settings, excludePinned: true };
    const secondHarness = createChromeHarness(pinnedState, {
      tabs: [pinnedTab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [pinnedTab] }],
    });
    vi.stubGlobal('chrome', secondHarness.chromeMock);
    await import('./service-worker');

    const pinnedResponse = await sendMessage(secondHarness.runtimeMessage.getListener(), {
      type: 'saveSelectedTabs',
      selectedWindowId: 1,
      tabIds: [2],
    }) as { ok: boolean; error?: string };
    expect(pinnedResponse.ok).toBe(true);
  });
});

describe('Task107 capture request validation', () => {
  it('saves Chrome favicons within the 4KB boundary unchanged', async () => {
    const favIconUrl = `data:image/png;base64,${'a'.repeat(3_000)}`;
    const tab = createTab(1, 'Known', {
      favIconUrl,
      windowId: 1,
      active: true,
    });
    const state = createState();
    state.settings = { ...state.settings, closeTabsAfterSave: false, openManagerAfterSave: false };
    const harness = createChromeHarness(state, {
      tabs: [tab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [tab] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'saveSelectedTabs',
      selectedWindowId: 1,
      tabIds: [1],
    }) as { ok: boolean; result?: { storedTabs: number }; error?: string };

    expect(response.ok, response.error).toBe(true);
    expect(response).toMatchObject({ result: { storedTabs: 1 } });
    expect(harness.state.current.groups[0]?.tabs[0]?.favIconUrl).toBe(favIconUrl);
  });

  it('rejects unknown and malformed capture modes without falling back to current-window', async () => {
    const harness = createChromeHarness(createState());
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');
    const listener = harness.runtimeMessage.getListener();

    const responses = await Promise.all([
      sendMessage(listener, { type: 'capture', mode: 'invalid-mode' }),
      sendMessage(listener, { type: 'capture' }),
      sendMessage(listener, { type: 'capture', mode: 'tab-id' }),
      sendMessage(listener, { type: 'capture', mode: 'tab-ids', tabIds: 'not-an-array' }),
      sendMessage(listener, { type: 'capture', mode: 'window-id' }),
    ]) as Array<{ ok: boolean; error?: string }>;

    expect(responses.every((response) => response.ok === false)).toBe(true);
    expect(responses.map((response) => response.error).join(' ')).toContain('capture');
    expect(harness.state.current.groups).toHaveLength(0);
  });

  it('captures validated selected snapshots without rereading IDs for a partial result', async () => {
    const firstTab = createTab(1, 'First', { windowId: 1, active: true });
    const secondTab = createTab(2, 'Second', { windowId: 1, active: false });
    let getCalls = 0;
    const state = createState();
    state.settings = { ...state.settings, closeTabsAfterSave: false, openManagerAfterSave: false };
    const harness = createChromeHarness(state, {
      tabs: [firstTab, secondTab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [firstTab, secondTab] }],
      getTab: (tabId) => {
        getCalls += 1;
        if (getCalls > 2 && tabId === 1) return undefined;
        return tabId === 1 ? firstTab : secondTab;
      },
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'saveSelectedTabs',
      selectedWindowId: 1,
      tabIds: [1, 2],
    }) as { ok: boolean; result?: { storedTabs: number } };

    expect(response).toMatchObject({ ok: true, result: { storedTabs: 2 } });
    expect(getCalls).toBe(2);
  });

  it('does not close tabs whose URL or window changed after capture', async () => {
    const firstTab = createTab(1, 'First', { windowId: 1, active: true });
    const secondTab = createTab(2, 'Second', { windowId: 1, active: false });
    const thirdTab = createTab(3, 'Third', { windowId: 1, active: false });
    let getCalls = 0;
    const state = createState();
    state.settings = { ...state.settings, closeTabsAfterSave: true, openManagerAfterSave: false };
    const harness = createChromeHarness(state, {
      tabs: [firstTab, secondTab, thirdTab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [firstTab, secondTab, thirdTab] }],
      getTab: (tabId) => {
        getCalls += 1;
        if (getCalls <= 3) return tabId === 1 ? firstTab : tabId === 2 ? secondTab : thirdTab;
        if (tabId === 1) return { ...firstTab, url: 'https://changed.example/1' };
        if (tabId === 2) return { ...secondTab, windowId: 2 };
        return thirdTab;
      },
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'saveSelectedTabs',
      selectedWindowId: 1,
      tabIds: [1, 2, 3],
    }) as { ok: boolean; result?: { storedTabs: number } };

    expect(response).toMatchObject({ ok: true, result: { storedTabs: 3 } });
    expect(harness.chromeMock.tabs.remove).toHaveBeenCalledTimes(1);
    expect(harness.chromeMock.tabs.remove).toHaveBeenCalledWith(3);
  });

  it('stores pinned tabs but never closes them after capture', async () => {
    const pinned = createTab(1, 'Pinned', {
      windowId: 1,
      active: true,
      pinned: true,
    });
    const regular = createTab(2, 'Regular', {
      windowId: 1,
      active: false,
      pinned: false,
    });
    const state = createState();
    state.settings = {
      ...state.settings,
      closeTabsAfterSave: true,
      openManagerAfterSave: false,
    };
    const harness = createChromeHarness(state, {
      tabs: [pinned, regular],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [pinned, regular] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'saveSelectedTabs',
      selectedWindowId: 1,
      tabIds: [1, 2],
    }) as { ok: boolean; result?: { storedTabs: number } };

    expect(response).toMatchObject({ ok: true, result: { storedTabs: 2 } });
    expect(harness.chromeMock.tabs.remove).toHaveBeenCalledOnce();
    expect(harness.chromeMock.tabs.remove).toHaveBeenCalledWith(2);
  });

  it('does not close a tab while its pending URL changes', async () => {
    const tab = createTab(1, 'Loaded', { windowId: 1, active: true });
    let getCalls = 0;
    const state = createState();
    state.settings = { ...state.settings, closeTabsAfterSave: true, openManagerAfterSave: false };
    const harness = createChromeHarness(state, {
      tabs: [tab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [tab] }],
      getTab: (tabId) => {
        getCalls += 1;
        if (getCalls === 1) return tab;
        return { ...tab, pendingUrl: 'https://example.test/transient' };
      },
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'saveSelectedTabs',
      selectedWindowId: 1,
      tabIds: [1],
    }) as { ok: boolean; result?: { storedTabs: number } };

    expect(response).toMatchObject({ ok: true, result: { storedTabs: 1 } });
    expect(harness.chromeMock.tabs.remove).not.toHaveBeenCalled();
  });

  it('rejects focusing a stale tab row after it moves windows', async () => {
    const row = createTab(1, 'Moved', { windowId: 1, active: true });
    const harness = createChromeHarness(createState(), {
      tabs: [row],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [row] }],
      getTab: () => ({ ...row, windowId: 2 }),
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'focus-open-tab',
      tabId: 1,
      windowId: 1,
    }) as { ok: boolean; error?: string };

    expect(response.ok).toBe(false);
    expect(response.error).toContain('window');
    expect(harness.chromeMock.tabs.update).not.toHaveBeenCalled();
    expect(harness.chromeMock.windows.update).not.toHaveBeenCalled();
  });

  it('pins a valid open tab', async () => {
    const tab = createTab(1, 'Pin me', { windowId: 1, active: true });
    const harness = createChromeHarness(createState(), {
      tabs: [tab],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [tab] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const response = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'pin-open-tab',
      tabId: 1,
    }) as { ok: boolean; result?: { tabId: number; pinned: boolean } };

    expect(response).toEqual({ ok: true, result: { tabId: 1, pinned: true } });
    expect(harness.chromeMock.tabs.update).toHaveBeenCalledWith(1, { pinned: true });
  });

  it('pins and closes selected open tabs in batches', async () => {
    const first = createTab(1, 'First', { windowId: 1, active: true });
    const second = createTab(2, 'Second', { windowId: 1 });
    const harness = createChromeHarness(createState(), {
      tabs: [first, second],
      windows: [{ id: 1, type: 'normal', incognito: false, focused: true, alwaysOnTop: false, tabs: [first, second] }],
    });
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const pinResponse = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'pin-open-tabs',
      tabIds: [1, 2],
    }) as { ok: boolean; result?: { tabIds: number[]; pinned: boolean } };
    const closeResponse = await sendMessage(harness.runtimeMessage.getListener(), {
      type: 'close-open-tabs',
      tabIds: [1, 2],
    }) as { ok: boolean; result?: { tabIds: number[] } };

    expect(pinResponse).toEqual({ ok: true, result: { tabIds: [1, 2], pinned: true } });
    expect(closeResponse).toEqual({ ok: true, result: { tabIds: [1, 2] } });
    expect(harness.chromeMock.tabs.update).toHaveBeenCalledWith(1, { pinned: true });
    expect(harness.chromeMock.tabs.update).toHaveBeenCalledWith(2, { pinned: true });
    expect(harness.chromeMock.tabs.remove).toHaveBeenCalledWith([1, 2]);
  });
});

describe('service worker capture arbitration', () => {
  it('queues install initialization behind an in-flight capture', async () => {
    const state = createState();
    state.settings = { ...state.settings, closeTabsAfterSave: false, openManagerAfterSave: false };
    const harness = createChromeHarness(state);
    harness.chromeMock.storage.local.get.mockImplementation(async () => ({
      tabboardState: (harness.writes.length ? structuredClone(harness.state.current) : null) as unknown as TabBoardState,
    }));
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const actionListener = harness.action.getListener();
    const installListener = harness.chromeMock.runtime.onInstalled.getListener();
    if (!actionListener || !installListener) {
      throw new Error('Expected action and install listeners were not registered.');
    }

    const capture = actionListener(harness.tabs[0]);
    const install = installListener({ reason: 'update' });
    await Promise.all([capture, install]);

    expect(harness.writes[0]?.groups).toHaveLength(1);
    expect(harness.state.current.groups).toHaveLength(1);
  });

  it('queues toolbar, context-menu, and tab-id captures behind workspace mutations', async () => {
    const harness = createChromeHarness(createState());
    vi.stubGlobal('chrome', harness.chromeMock);
    await import('./service-worker');

    const actionListener = harness.action.getListener();
    const contextListener = harness.contextMenus.getListener();
    const messageListener = harness.runtimeMessage.getListener();
    if (!actionListener || !contextListener || !messageListener) {
      throw new Error('Expected service worker listeners were not registered.');
    }

    const firstSwitch = switchWorkspace(harness.runtimeMessage, 'workspace-b');
    const toolbarCapture = actionListener(harness.tabs[0]);
    await Promise.all([firstSwitch, toolbarCapture]);
    expect(harness.state.current.activeWorkspaceId).toBe('workspace-b');
    expect(harness.state.current.groups[0]?.workspaceId).toBe('workspace-b');

    const secondSwitch = switchWorkspace(harness.runtimeMessage, 'workspace-a');
    const contextCapture = contextListener({ menuItemId: 'store-current-tab' }, harness.tabs[0]);
    await Promise.all([secondSwitch, contextCapture]);
    expect(harness.state.current.activeWorkspaceId).toBe('workspace-a');
    expect(harness.state.current.groups[0]?.workspaceId).toBe('workspace-a');

    const thirdSwitch = switchWorkspace(harness.runtimeMessage, 'workspace-b');
    const selectedCapture = sendMessage(messageListener, {
      type: 'saveSelectedTabs',
      tabIds: [harness.tabs[1].id],
    });
    await Promise.all([thirdSwitch, selectedCapture]);
    expect(harness.state.current.activeWorkspaceId).toBe('workspace-b');
    expect(harness.state.current.groups[0]?.workspaceId).toBe('workspace-b');
  });
});
