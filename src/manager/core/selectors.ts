import { groupMatchesQuery, normalizeSearch } from '../../shared/model/search';
import {
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
  kind: 'inbox' | 'saved' | 'archive' | 'folder';
  folderId?: string;
};

export type CategoryStripState = Pick<
  TabBoardState,
  'activeWorkspaceId' | 'workspaces' | 'folders' | 'groups' | 'categoryOrderByWorkspace'
>;

export function getCategoryStrip(state: CategoryStripState): CategoryStripItem[] {
  const { workspaceId, folders } = getActiveWorkspaceState(state);
  const workspaceGroups = state.groups.filter((group) => group.workspaceId === workspaceId);
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const orderedFolderIds = state.categoryOrderByWorkspace[workspaceId] ?? [];
  const orderedFolders: Folder[] = [];
  const includedFolderIds = new Set<string>();

  for (const rawId of orderedFolderIds) {
    if (typeof rawId !== 'string') continue;
    const folderId = rawId.startsWith('folder:') ? rawId.slice('folder:'.length) : rawId;
    const folder = folderById.get(folderId);
    if (!folder || includedFolderIds.has(folder.id)) continue;
    includedFolderIds.add(folder.id);
    orderedFolders.push(folder);
  }

  for (const folder of folders) {
    if (includedFolderIds.has(folder.id)) continue;
    includedFolderIds.add(folder.id);
    orderedFolders.push(folder);
  }

  const inboxCount = workspaceGroups.filter(
    (group) => categoryForGroup(state, group) === 'inbox',
  ).length;
  const savedCount = workspaceGroups.filter(
    (group) => categoryForGroup(state, group) === 'saved',
  ).length;
  const archiveCount = workspaceGroups.filter(
    (group) => categoryForGroup(state, group) === 'archive',
  ).length;

  return [
    { id: 'inbox', label: 'Inbox', count: inboxCount, kind: 'inbox' },
    { id: 'saved', label: 'Saved', count: savedCount, kind: 'saved' },
    { id: 'archive', label: 'Archive', count: archiveCount, kind: 'archive' },
    ...orderedFolders.map((folder) => ({
      id: `folder:${folder.id}` as const,
      label: folder.name,
      count: workspaceGroups.filter(
        (group) => categoryForGroup(state, group) === `folder:${folder.id}`,
      ).length,
      kind: 'folder' as const,
      folderId: folder.id,
    })),
  ];
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
