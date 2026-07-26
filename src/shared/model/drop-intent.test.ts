import { describe, expect, it } from 'vitest';
import type { DropIntent } from './drop-intent';

describe('shared DropIntent contract', () => {
  it('owns all five persistent wire shapes', () => {
    const intents = [
      {
        kind: 'move-session',
        groupId: 'group-a',
        category: 'inbox',
        index: 0,
        workspaceId: 'workspace-a',
      },
      {
        kind: 'reorder-category',
        categoryId: 'inbox',
        targetCategoryId: 'saved',
        placement: 'after',
        workspaceId: 'workspace-a',
      },
      {
        kind: 'move-tabs',
        refs: [{ groupId: 'group-a', tabId: 'tab-a' }],
        targetGroupId: 'group-b',
        targetIndex: 0,
        workspaceId: 'workspace-a',
      },
      {
        kind: 'copy-open-tabs',
        tabIds: [1, 2],
        windowId: 7,
        targetGroupId: 'group-b',
        targetIndex: 1,
        workspaceId: 'workspace-a',
      },
      {
        kind: 'create-session',
        source: {
          kind: 'saved-tabs',
          refs: [{ groupId: 'group-a', tabId: 'tab-a' }],
        },
        category: 'folder:folder-a',
        index: 2,
        workspaceId: 'workspace-a',
      },
      {
        kind: 'create-session',
        source: {
          kind: 'open-tabs',
          tabIds: [1, 2],
          windowId: 7,
        },
        category: 'saved',
        index: 0,
        workspaceId: 'workspace-a',
      },
    ] satisfies DropIntent[];

    expect(intents.map(({ kind }) => kind)).toEqual([
      'move-session',
      'reorder-category',
      'move-tabs',
      'copy-open-tabs',
      'create-session',
      'create-session',
    ]);
  });
});
