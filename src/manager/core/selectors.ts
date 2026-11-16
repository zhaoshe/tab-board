import { groupMatchesQuery, normalizeSearch } from '../../shared/model/search';
import {
  categoryOrder,
  categoryForGroup,
  groupsForCategory,
  type CategoryFilter,
} from '../../shared/model/categories';
import type { Folder, Group, TabBoardState } from '../../shared/model/types';
export type { CategoryFilter } from '../../shared/model/categories';

export type CategoryStripItem = {
  id: CategoryFilter;
  label: string;
  count: number;
  kind: 'inbox' | 'saved' | 'bookmarks' | 'archive' | 'folder';
  folderId?: string;
};

export type CategoryStripState = Pick<
  TabBoardState,
  'activeWorkspaceId' | 'workspaces' | 'folders' | 'groups' | 'categoryOrderByWorkspace'
> & {
  bookmarkGroups?: readonly Group[];
};

export function getCategoryStrip(state: CategoryStripState): CategoryStripItem[] {
  const { workspaceId, folders } = getActiveWorkspaceState(state);
  const workspaceGroups = state.groups.filter((group) => group.workspaceId === workspaceId);

  const counts = new Map<CategoryFilter, number>();
  for (const group of workspaceGroups) {
    const category = categoryForGroup(state, group);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const items: CategoryStripItem[] = [
    { id: 'inbox', label: 'Inbox', count: counts.get('inbox') ?? 0, kind: 'inbox' },
    { id: 'saved', label: 'Saved', count: counts.get('saved') ?? 0, kind: 'saved' },
    { id: 'bookmarks', label: 'Bookmark', count: state.bookmarkGroups?.length ?? 0, kind: 'bookmarks' },
    { id: 'archive', label: 'Archive', count: counts.get('archive') ?? 0, kind: 'archive' },
    ...folders.map((folder) => ({
      id: `folder:${folder.id}` as const,
      label: folder.name,
      count: counts.get(`folder:${folder.id}`) ?? 0,
      kind: 'folder' as const,
      folderId: folder.id,
    })),
  ];
  const itemById = new Map(items.map((item) => [item.id, item]));
  return categoryOrder(state, workspaceId)
    .map((categoryId) => itemById.get(categoryId as CategoryFilter))
    .filter((item): item is CategoryStripItem => Boolean(item));
}

export function getCanonicalGroupIndexById(
  groups: readonly Group[],
): Map<string, number> {
  return new Map(groups.map((group, index) => [group.id, index]));
}

export function getActiveWorkspaceState(
  state: Pick<TabBoardState, 'activeWorkspaceId' | 'workspaces' | 'folders'>,
): { workspaceId: string; folders: Folder[] } {
  const workspaceId = state.workspaces.some(({ id }) => id === state.activeWorkspaceId)
    ? state.activeWorkspaceId
    : state.workspaces[0]?.id ?? state.activeWorkspaceId;
  return {
    workspaceId,
    folders: state.folders.filter((folder) => folder.workspaceId === workspaceId),
  };
}

export type BoardProjectionState = Pick<
  TabBoardState,
  'activeWorkspaceId' | 'workspaces' | 'folders' | 'groups'
>;

export interface BoardProjection {
  workspaceId: string;
  categoryGroups: Group[];
  visibleGroups: Group[];
  searchQuery: string;
}

export function filterGroupsByQuery(
  groups: Group[],
  searchQuery: string,
): Group[] {
  const normalizedQuery = normalizeSearch(searchQuery);
  return normalizedQuery
    ? groups.filter((group) => groupMatchesQuery(group, normalizedQuery))
    : groups;
}

export function getBoardProjection(
  state: BoardProjectionState,
  category: CategoryFilter,
  searchQuery: string,
): BoardProjection {
  const { workspaceId } = getActiveWorkspaceState(state);
  const categoryGroups = groupsForCategory(state, category, workspaceId);
  return {
    workspaceId,
    categoryGroups,
    visibleGroups: filterGroupsByQuery(categoryGroups, searchQuery),
    searchQuery,
  };
}

export function getVisibleGroups(
  state: BoardProjectionState,
  filter: CategoryFilter,
  query: string,
): Group[] {
  return getBoardProjection(state, filter, query).visibleGroups;
}
