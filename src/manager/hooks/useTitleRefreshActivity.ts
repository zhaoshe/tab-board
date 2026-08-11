import { useEffect, useSyncExternalStore } from 'react';
import {
  titleRefreshActivityStore,
  type TitleRefreshActivity,
} from '../core/titleRefreshActivity';

function isTitleRefreshActivity(value: unknown): value is TitleRefreshActivity {
  if (!value || typeof value !== 'object') return false;
  const activity = value as Partial<TitleRefreshActivity>;
  return typeof activity.groupId === 'string'
    && typeof activity.tabId === 'string'
    && typeof activity.operationId === 'string'
    && (activity.status === 'start' || activity.status === 'finish');
}

export function useTitleRefreshActivityListener(): void {
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
    const listener = (message: unknown) => {
      if (isTitleRefreshActivity(message)
        && (message as { type?: string }).type
          === 'tabboard-title-refresh-activity') {
        titleRefreshActivityStore.apply(message);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);
}

export function useIsTitleRefreshing(
  groupId: string,
  tabId: string,
): boolean {
  return useSyncExternalStore(
    (listener) => titleRefreshActivityStore.subscribe(
      groupId,
      tabId,
      listener,
    ),
    () => titleRefreshActivityStore.isActive(groupId, tabId),
    () => false,
  );
}
