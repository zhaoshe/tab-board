// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenTabsRuntime } from './useOpenTabsRuntime';
import { useOpenTabsRuntime } from './useOpenTabsRuntime';
import type { OpenWindowInfo } from '../core/open-tabs';

const testHarness = vi.hoisted(() => {
  const state = { activeWorkspaceId: 'workspace_default' };
  const useStore = vi.fn((selector: (value: typeof state) => unknown) => selector(state));
  Object.assign(useStore, { getState: () => state, setState: vi.fn() });

  return {
    sendMessage: vi.fn(),
    setSavedSearchQuery: vi.fn(),
    useStore,
  };
});

vi.mock('./useFilteredGroups', () => ({
  useSearchQuery: () => '',
  useSetSearchQuery: () => testHarness.setSavedSearchQuery,
}));

vi.mock('../../shared/store/useTabBoardStore', () => ({
  useTabBoardStore: testHarness.useStore,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const chromeEvent = () => ({
  addListener: vi.fn(),
  removeListener: vi.fn(),
});

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
    active: true,
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
let runtime: OpenTabsRuntime | null = null;

function RuntimeProbe(): null {
  runtime = useOpenTabsRuntime();
  return null;
}

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
  runtime = null;
  testHarness.sendMessage.mockReset();
  testHarness.setSavedSearchQuery.mockReset();
  testHarness.useStore.mockClear();

  vi.stubGlobal('chrome', {
    runtime: { sendMessage: testHarness.sendMessage },
    tabs: {
      onActivated: chromeEvent(),
      onCreated: chromeEvent(),
      onRemoved: chromeEvent(),
      onMoved: chromeEvent(),
      onAttached: chromeEvent(),
      onDetached: chromeEvent(),
      onReplaced: chromeEvent(),
      onUpdated: chromeEvent(),
    },
    windows: {
      onCreated: chromeEvent(),
      onRemoved: chromeEvent(),
      onFocusChanged: chromeEvent(),
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
    expect(runtime?.selectedWindowId).toBe(1);
  });
}

describe('Open Tabs runtime refresh', () => {
  it('exits selection mode when refresh removes every selected tab', async () => {
    await mountRuntime(createWindow([createTab()]));

    await act(async () => {
      runtime?.toggleTabSelection(1);
    });
    expect(runtime?.selectionMode).toBe(true);
    expect(runtime?.selectedTabIds).toEqual([1]);

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
      await runtime?.refresh();
    });

    expect(runtime?.selectedTabIds).toEqual([]);
    expect(runtime?.selectionMode).toBe(false);
  });
});
