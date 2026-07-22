import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchQuery, useSetSearchQuery } from './useFilteredGroups';
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
  resolveSelectedWindow,
  sameOpenTabSelection,
  type OpenTabInfo,
  type OpenWindowInfo,
} from '../core/open-tabs';
import { groupMatchesQuery, normalizeState, type TabBoardState } from '../../shared/model';
import { getState as getPersistedState } from '../../shared/store/chromeStorage';
import { useTabBoardStore } from '../../shared/store/useTabBoardStore';

export const CAPTURE_COMPLETED_EVENT = 'tabboard-capture-completed';
const TAB_FILTER_CHANGE_EVENT = 'tabboard-tab-filter-change';
let globalTabFilterUrl: string | null = null;

function setGlobalTabFilterUrl(value: string | null): void {
  if (globalTabFilterUrl === value) return;
  globalTabFilterUrl = value;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<string | null>(TAB_FILTER_CHANGE_EVENT, { detail: value }));
  }
}

export function useTabFilterUrl(): string | null {
  const [value, setValue] = useState<string | null>(globalTabFilterUrl);

  useEffect(() => {
    const handleChange = (event: Event) => {
      setValue((event as CustomEvent<string | null>).detail);
    };
    window.addEventListener(TAB_FILTER_CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(TAB_FILTER_CHANGE_EVENT, handleChange);
  }, []);

  return value;
}

export interface CaptureCompletedEventDetail {
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

export interface CaptureResult {
  storedTabs: number;
  storedGroups: number;
  cleanedDuplicates: number;
  createdGroupIds: string[];
}

interface WorkerResponse<T> {
  ok?: boolean;
  result?: T;
  error?: unknown;
}

export interface OpenTabsRuntime {
  windows: OpenWindowInfo[];
  selectedWindow: OpenWindowInfo | null;
  selectedWindowId: number | null;
  query: string;
  filteredTabs: OpenTabInfo[];
  selectionMode: boolean;
  selectedTabIds: number[];
  selectedCount: number;
  closingTabIds: number[];
  updatingSelection: boolean;
  loading: boolean;
  capturing: boolean;
  error: string | null;
  isTabFilterActive: boolean;
  setQuery: (value: string) => void;
  selectWindow: (windowId: number) => void;
  exitSelectionMode: () => void;
  toggleTabSelection: (tabId: number | undefined) => void;
  selectAllTabs: () => void;
  focusTab: (tabId: number | undefined, windowId: number | undefined) => Promise<void>;
  closeTab: (tabId: number | undefined) => Promise<void>;
  pinTab: (tabId: number | undefined) => Promise<void>;
  closeSelectedTabs: () => Promise<void>;
  pinSelectedTabs: () => Promise<void>;
  filterSessionsByTab: (tab: OpenTabInfo) => void;
  clearTabFilter: () => void;
  clearFilter: () => void;
  captureSelectedTabs: (
    categorySnapshot: CaptureCategorySnapshot,
    getCurrentCategorySnapshot: () => CaptureCategorySnapshot,
  ) => Promise<CaptureResult | null>;
  refresh: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || 'Unable to update open tabs.');
}

function isSafeTabId(tabId: number | undefined): tabId is number {
  return Number.isSafeInteger(tabId);
}

async function sendWorkerMessage<T>(message: Record<string, unknown>): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as WorkerResponse<T> | undefined;
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

export function useOpenTabsRuntime(): OpenTabsRuntime {
  const [windows, setWindows] = useState<OpenWindowInfo[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [updatingSelection, setUpdatingSelection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabFilterUrl, setTabFilterUrl] = useState<string | null>(null);
  const selectedWindowIdRef = useRef<number | null>(null);
  const selectedTabIdsRef = useRef<number[]>([]);
  const selectionModeRef = useRef(false);
  const capturingRef = useRef(false);
  const currentWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);
  const previousWorkspaceIdRef = useRef(currentWorkspaceId);
  const refreshFailureRef = useRef<unknown | null>(null);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const refreshQueued = useRef<Promise<void> | null>(null);
  const closingTabIdsRef = useRef<Set<number>>(new Set());
  const [closingTabIds, setClosingTabIds] = useState<number[]>([]);
  const savedSearchQuery = useSearchQuery();
  const setSavedSearchQuery = useSetSearchQuery();
  const savedSearchQueryRef = useRef(savedSearchQuery);
  const tabFilterUrlRef = useRef(tabFilterUrl);

  useEffect(() => {
    selectedWindowIdRef.current = selectedWindowId;
  }, [selectedWindowId]);

  useEffect(() => {
    savedSearchQueryRef.current = savedSearchQuery;
    if (tabFilterUrlRef.current && savedSearchQuery !== tabFilterUrlRef.current) {
      tabFilterUrlRef.current = null;
      setTabFilterUrl(null);
      setGlobalTabFilterUrl(null);
    }
  }, [savedSearchQuery]);

  useEffect(() => {
    tabFilterUrlRef.current = tabFilterUrl;
    setGlobalTabFilterUrl(tabFilterUrl);
  }, [tabFilterUrl]);

  useEffect(() => {
    const previousWorkspaceId = previousWorkspaceIdRef.current;
    if (previousWorkspaceId !== currentWorkspaceId) {
      const previousTabFilterUrl = tabFilterUrlRef.current;
      if (previousTabFilterUrl) {
        tabFilterUrlRef.current = null;
        setTabFilterUrl(null);
        setGlobalTabFilterUrl(null);
        if (savedSearchQueryRef.current === previousTabFilterUrl) {
          savedSearchQueryRef.current = '';
          setSavedSearchQuery('');
        }
      }
      previousWorkspaceIdRef.current = currentWorkspaceId;
    }
  }, [currentWorkspaceId, setSavedSearchQuery]);

  useEffect(() => {
    selectedTabIdsRef.current = [...selectedTabIds];
  }, [selectedTabIds]);

  useEffect(() => {
    selectionModeRef.current = selectionMode;
  }, [selectionMode]);

  const refresh = useCallback((): Promise<void> => {
    if (refreshInFlight.current) {
      if (!refreshQueued.current) {
        refreshQueued.current = refreshInFlight.current.then(() => {
          refreshInFlight.current = null;
          const latest = refresh();
          return latest.finally(() => {
            refreshQueued.current = null;
          });
        });
      }
      return refreshQueued.current;
    }

    const run = (async () => {
      setLoading(true);
      setError(null);
      refreshFailureRef.current = null;
      try {
        const result = await sendWorkerMessage<{ windows: OpenWindowInfo[] }>({ type: 'list-open-tabs' });
        const nextWindows = Array.isArray(result.windows) ? result.windows : [];
        const previousWindowId = selectedWindowIdRef.current;
        const nextSelectedWindow = resolveSelectedWindow(nextWindows, previousWindowId);
        const nextSelectedWindowId = nextSelectedWindow?.id ?? null;
        const allowedIds = new Set(getSelectableOpenTabIds(nextSelectedWindow));

        setWindows(nextWindows);
        selectedWindowIdRef.current = nextSelectedWindowId;
        setSelectedWindowId(nextSelectedWindowId);
        setSelectedTabIds((current) => {
          const next = previousWindowId === nextSelectedWindowId
            ? current.filter((id) => allowedIds.has(id))
            : [];
          selectedTabIdsRef.current = next;
          return next;
        });
      } catch (error: unknown) {
        refreshFailureRef.current = error;
        setError(errorMessage(error));
      } finally {
        setLoading(false);
      }
    })();

    refreshInFlight.current = run;
    void run.finally(() => {
      if (refreshInFlight.current === run) {
        refreshInFlight.current = null;
      }
    });
    return run;
  }, []);

  useEffect(() => {
    void refresh();

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const refreshOnFocus = () => void refresh();
    const refreshOnTabEvent = () => void refresh();
    const refreshOnUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (Object.keys(changeInfo).some((key) => REFRESHABLE_TAB_CHANGES.has(key))) {
        void refresh();
      }
    };

    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('focus', refreshOnFocus);
    chrome.tabs.onActivated.addListener(refreshOnTabEvent);
    chrome.tabs.onCreated.addListener(refreshOnTabEvent);
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
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('focus', refreshOnFocus);
      chrome.tabs.onActivated.removeListener(refreshOnTabEvent);
      chrome.tabs.onCreated.removeListener(refreshOnTabEvent);
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
  }, [refresh]);

  const exitSelectionMode = useCallback(() => {
    selectionModeRef.current = false;
    setSelectionMode(false);
    selectedTabIdsRef.current = [];
    setSelectedTabIds([]);
  }, []);

  useEffect(() => {
    const handleOpenTabsDropped = () => {
      exitSelectionMode();
    };
    window.addEventListener('tabboard-open-tabs-dropped', handleOpenTabsDropped);
    return () => window.removeEventListener('tabboard-open-tabs-dropped', handleOpenTabsDropped);
  }, [exitSelectionMode]);

  const selectedWindow = useMemo(
    () => resolveSelectedWindow(windows, selectedWindowId),
    [windows, selectedWindowId],
  );
  const filteredTabs = useMemo(
    () => filterOpenTabs(selectedWindow?.tabs ?? [], query),
    [query, selectedWindow],
  );

  const selectWindow = useCallback((windowId: number) => {
    if (!windows.some((window) => !window.incognito && window.id === windowId)) return;
    selectedWindowIdRef.current = windowId;
    setSelectedWindowId(windowId);
    selectionModeRef.current = false;
    setSelectionMode(false);
    selectedTabIdsRef.current = [];
    setSelectedTabIds([]);
  }, [windows]);

  const toggleTabSelection = useCallback((tabId: number | undefined) => {
    if (typeof tabId !== 'number' || !Number.isSafeInteger(tabId) || !selectedWindow) return;
    const canSelect = selectedWindow.tabs.some((tab) =>
      tab.id === tabId && tab.storable === true && !tab.pinned,
    );
    if (!canSelect) return;
    setSelectedTabIds((current) => {
      const next = current.includes(tabId)
        ? current.filter((id) => id !== tabId)
        : [...current, tabId];
      selectedTabIdsRef.current = next;
      selectionModeRef.current = next.length > 0;
      setSelectionMode(next.length > 0);
      return next;
    });
  }, [selectedWindow]);

  const selectAllTabs = useCallback(() => {
    if (!selectedWindow) return;
    const allStorableIds = getSelectableOpenTabIds(selectedWindow);
    if (!allStorableIds.length) return;
    selectedTabIdsRef.current = allStorableIds;
    setSelectedTabIds(allStorableIds);
    selectionModeRef.current = true;
    setSelectionMode(true);
  }, [selectedWindow]);

  const focusTab = useCallback(async (tabId: number | undefined, windowId: number | undefined) => {
    if (!Number.isSafeInteger(tabId) || !Number.isSafeInteger(windowId)) {
      setError('A valid tab and window are required.');
      return;
    }
    try {
      await sendWorkerMessage({ type: 'focus-open-tab', tabId, windowId });
    } catch (error: unknown) {
      setError(errorMessage(error));
    }
  }, []);

  const closeTab = useCallback(async (tabId: number | undefined) => {
    if (typeof tabId !== 'number' || !Number.isSafeInteger(tabId)) {
      setError('A valid tab ID is required');
      return;
    }
    if (closingTabIdsRef.current.has(tabId)) return;
    const nextClosingTabIds = new Set([...closingTabIdsRef.current, tabId]);
    closingTabIdsRef.current = nextClosingTabIds;
    setClosingTabIds([...nextClosingTabIds]);
    try {
      await sendWorkerMessage({ type: 'close-open-tab', tabId });
      await refresh();
    } catch (error: unknown) {
      setError(errorMessage(error));
    } finally {
      const remainingTabIds = new Set([...closingTabIdsRef.current].filter((id) => id !== tabId));
      closingTabIdsRef.current = remainingTabIds;
      setClosingTabIds([...remainingTabIds]);
    }
  }, [refresh]);

  const pinTab = useCallback(async (tabId: number | undefined) => {
    if (typeof tabId !== 'number' || !Number.isSafeInteger(tabId)) {
      setError('A valid tab ID is required');
      return;
    }
    try {
      await sendWorkerMessage({ type: 'pin-open-tab', tabId });
      await refresh();
    } catch (error: unknown) {
      setError(errorMessage(error));
    }
  }, [refresh]);

  const selectedStorableTabIds = useMemo(() => (
    (selectedWindow?.tabs ?? [])
      .flatMap((tab) => (
        tab.storable && !tab.pinned && isSafeTabId(tab.id) && selectedTabIds.includes(tab.id)
          ? [tab.id]
          : []
      ))
  ), [selectedTabIds, selectedWindow]);

  const closeSelectedTabs = useCallback(async () => {
    if (!selectedStorableTabIds.length || updatingSelection) return;
    const nextClosingTabIds = new Set([...closingTabIdsRef.current, ...selectedStorableTabIds]);
    closingTabIdsRef.current = nextClosingTabIds;
    setClosingTabIds([...nextClosingTabIds]);
    setUpdatingSelection(true);
    try {
      await sendWorkerMessage({ type: 'close-open-tabs', tabIds: selectedStorableTabIds });
      await refresh();
      exitSelectionMode();
    } catch (error: unknown) {
      setError(errorMessage(error));
    } finally {
      const remainingTabIds = new Set(
        [...closingTabIdsRef.current].filter((id) => !selectedStorableTabIds.includes(id)),
      );
      closingTabIdsRef.current = remainingTabIds;
      setClosingTabIds([...remainingTabIds]);
      setUpdatingSelection(false);
    }
  }, [exitSelectionMode, refresh, selectedStorableTabIds, updatingSelection]);

  const pinSelectedTabs = useCallback(async () => {
    if (!selectedStorableTabIds.length || updatingSelection) return;
    setUpdatingSelection(true);
    try {
      await sendWorkerMessage({ type: 'pin-open-tabs', tabIds: selectedStorableTabIds });
      await refresh();
      exitSelectionMode();
    } catch (error: unknown) {
      setError(errorMessage(error));
    } finally {
      setUpdatingSelection(false);
    }
  }, [exitSelectionMode, refresh, selectedStorableTabIds, updatingSelection]);

  const filterSessionsByTab = useCallback((tab: OpenTabInfo) => {
    if (tab.storable !== true || !tab.url.trim()) return;
    tabFilterUrlRef.current = tab.url;
    setTabFilterUrl(tab.url);
    setGlobalTabFilterUrl(tab.url);
    setSavedSearchQuery(tab.url);
  }, [setSavedSearchQuery]);

  const clearTabFilter = useCallback(() => {
    tabFilterUrlRef.current = null;
    setTabFilterUrl(null);
    setGlobalTabFilterUrl(null);
    setSavedSearchQuery('');
  }, [setSavedSearchQuery]);

  const clearFilter = useCallback(() => setQuery(''), []);

  const captureSelectedTabs = useCallback(async (
    categorySnapshot: CaptureCategorySnapshot,
    getCurrentCategorySnapshot: () => CaptureCategorySnapshot,
  ): Promise<CaptureResult | null> => {
    if (capturingRef.current) return null;

    const sourceWorkspaceId = useTabBoardStore.getState().activeWorkspaceId;
    const captureFilterSnapshot: CaptureFilterSnapshot = {
      tabFilterUrl: tabFilterUrlRef.current,
      searchQuery: savedSearchQueryRef.current,
    };
    const captureSnapshot = createCaptureSnapshot({
      selectedTabIds: (selectedWindow?.tabs ?? [])
        .filter((tab) => tab.storable === true && !tab.pinned && Number.isSafeInteger(tab.id) && selectedTabIds.includes(tab.id as number))
        .map((tab) => tab.id as number)
        .sort((left, right) => left - right),
      selectedWindowId: selectedWindow?.id ?? null,
      workspaceId: sourceWorkspaceId,
      isSelectionMode: selectionMode,
    });
    if (!captureSnapshot.selectedTabIds.length) return null;

    capturingRef.current = true;
    setCapturing(true);
    setError(null);
    let result: CaptureResult | null = null;
    let normalizedState: TabBoardState | null = null;
    let committed = false;
    let reconciled = false;
    let captureError: string | null = null;

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
            useTabBoardStore.setState(stateToApply);
          }
        }
        refreshFailureRef.current = null;
        await refresh();
        if (refreshFailureRef.current) throw refreshFailureRef.current;
        reconciled = true;
      } catch {
        setError(getCaptureMessage({ committed: true, reconciled: false }));
      }
    } catch (error: unknown) {
      captureError = errorMessage(error);
      setError(captureError);
      try {
        refreshFailureRef.current = null;
        await refresh();
      } finally {
        setError(captureError);
      }
    } finally {
      const activeWorkspaceId = useTabBoardStore.getState().activeWorkspaceId;
      const currentSelection: OpenTabsCaptureSnapshot = createCaptureSnapshot({
        selectedTabIds: selectedTabIdsRef.current,
        selectedWindowId: selectedWindowIdRef.current,
        workspaceId: activeWorkspaceId,
        isSelectionMode: selectionModeRef.current,
      });
      const selectionCurrent = sameOpenTabSelection(
        captureSnapshot.selectedTabIds,
        currentSelection.selectedTabIds,
      ) && sameCaptureSnapshot(captureSnapshot, currentSelection);
      const outcome = getCaptureOutcome({ committed, reconciled, selectionCurrent });
      if (outcome.shouldClearSelection) {
        selectionModeRef.current = false;
        setSelectionMode(false);
        selectedTabIdsRef.current = [];
        setSelectedTabIds([]);
      }
      const currentFilterSnapshot: CaptureFilterSnapshot = {
        tabFilterUrl: tabFilterUrlRef.current,
        searchQuery: savedSearchQueryRef.current,
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
          setTabFilterUrl(null);
          setGlobalTabFilterUrl(null);
          if (captureFilterSnapshot.tabFilterUrl && currentFilterSnapshot.searchQuery === captureFilterSnapshot.tabFilterUrl) {
            savedSearchQueryRef.current = '';
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
          savedSearchQueryRef.current = '';
          setSavedSearchQuery('');
        }
      }
      const targetCategorySnapshot: CaptureCategorySnapshot = {
        showBin: false,
        category: 'inbox',
      };
      const targetFilterSnapshot: CaptureFilterSnapshot = {
        tabFilterUrl: tabFilterUrlRef.current,
        searchQuery: savedSearchQueryRef.current,
      };
      const message = captureError || getCaptureMessage({ committed, reconciled });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<CaptureCompletedEventDetail>(CAPTURE_COMPLETED_EVENT, {
          detail: {
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
          },
        }));
      }
      capturingRef.current = false;
      setCapturing(false);
    }
    return result;
  }, [refresh, selectedTabIds, selectedWindow, selectionMode, setSavedSearchQuery]);

  return {
    windows,
    selectedWindow,
    selectedWindowId,
    query,
    filteredTabs,
    selectionMode,
    selectedTabIds,
    selectedCount: selectedTabIds.length,
    closingTabIds,
    updatingSelection,
    loading,
    capturing,
    error,
    isTabFilterActive: Boolean(tabFilterUrl) && savedSearchQuery === tabFilterUrl,
    setQuery,
    selectWindow,
    exitSelectionMode,
    toggleTabSelection,
    selectAllTabs,
    focusTab,
    closeTab,
    pinTab,
    closeSelectedTabs,
    pinSelectedTabs,
    filterSessionsByTab,
    clearTabFilter,
    clearFilter,
    captureSelectedTabs,
    refresh,
  };
}
