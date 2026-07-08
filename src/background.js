import {
  createGroupFromTabRecords,
  createTabRecord,
  defaultGroupTitle,
  escapeXml,
  groupMatchesQuery,
  isRestorableTab,
  isUrlExcluded,
  normalizeState,
  sortCapturedTabs,
  tabMatchesQuery
} from "./model.js";
import { ensureState, getSettings, getState, updateState } from "./store.js";

const MANAGER_PAGE = "manager.html";
const POPUP_PAGE = "popup.html";

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await ensureState();
  await refreshContextMenus();
  await applyActionPopup();
  if (reason === "install") {
    await openManager();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await refreshContextMenus();
  await applyActionPopup();
});

chrome.action.onClicked.addListener(async (tab) => {
  await captureTabs("current-window", tab);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "capture-current-window") {
    await captureTabs("current-window", await getActiveTab());
  }
  if (command === "open-manager") {
    await openManager();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case "open-manager":
      await openManager();
      break;
    case "store-current-tab":
      await captureTabs("current-tab", tab);
      break;
    case "store-current-window":
      await captureTabs("current-window", tab);
      break;
    case "store-all-windows":
      await captureTabs("all-windows", tab);
      break;
    case "store-highlighted-tabs":
      await captureTabs("highlighted-tabs", tab);
      break;
    case "store-tabs-left":
      await captureTabs("tabs-left", tab);
      break;
    case "store-tabs-right":
      await captureTabs("tabs-right", tab);
      break;
    case "store-other-tabs":
      await captureTabs("other-tabs", tab);
      break;
    default:
      break;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.ziptabState) {
    applyActionPopup();
  }
});

chrome.omnibox.setDefaultSuggestion({
  description: "Search ZipTab saved tabs"
});

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  getOmniboxSuggestions(text).then(suggest);
});

chrome.omnibox.onInputEntered.addListener(async (text) => {
  if (text.startsWith("ziptab://tab/")) {
    const [, , , source, groupId, tabId] = text.split("/");
    await restoreTab({ source, groupId, tabId });
    return;
  }
  await openManager({ query: text });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case "capture":
      return captureTabs(message.mode || "current-window", await getActiveTab(), {
        openAfter: message.openAfter !== false,
        tabId: message.tabId,
        tabIds: message.tabIds,
        windowId: message.windowId,
        workspaceId: message.workspaceId
      });
    case "list-open-tabs":
      return listOpenTabs();
    case "open-manager":
      return openManager({ query: message.query || "" });
    case "open-options":
      return chrome.runtime.openOptionsPage();
    case "restore-tab":
      return restoreTab(message);
    case "restore-group":
      return restoreGroup(message.groupId);
    case "restore-refs":
      return restoreRefs(message.refs || []);
    case "restore-all":
      return restoreAll();
    default:
      throw new Error(`Unknown message type: ${message?.type}`);
  }
}

async function refreshContextMenus() {
  await new Promise((resolve) => chrome.contextMenus.removeAll(resolve));
  const contexts = ["page", "selection", "link", "image", "video", "audio", "editable", "action"];
  chrome.contextMenus.create({
    id: "open-manager",
    title: "Open ZipTab",
    contexts
  });
  chrome.contextMenus.create({
    id: "store-current-tab",
    title: "Save this tab to ZipTab",
    contexts
  });
  chrome.contextMenus.create({
    id: "store-current-window",
    title: "Save all tabs in this window",
    contexts
  });
  chrome.contextMenus.create({
    id: "store-highlighted-tabs",
    title: "Save selected tabs",
    contexts: ["page", "action"]
  });
  chrome.contextMenus.create({
    id: "store-tabs-left",
    title: "Save tabs to the left",
    contexts: ["page", "action"]
  });
  chrome.contextMenus.create({
    id: "store-tabs-right",
    title: "Save tabs to the right",
    contexts: ["page", "action"]
  });
  chrome.contextMenus.create({
    id: "store-other-tabs",
    title: "Save all tabs except this one",
    contexts: ["page", "action"]
  });
  chrome.contextMenus.create({
    id: "store-all-windows",
    title: "Save tabs from all windows",
    contexts: ["page", "action"]
  });
}

async function applyActionPopup() {
  const settings = await getSettings();
  await chrome.action.setPopup({ popup: settings.actionClick === "popup" ? POPUP_PAGE : "" });
  await chrome.action.setTitle({
    title: settings.actionClick === "popup" ? "Open ZipTab" : "Save tabs to ZipTab"
  });
}

async function captureTabs(mode, anchorTab, options = {}) {
  const settings = await getSettings();
  const sourceTabs = sortCapturedTabs(await getTabsForMode(mode, anchorTab, options));
  const blankTabs = sourceTabs.filter(isBlankTab);
  const nonBlankTabs = sourceTabs.filter((tab) => !isBlankTab(tab));
  const { uniqueTabs, duplicateTabs } = dedupeSourceTabs(nonBlankTabs, settings);
  const storableTabs = uniqueTabs.filter((tab) => canCaptureTab(tab, settings));
  const skippedByExclude = uniqueTabs.length - storableTabs.length;

  const recordsByWindow = new Map();
  for (const tab of storableTabs) {
    const record = createTabRecord(tab, { browserGroup: await readBrowserGroup(tab) });
    recordsByWindow.set(tab.windowId, [...(recordsByWindow.get(tab.windowId) || []), record]);
  }

  const state = await getState();
  const targetWorkspaceId = options.workspaceId || state.activeWorkspaceId;
  const groups = [...recordsByWindow.entries()].map(([windowId, records]) =>
    createGroupFromTabRecords(records, {
      title: captureTitle(mode, records, windowId),
      workspaceId: targetWorkspaceId
    })
  );
  const result = {
    storedTabs: groups.reduce((total, group) => total + group.tabs.length, 0),
    storedGroups: groups.length,
    skipped: skippedByExclude,
    skippedByExclude,
    cleanedDuplicates: duplicateTabs.length,
    closedBlankTabs: blankTabs.length,
    createdGroupIds: groups.map((group) => group.id)
  };

  if (groups.length) {
    await updateState((draft) => ({ ...draft, groups: [...groups, ...draft.groups] }));
  }

  let managerTab = null;
  if (options.openAfter !== false && settings.openManagerAfterSave) {
    managerTab = await openManager({
      windowId: anchorTab?.windowId,
      targetGroupId: result.createdGroupIds[0] || "",
      feedback: result
    });
  }

  const idsToClose = new Set([
    ...blankTabs.map((tab) => tab.id),
    ...duplicateTabs.map((tab) => tab.id),
    ...(settings.closeTabsAfterSave ? storableTabs.map((tab) => tab.id) : [])
  ]);
  if (managerTab?.id) {
    idsToClose.delete(managerTab.id);
  }
  await removeTabs([...idsToClose].filter(Number.isFinite));

  return result;
}

const BLANK_URL_PATTERN = /^about:blank$/i;

function isBlankTab(tab) {
  return BLANK_URL_PATTERN.test(tab?.url || "");
}

function dedupeSourceTabs(tabs, settings) {
  if (!settings.dedupeOnSave) {
    return { uniqueTabs: tabs, duplicateTabs: [] };
  }
  return tabs.reduce(
    (result, tab) => {
      const url = String(tab.url || "");
      if (!url || !result.seen.has(url)) {
        return {
          seen: url ? new Set([...result.seen, url]) : result.seen,
          uniqueTabs: [...result.uniqueTabs, tab],
          duplicateTabs: result.duplicateTabs
        };
      }
      return { ...result, duplicateTabs: [...result.duplicateTabs, tab] };
    },
    { seen: new Set(), uniqueTabs: [], duplicateTabs: [] }
  );
}

async function getTabsForMode(mode, anchorTab, options = {}) {
  const current = anchorTab || (await getActiveTab());
  if (mode === "all-windows") {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
    return windows.flatMap((window) => window.tabs || []);
  }
  if (mode === "window-id" && Number.isFinite(options.windowId)) {
    return chrome.tabs.query({ windowId: options.windowId });
  }
  if (mode === "current-tab") {
    return current ? [current] : [];
  }
  if (mode === "tab-id" && Number.isFinite(options.tabId)) {
    try {
      return [await chrome.tabs.get(options.tabId)];
    } catch {
      return [];
    }
  }
  if (mode === "tab-ids" && Array.isArray(options.tabIds)) {
    const tabs = [];
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
  if (mode === "highlighted-tabs") {
    const highlighted = tabs.filter((tab) => tab.highlighted);
    return highlighted.length > 1 ? highlighted : [current];
  }
  if (mode === "tabs-left") {
    return tabs.filter((tab) => tab.index < current.index);
  }
  if (mode === "tabs-right") {
    return tabs.filter((tab) => tab.index > current.index);
  }
  if (mode === "other-tabs") {
    return tabs.filter((tab) => tab.id !== current.id);
  }
  return tabs;
}

async function readBrowserGroup(tab) {
  if (!Number.isFinite(tab.groupId) || tab.groupId < 0 || !chrome.tabGroups?.get) {
    return null;
  }
  try {
    const group = await chrome.tabGroups.get(tab.groupId);
    return {
      sourceGroupId: tab.groupId,
      title: group.title || "",
      color: group.color || "grey",
      collapsed: Boolean(group.collapsed)
    };
  } catch {
    return null;
  }
}

function canCaptureTab(tab, settings) {
  if (!tab?.id || !tab.url) {
    return false;
  }
  if (!settings.includePinnedTabs && tab.pinned) {
    return false;
  }
  const ownBase = chrome.runtime.getURL("");
  if (tab.url.startsWith(ownBase)) {
    return false;
  }
  if (/^devtools:/i.test(tab.url) || isBlankTab(tab)) {
    return false;
  }
  return !isUrlExcluded(tab.url, settings);
}

function captureTitle(mode, records, windowId) {
  const base = defaultGroupTitle();
  const count = records.length;
  if (mode === "current-tab") {
    return records[0]?.title || base;
  }
  if (mode === "all-windows") {
    return `${base} - window ${windowId} - ${count} tabs`;
  }
  if (mode === "window-id") {
    return `${base} - window ${windowId} - ${count} tabs`;
  }
  if (mode === "tab-id") {
    return records[0]?.title || base;
  }
  if (mode === "tab-ids") {
    return `${base} - selected tabs`;
  }
  if (mode === "highlighted-tabs") {
    return `${base} - selected tabs`;
  }
  if (mode === "tabs-left") {
    return `${base} - tabs to the left`;
  }
  if (mode === "tabs-right") {
    return `${base} - tabs to the right`;
  }
  if (mode === "other-tabs") {
    return `${base} - other tabs`;
  }
  return `${base} - ${count} tabs`;
}

async function restoreTab({ source = "group", groupId = "", tabId = "" }) {
  const state = await getState();
  const settings = state.settings;
  const found = findTabRef(state, { source, groupId, tabId });
  if (!found) {
    throw new Error("Saved tab not found");
  }
  if (!isRestorableTab(found.tab)) {
    throw new Error("This item is not a restorable link");
  }
  const created = await createChromeTabs([found.tab], { newWindow: false, settings });
  if (settings.deleteRestoredTabs && !found.group?.locked && created.length) {
    await removeRestoredRefs([{ source, groupId, tabId }]);
  }
  return { restoredTabs: created.length };
}

async function restoreGroup(groupId) {
  const state = await getState();
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) {
    throw new Error("Saved group not found");
  }
  const tabs = group.tabs.filter(isRestorableTab);
  const created = await createChromeTabs(tabs, {
    newWindow: state.settings.restoreGroupsInNewWindow,
    settings: state.settings
  });
  if (state.settings.deleteRestoredTabs && !group.locked && created.length) {
    await removeRestoredRefs(
      created.map(({ record }) => ({ source: "group", groupId, tabId: record.id }))
    );
  }
  return { restoredTabs: created.length };
}

async function restoreRefs(refs) {
  const state = await getState();
  const settings = state.settings;
  const found = refs.map((ref) => findTabRef(state, ref)).filter(Boolean);
  const restorable = found.filter((item) => isRestorableTab(item.tab));
  const tabs = restorable.map((item) => item.tab);
  const created = await createChromeTabs(tabs, { newWindow: false, settings });
  if (settings.deleteRestoredTabs && created.length) {
    const createdIds = new Set(created.map(({ record }) => record.id));
    const removableRefs = restorable
      .filter((item) => createdIds.has(item.tab.id) && !item.group?.locked)
      .map((item) => ({ source: item.source, groupId: item.group?.id || "", tabId: item.tab.id }));
    await removeRestoredRefs(removableRefs);
  }
  return { restoredTabs: created.length };
}

async function restoreAll() {
  const state = await getState();
  const restorable = state.groups.flatMap((group) =>
    group.tabs.filter(isRestorableTab).map((tab) => ({ group, tab }))
  );
  const created = await createChromeTabs(restorable.map(({ tab }) => tab), {
    newWindow: state.settings.restoreGroupsInNewWindow,
    settings: state.settings
  });
  if (state.settings.deleteRestoredTabs && created.length) {
    const createdIds = new Set(created.map(({ record }) => record.id));
    const refs = restorable
      .filter(({ group, tab }) => createdIds.has(tab.id) && !group.locked)
      .map(({ group, tab }) => ({ source: "group", groupId: group.id, tabId: tab.id }));
    await removeRestoredRefs(refs);
  }
  return { restoredTabs: created.length };
}

async function createChromeTabs(records, { newWindow, settings }) {
  records = records.filter(isRestorableTab);
  if (!records.length) {
    return [];
  }
  const created = [];
  const focusFirst = settings.focusRestoredTabs !== false;

  if (newWindow) {
    let windowId = null;
    for (const record of records) {
      try {
        if (!Number.isFinite(windowId)) {
          const nextWindow = await chrome.windows.create({ url: record.url, focused: focusFirst && !created.length });
          windowId = nextWindow.id;
          const firstTab = nextWindow.tabs?.[0];
          if (firstTab) {
            created.push({ tab: firstTab, record });
          }
          continue;
        }
        const tab = await chrome.tabs.create({
          windowId,
          url: record.url,
          active: false
        });
        created.push({ tab, record });
      } catch {
        // Keep failed records saved so users can retry or copy the URL.
      }
    }
  } else {
    const activeTab = await getActiveTab();
    let nextIndex = settings.restoreNextToCurrent && Number.isFinite(activeTab?.index)
      ? activeTab.index + 1
      : undefined;
    for (const record of records) {
      const createProperties = {
        url: record.url,
        active: focusFirst && !created.length
      };
      if (activeTab?.windowId) {
        createProperties.windowId = activeTab.windowId;
      }
      if (Number.isFinite(nextIndex)) {
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

async function restoreBrowserGroups(created) {
  if (!chrome.tabs.group || !chrome.tabGroups?.update) {
    return;
  }
  const buckets = new Map();
  for (const item of created) {
    const browserGroup = item.record.browserGroup;
    if (!browserGroup) {
      continue;
    }
    const key = `${browserGroup.sourceGroupId || browserGroup.title || "group"}:${item.tab.windowId}`;
    if (!buckets.has(key)) {
      buckets.set(key, { browserGroup, tabIds: [], windowId: item.tab.windowId });
    }
    buckets.get(key).tabIds.push(item.tab.id);
  }

  for (const bucket of buckets.values()) {
    if (!bucket.tabIds.length) {
      continue;
    }
    try {
      const groupId = await chrome.tabs.group({
        tabIds: bucket.tabIds,
        createProperties: { windowId: bucket.windowId }
      });
      await chrome.tabGroups.update(groupId, {
        title: bucket.browserGroup.title,
        color: bucket.browserGroup.color || "grey",
        collapsed: bucket.browserGroup.collapsed
      });
    } catch {
      // Some Chromium builds restrict grouping restored internal pages.
    }
  }
}

function findTabRef(state, ref) {
  const group = state.groups.find((item) => item.id === ref.groupId);
  const tab = group?.tabs.find((item) => item.id === ref.tabId);
  return group && tab ? { source: "group", group, tab } : null;
}

async function removeRestoredRefs(refs) {
  if (!refs.length) {
    return;
  }
  await updateState((draft) => {
    removeRefsFromState(draft, refs);
    return draft;
  });
}

function removeRefsFromState(state, refs) {
  const groupRefs = new Map();
  for (const ref of refs) {
    if (ref.source !== "group") {
      continue;
    }
    if (!groupRefs.has(ref.groupId)) {
      groupRefs.set(ref.groupId, new Set());
    }
    groupRefs.get(ref.groupId).add(ref.tabId);
  }
  for (const group of state.groups) {
    const ids = groupRefs.get(group.id);
    if (ids) {
      group.tabs = group.tabs.filter((tab) => !ids.has(tab.id));
    }
  }
  state.groups = state.groups.filter((group) => group.tabs.length || group.locked || group.note);
}

async function removeTabs(tabIds) {
  for (const id of tabIds) {
    try {
      await chrome.tabs.remove(id);
    } catch {
      // The tab may already be closed by the user or Chrome may refuse an internal page.
    }
  }
}

async function openManager({ windowId, query = "", targetGroupId = "", feedback = null } = {}) {
  const baseUrl = chrome.runtime.getURL(MANAGER_PAGE);
  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }
  if (targetGroupId) {
    params.set("targetGroupId", targetGroupId);
  }
  if (feedback) {
    params.set("saved", String(feedback.storedTabs || 0));
    params.set("duplicates", String(feedback.cleanedDuplicates || 0));
    params.set("blank", String(feedback.closedBlankTabs || 0));
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
    ...(windowId ? { windowId } : {})
  });
}

function chooseManagerTab(tabs, baseUrl, preferredWindowId) {
  const managers = tabs.filter((tab) => tab.url?.startsWith(baseUrl));
  return (
    managers.find((tab) => tab.active && tab.windowId === preferredWindowId) ||
    managers.find((tab) => tab.windowId === preferredWindowId) ||
    managers.find((tab) => tab.active) ||
    [...managers].sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] ||
    null
  );
}

async function listOpenTabs() {
  const settings = await getSettings();
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const openWindows = [];
  for (const window of windows) {
    const tabs = [];
    for (const tab of window.tabs || []) {
      if (!canCaptureTab(tab, settings)) {
        continue;
      }
      tabs.push({
        id: tab.id,
        windowId: tab.windowId,
        title: tab.title || tab.url || "Untitled",
        url: tab.url || "",
        favIconUrl: tab.favIconUrl || "",
        active: Boolean(tab.active),
        pinned: Boolean(tab.pinned),
        index: tab.index || 0,
        browserGroup: await readBrowserGroup(tab),
        storable: true
      });
    }
    openWindows.push({
      id: window.id,
      focused: Boolean(window.focused),
      incognito: Boolean(window.incognito),
      tabs
    });
  }
  return { windows: openWindows };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

async function getOmniboxSuggestions(text) {
  const query = String(text || "").trim();
  if (!query) {
    return [];
  }
  const state = normalizeState(await getState());
  const suggestions = [];

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
        content: `ziptab://tab/group/${group.id}/${tab.id}`,
        description: `${escapeXml(tab.title)} <dim>${escapeXml(tab.url)}</dim>`
      });
      if (suggestions.length >= 6) {
        return suggestions;
      }
    }
  }

  suggestions.push({
    content: query,
    description: `Open ZipTab search for <match>${escapeXml(query)}</match>`
  });
  return suggestions;
}
