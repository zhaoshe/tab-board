import { useEffect, useState, useCallback } from 'react';
import { useTabBoardStore } from '../../shared/store/useTabBoardStore';
import { normalizeSearch, groupMatchesQuery } from '../../shared/model';
import type { Group } from '../../shared/model';

const SEARCH_KEY = 'tabboardSearch';
const SEARCH_CHANGE_EVENT = 'tabboard-search-change';

function getInitialQuery(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  const urlQuery = params.get('q');
  if (urlQuery) return urlQuery;
  const stored = sessionStorage.getItem(SEARCH_KEY);
  return stored || '';
}

let globalQuery = '';
const listeners = new Set<(value: string) => void>();

function setGlobalQuery(value: string) {
  globalQuery = value;
  sessionStorage.setItem(SEARCH_KEY, value);
  const event = new CustomEvent(SEARCH_CHANGE_EVENT, { detail: value });
  window.dispatchEvent(event);
  listeners.forEach((listener) => listener(value));
}

export function useFilteredGroups(folderId: string | null, starred = false): Group[] {
  const groups = useTabBoardStore((state) => state.groups);
  const activeWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);
  const searchQuery = useSearchQuery();

  const normalized = normalizeSearch(searchQuery);

  const filteredGroups = groups.filter((group) => {
    if (group.workspaceId !== activeWorkspaceId) return false;
    if (starred) {
      if (!group.starred) return false;
    } else {
      if (group.starred) return false;
      if (group.folderId !== folderId) return false;
    }
    if (normalized && !groupMatchesQuery(group, normalized)) {
      return false;
    }
    return true;
  });

  return filteredGroups;
}

export function useSearchQuery(): string {
  const [query, setQuery] = useState<string>(() => {
    if (globalQuery) return globalQuery;
    return getInitialQuery();
  });

  useEffect(() => {
    const initial = getInitialQuery();
    if (initial) {
      setGlobalQuery(initial);
      setQuery(initial);
    }
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      setQuery(customEvent.detail);
      globalQuery = customEvent.detail;
    };
    window.addEventListener(SEARCH_CHANGE_EVENT, handler);
    return () => window.removeEventListener(SEARCH_CHANGE_EVENT, handler);
  }, []);

  return query;
}

export function useSetSearchQuery() {
  return useCallback((value: string) => {
    setGlobalQuery(value);
  }, []);
}

export function useWorkspaceFolders() {
  const folders = useTabBoardStore((state) => state.folders);
  const activeWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);
  return folders.filter((folder) => folder.workspaceId === activeWorkspaceId);
}

export function useCurrentWorkspace() {
  const workspaces = useTabBoardStore((state) => state.workspaces);
  const activeWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);
  return workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];
}

export function useWorkspaceStats() {
  const groups = useTabBoardStore((state) => state.groups);
  const folders = useTabBoardStore((state) => state.folders);
  const activeWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);

  const workspaceGroups = groups.filter((g) => g.workspaceId === activeWorkspaceId);
  const workspaceFolders = folders.filter((f) => f.workspaceId === activeWorkspaceId);

  const totalTabs = workspaceGroups.reduce((sum, group) => sum + group.tabs.length, 0);

  return {
    totalSessions: workspaceGroups.length,
    totalTabs,
    totalFolders: workspaceFolders.length,
  };
}
