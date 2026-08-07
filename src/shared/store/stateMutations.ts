import {
  BIN_LIMIT,
  compactBin,
  clone,
  nowIso,
  normalizeCategoryColor,
  normalizeWorkspaceEmoji,
  resolveRestoreGroupPlacement,
  validateFolderName,
  dedupeTabItems,
  DROP_OPERATION_LEDGER_LIMIT,
  type BinEntry,
  type Folder,
  type Group,
  type Settings,
  type TabBoardState,
  type TabItem,
  type TabRef,
  type Workspace,
} from '../model';
import {
  dropOperationGroupId,
  dropOperationTabId,
  executeDropIntent,
  getDropOperationDigest,
  getDropIntentReplayStatus,
  isDropIntentAlreadyApplied,
} from '../model/drop-operations';
import {
  BUILT_IN_CATEGORIES,
  categoryOrder as getCanonicalCategoryOrder,
  moveSessionToCategory,
  type CategoryFilter,
} from '../model/categories';
import type { DropIntent } from '../model/drop-intent';
import type { OpenTabInfo } from '../openTabs';
import {
  isDropIntentShape,
  isDropPayloadWithinLimits,
  isOpenTabInfoShape,
} from '../model/drop-validation';
import {
  isBoundedString,
  isDenseArray,
  isEntityId,
  isOperationId,
  isTimestamp,
  MAX_FAVICON_URL_BYTES,
  MAX_MUTATIONS,
  MAX_REFS,
  MAX_TITLE_BYTES,
  MAX_URL_BYTES,
  normalizeWorkspaceName,
  workspaceNameKey,
} from './mutationValidation';

export const DELETE_TABS_LIMIT = BIN_LIMIT;

export type StateMutation =
  | { type: 'set-active-workspace'; workspaceId: string; updatedAt: string }
  | { type: 'add-workspace'; workspace: Workspace }
  | { type: 'rename-workspace'; id: string; name: string; updatedAt: string }
  | { type: 'update-workspace'; id: string; name: string; emoji: string; updatedAt: string }
  | { type: 'set-workspace-order'; orderedWorkspaceIds: string[]; updatedAt: string }
  | { type: 'delete-workspace'; id: string; newActiveWorkspaceId: string; updatedAt: string }
  | { type: 'add-folder'; folder: Folder }
  | { type: 'rename-folder'; id: string; name: string; updatedAt: string }
  | {
      type: 'update-folder';
      id: string;
      name: string;
      color: string;
      expected: { name: string; color: string };
      updatedAt: string;
    }
  | { type: 'delete-folder'; id: string; updatedAt: string }
  | { type: 'set-folder-collapsed'; id: string; collapsed: boolean; updatedAt: string }
  | { type: 'add-group'; group: Group; updatedAt: string }
  | { type: 'prepend-groups'; groups: Group[]; updatedAt: string }
  | { type: 'update-group'; id: string; updates: Partial<Group>; updatedAt: string }
  | { type: 'delete-group'; id: string; binEntry: BinEntry; updatedAt: string }
  | {
      type: 'move-group';
      groupId: string;
      targetFolderId: string | null;
      starred: boolean;
      archived: boolean;
      index: number;
      updatedAt: string;
    }
  | { type: 'add-tab'; groupId: string; tab: TabItem; updatedAt: string }
  | { type: 'update-tab'; groupId: string; tabId: string; updates: Partial<TabItem>; updatedAt: string }
  | { type: 'delete-tab'; groupId: string; tabId: string; binEntry: BinEntry; updatedAt: string }
  | {
      type: 'delete-tabs';
      deletions: Array<{
        groupId: string;
        tabId: string;
        binEntry: BinEntry;
      }>;
      updatedAt: string;
    }
  | { type: 'restore-group'; entryId: string; group: Group; index: number; updatedAt: string }
  | {
      type: 'restore-tab';
      entryId: string;
      groupId: string;
      tab: TabItem;
      index: number;
      updatedAt: string;
    }
  | { type: 'delete-bin-entry'; entryId: string; updatedAt: string }
  | { type: 'clear-bin'; updatedAt: string }
  | { type: 'update-settings'; updates: Partial<Settings>; updatedAt: string }
  | {
      type: 'move-tab';
      groupId: string;
      tabId: string;
      targetGroupId: string;
      targetIndex: number;
      updatedAt: string;
    }
  | {
      type: 'reorder-groups';
      workspaceId: string;
      folderId: string | null;
      starred: boolean;
      archived: boolean;
      orderedGroupIds: string[];
      updatedAt: string;
    }
  | { type: 'set-group-flags'; id: string; starred?: boolean; archived?: boolean; locked?: boolean; collapsed?: boolean; updatedAt: string }
  | { type: 'set-group-note'; groupId: string; text: string; noteTab: TabItem; updatedAt: string }
  | { type: 'set-tab-note'; groupId: string; tabId: string; text: string; updatedAt: string }
  | {
      type: 'set-category-order';
      workspaceId: string;
      expectedCategoryOrder: string[];
      categoryOrder: string[];
      updatedAt: string;
    }
  | { type: 'import-groups'; groups: Group[]; updatedAt: string }
  | { type: 'remove-restored-refs'; refs: TabRef[]; updatedAt: string }
  | {
      type: 'drop-intent';
      operationId: string;
      intent: DropIntent;
      openTabs: OpenTabInfo[];
      expectedRevision: number;
      updatedAt: string;
    };

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: RecordValue, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Reflect.ownKeys(value).every((key) => typeof key === 'string' && allowed.has(key));
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && isDenseArray(value) && value.every(isString);
}

function isUniqueStringArray(value: unknown): value is string[] {
  return isStringArray(value)
    && value.length <= MAX_REFS
    && new Set(value).size === value.length
    && value.every(isEntityId);
}

function isExpectedFolder(value: unknown): value is { name: string; color: string } {
  return isRecord(value)
    && hasOnlyKeys(value, ['name', 'color'])
    && isBoundedString(value.name, MAX_TITLE_BYTES)
    && normalizedFolderName(value.name) === value.name
    && value.name.length > 0
    && normalizeCategoryColor(value.color) === value.color;
}

function isExpectedRevision(value: unknown): boolean {
  return value === undefined || (
    typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
  );
}

const MAX_SAFE_REVISION = Number.MAX_SAFE_INTEGER;

function advanceRevision(state: TabBoardState, next: TabBoardState): TabBoardState {
  if (next === state || JSON.stringify(next) === JSON.stringify(state)) return next;
  if (!Number.isSafeInteger(state.mutationRevision) || state.mutationRevision >= MAX_SAFE_REVISION) {
    throw new Error('Mutation revision exhausted.');
  }
  return { ...next, mutationRevision: state.mutationRevision + 1 };
}

function isNullableString(value: unknown): boolean {
  return value === null || isString(value);
}

function isValidTabUrl(itemType: TabItem['itemType'], url: string): boolean {
  return itemType === 'link' ? url.length > 0 : url === '';
}

function isTabShape(value: unknown): value is TabItem {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'id', 'itemType', 'title', 'url', 'favIconUrl', 'note', 'pinned', 'incognito',
    'starred', 'taskStatus', 'browserGroup', 'sourceWindowId', 'sourceTabId', 'createdAt', 'updatedAt',
  ])) return false;
  return isEntityId(value.id) && (value.itemType === 'link' || value.itemType === 'note') &&
    isBoundedString(value.title, MAX_TITLE_BYTES)
    && isBoundedString(value.url, MAX_URL_BYTES)
    && isBoundedString(value.favIconUrl, MAX_FAVICON_URL_BYTES)
    && isBoundedString(value.note, MAX_TITLE_BYTES)
    && typeof value.pinned === 'boolean' && typeof value.incognito === 'boolean'
    && typeof value.starred === 'boolean' && isBoundedString(value.taskStatus, MAX_TITLE_BYTES)
    && (value.browserGroup === null || isBrowserGroup(value.browserGroup))
    && isNullableNumber(value.sourceWindowId) && isNullableNumber(value.sourceTabId)
    && isTimestamp(value.createdAt) && isTimestamp(value.updatedAt);
}

function isTab(value: unknown): value is TabItem {
  return isTabShape(value) && isValidTabUrl(value.itemType, value.url);
}

function assertValidTabUrl(tab: Pick<TabItem, 'itemType' | 'url'>): void {
  if (!isValidTabUrl(tab.itemType, tab.url)) {
    throw new StateMutationValidationError(
      'TAB_URL_INVALID',
      tab.itemType === 'link' ? 'Link tabs must have a non-empty URL.' : 'Note tabs must have an empty URL.',
    );
  }
}

function isGroup(value: unknown): value is Group {
  if (!isRecord(value)) return false;
  return isEntityId(value.id) && isBoundedString(value.title, MAX_TITLE_BYTES)
    && isBoundedString(value.note, MAX_TITLE_BYTES) && isEntityId(value.workspaceId)
    && (value.folderId === null || isEntityId(value.folderId))
    && typeof value.locked === 'boolean' && typeof value.starred === 'boolean'
    && typeof value.archived === 'boolean'
    && typeof value.collapsed === 'boolean' && Array.isArray(value.tabs)
    && isDenseArray(value.tabs)
    && value.tabs.every(isTab) && isTimestamp(value.createdAt) && isTimestamp(value.updatedAt);
}

function isFolder(value: unknown): value is Folder {
  if (!isRecord(value)) return false;
  return isEntityId(value.id) && isBoundedString(value.name, MAX_TITLE_BYTES)
    && isEntityId(value.workspaceId) && normalizeCategoryColor(value.color) !== null
    && typeof value.collapsed === 'boolean' && isTimestamp(value.createdAt)
    && isTimestamp(value.updatedAt);
}

function isWorkspace(value: unknown): value is Workspace {
  if (!isRecord(value)) return false;
  return isEntityId(value.id) && isBoundedString(value.name, MAX_TITLE_BYTES)
    && typeof value.emoji === 'string'
    && normalizeWorkspaceEmoji(value.emoji) === value.emoji
    && isTimestamp(value.createdAt) && isTimestamp(value.updatedAt);
}

function isBinEntry(value: unknown): value is BinEntry {
  if (!isRecord(value)) return false;
  return isEntityId(value.id) && (value.kind === 'group' || value.kind === 'tab')
    && isTimestamp(value.deletedAt)
    && (value.kind === 'group' ? isGroup(value.item) : isTab(value.item));
}

function isDeleteGroupBinEntry(value: unknown, groupId: string): value is BinEntry {
  return isBinEntry(value) && value.kind === 'group'
    && isBoundedString(value.label, MAX_TITLE_BYTES)
    && value.groupId === groupId && isBoundedString(value.groupTitle, MAX_TITLE_BYTES)
    && value.source === 'group' && value.item.id === groupId
    && isString(value.originalWorkspaceId) && isNullableString(value.originalFolderId);
}

function isDeleteTabBinEntry(value: unknown, groupId: string, tabId: string): value is BinEntry {
  return isBinEntry(value) && value.kind === 'tab'
    && isBoundedString(value.label, MAX_TITLE_BYTES)
    && value.groupId === groupId && isBoundedString(value.groupTitle, MAX_TITLE_BYTES)
    && value.source === 'group' && value.item.id === tabId
    && isString(value.originalGroupId)
    && isString(value.originalWorkspaceId) && isNullableString(value.originalFolderId);
}

type FieldValidator = (value: unknown) => boolean;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumber(value: unknown): boolean {
  return value === null || isFiniteNumber(value);
}

function isBrowserGroup(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, ['sourceGroupId', 'title', 'color', 'collapsed'])) return false;
  return isNullableNumber(value.sourceGroupId)
    && isBoundedString(value.title, MAX_TITLE_BYTES)
    && isBoundedString(value.color, MAX_TITLE_BYTES)
    && typeof value.collapsed === 'boolean';
}

function isPatch(value: unknown, validators: Record<string, FieldValidator>): boolean {
  return isRecord(value) && Object.keys(value).length > 0 && Object.entries(value).every(
    ([key, field]) => Boolean(validators[key]) && validators[key](field),
  );
}

const groupPatchFields: Record<string, FieldValidator> = {
  title: (value) => isBoundedString(value, MAX_TITLE_BYTES),
  note: (value) => isBoundedString(value, MAX_TITLE_BYTES),
  workspaceId: isString,
  folderId: isNullableString,
  locked: (value) => typeof value === 'boolean',
  starred: (value) => typeof value === 'boolean',
  archived: (value) => typeof value === 'boolean',
  collapsed: (value) => typeof value === 'boolean',
  tabs: (value) => Array.isArray(value) && isDenseArray(value) && value.every(isTab),
};

const tabPatchFields: Record<string, FieldValidator> = {
  itemType: (value) => value === 'link' || value === 'note',
  title: (value) => isBoundedString(value, MAX_TITLE_BYTES),
  url: (value) => isBoundedString(value, MAX_URL_BYTES),
  favIconUrl: (value) => isBoundedString(value, MAX_FAVICON_URL_BYTES),
  note: (value) => isBoundedString(value, MAX_TITLE_BYTES),
  pinned: (value) => typeof value === 'boolean',
  incognito: (value) => typeof value === 'boolean',
  starred: (value) => typeof value === 'boolean',
  taskStatus: (value) => isBoundedString(value, MAX_TITLE_BYTES),
  browserGroup: (value) => value === null || isBrowserGroup(value),
  sourceWindowId: isNullableNumber,
  sourceTabId: isNullableNumber,
};

const settingsPatchFields: Record<string, FieldValidator> = {
  actionClick: (value) => value === 'store' || value === 'popup',
  closeTabsAfterSave: (value) => typeof value === 'boolean',
  confirmBeforeDestructive: (value) => typeof value === 'boolean',
  dedupeOnSave: (value) => typeof value === 'boolean',
  deleteRestoredTabs: (value) => typeof value === 'boolean',
  customUrlFilter: (value) => typeof value === 'string',
  excludePinned: (value) => typeof value === 'boolean',
  focusRestoredTabs: (value) => typeof value === 'boolean',
  includeChromeUrls: (value) => typeof value === 'boolean',
  includeFileUrls: (value) => typeof value === 'boolean',
  openManagerAfterSave: (value) => typeof value === 'boolean',
  restoreGroupsInNewWindow: (value) => typeof value === 'boolean',
  restoreNextToCurrent: (value) => typeof value === 'boolean',
  theme: (value) => value === 'system' || value === 'light' || value === 'dark',
};

function isUpdated(value: RecordValue): boolean {
  return isTimestamp(value.updatedAt);
}

export function isStateMutation(value: unknown): value is StateMutation {
  if (!isRecord(value) || !isString(value.type)) return false;
  switch (value.type) {
    case 'set-active-workspace':
      return isString(value.workspaceId) && isUpdated(value);
    case 'add-workspace':
      return isWorkspace(value.workspace);
    case 'rename-workspace':
      return isString(value.id) && isBoundedString(value.name, MAX_TITLE_BYTES) && isUpdated(value);
    case 'update-workspace':
      return isString(value.id)
        && isBoundedString(value.name, MAX_TITLE_BYTES)
        && typeof value.emoji === 'string'
        && normalizeWorkspaceEmoji(value.emoji) === value.emoji
        && isUpdated(value);
    case 'set-workspace-order':
      return isStringArray(value.orderedWorkspaceIds) && isUpdated(value);
    case 'delete-workspace':
      return isString(value.id) && isString(value.newActiveWorkspaceId) && isUpdated(value);
    case 'add-folder':
      return isFolder(value.folder);
    case 'rename-folder':
      return isString(value.id) && isBoundedString(value.name, MAX_TITLE_BYTES) && isUpdated(value);
    case 'update-folder':
      return hasOnlyKeys(value, ['type', 'id', 'name', 'color', 'expected', 'updatedAt'])
        && isEntityId(value.id)
        && isBoundedString(value.name, MAX_TITLE_BYTES)
        && normalizeCategoryColor(value.color) !== null
        && isExpectedFolder(value.expected)
        && isUpdated(value);
    case 'delete-folder':
      return isString(value.id) && isUpdated(value);
    case 'set-folder-collapsed':
      return isString(value.id) && typeof value.collapsed === 'boolean' && isUpdated(value);
    case 'add-group':
      return isGroup(value.group) && isUpdated(value);
    case 'prepend-groups':
    case 'import-groups':
      return Array.isArray(value.groups) && isDenseArray(value.groups) && value.groups.every(isGroup) && isUpdated(value);
    case 'update-group':
      return isString(value.id) && isPatch(value.updates, groupPatchFields) && isUpdated(value);
    case 'delete-group':
      return isString(value.id) && isDeleteGroupBinEntry(value.binEntry, value.id) && isUpdated(value);
    case 'move-group':
      return isString(value.groupId) && (value.targetFolderId === null || isString(value.targetFolderId)) &&
        typeof value.starred === 'boolean' && typeof value.archived === 'boolean' && typeof value.index === 'number' && Number.isFinite(value.index) &&
        isUpdated(value);
    case 'add-tab':
      return isString(value.groupId) && isTab(value.tab) && isUpdated(value);
    case 'update-tab':
      return isString(value.groupId) && isString(value.tabId) && isPatch(value.updates, tabPatchFields) && isUpdated(value);
    case 'delete-tab':
      return isString(value.groupId) && isString(value.tabId)
        && isDeleteTabBinEntry(value.binEntry, value.groupId, value.tabId) && isUpdated(value);
    case 'delete-tabs':
      return hasOnlyKeys(value, ['type', 'deletions', 'updatedAt'])
        && Array.isArray(value.deletions)
        && value.deletions.length > 0
        && value.deletions.length <= DELETE_TABS_LIMIT
        && isDenseArray(value.deletions)
        && value.deletions.every((deletion) =>
          isRecord(deletion)
          && hasOnlyKeys(deletion, ['groupId', 'tabId', 'binEntry'])
          && isString(deletion.groupId)
          && isString(deletion.tabId)
          && isDeleteTabBinEntry(
            deletion.binEntry,
            deletion.groupId,
            deletion.tabId,
          ))
        && new Set(value.deletions.map((deletion) =>
          `${deletion.groupId}:${deletion.tabId}`)).size === value.deletions.length
        && isUpdated(value);
    case 'restore-group':
      return isString(value.entryId) && isGroup(value.group) &&
        typeof value.index === 'number' && Number.isFinite(value.index) && isUpdated(value);
    case 'restore-tab':
      return isString(value.entryId) && isString(value.groupId) && isTab(value.tab) &&
        typeof value.index === 'number' && Number.isFinite(value.index) && isUpdated(value);
    case 'delete-bin-entry':
      return isString(value.entryId) && isUpdated(value);
    case 'clear-bin':
      return isUpdated(value);
    case 'update-settings':
      return isPatch(value.updates, settingsPatchFields) && isUpdated(value);
    case 'move-tab':
      return isString(value.groupId) && isString(value.tabId) && isString(value.targetGroupId) &&
        typeof value.targetIndex === 'number' && Number.isFinite(value.targetIndex) && isUpdated(value);
    case 'reorder-groups':
      return isString(value.workspaceId) && (value.folderId === null || isString(value.folderId)) &&
        typeof value.starred === 'boolean' && typeof value.archived === 'boolean' && isStringArray(value.orderedGroupIds) && isUpdated(value);
    case 'set-group-flags':
      return hasOnlyKeys(value, ['type', 'id', 'starred', 'archived', 'locked', 'collapsed', 'updatedAt'])
        && isString(value.id) && (value.starred === undefined || typeof value.starred === 'boolean') &&
        (value.archived === undefined || typeof value.archived === 'boolean') &&
        (value.locked === undefined || typeof value.locked === 'boolean') &&
        (value.collapsed === undefined || typeof value.collapsed === 'boolean') && isUpdated(value);
    case 'set-group-note':
      return isString(value.groupId) && isBoundedString(value.text, MAX_TITLE_BYTES) && isTabShape(value.noteTab) && isUpdated(value);
    case 'set-tab-note':
      return isString(value.groupId) && isString(value.tabId)
        && isBoundedString(value.text, MAX_TITLE_BYTES) && isUpdated(value);
    case 'set-category-order':
      return hasOnlyKeys(value, [
        'type',
        'workspaceId',
        'expectedCategoryOrder',
        'categoryOrder',
        'updatedAt',
      ])
        && isEntityId(value.workspaceId)
        && isUniqueStringArray(value.expectedCategoryOrder)
        && isUniqueStringArray(value.categoryOrder)
        && isUpdated(value);
    case 'remove-restored-refs':
      return Array.isArray(value.refs) && isDenseArray(value.refs) && value.refs.every(isTabRef) && isUpdated(value);
    case 'drop-intent':
      return hasOnlyKeys(value, ['type', 'operationId', 'intent', 'openTabs', 'expectedRevision', 'updatedAt'])
        && isExpectedRevision(value.expectedRevision)
        && value.expectedRevision !== undefined
        && isDropPayloadWithinLimits(value.operationId, value.intent, value.openTabs)
        && isUpdated(value);
    default:
      return false;
  }
}

function isTabRef(value: unknown): value is TabRef {
  if (!isRecord(value)) return false;
  return isString(value.source) && isString(value.groupId) && isString(value.tabId);
}

function isDropIntent(value: unknown): value is DropIntent {
  return isDropIntentShape(value);
}

function isOpenTabInfo(value: unknown): value is OpenTabInfo {
  return isOpenTabInfoShape(value);
}

function invalidTabUrlKind(value: unknown): TabItem['itemType'] | undefined {
  if (!isRecord(value) || (value.itemType !== 'link' && value.itemType !== 'note') || typeof value.url !== 'string') {
    return undefined;
  }
  return isValidTabUrl(value.itemType, value.url) ? undefined : value.itemType;
}

function hasInvalidFullTabUrl(value: unknown): TabItem['itemType'] | undefined {
  const directKind = invalidTabUrlKind(value);
  if (directKind) return directKind;
  if (Array.isArray(value)) {
    for (const item of value) {
      const kind = hasInvalidFullTabUrl(item);
      if (kind) return kind;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  if (Array.isArray(value.tabs)) {
    for (const tabValue of value.tabs) {
      const kind = hasInvalidFullTabUrl(tabValue);
      if (kind) return kind;
    }
  }
  if (Array.isArray(value.groups)) {
    for (const groupValue of value.groups) {
      const kind = hasInvalidFullTabUrl(groupValue);
      if (kind) return kind;
    }
  }
  return undefined;
}

function mutationWithInvalidTabUrl(value: unknown): TabItem['itemType'] | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') return undefined;
  switch (value.type) {
    case 'add-tab':
    case 'restore-tab':
      return hasInvalidFullTabUrl(value.tab);
    case 'add-group':
      return hasInvalidFullTabUrl(value.group);
    case 'prepend-groups':
    case 'import-groups':
      return hasInvalidFullTabUrl(value.groups);
    case 'restore-group':
      return hasInvalidFullTabUrl(value.group);
    case 'set-group-note':
      return hasInvalidFullTabUrl(value.noteTab);
    case 'delete-group':
    case 'delete-tab':
      return isRecord(value.binEntry) ? hasInvalidFullTabUrl(value.binEntry.item) : undefined;
    case 'delete-tabs':
      return Array.isArray(value.deletions)
        ? hasInvalidFullTabUrl(value.deletions.map((deletion) =>
            isRecord(deletion) && isRecord(deletion.binEntry)
              ? deletion.binEntry.item
              : deletion))
        : undefined;
    case 'update-group': {
      const updates = isRecord(value.updates) ? value.updates : undefined;
      return updates && Object.prototype.hasOwnProperty.call(updates, 'tabs')
        ? hasInvalidFullTabUrl(updates.tabs)
        : undefined;
    }
    default:
      return undefined;
  }
}

function assertMutation(value: unknown): asserts value is StateMutation {
  const invalidKind = mutationWithInvalidTabUrl(value);
  if (invalidKind) {
    throw new StateMutationValidationError(
      'TAB_URL_INVALID',
      invalidKind === 'link' ? 'Link tabs must have a non-empty URL.' : 'Note tabs must have an empty URL.',
    );
  }
  if (isStateMutation(value)) return;
  throw new Error('Invalid state mutation.');
}

export interface ValidatedMutationBatch {
  mutations: StateMutation[];
  originalIndexes: number[];
  invalidDropIndexes: number[];
}

export function validateMutationBatch(input: unknown): ValidatedMutationBatch {
  if (!Array.isArray(input) || input.length > MAX_MUTATIONS || !isDenseArray(input)) {
    throw new Error('Invalid state mutation batch.');
  }
  const mutations: StateMutation[] = [];
  const originalIndexes: number[] = [];
  const invalidDropIndexes: number[] = [];
  input.forEach((value, index) => {
    if (isStateMutation(value)) {
      mutations.push(value);
      originalIndexes.push(index);
      return;
    }
    if (isRecord(value) && value.type === 'drop-intent') {
      invalidDropIndexes.push(index);
      return;
    }
    assertMutation(value);
  });
  return { mutations, originalIndexes, invalidDropIndexes };
}

function isValidGroupPlacement(
  state: TabBoardState,
  workspaceId: string,
  folderId: string | null,
  starred: boolean,
  archived: boolean,
): boolean {
  if (!state.workspaces.some((workspace) => workspace.id === workspaceId)) return false;
  if (starred && archived) return false;
  if (starred) return folderId === null;
  if (archived) return folderId === null;
  if (folderId === null) return true;
  const folder = state.folders.find((item) => item.id === folderId);
  return Boolean(folder && folder.workspaceId === workspaceId);
}

function groupPlacementValidationError(
  state: TabBoardState,
  workspaceId: string,
  folderId: string | null,
  starred: boolean,
  archived: boolean,
): StateMutationValidationError | undefined {
  if (!state.workspaces.some((workspace) => workspace.id === workspaceId)) {
    return new StateMutationValidationError('WORKSPACE_NOT_FOUND', 'Invalid state mutation. Workspace not found.');
  }
  if (starred && archived) {
    return new StateMutationValidationError('GROUP_PLACEMENT_INVALID', 'Group cannot be both starred and archived.');
  }
  if (starred && folderId !== null) {
    return new StateMutationValidationError('GROUP_PLACEMENT_INVALID', 'Starred groups cannot belong to a folder.');
  }
  if (archived && folderId !== null) {
    return new StateMutationValidationError('GROUP_PLACEMENT_INVALID', 'Archived groups cannot belong to a folder.');
  }
  if (folderId === null) return undefined;
  const folder = state.folders.find((item) => item.id === folderId);
  if (!folder) return new StateMutationValidationError('FOLDER_NOT_FOUND', 'Folder not found.');
  if (folder.workspaceId !== workspaceId) {
    return new StateMutationValidationError('GROUP_PLACEMENT_INVALID', 'Group folder must belong to the group workspace.');
  }
  return undefined;
}

function assertGroupPlacement(
  state: TabBoardState,
  workspaceId: string,
  folderId: string | null,
  starred: boolean,
  archived: boolean,
): void {
  const error = groupPlacementValidationError(state, workspaceId, folderId, starred, archived);
  if (error) throw error;
}

function sameTabContent(source: TabItem, restored: TabItem): boolean {
  return source.id === restored.id && source.createdAt === restored.createdAt &&
    source.itemType === restored.itemType &&
    source.title === restored.title && source.url === restored.url &&
    source.favIconUrl === restored.favIconUrl && source.note === restored.note &&
    source.pinned === restored.pinned && source.incognito === restored.incognito &&
    source.starred === restored.starred && source.taskStatus === restored.taskStatus &&
    JSON.stringify(source.browserGroup) === JSON.stringify(restored.browserGroup) &&
    source.sourceWindowId === restored.sourceWindowId && source.sourceTabId === restored.sourceTabId;
}

function sameGroupContent(source: Group, restored: Group): boolean {
  return source.id === restored.id && source.createdAt === restored.createdAt &&
    source.title === restored.title &&
    source.note === restored.note && source.locked === restored.locked &&
    source.starred === restored.starred && source.collapsed === restored.collapsed &&
    source.tabs.length === restored.tabs.length &&
    source.tabs.every((tab, index) => sameTabContent(tab, restored.tabs[index]));
}

export function resolveRestoreWorkspaceId(
  state: TabBoardState,
  entry: BinEntry,
  fallbackWorkspaceId: string,
): string {
  if (entry.originalWorkspaceId && state.workspaces.some((workspace) => workspace.id === entry.originalWorkspaceId)) {
    return entry.originalWorkspaceId;
  }
  const originalGroup = entry.originalGroupId
    ? state.groups.find((group) => group.id === entry.originalGroupId)
    : undefined;
  if (originalGroup) return originalGroup.workspaceId;
  if (state.workspaces.some((workspace) => workspace.id === fallbackWorkspaceId)) return fallbackWorkspaceId;
  return state.activeWorkspaceId;
}

function restoreFolderId(state: TabBoardState, entry: BinEntry, workspaceId: string, starred: boolean): string | null {
  if (starred || !entry.originalFolderId) return null;
  return state.folders.some((folder) => folder.id === entry.originalFolderId && folder.workspaceId === workspaceId)
    ? entry.originalFolderId
    : null;
}

function groupPlacementPosition(
  state: TabBoardState,
  group: Group,
  ignoredGroupIds: ReadonlySet<string> = new Set(),
): string {
  const index = state.groups
    .filter((candidate) => candidate.workspaceId === group.workspaceId
      && candidate.folderId === group.folderId
      && candidate.starred === group.starred
      && !ignoredGroupIds.has(candidate.id))
    .findIndex((candidate) => candidate.id === group.id);
  return `${group.workspaceId}:${group.folderId ?? 'inbox'}:${group.starred ? 'starred' : 'regular'}:${index}`;
}

function lockedSiblingPlacementChanged(
  before: TabBoardState,
  after: TabBoardState,
  movedGroupId: string,
  ignoredRemovedGroupIds: ReadonlySet<string> = new Set(),
): boolean {
  return before.groups
    .filter((group) => group.locked && group.id !== movedGroupId)
    .some((lockedGroup) => {
      const next = after.groups.find((group) => group.id === lockedGroup.id);
      return !next
        || groupPlacementPosition(
          before,
          lockedGroup,
          ignoredRemovedGroupIds,
        ) !== groupPlacementPosition(after, next);
    });
}

function removedUnlockedMoveTabSourceIds(
  before: TabBoardState,
  after: TabBoardState,
  intent: Extract<DropIntent, { kind: 'move-tabs' }>,
): Set<string> {
  const sourceIds = new Set(intent.refs.map(({ groupId }) => groupId));
  return new Set(before.groups.flatMap((group) =>
    sourceIds.has(group.id)
    && !group.locked
    && !after.groups.some(({ id }) => id === group.id)
      ? [group.id]
      : []));
}

function simulateSessionMove(
  state: TabBoardState,
  groupId: string,
  category: CategoryFilter,
  index: number,
): TabBoardState | undefined {
  try {
    return moveSessionToCategory(state, { groupId, category, index });
  } catch {
    return undefined;
  }
}

function assertLockedSiblingPlacementUnchanged(
  before: TabBoardState,
  after: TabBoardState | undefined,
  movedGroupId: string,
): void {
  if (after && lockedSiblingPlacementChanged(before, after, movedGroupId)) {
    throw new StateMutationValidationError('GROUP_LOCKED', 'Cannot change placement of a locked group.');
  }
}

function simulateGroupUpdate(
  state: TabBoardState,
  groupId: string,
  updates: Partial<Group>,
): TabBoardState | undefined {
  if (!state.groups.some((group) => group.id === groupId)) return undefined;
  return {
    ...state,
    groups: state.groups.map((group) => group.id === groupId ? { ...group, ...clone(updates) } : group),
  };
}

function assertGroupPlacementMutationSafety(
  state: TabBoardState,
  groupId: string,
  workspaceId: string,
  folderId: string | null,
  starred: boolean,
  archived: boolean,
  after: TabBoardState | undefined,
): void {
  if (!isValidGroupPlacement(state, workspaceId, folderId, starred, archived)) return;
  assertLockedSiblingPlacementUnchanged(state, after, groupId);
}

function simulateDeleteFolder(state: TabBoardState, folderId: string): TabBoardState | undefined {
  const folder = state.folders.find((item) => item.id === folderId);
  if (!folder) return undefined;
  return {
    ...state,
    groups: state.groups.map((group) =>
      group.workspaceId === folder.workspaceId && group.folderId === folderId
        ? { ...group, folderId: null }
        : group),
  };
}

function simulateDeleteGroup(state: TabBoardState, groupId: string): TabBoardState | undefined {
  if (!state.groups.some((group) => group.id === groupId)) return undefined;
  return { ...state, groups: state.groups.filter((group) => group.id !== groupId) };
}

function simulatePrependGroups(state: TabBoardState, groups: readonly Group[]): TabBoardState {
  const fresh = newGroups(state, groups);
  return fresh.length ? { ...state, groups: [...fresh, ...state.groups] } : state;
}

function simulateRestoreGroup(
  state: TabBoardState,
  mutation: Extract<StateMutation, { type: 'restore-group' }>,
): TabBoardState | undefined {
  const sourceIndex = state.bin.findIndex((entry) => entry.id === mutation.entryId && entry.kind === 'group');
  if (sourceIndex < 0) return undefined;
  const matchingIndexes = state.groups
    .map((group, index) => ({ group, index }))
    .filter(({ group }) => group.workspaceId === mutation.group.workspaceId
      && group.folderId === mutation.group.folderId && group.starred === mutation.group.starred)
    .map(({ index }) => index);
  const categoryIndex = Math.max(0, Math.min(Math.trunc(mutation.index), matchingIndexes.length));
  const workspaceIndexes = state.groups
    .map((group, index) => group.workspaceId === mutation.group.workspaceId ? index : -1)
    .filter((index) => index >= 0);
  const index = categoryIndex < matchingIndexes.length
    ? matchingIndexes[categoryIndex]
    : matchingIndexes.length
      ? matchingIndexes[matchingIndexes.length - 1] + 1
      : workspaceIndexes.length
        ? workspaceIndexes[workspaceIndexes.length - 1] + 1
        : state.groups.length;
  return {
    ...state,
    groups: [...state.groups.slice(0, index), clone(mutation.group), ...state.groups.slice(index)],
  };
}

function simulateRemoveRestoredRefs(state: TabBoardState, refs: readonly TabRef[]): TabBoardState {
  const groupRefs = new Set(refs
    .filter((ref) => ref.source === 'group')
    .map((ref) => `${ref.groupId}:${ref.tabId}`));
  return {
    ...state,
    groups: state.groups
      .map((group) => ({ ...group, tabs: group.tabs.filter((tab) => !groupRefs.has(`${group.id}:${tab.id}`)) }))
      .filter((group) => group.tabs.length || group.locked || group.note),
  };
}

export function isLockedDropIntent(
  state: TabBoardState,
  intent: DropIntent,
  openTabs: readonly OpenTabInfo[] = [],
  operationId = '',
): boolean {
  const isLocked = (groupId: string): boolean => Boolean(state.groups.find((group) => group.id === groupId)?.locked);
  const directlyLocked = (() => {
    switch (intent.kind) {
      case 'move-session':
        return isLocked(intent.groupId);
      case 'move-tabs':
        return isLocked(intent.targetGroupId) || intent.refs.some((ref) => isLocked(ref.groupId));
      case 'copy-open-tabs':
        return isLocked(intent.targetGroupId);
      case 'create-session':
        return intent.source.kind === 'saved-tabs' && intent.source.refs.some((ref) => isLocked(ref.groupId));
      default:
        return false;
    }
  })();
  if (directlyLocked) return true;

  const after = intent.kind === 'move-session'
    ? simulateSessionMove(state, intent.groupId, intent.category, intent.index)
    : executeDropIntent(state, intent, openTabs, operationId);
  const ignoredRemovedGroupIds = intent.kind === 'move-tabs' && after
    ? removedUnlockedMoveTabSourceIds(state, after, intent)
    : new Set<string>();
  return Boolean(after && lockedSiblingPlacementChanged(
    state,
    after,
    intent.kind === 'move-session' ? intent.groupId : '',
    ignoredRemovedGroupIds,
  ));
}

function isCanonicalGroupNoteTab(noteTab: TabItem, text: string): boolean {
  return noteTab.itemType === 'note'
    && noteTab.url === ''
    && noteTab.favIconUrl === ''
    && noteTab.note === text
    && !noteTab.pinned
    && !noteTab.incognito
    && !noteTab.starred
    && noteTab.taskStatus === 'none'
    && noteTab.browserGroup === null
    && noteTab.sourceWindowId === null
    && noteTab.sourceTabId === null;
}

function assertGroupUnlocked(group: Group | undefined): void {
  if (group?.locked) {
    throw new StateMutationValidationError('GROUP_LOCKED', 'Cannot modify a locked group.');
  }
}

function assertGroupsUnlocked(groups: readonly Group[]): void {
  assertGroupUnlocked(groups.find((group) => group.locked));
}

function simulateReorderGroups(
  state: TabBoardState,
  mutation: Extract<StateMutation, { type: 'reorder-groups' }>,
): TabBoardState | undefined {
  const matching = state.groups.filter((group) => group.workspaceId === mutation.workspaceId
    && group.folderId === mutation.folderId
    && group.starred === mutation.starred);
  const orderedSet = new Set(mutation.orderedGroupIds);
  if (orderedSet.size !== mutation.orderedGroupIds.length
    || mutation.orderedGroupIds.some((id) => !matching.some((group) => group.id === id))) return undefined;
  const ordered = mutation.orderedGroupIds
    .map((id) => matching.find((group) => group.id === id))
    .filter(Boolean) as Group[];
  const remaining = matching.filter((group) => !orderedSet.has(group.id));
  const replacements = [...ordered, ...remaining];
  const matchingIds = new Set(matching.map((group) => group.id));
  let replacementIndex = 0;
  const groups = state.groups.map((group) => {
    if (!matchingIds.has(group.id)) return group;
    const replacement = replacements[replacementIndex++];
    return orderedSet.has(replacement.id)
      ? { ...replacement, updatedAt: mutation.updatedAt }
      : replacement;
  });
  return { ...state, groups, updatedAt: mutation.updatedAt };
}

function assertOrdinaryMutationSafety(state: TabBoardState, mutation: StateMutation): void {
  switch (mutation.type) {
    case 'delete-workspace':
      assertGroupsUnlocked(state.groups.filter((group) => group.workspaceId === mutation.id));
      return;
    case 'delete-folder': {
      const folder = state.folders.find((item) => item.id === mutation.id);
      assertGroupsUnlocked(state.groups.filter((group) =>
        group.workspaceId === folder?.workspaceId
        && group.folderId === mutation.id));
      assertLockedSiblingPlacementUnchanged(state, simulateDeleteFolder(state, mutation.id), '');
      return;
    }
    case 'remove-restored-refs': {
      const refs = new Set(mutation.refs
        .filter((ref) => ref.source === 'group')
        .map((ref) => `${ref.groupId}:${ref.tabId}`));
      assertGroupsUnlocked(state.groups.filter((group) => group.tabs.some((tab) => refs.has(`${group.id}:${tab.id}`))));
      assertLockedSiblingPlacementUnchanged(state, simulateRemoveRestoredRefs(state, mutation.refs), '');
      return;
    }
    case 'prepend-groups':
      if (mutation.groups.some((group) => !isExactGroupReplay(state, group)
        && !isValidGroupPlacement(state, group.workspaceId, group.folderId, group.starred, group.archived))) return;
      assertLockedSiblingPlacementUnchanged(state, simulatePrependGroups(state, mutation.groups), '');
      return;
    case 'reorder-groups': {
      const matching = state.groups.filter((group) => group.workspaceId === mutation.workspaceId
        && group.folderId === mutation.folderId
        && group.starred === mutation.starred
        && group.archived === mutation.archived);
      const retimestampsLockedGroup = mutation.orderedGroupIds.some((id) =>
        matching.some((group) => group.id === id && group.locked));
      if (retimestampsLockedGroup) assertGroupsUnlocked(matching);
      const orderedSet = new Set(mutation.orderedGroupIds);
      const ordered = mutation.orderedGroupIds
        .map((id) => matching.find((group) => group.id === id))
        .filter(Boolean) as Group[];
      const unlisted = matching.filter((group) => !orderedSet.has(group.id));
      const simulated = simulateReorderGroups(state, mutation);
      const simulatedMatching = simulated?.groups.filter((group) => group.workspaceId === mutation.workspaceId
        && group.folderId === mutation.folderId
        && group.starred === mutation.starred
        && group.archived === mutation.archived);
      const orderUnchanged = Boolean(simulatedMatching
        && simulatedMatching.length === matching.length
        && simulatedMatching.every((group, index) => group.id === matching[index]?.id));
      if (orderUnchanged && matching.some((group) => group.locked)
        && !hasExactReorderTimestampEvidence(ordered, unlisted, mutation.updatedAt)) {
        assertGroupsUnlocked(matching);
      }
      assertLockedSiblingPlacementUnchanged(state, simulated, '');
      return;
    }
    case 'update-group': {
      const group = state.groups.find((item) => item.id === mutation.id);
      assertGroupUnlocked(group);
      if (!group) return;
      const updates = mutation.updates;
      const workspaceId = Object.prototype.hasOwnProperty.call(updates, 'workspaceId')
        ? updates.workspaceId as string
        : group.workspaceId;
      const folderId = Object.prototype.hasOwnProperty.call(updates, 'folderId')
        ? updates.folderId as string | null
        : group.folderId;
      const starred = Object.prototype.hasOwnProperty.call(updates, 'starred')
        ? updates.starred as boolean
        : group.starred;
      const archived = Object.prototype.hasOwnProperty.call(updates, 'archived')
        ? updates.archived as boolean
        : group.archived;
      assertGroupPlacementMutationSafety(
        state,
        group.id,
        workspaceId,
        folderId,
        starred,
        archived,
        simulateGroupUpdate(state, group.id, updates),
      );
      return;
    }
    case 'delete-group': {
      const group = state.groups.find((item) => item.id === mutation.id);
      assertGroupUnlocked(group);
      if (!group && mutation.binEntry.kind === 'group' && (mutation.binEntry.item as Group).locked) {
        throw new StateMutationValidationError('GROUP_LOCKED', 'Cannot modify a locked group.');
      }
      assertLockedSiblingPlacementUnchanged(state, simulateDeleteGroup(state, mutation.id), '');
      return;
    }
    case 'move-group': {
      const group = state.groups.find((item) => item.id === mutation.groupId);
      assertGroupUnlocked(group);
      if (!group || !isValidGroupPlacement(state, group.workspaceId, mutation.targetFolderId, mutation.starred, mutation.archived)) return;
      let category: CategoryFilter = 'inbox';
      if (mutation.archived) {
        category = 'archive';
      } else if (mutation.starred) {
        category = 'saved';
      } else if (mutation.targetFolderId) {
        category = `folder:${mutation.targetFolderId}`;
      }
      assertLockedSiblingPlacementUnchanged(
        state,
        simulateSessionMove(state, mutation.groupId, category, mutation.index),
        mutation.groupId,
      );
      return;
    }
    case 'add-tab':
    case 'set-group-note':
      assertGroupUnlocked(state.groups.find((group) => group.id === mutation.groupId));
      return;
    case 'update-tab': {
      const group = state.groups.find((item) => item.id === mutation.groupId);
      assertGroupUnlocked(group);
      const tab = group?.tabs.find((item) => item.id === mutation.tabId);
      if (tab) assertValidTabUrl({ ...tab, ...clone(mutation.updates) });
      return;
    }
    case 'delete-tab':
      assertGroupUnlocked(state.groups.find((group) => group.id === mutation.groupId));
      return;
    case 'delete-tabs':
      assertGroupsUnlocked(state.groups.filter((group) =>
        mutation.deletions.some(({ groupId }) => groupId === group.id)));
      return;
    case 'move-tab':
      assertGroupUnlocked(state.groups.find((group) => group.id === mutation.groupId));
      assertGroupUnlocked(state.groups.find((group) => group.id === mutation.targetGroupId));
      return;
    case 'restore-group':
      if (!isValidGroupPlacement(state, mutation.group.workspaceId, mutation.group.folderId, mutation.group.starred, mutation.group.archived)) return;
      assertLockedSiblingPlacementUnchanged(state, simulateRestoreGroup(state, mutation), '');
      return;
    case 'restore-tab':
      assertGroupUnlocked(state.groups.find((group) => group.id === mutation.groupId));
      return;
    case 'set-tab-note':
      assertGroupUnlocked(state.groups.find((group) => group.id === mutation.groupId));
      return;
    case 'set-group-flags': {
      const group = state.groups.find((item) => item.id === mutation.id);
      if (!group) return;
      if (group.locked) {
        const hasOwn = (key: string): boolean => Object.prototype.hasOwnProperty.call(mutation, key);
        if (mutation.locked !== false || !hasOwn('locked') || hasOwn('starred') || hasOwn('archived') || hasOwn('collapsed')) {
          throw new StateMutationValidationError('GROUP_LOCKED', 'Only unlocking a locked group is allowed.');
        }
        return;
      }
      if (mutation.starred !== undefined) {
        const starred = mutation.starred;
        const archived = group.archived;
        assertGroupPlacementMutationSafety(
          state,
          group.id,
          group.workspaceId,
          starred ? null : group.folderId,
          starred,
          archived,
          simulateGroupUpdate(state, group.id, {
            starred,
            folderId: starred ? null : group.folderId,
          }),
        );
      }
      if (mutation.archived !== undefined) {
        const archived = mutation.archived;
        const starred = archived ? false : group.starred;
        assertGroupPlacementMutationSafety(
          state,
          group.id,
          group.workspaceId,
          archived ? null : group.folderId,
          starred,
          archived,
          simulateGroupUpdate(state, group.id, {
            archived,
            starred,
            folderId: archived ? null : group.folderId,
          }),
        );
      }
      return;
    }
    default:
      return;
  }
}

function assertStateMutationSemantics(state: TabBoardState, mutation: StateMutation): void {
  const invalid = (error: Error = new Error('Invalid state mutation.')): never => {
    throw error;
  };
  switch (mutation.type) {
    case 'set-active-workspace':
      if (!state.workspaces.some((workspace) => workspace.id === mutation.workspaceId)) {
        invalid(new StateMutationValidationError('WORKSPACE_NOT_FOUND', 'Workspace not found.'));
      }
      return;
    case 'add-workspace':
      if (state.workspaces.some((workspace) => workspace.id === mutation.workspace.id)) {
        invalid(new StateMutationValidationError('WORKSPACE_ID_CONFLICT', 'Workspace ID already exists.'));
      }
      return;
    case 'rename-workspace':
      if (!state.workspaces.some((workspace) => workspace.id === mutation.id)) {
        invalid(new StateMutationValidationError('WORKSPACE_NOT_FOUND', 'Workspace not found.'));
      }
      return;
    case 'update-workspace': {
      const workspace = state.workspaces.find((item) => item.id === mutation.id);
      if (!workspace) {
        invalid(new StateMutationValidationError('WORKSPACE_NOT_FOUND', 'Workspace not found.'));
      }
      const normalizedName = normalizeWorkspaceName(mutation.name);
      if (!normalizedName) {
        throw new StateMutationValidationError(
          'WORKSPACE_NAME_INVALID',
          'Workspace name is required.',
        );
      }
      if (normalizeWorkspaceEmoji(mutation.emoji) !== mutation.emoji) {
        invalid(new StateMutationValidationError('WORKSPACE_EMOJI_INVALID', 'Workspace emoji must be normalized.'));
      }
      const nameKey = workspaceNameKey(normalizedName);
      if (state.workspaces.some((item) =>
        item.id !== mutation.id && workspaceNameKey(item.name) === nameKey)) {
        invalid(new StateMutationValidationError(
          'WORKSPACE_NAME_DUPLICATE',
          'A workspace with this name already exists.',
        ));
      }
      return;
    }
    case 'set-workspace-order': {
      const currentIds = new Set(state.workspaces.map(({ id }) => id));
      const orderedIds = new Set(mutation.orderedWorkspaceIds);
      if (mutation.orderedWorkspaceIds.length !== state.workspaces.length
        || orderedIds.size !== mutation.orderedWorkspaceIds.length
        || mutation.orderedWorkspaceIds.some((id) => !currentIds.has(id))) {
        invalid(new StateMutationValidationError(
          'WORKSPACE_ORDER_INVALID',
          'Workspace order must contain every current workspace exactly once.',
        ));
      }
      return;
    }
    case 'delete-workspace': {
      const target = state.workspaces.find((workspace) => workspace.id === mutation.id);
      if (!target) invalid(new StateMutationValidationError('WORKSPACE_NOT_FOUND', 'Workspace not found.'));
      if (state.workspaces.length <= 1) {
        invalid(new StateMutationValidationError('WORKSPACE_DELETE_INVALID', 'Cannot delete the only workspace.'));
      }
      const surviving = state.workspaces.some((workspace) =>
        workspace.id !== mutation.id && workspace.id === mutation.newActiveWorkspaceId,
      );
      if (!surviving || mutation.newActiveWorkspaceId === mutation.id) {
        invalid(new StateMutationValidationError('WORKSPACE_DELETE_INVALID', 'Replacement workspace must survive deletion.'));
      }
      if (mutation.id !== state.activeWorkspaceId && mutation.newActiveWorkspaceId !== state.activeWorkspaceId) {
        invalid(new StateMutationValidationError('WORKSPACE_DELETE_INVALID', 'Deleting an inactive workspace cannot change the active workspace.'));
      }
      return;
    }
    case 'add-folder':
      if (!state.workspaces.some((workspace) => workspace.id === mutation.folder.workspaceId)) {
        invalid(new StateMutationValidationError('WORKSPACE_NOT_FOUND', 'Workspace not found.'));
      }
      if (state.folders.some((folder) => folder.id === mutation.folder.id)) {
        invalid(new StateMutationValidationError('FOLDER_ID_CONFLICT', 'Folder ID already exists.'));
      }
      return;
    case 'rename-folder':
    case 'delete-folder':
    case 'set-folder-collapsed':
      if (!state.folders.some((folder) => folder.id === mutation.id)) {
        invalid(new StateMutationValidationError('FOLDER_NOT_FOUND', 'Folder not found.'));
      }
      return;
    case 'update-folder': {
      const folder = state.folders.find((item) => item.id === mutation.id);
      if (!folder) {
        invalid(new StateMutationValidationError('FOLDER_NOT_FOUND', 'Folder not found.'));
      }
      if (!sameFolderValue(folder!, mutation.expected)) {
        invalid(new StateMutationValidationError(
          'CATEGORY_MUTATION_CONFLICT',
          'Category changed before the edit could be applied.',
        ));
      }
      return;
    }
    case 'set-category-order': {
      const currentOrder = getCanonicalCategoryOrder(state, mutation.workspaceId);
      if (!sameStringOrder(currentOrder, mutation.expectedCategoryOrder)) {
        invalid(new StateMutationValidationError(
          'CATEGORY_MUTATION_CONFLICT',
          'Category order changed before the reorder could be applied.',
        ));
      }
      return;
    }
    case 'add-tab': {
      if (!state.groups.some((group) => group.id === mutation.groupId)) {
        invalid(new StateMutationValidationError('GROUP_NOT_FOUND', 'Group not found.'));
      }
      if (hasTabEntityId(state, mutation.tab.id)
        && !isExactTabReplayInGroup(state, mutation.groupId, mutation.tab)) {
        invalid(new StateMutationValidationError('DUPLICATE_ENTITY_ID', 'Tab ID already exists with different content.'));
      }
      return;
    }
    case 'set-group-note': {
      const target = state.groups.find((group) => group.id === mutation.groupId);
      if (!target) {
        throw new StateMutationValidationError('GROUP_NOT_FOUND', 'Group not found.');
      }
      if (!isCanonicalGroupNoteTab(mutation.noteTab, mutation.text)) {
        throw new StateMutationValidationError('GROUP_NOTE_INVALID', 'Group note tab must be a canonical note matching the group note text.');
      }
      const hasTabId = hasTabEntityId(state, mutation.noteTab.id);
      if (hasTabId && (!isExactTabReplayInGroup(state, mutation.groupId, mutation.noteTab)
        || target.note !== mutation.text)) {
        invalid(new StateMutationValidationError('DUPLICATE_ENTITY_ID', 'Note tab ID already exists with different content.'));
      }
      return;
    }
    case 'add-group':
      if (hasGroupEntityId(state, mutation.group.id)) {
        invalid(new StateMutationValidationError('DUPLICATE_ENTITY_ID', 'Group ID already exists.'));
      }
      if (hasTabIdConflict(state, [mutation.group])) {
        invalid(new StateMutationValidationError('DUPLICATE_ENTITY_ID', 'Tab ID already exists.'));
      }
      assertGroupPlacement(state, mutation.group.workspaceId, mutation.group.folderId, mutation.group.starred, mutation.group.archived);
      return;
    case 'prepend-groups':
    case 'import-groups':
      if (hasDuplicateEntityIds(mutation.groups)) {
        invalid(new StateMutationValidationError('DUPLICATE_ENTITY_ID', 'Group ID is duplicated in the mutation batch.'));
      }
      if (mutation.groups.some((group) =>
        hasGroupEntityId(state, group.id) && !isExactGroupReplay(state, group)
      )) {
        invalid(new StateMutationValidationError('DUPLICATE_ENTITY_ID', 'Group ID already exists with different content.'));
      }
      if (hasTabIdConflict(state, mutation.groups)) {
        invalid(new StateMutationValidationError('DUPLICATE_ENTITY_ID', 'Tab ID already exists.'));
      }
      mutation.groups.forEach((group) => {
        if (!isExactGroupReplay(state, group)) {
          assertGroupPlacement(state, group.workspaceId, group.folderId, group.starred, group.archived);
        }
      });
      return;
    case 'restore-group': {
      const sourceEntries = state.bin.filter((entry) => entry.id === mutation.entryId);
      if (sourceEntries.length > 1) {
        throw new RestoreCollisionError('Restore source entry ID is ambiguous.');
      }
      const entry = sourceEntries[0];
      if (hasRestoreGroupIdCollision(state, mutation.group.id, entry)
        || hasDuplicateTabIds(mutation.group.tabs)
        || mutation.group.tabs.some((tab) => hasRestoreTabIdCollision(state, tab.id, entry))) {
        throw new RestoreCollisionError();
      }
      if (!entry) return invalid();
      if (entry.kind !== 'group' || entry.item.id !== mutation.group.id
        || !sameGroupContent(entry.item as Group, mutation.group)) invalid();
      const expectedPlacement = resolveRestoreGroupPlacement(
        state,
        entry,
        (entry.item as Group).workspaceId,
        (entry.item as Group).folderId,
        mutation.group.starred,
        mutation.group.archived,
      );
      const expectedWorkspaceId = expectedPlacement.workspaceId;
      const expectedFolderId = expectedPlacement.folderId;
      if (mutation.group.workspaceId !== expectedWorkspaceId
        || mutation.group.folderId !== expectedFolderId
        || !isValidGroupPlacement(state, mutation.group.workspaceId, mutation.group.folderId, mutation.group.starred, mutation.group.archived)) invalid();
      return;
    }
    case 'restore-tab': {
      const sourceEntries = state.bin.filter((entry) => entry.id === mutation.entryId);
      if (sourceEntries.length > 1) {
        throw new RestoreCollisionError('Restore source entry ID is ambiguous.');
      }
      const entry = sourceEntries[0];
      if (hasRestoreTabIdCollision(state, mutation.tab.id, entry)) {
        throw new RestoreCollisionError();
      }
      const targetGroup = state.groups.find((group) => group.id === mutation.groupId);
      if (!entry) return invalid();
      if (!targetGroup) return invalid();
      if (entry.kind !== 'tab' || entry.item.id !== mutation.tab.id
        || !sameTabContent(entry.item as TabItem, mutation.tab)) invalid();
      const originalTab = entry.item as TabItem;
      const expectedWorkspaceId = resolveRestoreWorkspaceId(state, entry, targetGroup.workspaceId);
      const expectedFolderId = restoreFolderId(state, entry, expectedWorkspaceId, false);
      const originalGroup = entry.originalGroupId
        ? state.groups.find((group) => group.id === entry.originalGroupId && group.workspaceId === expectedWorkspaceId)
        : undefined;
      if (targetGroup.workspaceId !== expectedWorkspaceId
        || (originalGroup
          ? targetGroup.id !== originalGroup.id
          : targetGroup.folderId !== expectedFolderId || targetGroup.starred)
        || originalTab.id !== mutation.tab.id) invalid();
      return;
    }
    case 'update-group': {
      const group = state.groups.find((item) => item.id === mutation.id);
      if (!group) {
        throw new StateMutationValidationError('GROUP_NOT_FOUND', 'Group not found.');
      }
      const updates = mutation.updates;
      const workspaceId = Object.prototype.hasOwnProperty.call(updates, 'workspaceId')
        ? updates.workspaceId as string
        : group.workspaceId;
      const folderId = Object.prototype.hasOwnProperty.call(updates, 'folderId')
        ? updates.folderId as string | null
        : group.folderId;
      const starred = Object.prototype.hasOwnProperty.call(updates, 'starred')
        ? updates.starred as boolean
        : group.starred;
      const archived = Object.prototype.hasOwnProperty.call(updates, 'archived')
        ? updates.archived as boolean
        : group.archived;
      if (Object.prototype.hasOwnProperty.call(updates, 'tabs')
        && hasReplacementTabIdConflict(state, group, updates.tabs || [])) {
        invalid(new StateMutationValidationError('DUPLICATE_ENTITY_ID', 'Tab ID already exists.'));
      }
      assertGroupPlacement(state, workspaceId, folderId, starred, archived);
      return;
    }
    case 'delete-group': {
      const group = state.groups.find((item) => item.id === mutation.id);
      if (!group) {
        return invalid(new StateMutationValidationError('GROUP_NOT_FOUND', 'Group not found.'));
      }
      if (state.groups.filter((item) => item.id === mutation.id).length !== 1
        || hasBinEntryId(state, mutation.binEntry.id)
        || !matchesDeleteGroupSnapshot(mutation.binEntry, group)) {
        invalid(new StateMutationValidationError('DUPLICATE_ENTITY_ID', 'Group snapshot does not match the live group.'));
      }
      return;
    }
    case 'move-group': {
      const group = state.groups.find((item) => item.id === mutation.groupId);
      if (!group) {
        throw new StateMutationValidationError('GROUP_NOT_FOUND', 'Group not found.');
      }
      assertGroupPlacement(state, group.workspaceId, mutation.targetFolderId, mutation.starred, mutation.archived);
      return;
    }
    case 'update-tab': {
      const group = state.groups.find((item) => item.id === mutation.groupId);
      if (!group) {
        throw new StateMutationValidationError('GROUP_NOT_FOUND', 'Group not found.');
      }
      if (!group.tabs.some((tab) => tab.id === mutation.tabId)) {
        invalid(new StateMutationValidationError('TAB_NOT_FOUND', 'Tab not found in group.'));
      }
      return;
    }
    case 'delete-tab': {
      const group = state.groups.find((item) => item.id === mutation.groupId);
      if (!group) {
        throw new StateMutationValidationError('GROUP_NOT_FOUND', 'Group not found.');
      }
      const targetTab = group.tabs.find((tab) => tab.id === mutation.tabId);
      if (!targetTab) {
        return invalid(new StateMutationValidationError('TAB_NOT_FOUND', 'Tab not found in group.'));
      }
      if (hasBinEntryId(state, mutation.binEntry.id)
        || !matchesDeleteTabSnapshot(mutation.binEntry, group, targetTab)) {
        invalid(new StateMutationValidationError('DUPLICATE_ENTITY_ID', 'Tab snapshot does not match the live tab.'));
      }
      return;
    }
    case 'delete-tabs': {
      const binEntryIds = new Set<string>();
      for (const deletion of mutation.deletions) {
        const group = state.groups.find((item) => item.id === deletion.groupId);
        if (!group) {
          throw new StateMutationValidationError(
            'GROUP_NOT_FOUND',
            'Group not found.',
          );
        }
        const targetTab = group.tabs.find((tab) => tab.id === deletion.tabId);
        if (!targetTab) {
          invalid(new StateMutationValidationError(
            'TAB_NOT_FOUND',
            'Tab not found in group.',
          ));
          return;
        }
        if (binEntryIds.has(deletion.binEntry.id)
          || hasBinEntryId(state, deletion.binEntry.id)
          || !matchesDeleteTabSnapshot(deletion.binEntry, group, targetTab)) {
          invalid(new StateMutationValidationError(
            'DUPLICATE_ENTITY_ID',
            'Tab snapshot does not match the live tab.',
          ));
        }
        binEntryIds.add(deletion.binEntry.id);
      }
      return;
    }
    case 'move-tab': {
      const source = state.groups.find((group) => group.id === mutation.groupId);
      const target = state.groups.find((group) => group.id === mutation.targetGroupId);
      if (!source) {
        throw new StateMutationValidationError('GROUP_NOT_FOUND', 'Group not found.');
      }
      if (!target) {
        throw new StateMutationValidationError('GROUP_NOT_FOUND', 'Group not found.');
      }
      if (source.workspaceId !== target.workspaceId) {
        invalid(new StateMutationValidationError('GROUP_PLACEMENT_INVALID', 'Tab groups must share a workspace.'));
      }
      if (!source.tabs.some((tab) => tab.id === mutation.tabId)) {
        invalid(new StateMutationValidationError('TAB_NOT_FOUND', 'Tab not found in source group.'));
      }
      if (source.id !== target.id && target.tabs.some((tab) => tab.id === mutation.tabId)) {
        invalid(new StateMutationValidationError('DUPLICATE_ENTITY_ID', 'Tab ID already exists in target group.'));
      }
      return;
    }
    case 'reorder-groups': {
      if (!state.workspaces.some((workspace) => workspace.id === mutation.workspaceId)) {
        invalid(new StateMutationValidationError('WORKSPACE_NOT_FOUND', 'Workspace not found.'));
      }
      assertGroupPlacement(state, mutation.workspaceId, mutation.folderId, mutation.starred, mutation.archived);
      const seen = new Set<string>();
      for (const groupId of mutation.orderedGroupIds) {
        if (seen.has(groupId)) {
          invalid(new StateMutationValidationError('REORDER_INVALID', 'Ordered group IDs must be unique.'));
        }
        seen.add(groupId);
        const group = state.groups.find((item) => item.id === groupId);
        if (!group || group.workspaceId !== mutation.workspaceId
          || group.folderId !== mutation.folderId || group.starred !== mutation.starred) {
          invalid(new StateMutationValidationError('REORDER_INVALID', 'Ordered groups must belong to the requested category.'));
        }
      }
      return;
    }
    case 'set-group-flags':
      if (!state.groups.some((group) => group.id === mutation.id)) {
        invalid(new StateMutationValidationError('GROUP_NOT_FOUND', 'Group not found.'));
      }
      return;
    case 'set-tab-note': {
      const group = state.groups.find((item) => item.id === mutation.groupId);
      if (!group) {
        throw new StateMutationValidationError('GROUP_NOT_FOUND', 'Group not found.');
      }
      if (!group.tabs.some((tab) => tab.id === mutation.tabId)) {
        invalid(new StateMutationValidationError('TAB_NOT_FOUND', 'Tab not found in group.'));
      }
      return;
    }
    case 'drop-intent':
      if (isDropIntentAlreadyApplied(state, mutation.intent, mutation.openTabs, mutation.operationId)) return;
      if (isLockedDropIntent(state, mutation.intent, mutation.openTabs, mutation.operationId)) {
        invalid(new InvalidDropMutationError('Cannot modify a locked group.'));
      }
      if (executeDropIntent(state, mutation.intent, mutation.openTabs, mutation.operationId) === state) invalid(new InvalidDropMutationError());
      return;
    default:
      return;
  }
}

function categoryOrder(
  state: TabBoardState,
  workspaceId: string,
  requested: string[],
): string[] {
  const available = [
    ...BUILT_IN_CATEGORIES,
    ...state.folders.filter((folder) => folder.workspaceId === workspaceId).map(({ id }) => id),
  ];
  const availableSet = new Set(available);
  const canonicalize = (ids: string[]) => [
    ...new Set(ids.map((id) => id.startsWith('folder:') ? id.slice('folder:'.length) : id)
      .filter((id) => availableSet.has(id))),
  ];
  const existing = canonicalize(state.categoryOrderByWorkspace[workspaceId] || []);
  const current = [...existing, ...available.filter((id) => !existing.includes(id))];
  const desired = [...canonicalize(requested), ...current.filter((id) => !canonicalize(requested).includes(id))];
  return desired;
}

function updateGroup(
  state: TabBoardState,
  id: string,
  updater: (group: Group) => Group,
): TabBoardState {
  return {
    ...state,
    groups: state.groups.map((group) => {
      if (group.id !== id) return group;
      const updated = updater(group);
      const deduped = dedupeTabItems(updated.tabs);
      if (deduped.length === updated.tabs.length) return updated;
      return { ...updated, tabs: deduped };
    }),
  };
}

function updateTab(
  state: TabBoardState,
  groupId: string,
  tabId: string,
  updater: (tab: TabItem) => TabItem,
): TabBoardState {
  return updateGroup(state, groupId, (group) => ({
    ...group,
    tabs: group.tabs.map((tab) => tab.id === tabId ? updater(tab) : tab),
  }));
}

function hasTabId(state: TabBoardState, tabId: string): boolean {
  return state.groups.some((group) => group.tabs.some((tab) => tab.id === tabId));
}

function hasBinEntity(state: TabBoardState, kind: BinEntry['kind'], entityId: string): boolean {
  return state.bin.some((entry) => {
    if (entry.kind === kind && entry.item.id === entityId) return true;
    return kind === 'tab' && entry.kind === 'group'
      && (entry.item as Group).tabs.some((tab) => tab.id === entityId);
  });
}

function hasBinEntryId(state: TabBoardState, entryId: string): boolean {
  return state.bin.some((entry) => entry.id === entryId);
}

function matchesDeleteBinEntrySnapshot(actual: BinEntry, expected: BinEntry): boolean {
  if (actual.id !== expected.id
    || actual.kind !== expected.kind
    || actual.label !== expected.label
    || actual.groupId !== expected.groupId
    || actual.groupTitle !== expected.groupTitle
    || actual.source !== expected.source
    || actual.deletedAt !== expected.deletedAt
    || actual.item.id !== expected.item.id) return false;
  const sameMetadata = (actualValue: unknown, expectedValue: unknown): boolean =>
    expectedValue === undefined || actualValue === expectedValue;
  if (!sameMetadata(actual.originalWorkspaceId, expected.originalWorkspaceId)
    || !sameMetadata(actual.originalFolderId, expected.originalFolderId)
    || !sameMetadata(actual.originalGroupId, expected.originalGroupId)) return false;
  return actual.kind === 'group'
    ? sameGroupEntity(actual.item as Group, expected.item as Group)
    : sameTabEntity(actual.item as TabItem, expected.item as TabItem);
}

function hasUniqueDeleteBinEvidence(state: TabBoardState, binEntry: BinEntry): boolean {
  const entriesWithId = state.bin.filter((entry) => entry.id === binEntry.id);
  if (entriesWithId.length !== 1) return false;
  const evidence = entriesWithId[0];

  if (binEntry.kind !== 'tab') {
    const candidates = state.bin.filter((entry) => entry.kind === 'group' && entry.item.id === binEntry.item.id);
    if (candidates.length !== 1 || candidates[0] !== evidence
      || !matchesDeleteBinEntrySnapshot(evidence, binEntry)) return false;
    return (evidence.item as Group).tabs.every((tab) => tabEntitiesWithId(state, tab.id).length === 1);
  }

  const occurrences = state.bin.flatMap((entry) => {
    if (entry.kind === 'tab') {
      return entry.item.id === binEntry.item.id ? [{ entry, isDirect: true }] : [];
    }
    return (entry.item as Group).tabs
      .filter((tab) => tab.id === binEntry.item.id)
      .map(() => ({ entry, isDirect: false }));
  });
  if (occurrences.length !== 1 || !occurrences[0].isDirect || occurrences[0].entry !== evidence) return false;
  return matchesDeleteBinEntrySnapshot(evidence, binEntry);
}

function isDeleteTabsAlreadyApplied(
  state: TabBoardState,
  mutation: Extract<StateMutation, { type: 'delete-tabs' }>,
): boolean {
  return mutation.deletions.every(({ tabId, binEntry }) =>
    !state.groups.some((group) =>
      group.tabs.some((tab) => tab.id === tabId))
    && hasUniqueDeleteBinEvidence(state, binEntry));
}

function matchesDeleteGroupSnapshot(binEntry: BinEntry, group: Group): boolean {
  return binEntry.kind === 'group'
    && binEntry.source === 'group'
    && binEntry.label === group.title
    && binEntry.groupId === group.id
    && binEntry.groupTitle === group.title
    && sameGroupEntity(binEntry.item as Group, group)
    && binEntry.originalWorkspaceId === group.workspaceId
    && binEntry.originalFolderId === group.folderId;
}

function matchesDeleteTabSnapshot(binEntry: BinEntry, group: Group, tab: TabItem): boolean {
  return binEntry.kind === 'tab'
    && binEntry.source === 'group'
    && binEntry.label === tab.title
    && binEntry.groupId === group.id
    && binEntry.groupTitle === group.title
    && sameTabEntity(binEntry.item as TabItem, tab)
    && binEntry.originalGroupId === group.id
    && binEntry.originalWorkspaceId === group.workspaceId
    && binEntry.originalFolderId === group.folderId;
}

export type StateMutationValidationCode =
  | 'WORKSPACE_NOT_FOUND'
  | 'WORKSPACE_ID_CONFLICT'
  | 'WORKSPACE_NAME_INVALID'
  | 'WORKSPACE_NAME_DUPLICATE'
  | 'WORKSPACE_EMOJI_INVALID'
  | 'WORKSPACE_ORDER_INVALID'
  | 'WORKSPACE_DELETE_INVALID'
  | 'FOLDER_ID_CONFLICT'
  | 'FOLDER_NOT_FOUND'
  | 'CATEGORY_MUTATION_CONFLICT'
  | 'GROUP_NOT_FOUND'
  | 'TAB_NOT_FOUND'
  | 'GROUP_PLACEMENT_INVALID'
  | 'REORDER_INVALID'
  | 'DUPLICATE_ENTITY_ID'
  | 'GROUP_NOTE_INVALID'
  | 'GROUP_LOCKED'
  | 'TAB_URL_INVALID';

export class StateMutationValidationError extends Error {
  readonly code: StateMutationValidationCode;

  constructor(code: StateMutationValidationCode, message: string) {
    super(message);
    this.name = 'StateMutationValidationError';
    this.code = code;
  }
}

export class CategoryValidationError extends Error {
  readonly code = 'CATEGORY_VALIDATION' as const;

  constructor(message: string) {
    super(message);
    this.name = 'CategoryValidationError';
  }
}

export class RestoreCollisionError extends Error {
  readonly code = 'RESTORE_ID_COLLISION' as const;

  constructor(message = 'Restored entity ID collides with an unrelated live entity.') {
    super(message);
    this.name = 'RestoreCollisionError';
  }
}

export class InvalidDropMutationError extends Error {
  readonly code = 'INVALID_DROP_INTENT' as const;
  readonly invalidMutationIndexes: number[];
  readonly committedMutationIndexes: number[];
  readonly committedState?: TabBoardState;

  constructor(
    message = 'Invalid state mutation.',
    invalidMutationIndexes: readonly number[] = [],
    committedMutationIndexes: readonly number[] = [],
    committedState?: TabBoardState,
  ) {
    super(message);
    this.name = 'InvalidDropMutationError';
    this.invalidMutationIndexes = [...invalidMutationIndexes];
    this.committedMutationIndexes = [...committedMutationIndexes];
    this.committedState = committedState;
  }
}

export interface DropMutationBatchContext {
  batchRevision: number | null;
  invalidDropCount: number;
  externalRevisionStale: boolean;
  rawInvalidDropIndexes: readonly number[];
}

export function createDropMutationBatchContext(
  rawInvalidDropIndexes: readonly number[] = [],
): DropMutationBatchContext {
  return {
    batchRevision: null,
    invalidDropCount: 0,
    externalRevisionStale: false,
    rawInvalidDropIndexes: [...rawInvalidDropIndexes],
  };
}

export function prepareDropMutationForBatch(
  state: TabBoardState,
  mutation: StateMutation,
  context: DropMutationBatchContext,
  originalIndex = Number.MAX_SAFE_INTEGER,
): { mutation: StateMutation; context: DropMutationBatchContext; stale: boolean } {
  if (mutation.type !== 'drop-intent') return { mutation, context, stale: false };

  const startsBatch = context.batchRevision === null;
  const rawGapCount = context.rawInvalidDropIndexes.filter((index) => index < originalIndex).length;
  const revisionGapCount = rawGapCount + context.invalidDropCount;
  const expectedRevision = mutation.expectedRevision > state.mutationRevision
    ? mutation.expectedRevision - revisionGapCount
    : mutation.expectedRevision;
  const batchRevision = startsBatch ? expectedRevision : context.batchRevision;
  const externalRevisionStale = context.externalRevisionStale
    || (startsBatch && expectedRevision !== state.mutationRevision);
  const alreadyAligned = expectedRevision === state.mutationRevision
    && mutation.expectedRevision === expectedRevision;
  const canRebase = expectedRevision === state.mutationRevision;
  const stale = externalRevisionStale || (!alreadyAligned && !canRebase);
  return {
    mutation: !stale && !alreadyAligned
      ? { ...mutation, expectedRevision }
      : mutation,
    context: { ...context, batchRevision, externalRevisionStale },
    stale,
  };
}

export function markInvalidDropMutationForBatch(
  context: DropMutationBatchContext,
): DropMutationBatchContext {
  return { ...context, invalidDropCount: context.invalidDropCount + 1 };
}

function appendDropOperation(
  state: TabBoardState,
  operationId: string,
  digest: string,
  appliedAt: string,
): TabBoardState {
  const ledger = state.dropOperationLedger || [];
  return {
    ...state,
    dropOperationLedger: [
      ...ledger,
      { operationId, digest, appliedAt },
    ].slice(-DROP_OPERATION_LEDGER_LIMIT),
  };
}

function applyDropIntentMutation(
  state: TabBoardState,
  mutation: Extract<StateMutation, { type: 'drop-intent' }>,
  appliedAt: string,
): TabBoardState {
  const digest = getDropOperationDigest(mutation.intent, mutation.openTabs);
  const existing = (state.dropOperationLedger || []).find((entry) => entry.operationId === mutation.operationId);
  if (existing) {
    if (existing.digest !== digest) {
      throw new InvalidDropMutationError('Drop operation ID was reused with a different intent.');
    }
    return clone(state);
  }

  const hasStableGeneratedIdentity = mutation.intent.kind === 'copy-open-tabs'
    || mutation.intent.kind === 'create-session';
  if (hasStableGeneratedIdentity) {
    const replayStatus = getDropIntentReplayStatus(
      state,
      mutation.intent,
      mutation.openTabs,
      mutation.operationId,
    );
    if (replayStatus === 'complete') return clone(state);
    if (replayStatus === 'conflict') {
      throw new InvalidDropMutationError('Stable generated drop entity IDs are partially occupied.');
    }
  }
  if (mutation.expectedRevision !== undefined
    && mutation.expectedRevision !== state.mutationRevision) {
    throw new InvalidDropMutationError('Drop mutation revision is stale.');
  }
  if (isDropIntentAlreadyApplied(state, mutation.intent, mutation.openTabs, mutation.operationId)) {
    return clone(state);
  }
  if (isLockedDropIntent(state, mutation.intent, mutation.openTabs, mutation.operationId)) {
    throw new InvalidDropMutationError('Cannot modify a locked group.');
  }

  try {
    assertStateMutationSemantics(state, mutation);
  } catch (error: unknown) {
    if (error instanceof InvalidDropMutationError) throw error;
    throw new InvalidDropMutationError(error instanceof Error ? error.message : undefined);
  }

  const dropped = executeDropIntent(
    state,
    mutation.intent,
    mutation.openTabs,
    mutation.operationId,
    mutation.updatedAt,
  );
  if (dropped === state) {
    if (isDropIntentAlreadyApplied(state, mutation.intent, mutation.openTabs, mutation.operationId)) {
      return clone(state);
    }
    throw new InvalidDropMutationError();
  }
  return advanceRevision(state, {
    ...appendDropOperation(dropped, mutation.operationId, digest, appliedAt),
    updatedAt: mutation.updatedAt,
  });
}

function hasLaterBinRestoreEvidence(
  state: TabBoardState,
  entryId: string,
  kind: BinEntry['kind'],
  item: Group | TabItem,
): boolean {
  return state.bin.some((entry) => entry.id !== entryId
    && entry.kind === kind
    && entry.item.id === item.id
    && (kind === 'group'
      ? sameGroupContent(entry.item as Group, item as Group)
      : sameTabContent(entry.item as TabItem, item as TabItem))
    && typeof entry.deletedAt === 'string'
    && typeof entry.originalWorkspaceId === 'string'
    && Number.isSafeInteger(entry.originalIndex));
}

function hasRestoreGroupIdCollision(
  state: TabBoardState,
  groupId: string,
  sourceEntry?: BinEntry,
): boolean {
  return state.groups.some((group) => group.id === groupId)
    || state.bin.some((entry) => entry !== sourceEntry
      && entry.kind === 'group'
      && entry.item.id === groupId);
}

function hasRestoreTabIdCollision(
  state: TabBoardState,
  tabId: string,
  sourceEntry?: BinEntry,
): boolean {
  if (state.groups.some((group) => group.tabs.some((tab) => tab.id === tabId))) return true;
  return state.bin.some((entry) => {
    if (entry === sourceEntry) return false;
    if (entry.kind === 'tab') return entry.item.id === tabId;
    return (entry.item as Group).tabs.some((tab) => tab.id === tabId);
  });
}

function hasDuplicateTabIds(tabs: readonly TabItem[]): boolean {
  const ids = new Set<string>();
  return tabs.some((tab) => {
    if (ids.has(tab.id)) return true;
    ids.add(tab.id);
    return false;
  });
}

function isRestoreGroupAlreadyApplied(
  state: TabBoardState,
  mutation: Extract<StateMutation, { type: 'restore-group' }>,
): boolean {
  const live = state.groups.find((group) => group.id === mutation.group.id);
  const sourceEntries = state.bin.filter((entry) => entry.id === mutation.entryId);
  if (sourceEntries.length > 1) return false;
  const sourceEntry = sourceEntries[0];
  if (sourceEntry && hasRestoreGroupIdCollision(state, mutation.group.id, sourceEntry)) return false;
  if (live && sourceEntry) return false;
  if (live && sameGroupContent(live, mutation.group)) {
    return state.mutationRevision > 0
      && live.workspaceId === mutation.group.workspaceId
      && live.folderId === mutation.group.folderId
      && live.updatedAt === mutation.group.updatedAt;
  }
  return !live && hasLaterBinRestoreEvidence(state, mutation.entryId, 'group', mutation.group);
}

function isRestoreTabAlreadyApplied(
  state: TabBoardState,
  mutation: Extract<StateMutation, { type: 'restore-tab' }>,
): boolean {
  const target = state.groups.find((group) => group.id === mutation.groupId);
  const live = target?.tabs.find((tab) => tab.id === mutation.tab.id);
  const sourceEntries = state.bin.filter((entry) => entry.id === mutation.entryId);
  if (sourceEntries.length > 1) return false;
  const sourceEntry = sourceEntries[0];
  if (sourceEntry && hasRestoreTabIdCollision(state, mutation.tab.id, sourceEntry)) return false;
  if (live && sourceEntry) return false;
  if (live && sameTabContent(live, mutation.tab)) {
    return state.mutationRevision > 0 && live.updatedAt === mutation.tab.updatedAt;
  }
  return !state.groups.some((group) => group.tabs.some((tab) => tab.id === mutation.tab.id))
    && hasLaterBinRestoreEvidence(state, mutation.entryId, 'tab', mutation.tab);
}

function sameWorkspaceContent(source: Workspace, candidate: Workspace): boolean {
  return source.id === candidate.id && source.name === candidate.name
    && source.emoji === candidate.emoji
    && source.createdAt === candidate.createdAt && source.updatedAt === candidate.updatedAt;
}

function sameFolderContent(source: Folder, candidate: Folder): boolean {
  return source.id === candidate.id
    && source.name.normalize('NFC').trim() === candidate.name.normalize('NFC').trim()
    && source.color === candidate.color && source.workspaceId === candidate.workspaceId
    && source.collapsed === candidate.collapsed
    && source.createdAt === candidate.createdAt && source.updatedAt === candidate.updatedAt;
}

function sameTabEntity(source: TabItem, candidate: TabItem): boolean {
  return source.id === candidate.id && source.itemType === candidate.itemType
    && source.title === candidate.title && source.url === candidate.url
    && source.favIconUrl === candidate.favIconUrl && source.note === candidate.note
    && source.pinned === candidate.pinned && source.incognito === candidate.incognito
    && source.starred === candidate.starred && source.taskStatus === candidate.taskStatus
    && JSON.stringify(source.browserGroup) === JSON.stringify(candidate.browserGroup)
    && source.sourceWindowId === candidate.sourceWindowId
    && source.sourceTabId === candidate.sourceTabId
    && source.createdAt === candidate.createdAt && source.updatedAt === candidate.updatedAt;
}

function sameGroupEntity(source: Group, candidate: Group): boolean {
  return source.id === candidate.id && source.title === candidate.title
    && source.note === candidate.note && source.workspaceId === candidate.workspaceId
    && source.folderId === candidate.folderId && source.locked === candidate.locked
    && source.starred === candidate.starred && source.collapsed === candidate.collapsed
    && source.createdAt === candidate.createdAt && source.updatedAt === candidate.updatedAt
    && source.tabs.length === candidate.tabs.length
    && source.tabs.every((tab, index) => sameTabEntity(tab, candidate.tabs[index]));
}

function hasGroupEntityId(state: TabBoardState, groupId: string): boolean {
  return state.groups.some((group) => group.id === groupId)
    || state.bin.some((entry) => entry.kind === 'group' && entry.item.id === groupId);
}

function isExactGroupReplay(state: TabBoardState, candidate: Group): boolean {
  const live = state.groups.filter((group) => group.id === candidate.id);
  const binned = state.bin
    .filter((entry) => entry.kind === 'group' && entry.item.id === candidate.id)
    .map((entry) => entry.item as Group);
  const existing = [...live, ...binned];
  return existing.length > 0 && existing.every((group) => sameGroupEntity(group, candidate));
}

function tabEntitiesWithId(state: TabBoardState, tabId: string): TabItem[] {
  const live = state.groups.flatMap((group) => group.tabs.filter((tab) => tab.id === tabId));
  const binned = state.bin.flatMap((entry) => {
    if (entry.kind === 'tab') return entry.item.id === tabId ? [entry.item as TabItem] : [];
    return (entry.item as Group).tabs.filter((tab) => tab.id === tabId);
  });
  return [...live, ...binned];
}

function hasTabEntityId(state: TabBoardState, tabId: string): boolean {
  return tabEntitiesWithId(state, tabId).length > 0;
}

function isExactTabReplayInGroup(
  state: TabBoardState,
  groupId: string,
  candidate: TabItem,
): boolean {
  let found = false;
  for (const group of state.groups) {
    for (const tab of group.tabs) {
      if (tab.id !== candidate.id) continue;
      found = true;
      if (group.id !== groupId || !sameTabEntity(tab, candidate)) return false;
    }
  }
  for (const entry of state.bin) {
    if (entry.kind === 'tab') {
      if (entry.item.id !== candidate.id) continue;
      found = true;
      if (entry.groupId !== groupId
        || entry.originalGroupId !== groupId
        || !sameTabEntity(entry.item as TabItem, candidate)) return false;
      continue;
    }
    const nested = (entry.item as Group).tabs.filter((tab) => tab.id === candidate.id);
    if (!nested.length) continue;
    found = true;
    if (entry.item.id !== groupId || nested.some((tab) => !sameTabEntity(tab, candidate))) return false;
  }
  return found;
}

function hasReplacementTabIdConflict(
  state: TabBoardState,
  targetGroup: Group,
  tabs: readonly TabItem[],
): boolean {
  const occupied = new Set(
    state.groups
      .filter((group) => group.id !== targetGroup.id)
      .flatMap((group) => group.tabs.map((tab) => tab.id)),
  );
  state.bin.forEach((entry) => {
    if (entry.kind === 'tab') {
      occupied.add(entry.item.id);
      return;
    }
    (entry.item as Group).tabs.forEach((tab) => occupied.add(tab.id));
  });
  const seen = new Set<string>();
  return tabs.some((tab) => {
    if (seen.has(tab.id) || occupied.has(tab.id)) return true;
    seen.add(tab.id);
    return false;
  });
}

function hasDuplicateEntityIds(groups: readonly Group[]): boolean {
  const ids = new Set<string>();
  return groups.some((group) => ids.has(group.id) || (ids.add(group.id), false));
}

function hasTabIdConflict(state: TabBoardState, groups: readonly Group[]): boolean {
  const pendingTabIds = new Set<string>();
  return groups
    .filter((group) => !isExactGroupReplay(state, group))
    .some((group) => group.tabs.some((tab) => {
      if (pendingTabIds.has(tab.id) || hasTabEntityId(state, tab.id)) return true;
      pendingTabIds.add(tab.id);
      return false;
    }));
}

function isExactUpdateGroupReplay(
  state: TabBoardState,
  mutation: Extract<StateMutation, { type: 'update-group' }>,
): boolean {
  const group = state.groups.find((item) => item.id === mutation.id);
  if (!group) return false;
  const expected = { ...group, ...clone(mutation.updates), updatedAt: group.updatedAt } as Group;
  return sameGroupEntity(group, expected);
}

function isExactUpdateTabReplay(
  state: TabBoardState,
  mutation: Extract<StateMutation, { type: 'update-tab' }>,
): boolean {
  const group = state.groups.find((item) => item.id === mutation.groupId);
  const tab = group?.tabs.find((item) => item.id === mutation.tabId);
  if (!tab) return false;
  const expected = { ...tab, ...clone(mutation.updates), updatedAt: mutation.updatedAt } as TabItem;
  return sameTabEntity(tab, expected);
}

function isExactMoveGroupReplay(
  state: TabBoardState,
  mutation: Extract<StateMutation, { type: 'move-group' }>,
): boolean {
  const group = state.groups.find((item) => item.id === mutation.groupId);
  if (!group || !isValidGroupPlacement(state, group.workspaceId, mutation.targetFolderId, mutation.starred, mutation.archived)
    || group.folderId !== mutation.targetFolderId || group.starred !== mutation.starred || group.archived !== mutation.archived) return false;
  const categoryGroupsWithoutMoved = state.groups.filter((item) => item.id !== group.id
    && item.workspaceId === group.workspaceId
    && item.folderId === mutation.targetFolderId
    && item.starred === mutation.starred
    && item.archived === mutation.archived);
  const currentIndex = state.groups
    .filter((item) => item.workspaceId === group.workspaceId
      && item.folderId === mutation.targetFolderId
      && item.starred === mutation.starred
      && item.archived === mutation.archived)
    .findIndex((item) => item.id === group.id);
  const expectedIndex = Math.max(0, Math.min(Math.trunc(mutation.index), categoryGroupsWithoutMoved.length));
  return currentIndex === expectedIndex;
}

function hasExactReorderTimestampEvidence(
  ordered: readonly Group[],
  unlisted: readonly Group[],
  updatedAt: string,
): boolean {
  // ponytail: unlisted witnesses must be independently updated; preserve the approved singleton replay witness.
  return ordered.some((group) => group.updatedAt === updatedAt)
    || unlisted.some((group) => group.updatedAt === updatedAt
      && (group.createdAt !== group.updatedAt || ordered.length === 1));
}

function isExactReorderReplay(
  state: TabBoardState,
  mutation: Extract<StateMutation, { type: 'reorder-groups' }>,
): boolean {
  if (!isValidGroupPlacement(state, mutation.workspaceId, mutation.folderId, mutation.starred, mutation.archived)) return false;
  const matching = state.groups.filter((group) => group.workspaceId === mutation.workspaceId
    && group.folderId === mutation.folderId
    && group.starred === mutation.starred
    && group.archived === mutation.archived);
  if (new Set(mutation.orderedGroupIds).size !== mutation.orderedGroupIds.length
    || mutation.orderedGroupIds.some((id) => !matching.some((group) => group.id === id))) return false;
  const orderedSet = new Set(mutation.orderedGroupIds);
  const ordered = mutation.orderedGroupIds
    .map((id) => matching.find((group) => group.id === id))
    .filter(Boolean) as Group[];
  const unlisted = matching.filter((group) => !orderedSet.has(group.id));
  const replacements = [...ordered, ...unlisted];
  if (replacements.some((group, index) => group.id !== matching[index]?.id)) return false;
  // ponytail: exact timestamp witness distinguishes replay from forged same-order retimestamping.
  if (!hasExactReorderTimestampEvidence(ordered, unlisted, mutation.updatedAt)) return false;
  if (ordered.some((group) => !group.locked
    && group.updatedAt !== mutation.updatedAt
    && group.updatedAt < mutation.updatedAt)) return false;
  const listedLocked = ordered.filter((group) => group.locked);
  if (listedLocked.some((group) => group.updatedAt < mutation.updatedAt)) return false;
  // ponytail: same-millisecond lock retries need revision evidence; the original reorder and lock each advance it.
  if (listedLocked.some((group) => group.updatedAt === mutation.updatedAt)
    && state.mutationRevision < 2) return false;
  const sharedUnlistedTimestamps = unlisted.filter((group) => group.updatedAt === mutation.updatedAt);
  if (ordered.length > 0 && listedLocked.length === ordered.length && listedLocked.length === 1
    && sharedUnlistedTimestamps.length > 0
    && sharedUnlistedTimestamps.length < unlisted.length) return false;
  return true;
}

function isExactTabNoteReplay(
  state: TabBoardState,
  mutation: Extract<StateMutation, { type: 'set-tab-note' }>,
): boolean {
  const group = state.groups.find((item) => item.id === mutation.groupId);
  const tab = group?.tabs.find((item) => item.id === mutation.tabId);
  return Boolean(tab && tab.note === mutation.text && tab.updatedAt === mutation.updatedAt);
}

function isExactWorkspaceUpdateReplay(
  state: TabBoardState,
  mutation: Extract<StateMutation, { type: 'update-workspace' }>,
): boolean {
  const workspace = state.workspaces.find((item) => item.id === mutation.id);
  const normalizedName = normalizeWorkspaceName(mutation.name);
  return Boolean(
    workspace
    && normalizedName
    && workspace.name === normalizedName
    && workspace.emoji === mutation.emoji
    && workspace.updatedAt === mutation.updatedAt,
  );
}

function isExactWorkspaceOrderReplay(
  state: TabBoardState,
  mutation: Extract<StateMutation, { type: 'set-workspace-order' }>,
): boolean {
  return mutation.orderedWorkspaceIds.length === state.workspaces.length
    && new Set(mutation.orderedWorkspaceIds).size === state.workspaces.length
    && mutation.orderedWorkspaceIds.every((id, index) =>
      id === state.workspaces[index]?.id);
}

function normalizedFolderName(value: string): string {
  return value.normalize('NFC').trim();
}

function sameFolderValue(
  folder: Pick<Folder, 'name' | 'color'>,
  value: { name: string; color: string },
): boolean {
  return normalizedFolderName(folder.name) === normalizedFolderName(value.name)
    && normalizeCategoryColor(folder.color) === normalizeCategoryColor(value.color);
}

function sameStringOrder(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function isExactFolderUpdateReplay(
  state: TabBoardState,
  mutation: Extract<StateMutation, { type: 'update-folder' }>,
): boolean {
  const folder = state.folders.find((item) => item.id === mutation.id);
  return Boolean(
    folder
    && folder.updatedAt === mutation.updatedAt
    && sameFolderValue(folder, mutation),
  );
}

function isExactCategoryOrderReplay(
  state: TabBoardState,
  mutation: Extract<StateMutation, { type: 'set-category-order' }>,
): boolean {
  return state.updatedAt === mutation.updatedAt
    && sameStringOrder(
      getCanonicalCategoryOrder(state, mutation.workspaceId),
      mutation.categoryOrder,
    );
}

function assertCategoryCasPreconditions(
  state: TabBoardState,
  mutation: StateMutation,
): void {
  if (mutation.type === 'update-folder') {
    const folder = state.folders.find((item) => item.id === mutation.id);
    if (!folder) {
      throw new StateMutationValidationError(
        'FOLDER_NOT_FOUND',
        'Folder not found.',
      );
    }
    if (!state.workspaces.some(({ id }) => id === folder.workspaceId)) {
      throw new StateMutationValidationError(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
      );
    }
    const validation = validateFolderName(
      state.folders,
      folder.workspaceId,
      mutation.name,
      mutation.id,
    );
    if (!validation.ok) {
      throw new CategoryValidationError(
        validation.reason === 'empty'
          ? 'Category name is required.'
          : 'A category with this name already exists in this workspace.',
      );
    }
    if (normalizeCategoryColor(mutation.color) === null) {
      throw new CategoryValidationError('Category color is invalid.');
    }
    return;
  }
  if (mutation.type !== 'set-category-order') return;
  if (!state.workspaces.some(({ id }) => id === mutation.workspaceId)) {
    throw new StateMutationValidationError(
      'WORKSPACE_NOT_FOUND',
      'Workspace not found.',
    );
  }
  const currentOrder = getCanonicalCategoryOrder(state, mutation.workspaceId);
  const currentSet = new Set(currentOrder);
  const isComplete = (order: readonly string[]) =>
    order.length === currentOrder.length
    && new Set(order).size === order.length
    && order.every((id) => currentSet.has(id));
  if (
    !isComplete(mutation.expectedCategoryOrder)
    || !isComplete(mutation.categoryOrder)
  ) {
    throw new StateMutationValidationError(
      'REORDER_INVALID',
      'Category order must contain every current category exactly once.',
    );
  }
}

function isAlreadyApplied(state: TabBoardState, mutation: StateMutation): boolean {
  switch (mutation.type) {
    case 'add-workspace':
      return state.workspaces.some((workspace) => sameWorkspaceContent(workspace, mutation.workspace));
    case 'update-workspace':
      return isExactWorkspaceUpdateReplay(state, mutation);
    case 'set-workspace-order':
      return isExactWorkspaceOrderReplay(state, mutation);
    case 'update-folder':
      return isExactFolderUpdateReplay(state, mutation);
    case 'set-category-order':
      return isExactCategoryOrderReplay(state, mutation);
    case 'add-folder':
      return state.folders.some((folder) => sameFolderContent(folder, mutation.folder));
    case 'add-group':
      return isExactGroupReplay(state, mutation.group);
    case 'prepend-groups':
    case 'import-groups':
      return !hasDuplicateEntityIds(mutation.groups)
        && mutation.groups.every((group) => isExactGroupReplay(state, group));
    case 'add-tab':
      return state.groups.some((group) => group.id === mutation.groupId)
        && isExactTabReplayInGroup(state, mutation.groupId, mutation.tab);
    case 'update-group':
      return isExactUpdateGroupReplay(state, mutation);
    case 'update-tab':
      return isExactUpdateTabReplay(state, mutation);
    case 'move-group':
      return isExactMoveGroupReplay(state, mutation);
    case 'reorder-groups':
      return isExactReorderReplay(state, mutation);
    case 'set-tab-note':
      return isExactTabNoteReplay(state, mutation);
    case 'move-tab': {
      const source = state.groups.find((group) => group.id === mutation.groupId);
      const target = state.groups.find((group) => group.id === mutation.targetGroupId);
      if (!source || !target || source.workspaceId !== target.workspaceId) return false;
      if (source.id === target.id) {
        const moved = source.tabs.find((tab) => tab.id === mutation.tabId);
        if (!moved) return false;
        const remaining = source.tabs.filter((tab) => tab.id !== mutation.tabId);
        const index = Math.max(0, Math.min(Math.trunc(mutation.targetIndex), remaining.length));
        const expectedTabs = [
          ...remaining.slice(0, index),
          { ...moved, updatedAt: mutation.updatedAt },
          ...remaining.slice(index),
        ];
        return source.tabs.length === expectedTabs.length
          && source.tabs.every((tab, tabIndex) => tab.id === expectedTabs[tabIndex]?.id)
          && moved.updatedAt === mutation.updatedAt;
      }
      const sourceHasTab = source.tabs.some((tab) => tab.id === mutation.tabId);
      const targetHasTab = target.tabs.some((tab) => tab.id === mutation.tabId);
      return (!sourceHasTab && targetHasTab)
        || (!sourceHasTab && !targetHasTab && state.bin.some((entry) =>
          entry.kind === 'tab' && entry.item.id === mutation.tabId
          && entry.groupId === target.id && entry.originalGroupId === target.id,
        ));
    }
    case 'set-group-note': {
      const target = state.groups.find((group) => group.id === mutation.groupId);
      return Boolean(
        target
        && isCanonicalGroupNoteTab(mutation.noteTab, mutation.text)
        && target.note === mutation.text
        && isExactTabReplayInGroup(state, mutation.groupId, mutation.noteTab),
      );
    }
    case 'delete-group':
      return !state.groups.some((group) => group.id === mutation.id)
        && hasUniqueDeleteBinEvidence(state, mutation.binEntry);
    case 'delete-tab':
      return !state.groups.some((group) => group.tabs.some((tab) => tab.id === mutation.tabId))
        && hasUniqueDeleteBinEvidence(state, mutation.binEntry);
    case 'delete-tabs':
      return isDeleteTabsAlreadyApplied(state, mutation);
    case 'restore-group':
      return isRestoreGroupAlreadyApplied(state, mutation);
    case 'restore-tab':
      return isRestoreTabAlreadyApplied(state, mutation);
    case 'drop-intent':
      if (mutation.intent.kind === 'copy-open-tabs' || mutation.intent.kind === 'create-session') {
        return getDropIntentReplayStatus(
          state,
          mutation.intent,
          mutation.openTabs,
          mutation.operationId,
        ) === 'complete';
      }
      return isDropIntentAlreadyApplied(
        state,
        mutation.intent,
        mutation.openTabs,
        mutation.operationId,
      );
    default:
      return false;
  }
}

function newGroups(state: TabBoardState, groups: readonly Group[]): Group[] {
  const knownIds = new Set([
    ...state.groups.map((group) => group.id),
    ...state.bin.filter((entry) => entry.kind === 'group').map((entry) => entry.item.id),
  ]);
  return groups.filter((group) => {
    if (knownIds.has(group.id)) return false;
    knownIds.add(group.id);
    return true;
  }).map(clone);
}

function applyStateMutationCore(state: TabBoardState, mutation: StateMutation): TabBoardState {
  assertMutation(mutation);
  if (mutation.type === 'drop-intent') {
    return applyDropIntentMutation(state, mutation, nowIso());
  }
  assertStateMutationSemantics(state, mutation);
  const next = clone(state);
  switch (mutation.type) {
    case 'set-active-workspace':
      return { ...next, activeWorkspaceId: mutation.workspaceId, updatedAt: mutation.updatedAt };
    case 'add-workspace':
      return { ...next, workspaces: [...next.workspaces, clone(mutation.workspace)], updatedAt: mutation.workspace.updatedAt };
    case 'rename-workspace':
      return { ...next, workspaces: next.workspaces.map((item) => item.id === mutation.id ? { ...item, name: mutation.name, updatedAt: mutation.updatedAt } : item), updatedAt: mutation.updatedAt };
    case 'update-workspace': {
      const name = normalizeWorkspaceName(mutation.name);
      if (!name) {
        throw new StateMutationValidationError('WORKSPACE_NAME_INVALID', 'Workspace name is required.');
      }
      return {
        ...next,
        workspaces: next.workspaces.map((item) => item.id === mutation.id
          ? { ...item, name, emoji: mutation.emoji, updatedAt: mutation.updatedAt }
          : item),
        updatedAt: mutation.updatedAt,
      };
    }
    case 'set-workspace-order': {
      const workspaceById = new Map(next.workspaces.map((workspace) => [workspace.id, workspace]));
      return {
        ...next,
        workspaces: mutation.orderedWorkspaceIds.map((id) => workspaceById.get(id) as Workspace),
        updatedAt: mutation.updatedAt,
      };
    }
    case 'delete-workspace':
      return {
        ...next,
        workspaces: next.workspaces.filter((item) => item.id !== mutation.id),
        activeWorkspaceId: mutation.id === next.activeWorkspaceId
          ? mutation.newActiveWorkspaceId
          : next.activeWorkspaceId,
        groups: next.groups.filter((item) => item.workspaceId !== mutation.id),
        folders: next.folders.filter((item) => item.workspaceId !== mutation.id),
        categoryOrderByWorkspace: Object.fromEntries(
          Object.entries(next.categoryOrderByWorkspace).filter(([workspaceId]) => workspaceId !== mutation.id),
        ),
        updatedAt: mutation.updatedAt,
      };
    case 'add-folder': {
      const validation = validateFolderName(next.folders, mutation.folder.workspaceId, mutation.folder.name);
      if (!validation.ok) throw new CategoryValidationError(validation.reason === 'empty' ? 'Category name is required.' : 'A category with this name already exists in this workspace.');
      if (!next.workspaces.some((item) => item.id === mutation.folder.workspaceId)) throw new CategoryValidationError('Workspace not found.');
      return { ...next, folders: [...next.folders, { ...clone(mutation.folder), name: validation.value }], updatedAt: mutation.folder.updatedAt };
    }
    case 'rename-folder': {
      const folder = next.folders.find((item) => item.id === mutation.id);
      if (!folder) return next;
      const validation = validateFolderName(next.folders, folder.workspaceId, mutation.name, mutation.id);
      if (!validation.ok) throw new CategoryValidationError(validation.reason === 'empty' ? 'Category name is required.' : 'A category with this name already exists in this workspace.');
      return { ...next, folders: next.folders.map((item) => item.id === mutation.id ? { ...item, name: validation.value, updatedAt: mutation.updatedAt } : item), updatedAt: mutation.updatedAt };
    }
    case 'update-folder': {
      const folder = next.folders.find((item) => item.id === mutation.id);
      if (!folder) return next;
      const validation = validateFolderName(next.folders, folder.workspaceId, mutation.name, mutation.id);
      if (!validation.ok) throw new CategoryValidationError(validation.reason === 'empty' ? 'Category name is required.' : 'A category with this name already exists in this workspace.');
      const color = normalizeCategoryColor(mutation.color);
      if (!color) {
        throw new CategoryValidationError('Category color is invalid.');
      }
      return {
        ...next,
        folders: next.folders.map((item) => item.id === mutation.id
          ? {
              ...item,
              name: validation.value,
              color,
              updatedAt: mutation.updatedAt,
            }
          : item),
        updatedAt: mutation.updatedAt,
      };
    }
    case 'delete-folder': {
      const folder = next.folders.find((item) => item.id === mutation.id);
      if (!folder) return next;
      return {
        ...next,
        folders: next.folders.filter((item) => item.id !== mutation.id),
        groups: next.groups.map((group) =>
          group.workspaceId === folder.workspaceId && group.folderId === mutation.id
            ? { ...group, folderId: null, updatedAt: mutation.updatedAt }
            : group),
        categoryOrderByWorkspace: { ...next.categoryOrderByWorkspace, [folder.workspaceId]: (next.categoryOrderByWorkspace[folder.workspaceId] || []).filter((id) => id !== mutation.id && id !== `folder:${mutation.id}`) },
        updatedAt: mutation.updatedAt,
      };
    }
    case 'set-folder-collapsed':
      return { ...next, folders: next.folders.map((folder) => folder.id === mutation.id ? { ...folder, collapsed: mutation.collapsed, updatedAt: mutation.updatedAt } : folder), updatedAt: mutation.updatedAt };
    case 'add-group':
      return { ...next, groups: [...next.groups, clone(mutation.group)], updatedAt: mutation.updatedAt };
    case 'prepend-groups': {
      const groups = newGroups(next, mutation.groups);
      return groups.length
        ? { ...next, groups: [...groups, ...next.groups], updatedAt: mutation.updatedAt }
        : next;
    }
    case 'import-groups': {
      const groups = newGroups(next, mutation.groups);
      return groups.length
        ? { ...next, groups: [...next.groups, ...groups], updatedAt: mutation.updatedAt }
        : next;
    }
    case 'update-group':
      return updateGroup(next, mutation.id, (group) => ({ ...group, ...clone(mutation.updates), updatedAt: mutation.updatedAt }));
    case 'delete-group': {
      const group = next.groups.find((item) => item.id === mutation.id);
      if (!group) return next;
      const workspace = next.workspaces.find((item) => item.id === group.workspaceId);
      const folder = group.folderId ? next.folders.find((item) => item.id === group.folderId) : undefined;
      const binEntry: BinEntry = {
        ...clone(mutation.binEntry),
        label: group.title,
        groupId: group.id,
        groupTitle: group.title,
        item: clone(group),
        originalWorkspaceId: group.workspaceId,
        originalFolderId: group.folderId,
        originalWorkspaceName: workspace?.name,
        originalFolderName: folder?.name,
        originalIndex: next.groups
          .filter((item) => item.workspaceId === group.workspaceId && item.folderId === group.folderId && item.starred === group.starred && item.archived === group.archived)
          .findIndex((item) => item.id === group.id),
      };
      return {
        ...next,
        groups: next.groups.filter((item) => item.id !== mutation.id),
        bin: compactBin([binEntry, ...next.bin]),
        updatedAt: mutation.updatedAt,
      };
    }
    case 'move-group': {
      let category: CategoryFilter = 'inbox';
      if (mutation.archived) {
        category = 'archive';
      } else if (mutation.starred) {
        category = 'saved';
      } else if (mutation.targetFolderId) {
        category = `folder:${mutation.targetFolderId}`;
      }
      const moved = moveSessionToCategory(next, { groupId: mutation.groupId, category, index: mutation.index });
      return { ...moved, groups: moved.groups.map((group) => group.id === mutation.groupId ? { ...group, updatedAt: mutation.updatedAt } : group), updatedAt: mutation.updatedAt };
    }
    case 'add-tab':
      return updateGroup(next, mutation.groupId, (group) => ({ ...group, tabs: [...group.tabs, clone(mutation.tab)], updatedAt: mutation.updatedAt }));
    case 'update-tab':
      return updateTab(next, mutation.groupId, mutation.tabId, (tab) => ({ ...tab, ...clone(mutation.updates), updatedAt: mutation.updatedAt }));
    case 'delete-tab': {
      const group = next.groups.find((item) => item.id === mutation.groupId);
      const tab = group?.tabs.find((item) => item.id === mutation.tabId);
      if (!group || !tab) return next;
      const workspace = next.workspaces.find((item) => item.id === group.workspaceId);
      const folder = group.folderId ? next.folders.find((item) => item.id === group.folderId) : undefined;
      const binEntry: BinEntry = {
        ...clone(mutation.binEntry),
        label: tab.title,
        groupId: group.id,
        groupTitle: group.title,
        item: clone(tab),
        originalGroupId: group.id,
        originalIndex: group.tabs.findIndex((item) => item.id === tab.id),
        originalWorkspaceId: group.workspaceId,
        originalFolderId: group.folderId,
        originalWorkspaceName: workspace?.name,
        originalFolderName: folder?.name,
      };
      const updated = updateGroup(next, mutation.groupId, (item) => ({
        ...item,
        tabs: item.tabs.filter((item) => item.id !== mutation.tabId),
        updatedAt: mutation.updatedAt,
      }));
      return { ...updated, bin: compactBin([binEntry, ...next.bin]), updatedAt: mutation.updatedAt };
    }
    case 'delete-tabs': {
      const selected = new Set(mutation.deletions.map(
        ({ groupId, tabId }) => `${groupId}:${tabId}`,
      ));
      const deletionsByKey = new Map(mutation.deletions.map((deletion) => [
        `${deletion.groupId}:${deletion.tabId}`,
        deletion,
      ]));
      const binEntries: BinEntry[] = [];
      const groups = next.groups.map((group) => {
        const removedTabs = group.tabs.filter((tab) =>
          selected.has(`${group.id}:${tab.id}`));
        if (!removedTabs.length) return group;
        for (const tab of removedTabs) {
          const deletion = deletionsByKey.get(`${group.id}:${tab.id}`)!;
          const workspace = next.workspaces.find(
            (item) => item.id === group.workspaceId,
          );
          const folder = group.folderId
            ? next.folders.find((item) => item.id === group.folderId)
            : undefined;
          binEntries.push({
            ...clone(deletion.binEntry),
            label: tab.title,
            groupId: group.id,
            groupTitle: group.title,
            item: clone(tab),
            originalGroupId: group.id,
            originalIndex: group.tabs.findIndex((item) => item.id === tab.id),
            originalWorkspaceId: group.workspaceId,
            originalFolderId: group.folderId,
            originalWorkspaceName: workspace?.name,
            originalFolderName: folder?.name,
          });
        }
        return {
          ...group,
          tabs: group.tabs.filter((tab) =>
            !selected.has(`${group.id}:${tab.id}`)),
          updatedAt: mutation.updatedAt,
        };
      });
      return {
        ...next,
        groups,
        bin: compactBin([...binEntries, ...next.bin]),
        updatedAt: mutation.updatedAt,
      };
    }
    case 'restore-group': {
      const sourceIndex = next.bin.findIndex((entry) => entry.id === mutation.entryId && entry.kind === 'group');
      if (sourceIndex < 0) return next;
      const matchingIndexes = next.groups
        .map((group, index) => ({ group, index }))
        .filter(({ group }) => group.workspaceId === mutation.group.workspaceId &&
          group.folderId === mutation.group.folderId && group.starred === mutation.group.starred)
        .map(({ index }) => index);
      const categoryIndex = Math.max(0, Math.min(Math.trunc(mutation.index), matchingIndexes.length));
      const workspaceIndexes = next.groups
        .map((group, groupIndex) => group.workspaceId === mutation.group.workspaceId ? groupIndex : -1)
        .filter((groupIndex) => groupIndex >= 0);
      const index = categoryIndex < matchingIndexes.length
        ? matchingIndexes[categoryIndex]
        : matchingIndexes.length
          ? matchingIndexes[matchingIndexes.length - 1] + 1
          : workspaceIndexes.length
            ? workspaceIndexes[workspaceIndexes.length - 1] + 1
            : next.groups.length;
      return {
        ...next,
        groups: [
          ...next.groups.slice(0, index),
          clone(mutation.group),
          ...next.groups.slice(index),
        ],
        bin: next.bin.filter((_, index) => index !== sourceIndex),
        updatedAt: mutation.updatedAt,
      };
    }
    case 'restore-tab': {
      const sourceIndex = next.bin.findIndex((entry) => entry.id === mutation.entryId && entry.kind === 'tab');
      if (sourceIndex < 0) return next;
      const group = next.groups.find((item) => item.id === mutation.groupId);
      if (!group) return next;
      const index = Math.max(0, Math.min(Math.trunc(mutation.index), group.tabs.length));
      const withTab = updateGroup(next, mutation.groupId, (g) => ({
        ...g,
        tabs: [...g.tabs.slice(0, index), clone(mutation.tab), ...g.tabs.slice(index)],
        updatedAt: mutation.updatedAt,
      }));
      return { ...withTab, bin: withTab.bin.filter((_, binIndex) => binIndex !== sourceIndex), updatedAt: mutation.updatedAt };
    }
    case 'delete-bin-entry':
      return { ...next, bin: next.bin.filter((entry) => entry.id !== mutation.entryId), updatedAt: mutation.updatedAt };
    case 'clear-bin':
      return { ...next, bin: [], updatedAt: mutation.updatedAt };
    case 'update-settings':
      return { ...next, settings: { ...next.settings, ...clone(mutation.updates) }, updatedAt: mutation.updatedAt };
    case 'move-tab': {
      const source = next.groups.find((group) => group.id === mutation.groupId);
      const target = next.groups.find((group) => group.id === mutation.targetGroupId);
      const tab = source?.tabs.find((item) => item.id === mutation.tabId);
      if (!source || !target || !tab) return next;
      if (source.id === target.id) {
        const remaining = source.tabs.filter((item) => item.id !== mutation.tabId);
        const index = Math.max(0, Math.min(Math.trunc(mutation.targetIndex), remaining.length));
        const reordered = updateGroup(next, source.id, (group) => ({
          ...group,
          tabs: [
            ...remaining.slice(0, index),
            { ...tab, updatedAt: mutation.updatedAt },
            ...remaining.slice(index),
          ],
          updatedAt: mutation.updatedAt,
        }));
        return { ...reordered, updatedAt: mutation.updatedAt };
      }
      const targetIndex = Math.max(0, Math.min(Math.trunc(mutation.targetIndex), target.tabs.length));
      const afterSourceRemove = updateGroup(next, source.id, (group) => ({
        ...group,
        tabs: group.tabs.filter((item) => item.id !== mutation.tabId),
        updatedAt: mutation.updatedAt,
      }));
      const afterTargetAdd = updateGroup(afterSourceRemove, target.id, (group) => ({
        ...group,
        tabs: [...group.tabs.slice(0, targetIndex), { ...tab, updatedAt: mutation.updatedAt }, ...group.tabs.slice(targetIndex)],
        updatedAt: mutation.updatedAt,
      }));
      return { ...afterTargetAdd, updatedAt: mutation.updatedAt };
    }
    case 'reorder-groups':
      return simulateReorderGroups(next, mutation) ?? next;
    case 'set-group-flags': {
      const starredPatch = mutation.starred === undefined ? {} : { starred: mutation.starred };
      const archivedPatch = mutation.archived === undefined ? {} : { archived: mutation.archived };
      const lockedPatch = mutation.locked === undefined ? {} : { locked: mutation.locked };
      const collapsedPatch = mutation.collapsed === undefined ? {} : { collapsed: mutation.collapsed };
      const shouldClearFolder = (mutation.starred === true) || (mutation.archived === true);
      const folderPatch = shouldClearFolder ? { folderId: null } : {};
      return updateGroup(next, mutation.id, (group) => ({
        ...group,
        ...starredPatch,
        ...archivedPatch,
        ...lockedPatch,
        ...collapsedPatch,
        ...folderPatch,
        updatedAt: mutation.updatedAt,
      }));
    }
    case 'set-group-note':
      return updateGroup(next, mutation.groupId, (group) => ({ ...group, note: mutation.text, tabs: [...group.tabs, clone(mutation.noteTab)], updatedAt: mutation.updatedAt }));
    case 'set-tab-note':
      return updateTab(next, mutation.groupId, mutation.tabId, (tab) => ({ ...tab, note: mutation.text, updatedAt: mutation.updatedAt }));
    case 'set-category-order':
      return { ...next, categoryOrderByWorkspace: { ...next.categoryOrderByWorkspace, [mutation.workspaceId]: categoryOrder(next, mutation.workspaceId, mutation.categoryOrder) }, updatedAt: mutation.updatedAt };
    case 'remove-restored-refs': {
      const refs = new Set(mutation.refs.filter((ref) => ref.source === 'group').map((ref) => `${ref.groupId}:${ref.tabId}`));
      const groups = next.groups.map((group) => ({ ...group, tabs: group.tabs.filter((tab) => !refs.has(`${group.id}:${tab.id}`)) })).filter((group) => group.tabs.length || group.locked || group.note);
      return { ...next, groups, updatedAt: mutation.updatedAt };
    }
  }
}

export function applyStateMutation(
  state: TabBoardState,
  mutation: StateMutation,
  appliedAt = nowIso(),
): TabBoardState {
  assertMutation(mutation);
  if (mutation.type === 'drop-intent') {
    return applyDropIntentMutation(state, mutation, appliedAt);
  }
  assertCategoryCasPreconditions(state, mutation);
  if (isAlreadyApplied(state, mutation)) return clone(state);
  assertOrdinaryMutationSafety(state, mutation);
  return advanceRevision(state, applyStateMutationCore(state, mutation));
}

export function applyStateMutations(state: TabBoardState, mutations: readonly unknown[]): TabBoardState {
  const validated = validateMutationBatch(mutations);
  let current = state;
  let revisionContext = createDropMutationBatchContext(validated.invalidDropIndexes);
  const invalidIndexes = [...validated.invalidDropIndexes];
  const committedIndexes: number[] = [];
  validated.mutations.forEach((mutation, index) => {
    const originalIndex = validated.originalIndexes[index];
    const prepared = prepareDropMutationForBatch(current, mutation, revisionContext, originalIndex);
    revisionContext = prepared.context;
    try {
      if (prepared.stale
        && !(prepared.mutation.type === 'drop-intent'
          && isDropIntentAlreadyApplied(
            current,
            prepared.mutation.intent,
            prepared.mutation.openTabs,
            prepared.mutation.operationId,
          ))) {
        throw new InvalidDropMutationError('Drop mutation revision is stale.');
      }
      current = applyStateMutation(current, prepared.mutation);
      committedIndexes.push(validated.originalIndexes[index]);
    } catch (error: unknown) {
      if (mutation.type === 'drop-intent' && error instanceof InvalidDropMutationError) {
        invalidIndexes.push(validated.originalIndexes[index]);
        if (!prepared.stale) {
          revisionContext = markInvalidDropMutationForBatch(revisionContext);
        }
        return;
      }
      throw error;
    }
  });
  if (invalidIndexes.length) {
    throw new InvalidDropMutationError(
      'Invalid state mutation.',
      invalidIndexes.sort((left, right) => left - right),
      committedIndexes,
      current,
    );
  }
  return current;
}
