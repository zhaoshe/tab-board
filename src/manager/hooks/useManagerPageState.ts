import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTabBoardStore } from '../../shared/store/useTabBoardStore';
import { logWarning } from '../../shared/utils/diagnostics';
import {
  chooseInitialCategory,
  readCategoryPreference,
  writeCategoryPreference,
} from '../core/managerNavigationPreference';
import {
  hasExplicitManagerPageState,
  parseManagerPageState,
  serializeManagerPageState,
  validateManagerPageState,
  shouldSyncActiveWorkspace,
  type ManagerPageState,
} from '../core/managerPageState';
import {
  savedSearchQueryStore,
  useSearchQuery,
} from './useSearchQuery';

type NavigationUpdate = Partial<Omit<ManagerPageState, 'query'>>;

export interface ManagerPageStateController {
  state: ManagerPageState;
  navigate(update: NavigationUpdate): void;
  replace(update: NavigationUpdate): void;
  restoreBackup(text: string, expectedRevision: number): Promise<void>;
  setQuery(query: string): void;
}

function currentUrl(search: string): string {
  return `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
}

export function useManagerPageState(): ManagerPageStateController {
  const activeWorkspaceId = useTabBoardStore(state => state.activeWorkspaceId);
  const workspaces = useTabBoardStore(state => state.workspaces);
  const folders = useTabBoardStore(state => state.folders);
  const groups = useTabBoardStore(state => state.groups);
  const categoryOrderByWorkspace = useTabBoardStore(state => state.categoryOrderByWorkspace);
  const restorePendingRef = useRef(false);
  const [navigationState, setNavigationState] = useState(() => {
    const validationState = useTabBoardStore.getState();
    let validated = validateManagerPageState(
      parseManagerPageState(window.location.search),
      validationState,
    );
    if (!hasExplicitManagerPageState(window.location.search)) {
      validated = {
        ...validated,
        category: chooseInitialCategory(
          validationState,
          validated.workspaceId,
          readCategoryPreference(validated.workspaceId),
        ),
      };
    }
    savedSearchQueryStore.set(validated.query);
    return {
      workspaceId: validated.workspaceId,
      category: validated.category,
      view: validated.view,
    };
  });
  const navigationStateRef = useRef(navigationState);
  const query = useSearchQuery();
  const state = useMemo<ManagerPageState>(() => ({
    ...navigationState,
    query,
  }), [navigationState, query]);

  const write = useCallback((
    method: 'pushState' | 'replaceState',
    next: ManagerPageState,
  ) => {
    const params = new URLSearchParams(window.location.search);
    for (const key of ['workspace', 'category', 'view', 'q']) params.delete(key);
    const managed = new URLSearchParams(serializeManagerPageState(next));
    managed.forEach((value, key) => params.set(key, value));
    window.history[method](window.history.state, '', currentUrl(params.toString()));
  }, []);

  const updateNavigation = useCallback((
    update: NavigationUpdate,
    method: 'pushState' | 'replaceState',
  ) => {
    const currentValidationState = useTabBoardStore.getState();
    const current = navigationStateRef.current;
    const nextWorkspaceId = update.workspaceId ?? current.workspaceId;
    const category = update.workspaceId && update.category === undefined
      ? chooseInitialCategory(
        currentValidationState,
        nextWorkspaceId,
        readCategoryPreference(nextWorkspaceId),
      )
      : update.category;
    const next = validateManagerPageState({
      ...current,
      ...update,
      ...(category ? { category } : {}),
      query: savedSearchQueryStore.getSnapshot(),
    }, currentValidationState);
    const projected = {
      workspaceId: next.workspaceId,
      category: next.category,
      view: next.view,
    };
    navigationStateRef.current = projected;
    setNavigationState(projected);
    write(method, next);
    if (next.view === 'board') {
      writeCategoryPreference(next.workspaceId, next.category);
    }
  }, [write]);

  const navigate = useCallback((update: NavigationUpdate) => {
    updateNavigation(update, 'pushState');
  }, [updateNavigation]);
  const replace = useCallback((update: NavigationUpdate) => {
    updateNavigation(update, 'replaceState');
  }, [updateNavigation]);
  const setQuery = useCallback((nextQuery: string) => {
    savedSearchQueryStore.set(nextQuery);
    const next = {
      ...navigationStateRef.current,
      query: nextQuery,
    };
    write('replaceState', next);
  }, [write]);

  useEffect(() => {
    const onPopState = () => {
      const next = validateManagerPageState(
        parseManagerPageState(window.location.search),
        useTabBoardStore.getState(),
      );
      const projected = {
        workspaceId: next.workspaceId,
        category: next.category,
        view: next.view,
      };
      navigationStateRef.current = projected;
      setNavigationState(projected);
      savedSearchQueryStore.set(next.query);
      if (next.view === 'board') {
        writeCategoryPreference(next.workspaceId, next.category);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const syncActiveWorkspace = useCallback(() => {
    if (restorePendingRef.current) return;
    const current = useTabBoardStore.getState();
    const workspaceId = navigationStateRef.current.workspaceId;
    if (shouldSyncActiveWorkspace(workspaceId, current.activeWorkspaceId, current.workspaces)) {
      current.setActiveWorkspace(workspaceId);
    }
  }, []);

  const restoreBackup = useCallback(async (text: string, expectedRevision: number) => {
    restorePendingRef.current = true;
    try {
      await useTabBoardStore.getState().restoreBackup(text, expectedRevision);
      updateNavigation({ workspaceId: useTabBoardStore.getState().activeWorkspaceId, view: 'board' }, 'replaceState');
      restorePendingRef.current = false;
    } catch (error) {
      restorePendingRef.current = false;
      try {
        syncActiveWorkspace();
      } catch (syncError) {
        logWarning('manager-navigation', 'Workspace reconciliation failed after restore', String(syncError));
      }
      throw error;
    }
  }, [syncActiveWorkspace, updateNavigation]);

  useEffect(() => {
    if (restorePendingRef.current) return;
    const current = { ...navigationStateRef.current, query: savedSearchQueryStore.getSnapshot() };
    const next = validateManagerPageState(current, useTabBoardStore.getState());
    if (next.workspaceId !== current.workspaceId || next.category !== current.category) {
      const projected = { workspaceId: next.workspaceId, category: next.category, view: next.view };
      navigationStateRef.current = projected;
      setNavigationState(projected);
      write('replaceState', next);
    }
  }, [navigationState, activeWorkspaceId, workspaces, folders, groups, categoryOrderByWorkspace, write]);

  useEffect(syncActiveWorkspace, [activeWorkspaceId, workspaces, navigationState, syncActiveWorkspace]);

  useEffect(() => {
    write('replaceState', { ...navigationStateRef.current, query: savedSearchQueryStore.getSnapshot() });
  }, [query, navigationState, write]);

  return useMemo(
    () => ({ state, navigate, replace, setQuery, restoreBackup }),
    [navigate, replace, setQuery, restoreBackup, state],
  );
}
