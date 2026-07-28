import { describe, expect, it } from 'vitest';
import type { OpenTabInfo, OpenWindowInfo } from '../../shared/openTabs';
import {
  createOpenTabsWorkflowState,
  projectOpenTabsWorkflow,
  reduceOpenTabsWorkflow,
} from './openTabsWorkflow';

function tab(
  id: number,
  overrides: Partial<OpenTabInfo> = {},
): OpenTabInfo {
  return {
    id,
    windowId: 1,
    title: `Tab ${id}`,
    url: `https://example.test/${id}`,
    favIconUrl: '',
    active: id === 1,
    pinned: false,
    index: id,
    browserGroup: null,
    storable: true,
    reason: null,
    ...overrides,
  };
}

function windowInfo(
  id: number,
  tabs: OpenTabInfo[],
  overrides: Partial<OpenWindowInfo> = {},
): OpenWindowInfo {
  return {
    id,
    focused: id === 1,
    incognito: false,
    tabCount: tabs.length,
    tabs,
    ...overrides,
  };
}

describe('Open Tabs workflow reducer', () => {
  it('structurally shares equivalent refresh rows and unchanged siblings', () => {
    const first = tab(1);
    const second = tab(2);
    const currentWindow = windowInfo(1, [first, second]);
    const initial = {
      ...createOpenTabsWorkflowState(),
      windows: [currentWindow],
      selectedWindowId: 1,
    };

    const equivalent = reduceOpenTabsWorkflow(initial, {
      type: 'refresh-succeeded',
      windows: [windowInfo(1, [tab(1), tab(2)])],
    });
    expect(equivalent.windows).toBe(initial.windows);
    expect(equivalent.windows[0]).toBe(currentWindow);
    expect(equivalent.windows[0]?.tabs).toBe(currentWindow.tabs);

    const changed = reduceOpenTabsWorkflow(initial, {
      type: 'refresh-succeeded',
      windows: [windowInfo(1, [tab(1), tab(2, { title: 'Updated' })])],
    });
    expect(changed.windows).not.toBe(initial.windows);
    expect(changed.windows[0]).not.toBe(currentWindow);
    expect(changed.windows[0]?.tabs[0]).toBe(first);
    expect(changed.windows[0]?.tabs[1]).not.toBe(second);
  });

  it('applies refresh atomically and removes selected IDs that are no longer selectable', () => {
    const initial = {
      ...createOpenTabsWorkflowState(),
      windows: [windowInfo(1, [tab(1), tab(2)])],
      selectedWindowId: 1,
      selectedTabIds: [1, 2],
    };

    const next = reduceOpenTabsWorkflow(initial, {
      type: 'refresh-succeeded',
      windows: [windowInfo(1, [tab(1), tab(2, { storable: false })])],
    });

    expect(next.windows[0]?.tabs).toHaveLength(2);
    expect(next.selectedWindowId).toBe(1);
    expect(next.selectedTabIds).toEqual([1]);
    expect(next.loading).toBe(false);
    expect(next.error).toBeNull();
  });

  it('clears selection when switching browser windows', () => {
    const initial = {
      ...createOpenTabsWorkflowState(),
      windows: [
        windowInfo(1, [tab(1)]),
        windowInfo(2, [{ ...tab(2), windowId: 2 }]),
      ],
      selectedWindowId: 1,
      selectedTabIds: [1],
    };

    const next = reduceOpenTabsWorkflow(initial, {
      type: 'window-selected',
      windowId: 2,
    });

    expect(next.selectedWindowId).toBe(2);
    expect(next.selectedTabIds).toEqual([]);
  });

  it('clears selection only when a persisted Open Tabs drop completes', () => {
    const selected = {
      ...createOpenTabsWorkflowState(),
      windows: [windowInfo(1, [tab(1), tab(2)])],
      selectedWindowId: 1,
      selectedTabIds: [1, 2],
    };

    const completed = reduceOpenTabsWorkflow(selected, { type: 'drop-completed' });
    const unchanged = reduceOpenTabsWorkflow(selected, { type: 'operation-failed', error: 'Drop failed' });

    expect(completed.selectedTabIds).toEqual([]);
    expect(unchanged.selectedTabIds).toEqual([1, 2]);
    expect(unchanged.error).toBe('Drop failed');
  });

  it('ignores selection toggles for missing or non-storable tabs', () => {
    const initial = {
      ...createOpenTabsWorkflowState(),
      windows: [windowInfo(1, [tab(1), tab(2, { storable: false })])],
      selectedWindowId: 1,
    };

    expect(reduceOpenTabsWorkflow(initial, {
      type: 'selection-toggled',
      tabId: 99,
    })).toBe(initial);
    expect(reduceOpenTabsWorkflow(initial, {
      type: 'selection-toggled',
      tabId: 2,
    })).toBe(initial);
  });

  it('projects filtered rows and selected drag records from one canonical state', () => {
    const first = tab(1, { title: 'Alpha' });
    const second = tab(2, { title: 'Beta', pinned: true });
    const blocked = tab(3, { title: 'Blocked', storable: false });
    const state = {
      ...createOpenTabsWorkflowState(),
      windows: [windowInfo(1, [first, second, blocked])],
      selectedWindowId: 1,
      selectedTabIds: [1, 2, 3],
      query: 'a',
    };

    const projection = projectOpenTabsWorkflow(state);

    expect(projection.filteredTabs.map(({ id }) => id)).toEqual([1, 2, 3]);
    expect(projection.selection).toEqual({
      active: true,
      ids: [1, 2],
      count: 2,
      records: [first, second],
      recordIds: [1, 2],
    });
  });
});
