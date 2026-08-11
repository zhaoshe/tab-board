export interface TitleRefreshActivity {
  groupId: string;
  tabId: string;
  operationId: string;
  status: 'start' | 'finish';
}

export interface TitleRefreshActivityStore {
  apply(activity: TitleRefreshActivity): void;
  isActive(groupId: string, tabId: string): boolean;
  subscribe(
    groupId: string,
    tabId: string,
    listener: () => void,
  ): () => void;
}

function recordKey(groupId: string, tabId: string): string {
  return JSON.stringify([groupId, tabId]);
}

export function createTitleRefreshActivityStore():
TitleRefreshActivityStore {
  const operations = new Map<string, Set<string>>();
  const listeners = new Map<string, Set<() => void>>();

  const notify = (key: string) => {
    listeners.get(key)?.forEach((listener) => listener());
  };
  const apply = (activity: TitleRefreshActivity) => {
    const key = recordKey(activity.groupId, activity.tabId);
    const current = operations.get(key) ?? new Set<string>();
    const wasActive = current.size > 0;
    if (activity.status === 'start') current.add(activity.operationId);
    else current.delete(activity.operationId);
    if (current.size) operations.set(key, current);
    else operations.delete(key);
    if (wasActive !== (current.size > 0)) notify(key);
  };
  const isActive = (groupId: string, tabId: string) =>
    (operations.get(recordKey(groupId, tabId))?.size ?? 0) > 0;
  const subscribe = (
    groupId: string,
    tabId: string,
    listener: () => void,
  ) => {
    const key = recordKey(groupId, tabId);
    const recordListeners = listeners.get(key) ?? new Set<() => void>();
    recordListeners.add(listener);
    listeners.set(key, recordListeners);
    return () => {
      recordListeners.delete(listener);
      if (!recordListeners.size) listeners.delete(key);
    };
  };

  return { apply, isActive, subscribe };
}

export const titleRefreshActivityStore =
  createTitleRefreshActivityStore();
