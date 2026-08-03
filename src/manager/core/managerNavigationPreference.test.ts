// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Group, TabBoardState } from '../../shared/model';
import {
  MANAGER_CATEGORY_PREFERENCE_KEY,
  chooseInitialCategory,
  readCategoryPreference,
  writeCategoryPreference,
} from './managerNavigationPreference';

const group = (
  id: string,
  overrides: Partial<Group> = {},
): Group => ({
  id,
  title: id,
  note: '',
  workspaceId: 'workspace-a',
  folderId: null,
  locked: false,
  starred: false,
  archived: false,
  collapsed: false,
  tabs: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const state = {
  folders: [{
    id: 'folder-a',
    name: 'Projects',
    color: 'blue',
    collapsed: false,
    workspaceId: 'workspace-a',
    createdAt: '',
    updatedAt: '',
  }],
  groups: [
    group('saved', { starred: true }),
    group('project', { folderId: 'folder-a' }),
  ],
  categoryOrderByWorkspace: {
    'workspace-a': ['inbox', 'folder-a', 'saved', 'archive'],
  },
} as Pick<TabBoardState, 'folders' | 'groups' | 'categoryOrderByWorkspace'>;

beforeEach(() => localStorage.clear());

describe('manager category preference', () => {
  it('prefers a valid stored category and otherwise opens the first non-empty ordered category', () => {
    expect(chooseInitialCategory(state, 'workspace-a', 'saved')).toBe('saved');
    expect(chooseInitialCategory(state, 'workspace-a', null))
      .toBe('folder:folder-a');
    expect(chooseInitialCategory(state, 'workspace-a', 'folder:missing'))
      .toBe('folder:folder-a');
    expect(chooseInitialCategory({
      ...state,
      groups: [],
    }, 'workspace-a', null)).toBe('inbox');
  });

  it('stores versioned preferences independently per workspace', () => {
    writeCategoryPreference('workspace-a', 'saved');
    writeCategoryPreference('workspace-b', 'archive');

    expect(readCategoryPreference('workspace-a')).toBe('saved');
    expect(readCategoryPreference('workspace-b')).toBe('archive');
    expect(JSON.parse(localStorage.getItem(MANAGER_CATEGORY_PREFERENCE_KEY)!))
      .toEqual({
        version: 1,
        byWorkspace: {
          'workspace-a': 'saved',
          'workspace-b': 'archive',
        },
      });
  });
});
