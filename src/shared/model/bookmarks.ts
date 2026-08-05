import { ITEM_LINK, TASK_NONE } from './constants';
import type { Group, TabItem } from './types';

export interface BookmarkTreeNode {
  id: string;
  title?: string;
  url?: string;
  dateAdded?: number;
  children?: BookmarkTreeNode[];
}

export interface BookmarkProjectionOptions {
  timestamp: string;
  workspaceId: string;
}

function titleOrFallback(title: unknown, fallback: string): string {
  return typeof title === 'string' && title.trim() ? title.trim() : fallback;
}

function bookmarkTab(node: BookmarkTreeNode, timestamp: string): TabItem {
  const url = String(node.url || '');
  return {
    id: `bookmark-${node.id}`,
    itemType: ITEM_LINK,
    title: titleOrFallback(node.title, url),
    url,
    favIconUrl: '',
    note: '',
    pinned: false,
    incognito: false,
    starred: false,
    taskStatus: TASK_NONE,
    browserGroup: null,
    sourceWindowId: null,
    sourceTabId: null,
    createdAt: node.dateAdded ? new Date(node.dateAdded).toISOString() : timestamp,
    updatedAt: timestamp,
  };
}

function bookmarkGroup(
  node: BookmarkTreeNode,
  title: string,
  tabs: TabItem[],
  options: BookmarkProjectionOptions,
): Group {
  return {
    id: `bookmark-folder-${node.id}`,
    title,
    note: '',
    workspaceId: options.workspaceId,
    folderId: null,
    locked: true,
    starred: false,
    archived: false,
    collapsed: false,
    tabs,
    createdAt: options.timestamp,
    updatedAt: options.timestamp,
  };
}

function visitFolder(
  node: BookmarkTreeNode,
  path: readonly string[],
  options: BookmarkProjectionOptions,
  groups: Group[],
): void {
  const ownTitle = typeof node.title === 'string' ? node.title.trim() : '';
  const nextPath = ownTitle ? [...path, ownTitle] : path;
  const tabs: TabItem[] = [];
  const childFolders: BookmarkTreeNode[] = [];

  for (const child of node.children ?? []) {
    if (child.url) {
      tabs.push(bookmarkTab(child, options.timestamp));
    } else {
      childFolders.push(child);
    }
  }

  if (tabs.length) {
    groups.push(bookmarkGroup(
      node,
      nextPath.length ? nextPath.join('/') : 'Bookmarks',
      tabs,
      options,
    ));
  }
  childFolders.forEach((child) => visitFolder(child, nextPath, options, groups));
}

export function createBookmarkSessions(
  tree: readonly BookmarkTreeNode[],
  options: BookmarkProjectionOptions,
): Group[] {
  const groups: Group[] = [];
  for (const root of tree) {
    if (root.url) continue;
    visitFolder(root, [], options, groups);
  }
  return groups;
}
