import type { Group, TabBoardState, TabItem } from '../../shared/model';
import {
  createGroupFromTabRecords,
  createId,
  createNoteRecord,
  createTabRecord,
  isStorableCaptureCandidate,
  normalizeState,
  nowIso,
  parseImportText,
  resolveRestoreGroupPlacement,
  parseOneTabText,
} from '../../shared/model';
import type { OpenTabInfo } from '../../shared/openTabs';
import type { DropIntent, SavedTabRef } from './dnd';
import type { CategoryFilter } from './selectors';
import {
  canonicalJson,
  isDropIntentShape,
  isDropPayloadWithinLimits,
  isOpenTabInfoShape,
  MAX_CANONICAL_DIGEST_BYTES,
  MAX_ENTITY_ID_BYTES,
  utf8ByteLength,
} from '../../shared/store/mutationValidation';

type CreateSessionIntent = Extract<DropIntent, { kind: 'create-session' }>;
type SavedSessionIntent = Omit<CreateSessionIntent, 'source'> & {
  source: Extract<CreateSessionIntent['source'], { kind: 'saved-tabs' }>;
};
type OpenSessionIntent = Omit<CreateSessionIntent, 'source'> & {
  source: Extract<CreateSessionIntent['source'], { kind: 'open-tabs' }>;
};

const HASH_MASK_64 = (1n << 64n) - 1n;
const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;

function operationIdSegment(operationId: string, suffix: string): string {
  const direct = `drop_${operationId}_${suffix}`;
  if (utf8ByteLength(direct) <= MAX_ENTITY_ID_BYTES) return operationId;

  let hash = FNV_OFFSET_64;
  for (const character of operationId) {
    hash ^= BigInt(character.codePointAt(0) || 0);
    hash = (hash * FNV_PRIME_64) & HASH_MASK_64;
  }
  return `~${hash.toString(16).padStart(16, '0')}`;
}

export function dropOperationTabId(operationId: string, sourceTabId: number): string {
  return `drop_${operationIdSegment(operationId, `tab_${sourceTabId}`)}_tab_${sourceTabId}`;
}

export function dropOperationGroupId(operationId: string): string {
  return `drop_${operationIdSegment(operationId, 'group')}_group`;
}

export function getDropOperationDigest(
  intent: DropIntent,
  openTabs: readonly OpenTabInfo[],
): string {
  const digest = canonicalJson({ intent, openTabs });
  if (utf8ByteLength(digest) > MAX_CANONICAL_DIGEST_BYTES) {
    throw new Error('Drop mutation payload is too large.');
  }
  return digest;
}

function ledgerIntentMatches(
  digest: string,
  intent: DropIntent,
  openTabs: readonly OpenTabInfo[],
): boolean {
  return digest === canonicalJson({ intent, openTabs });
}

export type DropIntentReplayStatus = 'none' | 'complete' | 'conflict';

function generatedTabEntities(state: TabBoardState, tabId: string): TabItem[] {
  return [
    ...state.groups.flatMap((group) => group.tabs.filter((tab) => tab.id === tabId)),
    ...state.bin.flatMap((entry) => {
      if (entry.kind === 'tab') return entry.item.id === tabId ? [entry.item as TabItem] : [];
      return (entry.item as Group).tabs.filter((tab) => tab.id === tabId);
    }),
  ];
}

function generatedTabGroupIds(state: TabBoardState, tabId: string): string[] {
  return [
    ...state.groups.flatMap((group) => group.tabs.some((tab) => tab.id === tabId) ? [group.id] : []),
    ...state.bin.flatMap((entry) => {
      if (entry.kind === 'tab') return entry.item.id === tabId ? [entry.groupId] : [];
      return (entry.item as Group).tabs.some((tab) => tab.id === tabId) ? [entry.item.id] : [];
    }),
  ];
}

function generatedGroupEntities(state: TabBoardState, groupId: string): Group[] {
  return state.groups.filter((group) => group.id === groupId).concat(
    state.bin
      .filter((entry) => entry.kind === 'group' && entry.item.id === groupId)
      .map((entry) => entry.item as Group),
  );
}

function savedTabLocations(state: TabBoardState, tabId: string): string[] {
  return [
    ...state.groups.flatMap((group) => group.tabs.some((tab) => tab.id === tabId) ? [group.id] : []),
    ...state.bin.flatMap((entry) => {
      if (entry.kind === 'tab') return entry.item.id === tabId ? [entry.groupId] : [];
      return (entry.item as Group).tabs.some((tab) => tab.id === tabId) ? [entry.item.id] : [];
    }),
  ];
}

function matchesOpenTabRecord(tab: TabItem, record: OpenTabInfo, generatedId: string): boolean {
  const title = record.title || record.url || 'Untitled';
  return tab.id === generatedId
    && tab.itemType === 'link'
    && tab.title === title
    && tab.url === record.url
    && tab.favIconUrl === record.favIconUrl
    && tab.note === ''
    && tab.pinned === record.pinned
    && !tab.incognito
    && !tab.starred
    && tab.taskStatus === 'none'
    && JSON.stringify(tab.browserGroup) === JSON.stringify(record.browserGroup)
    && tab.sourceWindowId === record.windowId
    && tab.sourceTabId === record.id;
}

function matchesOpenTabGroup(
  state: TabBoardState,
  group: Group,
  intent: Extract<DropIntent, { kind: 'create-session' }>,
  openTabs: readonly OpenTabInfo[],
  operationId: string,
): boolean {
  if (group.workspaceId !== intent.workspaceId
    || !categoryMatches(group, intent.category)
    || group.note !== ''
    || group.collapsed) return false;
  if (intent.source.kind === 'saved-tabs') {
    const expectedIds = intent.source.refs.map((ref) => ref.tabId);
    const actualIds = group.tabs.map((tab) => tab.id);
    if (new Set(expectedIds).size !== expectedIds.length
      || new Set(actualIds).size !== actualIds.length) return false;
    const expectedCounts = new Map<string, number>();
    const actualCounts = new Map<string, number>();
    intent.source.refs.forEach((ref) => expectedCounts.set(ref.tabId, (expectedCounts.get(ref.tabId) || 0) + 1));
    group.tabs.forEach((tab) => actualCounts.set(tab.id, (actualCounts.get(tab.id) || 0) + 1));
    return group.tabs.length === intent.source.refs.length
      && expectedCounts.size === actualCounts.size
      && [...expectedCounts].every(([tabId, count]) => actualCounts.get(tabId) === count)
      && intent.source.refs.every((ref) => {
        const locations = savedTabLocations(state, ref.tabId);
        return locations.length === 1 && locations[0] === group.id;
      });
  }
  const records = getOpenTabRecords(intent.source.tabIds, intent.source.windowId, openTabs);
  return records.length === intent.source.tabIds.length
    && records.length === group.tabs.length
    && records.every((record, index) => matchesOpenTabRecord(
      group.tabs[index],
      record,
      dropOperationTabId(operationId, record.id!),
    ));
}

function stableGeneratedReplayStatus(
  state: TabBoardState,
  intent: Extract<DropIntent, { kind: 'copy-open-tabs' | 'create-session' }>,
  openTabs: readonly OpenTabInfo[],
  operationId: string,
): DropIntentReplayStatus {
  if (intent.kind === 'copy-open-tabs') {
    if (!isDenseArray(intent.tabIds)) return 'conflict';
    const targetGroup = state.groups.find((group) => group.id === intent.targetGroupId);
    if (targetGroup && targetGroup.workspaceId !== intent.workspaceId) return 'conflict';
    const expected = intent.tabIds.map((tabId) => ({
      id: dropOperationTabId(operationId, tabId),
      record: openTabs.find((record) => record.id === tabId),
    }));
    const entities = expected.map(({ id }) => generatedTabEntities(state, id));
    if (!entities.some((items) => items.length > 0)) return 'none';
    return entities.every((items, index) => {
      const generatedId = expected[index].id;
      const locations = generatedTabGroupIds(state, generatedId);
      return items.length === 1
        && locations.length === 1
        && locations[0] === intent.targetGroupId
        && expected[index].record !== undefined
        && matchesOpenTabRecord(items[0], expected[index].record, generatedId);
    })
      ? 'complete'
      : 'conflict';
  }

  if (intent.source.kind === 'saved-tabs' && !isDenseArray(intent.source.refs)) {
    return 'conflict';
  }
  const entities = generatedGroupEntities(state, dropOperationGroupId(operationId));
  const openRecords = intent.source.kind === 'open-tabs'
    ? getOpenTabRecords(intent.source.tabIds, intent.source.windowId, openTabs)
    : [];
  const generatedTabs = openRecords.map((record) => generatedTabEntities(
    state,
    dropOperationTabId(operationId, record.id!),
  ));
  const hasOccupiedIdentity = entities.length > 0 || generatedTabs.some((items) => items.length > 0);
  if (!hasOccupiedIdentity) return 'none';
  if (entities.length !== 1 || !matchesOpenTabGroup(state, entities[0], intent, openTabs, operationId)) {
    return 'conflict';
  }
  if (intent.source.kind === 'open-tabs' && !generatedTabs.every((items, index) =>
    items.length === 1
    && matchesOpenTabRecord(
      items[0],
      openRecords[index],
      dropOperationTabId(operationId, openRecords[index].id!),
    ))) {
    return 'conflict';
  }
  return 'complete';
}

export function getDropIntentReplayStatus(
  state: TabBoardState,
  intent: DropIntent,
  openTabs: readonly OpenTabInfo[],
  operationId: string,
): DropIntentReplayStatus {
  if (!isDropPayloadWithinLimits(operationId, intent, openTabs)
    || !isDropIntentShape(intent)
    || !openTabs.every(isOpenTabInfoShape)) {
    return 'none';
  }
  const existing = (state.dropOperationLedger || []).find((entry) => entry.operationId === operationId);
  if (existing) return ledgerIntentMatches(existing.digest, intent, openTabs) ? 'complete' : 'none';
  if (!isActiveWorkspace(state, intent.workspaceId)
    || (intent.kind !== 'copy-open-tabs' && intent.kind !== 'create-session')) {
    return 'none';
  }
  return stableGeneratedReplayStatus(state, intent, openTabs, operationId);
}

export function isDropIntentAlreadyApplied(
  state: TabBoardState,
  intent: DropIntent,
  openTabs: readonly OpenTabInfo[],
  operationId: string,
): boolean {
  if (!isDropPayloadWithinLimits(operationId, intent, openTabs)
    || !isDropIntentShape(intent)
    || !openTabs.every(isOpenTabInfoShape)) {
    return false;
  }
  const existing = (state.dropOperationLedger || []).find((entry) => entry.operationId === operationId);
  if (existing) return ledgerIntentMatches(existing.digest, intent, openTabs);
  if (!isActiveWorkspace(state, intent.workspaceId)) return false;

  switch (intent.kind) {
    case 'move-session': {
      const source = getOwnedGroup(state, intent.groupId, intent.workspaceId);
      if (!source || !isOwnedCategory(state, intent.category, intent.workspaceId)) return false;
      const categoryGroups = state.groups.filter((group) => group.workspaceId === intent.workspaceId
        && categoryMatches(group, intent.category));
      return categoryMatches(source, intent.category)
        && categoryGroups.findIndex((group) => group.id === source.id) === intent.index;
    }
    case 'reorder-category': {
      const order = categoryOrder(state, intent.workspaceId);
      if (!isOwnedCategoryId(state, intent.categoryId, intent.workspaceId)
        || !isOwnedCategoryId(state, intent.targetCategoryId, intent.workspaceId)
        || intent.categoryId === intent.targetCategoryId
        || !order.includes(intent.categoryId)
        || !order.includes(intent.targetCategoryId)
        || (intent.placement !== 'before' && intent.placement !== 'after')) {
        return false;
      }
      const next = reorderCategoryIds(order, intent.categoryId, intent.targetCategoryId, intent.placement);
      return next.length === order.length && next.every((id, index) => id === order[index]);
    }
    case 'move-tabs':
      return isMoveTabsAlreadyApplied(state, intent);
    case 'copy-open-tabs':
    case 'create-session':
      return getDropIntentReplayStatus(state, intent, openTabs, operationId) === 'complete';
  }
}

function isMoveTabsAlreadyApplied(
  state: TabBoardState,
  intent: Extract<DropIntent, { kind: 'move-tabs' }>,
): boolean {
  const target = getOwnedGroup(state, intent.targetGroupId, intent.workspaceId);
  if (!target || !isDenseArray(intent.refs) || !Number.isSafeInteger(intent.targetIndex) || intent.targetIndex < 0) return false;
  const selectedIds = intent.refs.map((ref) => ref.tabId);
  if (!selectedIds.length || new Set(selectedIds).size !== selectedIds.length) return false;
  if (!intent.refs.every((ref) => ref.groupId === target.id
    ? target.tabs.some((tab) => tab.id === ref.tabId)
    : !state.groups.some((group) => group.id === ref.groupId && group.tabs.some((tab) => tab.id === ref.tabId)))) {
    return false;
  }

  const selected = new Set(selectedIds);
  const selectedInTarget = target.tabs.filter((tab) => selected.has(tab.id));
  if (selectedInTarget.length !== selected.size) return false;
  const remaining = target.tabs.filter((tab) => !selected.has(tab.id));
  const insertionIndex = Math.min(intent.targetIndex, remaining.length);
  const expected = [
    ...remaining.slice(0, insertionIndex).map((tab) => tab.id),
    ...selectedInTarget.map((tab) => tab.id),
    ...remaining.slice(insertionIndex).map((tab) => tab.id),
  ];
  return expected.length === target.tabs.length
    && expected.every((id, index) => id === target.tabs[index]?.id);
}

function categoryMatches(group: Group, category: CategoryFilter): boolean {
  if (category === 'saved') {
    return group.starred;
  }
  if (category === 'archive') {
    return group.archived;
  }
  if (category === 'inbox') {
    return !group.starred && !group.archived && group.folderId === null;
  }
  return !group.starred && !group.archived && group.folderId === category.slice('folder:'.length);
}

function categoryForMove(
  state: TabBoardState,
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
  if (!folder) {
    throw new Error('Target category does not exist.');
  }
  if (folder.workspaceId !== group.workspaceId) {
    throw new Error('Target category is outside the group workspace.');
  }
  return { folderId, starred: false, archived: false };
}

export function moveSessionToCategory(
  state: TabBoardState,
  input: { groupId: string; category: CategoryFilter; index: number },
  updatedAt = nowIso(),
): TabBoardState {
  const group = state.groups.find((item) => item.id === input.groupId);
  if (!group) {
    throw new Error(`Group not found: ${input.groupId}.`);
  }
  if (!Number.isFinite(input.index)) {
    throw new Error('Session index must be finite.');
  }

  const categoryState = categoryForMove(state, group, input.category);
  const sourceIndex = state.groups.findIndex((item) => item.id === group.id);
  const remainingGroups = state.groups.filter((item) => item.id !== group.id);
  const categoryGroups = remainingGroups.filter(
    (item) => item.workspaceId === group.workspaceId && categoryMatches(item, input.category),
  );
  const targetIndex = Math.max(0, Math.min(Math.trunc(input.index), categoryGroups.length));
  const movedGroup: Group = {
    ...group,
    ...categoryState,
    updatedAt,
  };

  let insertionIndex = remainingGroups.length;
  if (categoryGroups.length > 0) {
    const anchorId = categoryGroups[Math.min(targetIndex, categoryGroups.length - 1)].id;
    insertionIndex = remainingGroups.findIndex((item) => item.id === anchorId);
    if (targetIndex === categoryGroups.length) {
      insertionIndex += 1;
    }
  } else {
    const sourceWorkspaceIndexes = remainingGroups
      .map((item, itemIndex) => item.workspaceId === group.workspaceId ? itemIndex : -1)
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

export function reorderCategoryIds(
  categoryOrder: string[],
  sourceId: string,
  targetId: string,
  placement: 'before' | 'after',
): string[] {
  const current = [...categoryOrder];
  if (
    sourceId === targetId ||
    !sourceId ||
    !targetId ||
    !current.includes(sourceId) ||
    !current.includes(targetId)
  ) {
    return current;
  }

  const withoutSource = current.filter((id) => id !== sourceId);
  const targetIndex = withoutSource.indexOf(targetId);
  if (targetIndex < 0) {
    return current;
  }
  const insertionIndex = placement === 'after' ? targetIndex + 1 : targetIndex;
  return [
    ...withoutSource.slice(0, insertionIndex),
    sourceId,
    ...withoutSource.slice(insertionIndex),
  ];
}

function isValidDropIntent(
  state: TabBoardState,
  intent: DropIntent,
  openTabs: readonly OpenTabInfo[],
): boolean {
  if (!isActiveWorkspace(state, intent.workspaceId)) {
    return false;
  }

  switch (intent.kind) {
    case 'move-session': {
      const source = getOwnedGroup(state, intent.groupId, intent.workspaceId);
      if (!source || !isOwnedCategory(state, intent.category, intent.workspaceId)) {
        return false;
      }
      const categoryGroups = state.groups.filter((group) => group.id !== source.id
        && group.workspaceId === intent.workspaceId
        && categoryMatches(group, intent.category));
      return isValidInsertionIndex(intent.index, categoryGroups.length);
    }
    case 'reorder-category': {
      const order = categoryOrder(state, intent.workspaceId);
      return isOwnedCategoryId(state, intent.categoryId, intent.workspaceId)
        && isOwnedCategoryId(state, intent.targetCategoryId, intent.workspaceId)
        && intent.categoryId !== intent.targetCategoryId
        && (intent.placement === 'before' || intent.placement === 'after')
        && order.includes(intent.categoryId)
        && order.includes(intent.targetCategoryId);
    }
    case 'move-tabs': {
      const target = getOwnedGroup(state, intent.targetGroupId, intent.workspaceId);
      if (!target || !hasValidSavedRefs(state, intent.refs, intent.workspaceId)) {
        return false;
      }
      const removedFromTarget = intent.refs.filter((ref) => ref.groupId === target.id).length;
      return isValidInsertionIndex(intent.targetIndex, target.tabs.length - removedFromTarget);
    }
    case 'copy-open-tabs': {
      const target = getOwnedGroup(state, intent.targetGroupId, intent.workspaceId);
      if (!target) {
        return false;
      }
      return isValidOpenTabIds(intent.tabIds)
        && hasValidOpenTabRecords(state, intent.tabIds, intent.windowId, openTabs)
        && isValidInsertionIndex(intent.targetIndex, target.tabs.length);
    }
    case 'create-session': {
      if (!isOwnedCategory(state, intent.category, intent.workspaceId)
        || !isValidInsertionIndex(
          intent.index,
          state.groups.filter((group) => group.workspaceId === intent.workspaceId
            && categoryMatches(group, intent.category)).length,
        )) {
        return false;
      }
      return intent.source.kind === 'saved-tabs'
        ? hasValidSavedRefs(state, intent.source.refs, intent.workspaceId)
        : isValidOpenTabIds(intent.source.tabIds)
          && hasValidOpenTabRecords(state, intent.source.tabIds, intent.source.windowId, openTabs);
    }
  }
}

function isActiveWorkspace(state: TabBoardState, workspaceId: string): boolean {
  return typeof workspaceId === 'string'
    && state.activeWorkspaceId === workspaceId
    && state.workspaces.some((workspace) => workspace.id === workspaceId);
}

function getOwnedGroup(state: TabBoardState, groupId: string, workspaceId: string): Group | null {
  const group = state.groups.find((item) => item.id === groupId);
  return group?.workspaceId === workspaceId ? group : null;
}

function isOwnedCategory(state: TabBoardState, category: CategoryFilter, workspaceId: string): boolean {
  if (category === 'inbox' || category === 'saved' || category === 'archive') {
    return true;
  }
  if (typeof category !== 'string' || !category.startsWith('folder:')) {
    return false;
  }
  const folderId = category.slice('folder:'.length);
  return folderId.length > 0 && state.folders.some((folder) => folder.id === folderId && folder.workspaceId === workspaceId);
}

function isOwnedCategoryId(state: TabBoardState, categoryId: string, workspaceId: string): boolean {
  return typeof categoryId === 'string'
    && (categoryId === 'inbox' || categoryId === 'saved' || categoryId === 'archive' || isOwnedCategory(state, categoryId as CategoryFilter, workspaceId));
}

function isDenseArray(value: readonly unknown[]): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function hasValidSavedRefs(
  state: TabBoardState,
  refs: readonly SavedTabRef[],
  workspaceId: string,
): boolean {
  if (!Array.isArray(refs) || !refs.length || !isDenseArray(refs)) {
    return false;
  }
  const seen = new Set<string>();
  const seenTabIds = new Set<string>();
  return refs.every((ref) => {
    if (!ref || typeof ref.groupId !== 'string' || !ref.groupId || typeof ref.tabId !== 'string' || !ref.tabId) {
      return false;
    }
    const key = savedRefKey(ref.groupId, ref.tabId);
    if (seen.has(key) || seenTabIds.has(ref.tabId)) {
      return false;
    }
    seen.add(key);
    seenTabIds.add(ref.tabId);
    const group = getOwnedGroup(state, ref.groupId, workspaceId);
    return Boolean(group?.tabs.some((tab) => tab.id === ref.tabId));
  });
}

function isValidOpenTabIds(tabIds: readonly number[]): boolean {
  return Array.isArray(tabIds)
    && tabIds.length > 0
    && new Set(tabIds).size === tabIds.length
    && tabIds.every((tabId) => Number.isSafeInteger(tabId) && tabId >= 0);
}

function hasValidOpenTabRecords(
  state: TabBoardState,
  tabIds: readonly number[],
  windowId: number,
  openTabs: readonly OpenTabInfo[],
): boolean {
  if (!Number.isSafeInteger(windowId) || windowId < 0) return false;
  const records = getOpenTabRecords(tabIds, windowId, openTabs);
  return records.length === tabIds.length && records.every((record) => isStorableCaptureCandidate(
    { id: record.id, url: record.url, pinned: record.pinned },
    state.settings,
    '',
  ));
}

function isValidInsertionIndex(index: number, length: number): boolean {
  return Number.isSafeInteger(index) && index >= 0 && index <= length;
}

export function executeDropIntent(
  state: TabBoardState,
  intent: DropIntent,
  openTabs: readonly OpenTabInfo[] = [],
  operationId = '',
  updatedAt = nowIso(),
): TabBoardState {
  if (!isValidDropIntent(state, intent, openTabs)) {
    return state;
  }

  switch (intent.kind) {
    case 'move-session':
      return moveSessionToCategory(state, {
        groupId: intent.groupId,
        category: intent.category,
        index: intent.index,
      }, updatedAt);
    case 'reorder-category': {
      const currentOrder = categoryOrder(state, intent.workspaceId);
      const nextOrder = reorderCategoryIds(
        currentOrder,
        intent.categoryId,
        intent.targetCategoryId,
        intent.placement,
      );
      if (nextOrder.every((id, index) => id === currentOrder[index])) {
        return state;
      }
      return {
        ...state,
        categoryOrderByWorkspace: {
          ...state.categoryOrderByWorkspace,
          [intent.workspaceId]: nextOrder,
        },
        updatedAt,
      };
    }
    case 'move-tabs':
      return moveSavedTabsToSession(state, intent.refs, intent.targetGroupId, intent.targetIndex, updatedAt);
    case 'copy-open-tabs':
      return copyOpenTabsToSession(state, intent, openTabs, operationId, updatedAt);
    case 'create-session':
      return intent.source.kind === 'saved-tabs'
        ? createSessionFromSavedTabs(state, {
          ...intent,
          source: intent.source,
        }, operationId, updatedAt)
        : createSessionFromOpenTabs(state, {
          ...intent,
          source: intent.source,
        }, openTabs, operationId, updatedAt);
  }
}

function savedRefKey(groupId: string, tabId: string): string {
  return JSON.stringify([groupId, tabId]);
}

function moveSavedTabsToSession(
  state: TabBoardState,
  refs: readonly SavedTabRef[],
  targetGroupId: string,
  targetIndex: number,
  updatedAt = nowIso(),
): TabBoardState {
  const selected = new Set(refs.map((ref) => savedRefKey(ref.groupId, ref.tabId)));
  const target = state.groups.find((group) => group.id === targetGroupId);
  const movedTabs: TabItem[] = [];
  const touchedSourceGroupIds = new Set<string>();
  if (!target || !selected.size) return state;

  const timestamp = updatedAt;
  const groups = state.groups.map((group) => {
    const tabs = group.tabs.filter((tab) => {
      const isSelected = selected.has(savedRefKey(group.id, tab.id));
      if (isSelected) {
        movedTabs.push(tab);
        touchedSourceGroupIds.add(group.id);
      }
      return !isSelected;
    });
    return tabs.length === group.tabs.length ? group : { ...group, tabs, updatedAt: timestamp };
  });
  if (movedTabs.length !== selected.size) return state;

  const nextGroups = groups
    .map((group) => {
      if (group.id !== targetGroupId) {
        return group;
      }
      const insertionIndex = Math.max(0, Math.min(Math.trunc(targetIndex), group.tabs.length));
      return {
        ...group,
        tabs: [
          ...group.tabs.slice(0, insertionIndex),
          ...movedTabs,
          ...group.tabs.slice(insertionIndex),
        ],
        updatedAt: timestamp,
      };
    })
    .filter((group) => group.id === targetGroupId
      || !touchedSourceGroupIds.has(group.id)
      || group.tabs.length > 0
      || group.locked
      || Boolean(group.note));

  return nextGroups.length === state.groups.length && nextGroups.every((group, index) => group === state.groups[index])
    ? state
    : { ...state, groups: nextGroups, updatedAt: timestamp };
}

function createSessionFromSavedTabs(
  state: TabBoardState,
  intent: SavedSessionIntent,
  operationId: string,
  updatedAt = nowIso(),
): TabBoardState {
  const selected = new Set(intent.source.refs.map((ref) => savedRefKey(ref.groupId, ref.tabId)));
  const tabs: TabItem[] = [];
  const touchedSourceGroupIds = new Set<string>();
  const timestamp = updatedAt;
  const groupsWithPlaceholders = state.groups.map((group) => {
    const remainingTabs = group.tabs.filter((tab) => {
      const isSelected = selected.has(savedRefKey(group.id, tab.id));
      if (isSelected) {
        tabs.push(tab);
        touchedSourceGroupIds.add(group.id);
      }
      return !isSelected;
    });
    return remainingTabs.length === group.tabs.length
      ? group
      : { ...group, tabs: remainingTabs, updatedAt: timestamp };
  });
  const remainingGroups = groupsWithPlaceholders.filter((group) =>
    group.tabs.length > 0
    || !touchedSourceGroupIds.has(group.id)
    || group.locked
    || Boolean(group.note));
  if (!tabs.length || tabs.length !== intent.source.refs.length) return state;

  const categoryState = categoryForNewGroup(state, intent.workspaceId, intent.category);
  const created = {
    ...createGroupFromTabRecords(tabs, {
      workspaceId: intent.workspaceId,
      ...categoryState,
    }),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(operationId ? { id: dropOperationGroupId(operationId) } : {}),
  };
  const removedGroupIds = new Set(
    state.groups
      .filter((group) => !remainingGroups.some((remaining) => remaining.id === group.id))
      .map((group) => group.id),
  );
  const originalCategoryGroups = state.groups.filter(
    (group) => group.workspaceId === intent.workspaceId && categoryMatches(group, intent.category),
  );
  const insertionIndex = Math.max(0, Math.trunc(intent.index) - originalCategoryGroups
    .slice(0, Math.max(0, Math.trunc(intent.index)))
    .filter((group) => removedGroupIds.has(group.id)).length);
  const firstRemovedGlobalIndex = state.groups.findIndex((group) => removedGroupIds.has(group.id));
  const removedBeforeGlobalIndex = firstRemovedGlobalIndex >= 0
    ? state.groups.slice(0, firstRemovedGlobalIndex).filter((group) => removedGroupIds.has(group.id)).length
    : 0;
  const fallbackIndex = firstRemovedGlobalIndex >= 0
    ? firstRemovedGlobalIndex - removedBeforeGlobalIndex
    : undefined;
  const inserted = insertGroupAtCategoryIndex(
    { ...state, groups: remainingGroups },
    created,
    intent.category,
    insertionIndex,
    fallbackIndex,
    timestamp,
  );
  return inserted;
}

function copyOpenTabsToSession(
  state: TabBoardState,
  intent: Extract<DropIntent, { kind: 'copy-open-tabs' }>,
  openTabs: readonly OpenTabInfo[],
  operationId: string,
  updatedAt = nowIso(),
): TabBoardState {
  const target = state.groups.find((group) => group.id === intent.targetGroupId);
  const records = getOpenTabRecords(intent.tabIds, intent.windowId, openTabs);
  if (!target || !records.length) return state;
  const timestamp = updatedAt;
  const tabs = records.map((record) => createTabRecord(record, {
    browserGroup: record.browserGroup,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(operationId && record.id !== undefined
      ? { id: dropOperationTabId(operationId, record.id) }
      : {}),
  }));
  const index = Math.max(0, Math.min(Math.trunc(intent.targetIndex), target.tabs.length));
  return {
    ...state,
    groups: state.groups.map((group) => group.id === target.id
      ? { ...group, tabs: [...group.tabs.slice(0, index), ...tabs, ...group.tabs.slice(index)], updatedAt: timestamp }
      : group),
    updatedAt: timestamp,
  };
}

function createSessionFromOpenTabs(
  state: TabBoardState,
  intent: OpenSessionIntent,
  openTabs: readonly OpenTabInfo[],
  operationId: string,
  updatedAt = nowIso(),
): TabBoardState {
  const records = getOpenTabRecords(intent.source.tabIds, intent.source.windowId, openTabs);
  if (!records.length) return state;
  const tabs = records.map((record) => createTabRecord(record, {
    browserGroup: record.browserGroup,
    createdAt: updatedAt,
    updatedAt,
    ...(operationId && record.id !== undefined
      ? { id: dropOperationTabId(operationId, record.id) }
      : {}),
  }));
  const created = {
    ...createGroupFromTabRecords(tabs, {
      workspaceId: intent.workspaceId,
      ...categoryForNewGroup(state, intent.workspaceId, intent.category),
    }),
    createdAt: updatedAt,
    updatedAt,
    ...(operationId ? { id: dropOperationGroupId(operationId) } : {}),
  };
  return insertGroupAtCategoryIndex(state, created, intent.category, intent.index, undefined, updatedAt);
}

function getOpenTabRecords(
  tabIds: readonly number[],
  windowId: number,
  openTabs: readonly OpenTabInfo[],
): OpenTabInfo[] {
  if (!isValidOpenTabIds(tabIds) || !Number.isSafeInteger(windowId) || windowId < 0) {
    return [];
  }
  const wanted = new Set(tabIds);
  const matching = openTabs.filter((record) => record.id !== undefined && wanted.has(record.id));
  if (matching.length !== tabIds.length) return [];
  const seen = new Set<number>();
  for (const record of matching) {
    if (record.id === undefined || record.windowId !== windowId || !record.storable || seen.has(record.id)) {
      return [];
    }
    seen.add(record.id);
  }
  return tabIds.map((tabId) => matching.find((record) => record.id === tabId)!).filter(Boolean);
}

function categoryForNewGroup(
  state: TabBoardState,
  workspaceId: string,
  category: CategoryFilter,
): Pick<Group, 'folderId' | 'starred' | 'archived'> {
  const template = {
    ...state.groups.find((group) => group.workspaceId === workspaceId) ?? {
      id: '', title: '', note: '', workspaceId, folderId: null, locked: false, starred: false, archived: false,
      collapsed: false, tabs: [], createdAt: '', updatedAt: '',
    },
    workspaceId,
  };
  return categoryForMove(state, template, category);
}

function insertGroupAtCategoryIndex(
  state: TabBoardState,
  group: Group,
  category: CategoryFilter,
  index: number,
  fallbackIndex?: number,
  updatedAt = nowIso(),
): TabBoardState {
  const categoryGroups = state.groups.filter(
    (item) => item.workspaceId === group.workspaceId && categoryMatches(item, category),
  );
  const targetIndex = Math.max(0, Math.min(Math.trunc(index), categoryGroups.length));
  let insertionIndex = state.groups.length;
  if (categoryGroups.length) {
    insertionIndex = targetIndex === categoryGroups.length
      ? state.groups.findIndex((item) => item.id === categoryGroups.at(-1)?.id) + 1
      : state.groups.findIndex((item) => item.id === categoryGroups[targetIndex].id);
  } else {
    const workspaceIndexes = state.groups
      .map((item, itemIndex) => item.workspaceId === group.workspaceId ? itemIndex : -1)
      .filter((itemIndex) => itemIndex >= 0);
    insertionIndex = workspaceIndexes.length
      ? workspaceIndexes.at(-1)! + 1
      : Math.max(0, Math.min(fallbackIndex ?? state.groups.length, state.groups.length));
  }
  const timestamp = updatedAt;
  const created = { ...group, updatedAt: timestamp };
  return {
    ...state,
    groups: [
      ...state.groups.slice(0, insertionIndex),
      created,
      ...state.groups.slice(insertionIndex),
    ],
    updatedAt: timestamp,
  };
}

function categoryOrder(state: TabBoardState, workspaceId: string): string[] {
  const known = [
    'inbox',
    'saved',
    'archive',
    ...state.folders.filter((folder) => folder.workspaceId === workspaceId).map((folder) => `folder:${folder.id}`),
  ];
  const knownSet = new Set(known);
  const folderIds = new Set(state.folders
    .filter((folder) => folder.workspaceId === workspaceId)
    .map((folder) => folder.id));
  const saved = state.categoryOrderByWorkspace[workspaceId] ?? [];
  const normalized = saved
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.startsWith('folder:') ? id : folderIds.has(id) ? `folder:${id}` : id)
    .filter((id) => knownSet.has(id));
  return [...new Set([...normalized, ...known])];
}

export function restoreGroupFromBin(
  state: TabBoardState,
  entryId: string,
  restoredAt = nowIso(),
): TabBoardState {
  const matchingEntries = state.bin.filter((item) => item.id === entryId);
  if (matchingEntries.length !== 1 || matchingEntries[0].kind !== 'group') {
    return state;
  }
  const entry = matchingEntries[0];

  const originalGroup = entry.item as Group;
  const placement = resolveRestoreGroupPlacement(
    state,
    entry,
    originalGroup.workspaceId,
    originalGroup.folderId,
    originalGroup.starred,
    originalGroup.archived,
  );
  const timestamp = restoredAt;
  const restored: Group = {
    ...originalGroup,
    id: originalGroup.id,
    workspaceId: placement.workspaceId,
    folderId: placement.folderId,
    createdAt: originalGroup.createdAt,
    updatedAt: timestamp,
    tabs: originalGroup.tabs.map((tab) => ({
      ...tab,
      id: tab.id,
      createdAt: tab.createdAt,
      updatedAt: timestamp,
    })),
  };

  const matchingIndexes = state.groups
    .map((group, index) => ({ group, index }))
    .filter(({ group }) => group.workspaceId === restored.workspaceId &&
      group.folderId === restored.folderId && group.starred === restored.starred)
    .map(({ index }) => index);
  const categoryIndex = typeof entry.originalIndex === 'number' && entry.originalIndex >= 0
    ? Math.min(Math.trunc(entry.originalIndex), matchingIndexes.length)
    : matchingIndexes.length;
  const workspaceIndexes = state.groups
    .map((group, groupIndex) => group.workspaceId === restored.workspaceId ? groupIndex : -1)
    .filter((groupIndex) => groupIndex >= 0);
  const insertionIndex = categoryIndex < matchingIndexes.length
    ? matchingIndexes[categoryIndex]
    : matchingIndexes.length
      ? matchingIndexes[matchingIndexes.length - 1] + 1
      : workspaceIndexes.length
        ? workspaceIndexes[workspaceIndexes.length - 1] + 1
        : state.groups.length;
  return {
    ...state,
    groups: [
      ...state.groups.slice(0, insertionIndex),
      restored,
      ...state.groups.slice(insertionIndex),
    ],
    bin: state.bin.filter((item) => item !== entry),
    updatedAt: timestamp,
  };
}

function markdownOneTabGroups(text: string): Group[] {
  const groups: Group[] = [];
  for (const [index, block] of text.replace(/\r\n/g, '\n').split(/\n\s*\n/).entries()) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    const firstLine = lines[0];
    const firstLineIsMarkdown = /^(?:[-*+]\s+)?\[[^\]]+\]\([^)]+\)$/.test(firstLine);
    const title = firstLine.startsWith('http') || firstLineIsMarkdown
      ? ''
      : firstLine.replace(/^#+\s*/, '').trim();
    const tabs = lines.slice(title ? 1 : 0).flatMap((line): TabItem[] => {
      const markdown = line.match(/^(?:[-*+]\s+)?\[([^\]]+)\]\(([^)]+)\)$/);
      if (!markdown) return [];
      return [createTabRecord({ title: markdown[1].trim(), url: markdown[2].trim() })];
    });
    if (tabs.length) {
      groups.push(createGroupFromTabRecords(tabs, { title: title || `OneTab import ${index + 1}` }));
    }
  }
  return groups;
}

function tabBoardTextGroups(text: string): Group[] {
  const groups: Group[] = [];
  let groupTitle = '';
  let pendingTitles: string[] = [];
  let tabs: TabItem[] = [];

  const flush = () => {
    if (!groupTitle) {
      pendingTitles = [];
      tabs = [];
      return;
    }
    const outputTabs = [
      ...tabs,
      ...pendingTitles.map((note) => createNoteRecord(note, { title: note })),
    ];
    if (!outputTabs.length) {
      groupTitle = '';
      pendingTitles = [];
      tabs = [];
      return;
    }
    groups.push(createGroupFromTabRecords(outputTabs, { title: groupTitle }));
    groupTitle = '';
    pendingTitles = [];
    tabs = [];
  };

  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (!value) {
      flush();
      continue;
    }
    if (/^===\s.*\s===$/.test(value) || /^---\s.*\s---$/.test(value)) {
      flush();
      continue;
    }
    if (/^https?:\/\/\S+$/i.test(value) || /^(?:chrome|file|ftp):\/\/\S+$/i.test(value)) {
      if (!groupTitle) groupTitle = value;
      const linkTitle = pendingTitles.at(-1) || value;
      const notes = pendingTitles.slice(0, -1).map((note) => createNoteRecord(note, { title: note }));
      tabs = [
        ...tabs,
        ...notes,
        createTabRecord({ title: linkTitle, url: value }),
      ];
      pendingTitles = [];
      continue;
    }
    if (!groupTitle) {
      groupTitle = value;
    } else {
      pendingTitles = [...pendingTitles, value];
    }
  }
  flush();
  return groups;
}

export function parseImportedText(text: string): Group[] {
  const raw = String(text ?? '').trim();
  if (!raw) {
    throw new Error('Import text is required.');
  }

  const isTabBoardText = /^===\s.*\s===$/m.test(raw) || /^---\s.*\s---$/m.test(raw);
  if (isTabBoardText) {
    const tabBoardGroups = tabBoardTextGroups(raw);
    if (tabBoardGroups.length) return tabBoardGroups;
  }

  const oneTabGroups = parseOneTabText(raw);
  const markdownGroups = markdownOneTabGroups(raw);
  if (markdownGroups.length) {
    return markdownGroups;
  }
  if (oneTabGroups.length) return oneTabGroups;
  const genericGroups = parseImportText(raw);
  if (!genericGroups.length) {
    throw new Error('No importable sessions found.');
  }
  return genericGroups;
}

export function importText(
  state: TabBoardState,
  text: string,
  options: { workspaceId: string; folderId: string | null },
): TabBoardState {
  const workspace = state.workspaces.find((item) => item.id === options.workspaceId);
  if (!workspace) {
    throw new Error('Workspace not found.');
  }
  if (options.folderId !== null) {
    const folder = state.folders.find((item) => item.id === options.folderId);
    if (!folder || folder.workspaceId !== workspace.id) {
      throw new Error('Folder does not belong to the requested workspace.');
    }
  }

  const importedGroups = parseImportedText(text);
  const timestamp = nowIso();
  const groups = importedGroups.map((source) => ({
    ...source,
    id: createId('group'),
    workspaceId: workspace.id,
    folderId: options.folderId,
    starred: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    tabs: source.tabs.map((tab) => ({
      ...tab,
      id: createId('tab'),
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  }));

  return normalizeState({
    ...state,
    groups: [...state.groups, ...groups],
    updatedAt: timestamp,
  });
}
