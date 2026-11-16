import { useCallback, useEffect, useRef, useState } from 'react';
import type { Group } from '../../shared/model';

interface RuntimeResponse<T> {
  ok?: boolean;
  result?: T;
  error?: string;
}

interface BookmarkListResult {
  groups: Group[];
}

export interface BookmarkSessionsState {
  groups: Group[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

function bookmarkRuntime(): typeof chrome.runtime | null {
  return typeof chrome === 'undefined' || !chrome.runtime
    ? null
    : chrome.runtime;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error || 'Unable to load bookmarks.');
}

export function useBookmarkSessions(workspaceId: string): BookmarkSessionsState {
  const [state, setState] = useState<BookmarkSessionsState>({
    groups: [],
    loading: true,
    error: null,
    retry: () => undefined,
  });
  const requestGenerationRef = useRef(0);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    const runtime = bookmarkRuntime();
    const isCurrent = () => mountedRef.current && requestGenerationRef.current === generation;
    setState((current) => ({
      ...current,
      loading: true,
      error: null,
    }));
    if (!runtime) {
      if (!isCurrent()) return;
      setState((current) => ({
        ...current,
        loading: false,
        error: null,
      }));
      return;
    }
    try {
      const response = await runtime.sendMessage({
        type: 'list-bookmarks',
        workspaceId,
      }) as RuntimeResponse<BookmarkListResult> | undefined;
      if (!response?.ok) {
        throw new Error(response?.error || 'Unable to load bookmarks.');
      }
      if (!isCurrent()) return;
      setState((current) => ({
        ...current,
        groups: response.result?.groups ?? [],
        error: null,
      }));
    } catch (error) {
      if (!isCurrent()) return;
      setState((current) => ({
        ...current,
        error: errorMessage(error),
      }));
    } finally {
      if (!isCurrent()) return;
      setState((current) => ({
        ...current,
        loading: false,
      }));
    }
  }, [workspaceId]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      requestGenerationRef.current += 1;
      mountedRef.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    const runtime = bookmarkRuntime();
    if (!runtime) return undefined;
    const listener = (message: { type?: string }) => {
      if (message?.type === 'tabboard-bookmarks-changed') {
        void refresh();
      }
    };
    runtime.onMessage.addListener(listener);
    return () => runtime.onMessage.removeListener(listener);
  }, [refresh]);

  return {
    ...state,
    retry: () => {
      void refresh();
    },
  };
}
