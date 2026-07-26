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
  | { type: 'selection-all' }
  | { type: 'selection-cleared' }
  | { type: 'drop-completed' }
  | { type: 'closing-changed'; tabIds: number[] }
  | { type: 'capture-changed'; capturing: boolean }
  | { type: 'selection-update-changed'; updating: boolean }
  | { type: 'operation-failed'; error: string }
  | { type: 'error-cleared' };

export interface OpenTabsSelectionProjection {
  active: boolean;
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

export function reduceOpenTabsWorkflow(
  state: OpenTabsWorkflowState,
  action: OpenTabsWorkflowAction,
): OpenTabsWorkflowState {
  switch (action.type) {
    case 'refresh-started':
      return { ...state, loading: true, error: null };
    case 'refresh-succeeded': {
      const nextSelectedWindow = resolveSelectedWindow(action.windows, state.selectedWindowId);
      const nextSelectedWindowId = nextSelectedWindow?.id ?? null;
      const sameWindow = nextSelectedWindowId === state.selectedWindowId;
      const allowed = new Set(getSelectableOpenTabIds(nextSelectedWindow));
      return {
        ...state,
        windows: action.windows,
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
    case 'selection-all': {
      const selectedTabIds = getSelectableOpenTabIds(selectedWindow(state));
      if (!selectedTabIds.length) return state;
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
      active: selectedIds.length > 0,
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
