import { useCallback, useEffect, useState } from 'react';
import type { Group } from '../../shared/model';

interface RuntimeResponse<T> {
  ok?: boolean;
  result?: T;
  error?: string;
}

interface BookmarkListResult {
  groups: Group[];
}

export function useBookmarkSessions(workspaceId: string): Group[] {
  const [groups, setGroups] = useState<Group[]>([]);

  const refresh = useCallback(async () => {
    const response = await chrome.runtime.sendMessage({
      type: 'list-bookmarks',
      workspaceId,
    }) as RuntimeResponse<BookmarkListResult> | undefined;
    if (!response?.ok) {
      throw new Error(response?.error || 'Unable to load bookmarks.');
    }
    setGroups(response.result?.groups ?? []);
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    void refresh().catch(() => {
      if (!cancelled) setGroups([]);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    const listener = (message: { type?: string }) => {
      if (message?.type === 'tabboard-bookmarks-changed') {
        void refresh().catch(() => setGroups([]));
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [refresh]);

  return groups;
}
