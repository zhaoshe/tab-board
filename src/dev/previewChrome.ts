import {
  STATE_KEY,
  createEmptyState,
  createFolder,
  createGroupFromTabRecords,
  createNoteRecord,
  nowIso,
  createTabRecord,
  normalizeState,
  clone,
} from '../shared/model';
import type { BrowserGroup, Group, TabBoardState, TabItem } from '../shared/model';
import { getCaptureCandidateReason, matchesCustomUrlFilter } from '../shared/model/capture-policy';
import { applyStateMutations } from '../shared/store/stateMutations';

export type PreviewTab = chrome.tabs.Tab & {
  id: number;
  windowId: number;
  index: number;
};

export type PreviewWindow = chrome.windows.Window & {
  id: number;
  tabs?: PreviewTab[];
};

type StoredPreviewWindow = Omit<PreviewWindow, 'tabs'> & {
  tabs: PreviewTab[];
};

export type PreviewWindowOptions = Omit<Partial<PreviewWindow>, 'tabs'> & {
  tabs?: readonly Partial<PreviewTab>[];
};

export interface PreviewChromeOptions {
  state?: unknown;
  tabs?: readonly Partial<PreviewTab>[];
  windows?: readonly PreviewWindowOptions[];
  extensionBaseUrl?: string;
}

export interface PreviewResponse<T = unknown> {
  ok: boolean;
  result?: T;
  error?: string;
  code?: string;
  invalidMutationIndexes?: number[];
  committedMutationIndexes?: number[];
  state?: TabBoardState;
}

export interface PreviewEventHub {
  addListener(listener: (...args: never[]) => unknown): void;
  removeListener(listener: (...args: never[]) => unknown): void;
}

export interface PreviewChromeApi {
  storage: {
    local: {
      get(keys?: string | readonly string[] | Record<string, unknown>): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
    onChanged: PreviewEventHub;
  };
  runtime: {
    id: string;
    sendMessage<T = unknown>(message: unknown): Promise<PreviewResponse<T>>;
    openOptionsPage(): Promise<void>;
    getURL(path?: string): string;
  };
  tabs: {
    query(queryInfo?: Record<string, unknown>): Promise<PreviewTab[]>;
    get(tabId: number): Promise<PreviewTab>;
    create(properties: Record<string, unknown>): Promise<PreviewTab>;
    update(tabId: number, properties: Record<string, unknown>): Promise<PreviewTab>;
    remove(tabIds: number | readonly number[]): Promise<void>;
    onActivated: PreviewEventHub;
    onCreated: PreviewEventHub;
    onRemoved: PreviewEventHub;
    onMoved: PreviewEventHub;
    onAttached: PreviewEventHub;
    onDetached: PreviewEventHub;
    onReplaced: PreviewEventHub;
    onUpdated: PreviewEventHub;
  };
  windows: {
    get(windowId: number, queryInfo?: Record<string, unknown>): Promise<PreviewWindow>;
    getAll(queryInfo?: Record<string, unknown>): Promise<PreviewWindow[]>;
    create(properties?: Record<string, unknown>): Promise<PreviewWindow>;
    update(windowId: number, properties: Record<string, unknown>): Promise<PreviewWindow>;
    remove(windowId: number): Promise<void>;
    onCreated: PreviewEventHub;
    onRemoved: PreviewEventHub;
    onFocusChanged: PreviewEventHub;
  };
}

export interface PreviewChromeHarness {
  readonly chrome: PreviewChromeApi;
  readonly state: TabBoardState;
  readonly tabs: readonly PreviewTab[];
  readonly windows: readonly PreviewWindow[];
  readonly sentMessages: unknown[];
  readonly eventListeners: Readonly<Record<string, readonly unknown[]>>;
  readonly openedOptionsCount: number;
  listenerCount(name: string): number;
  emit(name: string, ...args: unknown[]): void;
  dispatchMessage<T = unknown>(message: unknown): Promise<PreviewResponse<T>>;
  uninstall(): void;
}

type Listener = (...args: never[]) => unknown;
type EventName =
  | 'storage.onChanged'
  | 'tabs.onActivated'
  | 'tabs.onCreated'
  | 'tabs.onRemoved'
  | 'tabs.onMoved'
  | 'tabs.onAttached'
  | 'tabs.onDetached'
  | 'tabs.onReplaced'
  | 'tabs.onUpdated'
  | 'windows.onCreated'
  | 'windows.onRemoved'
  | 'windows.onFocusChanged';

const EVENT_NAMES: readonly EventName[] = [
  'storage.onChanged',
  'tabs.onActivated',
  'tabs.onCreated',
  'tabs.onRemoved',
  'tabs.onMoved',
  'tabs.onAttached',
  'tabs.onDetached',
  'tabs.onReplaced',
  'tabs.onUpdated',
  'windows.onCreated',
  'windows.onRemoved',
  'windows.onFocusChanged',
];

class EventHub implements PreviewEventHub {
  readonly listeners = new Set<Listener>();

  addListener(listener: Listener): void {
    this.listeners.add(listener);
  }

  removeListener(listener: Listener): void {
    this.listeners.delete(listener);
  }

  emit(...args: unknown[]): void {
    for (const listener of [...this.listeners]) {
      try {
        const result = listener(...args as never[]);
        if (result && typeof (result as { then?: unknown }).then === 'function') {
          void Promise.resolve(result).catch(() => undefined);
        }
      } catch {
        // Chrome event listeners cannot reject the API operation that emitted them.
      }
    }
  }
}

const DEFAULT_EXTENSION_BASE_URL = 'chrome-extension://preview/';
const PREVIEW_EXTENSION_PAGE_URL_PATTERN = /^\/dev\/(?:manager|popup|options)-preview\.html(?:[?#]|$)/i;

function fixtureState(): TabBoardState {
  const empty = createEmptyState();
  const workspaceId = empty.activeWorkspaceId;
  const folders = Array.from({ length: 1 }, (_, index) => createFolder(
    index === 0 ? 'Preview category' : `Preview category ${index + 1}`,
    'blue',
    workspaceId,
  ));
  const folder = folders[0];
  const starredGroup = createGroupFromTabRecords([
    createTabRecord({
      id: 9001,
      windowId: 1,
      title: 'Readable preview link',
      url: 'https://preview.example/',
      favIconUrl: 'https://preview.example/favicon.ico',
    }),
    createNoteRecord('A note saved beside the preview link.', { title: 'Readable note' }),
  ], {
    title: 'Starred preview session',
    workspaceId,
    starred: true,
  });
  const lockedGroup = createGroupFromTabRecords([
    createTabRecord({
      id: 9002,
      windowId: 2,
      title: 'Locked preview link',
      url: 'https://locked.example/',
    }),
    createNoteRecord('A locked group note.', { title: 'Locked note' }),
  ], {
    title: 'Locked preview session',
    note: 'A group-level note for the locked fixture.',
    workspaceId,
    folderId: folder.id,
    locked: true,
  });
  return normalizeState({
    ...empty,
    folders,
    groups: [starredGroup, lockedGroup],
  });
}

function fixtureTabs(): PreviewTab[] {
  return [
    makeTab({
      id: 101,
      windowId: 1,
      index: 0,
      active: true,
      title: 'Active HTTP tab',
      url: 'https://active.example/',
      favIconUrl: 'https://active.example/favicon.ico',
    }),
    makeTab({
      id: 102,
      windowId: 1,
      index: 1,
      pinned: true,
      title: 'Pinned tab',
      url: 'https://pinned.example/',
      favIconUrl: 'https://pinned.example/favicon.ico',
    }),
    makeTab({
      id: 103,
      windowId: 1,
      index: 2,
      groupId: 1,
      title: 'Duplicate URL one',
      url: 'https://duplicate.example/',
    }),
    makeTab({
      id: 104,
      windowId: 1,
      index: 3,
      groupId: 1,
      title: 'Duplicate URL two',
      url: 'https://duplicate.example/',
      favIconUrl: 'https://duplicate.example/favicon.ico',
    }),
    makeTab({
      id: 105,
      windowId: 1,
      index: 4,
      title: 'Chrome settings',
      url: 'chrome://settings/',
    }),
    makeTab({
      id: 106,
      windowId: 1,
      index: 5,
      title: 'File preview',
      url: 'file:///tmp/preview.html',
    }),
    makeTab({
      id: 107,
      windowId: 1,
      index: 6,
      title: 'No favicon tab',
      url: 'https://no-favicon.example/',
    }),
    makeTab({
      id: 201,
      windowId: 2,
      index: 0,
      active: true,
      title: 'Second window tab',
      url: 'http://second-window.example/',
      favIconUrl: 'http://second-window.example/favicon.ico',
    }),
  ];
}

function fixtureWindows(tabs: readonly PreviewTab[]): StoredPreviewWindow[] {
  return Array.from({ length: 6 }, (_, index) => {
    const id = index + 1;
    return makeWindow(id, id === 1, tabs.filter((tab) => tab.windowId === id));
  });
}

function makeTab(
  input: Partial<PreviewTab>,
  defaults: Partial<Pick<PreviewTab, 'id' | 'windowId' | 'index'>> = {},
): PreviewTab {
  const url = input.url ?? '';
  const id = typeof input.id === 'number' && Number.isSafeInteger(input.id) && input.id > 0
    ? input.id
    : defaults.id ?? 1;
  const windowId = typeof input.windowId === 'number' && Number.isSafeInteger(input.windowId) && input.windowId > 0
    ? input.windowId
    : defaults.windowId ?? 1;
  const index = typeof input.index === 'number' && Number.isSafeInteger(input.index) && input.index >= 0
    ? input.index
    : defaults.index ?? 0;
  return {
    ...input,
    id,
    windowId,
    index,
    active: Boolean(input.active),
    pinned: Boolean(input.pinned),
    highlighted: Boolean(input.highlighted),
    incognito: Boolean(input.incognito),
    selected: Boolean(input.selected),
    title: input.title ?? (url || 'Untitled'),
    url,
    favIconUrl: input.favIconUrl ?? '',
    status: input.status ?? 'complete',
  } as PreviewTab;
}

function makeCustomTabs(inputs: readonly Partial<PreviewTab>[]): PreviewTab[] {
  const explicitIds = new Set(inputs.flatMap((input) => (
    typeof input.id === 'number' && Number.isSafeInteger(input.id) && input.id > 0 ? [input.id] : []
  )));
  const explicitIndexes = new Map<number, Set<number>>();
  for (const input of inputs) {
    const windowId = typeof input.windowId === 'number'
      && Number.isSafeInteger(input.windowId)
      && input.windowId > 0
      ? input.windowId
      : 1;
    if (typeof input.index === 'number' && Number.isSafeInteger(input.index) && input.index >= 0) {
      const indexes = explicitIndexes.get(windowId) ?? new Set<number>();
      indexes.add(input.index);
      explicitIndexes.set(windowId, indexes);
    }
  }
  const usedIds = new Set<number>();
  const usedIndexes = new Map<number, Set<number>>();
  let nextId = Math.max(0, ...explicitIds) + 1;
  const normalized = inputs.map((input) => {
    const windowId = typeof input.windowId === 'number'
      && Number.isSafeInteger(input.windowId)
      && input.windowId > 0
      ? input.windowId
      : 1;
    let id = input.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
      while (usedIds.has(nextId) || explicitIds.has(nextId)) nextId += 1;
      id = nextId;
      nextId += 1;
    }
    usedIds.add(id);
    const windowIndexes = usedIndexes.get(windowId) ?? new Set<number>();
    const reservedIndexes = explicitIndexes.get(windowId) ?? new Set<number>();
    let index = input.index;
    if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) {
      index = 0;
      while (windowIndexes.has(index) || reservedIndexes.has(index)) index += 1;
    }
    windowIndexes.add(index);
    usedIndexes.set(windowId, windowIndexes);
    return makeTab(input, { id, windowId, index });
  });
  const activeWindows = new Set(normalized
    .filter((tab) => tab.active)
    .map((tab) => tab.windowId));
  const firstByWindow = new Map<number, number>();
  for (const tab of normalized) {
    if (!firstByWindow.has(tab.windowId)) firstByWindow.set(tab.windowId, tab.id);
  }
  return normalized.map((tab) => (
    !activeWindows.has(tab.windowId) && firstByWindow.get(tab.windowId) === tab.id
      ? { ...tab, active: true }
      : tab
  ));
}

function makeWindow(
  id: number,
  focused: boolean,
  tabs: readonly PreviewTab[],
  input: PreviewWindowOptions = {},
): StoredPreviewWindow {
  return {
    incognito: false,
    type: 'normal',
    state: 'normal',
    alwaysOnTop: false,
    width: 1280,
    height: 800,
    left: 0,
    top: 0,
    ...input,
    id,
    focused,
    tabs: tabs.map((tab) => ({ ...tab })),
  } as StoredPreviewWindow;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cloneTab(tab: PreviewTab): PreviewTab {
  return clone(tab);
}

function cloneStoredWindow(window: StoredPreviewWindow): StoredPreviewWindow {
  return { ...window, tabs: window.tabs.map(cloneTab) };
}

function cloneWindow(window: StoredPreviewWindow, includeTabs = true): PreviewWindow {
  const { tabs, ...metadata } = window;
  return includeTabs ? { ...metadata, tabs: tabs.map(cloneTab) } : metadata;
}

function mappedUrl(url: unknown, managerUrl: string): string {
  const value = String(url || '');
  if (value === 'manager.html') return '/dev/manager-preview.html';
  if (value.startsWith(managerUrl)) {
    return `/dev/manager-preview.html${value.slice(managerUrl.length)}`;
  }
  return value;
}

function resolveTabUrl(tab: PreviewTab): string {
  return String(tab.pendingUrl || tab.url || '').trim();
}

function isPreviewExtensionPage(url: string, extensionBaseUrl: string): boolean {
  return PREVIEW_EXTENSION_PAGE_URL_PATTERN.test(url)
    || url.toLowerCase().startsWith(extensionBaseUrl.toLowerCase());
}

function getPreviewCaptureCandidateReason(
  tab: PreviewTab,
  settings: TabBoardState['settings'],
  extensionBaseUrl: string,
): ReturnType<typeof getCaptureCandidateReason> {
  const url = resolveTabUrl(tab);
  if (isPreviewExtensionPage(url, extensionBaseUrl)) return 'Cannot save this extension tab';
  return getCaptureCandidateReason(
    { id: tab.id, url, pinned: tab.pinned },
    settings,
    extensionBaseUrl,
  );
}

function normalizeRequestedTabIds(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('A non-empty tabIds array containing safe integer IDs is required.');
  }
  const ids = [...new Set(value)];
  if (!ids.every((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) {
    throw new Error('A non-empty tabIds array containing safe integer IDs is required.');
  }
  return ids;
}

function makeCustomWindows(
  inputs: readonly PreviewWindowOptions[],
  providedTabs?: readonly Partial<PreviewTab>[],
): { tabs: PreviewTab[]; windows: StoredPreviewWindow[] } {
  const explicitIds = new Set(inputs.flatMap((input) => (
    typeof input.id === 'number' && Number.isSafeInteger(input.id) && input.id > 0 ? [input.id] : []
  )));
  const usedIds = new Set<number>();
  let nextId = Math.max(0, ...explicitIds) + 1;
  const windowIds = inputs.map((input) => {
    let id = input.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
      while (usedIds.has(nextId) || explicitIds.has(nextId)) nextId += 1;
      id = nextId;
      nextId += 1;
    }
    usedIds.add(id);
    return id;
  });
  const focusedIndex = inputs.findIndex((input) => input.focused === true);
  const tabs = providedTabs
    ? makeCustomTabs(providedTabs)
    : makeCustomTabs(inputs.flatMap((input, index) => (
      input.tabs ?? []
    ).map((tab) => ({ ...tab, windowId: tab.windowId ?? windowIds[index] }))));
  const windows = inputs.map((input, index) => makeWindow(
    windowIds[index],
    focusedIndex >= 0 ? index === focusedIndex : index === 0,
    tabs.filter((tab) => tab.windowId === windowIds[index]),
    input,
  ));
  return { tabs, windows };
}

function windowsForCustomTabs(tabs: readonly PreviewTab[]): StoredPreviewWindow[] {
  const windowIds = [...new Set(tabs.map((tab) => tab.windowId))];
  if (!windowIds.length) return [makeWindow(1, true, [])];
  return windowIds.map((windowId, index) => makeWindow(
    windowId,
    index === 0,
    tabs.filter((tab) => tab.windowId === windowId),
  ));
}

export function installPreviewChrome(options: PreviewChromeOptions = {}): PreviewChromeHarness {
  // Allow the preview HTML (and Playwright addInitScript) to seed deterministic
  // state without changing the `installPreviewChrome()` boot call. Explicit
  // arguments always win over the injected global.
  const injected = (globalThis as { __TABBOARD_PREVIEW__?: PreviewChromeOptions }).__TABBOARD_PREVIEW__;
  if (injected && typeof injected === 'object') {
    options = { ...injected, ...options };
  }
  let state = normalizeState(options.state ?? fixtureState());
  let tabs: PreviewTab[];
  let windows: StoredPreviewWindow[];
  if (options.windows) {
    const custom = makeCustomWindows(options.windows, options.tabs);
    tabs = custom.tabs;
    windows = custom.windows;
  } else if (options.tabs) {
    tabs = makeCustomTabs(options.tabs);
    windows = windowsForCustomTabs(tabs);
  } else {
    tabs = fixtureTabs();
    windows = fixtureWindows(tabs);
  }
  let nextTabId = Math.max(0, ...tabs.map((tab) => tab.id)) + 1;
  let nextWindowId = Math.max(0, ...windows.map((window) => window.id)) + 1;
  let openedOptionsCount = 0;
  let storageData: Record<string, unknown> = { [STATE_KEY]: clone(state) };
  const sentMessages: unknown[] = [];
  const hubs = new Map<EventName, EventHub>(EVENT_NAMES.map((name) => [name, new EventHub()]));
  const extensionBaseUrl = options.extensionBaseUrl || DEFAULT_EXTENSION_BASE_URL;

  const getHub = (name: EventName): EventHub => hubs.get(name)!;
  const extensionUrl = (path = ''): string => {
    const base = extensionBaseUrl.endsWith('/') ? extensionBaseUrl : `${extensionBaseUrl}/`;
    return `${base}${String(path).replace(/^\/+/, '')}`;
  };

  const focusedWindow = (): StoredPreviewWindow | undefined => windows.find((window) => window.focused) ?? windows[0];
  const findTab = (tabId: number): PreviewTab | undefined => tabs.find((tab) => tab.id === tabId);
  const findWindow = (windowId: number): StoredPreviewWindow | undefined => windows.find((window) => window.id === windowId);

  const setTabs = (nextTabs: readonly PreviewTab[]): void => {
    tabs = nextTabs.map(cloneTab);
    windows = windows.map((window) => ({
      ...window,
      tabs: tabs.filter((tab) => tab.windowId === window.id).map(cloneTab),
    }));
  };

  const setWindows = (nextWindows: readonly StoredPreviewWindow[]): void => {
    windows = nextWindows.map(cloneStoredWindow);
    tabs = windows.flatMap((window) => window.tabs.map(cloneTab));
  };

  const reindexWindowTabs = (candidateTabs: readonly PreviewTab[], windowId: number): PreviewTab[] => {
    const windowTabs = candidateTabs
      .filter((tab) => tab.windowId === windowId)
      .sort((left, right) => left.index - right.index || left.id - right.id);
    const hasActiveTab = windowTabs.some((tab) => tab.active);
    const byId = new Map(windowTabs.map((tab, index) => [
      tab.id,
      { ...tab, index, active: hasActiveTab ? tab.active : index === 0 },
    ]));
    return candidateTabs.map((tab) => tab.windowId === windowId ? byId.get(tab.id)! : { ...tab });
  };

  const setStoredState = async (nextState: TabBoardState): Promise<void> => {
    state = normalizeState(nextState);
    await storageLocal.set({ [STATE_KEY]: clone(state) });
  };

  const storageLocal = {
    async get(keys?: string | readonly string[] | Record<string, unknown>): Promise<Record<string, unknown>> {
      if (keys === undefined) return clone(storageData);
      const defaults = isRecord(keys) && !Array.isArray(keys)
        ? keys
        : {};
      const requested = typeof keys === 'string'
        ? [keys]
        : Array.isArray(keys)
        ? keys
        : Object.keys(defaults);
      return Object.fromEntries(requested.flatMap((key) => {
        if (Object.hasOwn(storageData, key)) return [[key, clone(storageData[key])]];
        if (Object.hasOwn(defaults, key)) return [[key, clone(defaults[key])]];
        return [];
      }));
    },
    async set(items: Record<string, unknown>): Promise<void> {
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const [key, value] of Object.entries(items)) {
        const oldValue = storageData[key];
        const nextValue = clone(value);
        if (JSON.stringify(oldValue) === JSON.stringify(nextValue)) continue;
        storageData = { ...storageData, [key]: nextValue };
        if (key === STATE_KEY) state = normalizeState(nextValue);
        changes[key] = {
          ...(oldValue === undefined ? {} : { oldValue: clone(oldValue) }),
          newValue: clone(nextValue),
        };
      }
      if (Object.keys(changes).length) getHub('storage.onChanged').emit(changes, 'local');
    },
  };

  const listOpenTabs = (): { windows: Array<{
    id: number;
    focused: boolean;
    incognito: boolean;
    tabCount: number;
    tabs: Array<{
      id: number;
      windowId: number;
      title: string;
      url: string;
      favIconUrl: string;
      active: boolean;
      pinned: boolean;
      index: number;
      browserGroup: BrowserGroup | null;
      storable: boolean;
      reason: ReturnType<typeof getCaptureCandidateReason>;
    }>;
  }> } => ({
    windows: windows
      .filter((window) => window.type === 'normal' && !window.incognito)
      .map((window) => {
        const visibleTabs = [...window.tabs]
          .filter((tab) => {
            const url = resolveTabUrl(tab);
            return !isPreviewExtensionPage(url, extensionUrl(''))
              && !matchesCustomUrlFilter(url, state.settings);
          })
          .sort((left, right) => left.index - right.index)
          .map((tab) => {
            const url = resolveTabUrl(tab);
            const reason = getPreviewCaptureCandidateReason(tab, state.settings, extensionUrl(''));
            const id = typeof tab.id === 'number' ? tab.id : 0;
            return {
              id,
              windowId: tab.windowId,
              title: String(tab.title || url || 'Untitled'),
              url,
              favIconUrl: String(tab.favIconUrl || ''),
              active: Boolean(tab.active),
              pinned: Boolean(tab.pinned),
              index: tab.index,
              browserGroup: null,
              storable: reason === null,
              reason,
            };
          });
        return {
          id: window.id,
          focused: Boolean(window.focused),
          incognito: Boolean(window.incognito),
          tabCount: visibleTabs.length,
          tabs: visibleTabs,
        };
      }),
  });

  const tabsApi = {
    async query(queryInfo: Record<string, unknown> = {}): Promise<PreviewTab[]> {
      const currentWindowId = focusedWindow()?.id;
      return tabs
        .filter((tab) => queryInfo.windowId === undefined || tab.windowId === queryInfo.windowId)
        .filter((tab) => queryInfo.active !== true || tab.active)
        .filter((tab) => queryInfo.pinned !== true || tab.pinned)
        .filter((tab) => queryInfo.currentWindow !== true || tab.windowId === currentWindowId)
        .filter((tab) => queryInfo.lastFocusedWindow !== true || tab.windowId === currentWindowId)
        .map(cloneTab);
    },
    async get(tabId: number): Promise<PreviewTab> {
      const tab = findTab(Number(tabId));
      if (!tab) throw new Error(`No tab with id: ${String(tabId)}`);
      return cloneTab(tab);
    },
    async create(properties: Record<string, unknown>): Promise<PreviewTab> {
      const windowId = typeof properties.windowId === 'number' ? properties.windowId : focusedWindow()?.id;
      const targetWindow = windowId === undefined ? undefined : findWindow(windowId);
      if (!targetWindow) throw new Error('A normal browser window is required.');
      const active = properties.active !== false;
      const url = mappedUrl(properties.url, extensionUrl('manager.html'));
      const sameWindow = tabs
        .filter((tab) => tab.windowId === targetWindow.id)
        .sort((left, right) => left.index - right.index || left.id - right.id);
      const requestedIndex = typeof properties.index === 'number' && Number.isInteger(properties.index)
        ? properties.index
        : sameWindow.length;
      const index = Math.max(0, Math.min(requestedIndex, sameWindow.length));
      const indexById = new Map(sameWindow.map((tab, position) => [
        tab.id,
        position >= index ? position + 1 : position,
      ]));
      const newTab = makeTab({
        id: nextTabId++,
        windowId: targetWindow.id,
        index,
        active,
        title: url || 'New tab',
        url,
        pinned: Boolean(properties.pinned),
      });
      const nextTabs = tabs.map((tab) => {
        if (tab.windowId !== targetWindow.id) return { ...tab };
        return {
          ...tab,
          ...(indexById.has(tab.id) ? { index: indexById.get(tab.id)! } : {}),
          ...(active ? { active: false } : {}),
        };
      });
      setTabs([...nextTabs, newTab]);
      if (active) {
        getHub('tabs.onActivated').emit({ tabId: newTab.id, windowId: newTab.windowId });
      }
      getHub('tabs.onCreated').emit(cloneTab(newTab));
      return cloneTab(newTab);
    },
    async update(tabId: number, properties: Record<string, unknown>): Promise<PreviewTab> {
      const existing = findTab(Number(tabId));
      if (!existing) throw new Error(`No tab with id: ${String(tabId)}`);
      const active = properties.active === true;
      const nextTabs = tabs.map((tab) => {
        if (tab.id === existing.id) {
          return makeTab({
            ...tab,
            ...properties,
            ...(properties.url === undefined ? {} : { url: mappedUrl(properties.url, extensionUrl('manager.html')) }),
            active: properties.active === undefined ? tab.active : active,
          });
        }
        return active && tab.windowId === existing.windowId ? { ...tab, active: false } : tab;
      });
      setTabs(nextTabs);
      const updated = findTab(existing.id)!;
      getHub('tabs.onUpdated').emit(updated.id, properties, cloneTab(updated));
      if (active) getHub('tabs.onActivated').emit({ tabId: updated.id, windowId: updated.windowId });
      return cloneTab(updated);
    },
    async remove(tabIds: number | readonly number[]): Promise<void> {
      const ids = new Set(Array.isArray(tabIds) ? tabIds : [tabIds]);
      const removed = tabs.filter((tab) => ids.has(tab.id));
      if (!removed.length) throw new Error('No matching tabs found.');
      const closingWindowIds = new Set(windows
        .filter((window) => window.tabs.length > 0 && window.tabs.every((tab) => ids.has(tab.id)))
        .map((window) => window.id));
      let nextTabs = tabs.filter((tab) => !ids.has(tab.id));
      for (const window of windows) {
        if (!closingWindowIds.has(window.id)) nextTabs = reindexWindowTabs(nextTabs, window.id);
      }
      const removedFocusedWindow = windows.some((window) => closingWindowIds.has(window.id) && window.focused);
      const remainingWindows = windows.filter((window) => !closingWindowIds.has(window.id));
      const nextFocusedWindowId = removedFocusedWindow ? remainingWindows[0]?.id : undefined;
      setWindows(remainingWindows.map((window) => ({
        ...window,
        focused: nextFocusedWindowId === undefined ? window.focused : window.id === nextFocusedWindowId,
        tabs: nextTabs.filter((tab) => tab.windowId === window.id),
      })));
      for (const tab of removed) {
        getHub('tabs.onRemoved').emit(tab.id, {
          windowId: tab.windowId,
          isWindowClosing: closingWindowIds.has(tab.windowId),
        });
      }
      for (const windowId of closingWindowIds) getHub('windows.onRemoved').emit(windowId);
      for (const window of remainingWindows) {
        const activeTab = nextTabs.find((tab) => tab.windowId === window.id && tab.active);
        if (!activeTab && nextTabs.some((tab) => tab.windowId === window.id)) {
          const first = nextTabs
            .filter((tab) => tab.windowId === window.id)
            .sort((left, right) => left.index - right.index)[0];
          setTabs(tabs.map((tab) => tab.id === first.id ? { ...tab, active: true } : tab));
          getHub('tabs.onActivated').emit({ tabId: first.id, windowId: first.windowId });
        }
      }
      if (nextFocusedWindowId !== undefined) getHub('windows.onFocusChanged').emit(nextFocusedWindowId);
    },
    onActivated: getHub('tabs.onActivated'),
    onCreated: getHub('tabs.onCreated'),
    onRemoved: getHub('tabs.onRemoved'),
    onMoved: getHub('tabs.onMoved'),
    onAttached: getHub('tabs.onAttached'),
    onDetached: getHub('tabs.onDetached'),
    onReplaced: getHub('tabs.onReplaced'),
    onUpdated: getHub('tabs.onUpdated'),
  };

  const windowsApi = {
    async get(windowId: number, queryInfo: Record<string, unknown> = {}): Promise<PreviewWindow> {
      const window = findWindow(Number(windowId));
      if (!window) throw new Error(`No window with id: ${String(windowId)}`);
      return cloneWindow(window, queryInfo.populate === true);
    },
    async getAll(queryInfo: Record<string, unknown> = {}): Promise<PreviewWindow[]> {
      return windows
        .filter((window) => {
          const types = queryInfo.windowTypes;
          return !Array.isArray(types) || types.includes(window.type);
        })
        .map((window) => cloneWindow(window, queryInfo.populate === true));
    },
    async create(properties: Record<string, unknown> = {}): Promise<PreviewWindow> {
      const focused = properties.focused !== false;
      const windowId = nextWindowId++;
      const type = properties.type === 'popup' ? 'popup' : 'normal';
      const incognito = properties.incognito === true;
      const rawUrl = Array.isArray(properties.url) ? properties.url[0] : properties.url;
      const url = mappedUrl(rawUrl || 'about:blank', extensionUrl('manager.html'));
      const tab = makeTab({
        id: nextTabId++,
        windowId,
        index: 0,
        active: true,
        title: url || 'New tab',
        url,
        incognito,
      });
      const nextWindows = windows.map((window) => focused ? { ...window, focused: false } : window);
      const created = makeWindow(windowId, focused, [tab], { type, incognito });
      setWindows([...nextWindows, created]);
      getHub('windows.onCreated').emit(cloneWindow(created, true));
      getHub('tabs.onCreated').emit(cloneTab(tab));
      if (focused) getHub('windows.onFocusChanged').emit(windowId);
      return cloneWindow(created, true);
    },
    async update(windowId: number, properties: Record<string, unknown>): Promise<PreviewWindow> {
      const existing = findWindow(Number(windowId));
      if (!existing) throw new Error(`No window with id: ${String(windowId)}`);
      const focused = properties.focused === true;
      setWindows(windows.map((window) => ({
        ...window,
        focused: focused ? window.id === existing.id : window.focused,
      })));
      const updated = findWindow(existing.id)!;
      if (focused) getHub('windows.onFocusChanged').emit(updated.id);
      return cloneWindow(updated, true);
    },
    async remove(windowId: number): Promise<void> {
      const removed = findWindow(Number(windowId));
      if (!removed) throw new Error(`No window with id: ${String(windowId)}`);
      const remaining = windows.filter((window) => window.id !== removed.id);
      const nextFocused = removed.focused ? remaining[0]?.id : undefined;
      setWindows(remaining.map((window) => ({
        ...window,
        focused: nextFocused === undefined ? window.focused : window.id === nextFocused,
      })));
      for (const tab of removed.tabs) {
        getHub('tabs.onRemoved').emit(tab.id, { windowId: removed.id, isWindowClosing: true });
      }
      getHub('windows.onRemoved').emit(removed.id);
      if (nextFocused !== undefined) getHub('windows.onFocusChanged').emit(nextFocused);
    },
    onCreated: getHub('windows.onCreated'),
    onRemoved: getHub('windows.onRemoved'),
    onFocusChanged: getHub('windows.onFocusChanged'),
  };

  const api: PreviewChromeApi = {
    storage: { local: storageLocal, onChanged: getHub('storage.onChanged') },
    runtime: {
      id: 'preview-extension',
      async sendMessage<T = unknown>(message: unknown): Promise<PreviewResponse<T>> {
        const snapshot = clone(message);
        sentMessages.push(clone(snapshot));
        return harness.dispatchMessage<T>(snapshot);
      },
      async openOptionsPage(): Promise<void> {
        openedOptionsCount += 1;
      },
      getURL: extensionUrl,
    },
    tabs: tabsApi,
    windows: windowsApi,
  };

  const removeRestoredRefs = async (refs: readonly { source: string; groupId: string; tabId: string }[]) => {
    if (!refs.length) return;
    await setStoredState(normalizeState(applyStateMutations(state, [{
      type: 'remove-restored-refs',
      refs,
      updatedAt: nowIso(),
    }])));
  };

  const createRestoredTabs = async (
    records: readonly TabItem[],
    newWindow = false,
  ): Promise<Array<{ tab: PreviewTab; record: TabItem }>> => {
    const restorable = records.filter((item) => item.itemType === 'link' && Boolean(item.url));
    const created: Array<{ tab: PreviewTab; record: TabItem }> = [];
    if (!restorable.length) return created;
    let windowId = focusedWindow()?.id;
    let nextIndex: number | undefined;
    if (windowId !== undefined && state.settings.restoreNextToCurrent) {
      const activeTab = tabs.find((tab) => tab.windowId === windowId && tab.active);
      nextIndex = activeTab ? activeTab.index + 1 : undefined;
    }
    for (const record of restorable) {
      if (newWindow && created.length === 0) {
        const createdWindow = await windowsApi.create({
          url: record.url,
          focused: state.settings.focusRestoredTabs !== false,
          type: 'normal',
        });
        const firstTab = createdWindow.tabs?.[0];
        if (!firstTab) throw new Error('Unable to create a restore window.');
        windowId = createdWindow.id;
        created.push({ tab: firstTab, record });
        continue;
      }
      const tab = await tabsApi.create({
        url: record.url,
        ...(windowId === undefined ? {} : { windowId }),
        ...(nextIndex === undefined ? {} : { index: nextIndex++ }),
        active: state.settings.focusRestoredTabs !== false && created.length === 0,
      });
      created.push({ tab, record });
    }
    return created;
  };

  let restoreQueue: Promise<unknown> = Promise.resolve();
  const enqueueRestore = <T>(operation: () => Promise<T>): Promise<T> => {
    const run = restoreQueue.then(operation);
    restoreQueue = run.then(() => undefined, () => undefined);
    return run;
  };

  const saveSelectedTabs = async (message: Record<string, unknown>): Promise<{
    storedTabs: number;
    storedGroups: number;
    cleanedDuplicates: number;
    createdGroupIds: string[];
  }> => {
    const tabIds = normalizeRequestedTabIds(message.tabIds);
    const requestedWindowId = message.selectedWindowId;
    if (requestedWindowId !== undefined
      && (typeof requestedWindowId !== 'number' || !Number.isSafeInteger(requestedWindowId) || requestedWindowId <= 0)) {
      throw new Error('selectedWindowId must be a positive safe integer.');
    }
    const targetWindow = (requestedWindowId === undefined
      ? focusedWindow()
      : findWindow(requestedWindowId)) as PreviewWindow | undefined;
    if (!targetWindow || targetWindow.type !== 'normal' || targetWindow.incognito) {
      throw new Error('A normal browser window is required');
    }
    const workspaceId = message.workspaceId === undefined ? state.activeWorkspaceId : message.workspaceId;
    if (typeof workspaceId !== 'string' || !state.workspaces.some((workspace) => workspace.id === workspaceId)) {
      throw new Error('The capture workspace is no longer available.');
    }
    const selected = tabIds.map((tabId) => {
      const tab = findTab(tabId);
      const reason = tab
        ? getPreviewCaptureCandidateReason(tab, state.settings, extensionUrl(''))
        : 'No usable tab ID';
      if (!tab || tab.windowId !== targetWindow.id || reason !== null) {
        throw new Error(`Selected tab ${tabId} is not available in the selected normal window or cannot be saved.`);
      }
      return tab;
    });
    const seen = new Set<string>();
    const unique = selected.filter((tab) => {
      const url = resolveTabUrl(tab);
      if (!state.settings.dedupeOnSave || !url || !seen.has(url)) {
        if (url) seen.add(url);
        return true;
      }
      return false;
    });
    const duplicates = selected.filter((tab) => !unique.includes(tab));
    if (!unique.length) throw new Error('No capturable tabs were found.');
    const records = unique.map((tab) => createTabRecord(tab, { url: resolveTabUrl(tab) }));
    const group = createGroupFromTabRecords(records, { workspaceId });
    const nextState = normalizeState(applyStateMutations(state, [{
      type: 'prepend-groups',
      groups: [group],
      updatedAt: new Date().toISOString(),
    }]));
    await setStoredState(nextState);
    const result = {
      storedTabs: group.tabs.length,
      storedGroups: 1,
      cleanedDuplicates: duplicates.length,
      createdGroupIds: [group.id],
    };
    if (state.settings.openManagerAfterSave) await tabsApi.create({ url: 'manager.html', windowId: targetWindow.id });
    const idsToClose = state.settings.closeTabsAfterSave
      ? [...unique, ...duplicates].map((tab) => tab.id)
      : duplicates.map((tab) => tab.id);
    if (idsToClose.length) await tabsApi.remove(idsToClose);
    return result;
  };

  const dedupeWindow = async (): Promise<{ removedTabs: number }> => {
    const currentTabs = tabs.filter((tab) => tab.windowId === focusedWindow()?.id && resolveTabUrl(tab));
    const byUrl = new Map<string, PreviewTab[]>();
    currentTabs.forEach((tab) => {
      const url = resolveTabUrl(tab);
      byUrl.set(url, [...(byUrl.get(url) || []), tab]);
    });
    const duplicateIds = [...byUrl.values()].flatMap((matches) => matches
      .sort((left, right) => Number(right.active) - Number(left.active)
        || (right.lastAccessed || 0) - (left.lastAccessed || 0)
        || left.index - right.index)
      .slice(1)
      .map((tab) => tab.id));
    if (duplicateIds.length) await tabsApi.remove(duplicateIds);
    return { removedTabs: duplicateIds.length };
  };

  const handleMessage = async (rawMessage: unknown): Promise<unknown> => {
    const message = isRecord(rawMessage) ? rawMessage : {};
    const action = message.type || message.action;
    switch (action) {
      case 'tabboard-ensure-state':
        return clone(state);
      case 'tabboard-state-mutations': {
        if (!Array.isArray(message.mutations)) throw new Error('A mutations array is required.');
        const next = normalizeState(applyStateMutations(state, message.mutations));
        await setStoredState(next);
        return clone(next);
      }
      case 'list-open-tabs':
        return listOpenTabs();
      case 'saveSelectedTabs':
        return saveSelectedTabs(message);
      case 'dedupe-window':
        return dedupeWindow();
      case 'close-open-tab': {
        const tabId = Number(message.tabId);
        if (!Number.isSafeInteger(tabId) || tabId < 0) throw new Error('A valid tab ID is required');
        await tabsApi.remove(tabId);
        return { tabId };
      }
      case 'close-open-tabs': {
        const tabIds = Array.isArray(message.tabIds) ? message.tabIds.map(Number) : [];
        if (!tabIds.length || tabIds.some((tabId) => !Number.isSafeInteger(tabId) || tabId < 0)) {
          throw new Error('At least one valid tab ID is required');
        }
        await tabsApi.remove(tabIds);
        return { tabIds };
      }
      case 'pin-open-tab': {
        const tabId = Number(message.tabId);
        if (!Number.isSafeInteger(tabId) || tabId < 0) throw new Error('A valid tab ID is required');
        await tabsApi.update(tabId, { pinned: true });
        return { tabId, pinned: true };
      }
      case 'pin-open-tabs': {
        const tabIds = Array.isArray(message.tabIds) ? message.tabIds.map(Number) : [];
        if (!tabIds.length || tabIds.some((tabId) => !Number.isSafeInteger(tabId) || tabId < 0)) {
          throw new Error('At least one valid tab ID is required');
        }
        await Promise.all(tabIds.map((tabId) => tabsApi.update(tabId, { pinned: true })));
        return { tabIds, pinned: true };
      }
      case 'focus-open-tab': {
        const tabId = Number(message.tabId);
        const windowId = Number(message.windowId);
        const tab = findTab(tabId);
        if (!tab || tab.windowId !== windowId) throw new Error('The tab is no longer in the requested window');
        await tabsApi.update(tabId, { active: true });
        await windowsApi.update(windowId, { focused: true });
        return { tabId, windowId };
      }
      case 'restore-group':
        return enqueueRestore(async () => {
          const groupId = String(message.groupId || '');
          const group = state.groups.find((item) => item.id === groupId);
          if (!group) throw new Error('Saved group not found');
          const created = await createRestoredTabs(group.tabs, state.settings.restoreGroupsInNewWindow);
          if (state.settings.deleteRestoredTabs && !group.locked && created.length) {
            await removeRestoredRefs(created.map(({ record }) => ({ source: 'group', groupId, tabId: record.id })));
          }
          return { restoredTabs: created.length };
        });
      case 'restore-tab':
        return enqueueRestore(async () => {
          const groupId = String(message.groupId || '');
          const tabId = String(message.tabId || '');
          const group = state.groups.find((item) => item.id === groupId);
          const record = group?.tabs.find((tab) => tab.id === tabId);
          if (!group || !record || record.itemType !== 'link' || !record.url) throw new Error('Saved tab not found');
          const created = await createRestoredTabs([record]);
          if (state.settings.deleteRestoredTabs && !group.locked && created.length) {
            await removeRestoredRefs([{ source: 'group', groupId, tabId }]);
          }
          return { restoredTabs: created.length };
        });
      default:
        throw new Error(`Unknown message type: ${String(action)}`);
    }
  };

  let previousChrome: unknown;
  let previousWindow: { chrome?: unknown } | undefined;
  let previousWindowChrome: unknown;
  let hadWindow = false;
  const globalObject = globalThis as unknown as {
    chrome?: unknown;
    window?: { chrome?: unknown };
  };
  previousChrome = globalObject.chrome;
  hadWindow = Boolean(globalObject.window);
  previousWindow = globalObject.window;
  previousWindowChrome = previousWindow?.chrome;
  globalObject.chrome = api;
  if (globalObject.window) globalObject.window.chrome = api;
  else globalObject.window = { chrome: api };

  const harness = {
    chrome: api,
    sentMessages,
    listenerCount(name: string): number {
      return hubs.get(name as EventName)?.listeners.size ?? 0;
    },
    emit(name: string, ...args: unknown[]): void {
      hubs.get(name as EventName)?.emit(...args);
    },
    async dispatchMessage<T = unknown>(message: unknown): Promise<PreviewResponse<T>> {
      try {
        return { ok: true, result: await handleMessage(message) as T };
      } catch (error: unknown) {
        const structured = isRecord(error) ? error : {};
        const committedState = structured.committedState && typeof structured.committedState === 'object'
          ? normalizeState(structured.committedState)
          : undefined;
        if (committedState) await setStoredState(committedState);
        return {
          ok: false,
          error: errorMessage(error),
          ...(typeof structured.code === 'string' ? { code: structured.code } : {}),
          ...(Array.isArray(structured.invalidMutationIndexes)
            ? { invalidMutationIndexes: structured.invalidMutationIndexes }
            : {}),
          ...(Array.isArray(structured.committedMutationIndexes)
            ? { committedMutationIndexes: structured.committedMutationIndexes }
            : {}),
          ...(committedState ? { state: committedState } : {}),
        };
      }
    },
    uninstall(): void {
      globalObject.chrome = previousChrome;
      if (hadWindow && previousWindow) {
        globalObject.window = previousWindow;
        previousWindow.chrome = previousWindowChrome;
      } else {
        delete globalObject.window;
      }
    },
  } as PreviewChromeHarness;

  Object.defineProperties(harness, {
    state: { enumerable: true, get: () => clone(state) },
    tabs: { enumerable: true, get: () => tabs.map(cloneTab) },
    windows: { enumerable: true, get: () => windows.map((window) => cloneWindow(window, true)) },
    eventListeners: {
      enumerable: true,
      get: () => Object.fromEntries(EVENT_NAMES.map((name) => [name, [...getHub(name).listeners]])),
    },
    openedOptionsCount: { enumerable: true, get: () => openedOptionsCount },
  });

  return harness;
}

export const createPreviewChrome = installPreviewChrome;
