import type { OpenTabInfo, OpenWindowInfo } from '../../shared/openTabs';
import {
  deriveSelectedStorableRecords,
  deriveSelectedStorableTabIds,
  filterOpenTabs,
  getSelectableOpenTabIds,
  resolveSelectedWindow,
} from './open-tabs';

export interface OpenTabsWorkflowState {
  windows: OpenWindowInfo[];
  selectedWindowId: number | null;
  query: string;
  tabFilterUrl: string | null;
  selectedTabIds: number[];
  closingTabIds: number[];
  loading: boolean;
  capturing: boolean;
  updatingSelection: boolean;
  error: string | null;
}

export type OpenTabsWorkflowAction =
  | { type: 'refresh-started' }
  | { type: 'refresh-succeeded'; windows: OpenWindowInfo[] }
  | { type: 'refresh-failed'; error: string }
  | { type: 'window-selected'; windowId: number }
  | { type: 'query-changed'; query: string }
  | { type: 'tab-filter-changed'; url: string | null }
  | { type: 'selection-toggled'; tabId: number }
  | { type: 'selection-visible'; tabIds: number[] }
  | { type: 'selection-cleared' }
  | { type: 'drop-completed' }
  | { type: 'closing-changed'; tabIds: number[] }
  | { type: 'capture-changed'; capturing: boolean }
  | { type: 'selection-update-changed'; updating: boolean }
  | { type: 'operation-failed'; error: string }
  | { type: 'error-cleared' };

export interface OpenTabsSelectionProjection {
  ids: number[];
  count: number;
  records: OpenTabInfo[];
  recordIds: number[];
}

export interface OpenTabsWorkflowProjection {
  windows: OpenWindowInfo[];
  selectedWindow: OpenWindowInfo | null;
  selectedWindowId: number | null;
  filteredTabs: OpenTabInfo[];
  query: string;
  tabFilterUrl: string | null;
  selection: OpenTabsSelectionProjection;
  status: {
    loading: boolean;
    capturing: boolean;
    updatingSelection: boolean;
    closingTabIds: number[];
    error: string | null;
  };
}

export function createOpenTabsWorkflowState(): OpenTabsWorkflowState {
  return {
    windows: [],
    selectedWindowId: null,
    query: '',
    tabFilterUrl: null,
    selectedTabIds: [],
    closingTabIds: [],
    loading: true,
    capturing: false,
    updatingSelection: false,
    error: null,
  };
}

function selectedWindow(state: OpenTabsWorkflowState): OpenWindowInfo | null {
  return resolveSelectedWindow(state.windows, state.selectedWindowId);
}

function canonicalSelection(
  state: OpenTabsWorkflowState,
  ids: readonly number[],
): number[] {
  const allowed = new Set(getSelectableOpenTabIds(selectedWindow(state)));
  return [...new Set(ids.filter((id) => allowed.has(id)))];
}

function sameBrowserGroup(
  left: OpenTabInfo['browserGroup'],
  right: OpenTabInfo['browserGroup'],
): boolean {
  return left === right || Boolean(
    left
    && right
    && left.sourceGroupId === right.sourceGroupId
    && left.title === right.title
    && left.color === right.color
    && left.collapsed === right.collapsed,
  );
}

function sameOpenTab(left: OpenTabInfo, right: OpenTabInfo): boolean {
  return left === right || (
    left.id === right.id
    && left.windowId === right.windowId
    && left.title === right.title
    && left.url === right.url
    && left.favIconUrl === right.favIconUrl
    && left.pinned === right.pinned
    && left.index === right.index
    && sameBrowserGroup(left.browserGroup, right.browserGroup)
    && left.storable === right.storable
    && left.reason === right.reason
  );
}

function structurallyShareTabs(
  previous: readonly OpenTabInfo[],
  next: OpenTabInfo[],
): OpenTabInfo[] {
  if (previous.length !== next.length) return next;
  const shared = next.map((tab, index) =>
    sameOpenTab(previous[index]!, tab) ? previous[index]! : tab);
  return shared.every((tab, index) => tab === previous[index])
    ? previous as OpenTabInfo[]
    : shared;
}

function structurallyShareWindows(
  previous: readonly OpenWindowInfo[],
  next: OpenWindowInfo[],
): OpenWindowInfo[] {
  if (previous.length !== next.length) return next;
  const shared = next.map((window, index) => {
    const current = previous[index];
    if (!current
      || current.id !== window.id
      || current.focused !== window.focused
      || current.incognito !== window.incognito
      || current.tabCount !== window.tabCount) {
      return window;
    }
    const tabs = structurallyShareTabs(current.tabs, window.tabs);
    return tabs === current.tabs ? current : { ...window, tabs };
  });
  return shared.every((window, index) => window === previous[index])
    ? previous as OpenWindowInfo[]
    : shared;
}

export function reduceOpenTabsWorkflow(
  state: OpenTabsWorkflowState,
  action: OpenTabsWorkflowAction,
): OpenTabsWorkflowState {
  switch (action.type) {
    case 'refresh-started':
      return { ...state, loading: true, error: null };
    case 'refresh-succeeded': {
      const windows = structurallyShareWindows(state.windows, action.windows);
      const nextSelectedWindow = resolveSelectedWindow(windows, state.selectedWindowId);
      const nextSelectedWindowId = nextSelectedWindow?.id ?? null;
      const sameWindow = nextSelectedWindowId === state.selectedWindowId;
      const allowed = new Set(getSelectableOpenTabIds(nextSelectedWindow));
      return {
        ...state,
        windows,
        selectedWindowId: nextSelectedWindowId,
        selectedTabIds: sameWindow
          ? state.selectedTabIds.filter((id) => allowed.has(id))
          : [],
        loading: false,
        error: null,
      };
    }
    case 'refresh-failed':
      return { ...state, loading: false, error: action.error };
    case 'window-selected':
      if (!state.windows.some((window) =>
        !window.incognito && window.id === action.windowId)) {
        return state;
      }
      return {
        ...state,
        selectedWindowId: action.windowId,
        selectedTabIds: [],
      };
    case 'query-changed':
      return state.query === action.query ? state : { ...state, query: action.query };
    case 'tab-filter-changed':
      return state.tabFilterUrl === action.url
        ? state
        : { ...state, tabFilterUrl: action.url };
    case 'selection-toggled': {
      const allowed = canonicalSelection(state, [action.tabId]);
      if (!allowed.length) return state;
      const selectedTabIds = state.selectedTabIds.includes(action.tabId)
        ? state.selectedTabIds.filter((id) => id !== action.tabId)
        : canonicalSelection(state, [...state.selectedTabIds, action.tabId]);
      return { ...state, selectedTabIds };
    }
    case 'selection-visible': {
      const visibleIds = canonicalSelection(state, action.tabIds);
      if (!visibleIds.length) return state;
      const visibleSet = new Set(visibleIds);
      const allVisibleSelected = visibleIds.every((id) =>
        state.selectedTabIds.includes(id));
      const selectedTabIds = allVisibleSelected
        ? state.selectedTabIds.filter((id) => !visibleSet.has(id))
        : canonicalSelection(state, [...state.selectedTabIds, ...visibleIds]);
      return { ...state, selectedTabIds };
    }
    case 'selection-cleared':
    case 'drop-completed':
      return state.selectedTabIds.length
        ? { ...state, selectedTabIds: [] }
        : state;
    case 'closing-changed':
      return { ...state, closingTabIds: [...new Set(action.tabIds)] };
    case 'capture-changed':
      return state.capturing === action.capturing
        ? state
        : { ...state, capturing: action.capturing };
    case 'selection-update-changed':
      return state.updatingSelection === action.updating
        ? state
        : { ...state, updatingSelection: action.updating };
    case 'operation-failed':
      return { ...state, error: action.error };
    case 'error-cleared':
      return state.error === null ? state : { ...state, error: null };
  }
}

export function projectOpenTabsWorkflow(
  state: OpenTabsWorkflowState,
  deferredQuery = state.query,
): OpenTabsWorkflowProjection {
  const currentWindow = selectedWindow(state);
  const selectedIds = canonicalSelection(state, state.selectedTabIds);
  const selectedIdSet = new Set(selectedIds);
  const records = deriveSelectedStorableRecords(currentWindow, selectedIdSet);
  return {
    windows: state.windows,
    selectedWindow: currentWindow,
    selectedWindowId: state.selectedWindowId,
    filteredTabs: filterOpenTabs(currentWindow?.tabs ?? [], deferredQuery),
    query: state.query,
    tabFilterUrl: state.tabFilterUrl,
    selection: {
      ids: selectedIds,
      count: selectedIds.length,
      records,
      recordIds: deriveSelectedStorableTabIds(records),
    },
    status: {
      loading: state.loading,
      capturing: state.capturing,
      updatingSelection: state.updatingSelection,
      closingTabIds: state.closingTabIds,
      error: state.error,
    },
  };
}
