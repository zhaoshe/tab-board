import { URL_PATTERN, SPECIAL_URL_PATTERN, ITEM_LINK, ITEM_NOTE } from './constants';
import type { TabItem, Group, TabBoardState } from './types';

export function normalizeSearch(query: string): string {
  return String(query || '').trim().toLowerCase();
}

export function tabMatchesQuery(tab: TabItem, normalizedQuery: string): boolean {
  if (!normalizedQuery || !tab) {
    return false;
  }
  const q = normalizedQuery;
  return (
    (tab.title || '').toLowerCase().includes(q) ||
    (tab.url || '').toLowerCase().includes(q) ||
    (tab.note || '').toLowerCase().includes(q)
  );
}

export function groupMatchesQuery(group: Group, normalizedQuery: string): boolean {
  if (!normalizedQuery || !group) {
    return false;
  }
  const q = normalizedQuery;
  if ((group.title || '').toLowerCase().includes(q) || (group.note || '').toLowerCase().includes(q)) {
    return true;
  }
  return (group.tabs || []).some((tab) => tabMatchesQuery(tab, q));
}

export function looksLikeUrl(text: string): boolean {
  return URL_PATTERN.test(String(text || '').trim());
}

export function looksLikeSpecialUrl(text: string): boolean {
  return SPECIAL_URL_PATTERN.test(String(text || '').trim());
}

export function coerceUrl(text: string): string {
  const value = String(text || '').trim();
  if (!value) {
    return '';
  }
  if (looksLikeUrl(value)) {
    return value;
  }
  if (looksLikeSpecialUrl(value)) {
    return value;
  }
  return `https://${value}`;
}

export function sortCapturedTabs(tabs: TabItem[]): TabItem[] {
  return [...tabs].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    if (a.sourceWindowId !== b.sourceWindowId) {
      return (a.sourceWindowId ?? 0) - (b.sourceWindowId ?? 0);
    }
    return (a.sourceTabId ?? 0) - (b.sourceTabId ?? 0);
  });
}

export function escapeXml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface StatsResult {
  totalTabs: number;
  totalGroups: number;
  totalFolders: number;
  totalWorkspaces: number;
  totalNotes: number;
  totalStarred: number;
  totalLocked: number;
  totalBinEntries: number;
}

export function collectStats(state: TabBoardState): StatsResult {
  let totalTabs = 0;
  let totalNotes = 0;
  let totalStarred = 0;
  let totalLocked = 0;

  for (const group of state.groups) {
    totalTabs += group.tabs.length;
    for (const tab of group.tabs) {
      if (tab.itemType === ITEM_NOTE) {
        totalNotes++;
      }
      if (tab.starred) {
        totalStarred++;
      }
    }
    if (group.locked) {
      totalLocked++;
    }
  }

  return {
    totalTabs,
    totalGroups: state.groups.length,
    totalFolders: state.folders.length,
    totalWorkspaces: state.workspaces.length,
    totalNotes,
    totalStarred,
    totalLocked,
    totalBinEntries: state.bin.length,
  };
}

export function getAllUrls(state: TabBoardState): Set<string> {
  const urls = new Set<string>();
  for (const group of state.groups) {
    for (const tab of group.tabs) {
      if (tab.itemType === ITEM_LINK && tab.url) {
        urls.add(tab.url);
      }
    }
  }
  return urls;
}
