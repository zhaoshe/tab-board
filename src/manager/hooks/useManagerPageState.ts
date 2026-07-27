import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { TabBoardState } from '../../shared/model/types';
import {
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
  'activeWorkspaceId' | 'workspaces' | 'folders'
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
    const validated = validateManagerPageState(
      parseManagerPageState(window.location.search),
      validationState,
    );
    savedSearchQueryStore.set(validated.query);
    return {
      workspaceId: validated.workspaceId,
      category: validated.category,
      view: validated.view,
    };
  });
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
    setNavigationState((current) => {
      const next = validateManagerPageState({
        ...current,
        ...update,
        query: savedSearchQueryStore.getSnapshot(),
      }, validationState);
      write(method, next);
      return {
        workspaceId: next.workspaceId,
        category: next.category,
        view: next.view,
      };
    });
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
      ...navigationState,
      query: nextQuery,
    };
    write('replaceState', next);
  }, [navigationState, write]);

  useEffect(() => {
    const onPopState = () => {
      const next = validateManagerPageState(
        parseManagerPageState(window.location.search),
        validationState,
      );
      setNavigationState({
        workspaceId: next.workspaceId,
        category: next.category,
        view: next.view,
      });
      savedSearchQueryStore.set(next.query);
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
      setNavigationState({
        workspaceId: next.workspaceId,
        category: next.category,
        view: next.view,
      });
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
