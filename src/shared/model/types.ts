export type ItemType = 'link' | 'note';
export type BinEntryKind = 'group' | 'tab';

export interface Settings {
  actionClick: 'store' | 'popup';
  closeTabsAfterSave: boolean;
  dedupeOnSave: boolean;
  deleteRestoredTabs: boolean;
  excludePinned: boolean;
  focusRestoredTabs: boolean;
  includeChromeUrls: boolean;
  includeFileUrls: boolean;
  openManagerAfterSave: boolean;
  restoreGroupsInNewWindow: boolean;
  restoreNextToCurrent: boolean;
  theme: 'system' | 'light' | 'dark';
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  name: string;
  color: string;
  workspaceId: string;
  collapsed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserGroup {
  sourceGroupId: number | null;
  title: string;
  color: string;
  collapsed: boolean;
}

export interface TabItem {
  id: string;
  itemType: ItemType;
  title: string;
  url: string;
  favIconUrl: string;
  note: string;
  pinned: boolean;
  incognito: boolean;
  starred: boolean;
  taskStatus: string;
  browserGroup: BrowserGroup | null;
  sourceWindowId: number | null;
  sourceTabId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Group {
  id: string;
  title: string;
  note: string;
  workspaceId: string;
  folderId: string | null;
  locked: boolean;
  starred: boolean;
  collapsed: boolean;
  tabs: TabItem[];
  createdAt: string;
  updatedAt: string;
}

export interface BinEntry {
  id: string;
  kind: BinEntryKind;
  label: string;
  groupId: string;
  groupTitle: string;
  source: string;
  item: Group | TabItem;
  deletedAt: string;
  originalWorkspaceId?: string;
  originalFolderId?: string | null;
  originalGroupId?: string;
  originalIndex?: number;
  originalFolderName?: string;
  originalWorkspaceName?: string;
}

export interface TabBoardState {
  version: number;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  groups: Group[];
  folders: Folder[];
  categoryOrderByWorkspace: Record<string, string[]>;
  quickList: TabItem[];
  bin: BinEntry[];
  settings: Settings;
  createdAt: string;
  updatedAt: string;
}

export interface TabRef {
  source: string;
  groupId: string;
  tabId: string;
}
