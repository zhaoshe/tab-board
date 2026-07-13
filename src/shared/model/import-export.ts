import { URL_PATTERN, ITEM_LINK, ITEM_NOTE } from './constants';
import type { Group, TabItem, TabBoardState } from './types';
import {
  createId,
  normalizeGroup,
  normalizeTab,
  defaultGroupTitle,
  nowIso,
  clone,
} from './schema';
import { looksLikeUrl } from './search';

export interface ParseImportOptions {
  workspaceId?: string;
  folderId?: string | null;
}

export function parseImportText(
  text: string,
  options: ParseImportOptions = {}
): Group[] {
  const workspaceId = options.workspaceId || 'workspace_default';
  const folderId = options.folderId ?? null;
  const raw = String(text || '').trim();
  if (!raw) {
    return [];
  }
  const firstChar = raw.slice(0, 1);
  if (firstChar === '{' || firstChar === '[') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => normalizeImportGroup(item, workspaceId, folderId))
          .filter(Boolean) as Group[];
      }
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray((parsed as Record<string, unknown>).groups)) {
          return ((parsed as Record<string, unknown>).groups as unknown[])
            .map((item) => normalizeImportGroup(item, workspaceId, folderId))
            .filter(Boolean) as Group[];
        }
        const single = normalizeImportGroup(parsed, workspaceId, folderId);
        return single ? [single] : [];
      }
    } catch {
      // fall through to text parsing
    }
  }
  return parseTextGroups(raw, workspaceId, folderId);
}

function normalizeImportGroup(
  raw: unknown,
  workspaceId: string,
  folderId: string | null
): Group | null {
  const normalized = normalizeGroup(raw);
  if (!normalized) {
    return null;
  }
  return {
    ...normalized,
    id: createId('group'),
    workspaceId,
    folderId: normalized.starred ? null : folderId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    tabs: normalized.tabs.map((tab) => ({
      ...tab,
      id: createId('tab'),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })),
  };
}

function parseTextGroups(
  raw: string,
  workspaceId: string,
  folderId: string | null
): Group[] {
  const lines = raw.split(/\r?\n/);
  const groups: Group[] = [];
  let currentTabs: TabItem[] = [];
  let currentTitle = '';

  const flush = () => {
    if (currentTabs.length) {
      const group = normalizeGroup({
        title: currentTitle || defaultGroupTitle(),
        tabs: currentTabs,
        workspaceId,
        folderId,
      }) as Group;
      groups.push(group);
      currentTabs = [];
      currentTitle = '';
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const urlMatch = trimmed.match(URL_PATTERN);
    if (urlMatch) {
      const url = trimmed;
      const title = currentTitle || url;
      const tab = normalizeTab({
        itemType: ITEM_LINK,
        title,
        url,
      }) as TabItem;
      currentTabs.push(tab);
      currentTitle = '';
    } else if (!currentTitle && !looksLikeUrl(trimmed)) {
      currentTitle = trimmed;
    } else if (currentTitle) {
      const tab = normalizeTab({
        itemType: ITEM_NOTE,
        title: currentTitle,
        note: trimmed,
      }) as TabItem;
      currentTabs.push(tab);
      currentTitle = '';
    }
  }
  flush();
  return groups;
}

export function parseOneTabText(
  text: string,
  options: ParseImportOptions = {}
): Group[] {
  const workspaceId = options.workspaceId || 'workspace_default';
  const folderId = options.folderId ?? null;
  const raw = String(text || '').trim();
  if (!raw) {
    return [];
  }
  const groups: Group[] = [];
  const blocks = raw.split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const firstLine = lines[0];
    const title = firstLine.startsWith('http') ? '' : firstLine;
    const urlLines = title ? lines.slice(1) : lines;
    const tabs: TabItem[] = [];
    for (const line of urlLines) {
      if (!URL_PATTERN.test(line)) continue;
      const tab = normalizeTab({
        itemType: ITEM_LINK,
        title: line,
        url: line,
      }) as TabItem;
      tabs.push(tab);
    }
    if (!tabs.length) continue;
    const group = normalizeGroup({
      title: title || defaultGroupTitle(),
      tabs,
      workspaceId,
      folderId,
    }) as Group;
    groups.push(group);
  }
  return groups;
}

export function groupsToText(groups: Group[]): string {
  const chunks: string[] = [];
  for (const group of groups) {
    chunks.push(group.title || '');
    for (const tab of group.tabs) {
      if (tab.itemType === ITEM_LINK) {
        if (tab.title && tab.title !== tab.url) {
          chunks.push(tab.title);
        }
        chunks.push(tab.url);
      } else if (tab.itemType === ITEM_NOTE) {
        chunks.push(tab.note || tab.title);
      }
    }
    chunks.push('');
  }
  return chunks.join('\n').trim();
}

export function tabsToText(tabs: TabItem[]): string {
  const chunks: string[] = [];
  for (const tab of tabs) {
    if (tab.itemType === ITEM_LINK) {
      if (tab.title && tab.title !== tab.url) {
        chunks.push(tab.title);
      }
      chunks.push(tab.url);
    } else if (tab.itemType === ITEM_NOTE) {
      chunks.push(tab.note || tab.title);
    }
    chunks.push('');
  }
  return chunks.join('\n').trim();
}

export function exportToJson(state: TabBoardState): string {
  const exportData = clone(state);
  return JSON.stringify(exportData, null, 2);
}

export function exportToText(state: TabBoardState): string {
  const chunks: string[] = [];
  const workspaceMap = new Map(state.workspaces.map((w) => [w.id, w.name]));
  const folderMap = new Map(state.folders.map((f) => [f.id, f.name]));

  const groupsByWorkspace = new Map<string, Group[]>();
  for (const group of state.groups) {
    if (!groupsByWorkspace.has(group.workspaceId)) {
      groupsByWorkspace.set(group.workspaceId, []);
    }
    groupsByWorkspace.get(group.workspaceId)!.push(group);
  }

  for (const [workspaceId, workspaceGroups] of groupsByWorkspace) {
    const workspaceName = workspaceMap.get(workspaceId) || 'Workspace';
    chunks.push(`=== ${workspaceName} ===`);
    chunks.push('');

    const starredGroups = workspaceGroups.filter((g) => g.starred);
    const folderGroups = workspaceGroups.filter((g) => !g.starred);

    if (starredGroups.length) {
      chunks.push('--- Starred ---');
      chunks.push('');
      for (const group of starredGroups) {
        chunks.push(group.title || '');
        for (const tab of group.tabs) {
          if (tab.itemType === ITEM_LINK) {
            if (tab.title && tab.title !== tab.url) {
              chunks.push(tab.title);
            }
            chunks.push(tab.url);
          } else if (tab.itemType === ITEM_NOTE) {
            chunks.push(tab.note || tab.title);
          }
        }
        chunks.push('');
      }
    }

    const groupsByFolder = new Map<string | null, Group[]>();
    for (const group of folderGroups) {
      const key = group.folderId || null;
      if (!groupsByFolder.has(key)) {
        groupsByFolder.set(key, []);
      }
      groupsByFolder.get(key)!.push(group);
    }

    const folderOrder = state.categoryOrderByWorkspace[workspaceId] || [];
    const orderedFolderIds = [
      ...folderOrder.filter((id) => groupsByFolder.has(id)),
      ...[...groupsByFolder.keys()].filter((id) => id !== null && !folderOrder.includes(id!)),
    ];

    for (const folderId of orderedFolderIds) {
      const folderName = folderId ? folderMap.get(folderId) || 'Folder' : 'Uncategorized';
      const folderGroupsList = groupsByFolder.get(folderId) || [];
      if (!folderGroupsList.length) continue;

      chunks.push(`--- ${folderName} ---`);
      chunks.push('');
      for (const group of folderGroupsList) {
        chunks.push(group.title || '');
        for (const tab of group.tabs) {
          if (tab.itemType === ITEM_LINK) {
            if (tab.title && tab.title !== tab.url) {
              chunks.push(tab.title);
            }
            chunks.push(tab.url);
          } else if (tab.itemType === ITEM_NOTE) {
            chunks.push(tab.note || tab.title);
          }
        }
        chunks.push('');
      }
    }
  }

  return chunks.join('\n').trim();
}
