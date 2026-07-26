// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGeometryCollisionDetection,
  getCollisionSelection,
  getDragEndTarget,
  getFinishedDragState,
  isPointWithinRect,
  getWorkspaceFiltersAfterDelete,
  ManagerLayout,
  persistDropWithFeedback,
  shouldInvalidateDragReplacement,
  type GeometryCandidate,
} from './ManagerLayout';
import type { DropTarget } from '../../core/dnd';

const testHarness = vi.hoisted(() => {
  const state = {
    activeWorkspaceId: 'workspace_default',
    workspaces: [{ id: 'workspace_default' }],
    folders: [],
    groups: [],
    applyDropIntent: vi.fn(),
  };
  const useStore = vi.fn((selector: (value: typeof state) => unknown) => selector(state));
  Object.assign(useStore, { getState: () => state });

  return {
    dndOnDragEnd: null as ((event: unknown) => Promise<void>) | null,
    dndOnDragStart: null as ((event: unknown) => void) | null,
    onOpenTabsSourceKeyChange: null as ((key: string) => void) | null,
    completeDrop: vi.fn(),
    resolveDrop: vi.fn(() => ({
      kind: 'create-session' as const,
      source: { kind: 'open-tabs' as const, tabIds: [1], windowId: 1 },
      category: 'inbox' as const,
      index: 0,
      workspaceId: 'workspace_default',
    })),
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
    showError: vi.fn(),
    setSearchQuery: vi.fn(),
    state,
    useStore,
  };
});

vi.mock('@mantine/core', () => ({
  Group: ({ children }: { children?: ReactNode }) => children,
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
    onDragStart,
  }: {
    children?: ReactNode;
    onDragEnd: (event: unknown) => Promise<void>;
    onDragStart: (event: unknown) => void;
  }) => {
    testHarness.dndOnDragEnd = onDragEnd;
    testHarness.dndOnDragStart = onDragStart;
    return children;
  },
  DragOverlay: ({ children }: { children?: ReactNode }) => children,
  KeyboardSensor: class KeyboardSensor {},
  PointerSensor: class PointerSensor {},
  TouchSensor: class TouchSensor {},
  useDndMonitor: () => undefined,
  useSensor: () => ({}),
  useSensors: () => [],
}));

vi.mock('@dnd-kit/sortable', () => ({ sortableKeyboardCoordinates: () => undefined }));
vi.mock('../sidebar/Sidebar', () => ({
  Sidebar: ({ onOpenTabsSourceKeyChange }: { onOpenTabsSourceKeyChange: (key: string) => void }) => {
    testHarness.onOpenTabsSourceKeyChange = onOpenTabsSourceKeyChange;
    return null;
  },
}));
vi.mock('../import-export/ImportModal', () => ({ ImportModal: () => null }));
vi.mock('../import-export/ExportModal', () => ({ ExportModal: () => null }));
vi.mock('../workspace/WorkspaceContent', () => ({ WorkspaceContent: () => null }));
vi.mock('../bin/BinView', () => ({ BinView: () => null }));
vi.mock('../sessions/SessionCard', () => ({ SessionCard: () => null }));
vi.mock('../sessions/TabItemRow', () => ({ TabItemRow: () => null }));
vi.mock('../workspace/WorkspaceHeader', () => ({ WorkspaceHeader: () => null }));

vi.mock('../../hooks/useFilteredGroups', () => ({
  useCurrentWorkspace: () => ({ id: 'workspace_default', name: 'Workspace' }),
  useFilteredGroups: () => [],
  useSearchQuery: () => '',
  useSetSearchQuery: () => testHarness.setSearchQuery,
}));
vi.mock('../../hooks/useOpenTabsRuntime', () => ({
  useOpenTabsRuntime: () => ({
    model: {
      windows: [],
      selectedWindow: null,
      selectedWindowId: null,
      filteredTabs: [],
      query: '',
      tabFilterUrl: null,
      isTabFilterActive: false,
      selection: {
        active: false,
        ids: [],
        count: 0,
        records: [],
        recordIds: [],
      },
      status: {
        closingTabIds: [],
        updatingSelection: false,
        loading: false,
        capturing: false,
        error: null,
      },
    },
    commands: {
      completeDrop: testHarness.completeDrop,
    },
  }),
}));
vi.mock('../../hooks/useManagerRuntime', () => ({ useManagerRuntime: () => ({}) }));
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({
    showSuccess: testHarness.showSuccess,
    showInfo: testHarness.showInfo,
    showError: testHarness.showError,
  }),
}));
vi.mock('./useToastNotifications', () => ({ useToastNotifications: () => undefined }));
vi.mock('../../hooks/useManagerOverlays', () => ({
  ManagerOverlayPortal: () => null,
  ManagerOverlaysProvider: ({ children }: { children?: ReactNode }) => children,
  useManagerOverlayController: () => ({ closeOverlays: vi.fn() }),
  useManagerOverlayCommands: () => ({ closeOverlays: vi.fn() }),
}));
vi.mock('../../../shared/store/useTabBoardStore', () => ({ useTabBoardStore: testHarness.useStore }));
vi.mock('../../core/dnd', async () => {
  const actual = await vi.importActual<typeof import('../../core/dnd')>('../../core/dnd');
  return { ...actual, resolveDrop: testHarness.resolveDrop };
});

const source = readFileSync(resolve(process.cwd(), 'src/manager/components/shell/ManagerLayout.tsx'), 'utf8');
const runtimeSource = readFileSync(resolve(process.cwd(), 'src/manager/hooks/useOpenTabsRuntime.ts'), 'utf8');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
  testHarness.dndOnDragEnd = null;
  testHarness.dndOnDragStart = null;
  testHarness.onOpenTabsSourceKeyChange = null;
  testHarness.resolveDrop.mockClear();
  testHarness.showSuccess.mockClear();
  testHarness.showInfo.mockClear();
  testHarness.showError.mockClear();
  testHarness.setSearchQuery.mockClear();
  testHarness.completeDrop.mockClear();
  testHarness.state.applyDropIntent.mockReset();
  testHarness.state.applyDropIntent.mockResolvedValue(undefined);
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

async function mountManagerLayout(): Promise<void> {
  root = createRoot(container!);
  await act(async () => {
    root?.render(createElement(ManagerLayout));
  });
  expect(testHarness.dndOnDragEnd).not.toBeNull();
  expect(testHarness.dndOnDragStart).not.toBeNull();
  expect(testHarness.onOpenTabsSourceKeyChange).not.toBeNull();
}

function createOpenTabsDragActive(): unknown {
  return {
    id: 'open-tab-1',
    data: {
      current: {
        dnd: {
          payload: {
            kind: 'open-tabs',
            tabIds: [1],
            windowId: 1,
            workspaceId: 'workspace_default',
          },
          records: [],
        },
      },
    },
    rect: { current: { initial: null } },
  };
}

function createOpenTabsDragEndEvent(): unknown {
  return {
    active: createOpenTabsDragActive(),
    over: {
      data: {
        current: {
          dnd: {
            targets: [{
              kind: 'category-column',
              category: 'inbox',
              workspaceId: 'workspace_default',
            }],
          },
        },
      },
    },
  };
}

describe('tooltip dismissal', () => {
  it('dismisses active tooltips whenever a pointer press starts', () => {
    expect(source).toContain('function ManagerTooltipDismissal()');
    expect(source).toContain("document.querySelectorAll<HTMLElement>('[aria-describedby]')");
    expect(source).toContain("new MouseEvent('mouseout'");
    expect(source).toContain("document.addEventListener('pointerdown', dismiss, true)");
  });
});

describe('visible group memoization', () => {
  it('returns the same groups reference when stable inputs survive a rerender', async () => {
    const { useFilteredGroups } = await vi.importActual<typeof import('../../hooks/useFilteredGroups')>(
      '../../hooks/useFilteredGroups',
    );
    const observed = { current: null as ReturnType<typeof useFilteredGroups> | null };
    const forceRender = { current: null as (() => void) | null };

    function HookProbe() {
      const [, setRenderCount] = useState(0);
      forceRender.current = () => setRenderCount((count) => count + 1);
      observed.current = useFilteredGroups('inbox');
      return null;
    }

    root = createRoot(container!);
    await act(async () => {
      root?.render(createElement(HookProbe));
    });
    const firstGroups = observed.current;

    await act(async () => {
      forceRender.current?.();
    });

    expect(observed.current).toBe(firstGroups);
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

describe('geometry collision detector integration', () => {
  const workspaceId = 'workspace_default';
  const collisionRect = { left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 };
  const createDroppable = (id: string, target: DropTarget) => ({
    id,
    data: { current: { dnd: { targets: [target] } } },
  });

  function runDetector(
    droppableContainers: Array<{ id: string; data: unknown }>,
    droppableRects: Map<string, typeof collisionRect>,
    pointerCoordinates: { x: number; y: number },
  ) {
    const lockedTargetRef = { current: null as DropTarget | null };
    const detector = createGeometryCollisionDetection(lockedTargetRef);
    const collisions = detector({
      active: {
        data: {
          current: {
            dnd: {
              payload: { kind: 'tabs', refs: [], workspaceId },
            },
          },
        },
      },
      pointerCoordinates,
      collisionRect,
      droppableRects,
      droppableContainers,
    } as never);
    return { collisions, lockedTargetRef };
  }

  it('prioritizes a category in an overlapping rect and returns its original droppable', () => {
    const ordinary = createDroppable('ordinary', { kind: 'group-body', groupId: 'group', workspaceId });
    const categoryTarget: DropTarget = { kind: 'category-column', category: 'inbox', workspaceId };
    const category = createDroppable('category', categoryTarget);
    const rects = new Map([
      ['ordinary', collisionRect],
      ['category', collisionRect],
    ]);

    const { collisions, lockedTargetRef } = runDetector([ordinary, category], rects, { x: 50, y: 50 });

    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.id).toBe('category');
    expect(collisions[0]?.data?.droppableContainer).toBe(category);
    expect(lockedTargetRef.current).toEqual(categoryTarget);
  });

  it('resolves tab edge placement while preserving the original droppable id', () => {
    const tabTarget: DropTarget = {
      kind: 'tab-before',
      groupId: 'group',
      tabId: 'tab',
      index: 0,
      workspaceId,
    };
    const tabDroppable = createDroppable('tab-edge', tabTarget);
    const { collisions, lockedTargetRef } = runDetector(
      [tabDroppable],
      new Map([['tab-edge', collisionRect]]),
      { x: 50, y: 10 },
    );

    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.id).toBe('tab-edge');
    expect(collisions[0]?.data?.droppableContainer).toBe(tabDroppable);
    expect(lockedTargetRef.current).toEqual({ ...tabTarget, placement: 'before' });
  });
});

describe('category drag targets', () => {
  const categoryRect = { left: 100, right: 200, top: 20, bottom: 60 } as DOMRect;
  const workspaceId = 'workspace_default';
  const groupTarget = (groupId: string): DropTarget => ({ kind: 'group-body', groupId, workspaceId });
  const categoryTarget: DropTarget = { kind: 'category-column', category: 'inbox', workspaceId };
  const candidate = (id: string, target: DropTarget, distance: number): GeometryCandidate => ({
    container: { id } as never,
    target,
    distance,
  });

  it('only activates when the pointer is inside the category itself', () => {
    expect(isPointWithinRect({ x: 150, y: 40 }, categoryRect)).toBe(true);
    expect(isPointWithinRect({ x: 99, y: 40 }, categoryRect)).toBe(false);
  });

  it('selects the nearest category before a nearer ordinary candidate', () => {
    const ordinary = candidate('ordinary', groupTarget('ordinary'), 2);
    const category = candidate('category', categoryTarget, 10);

    expect(getCollisionSelection({
      nearestCandidate: ordinary,
      categoryCandidate: category,
      lockedTarget: null,
      lockedCandidate: null,
    })).toEqual({ candidate: category, target: categoryTarget });
  });

  it('selects the nearest ordinary candidate when no category is under the pointer', () => {
    const nearest = candidate('nearest', groupTarget('nearest'), 2);
    const farther = candidate('farther', groupTarget('farther'), 10);

    expect(getCollisionSelection({
      nearestCandidate: nearest,
      categoryCandidate: null,
      lockedTarget: null,
      lockedCandidate: farther,
    })).toEqual({ candidate: nearest, target: nearest.target });
  });

  it('keeps a matching locked target inside the release margin', () => {
    const locked = candidate('locked', groupTarget('locked'), 8);
    const nearest = candidate('nearest', groupTarget('nearest'), 2);

    expect(getCollisionSelection({
      nearestCandidate: nearest,
      categoryCandidate: null,
      lockedTarget: locked.target,
      lockedCandidate: locked,
    })).toEqual({ candidate: locked, target: locked.target });
  });

  it('releases a matching locked target beyond the release margin', () => {
    const locked = candidate('locked', groupTarget('locked'), 13);
    const nearest = candidate('nearest', groupTarget('nearest'), 2);

    expect(getCollisionSelection({
      nearestCandidate: nearest,
      categoryCandidate: null,
      lockedTarget: locked.target,
      lockedCandidate: locked,
    })).toEqual({ candidate: nearest, target: nearest.target });
  });

  it('returns no selection when no candidate is available', () => {
    expect(getCollisionSelection({
      nearestCandidate: null,
      categoryCandidate: null,
      lockedTarget: null,
      lockedCandidate: null,
    })).toBeNull();
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

  it('does not complete the Open Tabs workflow when persistence fails', async () => {
    await mountManagerLayout();
    testHarness.state.applyDropIntent.mockRejectedValueOnce(new Error('persistence failed'));

    await act(async () => {
      testHarness.dndOnDragStart?.({ active: createOpenTabsDragActive() });
      await testHarness.dndOnDragEnd?.(createOpenTabsDragEndEvent());
    });

    expect(testHarness.completeDrop).not.toHaveBeenCalled();
    expect(testHarness.showError).toHaveBeenCalledWith('persistence failed', 'Drop failed');
  });

  it('completes the Open Tabs workflow when persistence succeeds', async () => {
    await mountManagerLayout();

    await act(async () => {
      testHarness.dndOnDragStart?.({ active: createOpenTabsDragActive() });
      await testHarness.dndOnDragEnd?.(createOpenTabsDragEndEvent());
    });

    expect(testHarness.completeDrop).toHaveBeenCalledTimes(1);
    expect(testHarness.state.applyDropIntent).toHaveBeenCalledTimes(1);
    expect(testHarness.showSuccess).toHaveBeenCalledWith('Drop saved', 'Drop complete');
  });

  it('cancels a drag whose Open Tabs source changed before release', async () => {
    await mountManagerLayout();

    await act(async () => {
      testHarness.onOpenTabsSourceKeyChange?.('source-before-drag');
      testHarness.dndOnDragStart?.({ active: createOpenTabsDragActive() });
      testHarness.onOpenTabsSourceKeyChange?.('source-after-drag');
      await testHarness.dndOnDragEnd?.(createOpenTabsDragEndEvent());
    });

    expect(testHarness.state.applyDropIntent).not.toHaveBeenCalled();
    expect(testHarness.showSuccess).not.toHaveBeenCalled();
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
    expect(runtimeSource).toContain("dispatch({ type: 'tab-filter-changed', url: null });");
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
