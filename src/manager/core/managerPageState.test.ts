import { describe, expect, it } from 'vitest';
import type { TabBoardState } from '../../shared/model';
import {
  parseManagerPageState,
  serializeManagerPageState,
  validateManagerPageState,
} from './managerPageState';

const state = {
  activeWorkspaceId: 'workspace-a',
  workspaces: [
    { id: 'workspace-a', name: 'A' },
    { id: 'workspace-b', name: 'B' },
  ],
  folders: [
    { id: 'folder-a', workspaceId: 'workspace-a' },
    { id: 'folder-b', workspaceId: 'workspace-b' },
  ],
} as Pick<TabBoardState, 'activeWorkspaceId' | 'workspaces' | 'folders'>;

describe('manager page state', () => {
  it('parses and serializes workspace, category, Bin, and query state', () => {
    const parsed = parseManagerPageState(
      '?workspace=workspace-a&category=folder%3Afolder-a&view=bin&q=needle',
    );
    expect(parsed).toEqual({
      workspaceId: 'workspace-a',
      category: 'folder:folder-a',
      view: 'bin',
      query: 'needle',
    });
    expect(serializeManagerPageState(parsed)).toBe(
      'workspace=workspace-a&category=folder%3Afolder-a&view=bin&q=needle',
    );
  });

  it('falls back when workspace or category ownership is invalid', () => {
    expect(validateManagerPageState({
      workspaceId: 'missing',
      category: 'folder:folder-b',
      view: 'board',
      query: 'needle',
    }, state)).toEqual({
      workspaceId: 'workspace-a',
      category: 'inbox',
      view: 'board',
      query: 'needle',
    });
    expect(validateManagerPageState({
      workspaceId: 'workspace-b',
      category: 'folder:folder-a',
      view: 'board',
      query: '',
    }, state)).toEqual({
      workspaceId: 'workspace-b',
      category: 'inbox',
      view: 'board',
      query: '',
    });
  });
});
