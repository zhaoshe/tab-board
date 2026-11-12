// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Group } from '../../shared/model';
import { useBookmarkSessions } from './useBookmarkSessions';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function bookmarkGroup(id: string, title: string): Group {
  return {
    id,
    title,
    note: '',
    workspaceId: 'workspace_default',
    folderId: null,
    locked: true,
    starred: false,
    archived: false,
    collapsed: false,
    tabs: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

type RuntimeResponse =
  | { ok: true; result: { groups: Group[] } }
  | { ok: false; error: string };

const testHarness = {
  addListener: vi.fn(),
  removeListener: vi.fn(),
  listeners: new Set<(message: { type?: string }) => void>(),
  sendMessage: vi.fn<(message: Record<string, unknown>) => Promise<RuntimeResponse>>(),
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latest: ReturnType<typeof useBookmarkSessions> | null = null;

function snapshotState(value: ReturnType<typeof useBookmarkSessions> | null) {
  if (Array.isArray(value)) {
    return {
      groups: value,
      loading: false,
      error: null as string | null,
      retry: () => undefined,
    };
  }
  return value ?? {
    groups: [],
    loading: false,
    error: null as string | null,
    retry: () => undefined,
  };
}

function emitBookmarkChange() {
  for (const listener of [...testHarness.listeners]) {
    listener({ type: 'tabboard-bookmarks-changed' });
  }
}

function Probe({ workspaceId }: { workspaceId: string }) {
  latest = useBookmarkSessions(workspaceId);
  const snapshot = snapshotState(latest);
  return createElement(
    'output',
    {
      id: 'bookmark-state',
      'data-loading': snapshot.loading ? 'true' : 'false',
      'data-error': snapshot.error ?? '',
      'data-groups': snapshot.groups.map((group) => group.title).join('|'),
    },
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
  latest = null;
  testHarness.listeners.clear();
  testHarness.addListener.mockReset();
  testHarness.removeListener.mockReset();
  testHarness.sendMessage.mockReset();
  testHarness.addListener.mockImplementation((listener: (message: { type?: string }) => void) => {
    testHarness.listeners.add(listener);
  });
  testHarness.removeListener.mockImplementation((listener: (message: { type?: string }) => void) => {
    testHarness.listeners.delete(listener);
  });

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        sendMessage: testHarness.sendMessage,
        onMessage: {
          addListener: testHarness.addListener,
          removeListener: testHarness.removeListener,
        },
      },
    },
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  latest = null;
  delete (globalThis as { chrome?: typeof chrome }).chrome;
});

async function mountProbe(workspaceId = 'workspace_default'): Promise<void> {
  root = createRoot(container!);
  await act(async () => {
    root?.render(createElement(Probe, { workspaceId }));
  });
}

async function rerenderProbe(workspaceId: string): Promise<void> {
  await act(async () => {
    root?.render(createElement(Probe, { workspaceId }));
  });
}

describe('useBookmarkSessions', () => {
  it('ignores stale resolved responses that finish after a newer refresh', async () => {
    const first = deferred<RuntimeResponse>();
    const second = deferred<RuntimeResponse>();
    testHarness.sendMessage
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    await mountProbe();

    expect(snapshotState(latest).loading).toBe(true);
    expect(snapshotState(latest).groups).toEqual([]);

    await act(async () => {
      emitBookmarkChange();
    });

    expect(snapshotState(latest).loading).toBe(true);
    expect(testHarness.sendMessage).toHaveBeenNthCalledWith(1, {
      type: 'list-bookmarks',
      workspaceId: 'workspace_default',
    });
    expect(testHarness.sendMessage).toHaveBeenNthCalledWith(2, {
      type: 'list-bookmarks',
      workspaceId: 'workspace_default',
    });

    await act(async () => {
      second.resolve({
        ok: true,
        result: { groups: [bookmarkGroup('bookmark-folder-new', 'Newest')] },
      });
      await second.promise;
    });

    expect(snapshotState(latest).loading).toBe(false);
    expect(snapshotState(latest).error).toBeNull();
    expect(snapshotState(latest).groups.map(({ title }) => title)).toEqual(['Newest']);

    await act(async () => {
      first.resolve({
        ok: true,
        result: { groups: [bookmarkGroup('bookmark-folder-old', 'Older')] },
      });
      await first.promise;
    });

    expect(snapshotState(latest).groups.map(({ title }) => title)).toEqual(['Newest']);
    expect(snapshotState(latest).error).toBeNull();
    expect(snapshotState(latest).loading).toBe(false);
  });

  it('ignores stale rejected requests and keeps the current request loading', async () => {
    const first = deferred<RuntimeResponse>();
    const second = deferred<RuntimeResponse>();
    testHarness.sendMessage
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    await mountProbe();

    await act(async () => {
      emitBookmarkChange();
    });

    await act(async () => {
      first.reject(new Error('Stale failure'));
      try {
        await first.promise;
      } catch {}
    });

    expect(snapshotState(latest).loading).toBe(true);
    expect(snapshotState(latest).error).toBeNull();
    expect(snapshotState(latest).groups).toEqual([]);

    await act(async () => {
      second.resolve({
        ok: true,
        result: { groups: [bookmarkGroup('bookmark-folder-current', 'Current')] },
      });
      await second.promise;
    });

    expect(snapshotState(latest).loading).toBe(false);
    expect(snapshotState(latest).error).toBeNull();
    expect(snapshotState(latest).groups.map(({ title }) => title)).toEqual(['Current']);
  });

  it('keeps the last successful bookmark list on failure and retries explicitly', async () => {
    const initial = deferred<RuntimeResponse>();
    const failedRefresh = deferred<RuntimeResponse>();
    const retryRefresh = deferred<RuntimeResponse>();
    testHarness.sendMessage
      .mockImplementationOnce(() => initial.promise)
      .mockImplementationOnce(() => failedRefresh.promise)
      .mockImplementationOnce(() => retryRefresh.promise);

    await mountProbe();

    await act(async () => {
      initial.resolve({
        ok: true,
        result: { groups: [bookmarkGroup('bookmark-folder-stable', 'Stable')] },
      });
      await initial.promise;
    });

    expect(snapshotState(latest).groups.map(({ title }) => title)).toEqual(['Stable']);
    expect(snapshotState(latest).error).toBeNull();
    expect(snapshotState(latest).loading).toBe(false);

    await act(async () => {
      emitBookmarkChange();
    });

    await act(async () => {
      failedRefresh.resolve({ ok: false, error: 'Unable to refresh bookmarks.' });
      await failedRefresh.promise;
    });

    expect(snapshotState(latest).groups.map(({ title }) => title)).toEqual(['Stable']);
    expect(snapshotState(latest).error).toBe('Unable to refresh bookmarks.');
    expect(snapshotState(latest).loading).toBe(false);

    await act(async () => {
      snapshotState(latest).retry();
    });

    expect(snapshotState(latest).loading).toBe(true);
    expect(snapshotState(latest).error).toBeNull();
    expect(snapshotState(latest).groups.map(({ title }) => title)).toEqual(['Stable']);

    await act(async () => {
      retryRefresh.resolve({
        ok: true,
        result: { groups: [bookmarkGroup('bookmark-folder-retried', 'Retried')] },
      });
      await retryRefresh.promise;
    });

    expect(snapshotState(latest).loading).toBe(false);
    expect(snapshotState(latest).error).toBeNull();
    expect(snapshotState(latest).groups.map(({ title }) => title)).toEqual(['Retried']);
  });

  it('cleans up stale workspace and unmounted requests before they publish', async () => {
    const workspaceA = deferred<RuntimeResponse>();
    const workspaceB = deferred<RuntimeResponse>();
    const afterUnmount = deferred<RuntimeResponse>();
    testHarness.sendMessage
      .mockImplementationOnce(() => workspaceA.promise)
      .mockImplementationOnce(() => workspaceB.promise)
      .mockImplementationOnce(() => afterUnmount.promise);

    await mountProbe('workspace-a');

    await rerenderProbe('workspace-b');

    expect(testHarness.sendMessage).toHaveBeenNthCalledWith(1, {
      type: 'list-bookmarks',
      workspaceId: 'workspace-a',
    });
    expect(testHarness.sendMessage).toHaveBeenNthCalledWith(2, {
      type: 'list-bookmarks',
      workspaceId: 'workspace-b',
    });

    await act(async () => {
      workspaceA.resolve({
        ok: true,
        result: { groups: [bookmarkGroup('bookmark-folder-a', 'Workspace A')] },
      });
      await workspaceA.promise;
    });

    expect(snapshotState(latest).loading).toBe(true);
    expect(snapshotState(latest).groups).toEqual([]);

    await act(async () => {
      workspaceB.resolve({
        ok: true,
        result: { groups: [bookmarkGroup('bookmark-folder-b', 'Workspace B')] },
      });
      await workspaceB.promise;
    });

    expect(snapshotState(latest).loading).toBe(false);
    expect(snapshotState(latest).groups.map(({ title }) => title)).toEqual(['Workspace B']);

    await act(async () => {
      emitBookmarkChange();
    });

    expect(testHarness.sendMessage).toHaveBeenNthCalledWith(3, {
      type: 'list-bookmarks',
      workspaceId: 'workspace-b',
    });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => root?.unmount());
    root = null;

    await act(async () => {
      afterUnmount.resolve({
        ok: true,
        result: { groups: [bookmarkGroup('bookmark-folder-after', 'After unmount')] },
      });
      await afterUnmount.promise;
    });

    expect(testHarness.listeners.size).toBe(0);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
