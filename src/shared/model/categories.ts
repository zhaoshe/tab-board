import { nowIso } from './schema';
import type { Group, TabBoardState } from './types';

export type CategoryFilter =
  | 'inbox'
  | 'saved'
  | 'archive'
  | `folder:${string}`;

export const BUILT_IN_CATEGORIES: readonly CategoryFilter[] = [
  'inbox',
  'saved',
  'archive',
];

export function categoryForGroup(
  state: Pick<TabBoardState, 'folders'>,
  group: Group,
): CategoryFilter {
  if (group.starred) return 'saved';
  if (group.archived) return 'archive';
  if (group.folderId && state.folders.some((folder) =>
    folder.id === group.folderId
    && folder.workspaceId === group.workspaceId)) {
    return `folder:${group.folderId}`;
  }
  return 'inbox';
}

export function categoryMatches(
  state: Pick<TabBoardState, 'folders'>,
  group: Group,
  category: CategoryFilter,
): boolean {
  return categoryForGroup(state, group) === category;
}

export function groupsForCategory(
  state: Pick<TabBoardState, 'groups' | 'folders'>,
  category: CategoryFilter,
  workspaceId: string,
): Group[] {
  return state.groups.filter((group) =>
    group.workspaceId === workspaceId
    && categoryMatches(state, group, category));
}

export function isOwnedCategory(
  state: Pick<TabBoardState, 'folders'>,
  category: CategoryFilter,
  workspaceId: string,
): boolean {
  if (typeof category !== 'string') return false;
  if ((BUILT_IN_CATEGORIES as readonly string[]).includes(category)) return true;
  if (!category.startsWith('folder:')) return false;
  const folderId = category.slice('folder:'.length);
  return folderId.length > 0 && state.folders.some((folder) =>
    folder.id === folderId && folder.workspaceId === workspaceId);
}

export function isOwnedCategoryId(
  state: Pick<TabBoardState, 'folders'>,
  categoryId: string,
  workspaceId: string,
): boolean {
  return typeof categoryId === 'string' && (
    (BUILT_IN_CATEGORIES as readonly string[]).includes(categoryId)
    || (
      categoryId.startsWith('folder:')
      && isOwnedCategory(state, categoryId as CategoryFilter, workspaceId)
    )
  );
}

export function categoryOrder(
  state: Pick<TabBoardState, 'folders' | 'categoryOrderByWorkspace'>,
  workspaceId: string,
): string[] {
  const known = [
    ...BUILT_IN_CATEGORIES,
    ...state.folders
      .filter((folder) => folder.workspaceId === workspaceId)
      .map((folder) => `folder:${folder.id}` as const),
  ];
  const knownSet = new Set<string>(known);
  const folderIds = new Set(state.folders
    .filter((folder) => folder.workspaceId === workspaceId)
    .map((folder) => folder.id));
  const saved = state.categoryOrderByWorkspace[workspaceId] ?? [];
  const ordered = saved
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.startsWith('folder:')
      ? id
      : folderIds.has(id)
        ? `folder:${id}`
        : id)
    .filter((id) => knownSet.has(id));
  return [...new Set([...ordered, ...known])];
}

export function reorderCategoryIds(
  categoryOrderIds: string[],
  sourceId: string,
  targetId: string,
  placement: 'before' | 'after',
): string[] {
  const current = [...categoryOrderIds];
  if (
    sourceId === targetId
    || !sourceId
    || !targetId
    || !current.includes(sourceId)
    || !current.includes(targetId)
  ) {
    return current;
  }
  const withoutSource = current.filter((id) => id !== sourceId);
  const targetIndex = withoutSource.indexOf(targetId);
  if (targetIndex < 0) return current;
  const insertionIndex = placement === 'after' ? targetIndex + 1 : targetIndex;
  return [
    ...withoutSource.slice(0, insertionIndex),
    sourceId,
    ...withoutSource.slice(insertionIndex),
  ];
}

function categoryPlacement(
  state: Pick<TabBoardState, 'folders'>,
  group: Group,
  category: CategoryFilter,
): Pick<Group, 'folderId' | 'starred' | 'archived'> {
  if (category === 'saved') {
    return { folderId: null, starred: true, archived: false };
  }
  if (category === 'archive') {
    return { folderId: null, starred: false, archived: true };
  }
  if (category === 'inbox') {
    return { folderId: null, starred: false, archived: false };
  }
  const folderId = category.slice('folder:'.length);
  const folder = state.folders.find((item) => item.id === folderId);
  if (!folder) throw new Error('Target category does not exist.');
  if (folder.workspaceId !== group.workspaceId) {
    throw new Error('Target category is outside the group workspace.');
  }
  return { folderId, starred: false, archived: false };
}

export function moveSessionToCategory(
  state: TabBoardState,
  input: {
    groupId: string;
    category: CategoryFilter;
    index: number;
  },
  updatedAt = nowIso(),
): TabBoardState {
  const group = state.groups.find((item) => item.id === input.groupId);
  if (!group) throw new Error(`Group not found: ${input.groupId}.`);
  if (!Number.isFinite(input.index)) {
    throw new Error('Session index must be finite.');
  }
  const placement = categoryPlacement(state, group, input.category);
  const sourceIndex = state.groups.findIndex((item) => item.id === group.id);
  const remainingGroups = state.groups.filter((item) => item.id !== group.id);
  const categoryGroups = remainingGroups.filter((item) =>
    item.workspaceId === group.workspaceId
    && categoryMatches(state, item, input.category));
  const targetIndex = Math.max(
    0,
    Math.min(Math.trunc(input.index), categoryGroups.length),
  );
  const movedGroup: Group = {
    ...group,
    ...placement,
    updatedAt,
  };

  let insertionIndex = remainingGroups.length;
  if (categoryGroups.length > 0) {
    const anchorId = categoryGroups[
      Math.min(targetIndex, categoryGroups.length - 1)
    ].id;
    insertionIndex = remainingGroups.findIndex((item) => item.id === anchorId);
    if (targetIndex === categoryGroups.length) insertionIndex += 1;
  } else {
    const sourceWorkspaceIndexes = remainingGroups
      .map((item, itemIndex) =>
        item.workspaceId === group.workspaceId ? itemIndex : -1)
      .filter((itemIndex) => itemIndex >= 0);
    insertionIndex = sourceWorkspaceIndexes.length > 0
      ? sourceWorkspaceIndexes.at(-1)! + 1
      : Math.min(sourceIndex, remainingGroups.length);
  }

  return {
    ...state,
    groups: [
      ...remainingGroups.slice(0, insertionIndex),
      movedGroup,
      ...remainingGroups.slice(insertionIndex),
    ],
    updatedAt: movedGroup.updatedAt,
  };
}

export function insertGroupAtCategoryIndex(
  state: TabBoardState,
  group: Group,
  category: CategoryFilter,
  index: number,
  fallbackIndex?: number,
  updatedAt = nowIso(),
): TabBoardState {
  const placedGroup = {
    ...group,
    ...categoryPlacement(state, group, category),
  };
  const categoryGroups = state.groups.filter((item) =>
    item.workspaceId === placedGroup.workspaceId
    && categoryMatches(state, item, category));
  const targetIndex = Math.max(
    0,
    Math.min(Math.trunc(index), categoryGroups.length),
  );
  let insertionIndex = state.groups.length;
  if (categoryGroups.length) {
    insertionIndex = targetIndex === categoryGroups.length
      ? state.groups.findIndex((item) =>
        item.id === categoryGroups.at(-1)?.id) + 1
      : state.groups.findIndex((item) =>
        item.id === categoryGroups[targetIndex].id);
  } else {
    const workspaceIndexes = state.groups
      .map((item, itemIndex) =>
        item.workspaceId === placedGroup.workspaceId ? itemIndex : -1)
      .filter((itemIndex) => itemIndex >= 0);
    insertionIndex = workspaceIndexes.length
      ? workspaceIndexes.at(-1)! + 1
      : Math.max(
        0,
        Math.min(fallbackIndex ?? state.groups.length, state.groups.length),
      );
  }
  const created = { ...placedGroup, updatedAt };
  return {
    ...state,
    groups: [
      ...state.groups.slice(0, insertionIndex),
      created,
      ...state.groups.slice(insertionIndex),
    ],
    updatedAt,
  };
}
