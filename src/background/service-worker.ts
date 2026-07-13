import {
  createId,
  defaultGroupTitle,
  nowIso,
  ITEM_LINK,
  STATE_KEY,
  normalizeState,
  compactBin,
  isRestorableTab,
  tabMatchesQuery,
  groupMatchesQuery,
  normalizeSearch,
  normalizeTab,
  normalizeGroup,
  normalizeBinEntry,
  normalizeBrowserGroup,
  type TabItem,
  type Group,
  type TabBoardState,
  type BrowserGroup,
  type Settings,
  type TabRef,
} from '../shared/model';
import { getState, setState, updateState, getSettings, ensureState } from '../shared/store/chromeStorage';

const MANAGER_PAGE = 'manager.html';
const POPUP_PAGE = 'popup.html';

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await ensureState();
  await refreshContextMenus();
  await applyActionPopup();
  if (reason === 'install') {
    await openManager();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await refreshContextMenus();
  await applyActionPopup();
});

chrome.action.onClicked.addListener(async (tab) => {
  await captureTabs('current-window', tab);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'capture-current-window') {
    await captureTabs('current-window', await getActiveTab());
  }
  if (command === 'open-manager') {
    await openManager();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'open-manager':
      await openManager();
      break;
    case 'store-current-tab':
      await captureTabs('current-tab', tab);
      break;
    case 'store-current-window':
      await captureTabs('current-window', tab);
      break;
    case 'store-all-windows':
      await captureTabs('all-windows', tab);
      break;
    case 'store-highlighted-tabs':
      await captureTabs('highlighted-tabs', tab);
      break;
    case 'store-tabs-left':
      await captureTabs('tabs-left', tab);
      break;
    case 'store-tabs-right':
      await captureTabs('tabs-right', tab);
      break;
    case 'store-other-tabs':
      await captureTabs('other-tabs', tab);
      break;
    default:
      break;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STATE_KEY]) {
    void applyActionPopup();
  }
});

chrome.omnibox.setDefaultSuggestion({
  description: 'Search TabBoard saved tabs',
});

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  void getOmniboxSuggestions(text).then(suggest);
});

chrome.omnibox.onInputEntered.addListener(async (text) => {
  if (text.startsWith('tabb://tab/')) {
    const [, , , source, groupId, tabId] = text.split('/');
    await restoreTab({ source, groupId, tabId });
    return;
  }
  await openManager({ query: text });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

async function handleMessage(message: { type?: string; action?: string; [key: string]: unknown }) {
  const action = message?.type || message?.action;
  switch (action) {
    case 'capture':
    case 'saveCurrentWindow':
      return captureTabs(
        (message.mode as string) || 'current-window',
        await getActiveTab(),
        {
          openAfter: message.openAfter !== false,
          tabId: message.tabId as number | undefined,
          tabIds: message.tabIds as number[] | undefined,
          windowId: message.windowId as number | undefined,
          workspaceId: message.workspaceId as string | undefined,
        }
      );
    case 'saveSelectedTabs':
      return saveSelectedTabs(message.tabIds as number[]);
    case 'list-open-tabs':
      return listOpenTabs();
    case 'create-window':
      return createWindow();
    case 'close-open-tab':
      return closeOpenTab(message.tabId as number);
    case 'open-manager':
      return openManager({ query: (message.query as string) || '' });
    case 'open-options':
      return chrome.runtime.openOptionsPage();
    case 'count-window-duplicates':
      return countWindowDuplicates(message.windowId as number);
    case 'dedupe-window':
      return dedupeWindow(message.windowId as number);
    case 'delete-group':
      return deleteSavedGroup(message.groupId as string);
    case 'restore-tab':
      return restoreTab(message as unknown as TabRef & { tabId: string; groupId: string });
    case 'restore-group':
      return restoreGroup(message.groupId as string);
    case 'restore-refs':
      return restoreRefs((message.refs as TabRef[]) || []);
    case 'restore-all':
      return restoreAll();
    default:
      throw new Error(`Unknown message type: ${action}`);
  }
}

async function refreshContextMenus() {
  await new Promise<void>((resolve) => chrome.contextMenus.removeAll(() => resolve()));
  const contexts: chrome.contextMenus.ContextType[] = [
    'page',
    'selection',
    'link',
    'image',
    'video',
    'audio',
    'editable',
    'action',
  ];
  chrome.contextMenus.create({
    id: 'open-manager',
    title: 'Open TabBoard',
    contexts,
  });
  chrome.contextMenus.create({
    id: 'store-current-tab',
    title: 'Save this tab to TabBoard',
    contexts,
  });
  chrome.contextMenus.create({
    id: 'store-current-window',
    title: 'Save all tabs in this window',
    contexts,
  });
  chrome.contextMenus.create({
    id: 'store-highlighted-tabs',
    title: 'Save selected tabs',
    contexts: ['page', 'action'],
  });
  chrome.contextMenus.create({
    id: 'store-tabs-left',
    title: 'Save tabs to the left',
    contexts: ['page', 'action'],
  });
  chrome.contextMenus.create({
    id: 'store-tabs-right',
    title: 'Save tabs to the right',
    contexts: ['page', 'action'],
  });
  chrome.contextMenus.create({
    id: 'store-other-tabs',
    title: 'Save all tabs except this one',
    contexts: ['page', 'action'],
  });
  chrome.contextMenus.create({
    id: 'store-all-windows',
    title: 'Save tabs from all windows',
    contexts: ['page', 'action'],
  });
}

async function applyActionPopup() {
  const settings = await getSettings();
  await chrome.action.setPopup({ popup: settings.actionClick === 'popup' ? POPUP_PAGE : '' });
  await chrome.action.setTitle({
    title: settings.actionClick === 'popup' ? 'Open TabBoard' : 'Save tabs to TabBoard',
  });
}

type CaptureMode =
  | 'current-window'
  | 'current-tab'
  | 'all-windows'
  | 'highlighted-tabs'
  | 'tabs-left'
  | 'tabs-right'
  | 'other-tabs'
  | 'tab-ids'
  | 'tab-id'
  | 'window-id';

interface CaptureOptions {
  openAfter?: boolean;
  tabId?: number;
  tabIds?: number[];
  windowId?: number;
  workspaceId?: string;
}

interface CaptureResult {
  storedTabs: number;
  storedGroups: number;
  cleanedDuplicates: number;
  createdGroupIds: string[];
}

async function captureTabs(
  mode: string,
  anchorTab: chrome.tabs.Tab | null | undefined,
  options: CaptureOptions = {}
): Promise<CaptureResult> {
  const settings = await getSettings();
  const sourceTabs = sortCapturedTabs(await getTabsForMode(mode as CaptureMode, anchorTab, options));
  const eligibleTabs = sourceTabs.filter(canCaptureTab);
  const { uniqueTabs, duplicateTabs } = dedupeSourceTabs(eligibleTabs, settings);
  const storableTabs = uniqueTabs;

  const recordsByWindow = new Map<number, TabItem[]>();
  for (const tab of storableTabs) {
    const record = createTabRecord(tab, {
      browserGroup: await readBrowserGroup(tab),
      url: resolveTabUrl(tab),
    });
    const windowId = tab.windowId ?? -1;
    recordsByWindow.set(windowId, [...(recordsByWindow.get(windowId) || []), record]);
  }

  const state = await getState();
  const targetWorkspaceId = options.workspaceId || state.activeWorkspaceId;
  const groups: Group[] = [...recordsByWindow.entries()].map(([windowId, records]) =>
    createGroupFromTabRecords(records, {
      title: captureTitle(mode, records, windowId),
      workspaceId: targetWorkspaceId,
    })
  );
  const result: CaptureResult = {
    storedTabs: groups.reduce((total, group) => total + group.tabs.length, 0),
    storedGroups: groups.length,
    cleanedDuplicates: duplicateTabs.length,
    createdGroupIds: groups.map((group) => group.id),
  };

  if (groups.length) {
    await updateState((draft) => ({
      ...draft,
      groups: [...groups, ...draft.groups],
      updatedAt: nowIso(),
    }));
  }

  let managerTab: chrome.tabs.Tab | null = null;
  if (options.openAfter !== false && settings.openManagerAfterSave) {
    managerTab = await openManager({
      windowId: anchorTab?.windowId,
      targetGroupId: result.createdGroupIds[0] || '',
      feedback: result,
    });
  }

  const idsToClose = new Set<number>([
    ...duplicateTabs.map((tab) => tab.id).filter((id): id is number => typeof id === 'number'),
    ...(settings.closeTabsAfterSave
      ? storableTabs.map((tab) => tab.id).filter((id): id is number => typeof id === 'number')
      : []),
  ]);
  if (managerTab?.id) {
    idsToClose.delete(managerTab.id);
  }
  await removeTabs([...idsToClose].filter(Number.isFinite));

  return result;
}

const BLANK_URL_PATTERN = /^about:blank$/i;

function resolveTabUrl(tab: chrome.tabs.Tab): string {
  return String(tab?.pendingUrl || tab?.url || '').trim();
}

function isBlankTab(tab: chrome.tabs.Tab): boolean {
  return BLANK_URL_PATTERN.test(resolveTabUrl(tab));
}

function dedupeSourceTabs(tabs: chrome.tabs.Tab[], settings: Settings) {
  if (!settings.dedupeOnSave) {
    return { uniqueTabs: tabs, duplicateTabs: [] as chrome.tabs.Tab[] };
  }
  return tabs.reduce<{ seen: Set<string>; uniqueTabs: chrome.tabs.Tab[]; duplicateTabs: chrome.tabs.Tab[] }>(
    (result, tab) => {
      const url = resolveTabUrl(tab);
      if (!url || !result.seen.has(url)) {
        return {
          seen: url ? new Set([...result.seen, url]) : result.seen,
          uniqueTabs: [...result.uniqueTabs, tab],
          duplicateTabs: result.duplicateTabs,
        };
      }
      return { ...result, duplicateTabs: [...result.duplicateTabs, tab] };
    },
    { seen: new Set(), uniqueTabs: [], duplicateTabs: [] }
  );
}

function canDedupeTab(tab: chrome.tabs.Tab): boolean {
  const url = resolveTabUrl(tab);
  if (!tab?.id || !url) {
    return false;
  }
  const ownBase = chrome.runtime.getURL('');
  if (url.startsWith(ownBase)) {
    return false;
  }
  return !/^devtools:/i.test(url) && !isBlankTab(tab);
}

function collectWindowDuplicates(tabs: chrome.tabs.Tab[]): chrome.tabs.Tab[] {
  return dedupeSourceTabs(tabs.filter(canDedupeTab), { dedupeOnSave: true } as Settings).duplicateTabs;
}

async function getTabsForMode(
  mode: CaptureMode,
  anchorTab: chrome.tabs.Tab | null | undefined,
  options: CaptureOptions = {}
): Promise<chrome.tabs.Tab[]> {
  const current = anchorTab || (await getActiveTab());
  if (mode === 'all-windows') {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    return windows.flatMap((window) => window.tabs || []);
  }
  if (mode === 'window-id' && Number.isFinite(options.windowId)) {
    return chrome.tabs.query({ windowId: options.windowId });
  }
  if (mode === 'current-tab') {
    return current ? [current] : [];
  }
  if (mode === 'tab-id' && Number.isFinite(options.tabId)) {
    try {
      return [await chrome.tabs.get(options.tabId as number)];
    } catch {
      return [];
    }
  }
  if (mode === 'tab-ids' && Array.isArray(options.tabIds)) {
    const tabs: chrome.tabs.Tab[] = [];
    for (const tabId of options.tabIds) {
      if (!Number.isFinite(tabId)) {
        continue;
      }
      try {
        tabs.push(await chrome.tabs.get(tabId));
      } catch {
        // Ignore tabs that closed before the save action completed.
      }
    }
    return tabs;
  }

  const windowId = current?.windowId;
  const tabs = windowId
    ? await chrome.tabs.query({ windowId })
    : await chrome.tabs.query({ currentWindow: true });

  if (!current) {
    return tabs;
  }
  if (mode === 'highlighted-tabs') {
    const highlighted = tabs.filter((tab) => tab.highlighted);
    return highlighted.length > 1 ? highlighted : [current];
  }
  if (mode === 'tabs-left') {
    return tabs.filter((tab) => (tab.index ?? 0) < (current.index ?? 0));
  }
  if (mode === 'tabs-right') {
    return tabs.filter((tab) => (tab.index ?? 0) > (current.index ?? 0));
  }
  if (mode === 'other-tabs') {
    return tabs.filter((tab) => tab.id !== current.id);
  }
  return tabs;
}

async function readBrowserGroup(tab: chrome.tabs.Tab): Promise<BrowserGroup | null> {
  if (!Number.isFinite(tab.groupId) || tab.groupId < 0 || !chrome.tabGroups?.get) {
    return null;
  }
  try {
    const group = await chrome.tabGroups.get(tab.groupId);
    return {
      sourceGroupId: tab.groupId,
      title: group.title || '',
      color: group.color || 'grey',
      collapsed: Boolean(group.collapsed),
    };
  } catch {
    return null;
  }
}

function canCaptureTab(tab: chrome.tabs.Tab): boolean {
  const url = resolveTabUrl(tab);
  if (!tab?.id || !url) {
    return false;
  }
  return !url.startsWith(chrome.runtime.getURL(''));
}

function captureTitle(mode: string, records: TabItem[], windowId: number): string {
  const base = defaultGroupTitle();
  const count = records.length;
  if (mode === 'current-tab') {
    return records[0]?.title || base;
  }
  if (mode === 'all-windows') {
    return `${base} - window ${windowId} - ${count} tabs`;
  }
  if (mode === 'window-id') {
    return `${base} - window ${windowId} - ${count} tabs`;
  }
  if (mode === 'tab-id') {
    return records[0]?.title || base;
  }
  if (mode === 'tab-ids') {
    return `${base} - selected tabs`;
  }
  if (mode === 'highlighted-tabs') {
    return `${base} - selected tabs`;
  }
  if (mode === 'tabs-left') {
    return `${base} - tabs to the left`;
  }
  if (mode === 'tabs-right') {
    return `${base} - tabs to the right`;
  }
  if (mode === 'other-tabs') {
    return `${base} - other tabs`;
  }
  return `${base} - ${count} tabs`;
}

interface TabRefWithSource {
  source: string;
  groupId: string;
  tabId: string;
}

interface FoundTabRef {
  source: string;
  group: Group;
  tab: TabItem;
}

async function restoreTab({ source = 'group', groupId = '', tabId = '' }: TabRefWithSource) {
  const state = await getState();
  const settings = state.settings;
  const found = findTabRef(state, { source, groupId, tabId });
  if (!found) {
    throw new Error('Saved tab not found');
  }
  if (!isRestorableTab(found.tab)) {
    throw new Error('This item is not a restorable link');
  }
  const created = await createChromeTabs([found.tab], { newWindow: false, settings });
  if (settings.deleteRestoredTabs && !found.group?.locked && created.length) {
    await removeRestoredRefs([{ source, groupId, tabId }]);
  }
  return { restoredTabs: created.length };
}

async function restoreGroup(groupId: string) {
  const state = await getState();
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) {
    throw new Error('Saved group not found');
  }
  const tabs = group.tabs.filter(isRestorableTab);
  const created = await createChromeTabs(tabs, {
    newWindow: state.settings.restoreGroupsInNewWindow,
    settings: state.settings,
  });
  if (state.settings.deleteRestoredTabs && !group.locked && created.length) {
    await removeRestoredRefs(
      created.map(({ record }) => ({ source: 'group', groupId, tabId: record.id }))
    );
  }
  return { restoredTabs: created.length };
}

async function restoreRefs(refs: TabRef[]) {
  const state = await getState();
  const settings = state.settings;
  const found = refs.map((ref) => findTabRef(state, ref)).filter(Boolean) as FoundTabRef[];
  const restorable = found.filter((item) => isRestorableTab(item.tab));
  const tabs = restorable.map((item) => item.tab);
  const created = await createChromeTabs(tabs, { newWindow: false, settings });
  if (settings.deleteRestoredTabs && created.length) {
    const createdIds = new Set(created.map(({ record }) => record.id));
    const removableRefs = restorable
      .filter((item) => createdIds.has(item.tab.id) && !item.group?.locked)
      .map((item) => ({ source: item.source, groupId: item.group?.id || '', tabId: item.tab.id }));
    await removeRestoredRefs(removableRefs);
  }
  return { restoredTabs: created.length };
}

async function restoreAll() {
  const state = await getState();
  const restorable: { group: Group; tab: TabItem }[] = state.groups.flatMap((group) =>
    group.tabs.filter(isRestorableTab).map((tab) => ({ group, tab }))
  );
  const created = await createChromeTabs(restorable.map(({ tab }) => tab), {
    newWindow: state.settings.restoreGroupsInNewWindow,
    settings: state.settings,
  });
  if (state.settings.deleteRestoredTabs && created.length) {
    const createdIds = new Set(created.map(({ record }) => record.id));
    const refs = restorable
      .filter(({ group, tab }) => createdIds.has(tab.id) && !group.locked)
      .map(({ group, tab }) => ({ source: 'group', groupId: group.id, tabId: tab.id }));
    await removeRestoredRefs(refs);
  }
  return { restoredTabs: created.length };
}

interface CreatedTab {
  tab: chrome.tabs.Tab;
  record: TabItem;
}

async function createChromeTabs(
  records: TabItem[],
  { newWindow, settings }: { newWindow: boolean; settings: Settings }
): Promise<CreatedTab[]> {
  records = records.filter(isRestorableTab);
  if (!records.length) {
    return [];
  }
  const created: CreatedTab[] = [];
  const focusFirst = settings.focusRestoredTabs !== false;

  if (newWindow) {
    let targetWindowId: number | undefined = undefined;
    for (const record of records) {
      try {
        if (!Number.isFinite(targetWindowId)) {
          const nextWindow = await chrome.windows.create({
            url: record.url,
            focused: focusFirst && !created.length,
          });
          targetWindowId = nextWindow.id;
          const firstTab = nextWindow.tabs?.[0];
          if (firstTab) {
            created.push({ tab: firstTab, record });
          }
          continue;
        }
        const tab = await chrome.tabs.create({
          windowId: targetWindowId,
          url: record.url,
          active: false,
        });
        created.push({ tab, record });
      } catch {
        // Keep failed records saved so users can retry or copy the URL.
      }
    }
  } else {
    const activeTab = await getActiveTab();
    let nextIndex = settings.restoreNextToCurrent && Number.isFinite(activeTab?.index ?? undefined)
      ? (activeTab?.index ?? 0) + 1
      : -1;
    for (const record of records) {
      const createProperties: chrome.tabs.CreateProperties = {
        url: record.url,
        active: focusFirst && !created.length,
      };
      if (activeTab?.windowId) {
        createProperties.windowId = activeTab.windowId;
      }
      if (nextIndex >= 0) {
        createProperties.index = nextIndex++;
      }
      try {
        const tab = await chrome.tabs.create(createProperties);
        created.push({ tab, record });
      } catch {
        // Keep failed records saved so users can retry or copy the URL.
      }
    }
  }

  await restoreBrowserGroups(created);
  return created;
}

async function restoreBrowserGroups(created: CreatedTab[]) {
  if (!chrome.tabs.group || !chrome.tabGroups?.update) {
    return;
  }
  const buckets = new Map<
    string,
    { browserGroup: BrowserGroup; tabIds: number[]; windowId: number }
  >();
  for (const item of created) {
    const browserGroup = item.record.browserGroup;
    if (!browserGroup) {
      continue;
    }
    const key = `${browserGroup.sourceGroupId || browserGroup.title || 'group'}:${item.tab.windowId}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        browserGroup,
        tabIds: [],
        windowId: item.tab.windowId ?? -1,
      });
    }
    const bucket = buckets.get(key)!;
    if (item.tab.id) {
      bucket.tabIds.push(item.tab.id);
    }
  }

  for (const bucket of buckets.values()) {
    if (!bucket.tabIds.length) {
      continue;
    }
    try {
      const groupId = await chrome.tabs.group({
        tabIds: bucket.tabIds,
        createProperties: { windowId: bucket.windowId },
      });
      await chrome.tabGroups.update(groupId, {
        title: bucket.browserGroup.title,
        color: (bucket.browserGroup.color || 'grey') as chrome.tabGroups.ColorEnum,
        collapsed: bucket.browserGroup.collapsed,
      });
    } catch {
      // Some Chromium builds restrict grouping restored internal pages.
    }
  }
}

function findTabRef(state: TabBoardState, ref: TabRefWithSource): FoundTabRef | null {
  const group = state.groups.find((item) => item.id === ref.groupId);
  const tab = group?.tabs.find((item) => item.id === ref.tabId);
  return group && tab ? { source: 'group', group, tab } : null;
}

async function removeRestoredRefs(refs: TabRefWithSource[]) {
  if (!refs.length) {
    return;
  }
  await updateState((draft) => {
    removeRefsFromState(draft, refs);
    return { ...draft, updatedAt: nowIso() };
  });
}

function removeRefsFromState(state: TabBoardState, refs: TabRefWithSource[]) {
  const groupRefs = new Map<string, Set<string>>();
  for (const ref of refs) {
    if (ref.source !== 'group') {
      continue;
    }
    if (!groupRefs.has(ref.groupId)) {
      groupRefs.set(ref.groupId, new Set());
    }
    groupRefs.get(ref.groupId)!.add(ref.tabId);
  }
  for (const group of state.groups) {
    const ids = groupRefs.get(group.id);
    if (ids) {
      group.tabs = group.tabs.filter((tab) => !ids.has(tab.id));
    }
  }
  state.groups = state.groups.filter((group) => group.tabs.length || group.locked || group.note);
}

async function removeTabs(tabIds: number[]) {
  for (const id of tabIds) {
    try {
      await chrome.tabs.remove(id);
    } catch {
      // The tab may already be closed by the user or Chrome may refuse an internal page.
    }
  }
}

async function countWindowDuplicates(windowId?: number) {
  const query = Number.isFinite(windowId) ? { windowId } : { currentWindow: true };
  const tabs = sortCapturedTabs(await chrome.tabs.query(query));
  return { duplicateTabCount: collectWindowDuplicates(tabs).length };
}

async function dedupeWindow(windowId?: number) {
  const query = Number.isFinite(windowId) ? { windowId } : { currentWindow: true };
  const tabs = sortCapturedTabs(await chrome.tabs.query(query));
  const duplicateTabs = collectWindowDuplicates(tabs);
  await removeTabs(
    duplicateTabs.map((tab) => tab.id).filter((id): id is number => typeof id === 'number')
  );
  return { removedTabs: duplicateTabs.length };
}

async function deleteSavedGroup(groupId: string) {
  const id = String(groupId || '');
  if (!id) {
    return { deleted: false };
  }
  let deleted = false;
  await updateState((draft) => {
    const group = draft.groups.find((item) => item.id === id);
    if (!group) {
      return draft;
    }
    deleted = true;
    const binEntry = createBinEntry('group', group, { label: group.title });
    return {
      ...draft,
      groups: draft.groups.filter((item) => item.id !== id),
      bin: binEntry ? compactBin([binEntry, ...(draft.bin || [])]) : draft.bin,
      updatedAt: nowIso(),
    };
  });
  return { deleted };
}

interface OpenManagerOptions {
  windowId?: number;
  query?: string;
  targetGroupId?: string;
  feedback?: { storedTabs?: number; cleanedDuplicates?: number } | null;
}

async function openManager({
  windowId,
  query = '',
  targetGroupId = '',
  feedback = null,
}: OpenManagerOptions = {}) {
  const baseUrl = chrome.runtime.getURL(MANAGER_PAGE);
  const params = new URLSearchParams();
  if (query) {
    params.set('q', query);
  }
  if (targetGroupId) {
    params.set('targetGroupId', targetGroupId);
  }
  if (feedback) {
    params.set('saved', String(feedback.storedTabs || 0));
    params.set('duplicates', String(feedback.cleanedDuplicates || 0));
  }
  const targetUrl = params.toString() ? `${baseUrl}?${params}` : baseUrl;
  const tabs = await chrome.tabs.query({});
  const existing = chooseManagerTab(tabs, baseUrl, windowId);

  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true, url: targetUrl });
    if (existing.windowId) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return existing;
  }

  return chrome.tabs.create({
    url: targetUrl,
    active: true,
    ...(windowId ? { windowId } : {}),
  });
}

function chooseManagerTab(
  tabs: chrome.tabs.Tab[],
  baseUrl: string,
  preferredWindowId?: number
): chrome.tabs.Tab | null {
  const managers = tabs.filter((tab) => tab.url?.startsWith(baseUrl));
  return (
    managers.find((tab) => tab.active && tab.windowId === preferredWindowId) ||
    managers.find((tab) => tab.windowId === preferredWindowId) ||
    managers.find((tab) => tab.active) ||
    [...managers].sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] ||
    null
  );
}

async function createWindow() {
  const window = await chrome.windows.create({ focused: true, type: 'normal' });
  return { windowId: window?.id || null };
}

async function closeOpenTab(tabId: number) {
  const normalizedTabId = Number(tabId);
  if (!Number.isSafeInteger(normalizedTabId) || normalizedTabId < 0) {
    throw new Error('A valid tab ID is required');
  }
  await chrome.tabs.remove(normalizedTabId);
  return { tabId: normalizedTabId };
}

interface OpenTabInfo {
  id: number | undefined;
  windowId: number | undefined;
  title: string;
  url: string;
  favIconUrl: string;
  active: boolean;
  pinned: boolean;
  index: number;
  browserGroup: BrowserGroup | null;
  storable: boolean;
}

interface OpenWindowInfo {
  id: number | undefined;
  focused: boolean;
  incognito: boolean;
  tabCount: number;
  tabs: OpenTabInfo[];
}

async function listOpenTabs(): Promise<{ windows: OpenWindowInfo[] }> {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const openWindows: OpenWindowInfo[] = [];
  for (const window of windows) {
    const tabs: OpenTabInfo[] = [];
    for (const tab of window.tabs || []) {
      const storable = canCaptureTab(tab);
      const url = resolveTabUrl(tab);
      tabs.push({
        id: tab.id,
        windowId: tab.windowId,
        title: tab.title || url || 'Untitled',
        url,
        favIconUrl: tab.favIconUrl || '',
        active: Boolean(tab.active),
        pinned: Boolean(tab.pinned),
        index: tab.index || 0,
        browserGroup: await readBrowserGroup(tab),
        storable,
      });
    }
    openWindows.push({
      id: window.id,
      focused: Boolean(window.focused),
      incognito: Boolean(window.incognito),
      tabCount: Array.isArray(window.tabs) ? window.tabs.length : 0,
      tabs,
    });
  }
  return { windows: openWindows };
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

async function getOmniboxSuggestions(text: string): Promise<chrome.omnibox.SuggestResult[]> {
  const query = normalizeSearch(text);
  if (!query) {
    return [];
  }
  const state = normalizeState(await getState());
  const suggestions: chrome.omnibox.SuggestResult[] = [];

  for (const group of state.groups) {
    if (!groupMatchesQuery(group, query)) {
      continue;
    }
    for (const tab of group.tabs) {
      if (!isRestorableTab(tab)) {
        continue;
      }
      if (!tabMatchesQuery(tab, query) && !group.title.toLowerCase().includes(query.toLowerCase())) {
        continue;
      }
      suggestions.push({
        content: `tabb://tab/group/${group.id}/${tab.id}`,
        description: `${escapeXml(tab.title)} <dim>${escapeXml(tab.url)}</dim>`,
      });
      if (suggestions.length >= 6) {
        return suggestions;
      }
    }
  }

  suggestions.push({
    content: query,
    description: `Open TabBoard search for <match>${escapeXml(query)}</match>`,
  });
  return suggestions;
}

function createTabRecord(tab: chrome.tabs.Tab, overrides: { browserGroup?: BrowserGroup | null; url?: string } = {}): TabItem {
  const timestamp = nowIso();
  const url = String(overrides.url || tab.url || '');
  return normalizeTab({
    id: createId('tab'),
    itemType: ITEM_LINK,
    title: tab.title || url,
    url,
    favIconUrl: tab.favIconUrl ?? '',
    pinned: Boolean(tab.pinned),
    incognito: Boolean(tab.incognito),
    sourceWindowId: tab.windowId ?? null,
    sourceTabId: tab.id ?? null,
    browserGroup: overrides.browserGroup ?? null,
    starred: false,
    taskStatus: 'none',
    note: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  }) as TabItem;
}

function createGroupFromTabRecords(
  tabs: TabItem[],
  options: { title?: string; workspaceId?: string; folderId?: string } = {}
): Group {
  const timestamp = nowIso();
  return normalizeGroup({
    id: createId('group'),
    title: options.title || defaultGroupTitle(),
    note: '',
    workspaceId: options.workspaceId,
    folderId: options.folderId || null,
    locked: false,
    starred: false,
    collapsed: false,
    tabs: tabs.map((tab) => normalizeTab(tab)).filter(Boolean),
    createdAt: timestamp,
    updatedAt: timestamp,
  }) as Group;
}

function createBinEntry(
  kind: 'group' | 'tab',
  item: Group | TabItem,
  meta: { label?: string; groupId?: string; groupTitle?: string; source?: string } = {}
) {
  const timestamp = nowIso();
  const normalizedKind = kind === 'group' ? 'group' : 'tab';
  const normalizedItem = normalizedKind === 'group' ? normalizeGroup(item) : normalizeTab(item);
  if (!normalizedItem) {
    return null;
  }
  return normalizeBinEntry({
    id: createId('bin'),
    kind: normalizedKind,
    label: meta.label || normalizedItem.title,
    groupId: meta.groupId || '',
    groupTitle: meta.groupTitle || '',
    source: meta.source || 'group',
    item: normalizedItem,
    deletedAt: timestamp,
  });
}

function sortCapturedTabs(tabs: chrome.tabs.Tab[]): chrome.tabs.Tab[] {
  return [...tabs].sort((a, b) => {
    if ((a.windowId || 0) !== (b.windowId || 0)) {
      return (a.windowId || 0) - (b.windowId || 0);
    }
    return (a.index || 0) - (b.index || 0);
  });
}

function escapeXml(value: string): string {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function saveSelectedTabs(tabIds: number[]) {
  return captureTabs('tab-ids', await getActiveTab(), {
    tabIds,
    openAfter: true,
  });
}
