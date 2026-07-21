import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  getDragEndTarget,
  getFinishedDragState,
  isPointWithinRect,
  getWorkspaceFiltersAfterDelete,
  persistDropWithFeedback,
  shouldInvalidateDragReplacement,
} from './ManagerLayout';
import type { DropTarget } from '../../core/dnd';

const source = readFileSync(resolve(process.cwd(), 'src/manager/components/shell/ManagerLayout.tsx'), 'utf8');
const runtimeSource = readFileSync(resolve(process.cwd(), 'src/manager/hooks/useOpenTabsRuntime.ts'), 'utf8');

describe('tooltip dismissal', () => {
  it('dismisses active tooltips whenever a pointer press starts', () => {
    expect(source).toContain('function ManagerTooltipDismissal()');
    expect(source).toContain("document.querySelectorAll<HTMLElement>('[aria-describedby]')");
    expect(source).toContain("new MouseEvent('mouseout'");
    expect(source).toContain("document.addEventListener('pointerdown', dismiss, true)");
  });
});

describe('drag end lifecycle', () => {
  const validTarget: DropTarget = {
    kind: 'group-body',
    groupId: 'target',
    workspaceId: 'workspace_default',
  };

  it('does not reuse a locked target when release happens outside', () => {
    const over = {
      data: { current: { dnd: { targets: [validTarget] } } },
    } as never;

    expect(getDragEndTarget(over, validTarget)).toEqual(validTarget);
    expect(getDragEndTarget(null, validTarget)).toBeNull();
  });

  it('prefers the latest geometry target over stale UI state on the same droppable', () => {
    const lockedTarget: DropTarget = {
      kind: 'tab-before',
      groupId: 'target',
      tabId: 'tab-b',
      index: 1,
      placement: 'after',
      workspaceId: 'workspace_default',
    };
    const staleUiTarget: DropTarget = {
      kind: 'tab-before',
      groupId: 'target',
      tabId: 'tab-a',
      index: 0,
      workspaceId: 'workspace_default',
    };
    const over = {
      id: 'group-target',
      data: { current: { dnd: { targets: [staleUiTarget] } } },
    } as never;

    expect(getDragEndTarget(over, lockedTarget, staleUiTarget)).toEqual(lockedTarget);
  });

  it('wires geometry target precedence without collapsing it into UI state fallback', () => {
    expect(source).toContain(`event.over,\n        lockedTargetRef.current,\n        dragUiStateRef.current.target,`);
    expect(source).not.toContain('dragUiStateRef.current.target ?? lockedTargetRef.current');
  });

  it('invalidates only replaced or disappeared drag sources', () => {
    const payload = { kind: 'group', groupId: 'group-a', workspaceId: 'workspace_default' } as const;
    const snapshot = { workspaceId: 'workspace_default', category: 'inbox' as const, view: 'workspace', groups: 'group-a' };
    expect(shouldInvalidateDragReplacement(null, payload, snapshot, snapshot, true)).toBe(false);
    expect(shouldInvalidateDragReplacement('group-a', payload, snapshot, snapshot, true)).toBe(false);
    expect(shouldInvalidateDragReplacement('group-a', payload, snapshot, { ...snapshot, groups: 'group-b' }, true)).toBe(true);
    expect(shouldInvalidateDragReplacement('group-a', payload, snapshot, snapshot, false)).toBe(true);
  });

  it('clears active drag state through one finish-state helper', () => {
    const finished = getFinishedDragState({
      payload: { kind: 'group', groupId: 'group-a', workspaceId: 'workspace_default' },
      target: validTarget,
      marker: { kind: 'group', index: 0 },
      sourceRect: { left: 1, top: 2, width: 3, height: 4 },
    });
    expect(finished.activeId).toBeNull();
    expect(finished.dragUiState).toEqual({ payload: null, target: null, marker: null, sourceRect: null });
  });

  it('suppresses no-op session targets before rendering a marker', () => {
    expect(source).toContain("payload?.kind === 'group' && !resolveDrop({ payload, target, state: useTabBoardStore.getState() })");
    expect(source).toContain('target: null, marker: null');
  });
});

describe('category drag targets', () => {
  const categoryRect = { left: 100, right: 200, top: 20, bottom: 60 } as DOMRect;

  it('only activates when the pointer is inside the category itself', () => {
    expect(isPointWithinRect({ x: 150, y: 40 }, categoryRect)).toBe(true);
    expect(isPointWithinRect({ x: 99, y: 40 }, categoryRect)).toBe(false);
  });

  it('prioritizes the category under the pointer over an existing insertion lock', () => {
    expect(source).toContain("const categoryCandidate = candidates.find((item) => item.target.kind === 'category-column');");
    expect(source).toContain('const target = categoryCandidate?.target ?? lockDropTarget(');
  });
});

describe('drag persistence feedback', () => {
  it('shows success only after persistence resolves', async () => {
    let resolvePersistence: (() => void) | undefined;
    const apply = () => new Promise<void>((resolve) => { resolvePersistence = resolve; });
    const showSuccess = vi.fn();
    const showError = vi.fn();

    const result = persistDropWithFeedback(apply, showSuccess, showError);
    expect(showSuccess).not.toHaveBeenCalled();
    resolvePersistence?.();

    await expect(result).resolves.toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Drop saved', 'Drop complete');
    expect(showError).not.toHaveBeenCalled();
  });

  it('shows error for synchronous persistence failure', async () => {
    const error = new Error('sync failure');
    const showSuccess = vi.fn();
    const showError = vi.fn();

    await expect(persistDropWithFeedback(() => { throw error; }, showSuccess, showError)).resolves.toBe(false);
    expect(showSuccess).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledTimes(1);
    expect(showError).toHaveBeenCalledWith('sync failure', 'Drop failed');
  });

  it('shows error for asynchronous persistence failure', async () => {
    const showSuccess = vi.fn();
    const showError = vi.fn();

    await expect(persistDropWithFeedback(
      () => Promise.reject(new Error('worker failure')),
      showSuccess,
      showError,
    )).resolves.toBe(false);
    expect(showSuccess).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledTimes(1);
    expect(showError).toHaveBeenCalledWith('worker failure', 'Drop failed');
  });
});

describe('workspace deletion filters', () => {
  it('clears the selected category and all category UI modes', () => {
    expect(getWorkspaceFiltersAfterDelete()).toEqual({
      category: 'inbox',
      showBin: false,
    });
  });
});

describe('Task106 manager shell contracts', () => {
  it('does not wire the removed keyboard shortcuts action or modal', () => {
    expect(source).not.toContain('KeyboardShortcutsHelp');
    expect(source).not.toContain('shortcutsOpened');
    expect(source).not.toContain('onOpenShortcuts');
  });
});

describe('Task108 target reveal contracts', () => {
  it('retries a missed lookup after the target filter renders without a delay poll', () => {
    expect(source).toContain('const [pendingTargetGroupId, setPendingTargetGroupId] = useState<string | null>(null);');
    expect(source).toContain('setPendingTargetGroupId(targetGroupId);');
    expect(source).toContain('if (!element) return;');
    expect(source).toContain('pendingTargetFilterSnapshot');
    expect(source).toContain('tabFilterUrl');
    expect(source).toContain('}, [');
    expect(source).toContain("params.delete('targetGroupId')");
    expect(source).toContain('window.history.replaceState');
    expect(source).toContain('clearTimeout(highlightTimeoutRef.current)');
    expect(source).not.toContain('}, 100);');
  });

  it('clears persisted search only when accepting a valid target group', () => {
    expect(source).toContain('useSetSearchQuery');
    expect(source).toContain('const setSearchQuery = useSetSearchQuery();');
    const targetStart = source.indexOf('const targetGroupId =');
    const targetEnd = source.indexOf('const feedback =', targetStart);
    const targetHandling = source.slice(targetStart, targetEnd);
    const validTargetIndex = targetHandling.indexOf('if (targetGroup) {');
    const clearSearchIndex = targetHandling.indexOf("setSearchQuery('');");
    expect(validTargetIndex).toBeGreaterThanOrEqual(0);
    expect(clearSearchIndex).toBeGreaterThan(validTargetIndex);
    expect([...source.matchAll(/setSearchQuery\(''\)/g)]).toHaveLength(1);
  });
});

describe('Task174 capture selection ownership contracts', () => {
  it('guards category/filter reset and pending reveal after capture toast', () => {
    const handlerStart = source.indexOf('const handleCaptureCompleted');
    const toastIndex = source.indexOf('showSuccess(', handlerStart);
    const selectionGuardIndex = source.indexOf('if (!detail.selectionCurrent) return;', toastIndex);
    const filterOwnershipIndex = source.indexOf('if (!detail.filterCurrent) return;', selectionGuardIndex);
    const resetIndices = [
      source.indexOf('setShowBin(false);', selectionGuardIndex),
      source.indexOf('setSelectedCategory(\'inbox\');', selectionGuardIndex),
    ];
    const pendingTargetIndices = [
      source.indexOf('setPendingTargetWorkspaceId(detail.sourceWorkspaceId);', selectionGuardIndex),
      source.indexOf('setPendingTargetGroupId(createdGroupId);', selectionGuardIndex),
      source.indexOf('setPendingTargetCategorySnapshot(detail.targetCategorySnapshot);', selectionGuardIndex),
      source.indexOf('setPendingTargetFilterSnapshot(detail.targetFilterSnapshot);', selectionGuardIndex),
    ];

    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(toastIndex).toBeGreaterThan(handlerStart);
    expect(selectionGuardIndex).toBeGreaterThan(toastIndex);
    expect(filterOwnershipIndex).toBeGreaterThan(selectionGuardIndex);
    resetIndices.forEach((index) => expect(index).toBeGreaterThan(selectionGuardIndex));
    pendingTargetIndices.forEach((index) => expect(index).toBeGreaterThan(selectionGuardIndex));
  });
});

describe('Task110 capture category race contracts', () => {
  it('checks capture-start category before resetting category or revealing', () => {
    expect(source).toContain('sameCaptureCategorySnapshot');
    expect(source).toContain('if (!detail.filterCurrent) return;');
    expect(source).toContain('const currentCategorySnapshot: CaptureCategorySnapshot = {');
    expect(source).toContain('currentCategorySnapshotRef.current');
    const categoryGuardIndex = source.indexOf('sameCaptureCategorySnapshot(');
    const filterGuardIndex = source.indexOf('if (!detail.filterCurrent) return;');
    const resetIndex = source.indexOf('setShowBin(false);', categoryGuardIndex);
    expect(categoryGuardIndex).toBeGreaterThanOrEqual(0);
    expect(filterGuardIndex).toBeGreaterThanOrEqual(0);
    expect(resetIndex).toBeGreaterThan(categoryGuardIndex);
    expect(resetIndex).toBeGreaterThan(filterGuardIndex);
  });

  it('keeps runtime filter cleanup behind category ownership', () => {
    expect(runtimeSource).toContain('categoryCurrent');
    expect(runtimeSource).toContain('filterCurrent');
    expect(runtimeSource).toContain('if (canReveal && result) {');
    expect(runtimeSource).toContain('setGlobalTabFilterUrl(null);');
  });

  it('resets the saved search ref before publishing the target filter snapshot for a non-matching group', () => {
    const nonMatchingBranchStart = runtimeSource.indexOf(`if (
          currentFilterSnapshot.searchQuery === captureFilterSnapshot.searchQuery
          && captureFilterSnapshot.searchQuery
          && createdGroup
          && !groupMatchesQuery(createdGroup, captureFilterSnapshot.searchQuery)
        ) {`);
    const savedSearchRefResetIndex = runtimeSource.indexOf("savedSearchQueryRef.current = '';", nonMatchingBranchStart);
    const savedSearchResetIndex = runtimeSource.indexOf("setSavedSearchQuery('');", savedSearchRefResetIndex);
    const targetFilterSnapshotIndex = runtimeSource.indexOf('const targetFilterSnapshot', nonMatchingBranchStart);

    expect(nonMatchingBranchStart).toBeGreaterThanOrEqual(0);
    expect(savedSearchRefResetIndex).toBeGreaterThan(nonMatchingBranchStart);
    expect(savedSearchResetIndex).toBeGreaterThan(savedSearchRefResetIndex);
    expect(savedSearchRefResetIndex).toBeLessThan(targetFilterSnapshotIndex);
    expect(savedSearchResetIndex).toBeLessThan(targetFilterSnapshotIndex);
  });

  it('rechecks pending target ownership and clears stale targets when view changes', () => {
    expect(source).toContain('pendingTargetCategorySnapshot');
    expect(source).toContain('pendingTargetFilterSnapshot');
    expect(source).toContain('shouldKeepPendingCaptureTarget');
    expect(source).toContain('targetGroupExists');
    expect(source).toContain('setPendingTargetCategorySnapshot(null);');
    expect(source).toContain('setPendingTargetFilterSnapshot(null);');
    expect(source).toContain('searchQuery,');
  });

  it('stores independent highlight ownership before clearing a revealed target', () => {
    const revealIndex = source.indexOf('setHighlightedGroupId(pendingTargetGroupId);');
    const ownershipStateIndex = source.indexOf('highlightOwnership');
    const ownershipIndex = source.indexOf('setHighlightOwnership({', revealIndex);
    const pendingClearIndex = source.indexOf('setPendingTargetGroupId(null);', ownershipIndex);
    const ownershipBlock = source.slice(ownershipIndex, pendingClearIndex);

    expect(source).toMatch(/const \[highlightOwnership,\s*setHighlightOwnership\]\s*=\s*useState<[^;]+>\(null\);/);
    expect(ownershipStateIndex).toBeGreaterThanOrEqual(0);
    expect(revealIndex).toBeGreaterThanOrEqual(0);
    expect(ownershipStateIndex).toBeLessThan(revealIndex);
    expect(ownershipIndex).toBeGreaterThan(revealIndex);
    expect(ownershipBlock).toMatch(/groupId:\s*pendingTargetGroupId/);
    expect(ownershipBlock).toMatch(/workspaceId:\s*pendingTargetWorkspaceId/);
    expect(ownershipBlock).toMatch(/categorySnapshot:\s*pendingTargetCategorySnapshot/);
    expect(ownershipBlock).toMatch(/filterSnapshot:\s*pendingTargetFilterSnapshot/);
    expect(pendingClearIndex).toBeGreaterThan(ownershipIndex);
  });

  it('uses rendered view snapshots when a URL target has no pending snapshots', () => {
    const ownershipIndex = source.indexOf('setHighlightOwnership({');
    const ownershipEnd = source.indexOf('});', ownershipIndex);
    const ownershipBlock = source.slice(ownershipIndex, ownershipEnd);

    expect(ownershipIndex).toBeGreaterThanOrEqual(0);
    expect(ownershipBlock).toMatch(/categorySnapshot:\s*pendingTargetCategorySnapshot\s*\?\?\s*currentCategorySnapshot/);
    expect(ownershipBlock).toMatch(/filterSnapshot:\s*pendingTargetFilterSnapshot\s*\?\?\s*\{\s*searchQuery,\s*tabFilterUrl\s*\}/s);
  });

  it('invalidates highlight ownership on view changes and clears it on timeout', () => {
    const invalidationMarker = source.search(/if\s*\(\s*!highlightOwnership\s*\)\s*(?:return;|\{\s*return;\s*\})/);
    const effectStart = source.lastIndexOf('useEffect', invalidationMarker);
    const effectEnd = source.indexOf('useToastNotifications', invalidationMarker);
    const invalidationEffect = source.slice(effectStart, effectEnd);

    expect(invalidationMarker).toBeGreaterThanOrEqual(0);
    expect(invalidationEffect).toContain('activeWorkspaceId');
    expect(invalidationEffect).toMatch(/activeWorkspaceId\s*!==\s*highlightOwnership\.workspaceId|highlightOwnership\.workspaceId\s*!==\s*activeWorkspaceId/);
    expect(invalidationEffect).toContain('sameCaptureCategorySnapshot');
    expect(invalidationEffect).toContain('currentCategorySnapshot');
    expect(invalidationEffect).toContain('highlightOwnership.categorySnapshot');
    expect(invalidationEffect).toMatch(/sameCaptureCategorySnapshot\([\s\S]*highlightOwnership\.categorySnapshot[\s\S]*currentCategorySnapshot|sameCaptureCategorySnapshot\([\s\S]*currentCategorySnapshot[\s\S]*highlightOwnership\.categorySnapshot/);
    expect(invalidationEffect).toContain('sameCaptureFilterSnapshot');
    expect(invalidationEffect).toContain('highlightOwnership.filterSnapshot');
    expect(invalidationEffect).toMatch(/sameCaptureFilterSnapshot\([\s\S]*highlightOwnership\.filterSnapshot[\s\S]*searchQuery[\s\S]*tabFilterUrl|sameCaptureFilterSnapshot\([\s\S]*searchQuery[\s\S]*tabFilterUrl[\s\S]*highlightOwnership\.filterSnapshot/);
    expect(invalidationEffect).toContain('targetGroupExists');
    expect(invalidationEffect).toMatch(/!targetGroupExists/);
    expect(invalidationEffect).not.toContain('pendingTarget');
    expect(invalidationEffect).toContain('searchQuery');
    expect(invalidationEffect).toContain('tabFilterUrl');
    expect(invalidationEffect).toContain('selectedCategory');
    expect(invalidationEffect).toContain('showBin');
    expect(invalidationEffect).toContain('groups');
    const dependencyStart = invalidationEffect.lastIndexOf('}, [');
    const dependencies = invalidationEffect.slice(dependencyStart);
    for (const dependency of [
      'activeWorkspaceId',
      'selectedCategory',
      'showBin',
      'searchQuery',
      'tabFilterUrl',
      'groups',
      'highlightOwnership',
    ]) {
      expect(dependencies).toContain(dependency);
    }
    expect(invalidationEffect).toContain('setHighlightedGroupId(null);');
    expect(invalidationEffect).toContain('setHighlightOwnership(null);');
    expect(invalidationEffect).toContain('clearTimeout(highlightTimeoutRef.current)');
    expect(invalidationEffect).toContain('highlightTimeoutRef.current = null;');

    const timeoutStart = source.indexOf('highlightTimeoutRef.current = setTimeout(() => {');
    const timeoutEnd = source.indexOf('}, 3000);', timeoutStart);
    const timeoutBody = source.slice(timeoutStart, timeoutEnd);
    const timeoutHighlightClearIndex = timeoutBody.indexOf('setHighlightedGroupId(null);');
    const timeoutOwnershipClearIndex = timeoutBody.indexOf('setHighlightOwnership(null);');
    const timeoutRefClearIndex = timeoutBody.indexOf('highlightTimeoutRef.current = null;');
    expect(timeoutHighlightClearIndex).toBeGreaterThanOrEqual(0);
    expect(timeoutOwnershipClearIndex).toBeGreaterThan(timeoutHighlightClearIndex);
    expect(timeoutRefClearIndex).toBeGreaterThan(timeoutOwnershipClearIndex);
  });
});
