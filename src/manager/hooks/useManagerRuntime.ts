import { useCallback, useMemo } from 'react';
import type { SavedTabRef } from '../../shared/model/drop-intent';
import {
  parseRestoreRefs,
  parseRestoreRefsResult,
  type RestoreRefsResult,
} from '../../shared/model';
import { useToast } from './useToast';

export type RestoreTabsResult = RestoreRefsResult;

export type ManagerRuntime = {
  openSavedTab: (url: string) => Promise<void>;
  openSavedTabs: (urls: string[]) => Promise<void>;
  restoreGroup: (groupId: string) => Promise<void>;
  restoreTab: (groupId: string, tabId: string) => Promise<void>;
  restoreTabs: (refs: readonly SavedTabRef[]) => Promise<RestoreTabsResult>;
};

interface RuntimeResponse<T> {
  ok?: boolean;
  result?: T;
  error?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateSavedUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Saved tab URL is invalid.');
  }
  if (!['http:', 'https:', 'chrome:', 'file:'].includes(parsed.protocol)) {
    throw new Error('Saved tab URL uses an unsupported protocol.');
  }
}

export function useManagerRuntime(): ManagerRuntime {
  const { showError } = useToast();

  const run = useCallback(async (operation: () => Promise<void>): Promise<void> => {
    try {
      await operation();
    } catch (error: unknown) {
      showError(errorMessage(error));
    }
  }, [showError]);

  const runChecked = useCallback(async <T,>(
    operation: () => Promise<T>,
  ): Promise<T> => {
    try {
      return await operation();
    } catch (error: unknown) {
      showError(errorMessage(error));
      throw error;
    }
  }, [showError]);

  const sendMessage = useCallback(async <T,>(message: Record<string, unknown>): Promise<T> => {
    const response = await chrome.runtime.sendMessage(message) as RuntimeResponse<T> | undefined;
    if (!response?.ok) {
      throw new Error(response?.error || 'Manager action failed.');
    }
    return response.result as T;
  }, []);

  return useMemo(() => ({
    openSavedTab: (url: string) => run(async () => {
      validateSavedUrl(url);
      await chrome.tabs.create({ url });
    }),
    openSavedTabs: (urls: string[]) => run(async () => {
      if (!urls.length) return;
      urls.forEach(validateSavedUrl);
      await chrome.tabs.create({ url: urls[0] });
      await Promise.all(urls.slice(1).map((url) => chrome.tabs.create({ url, active: false })));
    }),
    restoreGroup: (groupId: string) => run(async () => {
      await sendMessage({ type: 'restore-group', groupId });
    }),
    restoreTab: (groupId: string, tabId: string) => run(async () => {
      await sendMessage({ type: 'restore-tab', source: 'group', groupId, tabId });
    }),
    restoreTabs: (refs: readonly SavedTabRef[]) => runChecked(async () => {
      if (!refs.length) throw new Error('Select at least one restorable link.');
      const requestedRefs = parseRestoreRefs(
        refs.map(({ groupId, tabId }) => ({
          source: 'group',
          groupId,
          tabId,
        })),
      );
      const result = await sendMessage<RestoreTabsResult>({
        type: 'restore-refs',
        refs: requestedRefs,
      });
      return parseRestoreRefsResult(result, requestedRefs);
    }),
  }), [run, runChecked, sendMessage]);
}
