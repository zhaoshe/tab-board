import type { CaptureCandidateReason } from './model/capture-policy';
import type { BrowserGroup } from './model/types';

export interface OpenTabInfo {
  id: number | undefined;
  windowId: number | undefined;
  title: string;
  url: string;
  favIconUrl: string;
  active: boolean;
  pinned: boolean;
  index: number;
  browserGroup: BrowserGroup | null;
  storable: boolean;
  reason: CaptureCandidateReason | null;
}

export interface OpenWindowInfo {
  id: number | undefined;
  focused: boolean;
  incognito: boolean;
  tabCount: number;
  tabs: OpenTabInfo[];
}

export interface OpenTabsListResult {
  windows: OpenWindowInfo[];
}

export interface OpenTabsCaptureResult {
  storedTabs: number;
  storedGroups: number;
  cleanedDuplicates: number;
  createdGroupIds: string[];
}

export type RuntimeResponse<T> =
  | { ok: true; result: T }
  | { ok: false; error: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSafeOptionalId(value: unknown): value is number | undefined {
  return value === undefined
    || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isBrowserGroup(value: unknown): value is BrowserGroup {
  if (!isRecord(value)) return false;
  return (value.sourceGroupId === null || isNonNegativeInteger(value.sourceGroupId))
    && typeof value.title === 'string'
    && typeof value.color === 'string'
    && typeof value.collapsed === 'boolean';
}

export function isOpenTabInfo(value: unknown): value is OpenTabInfo {
  if (!isRecord(value)) return false;
  return isSafeOptionalId(value.id)
    && isSafeOptionalId(value.windowId)
    && typeof value.title === 'string'
    && typeof value.url === 'string'
    && typeof value.favIconUrl === 'string'
    && typeof value.active === 'boolean'
    && typeof value.pinned === 'boolean'
    && isNonNegativeInteger(value.index)
    && (value.browserGroup === null || isBrowserGroup(value.browserGroup))
    && typeof value.storable === 'boolean'
    && (value.reason === null || typeof value.reason === 'string');
}

export function isOpenWindowInfo(value: unknown): value is OpenWindowInfo {
  if (!isRecord(value) || !Array.isArray(value.tabs)) return false;
  return isSafeOptionalId(value.id)
    && typeof value.focused === 'boolean'
    && typeof value.incognito === 'boolean'
    && isNonNegativeInteger(value.tabCount)
    && value.tabs.length === value.tabCount
    && value.tabs.every(isOpenTabInfo);
}

export function parseOpenTabsListResult(value: unknown): OpenTabsListResult {
  if (!isRecord(value)
    || !Array.isArray(value.windows)
    || !value.windows.every(isOpenWindowInfo)) {
    throw new Error('Invalid Open Tabs list result.');
  }
  return { windows: value.windows };
}

export function parseOpenTabsCaptureResult(value: unknown): OpenTabsCaptureResult {
  if (!isRecord(value)
    || !isNonNegativeInteger(value.storedTabs)
    || !isNonNegativeInteger(value.storedGroups)
    || !isNonNegativeInteger(value.cleanedDuplicates)
    || !Array.isArray(value.createdGroupIds)
    || !value.createdGroupIds.every((id) => typeof id === 'string' && id.length > 0)) {
    throw new Error('Invalid Open Tabs capture result.');
  }
  return {
    storedTabs: value.storedTabs,
    storedGroups: value.storedGroups,
    cleanedDuplicates: value.cleanedDuplicates,
    createdGroupIds: value.createdGroupIds,
  };
}

export function parseRuntimeResponse<T>(value: unknown): RuntimeResponse<T> {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    throw new Error('Invalid runtime response.');
  }
  if (value.ok === true && 'result' in value) {
    return { ok: true, result: value.result as T };
  }
  if (value.ok === false && 'error' in value) {
    return { ok: false, error: value.error };
  }
  throw new Error('Invalid runtime response.');
}
