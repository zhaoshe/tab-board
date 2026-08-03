import { describe, expect, it } from 'vitest';
import type { CategoryFilter } from './categories';
import type { DropIntent } from './drop-intent';

type ExpectedDropIntent =
  | {
      kind: 'move-session';
      groupId: string;
      category: CategoryFilter;
      index: number;
      workspaceId: string;
    }
  | {
      kind: 'reorder-category';
      categoryId: string;
      targetCategoryId: string;
      placement: 'before' | 'after';
      workspaceId: string;
      expectedCategoryOrder: string[];
    }
  | {
      kind: 'move-tabs';
      refs: Array<{ groupId: string; tabId: string }>;
      targetGroupId: string;
      targetIndex: number;
      workspaceId: string;
    }
  | {
      kind: 'copy-open-tabs';
      tabIds: number[];
      windowId: number;
      targetGroupId: string;
      targetIndex: number;
      workspaceId: string;
    }
  | {
      kind: 'create-session';
      source:
        | {
            kind: 'saved-tabs';
            refs: Array<{ groupId: string; tabId: string }>;
          }
        | {
            kind: 'open-tabs';
            tabIds: number[];
            windowId: number;
          };
      category: CategoryFilter;
      index: number;
      workspaceId: string;
    };

type IsExact<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends
  (<Value>() => Value extends Expected ? 1 : 2)
    ? (<Value>() => Value extends Expected ? 1 : 2) extends
      (<Value>() => Value extends Actual ? 1 : 2)
      ? true
      : false
    : false;

type Assert<Condition extends true> = Condition;
type DropIntentContractIsExact = Assert<IsExact<DropIntent, ExpectedDropIntent>>;

describe('shared DropIntent contract', () => {
  it('constructs all five persistent wire kinds', () => {
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
        expectedCategoryOrder: ['inbox', 'saved', 'archive'],
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
