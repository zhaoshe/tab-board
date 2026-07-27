import { isStorableCaptureCandidate } from '../../shared/model/capture-policy';
import {
  categoryForGroup,
  categoryOrder,
  groupsForCategory,
  isOwnedCategory,
  isOwnedCategoryId,
  reorderCategoryIds,
  type CategoryFilter,
} from '../../shared/model/categories';
import type {
  DropIntent,
  SavedTabRef,
} from '../../shared/model/drop-intent';
import type { Group, TabBoardState } from '../../shared/model/types';
import type { OpenTabInfo } from '../../shared/openTabs';
export type { DropIntent, SavedTabRef } from '../../shared/model/drop-intent';

export type DragPayload =
  | { kind: 'group'; groupId: string; workspaceId: string }
  | { kind: 'category'; categoryId: string; workspaceId: string }
  | { kind: 'tab'; groupId: string; tabId: string; workspaceId: string }
  | { kind: 'tabs'; refs: Array<SavedTabRef>; workspaceId: string }
  | { kind: 'open-tabs'; tabIds: number[]; windowId: number; workspaceId: string };

export type DropTarget =
  | { kind: 'group-body'; groupId: string; workspaceId: string }
  | {
      kind: 'tab-before';
      groupId: string;
      tabId: string;
      index: number;
      placement?: 'before' | 'after';
      workspaceId: string;
    }
  | { kind: 'new-group'; category: CategoryFilter; index: number; workspaceId: string }
  | { kind: 'group-insert'; category: CategoryFilter; index: number; workspaceId: string }
  | { kind: 'category-column'; category: CategoryFilter; workspaceId: string }
  | { kind: 'category-reorder'; categoryId: string; placement: 'before' | 'after'; workspaceId: string };

export interface DragSourceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DragPlaceholderStyle {
  width?: number;
  height?: number;
}

export function getDragPlaceholderStyle(sourceRect: DragSourceRect | null): DragPlaceholderStyle {
  return {
    width: sourceRect?.width,
    height: sourceRect?.height,
  };
}

export type DragMarker =
  | { kind: 'group'; index: number }
  | { kind: 'tab'; groupId: string; tabId?: string; placement: 'before' | 'body' | 'after' }
  | { kind: 'category'; categoryId: string; placement: 'after' }
  | { kind: 'category-reorder'; categoryId: string; placement: 'before' | 'after' };

export interface DragUiState {
  payload: DragPayload | null;
  target: DropTarget | null;
  sourceRect: DragSourceRect | null;
  marker: DragMarker | null;
}

export const IDLE_DRAG_STATE = {
  payload: null,
  target: null,
  sourceRect: null,
  marker: null,
} as const;

const TAB_DROP_EDGE_RATIO = 0.25;
const DEFAULT_DROP_TARGET_RELEASE_MARGIN = 12;

export function clearDragState(_state?: DragUiState): DragUiState {
  return {
    payload: null,
    target: null,
    sourceRect: null,
    marker: null,
  };
}

export function lockDropTarget(
  previous: DropTarget | null,
  candidate: DropTarget | null,
  geometry: { distance: number; releaseMargin: number },
): DropTarget | null {
  if (!previous || geometry.distance > geometry.releaseMargin) {
    return candidate;
  }
  return previous;
}

export function getTabDropPlacement(rect: DOMRect, clientY: number): 'before' | 'body' | 'after' {
  if (!Number.isFinite(rect.height) || rect.height <= 0 || !Number.isFinite(clientY)) {
    return 'body';
  }
  const ratio = (clientY - rect.top) / rect.height;
  if (ratio < TAB_DROP_EDGE_RATIO) return 'before';
  if (ratio > 1 - TAB_DROP_EDGE_RATIO) return 'after';
  return 'body';
}

export const DROP_TARGET_RELEASE_MARGIN = DEFAULT_DROP_TARGET_RELEASE_MARGIN;

export interface DndData {
  payload?: DragPayload;
  targets?: DropTarget[];
  groupIndex?: number;
  groupCategory?: CategoryFilter;
  records?: OpenTabInfo[];
}

export interface ResolveDropInput {
  payload: DragPayload;
  target: DropTarget;
  state: TabBoardState;
  openTabs?: readonly OpenTabInfo[];
  extensionBaseUrl?: string;
}

export function isDragSourceStillRendered(
  payload: DragPayload,
  groups: readonly Group[],
): boolean {
  if (payload.kind === 'category' || payload.kind === 'open-tabs') return true;
  if (payload.kind === 'group') {
    return groups.some((group) => group.id === payload.groupId);
  }
  if (payload.kind === 'tab') {
    return groups.some((group) => group.id === payload.groupId
      && group.tabs.some((tab) => tab.id === payload.tabId));
  }
  return payload.refs.length > 0 && payload.refs.every((ref) => groups.some((group) => group.id === ref.groupId
    && group.tabs.some((tab) => tab.id === ref.tabId)));
}

export function resolveDrop({
  payload,
  target,
  state,
  openTabs = [],
  extensionBaseUrl = '',
}: ResolveDropInput): DropIntent | null {
  const workspaceId = payload.workspaceId;
  if (!isValidWorkspaceBoundary(state, workspaceId) || target.workspaceId !== workspaceId) {
    return null;
  }

  if (payload.kind === 'group') {
    return resolveGroupDrop(payload, target, state);
  }
  if (payload.kind === 'category') {
    return resolveCategoryDrop(payload, target, state);
  }
  if (payload.kind === 'tab') {
    return resolveSavedTabsDrop(
      { ...payload, kind: 'tabs', refs: [{ groupId: payload.groupId, tabId: payload.tabId }] },
      target,
      state,
    );
  }
  if (payload.kind === 'tabs') {
    return resolveSavedTabsDrop(payload, target, state);
  }
  if (payload.kind === 'open-tabs') {
    return resolveOpenTabsDrop(payload, target, state, openTabs, extensionBaseUrl);
  }
  return null;
}

function resolveGroupDrop(
  payload: Extract<DragPayload, { kind: 'group' }>,
  target: DropTarget,
  state: TabBoardState,
): DropIntent | null {
  const source = getOwnedGroup(state, payload.groupId, payload.workspaceId);
  if (!source || (target.kind !== 'group-insert' && target.kind !== 'category-column')) {
    return null;
  }
  const category = target.category;
  if (!isOwnedCategory(state, category, payload.workspaceId)) {
    return null;
  }

  const sourceCategory = categoryForGroup(state, source);
  const sourceCategoryGroups = groupsForCategory(state, sourceCategory, payload.workspaceId);
  const sourceIndex = sourceCategoryGroups.findIndex(
    (group) => group.id === source.id,
  );
  const categoryGroups = groupsForCategory(state, category, payload.workspaceId)
    .filter((group) => group.id !== source.id);
  const requestedIndex = target.kind === 'category-column' ? categoryGroups.length : target.index;
  const boundaryLength = sourceCategory === category
    ? sourceCategoryGroups.length
    : categoryGroups.length;
  if (!isValidInsertionIndex(requestedIndex, boundaryLength)) {
    return null;
  }
  const finalIndex = sourceCategory === category && sourceIndex >= 0 && sourceIndex < requestedIndex
    ? requestedIndex - 1
    : requestedIndex;
  if (!isValidInsertionIndex(finalIndex, categoryGroups.length)) {
    return null;
  }
  if (sourceCategory === category && finalIndex === sourceIndex) {
    return null;
  }

  return {
    kind: 'move-session',
    groupId: source.id,
    category,
    index: finalIndex,
    workspaceId: payload.workspaceId,
  };
}

function resolveCategoryDrop(
  payload: Extract<DragPayload, { kind: 'category' }>,
  target: DropTarget,
  state: TabBoardState,
): DropIntent | null {
  if (target.kind !== 'category-reorder') {
    return null;
  }
  if (!isOwnedCategoryId(state, payload.categoryId, payload.workspaceId)
    || !isOwnedCategoryId(state, target.categoryId, payload.workspaceId)
    || payload.categoryId === target.categoryId
    || (target.placement !== 'before' && target.placement !== 'after')) {
    return null;
  }
  const order = categoryOrder(state, payload.workspaceId);
  if (!order.includes(payload.categoryId) || !order.includes(target.categoryId)) {
    return null;
  }
  const nextOrder = reorderCategoryIds(
    order,
    payload.categoryId,
    target.categoryId,
    target.placement,
  );
  if (nextOrder.length === order.length && nextOrder.every((id, index) => id === order[index])) {
    return null;
  }
  return {
    kind: 'reorder-category',
    categoryId: payload.categoryId,
    targetCategoryId: target.categoryId,
    placement: target.placement,
    workspaceId: payload.workspaceId,
  };
}

function resolveSavedTabsDrop(
  payload: Extract<DragPayload, { kind: 'tabs' }>,
  target: DropTarget,
  state: TabBoardState,
): DropIntent | null {
  const refs = normalizeSavedRefs(payload.refs);
  if (!refs.length || refs.length !== payload.refs.length) {
    return null;
  }
  if (!refs.every((ref) => Boolean(getOwnedTab(state, ref, payload.workspaceId)))) {
    return null;
  }

  if (target.kind === 'group-body' || target.kind === 'tab-before') {
    const targetGroup = getOwnedGroup(state, target.groupId, payload.workspaceId);
    if (!targetGroup) {
      return null;
    }
    const targetTabIndex = target.kind === 'tab-before'
      ? targetGroup.tabs.findIndex((tab) => tab.id === target.tabId)
      : -1;
    if (target.kind === 'tab-before'
      && (targetTabIndex < 0 || target.index !== targetTabIndex)) {
      return null;
    }
    if (target.kind === 'tab-before' && refs.some((ref) => ref.groupId === target.groupId && ref.tabId === target.tabId)) {
      return null;
    }

    const refsInTarget = refs.filter((ref) => ref.groupId === target.groupId);
    const insertionBoundary = target.kind === 'group-body'
      ? targetGroup.tabs.length
      : target.index + (target.placement === 'after' ? 1 : 0);
    const targetIndex = target.kind === 'group-body'
      ? targetGroup.tabs.length - refsInTarget.length
      : insertionBoundary - refsInTarget.filter((ref) => {
        const index = targetGroup.tabs.findIndex((tab) => tab.id === ref.tabId);
        return index >= 0 && index < insertionBoundary;
      }).length;
    const remainingLength = targetGroup.tabs.length - refsInTarget.length;
    if (!isValidInsertionIndex(targetIndex, remainingLength)) {
      return null;
    }
    if (isSavedTabMoveNoOp(state, refs, targetGroup, targetIndex)) {
      return null;
    }
    return {
      kind: 'move-tabs',
      refs,
      targetGroupId: target.groupId,
      targetIndex,
      workspaceId: payload.workspaceId,
    };
  }

  if (target.kind === 'new-group' || target.kind === 'group-insert' || target.kind === 'category-column') {
    if (!isOwnedCategory(state, target.category, payload.workspaceId)) {
      return null;
    }
    const categoryGroups = groupsForCategory(state, target.category, payload.workspaceId);
    const index = target.kind === 'category-column' ? categoryGroups.length : target.index;
    if (!isValidInsertionIndex(index, categoryGroups.length)) {
      return null;
    }
    return {
      kind: 'create-session',
      source: { kind: 'saved-tabs', refs },
      category: target.category,
      index,
      workspaceId: payload.workspaceId,
    };
  }
  return null;
}

function resolveOpenTabsDrop(
  payload: Extract<DragPayload, { kind: 'open-tabs' }>,
  target: DropTarget,
  state: TabBoardState,
  openTabs: readonly OpenTabInfo[],
  extensionBaseUrl: string,
): DropIntent | null {
  const tabIds = normalizeOpenTabIds(payload.tabIds);
  if (!tabIds.length || tabIds.length !== payload.tabIds.length || !Number.isSafeInteger(payload.windowId) || payload.windowId < 0) {
    return null;
  }
  const records = getCapturedOpenTabRecords(tabIds, payload.windowId, openTabs);
  if (records.length !== tabIds.length || !records.every((record) => (
    record.storable === true
      && isStorableCaptureCandidate(
        { id: record.id, url: record.url, pinned: record.pinned },
        state.settings,
        extensionBaseUrl,
      )
  ))) {
    return null;
  }

  if (target.kind === 'group-body' || target.kind === 'tab-before') {
    const targetGroup = getOwnedGroup(state, target.groupId, payload.workspaceId);
    if (!targetGroup) {
      return null;
    }
    if (target.kind === 'tab-before') {
      const targetTabIndex = targetGroup.tabs.findIndex((tab) => tab.id === target.tabId);
      if (targetTabIndex < 0 || target.index !== targetTabIndex) {
        return null;
      }
      return {
        kind: 'copy-open-tabs',
        tabIds,
        windowId: payload.windowId,
        targetGroupId: target.groupId,
        targetIndex: target.index + (target.placement === 'after' ? 1 : 0),
        workspaceId: payload.workspaceId,
      };
    }
    return {
      kind: 'copy-open-tabs',
      tabIds,
      windowId: payload.windowId,
      targetGroupId: target.groupId,
      targetIndex: targetGroup.tabs.length,
      workspaceId: payload.workspaceId,
    };
  }

  if (target.kind === 'new-group' || target.kind === 'group-insert' || target.kind === 'category-column') {
    if (!isOwnedCategory(state, target.category, payload.workspaceId)) {
      return null;
    }
    const categoryGroups = groupsForCategory(state, target.category, payload.workspaceId);
    const index = target.kind === 'category-column' ? categoryGroups.length : target.index;
    if (!isValidInsertionIndex(index, categoryGroups.length)) {
      return null;
    }
    return {
      kind: 'create-session',
      source: { kind: 'open-tabs', tabIds, windowId: payload.windowId },
      category: target.category,
      index,
      workspaceId: payload.workspaceId,
    };
  }
  return null;
}

function isValidWorkspaceBoundary(state: TabBoardState, workspaceId: string): boolean {
  return typeof workspaceId === 'string'
    && workspaceId.length > 0
    && state.activeWorkspaceId === workspaceId
    && state.workspaces.some((workspace) => workspace.id === workspaceId);
}

function getOwnedGroup(state: TabBoardState, groupId: string, workspaceId: string): Group | null {
  const group = state.groups.find((item) => item.id === groupId);
  return group?.workspaceId === workspaceId ? group : null;
}

function getOwnedTab(
  state: TabBoardState,
  ref: SavedTabRef,
  workspaceId: string,
): { group: Group; tabId: string } | null {
  const group = getOwnedGroup(state, ref.groupId, workspaceId);
  return group?.tabs.some((tab) => tab.id === ref.tabId) ? { group, tabId: ref.tabId } : null;
}

function normalizeSavedRefs(refs: Array<SavedTabRef>): SavedTabRef[] {
  if (!Array.isArray(refs)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: SavedTabRef[] = [];
  for (const ref of refs) {
    if (!ref || typeof ref.groupId !== 'string' || !ref.groupId || typeof ref.tabId !== 'string' || !ref.tabId) {
      return [];
    }
    const key = JSON.stringify([ref.groupId, ref.tabId]);
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    normalized.push({ groupId: ref.groupId, tabId: ref.tabId });
  }
  return normalized;
}

function getCapturedOpenTabRecords(
  tabIds: readonly number[],
  windowId: number,
  openTabs: readonly OpenTabInfo[],
): OpenTabInfo[] {
  const wanted = new Set(tabIds);
  const matching = openTabs.filter((record) => record.id !== undefined && wanted.has(record.id));
  if (matching.length !== tabIds.length) return [];
  const seen = new Set<number>();
  for (const record of matching) {
    if (record.id === undefined || record.windowId !== windowId || seen.has(record.id)) return [];
    seen.add(record.id);
  }
  return tabIds.map((tabId) => matching.find((record) => record.id === tabId)!).filter(Boolean);
}

function normalizeOpenTabIds(tabIds: number[]): number[] {
  if (!Array.isArray(tabIds)) {
    return [];
  }
  const seen = new Set<number>();
  for (const tabId of tabIds) {
    if (!Number.isSafeInteger(tabId) || tabId < 0 || seen.has(tabId)) {
      return [];
    }
    seen.add(tabId);
  }
  return [...seen];
}

function isValidInsertionIndex(index: number, length: number): boolean {
  return Number.isSafeInteger(index) && index >= 0 && index <= length;
}

function isSavedTabMoveNoOp(
  state: TabBoardState,
  refs: SavedTabRef[],
  targetGroup: Group,
  targetIndex: number,
): boolean {
  if (refs.some((ref) => ref.groupId !== targetGroup.id)) {
    return false;
  }
  const selected = new Set(refs.map((ref) => ref.tabId));
  const moved = targetGroup.tabs.filter((tab) => selected.has(tab.id)).map((tab) => tab.id);
  const remaining = targetGroup.tabs.filter((tab) => !selected.has(tab.id)).map((tab) => tab.id);
  const next = [...remaining.slice(0, targetIndex), ...moved, ...remaining.slice(targetIndex)];
  const current = targetGroup.tabs.map((tab) => tab.id);
  return next.length === current.length && next.every((id, index) => id === current[index]);
}
