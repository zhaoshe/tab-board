import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyState, type BrowserGroup, type Group, type TabBoardState } from '../shared/model';
import type { StateMutation } from '../shared/store/stateMutations';

const TRUSTED_EXTENSION_ID = 'test-extension-id';

interface EventHarness {
  addListener: ReturnType<typeof vi.fn>;
  getListener: () => ((...args: unknown[]) => unknown) | undefined;
}

function createEvent(): EventHarness {
  let listener: ((...args: unknown[]) => unknown) | undefined;
  return {
    addListener: vi.fn((next: (...args: unknown[]) => unknown) => {
      listener = next;
    }),
    getListener: () => listener,
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
      { id: 'workspace-a', name: 'A', createdAt: state.createdAt, updatedAt: state.updatedAt },
      { id: 'workspace-b', name: 'B', createdAt: state.createdAt, updatedAt: state.updatedAt },
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
  getTab?: (tabId: number) => chrome.tabs.Tab | undefined | Promise<chrome.tabs.Tab | undefined>;
  getTabGroup?: (groupId: number) => chrome.tabGroups.TabGroup | Promise<chrome.tabGroups.TabGroup>;
}

function createChromeHarness(initialState: TabBoardState, options: ChromeHarnessOptions = {}) {
  const action = createEvent();
  const commands = createEvent();
  const contextMenus = createEvent();
  const runtimeMessage = createEvent();
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
      onStartup: createEvent(),
      onMessage: runtimeMessage,
      openOptionsPage: vi.fn(),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({ tabboardState: structuredClone(state.current) })),
        set: vi.fn(async (value: { tabboardState: TabBoardState }) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          const nextState = structuredClone(value.tabboardState);
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
    },
    windows: {
      get: vi.fn(async (windowId: number) => openWindows.find((window) => window.id === windowId)),
      getAll: vi.fn(async () => openWindows),
      update: vi.fn(async () => undefined),
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
  };

  return { action, contextMenus, runtimeMessage, state, tabs, writes, chromeMock };
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

  it('omits this extension own pages from open tabs listings', async () => {
    const extensionBaseUrl = `chrome-extension://${TRUSTED_EXTENSION_ID}/`;
    const ownManagerTab = createTab(1, 'TabBoard manager', { url: `${extensionBaseUrl}manager.html` });
    const ownOptionsTab = createTab(2, 'TabBoard options', { url: `${extensionBaseUrl}options.html` });
    const externalTab = createTab(3, 'External page', { url: 'https://external.example/' });
    const harness = createChromeHarness(createState(), {
      tabs: [ownManagerTab, ownOptionsTab, externalTab],
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
});

describe('Task112 live Open Tabs validation', () => {
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
          active: false,
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
          active: false,
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
