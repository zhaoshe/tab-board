import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTabBoardStore } from '../../shared/store/useTabBoardStore';
import { getActiveWorkspaceState, getVisibleGroups, type CategoryFilter } from '../core/selectors';
import type { Group, TabBoardState } from '../../shared/model';
import { useSearchQuery } from './useSearchQuery';

export { useSearchQuery, useSetSearchQuery } from './useSearchQuery';

type VisibleGroupsSelectorState = Pick<TabBoardState, 'activeWorkspaceId' | 'workspaces' | 'folders' | 'groups'>;

type VisibleGroupsSlice = VisibleGroupsSelectorState;

function createVisibleGroupsSelector(): (state: VisibleGroupsSelectorState) => VisibleGroupsSlice {
  let previousWorkspaceId: string | null = null;
  let previousFolders: TabBoardState['folders'] | null = null;

  return (currentState) => {
    const { workspaceId } = getActiveWorkspaceState(currentState);
    const nextFolders = currentState.folders.filter((folder) => folder.workspaceId === workspaceId);
    const previous = previousFolders;
    const canReuseFolders = previousWorkspaceId === workspaceId
      && previous !== null
      && previous.length === nextFolders.length
      && nextFolders.every((folder, index) => folder === previous[index]);
    const folders = canReuseFolders ? previous : nextFolders;

    previousWorkspaceId = workspaceId;
    previousFolders = folders;
    return {
      activeWorkspaceId: currentState.activeWorkspaceId,
      workspaces: currentState.workspaces,
      folders,
      groups: currentState.groups,
    };
  };
}

export function useFilteredGroups(category: CategoryFilter): Group[] {
  const selectVisibleGroupsState = useMemo(createVisibleGroupsSelector, []);
  const state = useTabBoardStore(useShallow(selectVisibleGroupsState));
  const searchQuery = useSearchQuery();

  return useMemo(
    () => getVisibleGroups(state, category, searchQuery),
    [state, category, searchQuery],
  );
}

export function useWorkspaceFolders() {
  const folders = useTabBoardStore((state) => state.folders);
  const activeWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);
  return folders.filter((folder) => folder.workspaceId === activeWorkspaceId);
}

export function useCurrentWorkspace() {
  const workspaces = useTabBoardStore((state) => state.workspaces);
  const activeWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);
  return workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];
}

export function useWorkspaceStats() {
  const groups = useTabBoardStore((state) => state.groups);
  const folders = useTabBoardStore((state) => state.folders);
  const activeWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);

  const workspaceGroups = groups.filter((g) => g.workspaceId === activeWorkspaceId);
  const workspaceFolders = folders.filter((f) => f.workspaceId === activeWorkspaceId);

  const totalTabs = workspaceGroups.reduce((sum, group) => sum + group.tabs.length, 0);

  return {
    totalSessions: workspaceGroups.length,
    totalTabs,
    totalFolders: workspaceFolders.length,
  };
}
