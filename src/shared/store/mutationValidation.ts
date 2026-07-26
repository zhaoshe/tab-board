import type { DropIntent, SavedTabRef } from '../model/drop-intent';
import type { OpenTabInfo } from '../openTabs';
import {
  canonicalJson,
  isBoundedString,
  isCanonicalDigestWithinLimit,
  isDenseArray,
  isEntityId,
  isOperationId,
  MAX_CANONICAL_DIGEST_BYTES,
  MAX_ENTITY_ID_BYTES,
  MAX_FAVICON_URL_BYTES,
  MAX_LIVE_RECORDS,
  MAX_MUTATIONS,
  MAX_REFS,
  MAX_TITLE_BYTES,
  MAX_URL_BYTES,
} from '../validation';
export {
  canonicalJson,
  canonicalize,
  isBoundedString,
  isCanonicalDigestWithinLimit,
  isDenseArray,
  isEntityId,
  isOperationId,
  isTimestamp,
  MAX_CANONICAL_DIGEST_BYTES,
  MAX_ENTITY_ID_BYTES,
  MAX_FAVICON_URL_BYTES,
  MAX_LIVE_RECORDS,
  MAX_MUTATIONS,
  MAX_OPERATION_ID_BYTES,
  MAX_REFS,
  MAX_TIMESTAMP_BYTES,
  MAX_TITLE_BYTES,
  MAX_URL_BYTES,
  utf8ByteLength,
} from '../validation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Reflect.ownKeys(value).every((key) => typeof key === 'string' && allowed.has(key));
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isSavedTabRef(value: unknown): value is SavedTabRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  return hasOnlyKeys(ref, ['groupId', 'tabId'])
    && isEntityId(ref.groupId) && isEntityId(ref.tabId);
}

function isCategory(value: unknown): boolean {
  if (value === 'inbox' || value === 'saved' || value === 'archive') return true;
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

export function isDropIntentShape(value: unknown): value is DropIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const intent = value as Record<string, unknown>;
  if (!isEntityId(intent.workspaceId) || typeof intent.kind !== 'string') return false;

  switch (intent.kind) {
    case 'move-session':
      return hasOnlyKeys(intent, ['kind', 'workspaceId', 'groupId', 'category', 'index'])
        && isEntityId(intent.groupId)
        && isCategory(intent.category)
        && isSafeNonNegativeInteger(intent.index);
    case 'reorder-category':
      return hasOnlyKeys(intent, ['kind', 'workspaceId', 'categoryId', 'targetCategoryId', 'placement'])
        && isEntityId(intent.categoryId)
        && isEntityId(intent.targetCategoryId)
        && (intent.placement === 'before' || intent.placement === 'after');
    case 'move-tabs':
      return hasOnlyKeys(intent, ['kind', 'workspaceId', 'refs', 'targetGroupId', 'targetIndex'])
        && Array.isArray(intent.refs)
        && isDenseArray(intent.refs)
        && intent.refs.length > 0
        && intent.refs.length <= MAX_REFS
        && intent.refs.every(isSavedTabRef)
        && isEntityId(intent.targetGroupId)
        && isSafeNonNegativeInteger(intent.targetIndex);
    case 'copy-open-tabs':
      return hasOnlyKeys(intent, ['kind', 'workspaceId', 'tabIds', 'windowId', 'targetGroupId', 'targetIndex'])
        && isOpenTabIdArray(intent.tabIds)
        && isSafeNonNegativeInteger(intent.windowId)
        && isEntityId(intent.targetGroupId)
        && isSafeNonNegativeInteger(intent.targetIndex);
    case 'create-session': {
      if (!hasOnlyKeys(intent, ['kind', 'workspaceId', 'source', 'category', 'index'])
        || !isCategory(intent.category)
        || !isSafeNonNegativeInteger(intent.index)
        || !isRecord(intent.source)) {
        return false;
      }
      const source = intent.source;
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
    || !hasOnlyKeys(value, ['id', 'windowId', 'title', 'url', 'favIconUrl', 'active', 'pinned', 'index', 'browserGroup', 'storable', 'reason'])) {
    return false;
  }
  return (value.id === undefined || isSafeNonNegativeInteger(value.id))
    && (value.windowId === undefined || isSafeNonNegativeInteger(value.windowId))
    && isBoundedString(value.title, MAX_TITLE_BYTES)
    && isBoundedString(value.url, MAX_URL_BYTES)
    && isBoundedString(value.favIconUrl, MAX_FAVICON_URL_BYTES)
    && typeof value.active === 'boolean'
    && typeof value.pinned === 'boolean'
    && isSafeNonNegativeInteger(value.index)
    && (value.browserGroup === null || isBrowserGroup(value.browserGroup))
    && typeof value.storable === 'boolean'
    && (value.reason === null || isBoundedString(value.reason, MAX_TITLE_BYTES));
}

function isBrowserGroup(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, ['sourceGroupId', 'title', 'color', 'collapsed'])) return false;
  return (value.sourceGroupId === null || isSafeNonNegativeInteger(value.sourceGroupId))
    && isBoundedString(value.title, MAX_TITLE_BYTES)
    && isBoundedString(value.color, MAX_TITLE_BYTES)
    && typeof value.collapsed === 'boolean';
}

export function isDropPayloadWithinLimits(
  operationId: unknown,
  intent: unknown,
  openTabs: unknown,
): boolean {
  if (!isOperationId(operationId) || !isDropIntentShape(intent) || !Array.isArray(openTabs)
    || !isDenseArray(openTabs)) {
    return false;
  }
  const isOpenSource = intent.kind === 'copy-open-tabs'
    || (intent.kind === 'create-session' && intent.source.kind === 'open-tabs');
  if ((!isOpenSource && openTabs.length !== 0)
    || openTabs.length > MAX_LIVE_RECORDS
    || !openTabs.every(isOpenTabInfoShape)) {
    return false;
  }
  return isCanonicalDigestWithinLimit({ intent, openTabs });
}

export function isDropMutationCandidate(value: unknown): boolean {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as Record<string, unknown>).type === 'drop-intent';
}
