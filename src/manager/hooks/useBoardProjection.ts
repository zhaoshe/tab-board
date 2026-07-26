import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Group, TabBoardState } from '../../shared/model';
import { useTabBoardStore } from '../../shared/store/useTabBoardStore';
import {
  filterGroupsByQuery,
  getActiveWorkspaceState,
  getBoardProjection,
  type BoardProjection,
  type BoardProjectionState,
  type CategoryFilter,
} from '../core/selectors';
import { useSearchQuery } from './useSearchQuery';

type BoardStateSelector = (state: BoardProjectionState) => BoardProjectionState;

export function createBoardStateSelector(): BoardStateSelector {
  let previousWorkspaceId: string | null = null;
  let previousFolders: TabBoardState['folders'] | null = null;

  return (currentState) => {
    const { workspaceId } = getActiveWorkspaceState(currentState);
    const nextFolders = currentState.folders.filter(
      (folder) => folder.workspaceId === workspaceId,
    );
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

export function useBoardProjection(
  category: CategoryFilter,
): BoardProjection {
  const selectBoardState = useMemo(createBoardStateSelector, []);
  const state = useTabBoardStore(useShallow(selectBoardState));
  const searchQuery = useSearchQuery();
  const categoryProjection = useMemo(
    () => getBoardProjection(state, category, ''),
    [state, category],
  );

  return useMemo(() => ({
    ...categoryProjection,
    visibleGroups: filterGroupsByQuery(
      categoryProjection.categoryGroups,
      searchQuery,
    ),
    searchQuery,
  }), [categoryProjection, searchQuery]);
}

export function useFilteredGroups(category: CategoryFilter): Group[] {
  return useBoardProjection(category).visibleGroups;
}
