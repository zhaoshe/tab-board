import type { TabBoardState } from '../../shared/model';
import type { CategoryFilter } from './selectors';

export type OpenTabsCaptureSnapshot = {
  selectedTabIds: number[];
  selectedWindowId: number | null;
  workspaceId: string;
  isSelectionMode: boolean;
};

export type CaptureCategorySnapshot = {
  showBin: boolean;
  category: CategoryFilter;
};

export type CaptureFilterSnapshot = {
  searchQuery: string;
  tabFilterUrl: string | null;
};

export function mergeCapturedGroups(
  currentState: TabBoardState,
  persistedState: TabBoardState,
  createdGroupIds: readonly string[],
  workspaceId: string,
): TabBoardState {
  const currentGroupIds = new Set(currentState.groups.map((group) => group.id));
  const createdIds = new Set(createdGroupIds);
  const addedIds = new Set<string>();
  const missingGroups = persistedState.groups.filter((group) => {
    if (group.workspaceId !== workspaceId || !createdIds.has(group.id) || currentGroupIds.has(group.id)) {
      return false;
    }
    if (addedIds.has(group.id)) return false;
    addedIds.add(group.id);
    return true;
  });
  if (!missingGroups.length) return currentState;

  const firstWorkspaceGroupIndex = currentState.groups.findIndex((group) => group.workspaceId === workspaceId);
  const insertionIndex = firstWorkspaceGroupIndex === -1 ? 0 : firstWorkspaceGroupIndex;
  return {
    ...currentState,
    groups: [
      ...currentState.groups.slice(0, insertionIndex),
      ...missingGroups,
      ...currentState.groups.slice(insertionIndex),
    ],
  };
}

export function sameCaptureFilterSnapshot(
  left: CaptureFilterSnapshot,
  right: CaptureFilterSnapshot,
): boolean {
  return left.searchQuery === right.searchQuery
    && left.tabFilterUrl === right.tabFilterUrl;
}

export function shouldKeepPendingCaptureTarget(input: {
  targetCategorySnapshot: CaptureCategorySnapshot | null;
  currentCategorySnapshot: CaptureCategorySnapshot;
  targetFilterSnapshot: CaptureFilterSnapshot | null;
  currentFilterSnapshot: CaptureFilterSnapshot;
  targetGroupExists: boolean;
  elementFound: boolean;
}): boolean {
  return input.elementFound
    && input.targetGroupExists
    && (!input.targetCategorySnapshot
      || sameCaptureCategorySnapshot(input.targetCategorySnapshot, input.currentCategorySnapshot))
    && (!input.targetFilterSnapshot
      || sameCaptureFilterSnapshot(input.targetFilterSnapshot, input.currentFilterSnapshot));
}

export function canRevealCapture(input: {
  sourceWorkspaceId: string;
  activeWorkspaceId: string;
  createdGroupIds: string[];
  categoryCurrent: boolean;
  filterCurrent: boolean;
}): boolean {
  return input.categoryCurrent
    && input.filterCurrent
    && shouldRevealCapture(input);
}

export function sameCaptureCategorySnapshot(
  left: CaptureCategorySnapshot,
  right: CaptureCategorySnapshot,
): boolean {
  return left.showBin === right.showBin
    && left.category === right.category;
}

export function createCaptureSnapshot(input: OpenTabsCaptureSnapshot): OpenTabsCaptureSnapshot {
  return {
    selectedTabIds: normalizeTabIds(input.selectedTabIds),
    selectedWindowId: input.selectedWindowId,
    workspaceId: input.workspaceId,
    isSelectionMode: input.isSelectionMode,
  };
}

export function sameCaptureSnapshot(
  left: OpenTabsCaptureSnapshot,
  right: OpenTabsCaptureSnapshot,
): boolean {
  const normalizedLeft = createCaptureSnapshot(left);
  const normalizedRight = createCaptureSnapshot(right);
  return normalizedLeft.selectedWindowId === normalizedRight.selectedWindowId
    && normalizedLeft.workspaceId === normalizedRight.workspaceId
    && normalizedLeft.isSelectionMode === normalizedRight.isSelectionMode
    && normalizedLeft.selectedTabIds.length === normalizedRight.selectedTabIds.length
    && normalizedLeft.selectedTabIds.every((id, index) => id === normalizedRight.selectedTabIds[index]);
}

export function getCaptureOutcome(input: {
  committed: boolean;
  reconciled: boolean;
  selectionCurrent: boolean;
}): { isSaved: boolean; shouldClearSelection: boolean; shouldReveal: boolean } {
  const isSaved = input.committed;
  const isSuccessful = input.committed && input.reconciled && input.selectionCurrent;
  return {
    isSaved,
    shouldClearSelection: isSuccessful,
    shouldReveal: isSuccessful,
  };
}

export function shouldRevealCapture(input: {
  sourceWorkspaceId: string;
  activeWorkspaceId: string;
  createdGroupIds: string[];
}): boolean {
  return input.sourceWorkspaceId === input.activeWorkspaceId
    && input.createdGroupIds.length > 0;
}

export function getCaptureMessage(input: { committed: boolean; reconciled: boolean }): string {
  if (input.committed && input.reconciled) return 'Tabs saved successfully.';
  if (input.committed) return 'Session was saved, but TabBoard could not locate it.';
  return 'Unable to save tabs.';
}

function normalizeTabIds(tabIds: readonly number[]): number[] {
  return [...new Set(tabIds.filter((id) => Number.isSafeInteger(id)))].sort((left, right) => left - right);
}
