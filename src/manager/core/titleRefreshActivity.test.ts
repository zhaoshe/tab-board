import { describe, expect, it, vi } from 'vitest';
import { createTitleRefreshActivityStore } from './titleRefreshActivity';

describe('title refresh activity store', () => {
  it('keeps a record active until every overlapping operation finishes', () => {
    const store = createTitleRefreshActivityStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe('group-a', 'tab-a', listener);

    store.apply({
      groupId: 'group-a',
      tabId: 'tab-a',
      operationId: 'first',
      status: 'start',
    });
    store.apply({
      groupId: 'group-a',
      tabId: 'tab-a',
      operationId: 'second',
      status: 'start',
    });
    store.apply({
      groupId: 'group-a',
      tabId: 'tab-a',
      operationId: 'first',
      status: 'finish',
    });

    expect(store.isActive('group-a', 'tab-a')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    store.apply({
      groupId: 'group-a',
      tabId: 'tab-a',
      operationId: 'second',
      status: 'finish',
    });

    expect(store.isActive('group-a', 'tab-a')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('ignores duplicate events and notifies only the matching record', () => {
    const store = createTitleRefreshActivityStore();
    const first = vi.fn();
    const second = vi.fn();
    store.subscribe('group-a', 'tab-a', first);
    store.subscribe('group-a', 'tab-b', second);
    const start = {
      groupId: 'group-a',
      tabId: 'tab-a',
      operationId: 'operation',
      status: 'start' as const,
    };

    store.apply(start);
    store.apply(start);
    store.apply({
      ...start,
      operationId: 'missing',
      status: 'finish',
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});
