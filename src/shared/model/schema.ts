import {
  SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  DEFAULT_WORKSPACE_ID,
  BIN_LIMIT,
  ITEM_LINK,
  ITEM_NOTE,
  TASK_NONE,
  LEGACY_ITEM_TODO,
  DROP_OPERATION_LEDGER_LIMIT,
} from './constants';
import type {
  Workspace,
  Folder,
  Group,
  TabItem,
  BinEntry,
  BrowserGroup,
  Settings,
  TabBoardState,
  ItemType,
  BinEntryKind,
  DropOperationLedgerEntry,
} from './types';
import {
  isOperationId,
  isTimestamp,
  utf8ByteLength,
  MAX_CANONICAL_DIGEST_BYTES,
} from '../validation';

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix = 'id'): string {
  const random =
    globalThis.crypto?.randomUUID?.().replaceAll('-', '') ||
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `${prefix}_${Date.now().toString(36)}_${random.slice(0, 12)}`;
}

export function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function createEmptyState(): TabBoardState {
  const timestamp = nowIso();
  return {
    version: SCHEMA_VERSION,
    mutationRevision: 0,
    workspaces: [createDefaultWorkspace(timestamp)],
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    groups: [],
    folders: [],
    categoryOrderByWorkspace: {},
    bin: [],
    dropOperationLedger: [],
    settings: { ...DEFAULT_SETTINGS },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function normalizeState(raw: unknown): TabBoardState {
  const base = createEmptyState();
  if (!raw || typeof raw !== 'object') {
    return base;
  }

  const rawObj = raw as Record<string, unknown>;

  const workspaces = Array.isArray(rawObj.workspaces)
    ? (rawObj.workspaces as unknown[]).map(normalizeWorkspace).filter(Boolean) as Workspace[]
    : [];
  if (!workspaces.length) {
    workspaces.push(createDefaultWorkspace(base.createdAt));
  }
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const defaultWorkspaceId = workspaceIds.has(DEFAULT_WORKSPACE_ID)
    ? DEFAULT_WORKSPACE_ID
    : workspaces[0].id;

  const state: TabBoardState = {
    version: SCHEMA_VERSION,
    mutationRevision: typeof rawObj.mutationRevision === 'number'
      && Number.isSafeInteger(rawObj.mutationRevision)
      && rawObj.mutationRevision >= 0
      ? rawObj.mutationRevision
      : 0,
    workspaces,
    activeWorkspaceId: workspaceIds.has(String(rawObj.activeWorkspaceId))
      ? String(rawObj.activeWorkspaceId)
      : defaultWorkspaceId,
    groups: Array.isArray(rawObj.groups)
      ? (rawObj.groups as unknown[]).map(normalizeGroup).filter(Boolean) as Group[]
      : [],
    folders: Array.isArray(rawObj.folders)
      ? (rawObj.folders as unknown[]).map(normalizeFolder).filter(Boolean) as Folder[]
      : [],
    categoryOrderByWorkspace: normalizeCategoryOrderByWorkspace(
      rawObj.categoryOrderByWorkspace,
      workspaceIds
    ),
    bin: Array.isArray(rawObj.bin)
      ? compactBin((rawObj.bin as unknown[]).map(normalizeBinEntry).filter(Boolean) as BinEntry[])
      : [],
    dropOperationLedger: normalizeDropOperationLedger(rawObj.dropOperationLedger),
    settings: normalizeSettings(rawObj.settings),
    createdAt: typeof rawObj.createdAt === 'string' ? rawObj.createdAt : base.createdAt,
    updatedAt:
      typeof rawObj.updatedAt === 'string'
        ? rawObj.updatedAt
        : typeof rawObj.createdAt === 'string'
        ? rawObj.createdAt
        : base.updatedAt,
  };

  state.folders = state.folders.map((folder) => ({
    ...folder,
    workspaceId: workspaceIds.has(folder.workspaceId) ? folder.workspaceId : defaultWorkspaceId,
  }));
  const folderById = new Map(state.folders.map((folder) => [folder.id, folder]));
  state.groups = state.groups.map((group) => {
    const folder = group.folderId ? folderById.get(group.folderId) : undefined;
    const workspaceId = workspaceIds.has(group.workspaceId)
      ? group.workspaceId
      : folder?.workspaceId || defaultWorkspaceId;
    return {
      ...group,
      folderId: group.starred || folder?.workspaceId !== workspaceId ? null : folder.id,
      workspaceId,
    };
  });

  // Legacy migration: the Quick list / Pinned workflow was retired (2026-07-06).
  // The field is no longer part of the schema, but any residual stored items are
  // preserved as a normal "Former Quick list" session instead of being dropped.
  const legacyQuickList = Array.isArray(rawObj.quickList)
    ? (rawObj.quickList as unknown[]).map(normalizeTab).filter(Boolean) as TabItem[]
    : [];
  if (legacyQuickList.length) {
    state.groups = [
      createGroupFromTabRecords(legacyQuickList, {
        title: 'Former Quick list',
        workspaceId: defaultWorkspaceId,
      }),
      ...state.groups,
    ];
  }

  state.settings.actionClick = state.settings.actionClick === 'popup' ? 'popup' : 'store';
  state.settings.theme = (['system', 'light', 'dark'] as const).includes(state.settings.theme)
    ? state.settings.theme
    : 'system';
  state.settings.storageMode = (['browser', 'file'] as const).includes(state.settings.storageMode)
    ? state.settings.storageMode
    : 'browser';
  if (typeof state.settings.storageFolderName !== 'string') {
    state.settings.storageFolderName = '';
  }
  return state;
}

function normalizeSettings(raw: unknown): Settings {
  const settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') {
    return settings;
  }
  const rawObj = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = rawObj[key];
    if (Object.hasOwn(rawObj, key) && typeof value === typeof DEFAULT_SETTINGS[key]) {
      (settings[key] as unknown) = value;
    }
  }
  return settings;
}

function normalizeDropOperationLedger(raw: unknown): DropOperationLedgerEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries = new Map<string, DropOperationLedgerEntry>();
  for (const value of raw) {
    if (!value || typeof value !== 'object') continue;
    const item = value as Record<string, unknown>;
    if (!isOperationId(item.operationId)
      || typeof item.digest !== 'string'
      || !item.digest
      || utf8ByteLength(item.digest) > MAX_CANONICAL_DIGEST_BYTES
      || !isTimestamp(item.appliedAt)) {
      continue;
    }
    const entry = {
      operationId: item.operationId,
      digest: item.digest,
      appliedAt: item.appliedAt,
    };
    const existing = entries.get(entry.operationId);
    if (!existing || existing.appliedAt <= entry.appliedAt) {
      entries.set(entry.operationId, entry);
    }
  }
  return [...entries.values()]
    .sort((left, right) => left.appliedAt.localeCompare(right.appliedAt))
    .slice(-DROP_OPERATION_LEDGER_LIMIT);
}

function normalizeCategoryOrderByWorkspace(
  raw: unknown,
  workspaceIds: Set<string>
): Record<string, string[]> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const result: Record<string, string[]> = {};
  const rawObj = raw as Record<string, unknown>;
  for (const [workspaceId, order] of Object.entries(rawObj)) {
    if (!workspaceIds.has(workspaceId) || !Array.isArray(order)) {
      continue;
    }
    result[workspaceId] = [...new Set(order.map((item) => String(item)).filter(Boolean))];
  }
  return result;
}

export function createDefaultWorkspace(timestamp = nowIso()): Workspace {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: 'Personal',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function normalizeWorkspace(workspace: unknown): Workspace | null {
  if (!workspace || typeof workspace !== 'object') {
    return null;
  }
  const w = workspace as Record<string, unknown>;
  return {
    id: String(w.id || createId('workspace')),
    name: String(w.name || 'Workspace'),
    createdAt: typeof w.createdAt === 'string' ? w.createdAt : nowIso(),
    updatedAt:
      typeof w.updatedAt === 'string'
        ? w.updatedAt
        : typeof w.createdAt === 'string'
        ? w.createdAt
        : nowIso(),
  };
}

export function normalizeFolder(folder: unknown): Folder | null {
  if (!folder || typeof folder !== 'object') {
    return null;
  }
  const f = folder as Record<string, unknown>;
  return {
    id: String(f.id || createId('folder')),
    name: String(f.name || 'Folder'),
    color: String(f.color || 'slate'),
    workspaceId: f.workspaceId ? String(f.workspaceId) : DEFAULT_WORKSPACE_ID,
    collapsed: Boolean(f.collapsed),
    createdAt: typeof f.createdAt === 'string' ? f.createdAt : nowIso(),
    updatedAt:
      typeof f.updatedAt === 'string'
        ? f.updatedAt
        : typeof f.createdAt === 'string'
        ? f.createdAt
        : nowIso(),
  };
}

export function dedupeTabItems(tabs: TabItem[]): TabItem[] {
  const seenUrls = new Set<string>();
  return tabs.filter((tab) => {
    if (tab.itemType !== ITEM_LINK) return true;
    if (!tab.url) return true;
    if (seenUrls.has(tab.url)) return false;
    seenUrls.add(tab.url);
    return true;
  });
}

export function normalizeGroup(group: unknown): Group | null {
  if (!group || typeof group !== 'object') {
    return null;
  }
  const g = group as Record<string, unknown>;
  const rawTabs = Array.isArray(g.tabs)
    ? (g.tabs as unknown[]).map(normalizeTab).filter(Boolean) as TabItem[]
    : [];
  const tabs = dedupeTabItems(rawTabs);
  const starred = Boolean(g.starred);
  const archived = Boolean(g.archived);
  return {
    id: String(g.id || createId('group')),
    title: String(g.title || defaultGroupTitle()),
    note: String(g.note || ''),
    workspaceId: g.workspaceId ? String(g.workspaceId) : DEFAULT_WORKSPACE_ID,
    folderId: starred || archived ? null : g.folderId ? String(g.folderId) : null,
    locked: Boolean(g.locked),
    starred,
    archived,
    collapsed: Boolean(g.collapsed),
    tabs,
    createdAt: typeof g.createdAt === 'string' ? g.createdAt : nowIso(),
    updatedAt:
      typeof g.updatedAt === 'string'
        ? g.updatedAt
        : typeof g.createdAt === 'string'
        ? g.createdAt
        : nowIso(),
  };
}

export function normalizeTab(tab: unknown): TabItem | null {
  if (!tab || typeof tab !== 'object') {
    return null;
  }
  const t = tab as Record<string, unknown>;
  const itemType: ItemType =
    t.itemType === LEGACY_ITEM_TODO
      ? ITEM_NOTE
      : ([ITEM_LINK, ITEM_NOTE] as readonly string[]).includes(t.itemType as string)
      ? (t.itemType as ItemType)
      : ITEM_LINK;
  if (itemType === ITEM_LINK && !t.url) {
    return null;
  }
  const url = itemType === ITEM_LINK ? String(t.url) : String(t.url || '');
  const note = String(t.note || '');
  const title = String(t.title || url || titleFromText(note) || itemTypeLabel(itemType));
  return {
    id: String(t.id || createId('tab')),
    itemType,
    title,
    url,
    favIconUrl: typeof t.favIconUrl === 'string' ? t.favIconUrl : '',
    note,
    pinned: Boolean(t.pinned),
    incognito: Boolean(t.incognito),
    starred: Boolean(t.starred),
    taskStatus: TASK_NONE,
    browserGroup: normalizeBrowserGroup(t.browserGroup),
    sourceWindowId: typeof t.sourceWindowId === 'number' && Number.isFinite(t.sourceWindowId) ? t.sourceWindowId : null,
    sourceTabId: typeof t.sourceTabId === 'number' && Number.isFinite(t.sourceTabId) ? t.sourceTabId : null,
    createdAt: typeof t.createdAt === 'string' ? t.createdAt : nowIso(),
    updatedAt:
      typeof t.updatedAt === 'string'
        ? t.updatedAt
        : typeof t.createdAt === 'string'
        ? t.createdAt
        : nowIso(),
  };
}

export function normalizeBinEntry(entry: unknown): BinEntry | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const e = entry as Record<string, unknown>;
  const kind: BinEntryKind = e.kind === 'group' ? 'group' : 'tab';
  const itemRaw = e.item ?? e.group ?? e.tab;
  const item = kind === 'group' ? normalizeGroup(itemRaw) : normalizeTab(itemRaw);
  if (!item) {
    return null;
  }
  return {
    id: String(e.id || createId('bin')),
    kind,
    label: String(e.label || item.title || itemTypeLabel((item as TabItem).itemType ?? ITEM_LINK)),
    groupId: typeof e.groupId === 'string' ? e.groupId : '',
    groupTitle: typeof e.groupTitle === 'string' ? e.groupTitle : '',
    source: typeof e.source === 'string' ? e.source : 'group',
    item: item as Group | TabItem,
    deletedAt: typeof e.deletedAt === 'string' ? e.deletedAt : nowIso(),
    originalWorkspaceId: typeof e.originalWorkspaceId === 'string' ? e.originalWorkspaceId : undefined,
    originalFolderId: e.originalFolderId === null ? null : typeof e.originalFolderId === 'string' ? e.originalFolderId : undefined,
    originalGroupId: typeof e.originalGroupId === 'string' ? e.originalGroupId : undefined,
    originalIndex: typeof e.originalIndex === 'number' ? e.originalIndex : undefined,
    originalFolderName: typeof e.originalFolderName === 'string' ? e.originalFolderName : undefined,
    originalWorkspaceName: typeof e.originalWorkspaceName === 'string' ? e.originalWorkspaceName : undefined,
  };
}

export function normalizeBrowserGroup(group: unknown): BrowserGroup | null {
  if (!group || typeof group !== 'object') {
    return null;
  }
  const g = group as Record<string, unknown>;
  return {
    sourceGroupId: typeof g.sourceGroupId === 'number' && Number.isFinite(g.sourceGroupId) ? g.sourceGroupId : null,
    title: typeof g.title === 'string' ? g.title : '',
    color: typeof g.color === 'string' ? g.color : 'grey',
    collapsed: Boolean(g.collapsed),
  };
}

export function compactBin(entries: BinEntry[]): BinEntry[] {
  const valid = entries.filter(Boolean);
  valid.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  return valid.slice(0, BIN_LIMIT);
}

export function itemTypeLabel(itemType: ItemType): string {
  if (itemType === ITEM_NOTE) {
    return 'Note';
  }
  return 'Link';
}

function titleFromText(text: string): string {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join(' ');
}

export function defaultGroupTitle(date = new Date()): string {
  return `Saved ${date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function isRestorableTab(tab: TabItem): boolean {
  return tab?.itemType === ITEM_LINK && Boolean(tab?.url);
}

export function createWorkspace(name: string): Workspace {
  const timestamp = nowIso();
  return {
    id: createId('workspace'),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createFolder(name: string, color: string, workspaceId: string): Folder {
  const timestamp = nowIso();
  return {
    id: createId('folder'),
    name,
    color,
    workspaceId,
    collapsed: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export interface ChromeTabLike {
  id?: number;
  windowId?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  pinned?: boolean;
  incognito?: boolean;
  groupId?: number;
}

export function createTabRecord(
  tab: ChromeTabLike,
  overrides: Partial<TabItem> = {}
): TabItem {
  const timestamp = nowIso();
  const url = String(tab.url || overrides.url || '');
  const title = String(tab.title || overrides.title || url || 'Untitled');
  return {
    id: createId('tab'),
    itemType: ITEM_LINK,
    title,
    url,
    favIconUrl: String(tab.favIconUrl || overrides.favIconUrl || ''),
    note: String(overrides.note || ''),
    pinned: Boolean(tab.pinned || overrides.pinned),
    incognito: Boolean(tab.incognito || overrides.incognito),
    starred: Boolean(overrides.starred),
    taskStatus: TASK_NONE,
    browserGroup: tab.groupId != null ? {
      sourceGroupId: tab.groupId,
      title: '',
      color: 'grey',
      collapsed: false,
    } : overrides.browserGroup ?? null,
    sourceWindowId: typeof tab.windowId === 'number' ? tab.windowId : overrides.sourceWindowId ?? null,
    sourceTabId: typeof tab.id === 'number' ? tab.id : overrides.sourceTabId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

export function createNoteRecord(
  text: string,
  overrides: Partial<TabItem> = {}
): TabItem {
  const timestamp = nowIso();
  const note = String(text || overrides.note || '');
  const title = String(overrides.title || titleFromText(note) || 'Note');
  return {
    id: createId('tab'),
    itemType: ITEM_NOTE,
    title,
    url: String(overrides.url || ''),
    favIconUrl: String(overrides.favIconUrl || ''),
    note,
    pinned: Boolean(overrides.pinned),
    incognito: Boolean(overrides.incognito),
    starred: Boolean(overrides.starred),
    taskStatus: TASK_NONE,
    browserGroup: overrides.browserGroup ?? null,
    sourceWindowId: overrides.sourceWindowId ?? null,
    sourceTabId: overrides.sourceTabId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

export interface CreateGroupOptions {
  title?: string;
  note?: string;
  workspaceId?: string;
  folderId?: string | null;
  locked?: boolean;
  starred?: boolean;
  archived?: boolean;
  collapsed?: boolean;
}

export function createGroupFromTabRecords(
  tabs: TabItem[],
  options: CreateGroupOptions = {}
): Group {
  const timestamp = nowIso();
  return {
    id: createId('group'),
    title: options.title || defaultGroupTitle(),
    note: String(options.note || ''),
    workspaceId: options.workspaceId || DEFAULT_WORKSPACE_ID,
    folderId: options.starred || options.archived ? null : options.folderId ?? null,
    locked: Boolean(options.locked),
    starred: Boolean(options.starred),
    archived: Boolean(options.archived),
    collapsed: Boolean(options.collapsed),
    tabs: tabs.map((tab) => ({ ...tab })),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export interface BinEntryMeta {
  label?: string;
  groupId?: string;
  groupTitle?: string;
  source?: string;
  originalWorkspaceId?: string;
  originalFolderId?: string | null;
  originalGroupId?: string;
  originalIndex?: number;
  originalFolderName?: string;
  originalWorkspaceName?: string;
}

export function createBinEntry(
  kind: BinEntryKind,
  item: Group | TabItem,
  meta: BinEntryMeta = {}
): BinEntry {
  const timestamp = nowIso();
  return {
    id: createId('bin'),
    kind,
    label: meta.label || item.title || '',
    groupId: meta.groupId || (kind === 'group' ? (item as Group).id : ''),
    groupTitle: meta.groupTitle || (kind === 'group' ? (item as Group).title : ''),
    source: meta.source || 'group',
    item,
    deletedAt: timestamp,
    originalWorkspaceId: meta.originalWorkspaceId,
    originalFolderId: meta.originalFolderId,
    originalGroupId: meta.originalGroupId,
    originalIndex: meta.originalIndex,
    originalFolderName: meta.originalFolderName,
    originalWorkspaceName: meta.originalWorkspaceName,
  };
}

export type FolderNameValidation =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'duplicate' };

export function validateFolderName(
  folders: readonly Folder[],
  workspaceId: string,
  name: string,
  excludedFolderId?: string,
): FolderNameValidation {
  const value = String(name ?? '').normalize('NFC').trim();
  if (!value) {
    return { ok: false, reason: 'empty' };
  }
  const key = value.toLocaleLowerCase('en-US');
  const duplicate = folders.some(
    (folder) =>
      folder.workspaceId === workspaceId &&
      folder.id !== excludedFolderId &&
      folder.name.normalize('NFC').trim().toLocaleLowerCase('en-US') === key,
  );
  return duplicate ? { ok: false, reason: 'duplicate' } : { ok: true, value };
}

export interface FindTabRefResult {
  group: Group;
  tab: TabItem;
  index: number;
}

export function findTabRef(
  state: TabBoardState,
  ref: { source: string; groupId: string; tabId: string }
): FindTabRefResult | null {
  if (ref?.source !== 'group' || !ref.groupId || !ref.tabId) {
    return null;
  }
  const group = state.groups.find((g) => g.id === ref.groupId);
  if (!group) {
    return null;
  }
  const index = group.tabs.findIndex((t) => t.id === ref.tabId);
  if (index < 0) {
    return null;
  }
  return { group, tab: group.tabs[index], index };
}

export function resolveRestoreGroupPlacement(
  state: TabBoardState,
  entry: BinEntry,
  snapshotWorkspaceId: string,
  snapshotFolderId: string | null,
  starred: boolean,
  archived: boolean,
): { workspaceId: string; folderId: string | null } {
  const workspaceId = entry.originalWorkspaceId && state.workspaces.some((workspace) => workspace.id === entry.originalWorkspaceId)
    ? entry.originalWorkspaceId
    : entry.originalGroupId
      ? state.groups.find((group) => group.id === entry.originalGroupId)?.workspaceId
      : undefined;
  const folderWorkspaceId = entry.originalFolderId
    ? state.folders.find((folder) => folder.id === entry.originalFolderId)?.workspaceId
    : undefined;
  const resolvedWorkspaceId = workspaceId
    || folderWorkspaceId
    || (state.workspaces.some((workspace) => workspace.id === snapshotWorkspaceId) ? snapshotWorkspaceId : undefined)
    || state.activeWorkspaceId;
  if (starred || archived) return { workspaceId: resolvedWorkspaceId, folderId: null };

  const folderId = entry.originalFolderId !== undefined
    ? entry.originalFolderId
    : snapshotFolderId;
  return {
    workspaceId: resolvedWorkspaceId,
    folderId: folderId && state.folders.some((folder) => folder.id === folderId && folder.workspaceId === resolvedWorkspaceId)
      ? folderId
      : null,
  };
}

export function moveGroupTabs(
  state: TabBoardState,
  sourceGroupId: string,
  tabIds: string[],
  targetGroupId: string,
  targetIndex: number
): TabBoardState {
  const tabIdSet = new Set(tabIds || []);
  if (!tabIdSet.size || !sourceGroupId || !targetGroupId) {
    return state;
  }

  const sourceGroup = state.groups.find((g) => g.id === sourceGroupId);
  const targetGroup = state.groups.find((g) => g.id === targetGroupId);
  if (!sourceGroup || !targetGroup) {
    return state;
  }

  const movedTabs = sourceGroup.tabs.filter((tab) => tabIdSet.has(tab.id));
  if (!movedTabs.length) {
    return state;
  }

  const timestamp = nowIso();
  const insertAt = Math.max(0, Math.min(targetIndex, targetGroup.tabs.length));

  const nextGroups = state.groups.map((group) => {
    if (group.id === sourceGroupId) {
      return {
        ...group,
        tabs: group.tabs.filter((tab) => !tabIdSet.has(tab.id)),
        updatedAt: timestamp,
      };
    }
    if (group.id === targetGroupId) {
      const adjustedInsertAt = sourceGroupId === targetGroupId
        ? Math.max(0, Math.min(targetIndex, group.tabs.length - movedTabs.length))
        : insertAt;
      const remainingTabs = sourceGroupId === targetGroupId
        ? group.tabs.filter((tab) => !tabIdSet.has(tab.id))
        : group.tabs;
      return {
        ...group,
        tabs: [
          ...remainingTabs.slice(0, adjustedInsertAt),
          ...movedTabs,
          ...remainingTabs.slice(adjustedInsertAt),
        ],
        updatedAt: timestamp,
      };
    }
    return group;
  });

  return {
    ...state,
    groups: nextGroups.filter((group) => group.tabs.length > 0 || group.locked || group.note),
    updatedAt: timestamp,
  };
}
