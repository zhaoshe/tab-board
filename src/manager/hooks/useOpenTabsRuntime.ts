import { useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  savedSearchQueryStore,
  useSearchQuery,
  useSetSearchQuery,
} from './useSearchQuery';
import {
  canRevealCapture,
  createCaptureSnapshot,
  getCaptureMessage,
  getCaptureOutcome,
  mergeCapturedGroups,
  sameCaptureCategorySnapshot,
  sameCaptureFilterSnapshot,
  sameCaptureSnapshot,
  type CaptureCategorySnapshot,
  type CaptureFilterSnapshot,
  type OpenTabsCaptureSnapshot,
} from '../core/capture';
import {
  filterOpenTabs,
  getSelectableOpenTabIds,
  isNewTabUrl,
  resolveSelectedWindow,
  sameOpenTabSelection,
} from '../core/open-tabs';
import type {
  OpenTabInfo,
  OpenTabsCaptureResult,
  OpenWindowInfo,
  RuntimeResponse,
} from '../../shared/openTabs';
import { parseOpenTabsListResult } from '../../shared/openTabs';
import {
  createOpenTabsWorkflowState,
  projectOpenTabsWorkflow,
  reduceOpenTabsWorkflow,
  type OpenTabsWorkflowAction,
} from '../core/openTabsWorkflow';
import { groupMatchesQuery, normalizeState, type TabBoardState } from '../../shared/model';
import { getState as getPersistedState } from '../../shared/store/chromeStorage';
import { structurallyShareState } from '../../shared/store/stateStructuralSharing';
import { useTabBoardStore } from '../../shared/store/useTabBoardStore';
import {
  createRefreshCoalescer,
  type RefreshCoalescer,
} from '../core/refreshCoalescer';

export interface CaptureCompletion {
  sourceWorkspaceId: string;
  activeWorkspaceId: string;
  categorySnapshot: CaptureCategorySnapshot;
  filterCurrent: boolean;
  targetCategorySnapshot: CaptureCategorySnapshot;
  targetFilterSnapshot: CaptureFilterSnapshot;
  createdGroupIds: string[];
  committed: boolean;
  reconciled: boolean;
  selectionCurrent: boolean;
  result: CaptureResult | null;
  message: string;
}

export type CaptureResult = OpenTabsCaptureResult;

export interface OpenTabsWorkflowModel {
  windows: OpenWindowInfo[];
  selectedWindow: OpenWindowInfo | null;
  selectedWindowId: number | null;
  filteredTabs: OpenTabInfo[];
  query: string;
  tabFilterUrl: string | null;
  isTabFilterActive: boolean;
  selection: {
    ids: number[];
    count: number;
    records: OpenTabInfo[];
    recordIds: number[];
  };
  status: {
    closingTabIds: number[];
    updatingSelection: boolean;
    loading: boolean;
    capturing: boolean;
    error: string | null;
  };
}

export interface OpenTabsWorkflowCommands {
  setQuery: (value: string) => void;
  selectWindow: (windowId: number) => void;
  clearSelection: () => void;
  toggleSelection: (tabId: number | undefined) => void;
  selectAll: (tabIds?: readonly number[]) => void;
  completeDrop: () => void;
  focusTab: (tabId: number | undefined, windowId: number | undefined) => Promise<void>;
  closeTab: (tabId: number | undefined) => Promise<void>;
  pinTab: (tabId: number | undefined) => Promise<void>;
  closeSelection: () => Promise<void>;
  pinSelection: () => Promise<void>;
  filterSessionsByTab: (tab: OpenTabInfo) => void;
  clearSessionFilter: () => void;
  clearQuery: () => void;
  captureSelection: (
    categorySnapshot: CaptureCategorySnapshot,
    getCurrentCategorySnapshot: () => CaptureCategorySnapshot,
  ) => Promise<CaptureCompletion | null>;
  captureWindow: (
    categorySnapshot: CaptureCategorySnapshot,
    getCurrentCategorySnapshot: () => CaptureCategorySnapshot,
  ) => Promise<CaptureCompletion | null>;
  refresh: () => Promise<void>;
}

export interface OpenTabsWorkflow {
  model: OpenTabsWorkflowModel;
  commands: OpenTabsWorkflowCommands;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || 'Unable to update open tabs.');
}

function isSafeTabId(tabId: number | undefined): tabId is number {
  return Number.isSafeInteger(tabId);
}

async function sendWorkerMessage<T>(message: Record<string, unknown>): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as RuntimeResponse<T> | undefined;
  if (!response?.ok) {
    throw new Error(errorMessage(response?.error));
  }
  return response.result as T;
}

const REFRESHABLE_TAB_CHANGES = new Set([
  'status',
  'title',
  'url',
  'pendingUrl',
  'favIconUrl',
  'groupId',
  'pinned',
]);

export function useOpenTabsRuntime(): OpenTabsWorkflow {
  const [workflowState, reactDispatch] = useReducer(
    reduceOpenTabsWorkflow,
    undefined,
    createOpenTabsWorkflowState,
  );
  const workflowStateRef = useRef(workflowState);
  const dispatch = useCallback((action: OpenTabsWorkflowAction) => {
    workflowStateRef.current = reduceOpenTabsWorkflow(workflowStateRef.current, action);
    reactDispatch(action);
  }, []);
  const capturingRef = useRef(false);
  const currentWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);
  const previousWorkspaceIdRef = useRef(currentWorkspaceId);
  const refreshFailureRef = useRef<unknown | null>(null);
  const refreshCoalescerRef = useRef<RefreshCoalescer | null>(null);
  const closingTabIdsRef = useRef<Set<number>>(new Set());
  const savedSearchQuery = useSearchQuery();
  const setSavedSearchQuery = useSetSearchQuery();
  const tabFilterUrlRef = useRef(workflowState.tabFilterUrl);

  useEffect(() => {
    workflowStateRef.current = workflowState;
  }, [workflowState]);

  useEffect(() => {
    if (tabFilterUrlRef.current && savedSearchQuery !== tabFilterUrlRef.current) {
      tabFilterUrlRef.current = null;
      dispatch({ type: 'tab-filter-changed', url: null });
    }
  }, [dispatch, savedSearchQuery]);

  useEffect(() => {
    tabFilterUrlRef.current = workflowState.tabFilterUrl;
  }, [workflowState.tabFilterUrl]);

  useEffect(() => {
    const previousWorkspaceId = previousWorkspaceIdRef.current;
    if (previousWorkspaceId !== currentWorkspaceId) {
      const previousTabFilterUrl = tabFilterUrlRef.current;
      if (previousTabFilterUrl) {
        tabFilterUrlRef.current = null;
        dispatch({ type: 'tab-filter-changed', url: null });
        if (savedSearchQueryStore.getSnapshot() === previousTabFilterUrl) {
          setSavedSearchQuery('');
        }
      }
      previousWorkspaceIdRef.current = currentWorkspaceId;
    }
  }, [currentWorkspaceId, dispatch, setSavedSearchQuery]);

  const performRefresh = useCallback(async (): Promise<void> => {
    dispatch({ type: 'refresh-started' });
    refreshFailureRef.current = null;
    try {
      const response = await sendWorkerMessage<unknown>({ type: 'list-open-tabs' });
      const result = parseOpenTabsListResult(response);
      const nextWindows = result.windows.map((window) => {
        const visibleTabs = window.tabs.filter((tab) => !isNewTabUrl(tab.url));
        return { ...window, tabs: visibleTabs, tabCount: visibleTabs.length };
      });
      dispatch({ type: 'refresh-succeeded', windows: nextWindows });
    } catch (error: unknown) {
      refreshFailureRef.current = error;
      dispatch({ type: 'refresh-failed', error: errorMessage(error) });
    }
  }, [dispatch]);

  const refresh = useCallback(
    (): Promise<void> => refreshCoalescerRef.current?.request({ immediate: true })
      ?? performRefresh(),
    [performRefresh],
  );

  useEffect(() => {
    const coalescer = createRefreshCoalescer(performRefresh, { delay: 75 });
    refreshCoalescerRef.current = coalescer;
    void coalescer.request({ immediate: true });

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void coalescer.request();
    };
    const refreshOnFocus = () => void coalescer.request();
    const refreshOnTabEvent = () => void coalescer.request();
    const extensionBaseUrl = typeof chrome.runtime.getURL === 'function'
      ? chrome.runtime.getURL('')
      : '';
    const isOwnExtensionUrl = (url: string | undefined) =>
      Boolean(extensionBaseUrl && url?.startsWith(extensionBaseUrl));
    const refreshOnCreated = (tab: chrome.tabs.Tab) => {
      if (!isOwnExtensionUrl(tab.url || tab.pendingUrl)) {
        void coalescer.request();
      }
    };
    const refreshOnUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (isOwnExtensionUrl(changeInfo.url || tab.url || tab.pendingUrl)) return;
      if (Object.keys(changeInfo).some((key) => REFRESHABLE_TAB_CHANGES.has(key))) {
        void coalescer.request();
      }
    };

    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('focus', refreshOnFocus);
    chrome.tabs.onActivated.addListener(refreshOnTabEvent);
    chrome.tabs.onCreated.addListener(refreshOnCreated);
    chrome.tabs.onRemoved.addListener(refreshOnTabEvent);
    chrome.tabs.onMoved.addListener(refreshOnTabEvent);
    chrome.tabs.onAttached.addListener(refreshOnTabEvent);
    chrome.tabs.onDetached.addListener(refreshOnTabEvent);
    chrome.tabs.onReplaced.addListener(refreshOnTabEvent);
    chrome.tabs.onUpdated.addListener(refreshOnUpdated);
    chrome.windows.onCreated.addListener(refreshOnTabEvent);
    chrome.windows.onRemoved.addListener(refreshOnTabEvent);
    chrome.windows.onFocusChanged.addListener(refreshOnTabEvent);

    return () => {
      if (refreshCoalescerRef.current === coalescer) {
        refreshCoalescerRef.current = null;
      }
      coalescer.dispose();
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('focus', refreshOnFocus);
      chrome.tabs.onActivated.removeListener(refreshOnTabEvent);
      chrome.tabs.onCreated.removeListener(refreshOnCreated);
      chrome.tabs.onRemoved.removeListener(refreshOnTabEvent);
      chrome.tabs.onMoved.removeListener(refreshOnTabEvent);
      chrome.tabs.onAttached.removeListener(refreshOnTabEvent);
      chrome.tabs.onDetached.removeListener(refreshOnTabEvent);
      chrome.tabs.onReplaced.removeListener(refreshOnTabEvent);
      chrome.tabs.onUpdated.removeListener(refreshOnUpdated);
      chrome.windows.onCreated.removeListener(refreshOnTabEvent);
      chrome.windows.onRemoved.removeListener(refreshOnTabEvent);
      chrome.windows.onFocusChanged.removeListener(refreshOnTabEvent);
    };
  }, [performRefresh]);

  const clearSelection = useCallback(() => {
    dispatch({ type: 'selection-cleared' });
  }, [dispatch]);
  const completeDrop = useCallback(() => {
    dispatch({ type: 'drop-completed' });
  }, [dispatch]);

  const deferredQuery = useDeferredValue(workflowState.query);
  const projection = useMemo(
    () => projectOpenTabsWorkflow(workflowState, deferredQuery),
    [deferredQuery, workflowState],
  );
  const selectedWindow = projection.selectedWindow;
  const selectedStorableTabIds = projection.selection.recordIds;

  const selectWindow = useCallback((windowId: number) => {
    dispatch({ type: 'window-selected', windowId });
  }, [dispatch]);

  const toggleTabSelection = useCallback((tabId: number | undefined) => {
    if (typeof tabId !== 'number' || !Number.isSafeInteger(tabId)) return;
    dispatch({ type: 'selection-toggled', tabId });
  }, [dispatch]);

  const selectAllTabs = useCallback((tabIds?: readonly number[]) => {
    const visibleIds = tabIds ?? getSelectableOpenTabIds(
      workflowStateRef.current.windows.find((window) =>
        window.id === workflowStateRef.current.selectedWindowId) ?? null,
    );
    dispatch({ type: 'selection-visible', tabIds: [...visibleIds] });
  }, [dispatch]);

  const focusTab = useCallback(async (tabId: number | undefined, windowId: number | undefined) => {
    if (!Number.isSafeInteger(tabId) || !Number.isSafeInteger(windowId)) {
      dispatch({ type: 'operation-failed', error: 'A valid tab and window are required.' });
      return;
    }
    try {
      await sendWorkerMessage({ type: 'focus-open-tab', tabId, windowId });
    } catch (error: unknown) {
      dispatch({ type: 'operation-failed', error: errorMessage(error) });
    }
  }, [dispatch]);

  const closeTab = useCallback(async (tabId: number | undefined) => {
    if (typeof tabId !== 'number' || !Number.isSafeInteger(tabId)) {
      dispatch({ type: 'operation-failed', error: 'A valid tab ID is required' });
      return;
    }
    if (closingTabIdsRef.current.has(tabId)) return;
    const nextClosingTabIds = new Set([...closingTabIdsRef.current, tabId]);
    closingTabIdsRef.current = nextClosingTabIds;
    dispatch({ type: 'closing-changed', tabIds: [...nextClosingTabIds] });
    try {
      await sendWorkerMessage({ type: 'close-open-tab', tabId });
      await refresh();
    } catch (error: unknown) {
      dispatch({ type: 'operation-failed', error: errorMessage(error) });
    } finally {
      const remainingTabIds = new Set([...closingTabIdsRef.current].filter((id) => id !== tabId));
      closingTabIdsRef.current = remainingTabIds;
      dispatch({ type: 'closing-changed', tabIds: [...remainingTabIds] });
    }
  }, [dispatch, refresh]);

  const pinTab = useCallback(async (tabId: number | undefined) => {
    if (typeof tabId !== 'number' || !Number.isSafeInteger(tabId)) {
      dispatch({ type: 'operation-failed', error: 'A valid tab ID is required' });
      return;
    }
    try {
      await sendWorkerMessage({ type: 'pin-open-tab', tabId });
      await refresh();
    } catch (error: unknown) {
      dispatch({ type: 'operation-failed', error: errorMessage(error) });
    }
  }, [dispatch, refresh]);

  const closeSelectedTabs = useCallback(async () => {
    if (!selectedStorableTabIds.length || workflowStateRef.current.updatingSelection) return;
    const nextClosingTabIds = new Set([...closingTabIdsRef.current, ...selectedStorableTabIds]);
    closingTabIdsRef.current = nextClosingTabIds;
    dispatch({ type: 'closing-changed', tabIds: [...nextClosingTabIds] });
    dispatch({ type: 'selection-update-changed', updating: true });
    try {
      await sendWorkerMessage({ type: 'close-open-tabs', tabIds: selectedStorableTabIds });
      await refresh();
      clearSelection();
    } catch (error: unknown) {
      dispatch({ type: 'operation-failed', error: errorMessage(error) });
    } finally {
      const remainingTabIds = new Set(
        [...closingTabIdsRef.current].filter((id) => !selectedStorableTabIds.includes(id)),
      );
      closingTabIdsRef.current = remainingTabIds;
      dispatch({ type: 'closing-changed', tabIds: [...remainingTabIds] });
      dispatch({ type: 'selection-update-changed', updating: false });
    }
  }, [clearSelection, dispatch, refresh, selectedStorableTabIds]);

  const pinSelectedTabs = useCallback(async () => {
    if (!selectedStorableTabIds.length || workflowStateRef.current.updatingSelection) return;
    dispatch({ type: 'selection-update-changed', updating: true });
    try {
      await sendWorkerMessage({ type: 'pin-open-tabs', tabIds: selectedStorableTabIds });
      await refresh();
      clearSelection();
    } catch (error: unknown) {
      dispatch({ type: 'operation-failed', error: errorMessage(error) });
    } finally {
      dispatch({ type: 'selection-update-changed', updating: false });
    }
  }, [clearSelection, dispatch, refresh, selectedStorableTabIds]);

  const filterSessionsByTab = useCallback((tab: OpenTabInfo) => {
    if (tab.storable !== true || !tab.url.trim()) return;
    tabFilterUrlRef.current = tab.url;
    dispatch({ type: 'tab-filter-changed', url: tab.url });
    setSavedSearchQuery(tab.url);
  }, [dispatch, setSavedSearchQuery]);

  const clearTabFilter = useCallback(() => {
    tabFilterUrlRef.current = null;
    dispatch({ type: 'tab-filter-changed', url: null });
    setSavedSearchQuery('');
  }, [dispatch, setSavedSearchQuery]);

  const setQuery = useCallback((value: string) => {
    dispatch({ type: 'query-changed', query: value });
  }, [dispatch]);
  const clearFilter = useCallback(() => {
    dispatch({ type: 'query-changed', query: '' });
  }, [dispatch]);

  const captureTabs = useCallback(async (
    tabIds: readonly number[],
    isSelectionMode: boolean,
    categorySnapshot: CaptureCategorySnapshot,
    getCurrentCategorySnapshot: () => CaptureCategorySnapshot,
  ): Promise<CaptureCompletion | null> => {
    if (capturingRef.current) return null;

    const sourceWorkspaceId = useTabBoardStore.getState().activeWorkspaceId;
    const captureFilterSnapshot: CaptureFilterSnapshot = {
      tabFilterUrl: tabFilterUrlRef.current,
      searchQuery: savedSearchQueryStore.getSnapshot(),
    };
    const captureProjection = projectOpenTabsWorkflow(workflowStateRef.current);
    const captureSnapshot = createCaptureSnapshot({
      selectedTabIds: [...tabIds],
      selectedWindowId: captureProjection.selectedWindowId,
      workspaceId: sourceWorkspaceId,
      isSelectionMode,
    });
    if (!captureSnapshot.selectedTabIds.length) return null;

    capturingRef.current = true;
    dispatch({ type: 'capture-changed', capturing: true });
    dispatch({ type: 'error-cleared' });
    let result: CaptureResult | null = null;
    let normalizedState: TabBoardState | null = null;
    let committed = false;
    let reconciled = false;
    let captureError: string | null = null;
    let completion: CaptureCompletion | null = null;

    try {
      result = await sendWorkerMessage<CaptureResult>({
        type: 'saveSelectedTabs',
        tabIds: captureSnapshot.selectedTabIds,
        selectedWindowId: captureSnapshot.selectedWindowId ?? undefined,
        workspaceId: captureSnapshot.workspaceId,
      });
      committed = true;

      try {
        const nextState = normalizeState(await getPersistedState());
        normalizedState = nextState;
        const createdGroupIds = result.createdGroupIds.filter((groupId) =>
          nextState.groups.some((group) =>
            group.id === groupId && group.workspaceId === captureSnapshot.workspaceId,
          ),
        );
        if (createdGroupIds.length !== result.createdGroupIds.length) {
          throw new Error('Created session was not found in persisted state.');
        }
        const currentState = useTabBoardStore.getState();
        if (currentState.activeWorkspaceId === captureSnapshot.workspaceId) {
          const stateToApply = currentState.updatedAt <= nextState.updatedAt
            ? nextState
            : mergeCapturedGroups(
              currentState,
              nextState,
              createdGroupIds,
              captureSnapshot.workspaceId,
            );
          if (stateToApply !== currentState) {
             useTabBoardStore.setState(structurallyShareState(currentState, stateToApply));
          }
        }
        refreshFailureRef.current = null;
        await refresh();
        if (refreshFailureRef.current) throw refreshFailureRef.current;
        reconciled = true;
      } catch {
        dispatch({
          type: 'operation-failed',
          error: getCaptureMessage({ committed: true, reconciled: false }),
        });
      }
    } catch (error: unknown) {
      captureError = errorMessage(error);
      dispatch({ type: 'operation-failed', error: captureError });
      try {
        refreshFailureRef.current = null;
        await refresh();
      } finally {
        dispatch({ type: 'operation-failed', error: captureError });
      }
    } finally {
      const activeWorkspaceId = useTabBoardStore.getState().activeWorkspaceId;
      const currentProjection = projectOpenTabsWorkflow(workflowStateRef.current);
      const currentSelection: OpenTabsCaptureSnapshot = createCaptureSnapshot({
        selectedTabIds: currentProjection.selection.ids,
        selectedWindowId: currentProjection.selectedWindowId,
        workspaceId: activeWorkspaceId,
        isSelectionMode: isSelectionMode,
      });
      const selectionCurrent = !captureSnapshot.isSelectionMode || (
        sameOpenTabSelection(
          captureSnapshot.selectedTabIds,
          currentSelection.selectedTabIds,
        ) && sameCaptureSnapshot(captureSnapshot, currentSelection)
      );
      const outcome = getCaptureOutcome({ committed, reconciled, selectionCurrent });
      if (outcome.shouldClearSelection) {
        dispatch({ type: 'selection-cleared' });
      }
      const currentFilterSnapshot: CaptureFilterSnapshot = {
        tabFilterUrl: tabFilterUrlRef.current,
        searchQuery: savedSearchQueryStore.getSnapshot(),
      };
      const filterCurrent = sameCaptureFilterSnapshot(captureFilterSnapshot, currentFilterSnapshot);
      const categoryCurrent = sameCaptureCategorySnapshot(
        categorySnapshot,
        getCurrentCategorySnapshot(),
      );
      const canReveal = Boolean(
        outcome.shouldReveal
        && result
        && canRevealCapture({
          sourceWorkspaceId: captureSnapshot.workspaceId,
          activeWorkspaceId,
          createdGroupIds: result.createdGroupIds,
          categoryCurrent,
          filterCurrent,
        }),
      );
      if (canReveal && result) {
        const isCaptureTabFilterCurrent = tabFilterUrlRef.current === captureFilterSnapshot.tabFilterUrl;
        if (isCaptureTabFilterCurrent) {
          tabFilterUrlRef.current = null;
          dispatch({ type: 'tab-filter-changed', url: null });
          if (captureFilterSnapshot.tabFilterUrl && currentFilterSnapshot.searchQuery === captureFilterSnapshot.tabFilterUrl) {
            setSavedSearchQuery('');
          }
        }
        const createdGroup = normalizedState?.groups.find((group) => group.id === result?.createdGroupIds[0]);
        if (
          currentFilterSnapshot.searchQuery === captureFilterSnapshot.searchQuery
          && captureFilterSnapshot.searchQuery
          && createdGroup
          && !groupMatchesQuery(createdGroup, captureFilterSnapshot.searchQuery)
        ) {
          setSavedSearchQuery('');
        }
      }
      const targetCategorySnapshot: CaptureCategorySnapshot = {
        showBin: false,
        category: 'inbox',
      };
      const targetFilterSnapshot: CaptureFilterSnapshot = {
        tabFilterUrl: tabFilterUrlRef.current,
        searchQuery: savedSearchQueryStore.getSnapshot(),
      };
      const message = captureError || getCaptureMessage({ committed, reconciled });
      completion = {
        sourceWorkspaceId: captureSnapshot.workspaceId,
        activeWorkspaceId,
        categorySnapshot: { ...categorySnapshot },
        filterCurrent,
        targetCategorySnapshot: { ...targetCategorySnapshot },
        targetFilterSnapshot: { ...targetFilterSnapshot },
        createdGroupIds: result?.createdGroupIds ?? [],
        committed,
        reconciled,
        selectionCurrent,
        result,
        message,
      };
      capturingRef.current = false;
      dispatch({ type: 'capture-changed', capturing: false });
    }
    return completion;
  }, [dispatch, refresh, setSavedSearchQuery]);

  const captureSelectedTabs = useCallback((
    categorySnapshot: CaptureCategorySnapshot,
    getCurrentCategorySnapshot: () => CaptureCategorySnapshot,
  ) => {
    const captureProjection = projectOpenTabsWorkflow(workflowStateRef.current);
    return captureTabs(
      captureProjection.selection.recordIds,
      true,
      categorySnapshot,
      getCurrentCategorySnapshot,
    );
  }, [captureTabs]);

  const captureWindow = useCallback((
    categorySnapshot: CaptureCategorySnapshot,
    getCurrentCategorySnapshot: () => CaptureCategorySnapshot,
  ) => {
    const captureProjection = projectOpenTabsWorkflow(workflowStateRef.current);
    return captureTabs(
      getSelectableOpenTabIds(captureProjection.selectedWindow),
      false,
      categorySnapshot,
      getCurrentCategorySnapshot,
    );
  }, [captureTabs]);

  return {
    model: {
      ...projection,
      isTabFilterActive: Boolean(projection.tabFilterUrl)
        && savedSearchQuery === projection.tabFilterUrl,
    },
    commands: {
      setQuery,
      selectWindow,
      clearSelection,
      toggleSelection: toggleTabSelection,
      selectAll: selectAllTabs,
      completeDrop,
      focusTab,
      closeTab,
      pinTab,
      closeSelection: closeSelectedTabs,
      pinSelection: pinSelectedTabs,
      filterSessionsByTab,
      clearSessionFilter: clearTabFilter,
      clearQuery: clearFilter,
      captureSelection: captureSelectedTabs,
      captureWindow,
      refresh,
    },
  };
}
