export const STATE_KEY = "ziptabState";
export const SCHEMA_VERSION = 1;

export const SESSION_ACTION_IDS = Object.freeze([
  "collapse",
  "restore",
  "add",
  "copy",
  "lock",
  "rename",
  "note",
  "delete"
]);

export const DEFAULT_SESSION_EXTERNAL_ACTIONS = Object.freeze(["collapse", "restore", "add"]);

export const DEFAULT_SETTINGS = Object.freeze({
  actionClick: "store",
  closeTabsAfterSave: true,
  confirmDestructive: true,
  dedupeOnSave: false,
  deleteRestoredTabs: true,
  focusRestoredTabs: true,
  includeChromeUrls: false,
  includeFileUrls: false,
  includePinnedTabs: false,
  openManagerAfterSave: true,
  restoreGroupsInNewWindow: false,
  restoreNextToCurrent: true,
  showFavicons: true,
  sessionActionOrder: [...SESSION_ACTION_IDS],
  sessionExternalActions: [...DEFAULT_SESSION_EXTERNAL_ACTIONS],
  theme: "system"
});

export function isKnownSettingKey(key) {
  return Object.hasOwn(DEFAULT_SETTINGS, key);
}

const TASK_NONE = "none";
export const ITEM_LINK = "link";
export const ITEM_NOTE = "note";
export const DEFAULT_WORKSPACE_ID = "workspace_default";
export const BIN_LIMIT = 80;

const LEGACY_ITEM_TODO = "todo";
const URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const SPECIAL_URL_PATTERN = /^(about|chrome|edge|brave|vivaldi|opera|file|ftp):/i;

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix = "id") {
  const random =
    globalThis.crypto?.randomUUID?.().replaceAll("-", "") ||
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `${prefix}_${Date.now().toString(36)}_${random.slice(0, 12)}`;
}

export function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function createEmptyState() {
  const timestamp = nowIso();
  return {
    version: SCHEMA_VERSION,
    workspaces: [createDefaultWorkspace(timestamp)],
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    groups: [],
    folders: [],
    categoryOrderByWorkspace: {},
    quickList: [],
    bin: [],
    settings: { ...DEFAULT_SETTINGS },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function normalizeState(raw) {
  const base = createEmptyState();
  if (!raw || typeof raw !== "object") {
    return base;
  }

  const workspaces = Array.isArray(raw.workspaces)
    ? raw.workspaces.map(normalizeWorkspace).filter(Boolean)
    : [];
  if (!workspaces.length) {
    workspaces.push(createDefaultWorkspace(base.createdAt));
  }
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const defaultWorkspaceId = workspaceIds.has(DEFAULT_WORKSPACE_ID)
    ? DEFAULT_WORKSPACE_ID
    : workspaces[0].id;

  const state = {
    version: SCHEMA_VERSION,
    workspaces,
    activeWorkspaceId: workspaceIds.has(raw.activeWorkspaceId)
      ? String(raw.activeWorkspaceId)
      : defaultWorkspaceId,
    groups: Array.isArray(raw.groups) ? raw.groups.map(normalizeGroup).filter(Boolean) : [],
    folders: Array.isArray(raw.folders) ? raw.folders.map(normalizeFolder).filter(Boolean) : [],
    categoryOrderByWorkspace: normalizeCategoryOrderByWorkspace(raw.categoryOrderByWorkspace, workspaceIds),
    quickList: Array.isArray(raw.quickList) ? raw.quickList.map(normalizeTab).filter(Boolean) : [],
    bin: Array.isArray(raw.bin) ? compactBin(raw.bin.map(normalizeBinEntry).filter(Boolean)) : [],
    settings: normalizeSettings(raw.settings),
    createdAt: raw.createdAt || base.createdAt,
    updatedAt: raw.updatedAt || raw.createdAt || base.updatedAt
  };

  const folderIds = new Set(state.folders.map((folder) => folder.id));
  state.folders = state.folders.map((folder) => ({
    ...folder,
    workspaceId: workspaceIds.has(folder.workspaceId) ? folder.workspaceId : defaultWorkspaceId
  }));
  const workspaceByFolder = new Map(state.folders.map((folder) => [folder.id, folder.workspaceId]));
  state.groups = state.groups.map((group) => ({
    ...group,
    folderId: group.starred ? null : folderIds.has(group.folderId) ? group.folderId : null,
    workspaceId: workspaceIds.has(group.workspaceId)
      ? group.workspaceId
      : workspaceByFolder.get(group.folderId) || defaultWorkspaceId
  }));
  state.settings.actionClick = state.settings.actionClick === "popup" ? "popup" : "store";
  state.settings.theme = ["system", "light", "dark"].includes(state.settings.theme)
    ? state.settings.theme
    : "system";
  state.settings.sessionActionOrder = normalizeSessionActionOrder(state.settings.sessionActionOrder);
  state.settings.sessionExternalActions = normalizeSessionExternalActions(
    state.settings.sessionExternalActions,
    state.settings.sessionActionOrder
  );

  return state;
}

function normalizeSettings(raw) {
  const settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") {
    return settings;
  }
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (Object.hasOwn(raw, key)) {
      settings[key] = raw[key];
    }
  }
  return settings;
}

function normalizeSessionActionOrder(raw) {
  const order = Array.isArray(raw) ? raw.map((item) => String(item)) : [];
  const known = new Set(SESSION_ACTION_IDS);
  return [
    ...new Set(order.filter((item) => known.has(item))),
    ...SESSION_ACTION_IDS.filter((item) => !order.includes(item))
  ];
}

function normalizeSessionExternalActions(raw, order = SESSION_ACTION_IDS) {
  const input = Array.isArray(raw)
    ? raw.map((item) => String(item))
    : [...DEFAULT_SESSION_EXTERNAL_ACTIONS];
  const visible = new Set(input.filter((item) => SESSION_ACTION_IDS.includes(item)));
  return order.filter((item) => visible.has(item));
}

function normalizeCategoryOrderByWorkspace(raw, workspaceIds) {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const result = {};
  for (const [workspaceId, order] of Object.entries(raw)) {
    if (!workspaceIds.has(workspaceId) || !Array.isArray(order)) {
      continue;
    }
    result[workspaceId] = [...new Set(order.map((item) => String(item)).filter(Boolean))];
  }
  return result;
}

export function createDefaultWorkspace(timestamp = nowIso()) {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: "Personal",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function normalizeWorkspace(workspace) {
  if (!workspace || typeof workspace !== "object") {
    return null;
  }
  return {
    id: String(workspace.id || createId("workspace")),
    name: String(workspace.name || "Workspace"),
    createdAt: workspace.createdAt || nowIso(),
    updatedAt: workspace.updatedAt || workspace.createdAt || nowIso()
  };
}

export function normalizeFolder(folder) {
  if (!folder || typeof folder !== "object") {
    return null;
  }
  return {
    id: String(folder.id || createId("folder")),
    name: String(folder.name || "Folder"),
    color: String(folder.color || "slate"),
    workspaceId: folder.workspaceId ? String(folder.workspaceId) : DEFAULT_WORKSPACE_ID,
    collapsed: Boolean(folder.collapsed),
    createdAt: folder.createdAt || nowIso(),
    updatedAt: folder.updatedAt || folder.createdAt || nowIso()
  };
}

export function normalizeGroup(group) {
  if (!group || typeof group !== "object") {
    return null;
  }
  const tabs = Array.isArray(group.tabs) ? group.tabs.map(normalizeTab).filter(Boolean) : [];
  const starred = Boolean(group.starred);
  return {
    id: String(group.id || createId("group")),
    title: String(group.title || defaultGroupTitle()),
    note: String(group.note || ""),
    workspaceId: group.workspaceId ? String(group.workspaceId) : DEFAULT_WORKSPACE_ID,
    folderId: starred ? null : group.folderId ? String(group.folderId) : null,
    locked: Boolean(group.locked),
    starred,
    collapsed: Boolean(group.collapsed),
    tabs,
    createdAt: group.createdAt || nowIso(),
    updatedAt: group.updatedAt || group.createdAt || nowIso()
  };
}

export function normalizeTab(tab) {
  if (!tab || typeof tab !== "object") {
    return null;
  }
  const itemType =
    tab.itemType === LEGACY_ITEM_TODO
      ? ITEM_NOTE
      : [ITEM_LINK, ITEM_NOTE].includes(tab.itemType)
      ? tab.itemType
      : ITEM_LINK;
  if (itemType === ITEM_LINK && !tab.url) {
    return null;
  }
  const url = itemType === ITEM_LINK ? String(tab.url) : String(tab.url || "");
  const note = String(tab.note || "");
  const title = String(tab.title || url || titleFromText(note) || itemTypeLabel(itemType));
  return {
    id: String(tab.id || createId("tab")),
    itemType,
    title,
    url,
    favIconUrl: tab.favIconUrl ? String(tab.favIconUrl) : "",
    note,
    pinned: Boolean(tab.pinned),
    incognito: Boolean(tab.incognito),
    starred: Boolean(tab.starred),
    taskStatus: TASK_NONE,
    browserGroup: normalizeBrowserGroup(tab.browserGroup),
    sourceWindowId: Number.isFinite(tab.sourceWindowId) ? tab.sourceWindowId : null,
    sourceTabId: Number.isFinite(tab.sourceTabId) ? tab.sourceTabId : null,
    createdAt: tab.createdAt || nowIso(),
    updatedAt: tab.updatedAt || tab.createdAt || nowIso()
  };
}

export function normalizeBinEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const kind = entry.kind === "group" ? "group" : "tab";
  const item = kind === "group" ? normalizeGroup(entry.item || entry.group) : normalizeTab(entry.item || entry.tab);
  if (!item) {
    return null;
  }
  return {
    id: String(entry.id || createId("bin")),
    kind,
    label: String(entry.label || item.title || itemTypeLabel(item.itemType)),
    groupId: entry.groupId ? String(entry.groupId) : "",
    groupTitle: entry.groupTitle ? String(entry.groupTitle) : "",
    source: entry.source ? String(entry.source) : "group",
    item,
    deletedAt: entry.deletedAt || nowIso()
  };
}

export function normalizeBrowserGroup(group) {
  if (!group || typeof group !== "object") {
    return null;
  }
  return {
    sourceGroupId: Number.isFinite(group.sourceGroupId) ? group.sourceGroupId : null,
    title: group.title ? String(group.title) : "",
    color: group.color ? String(group.color) : "grey",
    collapsed: Boolean(group.collapsed)
  };
}

export function createWorkspace(name) {
  const timestamp = nowIso();
  return {
    id: createId("workspace"),
    name: String(name || "Workspace"),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createFolder(name, color = "slate", workspaceId = DEFAULT_WORKSPACE_ID) {
  const timestamp = nowIso();
  return {
    id: createId("folder"),
    name: String(name || "Category"),
    color,
    workspaceId,
    collapsed: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createTabRecord(tab, overrides = {}) {
  const timestamp = nowIso();
  const url = String(overrides.url || tab.url || "");
  return normalizeTab({
    id: createId("tab"),
    itemType: ITEM_LINK,
    title: overrides.title || tab.title || url,
    url,
    favIconUrl: overrides.favIconUrl ?? tab.favIconUrl ?? "",
    pinned: overrides.pinned ?? Boolean(tab.pinned),
    incognito: overrides.incognito ?? Boolean(tab.incognito),
    sourceWindowId: overrides.sourceWindowId ?? tab.windowId ?? null,
    sourceTabId: overrides.sourceTabId ?? tab.id ?? null,
    browserGroup: overrides.browserGroup ?? null,
    starred: Boolean(overrides.starred),
    taskStatus: overrides.taskStatus || TASK_NONE,
    note: overrides.note || "",
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export function createNoteRecord(text, overrides = {}) {
  return createTextRecord(ITEM_NOTE, text, overrides);
}

function createTextRecord(itemType, text, overrides = {}) {
  const timestamp = nowIso();
  const note = String(overrides.note ?? text ?? "").trim();
  return normalizeTab({
    id: createId("item"),
    itemType,
    title: overrides.title || titleFromText(note) || itemTypeLabel(itemType),
    url: "",
    favIconUrl: "",
    pinned: false,
    incognito: false,
    sourceWindowId: null,
    sourceTabId: null,
    browserGroup: null,
    starred: Boolean(overrides.starred),
    taskStatus: TASK_NONE,
    note,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export function createGroupFromTabRecords(tabs, options = {}) {
  const timestamp = nowIso();
  return normalizeGroup({
    id: createId("group"),
    title: options.title || defaultGroupTitle(),
    note: options.note || "",
    workspaceId: options.workspaceId || DEFAULT_WORKSPACE_ID,
    folderId: options.folderId || null,
    locked: Boolean(options.locked),
    starred: Boolean(options.starred),
    collapsed: false,
    tabs: tabs.map((tab) => normalizeTab(tab)).filter(Boolean),
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export function createBinEntry(kind, item, meta = {}) {
  const timestamp = nowIso();
  const normalizedKind = kind === "group" ? "group" : "tab";
  const normalizedItem = normalizedKind === "group" ? normalizeGroup(item) : normalizeTab(item);
  if (!normalizedItem) {
    return null;
  }
  return normalizeBinEntry({
    id: createId("bin"),
    kind: normalizedKind,
    label: meta.label || normalizedItem.title || itemTypeLabel(normalizedItem.itemType),
    groupId: meta.groupId || "",
    groupTitle: meta.groupTitle || "",
    source: meta.source || "group",
    item: normalizedItem,
    deletedAt: timestamp
  });
}

export function defaultGroupTitle(date = new Date()) {
  return `Saved ${date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

export function sortCapturedTabs(tabs) {
  return [...tabs].sort((a, b) => {
    if ((a.windowId || 0) !== (b.windowId || 0)) {
      return (a.windowId || 0) - (b.windowId || 0);
    }
    return (a.index || 0) - (b.index || 0);
  });
}

export function collectStats(state) {
  const groups = state.groups.length;
  const savedTabs = state.groups.reduce(
    (total, group) => total + group.tabs.filter(isRestorableTab).length,
    0
  );
  const starredTabs = state.groups.reduce(
    (total, group) => total + group.tabs.filter((tab) => tab.starred).length,
    0
  );
  return { groups, savedTabs, starredTabs };
}

export function tabMatchesQuery(tab, query) {
  const normalized = normalizeSearch(query);
  if (!normalized) {
    return true;
  }
  return [tab.title, tab.url, tab.note, itemTypeLabel(tab.itemType)]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(normalized));
}

export function groupMatchesQuery(group, query) {
  const normalized = normalizeSearch(query);
  if (!normalized) {
    return true;
  }
  return (
    [group.title, group.note].filter(Boolean).some((value) => value.toLowerCase().includes(normalized)) ||
    group.tabs.some((tab) => tabMatchesQuery(tab, query))
  );
}

export function normalizeSearch(query) {
  return String(query || "").trim().toLowerCase();
}

export function getAllUrls(state) {
  const urls = new Set();
  for (const group of state.groups) {
    for (const tab of group.tabs) {
      if (isRestorableTab(tab)) {
        urls.add(tab.url);
      }
    }
  }
  return urls;
}

export function looksLikeUrl(value) {
  const text = String(value || "").trim();
  return URL_PATTERN.test(text) || SPECIAL_URL_PATTERN.test(text);
}

export function coerceUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (looksLikeUrl(text)) {
    return text;
  }
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(text)) {
    return `https://${text}`;
  }
  return "";
}

export function parseImportText(text) {
  const groups = [];
  let currentTitle = "";
  let currentTabs = [];

  const flush = () => {
    if (!currentTabs.length) {
      currentTitle = "";
      return;
    }
    groups.push(createGroupFromTabRecords(currentTabs, { title: currentTitle || defaultGroupTitle() }));
    currentTabs = [];
    currentTitle = "";
  };

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("#")) {
      flush();
      currentTitle = line.replace(/^#+\s*/, "").trim();
      continue;
    }

    const tab = parseImportLine(line);
    if (tab) {
      currentTabs.push(tab);
    }
  }
  flush();
  return groups;
}

export function parseOneTabText(text) {
  const blocks = String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const groups = [];
  for (const [index, block] of blocks.entries()) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) {
      continue;
    }

    let title = "";
    const tabs = [];
    for (const line of lines) {
      const tab = parseOneTabLine(line);
      if (tab) {
        tabs.push(tab);
      } else if (!tabs.length && !title) {
        title = line.replace(/^#+\s*/, "").trim();
      }
    }

    if (tabs.length) {
      groups.push(
        createGroupFromTabRecords(tabs, {
          title: title || `OneTab import ${index + 1}`
        })
      );
    }
  }

  return groups.length ? groups : parseImportText(text);
}

export function parseImportLine(line) {
  const parts = String(line)
    .split(/\s+\|\s+|\t/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    return null;
  }

  let url = "";
  let title = "";
  if (parts.length === 1) {
    url = coerceUrl(parts[0]);
    title = url;
  } else {
    const firstUrl = coerceUrl(parts[0]);
    const lastUrl = coerceUrl(parts.at(-1));
    if (firstUrl) {
      url = firstUrl;
      title = parts.slice(1).join(" | ") || firstUrl;
    } else if (lastUrl) {
      url = lastUrl;
      title = parts.slice(0, -1).join(" | ") || lastUrl;
    }
  }

  if (!url) {
    return null;
  }
  return createTabRecord({ title, url });
}

export function parseOneTabLine(line) {
  const text = String(line || "").trim();
  const markdown = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (markdown) {
    const url = coerceUrl(markdown[2]);
    return url ? createTabRecord({ title: markdown[1].trim() || url, url }) : null;
  }

  const tab = parseImportLine(text);
  if (tab) {
    return tab;
  }

  const urlMatch = text.match(/(https?:\/\/\S+|file:\/\/\S+|ftp:\/\/\S+|chrome:\/\/\S+)/i);
  if (!urlMatch) {
    return null;
  }
  const url = coerceUrl(urlMatch[1]);
  if (!url) {
    return null;
  }
  const title = text
    .replace(urlMatch[1], "")
    .replace(/^[\s|:-]+|[\s|:-]+$/g, "")
    .trim();
  return createTabRecord({ title: title || url, url });
}

export function groupsToText(groups) {
  return groups
    .map((group) => {
      const lines = [`# ${group.title}`];
      if (group.note) {
        lines.push(`# note: ${group.note}`);
      }
      for (const tab of group.tabs) {
        lines.push(tabToText(tab));
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export function tabsToText(tabs) {
  return tabs.map(tabToText).join("\n");
}

export function tabToText(tab) {
  if (isRestorableTab(tab)) {
    return `${tab.title} | ${tab.url}`;
  }
  return `NOTE ${tab.note || tab.title}`.trim();
}

export function isRestorableTab(tab) {
  return tab?.itemType === ITEM_LINK && Boolean(tab?.url);
}

export function itemTypeLabel(itemType) {
  if (itemType === ITEM_NOTE) {
    return "Note";
  }
  return "Link";
}

export function compactBin(entries) {
  return entries.filter(Boolean).slice(0, BIN_LIMIT);
}

export function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function titleFromText(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join(" ");
}
