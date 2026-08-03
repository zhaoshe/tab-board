import type { CategoryFilter } from './categories';

export type SavedTabRef = {
  groupId: string;
  tabId: string;
};

export type DropIntent =
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
      refs: SavedTabRef[];
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
        | { kind: 'saved-tabs'; refs: SavedTabRef[] }
        | { kind: 'open-tabs'; tabIds: number[]; windowId: number };
      category: CategoryFilter;
      index: number;
      workspaceId: string;
    };
