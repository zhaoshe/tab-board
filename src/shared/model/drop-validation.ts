import type { OpenTabInfo } from '../openTabs';
import {
  isBoundedString,
  isCanonicalDigestWithinLimit,
  isDenseArray,
  isEntityId,
  isOperationId,
  MAX_ENTITY_ID_BYTES,
  MAX_FAVICON_URL_BYTES,
  MAX_LIVE_RECORDS,
  MAX_REFS,
  MAX_TITLE_BYTES,
  MAX_URL_BYTES,
} from '../validation';
import type { DropIntent, SavedTabRef } from './drop-intent';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Reflect.ownKeys(value).every((key) =>
    typeof key === 'string' && allowed.has(key));
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0;
}

function isSavedTabRef(value: unknown): value is SavedTabRef {
  if (!isRecord(value)) return false;
  return hasOnlyKeys(value, ['groupId', 'tabId'])
    && isEntityId(value.groupId)
    && isEntityId(value.tabId);
}

function isCategory(value: unknown, allowBookmarks = false): boolean {
  if (value === 'bookmarks') return allowBookmarks;
  if (value === 'inbox' || value === 'saved' || value === 'archive') {
    return true;
  }
  return typeof value === 'string'
    && isBoundedString(value, MAX_ENTITY_ID_BYTES)
    && value.startsWith('folder:')
    && isEntityId(value.slice('folder:'.length));
}

function isOpenTabIdArray(value: unknown): value is number[] {
  return Array.isArray(value)
    && isDenseArray(value)
    && value.length > 0
    && value.length <= MAX_REFS
    && new Set(value).size === value.length
    && value.every(isSafeNonNegativeInteger);
}

function isCategoryOrder(value: unknown): value is string[] {
  return Array.isArray(value)
    && isDenseArray(value)
    && value.length > 0
    && value.length <= MAX_REFS
    && new Set(value).size === value.length
    && value.every((category) => isCategory(category, true));
}

export function isDropIntentShape(value: unknown): value is DropIntent {
  if (!isRecord(value)
    || !isEntityId(value.workspaceId)
    || typeof value.kind !== 'string') {
    return false;
  }
  switch (value.kind) {
    case 'move-session':
      return hasOnlyKeys(
        value,
        ['kind', 'workspaceId', 'groupId', 'category', 'index'],
      )
        && isEntityId(value.groupId)
        && isCategory(value.category)
        && isSafeNonNegativeInteger(value.index);
    case 'reorder-category':
      return hasOnlyKeys(
        value,
        [
          'kind',
          'workspaceId',
          'categoryId',
          'targetCategoryId',
          'placement',
          'expectedCategoryOrder',
        ],
      )
        && isEntityId(value.categoryId)
        && isEntityId(value.targetCategoryId)
        && (value.placement === 'before' || value.placement === 'after')
        && isCategoryOrder(value.expectedCategoryOrder);
    case 'move-tabs':
      return hasOnlyKeys(
        value,
        [
          'kind',
          'workspaceId',
          'refs',
          'targetGroupId',
          'targetIndex',
        ],
      )
        && Array.isArray(value.refs)
        && isDenseArray(value.refs)
        && value.refs.length > 0
        && value.refs.length <= MAX_REFS
        && value.refs.every(isSavedTabRef)
        && isEntityId(value.targetGroupId)
        && isSafeNonNegativeInteger(value.targetIndex);
    case 'copy-open-tabs':
      return hasOnlyKeys(
        value,
        [
          'kind',
          'workspaceId',
          'tabIds',
          'windowId',
          'targetGroupId',
          'targetIndex',
        ],
      )
        && isOpenTabIdArray(value.tabIds)
        && isSafeNonNegativeInteger(value.windowId)
        && isEntityId(value.targetGroupId)
        && isSafeNonNegativeInteger(value.targetIndex);
    case 'create-session': {
      if (!hasOnlyKeys(
        value,
        ['kind', 'workspaceId', 'source', 'category', 'index'],
      )
        || !isCategory(value.category)
        || !isSafeNonNegativeInteger(value.index)
        || !isRecord(value.source)) {
        return false;
      }
      const source = value.source;
      if (source.kind === 'saved-tabs') {
        return hasOnlyKeys(source, ['kind', 'refs'])
          && Array.isArray(source.refs)
          && isDenseArray(source.refs)
          && source.refs.length > 0
          && source.refs.length <= MAX_REFS
          && source.refs.every(isSavedTabRef);
      }
      return source.kind === 'open-tabs'
        && hasOnlyKeys(source, ['kind', 'tabIds', 'windowId'])
        && isOpenTabIdArray(source.tabIds)
        && isSafeNonNegativeInteger(source.windowId);
    }
    default:
      return false;
  }
}

export function isOpenTabInfoShape(value: unknown): value is OpenTabInfo {
  if (!isRecord(value)
    || !hasOnlyKeys(
      value,
      [
        'id',
        'windowId',
        'title',
        'url',
        'favIconUrl',
        'pinned',
        'index',
        'browserGroup',
        'storable',
        'reason',
      ],
    )) {
    return false;
  }
  return (value.id === undefined || isSafeNonNegativeInteger(value.id))
    && (
      value.windowId === undefined
      || isSafeNonNegativeInteger(value.windowId)
    )
    && isBoundedString(value.title, MAX_TITLE_BYTES)
    && isBoundedString(value.url, MAX_URL_BYTES)
    && isBoundedString(value.favIconUrl, MAX_FAVICON_URL_BYTES)
    && typeof value.pinned === 'boolean'
    && isSafeNonNegativeInteger(value.index)
    && (value.browserGroup === null || isBrowserGroup(value.browserGroup))
    && typeof value.storable === 'boolean'
    && (
      value.reason === null
      || isBoundedString(value.reason, MAX_TITLE_BYTES)
    );
}

function isBrowserGroup(value: unknown): boolean {
  if (!isRecord(value)
    || !hasOnlyKeys(
      value,
      ['sourceGroupId', 'title', 'color', 'collapsed'],
    )) {
    return false;
  }
  return (
    value.sourceGroupId === null
    || isSafeNonNegativeInteger(value.sourceGroupId)
  )
    && isBoundedString(value.title, MAX_TITLE_BYTES)
    && isBoundedString(value.color, MAX_TITLE_BYTES)
    && typeof value.collapsed === 'boolean';
}

export function isDropPayloadWithinLimits(
  operationId: unknown,
  intent: unknown,
  openTabs: unknown,
): boolean {
  if (!isOperationId(operationId)
    || !isDropIntentShape(intent)
    || !Array.isArray(openTabs)
    || !isDenseArray(openTabs)) {
    return false;
  }
  const isOpenSource = intent.kind === 'copy-open-tabs'
    || (
      intent.kind === 'create-session'
      && intent.source.kind === 'open-tabs'
    );
  if ((!isOpenSource && openTabs.length !== 0)
    || openTabs.length > MAX_LIVE_RECORDS
    || !openTabs.every(isOpenTabInfoShape)) {
    return false;
  }
  return isCanonicalDigestWithinLimit({ intent, openTabs });
}
