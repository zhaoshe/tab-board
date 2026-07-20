import { describe, expect, it } from 'vitest';
import {
  canRevealCapture,
  createCaptureSnapshot,
  mergeCapturedGroups,
  shouldKeepPendingCaptureTarget,
  getCaptureMessage,
  getCaptureOutcome,
  sameCaptureSnapshot,
  shouldRevealCapture,
  sameCaptureCategorySnapshot,
  sameCaptureFilterSnapshot,
  type CaptureCategorySnapshot,
  type CaptureFilterSnapshot,
  type OpenTabsCaptureSnapshot,
} from './capture';
import { createEmptyState, type Group, type TabBoardState } from '../../shared/model';

function snapshot(input: Partial<OpenTabsCaptureSnapshot> = {}): OpenTabsCaptureSnapshot {
  return {
    selectedTabIds: [7, 2, 7],
    selectedWindowId: 4,
    workspaceId: 'workspace-a',
    isSelectionMode: true,
    ...input,
  };
}

function categorySnapshot(input: Partial<CaptureCategorySnapshot> = {}): CaptureCategorySnapshot {
  return {
    showBin: false,
    showStarred: false,
    selectedFolderId: 'folder-a',
    ...input,
  };
}

function filterSnapshot(input: Partial<CaptureFilterSnapshot> = {}): CaptureFilterSnapshot {
  return {
    searchQuery: 'folder-a',
    tabFilterUrl: null,
    ...input,
  };
}

function group(id: string, workspaceId: string): Group {
  return {
    id,
    title: id,
    note: '',
    workspaceId,
    folderId: null,
    locked: false,
    starred: false,
    collapsed: false,
    tabs: [],
    createdAt: `${id}-created`,
    updatedAt: `${id}-updated`,
  };
}

function boardState(updatedAt: string, groups: Group[], theme: TabBoardState['settings']['theme']): TabBoardState {
  const base = createEmptyState();
  return {
    ...base,
    updatedAt,
    groups,
    settings: { ...base.settings, theme },
  };
}

describe('capture contracts', () => {
  it('sorts and deduplicates IDs without mutating the input snapshot', () => {
    const input = snapshot();
    const result = createCaptureSnapshot(input);

    expect(result).toEqual({
      selectedTabIds: [2, 7],
      selectedWindowId: 4,
      workspaceId: 'workspace-a',
      isSelectionMode: true,
    });
    expect(input.selectedTabIds).toEqual([7, 2, 7]);
    expect(result).not.toBe(input);
    expect(result.selectedTabIds).not.toBe(input.selectedTabIds);
  });

  it('merges only missing captured groups into a newer optimistic state', () => {
    const currentBase = createEmptyState();
    const workspaceId = currentBase.activeWorkspaceId;
    const existingCapturedGroup = group('captured-existing', workspaceId);
    const optimisticGroup = group('optimistic-group', workspaceId);
    const missingCapturedGroup = group('captured-missing', workspaceId);
    const persistedOldGroup = group('persisted-old', workspaceId);
    const currentState = boardState('2026-07-16T12:00:02.000Z', [existingCapturedGroup, optimisticGroup], 'dark');
    const persistedState = boardState('2026-07-16T12:00:01.000Z', [missingCapturedGroup, existingCapturedGroup, persistedOldGroup], 'light');

    const merged = mergeCapturedGroups(
      currentState,
      persistedState,
      ['captured-missing', 'captured-existing'],
      workspaceId,
    );

    expect(merged.groups.map((item) => item.id)).toEqual([
      'captured-missing',
      'captured-existing',
      'optimistic-group',
    ]);
    expect(merged.groups.filter((item) => item.id === 'captured-existing')).toHaveLength(1);
    expect(merged.settings.theme).toBe('dark');
    expect(merged.updatedAt).toBe(currentState.updatedAt);
    expect(currentState.groups.map((item) => item.id)).toEqual(['captured-existing', 'optimistic-group']);
    expect(currentState.groups).not.toBe(merged.groups);
  });

  it('compares normalized snapshots regardless of selection order', () => {
    expect(sameCaptureSnapshot(
      snapshot({ selectedTabIds: [7, 2] }),
      snapshot({ selectedTabIds: [2, 7, 7] }),
    )).toBe(true);
  });

  it('does not clear selection or reveal after a changed-selection race', () => {
    expect(getCaptureOutcome({ committed: true, reconciled: true, selectionCurrent: false }))
      .toEqual({ isSaved: true, shouldClearSelection: false, shouldReveal: false });
  });

  it('does not clear selection or reveal after a committed but unreconciled capture', () => {
    expect(getCaptureOutcome({ committed: true, reconciled: false, selectionCurrent: true }))
      .toEqual({ isSaved: true, shouldClearSelection: false, shouldReveal: false });
  });

  it('clears current selection and reveals after a committed reconciled capture', () => {
    expect(getCaptureOutcome({ committed: true, reconciled: true, selectionCurrent: true }))
      .toEqual({ isSaved: true, shouldClearSelection: true, shouldReveal: true });
  });

  it('detects category changes while capture is pending', () => {
    expect(sameCaptureCategorySnapshot(
      categorySnapshot(),
      categorySnapshot({ selectedFolderId: null, showStarred: true }),
    )).toBe(false);
    expect(sameCaptureCategorySnapshot(categorySnapshot(), categorySnapshot())).toBe(true);
  });

  it('does not preserve reveal ownership after search or tab-filter changes', () => {
    expect(sameCaptureFilterSnapshot(
      filterSnapshot(),
      filterSnapshot({ searchQuery: 'new query' }),
    )).toBe(false);
    expect(sameCaptureFilterSnapshot(
      filterSnapshot(),
      filterSnapshot({ tabFilterUrl: 'https://example.com' }),
    )).toBe(false);
    expect(sameCaptureFilterSnapshot(filterSnapshot(), filterSnapshot())).toBe(true);
  });

  it('blocks filter cleanup when category or filter ownership changed', () => {
    const base = {
      sourceWorkspaceId: 'workspace-a',
      activeWorkspaceId: 'workspace-a',
      createdGroupIds: ['group-1'],
      categoryCurrent: true,
      filterCurrent: true,
    };
    expect(canRevealCapture({ ...base, categoryCurrent: false })).toBe(false);
    expect(canRevealCapture({ ...base, filterCurrent: false })).toBe(false);
    expect(canRevealCapture(base)).toBe(true);
  });

  it('clears pending capture targets after category, filter, or visibility changes', () => {
    const targetCategorySnapshot = categorySnapshot({ selectedFolderId: null });
    const targetFilterSnapshot = filterSnapshot({ searchQuery: '' });
    const base = {
      targetCategorySnapshot,
      currentCategorySnapshot: targetCategorySnapshot,
      targetFilterSnapshot,
      currentFilterSnapshot: targetFilterSnapshot,
      targetGroupExists: true,
      elementFound: true,
    };
    expect(shouldKeepPendingCaptureTarget({
      ...base,
      currentCategorySnapshot: categorySnapshot({ showStarred: true, selectedFolderId: null }),
    })).toBe(false);
    expect(shouldKeepPendingCaptureTarget({
      ...base,
      currentFilterSnapshot: filterSnapshot({ searchQuery: 'new query' }),
    })).toBe(false);
    expect(shouldKeepPendingCaptureTarget({
      ...base,
      currentFilterSnapshot: filterSnapshot({ tabFilterUrl: 'https://other.example.com' }),
    })).toBe(false);
    expect(shouldKeepPendingCaptureTarget({ ...base, elementFound: false })).toBe(false);
    expect(shouldKeepPendingCaptureTarget(base)).toBe(true);
  });

  it('does not reveal after a changed-workspace race', () => {
    expect(shouldRevealCapture({
      sourceWorkspaceId: 'workspace-a',
      activeWorkspaceId: 'workspace-b',
      createdGroupIds: ['group-1'],
    })).toBe(false);
  });

  it('reveals only when the source workspace remains active and groups were created', () => {
    expect(shouldRevealCapture({
      sourceWorkspaceId: 'workspace-a',
      activeWorkspaceId: 'workspace-a',
      createdGroupIds: ['group-1'],
    })).toBe(true);
    expect(shouldRevealCapture({
      sourceWorkspaceId: 'workspace-a',
      activeWorkspaceId: 'workspace-a',
      createdGroupIds: [],
    })).toBe(false);
  });

  it('reports committed-but-unreconciled capture without suggesting retry', () => {
    expect(getCaptureMessage({ committed: true, reconciled: false }))
      .toBe('Session was saved, but TabBoard could not locate it.');
    expect(getCaptureMessage({ committed: true, reconciled: true })).toBe('Tabs saved successfully.');
    expect(getCaptureMessage({ committed: false, reconciled: false })).toBe('Unable to save tabs.');
  });
});
