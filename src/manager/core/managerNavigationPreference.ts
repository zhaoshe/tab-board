import {
  categoryOrder,
  groupsForCategory,
  isOwnedCategory,
  type CategoryFilter,
} from '../../shared/model/categories';
import type { TabBoardState } from '../../shared/model/types';

export const MANAGER_CATEGORY_PREFERENCE_KEY =
  'tabboard.managerCategoryPreference';

type PreferenceState = {
  version: 1;
  byWorkspace: Record<string, CategoryFilter>;
};

type CategoryState = Pick<
  TabBoardState,
  'folders' | 'groups' | 'categoryOrderByWorkspace'
>;

function emptyPreference(): PreferenceState {
  return { version: 1, byWorkspace: {} };
}

function readPreferenceState(): PreferenceState {
  try {
    const raw = localStorage.getItem(MANAGER_CATEGORY_PREFERENCE_KEY);
    if (!raw) return emptyPreference();
    const parsed = JSON.parse(raw) as Partial<PreferenceState>;
    if (
      parsed.version !== 1
      || !parsed.byWorkspace
      || typeof parsed.byWorkspace !== 'object'
      || Array.isArray(parsed.byWorkspace)
    ) {
      return emptyPreference();
    }
    return {
      version: 1,
      byWorkspace: parsed.byWorkspace,
    };
  } catch {
    return emptyPreference();
  }
}

export function readCategoryPreference(
  workspaceId: string,
): CategoryFilter | null {
  const value = readPreferenceState().byWorkspace[workspaceId];
  return typeof value === 'string' ? value : null;
}

export function writeCategoryPreference(
  workspaceId: string,
  category: CategoryFilter,
): void {
  if (!workspaceId) return;
  try {
    const current = readPreferenceState();
    localStorage.setItem(MANAGER_CATEGORY_PREFERENCE_KEY, JSON.stringify({
      version: 1,
      byWorkspace: {
        ...current.byWorkspace,
        [workspaceId]: category,
      },
    } satisfies PreferenceState));
  } catch {
    // Preference storage must never block Manager navigation.
  }
}

export function chooseInitialCategory(
  state: CategoryState,
  workspaceId: string,
  storedCategory: CategoryFilter | null,
): CategoryFilter {
  const availableState: CategoryState = {
    folders: state.folders ?? [],
    groups: state.groups ?? [],
    categoryOrderByWorkspace: state.categoryOrderByWorkspace ?? {},
  };
  if (
    storedCategory
    && isOwnedCategory(availableState, storedCategory, workspaceId)
  ) {
    return storedCategory;
  }
  for (const category of categoryOrder(availableState, workspaceId)) {
    if (groupsForCategory(availableState, category as CategoryFilter, workspaceId).length) {
      return category as CategoryFilter;
    }
  }
  return 'inbox';
}
