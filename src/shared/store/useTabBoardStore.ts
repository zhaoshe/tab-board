import { create } from 'zustand';
import type { TabBoardState, Workspace, Folder, Group, TabItem, Settings } from '../model';
import {
  createEmptyState,
  normalizeState,
  nowIso,
  createId,
  compactBin,
  STATE_KEY,
  parseImportText,
  exportToJson,
  createNoteRecord,
} from '../model';
import { getState, setState, subscribeState, migrateFromLegacy } from './chromeStorage';
import { emitEvent, AppEvents } from '../utils/events';

interface TabBoardStore extends TabBoardState {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setActiveWorkspace: (workspaceId: string) => void;
  addWorkspace: (name: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;
  addFolder: (workspaceId: string, name: string, color?: string) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
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
  reorderGroupsInFolder: (workspaceId: string, folderId: string | null, starred: boolean, orderedGroupIds: string[]) => void;
  starGroup: (groupId: string) => void;
  lockGroup: (groupId: string) => void;
  collapseGroup: (groupId: string) => void;
  addNoteToGroup: (groupId: string, text: string) => void;
  addTabNote: (groupId: string, tabId: string, text: string) => void;
  updateCategoryOrder: (workspaceId: string, categoryOrder: string[]) => void;
  importGroups: (text: string, options?: { workspaceId?: string; folderId?: string | null }) => void;
  exportAll: () => string;
  toggleFolderCollapsed: (folderId: string) => void;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(state: TabBoardStore) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const { hydrated, ...rest } = state;
    void setState(rest as TabBoardState);
  }, 100);
}

export const useTabBoardStore = create<TabBoardStore>((set, get) => ({
  ...createEmptyState(),
  hydrated: false,

  hydrate: async () => {
    const migration = await migrateFromLegacy();
    const saved = await getState();
    set({ ...saved, hydrated: true });
    subscribeState((newState) => {
      if (!get().hydrated) return;
      set({ ...newState, hydrated: true });
    });
  },

  setActiveWorkspace: (workspaceId) => {
    set({ activeWorkspaceId: workspaceId, updatedAt: nowIso() });
    scheduleSave(get());
  },

  addWorkspace: (name) => {
    const timestamp = nowIso();
    const workspace: Workspace = {
      id: createId('workspace'),
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    set((state) => ({
      workspaces: [...state.workspaces, workspace],
      updatedAt: timestamp,
    }));
    scheduleSave(get());
  },

  renameWorkspace: (id, name) => {
    const timestamp = nowIso();
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === id ? { ...w, name, updatedAt: timestamp } : w
      ),
      updatedAt: timestamp,
    }));
    scheduleSave(get());
  },

  deleteWorkspace: (id) => {
    const state = get();
    if (state.workspaces.length <= 1) return;
    const remaining = state.workspaces.filter((w) => w.id !== id);
    const newActiveId =
      state.activeWorkspaceId === id ? remaining[0].id : state.activeWorkspaceId;
    const timestamp = nowIso();
    set({
      workspaces: remaining,
      activeWorkspaceId: newActiveId,
      groups: state.groups.filter((g) => g.workspaceId !== id),
      folders: state.folders.filter((f) => f.workspaceId !== id),
      updatedAt: timestamp,
    });
    scheduleSave(get());
  },

  addFolder: (workspaceId, name, color = 'slate') => {
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
    set((state) => ({
      folders: [...state.folders, folder],
      updatedAt: timestamp,
    }));
    scheduleSave(get());
  },

  renameFolder: (id, name) => {
    const timestamp = nowIso();
    set((state) => ({
      folders: state.folders.map((f) =>
        f.id === id ? { ...f, name, updatedAt: timestamp } : f
      ),
      updatedAt: timestamp,
    }));
    scheduleSave(get());
  },

  deleteFolder: (id) => {
    const timestamp = nowIso();
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== id),
      groups: state.groups.map((g) =>
        g.folderId === id ? { ...g, folderId: null, updatedAt: timestamp } : g
      ),
      updatedAt: timestamp,
    }));
    scheduleSave(get());
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
    set((state) => ({
      groups: [...state.groups, newGroup],
      updatedAt: timestamp,
    }));
    scheduleSave(get());
    emitEvent(AppEvents.SAVE_SUCCESS, {
      title: newGroup.title,
      tabCount: newGroup.tabs.length,
    });
  },

  updateGroup: (id, updates) => {
    const timestamp = nowIso();
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === id ? { ...g, ...updates, updatedAt: timestamp } : g
      ),
      updatedAt: timestamp,
    }));
    scheduleSave(get());
  },

  deleteGroup: (id) => {
    const state = get();
    const group = state.groups.find((g) => g.id === id);
    if (!group) return;
    const timestamp = nowIso();
    const workspace = state.workspaces.find((w) => w.id === group.workspaceId);
    const folder = group.folderId ? state.folders.find((f) => f.id === group.folderId) : null;
    const binEntry = {
      id: createId('bin'),
      kind: 'group' as const,
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
    };
    set({
      groups: state.groups.filter((g) => g.id !== id),
      bin: compactBin([binEntry, ...state.bin]),
      updatedAt: timestamp,
    });
    scheduleSave(get());
  },

  moveGroup: (groupId, targetFolderId, index) => {
    const state = get();
    const group = state.groups.find((g) => g.id === groupId);
    if (!group) return;
    const timestamp = nowIso();
    const targetGroups = state.groups
      .filter(
        (g) =>
          g.workspaceId === group.workspaceId &&
          g.folderId === targetFolderId &&
          g.starred === group.starred &&
          g.id !== groupId
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const movedGroup = { ...group, folderId: targetFolderId, updatedAt: timestamp };
    const newGroups = [...targetGroups];
    newGroups.splice(index, 0, movedGroup);
    const otherGroups = state.groups.filter(
      (g) =>
        g.workspaceId !== group.workspaceId ||
        g.folderId !== targetFolderId ||
        g.starred !== group.starred ||
        g.id === groupId
    );
    set({
      groups: [...otherGroups.filter((g) => g.id !== groupId), ...newGroups],
      updatedAt: timestamp,
    });
    scheduleSave(get());
  },

  addTabToGroup: (groupId, tab) => {
    const timestamp = nowIso();
    const newTab: TabItem = {
      ...tab,
      id: createId('tab'),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? { ...g, tabs: [...g.tabs, newTab], updatedAt: timestamp }
          : g
      ),
      updatedAt: timestamp,
    }));
    scheduleSave(get());
  },

  updateTab: (groupId, tabId, updates) => {
    const timestamp = nowIso();
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              tabs: g.tabs.map((t) =>
                t.id === tabId ? { ...t, ...updates, updatedAt: timestamp } : t
              ),
              updatedAt: timestamp,
            }
          : g
      ),
      updatedAt: timestamp,
    }));
    scheduleSave(get());
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
    set({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? { ...g, tabs: g.tabs.filter((t) => t.id !== tabId), updatedAt: timestamp }
          : g
      ),
      bin: compactBin([binEntry, ...state.bin]),
      updatedAt: timestamp,
    });
    scheduleSave(get());
  },

  restoreFromBin: (binEntryId) => {
    const state = get();
    const entry = state.bin.find((b) => b.id === binEntryId);
    if (!entry) return;
    const timestamp = nowIso();
    let restoredCount = 0;
    let restoredType = '';
    if (entry.kind === 'group') {
      const originalGroup = entry.item as Group;
      const workspaceExists = state.workspaces.some((w) => w.id === entry.originalWorkspaceId);
      const folderExists = entry.originalFolderId
        ? state.folders.some((f) => f.id === entry.originalFolderId)
        : true;
      const workspaceId = workspaceExists && entry.originalWorkspaceId
        ? entry.originalWorkspaceId
        : state.activeWorkspaceId;
      const folderId = entry.originalFolderId && folderExists
        ? entry.originalFolderId
        : originalGroup.starred
        ? null
        : null;
      const restored = {
        ...originalGroup,
        id: createId('group'),
        workspaceId,
        folderId,
        createdAt: timestamp,
        updatedAt: timestamp,
        tabs: originalGroup.tabs.map((t) => ({
          ...t,
          id: createId('tab'),
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      };
      set({
        groups: [...state.groups, restored],
        bin: state.bin.filter((b) => b.id !== binEntryId),
        updatedAt: timestamp,
      });
      restoredCount = restored.tabs.length;
      restoredType = 'group';
    } else if (entry.kind === 'tab') {
      const originalTab = entry.item as TabItem;
      const targetGroupId = entry.originalGroupId && state.groups.some((g) => g.id === entry.originalGroupId)
        ? entry.originalGroupId
        : null;
      const restoredTab = {
        ...originalTab,
        id: createId('tab'),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      if (targetGroupId) {
        const targetGroup = state.groups.find((g) => g.id === targetGroupId);
        const insertIndex =
          typeof entry.originalIndex === 'number' && entry.originalIndex >= 0
            ? Math.min(entry.originalIndex, targetGroup!.tabs.length)
            : targetGroup!.tabs.length;
        set({
          groups: state.groups.map((g) =>
            g.id === targetGroupId
              ? {
                  ...g,
                  tabs: [
                    ...g.tabs.slice(0, insertIndex),
                    restoredTab,
                    ...g.tabs.slice(insertIndex),
                  ],
                  updatedAt: timestamp,
                }
              : g
          ),
          bin: state.bin.filter((b) => b.id !== binEntryId),
          updatedAt: timestamp,
        });
      } else {
        const firstGroup = state.groups[0];
        if (firstGroup) {
          set({
            groups: state.groups.map((g, idx) =>
              idx === 0
                ? { ...g, tabs: [...g.tabs, restoredTab], updatedAt: timestamp }
                : g
            ),
            bin: state.bin.filter((b) => b.id !== binEntryId),
            updatedAt: timestamp,
          });
        } else {
          return;
        }
      }
      restoredCount = 1;
      restoredType = 'tab';
    }
    scheduleSave(get());
    emitEvent(AppEvents.RESTORE_SUCCESS, {
      type: restoredType,
      count: restoredCount,
      label: entry.label,
    });
  },

  deleteBinEntry: (binEntryId) => {
    set((state) => ({
      bin: state.bin.filter((b) => b.id !== binEntryId),
      updatedAt: nowIso(),
    }));
    scheduleSave(get());
  },

  clearBin: () => {
    set({ bin: [], updatedAt: nowIso() });
    scheduleSave(get());
  },

  updateSettings: (updates) => {
    const timestamp = nowIso();
    set((state) => ({
      settings: { ...state.settings, ...updates },
      updatedAt: timestamp,
    }));
    scheduleSave(get());
  },

  moveTab: (groupId, tabId, targetGroupId, targetIndex) => {
    const state = get();
    const sourceGroup = state.groups.find((g) => g.id === groupId);
    const targetGroup = state.groups.find((g) => g.id === targetGroupId);
    if (!sourceGroup || !targetGroup) return;

    const tabIndex = sourceGroup.tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    const tab = sourceGroup.tabs[tabIndex];
    const timestamp = nowIso();

    set((state) => ({
      groups: state.groups.map((g) => {
        if (g.id === groupId && g.id === targetGroupId) {
          const newTabs = [...g.tabs];
          const [movedTab] = newTabs.splice(tabIndex, 1);
          const adjustedIndex = targetIndex > tabIndex ? targetIndex - 1 : targetIndex;
          newTabs.splice(adjustedIndex, 0, { ...movedTab, updatedAt: timestamp });
          return { ...g, tabs: newTabs, updatedAt: timestamp };
        }
        if (g.id === groupId) {
          return { ...g, tabs: g.tabs.filter((t) => t.id !== tabId), updatedAt: timestamp };
        }
        if (g.id === targetGroupId) {
          const newTabs = [...g.tabs];
          newTabs.splice(targetIndex, 0, { ...tab, updatedAt: timestamp });
          return { ...g, tabs: newTabs, updatedAt: timestamp };
        }
        return g;
      }),
      updatedAt: timestamp,
    }));
    scheduleSave(get());
  },

  reorderGroupsInFolder: (workspaceId, folderId, starred, orderedGroupIds) => {
    const state = get();
    const timestamp = nowIso();
    const orderedSet = new Set(orderedGroupIds);

    const folderGroups = state.groups.filter(
      (g) =>
        g.workspaceId === workspaceId &&
        g.folderId === folderId &&
        g.starred === starred
    );
    const otherGroups = state.groups.filter(
      (g) =>
        !(
          g.workspaceId === workspaceId &&
          g.folderId === folderId &&
          g.starred === starred
        )
    );

    const orderedGroups = orderedGroupIds
      .map((id) => folderGroups.find((g) => g.id === id))
      .filter(Boolean) as Group[];
    const remainingGroups = folderGroups.filter((g) => !orderedSet.has(g.id));

    set({
      groups: [...otherGroups, ...orderedGroups, ...remainingGroups].map((g) =>
        orderedSet.has(g.id) ? { ...g, updatedAt: timestamp } : g
      ),
      updatedAt: timestamp,
    });
    scheduleSave(get());
  },

  starGroup: (groupId) => {
    const state = get();
    const group = state.groups.find((g) => g.id === groupId);
    if (!group) return;
    const timestamp = nowIso();
    const newStarred = !group.starred;
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? { ...g, starred: newStarred, folderId: newStarred ? null : g.folderId, updatedAt: timestamp }
          : g
      ),
      updatedAt: timestamp,
    }));
    scheduleSave(get());
  },

  lockGroup: (groupId) => {
    const state = get();
    const group = state.groups.find((g) => g.id === groupId);
    if (!group) return;
    const timestamp = nowIso();
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, locked: !g.locked, updatedAt: timestamp } : g
      ),
      updatedAt: timestamp,
    }));
    scheduleSave(get());
  },

  collapseGroup: (groupId) => {
    const state = get();
    const group = state.groups.find((g) => g.id === groupId);
    if (!group) return;
    const timestamp = nowIso();
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, collapsed: !g.collapsed, updatedAt: timestamp } : g
      ),
      updatedAt: timestamp,
    }));
    scheduleSave(get());
  },

  addNoteToGroup: (groupId, text) => {
    const state = get();
    const group = state.groups.find((g) => g.id === groupId);
    if (!group) return;
    const timestamp = nowIso();
    const noteTab = createNoteRecord(text);
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? { ...g, note: text, tabs: [...g.tabs, noteTab], updatedAt: timestamp }
          : g
      ),
      updatedAt: timestamp,
    }));
    scheduleSave(get());
  },

  addTabNote: (groupId, tabId, text) => {
    const state = get();
    const group = state.groups.find((g) => g.id === groupId);
    if (!group) return;
    const tab = group.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const timestamp = nowIso();
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              tabs: g.tabs.map((t) =>
                t.id === tabId ? { ...t, note: text, updatedAt: timestamp } : t
              ),
              updatedAt: timestamp,
            }
          : g
      ),
      updatedAt: timestamp,
    }));
    scheduleSave(get());
  },

  updateCategoryOrder: (workspaceId, categoryOrder) => {
    const timestamp = nowIso();
    set((state) => ({
      categoryOrderByWorkspace: {
        ...state.categoryOrderByWorkspace,
        [workspaceId]: categoryOrder,
      },
      updatedAt: timestamp,
    }));
    scheduleSave(get());
  },

  importGroups: (text, options = {}) => {
    const state = get();
    const workspaceId = options.workspaceId || state.activeWorkspaceId;
    const folderId = options.folderId ?? null;
    const importedGroups = parseImportText(text, { workspaceId, folderId });
    if (!importedGroups.length) return;
    const timestamp = nowIso();
    const newGroups = importedGroups.map((g) => ({
      ...g,
      id: createId('group'),
      workspaceId,
      folderId: g.starred ? null : folderId,
      createdAt: timestamp,
      updatedAt: timestamp,
      tabs: g.tabs.map((t) => ({
        ...t,
        id: createId('tab'),
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    }));
    set((state) => ({
      groups: [...state.groups, ...newGroups],
      updatedAt: timestamp,
    }));
    scheduleSave(get());
    emitEvent(AppEvents.IMPORT_SUCCESS, {
      groupCount: newGroups.length,
      tabCount: newGroups.reduce((sum, g) => sum + g.tabs.length, 0),
    });
  },

  exportAll: () => {
    const state = get();
    const { hydrated, ...rest } = state;
    return exportToJson(rest as TabBoardState);
  },

  toggleFolderCollapsed: (folderId) => {
    const state = get();
    const folder = state.folders.find((f) => f.id === folderId);
    if (!folder) return;
    const timestamp = nowIso();
    set((state) => ({
      folders: state.folders.map((f) =>
        f.id === folderId ? { ...f, collapsed: !f.collapsed, updatedAt: timestamp } : f
      ),
      updatedAt: timestamp,
    }));
    scheduleSave(get());
  },
}));
