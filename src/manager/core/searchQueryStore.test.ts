import { describe, expect, it } from 'vitest';
import {
  createSearchQueryStore,
  type SearchQueryStorePorts,
} from './searchQueryStore';

function createPorts(input: {
  search?: string;
  stored?: string | null;
  writes?: string[];
} = {}): SearchQueryStorePorts {
  return {
    locationSearch: () => input.search ?? '',
    readStoredQuery: () => input.stored ?? null,
    writeStoredQuery: (value) => input.writes?.push(value),
  };
}

describe('SearchQueryStore initialization', () => {
  it('prefers a non-empty URL query and persists the decoded snapshot', () => {
    const writes: string[] = [];
    const store = createSearchQueryStore(createPorts({
      search: '?q=url%20needle',
      stored: 'stored needle',
      writes,
    }));

    expect(store.getSnapshot()).toBe('url needle');
    expect(writes).toEqual(['url needle']);
  });

  it('falls back to stored query when URL query is absent or empty', () => {
    const absentWrites: string[] = [];
    const emptyWrites: string[] = [];

    const absent = createSearchQueryStore(createPorts({
      stored: 'stored absent',
      writes: absentWrites,
    }));
    const empty = createSearchQueryStore(createPorts({
      search: '?q=',
      stored: 'stored empty',
      writes: emptyWrites,
    }));

    expect(absent.getSnapshot()).toBe('stored absent');
    expect(empty.getSnapshot()).toBe('stored empty');
    expect(absentWrites).toEqual(['stored absent']);
    expect(emptyWrites).toEqual(['stored empty']);
  });

  it('uses an empty snapshot without creating a storage entry', () => {
    const writes: string[] = [];
    const store = createSearchQueryStore(createPorts({ writes }));

    expect(store.getSnapshot()).toBe('');
    expect(writes).toEqual([]);
  });

  it('contains read and initial persistence failures', () => {
    const failingRead = createSearchQueryStore({
      locationSearch: () => {
        throw new Error('location unavailable');
      },
      readStoredQuery: () => {
        throw new Error('storage unavailable');
      },
      writeStoredQuery: () => {
        throw new Error('storage unavailable');
      },
    });
    const failingWrite = createSearchQueryStore({
      locationSearch: () => '?q=available',
      readStoredQuery: () => null,
      writeStoredQuery: () => {
        throw new Error('storage unavailable');
      },
    });

    expect(failingRead.getSnapshot()).toBe('');
    expect(failingWrite.getSnapshot()).toBe('available');
  });
});

describe('SearchQueryStore updates', () => {
  it('updates synchronously, persists once, and notifies active subscribers once', () => {
    const writes: string[] = [];
    const store = createSearchQueryStore(createPorts({ writes }));
    const notifications: string[] = [];
    const unsubscribe = store.subscribe(() => {
      notifications.push(store.getSnapshot());
    });

    store.set('next');
    store.set('next');
    unsubscribe();
    store.set('after-unsubscribe');

    expect(store.getSnapshot()).toBe('after-unsubscribe');
    expect(writes).toEqual(['next', 'after-unsubscribe']);
    expect(notifications).toEqual(['next']);
  });

  it('keeps in-memory updates observable when persistence fails', () => {
    const store = createSearchQueryStore({
      locationSearch: () => '',
      readStoredQuery: () => null,
      writeStoredQuery: () => {
        throw new Error('storage unavailable');
      },
    });
    const notifications: string[] = [];
    store.subscribe(() => notifications.push(store.getSnapshot()));

    store.set('in-memory');

    expect(store.getSnapshot()).toBe('in-memory');
    expect(notifications).toEqual(['in-memory']);
  });

  it('isolates snapshots and subscriptions between store instances', () => {
    const first = createSearchQueryStore(createPorts());
    const second = createSearchQueryStore(createPorts());
    const firstNotifications: string[] = [];
    const secondNotifications: string[] = [];
    first.subscribe(() => firstNotifications.push(first.getSnapshot()));
    second.subscribe(() => secondNotifications.push(second.getSnapshot()));

    first.set('first');

    expect(first.getSnapshot()).toBe('first');
    expect(second.getSnapshot()).toBe('');
    expect(firstNotifications).toEqual(['first']);
    expect(secondNotifications).toEqual([]);
  });
});
