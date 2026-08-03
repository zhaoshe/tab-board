import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TabBoardState } from '../../shared/model/types';
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
  type ManagerPageState,
} from '../core/managerPageState';
import {
  savedSearchQueryStore,
  useSearchQuery,
} from './useSearchQuery';

type ValidationState = Pick<
  TabBoardState,
  | 'activeWorkspaceId'
  | 'workspaces'
  | 'folders'
  | 'groups'
  | 'categoryOrderByWorkspace'
>;

type NavigationUpdate = Partial<Omit<ManagerPageState, 'query'>>;

export interface ManagerPageStateController {
  state: ManagerPageState;
  navigate(update: NavigationUpdate): void;
  replace(update: NavigationUpdate): void;
  setQuery(query: string): void;
}

function currentUrl(search: string): string {
  return `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
}

export function useManagerPageState(
  validationState: ValidationState,
): ManagerPageStateController {
  const [navigationState, setNavigationState] = useState(() => {
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
  navigationStateRef.current = navigationState;
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
    const current = navigationStateRef.current;
    const nextWorkspaceId = update.workspaceId ?? current.workspaceId;
    const category = update.workspaceId && update.category === undefined
      ? chooseInitialCategory(
        validationState,
        nextWorkspaceId,
        readCategoryPreference(nextWorkspaceId),
      )
      : update.category;
    const next = validateManagerPageState({
      ...current,
      ...update,
      ...(category ? { category } : {}),
      query: savedSearchQueryStore.getSnapshot(),
    }, validationState);
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
  }, [validationState, write]);

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
        validationState,
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
  }, [validationState]);

  useEffect(() => {
    const next = validateManagerPageState(state, validationState);
    if (
      next.workspaceId !== state.workspaceId
      || next.category !== state.category
    ) {
      const projected = {
        workspaceId: next.workspaceId,
        category: next.category,
        view: next.view,
      };
      navigationStateRef.current = projected;
      setNavigationState(projected);
      write('replaceState', next);
    }
  }, [state, validationState, write]);

  useEffect(() => {
    write('replaceState', state);
  }, [query, state, write]);

  return useMemo(
    () => ({ state, navigate, replace, setQuery }),
    [navigate, replace, setQuery, state],
  );
}
