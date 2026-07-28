import { create } from 'zustand';
import type { TabBoardState, Workspace, Folder, Group, TabItem, Settings, BinEntry } from '../model';
import {
  createEmptyState,
  nowIso,
  createId,
  exportToJson,
  createNoteRecord,
} from '../model';
import { sendStateMutations } from './chromeStorage';
import {
  ensureActiveState,
  getActiveState,
  onFallback,
  subscribeActiveState,
} from './activeAdapter';
import type { StateMutation } from './stateMutations';
import {
  resolveRestoreWorkspaceId,
} from './stateMutations';
import {
  importText,
  restoreGroupFromBin,
} from '../model/session-operations';
import type { DropIntent } from '../model/drop-intent';
import type { OpenTabInfo } from '../openTabs';
import { applicationFeedbackChannel } from '../applicationFeedback';
import { createAuthoritativePublication } from './authoritativePublication';
import { feedbackForCommittedMutation } from './stateMutationFeedback';

// Subscribe to file-storage fallback events so that a degraded backend (file
// mode failed, dropped back to browser storage) surfaces as a persistenceError
// in the UI. The subscription is module-level so it lives for the lifetime of
// the page; we don't want to miss a fallback that happens before hydrate().
const unsubscribeFallback = onFallback((reason: string) => {
  // eslint-disable-next-line no-console
  console.warn('[TabBoard] Storage adapter fell back to browser storage:', reason);
  useTabBoardStore.setState({ persistenceError: reason });
});

// Best-effort cleanup on page unload (no-op if the page is already terminating).
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeunload', () => {
    try { unsubscribeFallback(); } catch { /* ignore */ }
  }, { once: true });
}

interface TabBoardStore extends TabBoardState {
  hydrated: boolean;
  persistenceError: string | null;
  hydrate: () => Promise<void>;
  releaseHydration: () => void;
  setActiveWorkspace: (workspaceId: string) => void;
  addWorkspace: (name: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;
  addFolder: (workspaceId: string, name: string, color?: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  addGroup: (group: Omit<Group, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateGroup: (id: string, updates: Partial<Group>) => void;
  deleteGroup: (id: string) => void;
  moveGroup: (groupId: string, targetFolderId: string | null, index: number) => void;
  addTabToGroup: (groupId: string, tab: Omit<TabItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateTab: (groupId: string, tabId: string, updates: Partial<TabItem>) => void;
  deleteTab: (groupId: string, tabId: string) => void;
  restoreFromBin: (binEntryId: string) => void;
  deleteBinEntry: (binEntryId: string) => void;
  clearBin: () => void;
  updateSettings: (updates: Partial<Settings>) => void;
  moveTab: (groupId: string, tabId: string, targetGroupId: string, targetIndex: number) => void;
  applyDropIntent: (intent: DropIntent, openTabs?: readonly OpenTabInfo[]) => Promise<void>;
  reorderGroupsInFolder: (workspaceId: string, folderId: string | null, starred: boolean, archived: boolean, orderedGroupIds: string[]) => void;
  starGroup: (groupId: string) => void;
  lockGroup: (groupId: string) => void;
  collapseGroup: (groupId: string) => void;
  addNoteToGroup: (groupId: string, text: string) => void;
  addTabNote: (groupId: string, tabId: string, text: string) => void;
  updateCategoryOrder: (workspaceId: string, categoryOrder: string[]) => Promise<void>;
  importGroups: (text: string, options?: { workspaceId?: string; folderId?: string | null }) => void;
  exportAll: () => string;
  toggleFolderCollapsed: (folderId: string) => void;
}

function persistenceErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reportError(
  error: unknown,
  source: 'persistence' | 'import' = 'persistence',
  notify = true,
): void {
  const message = persistenceErrorMessage(error);
  useTabBoardStore.setState({ persistenceError: message });
  if (notify) {
    applicationFeedbackChannel.publish({
      kind: 'operation-failed',
      source,
      message,
    });
  }
}

function reportPersistenceError(error: unknown, notify = true): void {
  reportError(error, 'persistence', notify);
}

export function persistedSnapshot(state: TabBoardState): TabBoardState {
  return {
    version: state.version,
    mutationRevision: state.mutationRevision,
    workspaces: state.workspaces,
    activeWorkspaceId: state.activeWorkspaceId,
    groups: state.groups,
    folders: state.folders,
    categoryOrderByWorkspace: state.categoryOrderByWorkspace,
    bin: state.bin,
    dropOperationLedger: state.dropOperationLedger,
    settings: state.settings,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

function findRestoreTabTargetGroup(state: TabBoardState, entry: BinEntry): Group | undefined {
  const workspaceId = resolveRestoreWorkspaceId(state, entry, state.activeWorkspaceId);
  const originalGroup = entry.originalGroupId
    ? state.groups.find((group) => group.id === entry.originalGroupId && group.workspaceId === workspaceId)
    : undefined;
  if (originalGroup) return originalGroup;

  if (entry.originalFolderId) {
    const folderExists = state.folders.some((folder) => folder.id === entry.originalFolderId
      && folder.workspaceId === workspaceId);
    const folderGroup = state.groups.find((group) => group.workspaceId === workspaceId
      && group.folderId === entry.originalFolderId && !group.starred);
    if (folderGroup) return folderGroup;
    if (folderExists) return undefined;
  }

  return state.groups.find((group) => group.workspaceId === workspaceId
    && group.folderId === null && !group.starred);
}

const publication = createAuthoritativePublication({
  readProjection: () => {
    const state = useTabBoardStore.getState();
    return {
      state: persistedSnapshot(state),
      hydrated: state.hydrated,
      persistenceError: state.persistenceError,
    };
  },
  publishProjection: (state, status = {}) => {
    const current = useTabBoardStore.getState();
    useTabBoardStore.setState({
      ...state,
      hydrated: status.hydrated ?? current.hydrated,
      persistenceError: status.persistenceError === undefined
        ? current.persistenceError
        : status.persistenceError,
    });
  },
  patchStatus: (status) => {
    useTabBoardStore.setState(status);
  },
  initializeAuthoritativeState: ensureActiveState,
  subscribeAuthoritativeState: subscribeActiveState,
  sendMutations: sendStateMutations,
  currentContext: () => globalThis.chrome,
  onPersistenceError: reportPersistenceError,
  onMutationCommitted: (mutation) => {
    const feedback = feedbackForCommittedMutation(mutation);
    if (feedback) applicationFeedbackChannel.publish(feedback);
  },
});

function commitMutation(mutation: StateMutation): void {
  publication.commit(mutation);
}

function commitRestoreMutation(mutation: Extract<StateMutation, { type: 'restore-group' | 'restore-tab' }>): void {
  publication.commitRestore(mutation);
}

function commitDropMutation(
  mutation: Extract<StateMutation, { type: 'drop-intent' }>,
): Promise<void> {
  return publication.commitDrop(mutation);
}

function commitCategoryMutation(
  mutation: Extract<
    StateMutation,
    { type: 'add-folder' | 'rename-folder' | 'delete-folder' | 'set-category-order' }
  >,
): Promise<void> {
  return publication.commitCategory(mutation);
}

export const useTabBoardStore = create<TabBoardStore>((set, get) => ({
  ...createEmptyState(),
  hydrated: false,
  persistenceError: null,

  hydrate: () => publication.hydrate(),
  releaseHydration: () => publication.releaseHydration(),

  setActiveWorkspace: (workspaceId) => {
    commitMutation({ type: 'set-active-workspace', workspaceId, updatedAt: nowIso() });
  },

  addWorkspace: (name) => {
    const timestamp = nowIso();
    const workspace: Workspace = {
      id: createId('workspace'),
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    commitMutation({ type: 'add-workspace', workspace });
  },

  renameWorkspace: (id, name) => {
    commitMutation({ type: 'rename-workspace', id, name, updatedAt: nowIso() });
  },

  deleteWorkspace: (id) => {
    const state = get();
    if (state.workspaces.length <= 1) return;
    const remaining = state.workspaces.filter((w) => w.id !== id);
    const newActiveId = state.activeWorkspaceId === id ? remaining[0].id : state.activeWorkspaceId;
    commitMutation({ type: 'delete-workspace', id, newActiveWorkspaceId: newActiveId, updatedAt: nowIso() });
  },

  addFolder: async (workspaceId, name, color = 'slate') => {
    const timestamp = nowIso();
    const folder: Folder = {
      id: createId('folder'),
      name,
      color,
      workspaceId,
      collapsed: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await commitCategoryMutation({ type: 'add-folder', folder });
  },

  renameFolder: async (id, name) => {
    await commitCategoryMutation({ type: 'rename-folder', id, name, updatedAt: nowIso() });
  },

  deleteFolder: async (id) => {
    await commitCategoryMutation({ type: 'delete-folder', id, updatedAt: nowIso() });
  },

  addGroup: (group) => {
    const timestamp = nowIso();
    const newGroup: Group = {
      ...group,
      id: createId('group'),
      tabs: group.tabs.map((t) => ({
        ...t,
        id: createId('tab'),
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    commitMutation({ type: 'add-group', group: newGroup, updatedAt: timestamp });
  },

  updateGroup: (id, updates) => {
    commitMutation({ type: 'update-group', id, updates, updatedAt: nowIso() });
  },

  deleteGroup: (id) => {
    const state = get();
    const group = state.groups.find((g) => g.id === id);
    if (!group) return;
    const timestamp = nowIso();
    const categoryIndex = state.groups
      .filter((item) => item.workspaceId === group.workspaceId && item.folderId === group.folderId && item.starred === group.starred && item.archived === group.archived)
      .findIndex((item) => item.id === id);
    const workspace = state.workspaces.find((w) => w.id === group.workspaceId);
    const folder = group.folderId ? state.folders.find((f) => f.id === group.folderId) : null;
    const binEntry: BinEntry = {
      id: createId('bin'),
      kind: 'group',
      label: group.title,
      groupId: group.id,
      groupTitle: group.title,
      source: 'group',
      item: group,
      deletedAt: timestamp,
      originalWorkspaceId: group.workspaceId,
      originalFolderId: group.folderId,
      originalWorkspaceName: workspace?.name,
      originalFolderName: folder?.name,
      originalIndex: categoryIndex >= 0 ? categoryIndex : undefined,
    };
    commitMutation({ type: 'delete-group', id, binEntry, updatedAt: timestamp });
  },

  moveGroup: (groupId, targetFolderId, index) => {
    const state = get();
    const group = state.groups.find((item) => item.id === groupId);
    if (!group) return;
    const timestamp = nowIso();
    commitMutation({
      type: 'move-group',
      groupId,
      targetFolderId,
      starred: false,
      archived: false,
      index,
      updatedAt: timestamp,
    });
  },

  addTabToGroup: (groupId, tab) => {
    const timestamp = nowIso();
    const newTab: TabItem = {
      ...tab,
      id: createId('tab'),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    commitMutation({ type: 'add-tab', groupId, tab: newTab, updatedAt: timestamp });
  },

  updateTab: (groupId, tabId, updates) => {
    commitMutation({ type: 'update-tab', groupId, tabId, updates, updatedAt: nowIso() });
  },

  deleteTab: (groupId, tabId) => {
    const state = get();
    const group = state.groups.find((g) => g.id === groupId);
    const tab = group?.tabs.find((t) => t.id === tabId);
    if (!group || !tab) return;
    const timestamp = nowIso();
    const tabIndex = group.tabs.findIndex((t) => t.id === tabId);
    const workspace = state.workspaces.find((w) => w.id === group.workspaceId);
    const folder = group.folderId ? state.folders.find((f) => f.id === group.folderId) : null;
    const binEntry = {
      id: createId('bin'),
      kind: 'tab' as const,
      label: tab.title,
      groupId: group.id,
      groupTitle: group.title,
      source: 'group',
      item: tab,
      deletedAt: timestamp,
      originalGroupId: group.id,
      originalIndex: tabIndex,
      originalWorkspaceId: group.workspaceId,
      originalFolderId: group.folderId,
      originalWorkspaceName: workspace?.name,
      originalFolderName: folder?.name,
    };
    commitMutation({ type: 'delete-tab', groupId, tabId, binEntry, updatedAt: timestamp });
  },

  restoreFromBin: (binEntryId) => {
    const state = get();
    const entry = state.bin.find((item) => item.id === binEntryId);
    if (!entry) return;
    const timestamp = nowIso();
    if (entry.kind === 'group') {
      const restoredState = restoreGroupFromBin(persistedSnapshot(state), binEntryId, timestamp);
      const restoredGroup = restoredState.groups.find((group) =>
        group.id === (entry.item as Group).id && group.updatedAt === timestamp,
      );
      if (!restoredGroup) return;
      const restoredIndex = restoredState.groups
        .filter((group) => group.workspaceId === restoredGroup.workspaceId &&
          group.folderId === restoredGroup.folderId && group.starred === restoredGroup.starred)
        .findIndex((group) => group.id === restoredGroup.id && group.updatedAt === timestamp);
      commitRestoreMutation({
        type: 'restore-group',
        entryId: binEntryId,
        group: restoredGroup,
        index: restoredIndex,
        updatedAt: timestamp,
      });
      return;
    }
    const originalTab = entry.item as TabItem;
    const targetGroup = findRestoreTabTargetGroup(state, entry);
    if (!targetGroup) {
      reportPersistenceError(new Error('Unable to restore tab: no legal target group exists in the original workspace/category.'));
      return;
    }
    const index = typeof entry.originalIndex === 'number' && entry.originalIndex >= 0
      ? Math.min(entry.originalIndex, targetGroup.tabs.length)
      : targetGroup.tabs.length;
    const restoredTab: TabItem = { ...originalTab, id: originalTab.id, createdAt: originalTab.createdAt, updatedAt: timestamp };
    commitRestoreMutation({ type: 'restore-tab', entryId: binEntryId, groupId: targetGroup.id, tab: restoredTab, index, updatedAt: timestamp });
  },

  deleteBinEntry: (binEntryId) => {
    commitMutation({ type: 'delete-bin-entry', entryId: binEntryId, updatedAt: nowIso() });
  },

  clearBin: () => {
    commitMutation({ type: 'clear-bin', updatedAt: nowIso() });
  },

  updateSettings: (updates) => {
    commitMutation({ type: 'update-settings', updates, updatedAt: nowIso() });
  },

  moveTab: (groupId, tabId, targetGroupId, targetIndex) => {
    const state = get();
    const sourceGroup = state.groups.find((g) => g.id === groupId);
    const targetGroup = state.groups.find((g) => g.id === targetGroupId);
    if (!sourceGroup || !targetGroup) return;

    const tabIndex = sourceGroup.tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    const timestamp = nowIso();
    commitMutation({ type: 'move-tab', groupId, tabId, targetGroupId, targetIndex, updatedAt: timestamp });
  },

  applyDropIntent: (intent, openTabs = []) => commitDropMutation({
    type: 'drop-intent',
    operationId: createId('drop-operation'),
    intent,
    openTabs: [...openTabs],
    expectedRevision: get().mutationRevision,
    updatedAt: nowIso(),
  }),

  reorderGroupsInFolder: (workspaceId, folderId, starred, archived, orderedGroupIds) => {
    commitMutation({ type: 'reorder-groups', workspaceId, folderId, starred, archived, orderedGroupIds, updatedAt: nowIso() });
  },

  starGroup: (groupId) => {
    const group = get().groups.find((item) => item.id === groupId);
    if (!group) return;
    commitMutation({ type: 'set-group-flags', id: groupId, starred: !group.starred, updatedAt: nowIso() });
  },

  lockGroup: (groupId) => {
    const group = get().groups.find((item) => item.id === groupId);
    if (!group) return;
    commitMutation({ type: 'set-group-flags', id: groupId, locked: !group.locked, updatedAt: nowIso() });
  },

  collapseGroup: (groupId) => {
    const group = get().groups.find((item) => item.id === groupId);
    if (!group) return;
    commitMutation({ type: 'set-group-flags', id: groupId, collapsed: !group.collapsed, updatedAt: nowIso() });
  },

  addNoteToGroup: (groupId, text) => {
    if (!get().groups.some((group) => group.id === groupId)) return;
    const timestamp = nowIso();
    commitMutation({ type: 'set-group-note', groupId, text, noteTab: createNoteRecord(text), updatedAt: timestamp });
  },

  addTabNote: (groupId, tabId, text) => {
    const group = get().groups.find((item) => item.id === groupId);
    if (!group?.tabs.some((tab) => tab.id === tabId)) return;
    commitMutation({ type: 'set-tab-note', groupId, tabId, text, updatedAt: nowIso() });
  },

  updateCategoryOrder: async (workspaceId, categoryOrder) => {
    await commitCategoryMutation({ type: 'set-category-order', workspaceId, categoryOrder, updatedAt: nowIso() });
  },

  importGroups: (text, options = {}) => {
    const state = get();
    const workspaceId = options.workspaceId || state.activeWorkspaceId;
    const folderId = options.folderId ?? null;
    try {
      const importedState = importText(persistedSnapshot(state), text, { workspaceId, folderId });
      const existingIds = new Set(state.groups.map((group) => group.id));
      const newGroups = importedState.groups.filter((group) => !existingIds.has(group.id));
      const updatedAt = importedState.updatedAt;
      commitMutation({ type: 'import-groups', groups: newGroups, updatedAt });
    } catch (error: unknown) {
      reportError(error, 'import');
      throw error;
    }
  },

  exportAll: () => exportToJson(persistedSnapshot(get())),

  toggleFolderCollapsed: (folderId) => {
    const folder = get().folders.find((item) => item.id === folderId);
    if (!folder) return;
    commitMutation({ type: 'set-folder-collapsed', id: folderId, collapsed: !folder.collapsed, updatedAt: nowIso() });
  },
}));
