import {
  isOwnedCategory,
  type CategoryFilter,
} from '../../shared/model/categories';
import type { TabBoardState } from '../../shared/model/types';

export type ManagerView = 'board' | 'bin';

export interface ManagerPageState {
  workspaceId: string;
  category: CategoryFilter;
  view: ManagerView;
  query: string;
}

type ValidationState = Pick<
  TabBoardState,
  'activeWorkspaceId' | 'workspaces' | 'folders'
>;

function categoryFromParam(value: string | null): CategoryFilter {
  if (value === 'saved' || value === 'archive' || value === 'inbox') return value;
  return value?.startsWith('folder:') ? value as CategoryFilter : 'inbox';
}

export function parseManagerPageState(search: string): ManagerPageState {
  const params = new URLSearchParams(search);
  return {
    workspaceId: params.get('workspace') || '',
    category: categoryFromParam(params.get('category')),
    view: params.get('view') === 'bin' ? 'bin' : 'board',
    query: params.get('q') || '',
  };
}

export function validateManagerPageState(
  candidate: ManagerPageState,
  state: ValidationState,
): ManagerPageState {
  const workspaceId = state.workspaces.some(({ id }) => id === candidate.workspaceId)
    ? candidate.workspaceId
    : state.workspaces.some(({ id }) => id === state.activeWorkspaceId)
      ? state.activeWorkspaceId
      : state.workspaces[0]?.id ?? state.activeWorkspaceId;
  const category = isOwnedCategory(state, candidate.category, workspaceId)
    ? candidate.category
    : 'inbox';
  return {
    workspaceId,
    category,
    view: candidate.view,
    query: candidate.query,
  };
}

export function serializeManagerPageState(state: ManagerPageState): string {
  const params = new URLSearchParams();
  if (state.workspaceId) params.set('workspace', state.workspaceId);
  params.set('category', state.category);
  params.set('view', state.view);
  if (state.query) params.set('q', state.query);
  return params.toString();
}
