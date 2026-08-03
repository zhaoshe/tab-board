// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyState } from '../../shared/model';
import type { OpenTabsWorkflow } from './useOpenTabsRuntime';
import { useOpenTabsRuntime } from './useOpenTabsRuntime';
import type { OpenWindowInfo } from '../../shared/openTabs';
import {
  isDropPayloadWithinLimits,
  isOpenTabInfoShape,
} from '../../shared/model/drop-validation';

const testHarness = vi.hoisted(() => {
  const state = {} as ReturnType<typeof import('../../shared/model').createEmptyState>;
  const useStore = vi.fn((selector: (value: typeof state) => unknown) => selector(state));
  Object.assign(useStore, { getState: () => state, setState: vi.fn() });

  return {
    getPersistedState: vi.fn(),
    savedSearchQuery: '',
    sendMessage: vi.fn(),
    setSavedSearchQuery: vi.fn(),
    state,
    useStore,
  };
});

vi.mock('./useSearchQuery', () => ({
  savedSearchQueryStore: {
    getSnapshot: () => testHarness.savedSearchQuery,
    subscribe: () => () => undefined,
    set: (value: string) => testHarness.setSavedSearchQuery(value),
  },
  useSearchQuery: () => testHarness.savedSearchQuery,
  useSetSearchQuery: () => testHarness.setSavedSearchQuery,
}));

vi.mock('../../shared/store/useTabBoardStore', () => ({
  useTabBoardStore: testHarness.useStore,
}));

vi.mock('../../shared/store/chromeStorage', () => ({
  getState: testHarness.getPersistedState,
}));

vi.mock('../../shared/store/stateStructuralSharing', () => ({
  structurallyShareState: (_current: unknown, next: unknown) => next,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function chromeEvent() {
  let listener: ((...args: any[]) => void) | null = null;
  return {
    addListener: vi.fn((next: (...args: any[]) => void) => {
      listener = next;
    }),
    removeListener: vi.fn((current: (...args: any[]) => void) => {
      if (listener === current) listener = null;
    }),
    getListener: () => listener,
  };
}

let chromeEvents: {
  onActivated: ReturnType<typeof chromeEvent>;
  onCreated: ReturnType<typeof chromeEvent>;
  onRemoved: ReturnType<typeof chromeEvent>;
  onMoved: ReturnType<typeof chromeEvent>;
  onAttached: ReturnType<typeof chromeEvent>;
  onDetached: ReturnType<typeof chromeEvent>;
  onReplaced: ReturnType<typeof chromeEvent>;
  onUpdated: ReturnType<typeof chromeEvent>;
  onWindowCreated: ReturnType<typeof chromeEvent>;
  onWindowRemoved: ReturnType<typeof chromeEvent>;
  onWindowFocusChanged: ReturnType<typeof chromeEvent>;
};

function createWindow(tabs: OpenWindowInfo['tabs']): OpenWindowInfo[] {
  return [{
    id: 1,
    focused: true,
    incognito: false,
    tabCount: tabs.length,
    tabs,
  }];
}

function createTab(overrides: Partial<OpenWindowInfo['tabs'][number]> = {}): OpenWindowInfo['tabs'][number] {
  return {
    id: 1,
    windowId: 1,
    title: 'Example',
    url: 'https://example.test',
    favIconUrl: '',
    pinned: false,
    index: 0,
    browserGroup: null,
    storable: true,
    reason: null,
    ...overrides,
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let runtime: OpenTabsWorkflow | null = null;

function RuntimeProbe(): null {
  runtime = useOpenTabsRuntime();
  return null;
}

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
  runtime = null;
  Object.assign(testHarness.state, createEmptyState());
  testHarness.getPersistedState.mockReset();
  testHarness.savedSearchQuery = '';
  testHarness.sendMessage.mockReset();
  testHarness.setSavedSearchQuery.mockReset();
  testHarness.setSavedSearchQuery.mockImplementation((value: string) => {
    testHarness.savedSearchQuery = value;
  });
  testHarness.useStore.mockClear();
  chromeEvents = {
    onActivated: chromeEvent(),
    onCreated: chromeEvent(),
    onRemoved: chromeEvent(),
    onMoved: chromeEvent(),
    onAttached: chromeEvent(),
    onDetached: chromeEvent(),
    onReplaced: chromeEvent(),
    onUpdated: chromeEvent(),
    onWindowCreated: chromeEvent(),
    onWindowRemoved: chromeEvent(),
    onWindowFocusChanged: chromeEvent(),
  };

  vi.stubGlobal('chrome', {
    runtime: {
      getURL: (path: string) => `chrome-extension://tabboard/${path}`,
      sendMessage: testHarness.sendMessage,
    },
    tabs: {
      onActivated: chromeEvents.onActivated,
      onCreated: chromeEvents.onCreated,
      onRemoved: chromeEvents.onRemoved,
      onMoved: chromeEvents.onMoved,
      onAttached: chromeEvents.onAttached,
      onDetached: chromeEvents.onDetached,
      onReplaced: chromeEvents.onReplaced,
      onUpdated: chromeEvents.onUpdated,
    },
    windows: {
      onCreated: chromeEvents.onWindowCreated,
      onRemoved: chromeEvents.onWindowRemoved,
      onFocusChanged: chromeEvents.onWindowFocusChanged,
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
  vi.unstubAllGlobals();
});

async function mountRuntime(windows: OpenWindowInfo[]): Promise<void> {
  testHarness.sendMessage.mockResolvedValueOnce({ ok: true, result: { windows } });
  root = createRoot(container!);
  await act(async () => {
    root?.render(createElement(RuntimeProbe));
  });
  await vi.waitFor(() => {
    expect(runtime?.model.selectedWindowId).toBe(1);
  });
}

describe('Open Tabs runtime refresh', () => {
  it('canonicalizes a legacy list response before rows reach the drop boundary', async () => {
    const legacyTab = {
      ...createTab({
        browserGroup: {
          sourceGroupId: 7,
          title: 'Research',
          color: 'blue',
          collapsed: false,
        },
      }),
      active: true,
      legacyExtra: 'strip me',
    };

    await mountRuntime(createWindow([legacyTab]));

    const refreshedTab = runtime?.model.windows[0]?.tabs[0];
    expect(refreshedTab).toEqual(createTab({
      browserGroup: {
        sourceGroupId: 7,
        title: 'Research',
        color: 'blue',
        collapsed: false,
      },
    }));
    expect(isOpenTabInfoShape(refreshedTab)).toBe(true);
    expect(isDropPayloadWithinLimits(
      'runtime-copy-operation',
      {
        kind: 'copy-open-tabs',
        workspaceId: 'workspace_default',
        tabIds: [1],
        windowId: 1,
        targetGroupId: 'target-group',
        targetIndex: 0,
      },
      [refreshedTab],
    )).toBe(true);
  });

  it('coalesces a startup event burst into one trailing list request', async () => {
    vi.useFakeTimers();
    let resolveInitial!: (value: unknown) => void;
    const initial = new Promise((resolve) => {
      resolveInitial = resolve;
    });
    testHarness.sendMessage
      .mockReturnValueOnce(initial)
      .mockResolvedValue({
        ok: true,
        result: { windows: createWindow([createTab()]) },
      });
    root = createRoot(container!);
    await act(async () => {
      root?.render(createElement(RuntimeProbe));
      await Promise.resolve();
    });
    expect(testHarness.sendMessage).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      chromeEvents.onActivated.getListener()?.({ tabId: 1, windowId: 1 });
      chromeEvents.onRemoved.getListener()?.(2, { windowId: 1, isWindowClosing: false });
      chromeEvents.onWindowFocusChanged.getListener()?.(1);
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(testHarness.sendMessage).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInitial({
        ok: true,
        result: { windows: createWindow([createTab()]) },
      });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(75);
    });
    expect(testHarness.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('clears invalid selected IDs without owning selection mode', async () => {
    await mountRuntime(createWindow([createTab()]));

    await act(async () => {
      runtime?.commands.toggleSelection(1);
    });
    expect(runtime?.model.selection.ids).toEqual([1]);

    testHarness.sendMessage.mockResolvedValueOnce({
      ok: true,
      result: {
        windows: createWindow([createTab({
          storable: false,
          reason: 'Matches custom filter rule',
        })]),
      },
    });
    await act(async () => {
      await runtime?.commands.refresh();
    });

    expect(runtime?.model.selection.ids).toEqual([]);
    expect(runtime?.model.selection).not.toHaveProperty('active');
  });

  it('returns selected capture completion directly without dispatching a global event', async () => {
    await mountRuntime(createWindow([createTab()]));
    await act(async () => {
      runtime?.commands.toggleSelection(1);
    });
    const persisted = createEmptyState();
    persisted.groups = [{
      id: 'captured-group',
      title: 'Captured',
      note: '',
      workspaceId: persisted.activeWorkspaceId,
      folderId: null,
      locked: false,
      starred: false,
      archived: false,
      collapsed: false,
      tabs: [],
      createdAt: persisted.createdAt,
      updatedAt: persisted.updatedAt,
    }];
    testHarness.getPersistedState.mockResolvedValueOnce(persisted);
    testHarness.sendMessage
      .mockResolvedValueOnce({
        ok: true,
        result: {
          storedTabs: 1,
          storedGroups: 1,
          cleanedDuplicates: 0,
          createdGroupIds: ['captured-group'],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: { windows: createWindow([createTab()]) },
      });
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent');

    let completion: Awaited<ReturnType<OpenTabsWorkflow['commands']['captureSelection']>> = null;
    await act(async () => {
      completion = await runtime?.commands.captureSelection(
        { showBin: false, category: 'inbox' },
        () => ({ showBin: false, category: 'inbox' }),
      ) ?? null;
    });

    expect(completion).toMatchObject({
      committed: true,
      reconciled: true,
      selectionCurrent: true,
      createdGroupIds: ['captured-group'],
      result: { storedTabs: 1 },
    });
    expect(runtime?.model.selection.ids).toEqual([]);
    expect(dispatchEvent.mock.calls.some(([event]) =>
      event.type === 'tabboard-capture-completed')).toBe(false);
  });

  it('captures every eligible tab in the selected window through the existing worker contract', async () => {
    const capturable = createTab({ id: 1 });
    const second = createTab({ id: 2, title: 'Second', url: 'https://second.test', index: 1 });
    const excluded = createTab({
      id: 3,
      title: 'Excluded',
      url: 'https://excluded.test',
      index: 2,
      storable: false,
      reason: 'Matches custom filter rule',
    });
    await mountRuntime(createWindow([capturable, second, excluded]));

    const persisted = createEmptyState();
    persisted.groups = [{
      id: 'window-capture',
      title: 'Window Capture',
      note: '',
      workspaceId: persisted.activeWorkspaceId,
      folderId: null,
      locked: false,
      starred: false,
      archived: false,
      collapsed: false,
      tabs: [],
      createdAt: persisted.createdAt,
      updatedAt: persisted.updatedAt,
    }];
    testHarness.getPersistedState.mockResolvedValueOnce(persisted);
    testHarness.sendMessage
      .mockResolvedValueOnce({
        ok: true,
        result: {
          storedTabs: 2,
          storedGroups: 1,
          cleanedDuplicates: 0,
          createdGroupIds: ['window-capture'],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: { windows: createWindow([capturable, second, excluded]) },
      });

    let completion: Awaited<ReturnType<OpenTabsWorkflow['commands']['captureWindow']>> = null;
    await act(async () => {
      completion = await runtime?.commands.captureWindow(
        { showBin: false, category: 'inbox' },
        () => ({ showBin: false, category: 'inbox' }),
      ) ?? null;
    });

    expect(testHarness.sendMessage).toHaveBeenNthCalledWith(2, {
      type: 'saveSelectedTabs',
      tabIds: [1, 2],
      selectedWindowId: 1,
      workspaceId: persisted.activeWorkspaceId,
    });
    expect(completion).toMatchObject({
      committed: true,
      reconciled: true,
      selectionCurrent: true,
      createdGroupIds: ['window-capture'],
    });
    expect(runtime?.model.selection.ids).toEqual([]);
  });

  it('captures a URL filter set in the same call stack before React effects run', async () => {
    const tab = createTab({ url: 'https://filter.test/path' });
    await mountRuntime(createWindow([tab]));
    await act(async () => {
      runtime?.commands.toggleSelection(tab.id);
    });

    let rejectCapture!: (reason?: unknown) => void;
    const pendingCapture = new Promise((_, reject) => {
      rejectCapture = reject;
    });
    testHarness.sendMessage
      .mockReturnValueOnce(pendingCapture)
      .mockResolvedValueOnce({
        ok: true,
        result: { windows: createWindow([tab]) },
      });

    let completionPromise: ReturnType<OpenTabsWorkflow['commands']['captureSelection']> | null = null;
    await act(async () => {
      runtime?.commands.filterSessionsByTab(tab);
      completionPromise = runtime?.commands.captureSelection(
        { showBin: false, category: 'inbox' },
        () => ({ showBin: false, category: 'inbox' }),
      ) ?? null;
    });

    let completion: Awaited<ReturnType<OpenTabsWorkflow['commands']['captureSelection']>> = null;
    await act(async () => {
      rejectCapture(new Error('capture failed'));
      completion = await completionPromise;
    });

    expect(completion).toMatchObject({
      committed: false,
      filterCurrent: true,
      targetFilterSnapshot: {
        tabFilterUrl: tab.url,
        searchQuery: tab.url,
      },
    });
  });
});
