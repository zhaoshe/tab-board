import { groupMatchesQuery, normalizeSearch } from '../../shared/model/search';
import type { Folder, Group, TabBoardState } from '../../shared/model';

export type CategoryFilter = 'inbox' | 'saved' | 'archive' | `folder:${string}`;

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
    (group) => !group.starred && !group.archived && !isValidFolder(group.folderId, folderById),
  ).length;
  const savedCount = workspaceGroups.filter((group) => group.starred).length;
  const archiveCount = workspaceGroups.filter((group) => group.archived).length;

  return [
    { id: 'inbox', label: 'Inbox', count: inboxCount, kind: 'inbox' },
    { id: 'saved', label: 'Saved', count: savedCount, kind: 'saved' },
    { id: 'archive', label: 'Archive', count: archiveCount, kind: 'archive' },
    ...orderedFolders.map((folder) => ({
      id: `folder:${folder.id}` as const,
      label: folder.name,
      count: workspaceGroups.filter(
        (group) => !group.starred && !group.archived && group.folderId === folder.id,
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

export function getVisibleGroups(
  state: Pick<TabBoardState, 'activeWorkspaceId' | 'workspaces' | 'folders' | 'groups'>,
  filter: CategoryFilter,
  query: string,
): Group[] {
  const { workspaceId, folders } = getActiveWorkspaceState(state);
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const projected = state.groups.filter((group) => {
    if (group.workspaceId !== workspaceId) {
      return false;
    }
    if (filter === 'saved') {
      return group.starred;
    }
    if (filter === 'archive') {
      return group.archived;
    }
    if (filter === 'inbox') {
      return !group.starred && !group.archived && !isValidFolder(group.folderId, folderById);
    }
    return !group.starred && !group.archived && group.folderId === filter.slice('folder:'.length) && isValidFolder(group.folderId, folderById);
  });

  const normalizedQuery = normalizeSearch(query);
  return normalizedQuery
    ? projected.filter((group) => groupMatchesQuery(group, normalizedQuery))
    : projected;
}

function isValidFolder(folderId: string | null, folderById: Map<string, Folder>): boolean {
  return Boolean(folderId && folderById.has(folderId));
}
