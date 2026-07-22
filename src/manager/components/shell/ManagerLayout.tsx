import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Group as MantineGroup } from '@mantine/core';
import {
  DndContext,
  type CollisionDetection,
  type DroppableContainer,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragCancelEvent,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  type Over,
  useDndMonitor,
} from '@dnd-kit/core';
import type { ClientRect } from '@dnd-kit/core';
import { Sidebar } from '../sidebar/Sidebar';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ImportModal } from '../import-export/ImportModal';
import { ExportModal } from '../import-export/ExportModal';
import { WorkspaceContent } from '../workspace/WorkspaceContent';
import { BinView } from '../bin/BinView';
import {
  useCurrentWorkspace,
  useFilteredGroups,
  useSearchQuery,
  useSetSearchQuery,
} from '../../hooks/useFilteredGroups';
import {
  CAPTURE_COMPLETED_EVENT,
  useTabFilterUrl,
  type CaptureCompletedEventDetail,
} from '../../hooks/useOpenTabsRuntime';
import type { Group, TabItem } from '../../../shared/model';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import {
  DROP_TARGET_RELEASE_MARGIN,
  IDLE_DRAG_STATE,
  clearDragState,
  getTabDropPlacement,
  isDragSourceStillRendered,
  lockDropTarget,
  resolveDrop,
  type DndData,
  type DragPayload,
  type DragUiState,
  type DropTarget,
} from '../../core/dnd';
import type { OpenTabInfo } from '../../core/open-tabs';
import { useToastNotifications } from './useToastNotifications';
import { useToast } from '../../hooks/useToast';
import { SessionCard } from '../sessions/SessionCard';
import { TabItemRow } from '../sessions/TabItemRow';
import { WorkspaceHeader } from '../workspace/WorkspaceHeader';
import { useManagerRuntime } from '../../hooks/useManagerRuntime';
import {
  ManagerOverlayPortal,
  ManagerOverlaysProvider,
  useManagerOverlayController,
} from '../../hooks/useManagerOverlays';
import {
  sameCaptureCategorySnapshot,
  sameCaptureFilterSnapshot,
  shouldKeepPendingCaptureTarget,
  shouldRevealCapture,
  type CaptureCategorySnapshot,
  type CaptureFilterSnapshot,
} from '../../core/capture';
import type { CategoryFilter } from '../../core/selectors';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'tabboard.sidebarCollapsed';
const NARROW_SIDEBAR_QUERY = '(max-width: 900px)';

function getStoredSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(NARROW_SIDEBAR_QUERY).matches
    || window.localStorage?.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
}

function getPayload(data: unknown): DragPayload | null {
  if (!data || typeof data !== 'object') return null;
  const dnd = (data as { dnd?: DndData }).dnd;
  return dnd?.payload ?? null;
}

function getTargets(data: unknown): DropTarget[] {
  if (!data || typeof data !== 'object') return [];
  const dnd = (data as { dnd?: DndData }).dnd;
  return dnd?.targets ?? [];
}

function targetEquals(left: DropTarget | null, right: DropTarget | null): boolean {
  return Boolean(left && right && JSON.stringify(left) === JSON.stringify(right));
}

export interface GeometryCandidate {
  container: DroppableContainer;
  target: DropTarget;
  distance: number;
}

interface CollisionSelectionInput {
  nearestCandidate: GeometryCandidate | null;
  categoryCandidate: GeometryCandidate | null;
  lockedTarget: DropTarget | null;
  lockedCandidate: GeometryCandidate | null;
}

export function getCollisionSelection({
  nearestCandidate,
  categoryCandidate,
  lockedTarget,
  lockedCandidate,
}: CollisionSelectionInput): { candidate: GeometryCandidate; target: DropTarget } | null {
  const candidate = categoryCandidate ?? nearestCandidate;
  if (!candidate) return null;

  const target = categoryCandidate?.target ?? lockDropTarget(
    lockedTarget,
    candidate.target,
    {
      distance: lockedCandidate?.distance ?? Number.POSITIVE_INFINITY,
      releaseMargin: DROP_TARGET_RELEASE_MARGIN,
    },
  );
  if (!target) return null;

  const selectedCandidate = categoryCandidate
    ?? (lockedCandidate && targetEquals(target, lockedCandidate.target) ? lockedCandidate : nearestCandidate);
  return selectedCandidate ? { candidate: selectedCandidate, target } : null;
}

export function getDragEndTarget(
  over: Over | null,
  lockedTarget: DropTarget | null,
  dragUiTarget: DropTarget | null = null,
): DropTarget | null {
  if (!over) return null;
  return lockedTarget ?? dragUiTarget ?? getTargets(over.data.current)[0] ?? null;
}

export interface DragReplacementSnapshot {
  workspaceId: string;
  category: CategoryFilter;
  view: string;
  groups: string;
}

export function getDragReplacementSnapshot(
  workspaceId: string,
  category: CategoryFilter,
  showBin: boolean,
  groups: Group[],
): DragReplacementSnapshot {
  return {
    workspaceId,
    category,
    view: showBin ? 'bin' : 'workspace',
    groups: groups.map((group) => `${group.id}:${group.updatedAt}:${group.tabs.map((tab) => `${tab.id}:${tab.updatedAt}`).join(',')}`).join('|'),
  };
}

export function shouldInvalidateDragReplacement(
  activeId: string | null,
  payload: DragPayload | null,
  snapshot: DragReplacementSnapshot | null,
  current: DragReplacementSnapshot,
  sourceStillRendered: boolean,
): boolean {
  if (!activeId || !payload || !snapshot) return false;
  return snapshot.workspaceId !== current.workspaceId
    || snapshot.category !== current.category
    || snapshot.view !== current.view
    || snapshot.groups !== current.groups
    || !sourceStillRendered;
}

export function getFinishedDragState(state: DragUiState): { activeId: null; dragUiState: DragUiState } {
  return { activeId: null, dragUiState: clearDragState(state) };
}

export async function persistDropWithFeedback(
  applyDrop: () => void | Promise<unknown>,
  showSuccess: (message: string, title?: string) => void,
  showError: (message: string, title?: string) => void,
): Promise<boolean> {
  try {
    await applyDrop();
    showSuccess('Drop saved', 'Drop complete');
    return true;
  } catch (error: unknown) {
    showError(error instanceof Error ? error.message : String(error), 'Drop failed');
    return false;
  }
}

function distanceToRect(point: { x: number; y: number }, rect: ClientRect): number {
  const dx = point.x < rect.left ? rect.left - point.x : point.x > rect.right ? point.x - rect.right : 0;
  const dy = point.y < rect.top ? rect.top - point.y : point.y > rect.bottom ? point.y - rect.bottom : 0;
  return Math.hypot(dx, dy);
}

export function isPointWithinRect(point: { x: number; y: number }, rect: ClientRect): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function isCompatibleTarget(payload: DragPayload, target: DropTarget): boolean {
  if (payload.kind === 'group') return target.kind === 'group-insert' || target.kind === 'category-column';
  if (payload.kind === 'category') return target.kind === 'category-reorder';
  return target.kind === 'group-body'
    || target.kind === 'tab-before'
    || target.kind === 'new-group'
    || target.kind === 'group-insert'
    || target.kind === 'category-column';
}

function resolveTabEdgeTarget(
  target: DropTarget,
  pointer: { x: number; y: number },
  rect: ClientRect,
  _droppableContainers: DroppableContainer[],
): DropTarget {
  if (target.kind !== 'tab-before') return target;
  const placement = getTabDropPlacement(rect as DOMRect, pointer.y);
  if (placement === 'body') {
    return {
      kind: 'group-body',
      groupId: target.groupId,
      workspaceId: target.workspaceId,
    };
  }
  return { ...target, placement };
}

function markerForTarget(target: DropTarget | null): DragUiState['marker'] {
  if (!target) return null;
  if (target.kind === 'group-insert' || target.kind === 'new-group') return { kind: 'group', index: target.index };
  if (target.kind === 'tab-before' || target.kind === 'group-body') {
    return {
      kind: 'tab',
      groupId: target.groupId,
      tabId: target.kind === 'tab-before' ? target.tabId : undefined,
      placement: target.kind === 'tab-before' ? target.placement ?? 'before' : 'body',
    };
  }
  if (target.kind === 'category-column') {
    return { kind: 'category', categoryId: target.category, placement: 'after' };
  }
  return { kind: 'category-reorder', categoryId: target.categoryId, placement: target.placement };
}

export function createGeometryCollisionDetection(
  lockedTargetRef: { current: DropTarget | null },
): CollisionDetection {
  return ({ active, pointerCoordinates, collisionRect, droppableRects, droppableContainers }) => {
    const pointer = pointerCoordinates ?? {
      x: collisionRect.left + collisionRect.width / 2,
      y: collisionRect.top + collisionRect.height / 2,
    };
    const payload = getPayload(active.data.current);
    if (!payload) return [];

    let nearestCandidate: GeometryCandidate | null = null;
    let categoryCandidate: GeometryCandidate | null = null;
    let lockedCandidate: GeometryCandidate | null = null;
    const lockedTarget = lockedTargetRef.current;

    for (const container of droppableContainers) {
      const rect = droppableRects.get(container.id);
      if (!rect) continue;
      const target = getTargets(container.data.current).find((candidate) => isCompatibleTarget(payload, candidate));
      if (!target) continue;
      if (target.kind === 'category-column' && !isPointWithinRect(pointer, rect)) continue;

      const candidate: GeometryCandidate = {
        container,
        target: resolveTabEdgeTarget(target, pointer, rect, droppableContainers),
        distance: distanceToRect(pointer, rect),
      };
      if (target.kind === 'category-column') {
        if (!categoryCandidate || candidate.distance < categoryCandidate.distance) {
          categoryCandidate = candidate;
        }
      } else if (!nearestCandidate || candidate.distance < nearestCandidate.distance) {
        nearestCandidate = candidate;
      }
      if (lockedTarget && targetEquals(candidate.target, lockedTarget)
        && (!lockedCandidate || candidate.distance < lockedCandidate.distance)) {
        lockedCandidate = candidate;
      }
    }

    const selection = getCollisionSelection({
      nearestCandidate,
      categoryCandidate,
      lockedTarget,
      lockedCandidate,
    });
    if (!selection) {
      lockedTargetRef.current = null;
      return [];
    }

    lockedTargetRef.current = selection.target;
    return [{
      id: selection.candidate.container.id,
      data: {
        droppableContainer: selection.candidate.container,
        value: -selection.candidate.distance,
      },
    }];
  };
}

export function getWorkspaceFiltersAfterDelete(): {
  category: 'inbox';
  showBin: false;
} {
  return { category: 'inbox', showBin: false };
}

function ManagerOverlayDragLifecycle() {
  const { closeOverlays } = useManagerOverlayController();
  useDndMonitor({ onDragStart: () => closeOverlays() });
  return null;
}

function ManagerTooltipDismissal() {
  useEffect(() => {
    const dismiss = () => {
      document.querySelectorAll<HTMLElement>('[aria-describedby]').forEach((target) => {
        target.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
      });
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, []);
  return null;
}

type HighlightOwnership = {
  groupId: string;
  workspaceId: string;
  categorySnapshot: CaptureCategorySnapshot | null;
  filterSnapshot: CaptureFilterSnapshot | null;
};

export function ManagerLayout() {
  const initialCollapsed = getStoredSidebarCollapsed();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialCollapsed);
  const [sidebarOverlayOpen, setSidebarOverlayOpen] = useState(false);
  const [sidebarSelectionOpen, setSidebarSelectionOpen] = useState(false);
  const [sidebarPreviewOpen, setSidebarPreviewOpen] = useState(false);
  const [sidebarHoverSuppressed, setSidebarHoverSuppressed] = useState(initialCollapsed);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRailToggleRef = useRef<HTMLButtonElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('inbox');
  const [showBin, setShowBin] = useState(false);
  const [importModalOpened, setImportModalOpened] = useState(false);
  const [exportModalOpened, setExportModalOpened] = useState(false);
  const [highlightedGroupId, setHighlightedGroupId] = useState<string | null>(null);
  const [highlightOwnership, setHighlightOwnership] = useState<HighlightOwnership | null>(null);
  const [pendingTargetGroupId, setPendingTargetGroupId] = useState<string | null>(null);
  const [pendingTargetWorkspaceId, setPendingTargetWorkspaceId] = useState<string | null>(null);
  const [pendingTargetCategorySnapshot, setPendingTargetCategorySnapshot] = useState<CaptureCategorySnapshot | null>(null);
  const [pendingTargetFilterSnapshot, setPendingTargetFilterSnapshot] = useState<CaptureFilterSnapshot | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);
  const workspace = useCurrentWorkspace();
  const runtime = useManagerRuntime();
  const { showSuccess, showInfo, showError } = useToast();
  const previousWorkspaceIdRef = useRef(activeWorkspaceId);
  const searchQuery = useSearchQuery();
  const tabFilterUrl = useTabFilterUrl();
  const setSearchQuery = useSetSearchQuery();
  const currentCategorySnapshot: CaptureCategorySnapshot = {
    showBin,
    category: selectedCategory,
  };
  const currentCategorySnapshotRef = useRef(currentCategorySnapshot);
  currentCategorySnapshotRef.current = currentCategorySnapshot;
  const groups = useFilteredGroups(showBin ? 'inbox' : selectedCategory);
  const applyDropIntent = useTabBoardStore((state) => state.applyDropIntent);

  const handleSelectCategory = (category: CategoryFilter) => {
    setShowBin(false);
    setSelectedCategory(category);
  };

  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragUiState, setDragUiState] = useState<DragUiState>(clearDragState());
  const dragUiStateRef = useRef<DragUiState>(clearDragState());
  const lockedTargetRef = useRef<DropTarget | null>(null);
  const dragReplacementKeyRef = useRef<{
    workspaceId: string;
    category: CategoryFilter;
    view: string;
    groups: string;
  } | null>(null);
  const openTabsSourceKeyRef = useRef<string | null>(null);
  const dragReplacementSnapshot = useMemo(
    () => getDragReplacementSnapshot(activeWorkspaceId, selectedCategory, showBin, groups),
    [activeWorkspaceId, selectedCategory, showBin, groups],
  );
  const collisionDetection = createGeometryCollisionDetection(lockedTargetRef);
  const applyDragUiState = useCallback((next: DragUiState) => {
    dragUiStateRef.current = next;
    setDragUiState(next);
  }, []);
  const finishDrag = useCallback(() => {
    lockedTargetRef.current = null;
    dragReplacementKeyRef.current = null;
    const finished = getFinishedDragState(dragUiStateRef.current);
    setActiveId(finished.activeId);
    applyDragUiState(finished.dragUiState);
  }, [applyDragUiState]);
  const handleOpenTabsSourceKeyChange = useCallback((key: string) => {
    const previousKey = openTabsSourceKeyRef.current;
    openTabsSourceKeyRef.current = key;
    if (previousKey !== null
      && previousKey !== key
      && dragUiStateRef.current.payload?.kind === 'open-tabs') {
      finishDrag();
    }
  }, [finishDrag]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      // Keyboard drag moves by resolving the next sortable position instead of
      // fixed pixel steps, so arrow keys traverse whole session columns and the
      // custom geometry collision detection can lock onto an adjacent target.
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeGroup = groups.find((g) => `group-${g.id}` === activeId);

  const getActiveTab = (): { tab: TabItem; groupId: string } | null => {
    if (!activeId || !activeId.startsWith('tab-')) return null;
    for (const group of groups) {
      const tab = group.tabs.find((t) => `tab-${group.id}-${t.id}` === activeId);
      if (tab) {
        return { tab, groupId: group.id };
      }
    }
    return null;
  };

  const activeTabInfo = getActiveTab();

  const handleDragStart = (event: DragStartEvent) => {
    const payload = getPayload(event.active.data.current);
    const initial = event.active.rect.current.initial;
    dragReplacementKeyRef.current = dragReplacementSnapshot;
    applyDragUiState({
      payload,
      target: null,
      marker: null,
      sourceRect: initial
        ? { left: initial.left, top: initial.top, width: initial.width, height: initial.height }
        : null,
    });
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: { over: Over | null }) => {
    const target = lockedTargetRef.current ?? getTargets(event.over?.data.current)[0] ?? null;
    if (!target) {
      applyDragUiState({ ...dragUiStateRef.current, target: null, marker: null });
      return;
    }
    const payload = dragUiStateRef.current.payload;
    if (payload?.kind === 'group' && !resolveDrop({ payload, target, state: useTabBoardStore.getState() })) {
      lockedTargetRef.current = null;
      applyDragUiState({ ...dragUiStateRef.current, target: null, marker: null });
      return;
    }
    applyDragUiState({ ...dragUiStateRef.current, target, marker: markerForTarget(target) });
  };

  const handleDragEnd = async (event: DragEndEvent): Promise<void> => {
    if (!event.over) {
      finishDrag();
      return;
    }
    try {
      const payload = dragUiStateRef.current.payload;
      const target = getDragEndTarget(
        event.over,
        lockedTargetRef.current,
        dragUiStateRef.current.target,
      );
      if (!payload || !target) return;
      const openTabs = (event.active.data.current as { dnd?: DndData } | undefined)?.dnd?.records ?? [];
      const latestState = useTabBoardStore.getState();
      const intent = resolveDrop({
        payload,
        target,
        state: latestState,
        openTabs,
      });
      if (!intent) return;
      const persisted = await persistDropWithFeedback(
        () => applyDropIntent(intent, openTabs as OpenTabInfo[]),
        showSuccess,
        showError,
      );
      if (persisted && payload.kind === 'open-tabs') {
        window.dispatchEvent(new CustomEvent('tabboard-open-tabs-dropped'));
      }
    } finally {
      finishDrag();
    }
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    finishDrag();
  };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && activeId) {
        event.preventDefault();
        finishDrag();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [activeId, finishDrag]);

  useEffect(() => {
    if (!activeId) return;
    const payload = dragUiStateRef.current.payload;
    const dragReplacementKey = dragReplacementKeyRef.current;
    const currentReplacementKey = dragReplacementSnapshot;
    if (shouldInvalidateDragReplacement(
      activeId,
      payload,
      dragReplacementKey,
      currentReplacementKey,
      payload ? isDragSourceStillRendered(payload, groups) : false,
    )) {
      finishDrag();
    }
  }, [activeId, dragReplacementSnapshot, finishDrag, groups]);

  useEffect(() => () => finishDrag(), [finishDrag]);

  const handleSidebarToggle = (expanded: boolean) => {
    setSidebarHoverSuppressed(!expanded);
    if (window.matchMedia(NARROW_SIDEBAR_QUERY).matches) {
      setSidebarCollapsed(true);
      setSidebarOverlayOpen(expanded);
      requestAnimationFrame(() => {
        (expanded ? sidebarToggleRef : sidebarRailToggleRef).current?.focus();
      });
      return;
    }
    setSidebarOverlayOpen(false);
    setSidebarCollapsed(!expanded);
    requestAnimationFrame(() => {
      (expanded ? sidebarToggleRef : sidebarRailToggleRef).current?.focus();
    });
  };

  useEffect(() => {
    window.localStorage?.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(NARROW_SIDEBAR_QUERY);
    const collapseForNarrowViewport = () => {
      if (mediaQuery.matches) setSidebarCollapsed(true);
    };
    mediaQuery.addEventListener('change', collapseForNarrowViewport);
    return () => mediaQuery.removeEventListener('change', collapseForNarrowViewport);
  }, []);

  useEffect(() => {
    if (previousWorkspaceIdRef.current === activeWorkspaceId) return;
    previousWorkspaceIdRef.current = activeWorkspaceId;
    const nextFilters = getWorkspaceFiltersAfterDelete();
    setSelectedCategory(nextFilters.category);
    setShowBin(nextFilters.showBin);
  }, [activeWorkspaceId]);

  useEffect(() => {
    const handleCaptureCompleted = (event: Event) => {
      const detail = (event as CustomEvent<CaptureCompletedEventDetail>).detail;
      if (!detail) return;
      if (!detail.committed || !detail.reconciled) {
        showError(detail.message, detail.committed ? 'Capture saved' : 'Capture failed');
        return;
      }

      const storedTabs = detail.result?.storedTabs ?? 0;
      showSuccess(
        `${storedTabs} tab${storedTabs === 1 ? '' : 's'} saved successfully`,
        'Tabs saved',
      );

      if (!detail.selectionCurrent) return;

      const createdGroupId = detail.createdGroupIds[0];
      const currentWorkspaceId = useTabBoardStore.getState().activeWorkspaceId;
      if (!createdGroupId || !detail.activeWorkspaceId) return;
      if (currentWorkspaceId !== detail.sourceWorkspaceId) return;
      if (!shouldRevealCapture({
        sourceWorkspaceId: detail.sourceWorkspaceId,
        activeWorkspaceId: detail.activeWorkspaceId,
        createdGroupIds: detail.createdGroupIds,
      })) return;
      if (!detail.filterCurrent) return;
      if (!detail.categorySnapshot || !sameCaptureCategorySnapshot(
        detail.categorySnapshot,
        currentCategorySnapshotRef.current,
      )) return;

      setShowBin(false);
      setSelectedCategory('inbox');
      setPendingTargetWorkspaceId(detail.sourceWorkspaceId);
      setPendingTargetGroupId(createdGroupId);
      setPendingTargetCategorySnapshot(detail.targetCategorySnapshot);
      setPendingTargetFilterSnapshot(detail.targetFilterSnapshot);
    };

    window.addEventListener(CAPTURE_COMPLETED_EVENT, handleCaptureCompleted);
    return () => window.removeEventListener(CAPTURE_COMPLETED_EVENT, handleCaptureCompleted);
  }, [selectedCategory, showBin, showError, showSuccess]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const targetGroupId = params.get('targetGroupId');
    if (targetGroupId) {
      const currentState = useTabBoardStore.getState();
      const targetGroup = currentState.groups.find((g) => g.id === targetGroupId);
      if (targetGroup) {
        if (targetGroup.workspaceId !== currentState.activeWorkspaceId) {
          params.delete('targetGroupId');
          const query = params.toString();
          window.history.replaceState(
            window.history.state,
            document.title,
            `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
          );
        } else {
          setSearchQuery('');
          let targetCategory: CategoryFilter = 'inbox';
          if (targetGroup.archived) {
            targetCategory = 'archive';
          } else if (targetGroup.starred) {
            targetCategory = 'saved';
          } else if (targetGroup.folderId) {
            targetCategory = `folder:${targetGroup.folderId}`;
          }
          setSelectedCategory(targetCategory);
          setShowBin(false);

          setPendingTargetWorkspaceId(targetGroup.workspaceId);
          setPendingTargetGroupId(targetGroupId);
        }
      } else {
        params.delete('targetGroupId');
        const query = params.toString();
        window.history.replaceState(
          window.history.state,
          document.title,
          `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
        );
      }
    }

    const savedCount = Number.parseInt(params.get('saved') || '', 10);
    const duplicateCount = Number.parseInt(params.get('duplicates') || '', 10);
    if (Number.isFinite(savedCount) && savedCount > 0) {
      showSuccess(
        `${savedCount} tab${savedCount === 1 ? '' : 's'} saved successfully`,
        'Tabs saved',
      );
    }
    if (Number.isFinite(duplicateCount) && duplicateCount > 0) {
      showInfo(
        `Removed ${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'}`,
        'Duplicates cleaned',
      );
    }

    const feedback = params.get('feedback');
    if (feedback) {
      const [type, value] = feedback.split(':');
      const count = parseInt(value, 10);

      if (type === 'stored' && !isNaN(count)) {
        showSuccess(
          `${count} tab${count === 1 ? '' : 's'} saved successfully`,
          'Tabs saved'
        );
      } else if (type === 'deduped' && !isNaN(count)) {
        showInfo(
          `Removed ${count} duplicate${count === 1 ? '' : 's'}`,
          'Duplicates cleaned'
        );
      } else if (type === 'restored' && !isNaN(count)) {
        showSuccess(
          `${count} tab${count === 1 ? '' : 's'} restored`,
          'Tabs restored'
        );
      }
    }

    const feedbackKeys = ['saved', 'duplicates', 'feedback'];
    if (feedbackKeys.some((key) => params.has(key))) {
      feedbackKeys.forEach((key) => params.delete(key));
      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        document.title,
        `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
      );
    }
  }, [setSearchQuery, showSuccess, showInfo]);

  useEffect(() => {
    if (!pendingTargetGroupId) return;

    const clearPendingTarget = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('targetGroupId') === pendingTargetGroupId) {
        params.delete('targetGroupId');
        const query = params.toString();
        window.history.replaceState(
          window.history.state,
          document.title,
          `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
        );
      }
      setPendingTargetGroupId(null);
      setPendingTargetWorkspaceId(null);
      setPendingTargetCategorySnapshot(null);
      setPendingTargetFilterSnapshot(null);
    };

    if (!pendingTargetWorkspaceId || activeWorkspaceId !== pendingTargetWorkspaceId) {
      clearPendingTarget();
      return;
    }

    const currentCategorySnapshot: CaptureCategorySnapshot = {
      showBin,
      category: selectedCategory,
    };
    const targetGroupExists = useTabBoardStore.getState().groups.some((group) => group.id === pendingTargetGroupId);
    if (
      !shouldKeepPendingCaptureTarget({
        targetCategorySnapshot: pendingTargetCategorySnapshot,
        currentCategorySnapshot,
        targetFilterSnapshot: pendingTargetFilterSnapshot,
        currentFilterSnapshot: { searchQuery, tabFilterUrl },
        targetGroupExists,
        elementFound: true,
      })
    ) {
      clearPendingTarget();
      return;
    }

    const element = document.getElementById(`session-card-${pendingTargetGroupId}`);
    if (!element) return;

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedGroupId(pendingTargetGroupId);
    setHighlightOwnership({
      groupId: pendingTargetGroupId,
      workspaceId: pendingTargetWorkspaceId,
      categorySnapshot: pendingTargetCategorySnapshot ?? currentCategorySnapshot,
      filterSnapshot: pendingTargetFilterSnapshot ?? { searchQuery, tabFilterUrl },
    });

    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedGroupId(null);
      setHighlightOwnership(null);
      highlightTimeoutRef.current = null;
    }, 3000);

    const params = new URLSearchParams(window.location.search);
    params.delete('targetGroupId');
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      document.title,
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
    setPendingTargetGroupId(null);
    setPendingTargetWorkspaceId(null);
    setPendingTargetCategorySnapshot(null);
    setPendingTargetFilterSnapshot(null);
  }, [
    activeWorkspaceId,
    groups,
    pendingTargetCategorySnapshot,
    pendingTargetFilterSnapshot,
    pendingTargetGroupId,
    pendingTargetWorkspaceId,
    searchQuery,
    tabFilterUrl,
    selectedCategory,
    showBin,
  ]);

  useEffect(() => () => {
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!highlightOwnership) return;

    const targetGroupExists = useTabBoardStore.getState().groups.some(
      (group) => group.id === highlightOwnership.groupId,
    );
    const currentFilterSnapshot: CaptureFilterSnapshot = { searchQuery, tabFilterUrl };
    const categoryMatches = !highlightOwnership.categorySnapshot
      || sameCaptureCategorySnapshot(highlightOwnership.categorySnapshot, currentCategorySnapshot);
    const filterMatches = !highlightOwnership.filterSnapshot
      || sameCaptureFilterSnapshot(highlightOwnership.filterSnapshot, currentFilterSnapshot);
    const targetStillValid = shouldKeepPendingCaptureTarget({
      targetCategorySnapshot: highlightOwnership.categorySnapshot,
      currentCategorySnapshot,
      targetFilterSnapshot: highlightOwnership.filterSnapshot,
      currentFilterSnapshot,
      targetGroupExists,
      elementFound: true,
    });

    if (
      activeWorkspaceId !== highlightOwnership.workspaceId
      || !categoryMatches
      || !filterMatches
      || !targetGroupExists
      || !targetStillValid
    ) {
      clearCaptureHighlight();
    }
  }, [
    activeWorkspaceId,
    groups,
    highlightOwnership,
    searchQuery,
    tabFilterUrl,
    selectedCategory,
    showBin,
  ]);

  function clearCaptureHighlight(): void {
    setHighlightedGroupId(null);
    setHighlightOwnership(null);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
  }

  useToastNotifications();

  const overlayStyle = {
    width: dragUiState.sourceRect?.width,
    height: dragUiState.sourceRect?.height,
    opacity: dragUiState.payload?.kind === 'group' ? 0.5 : 1,
    pointerEvents: 'none' as const,
  };

  return (
    <ManagerOverlaysProvider
      workspaceKey={workspace?.id}
      categoryKey={`${selectedCategory}:${showBin ? 'bin' : 'workspace'}`}
      itemKey={groups.map((group) => `${group.id}:${group.updatedAt}`).join('|')}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
      <ManagerOverlayDragLifecycle />
      <ManagerTooltipDismissal />
      <div
        className={`manager-shell${sidebarCollapsed ? ' manager-shell--sidebar-collapsed' : ''}${sidebarOverlayOpen || sidebarSelectionOpen || sidebarPreviewOpen ? ' manager-shell--sidebar-overlay-open' : ''}${sidebarHoverSuppressed ? ' manager-shell--sidebar-hover-suppressed' : ''}${activeId && dragUiState.payload?.kind === 'open-tabs' ? ' manager-shell--open-tabs-drag-active' : ''}`}
        data-drag-marker={dragUiState.marker?.kind}
        data-drag-target={dragUiState.target?.kind}
      >
        <header className="manager-topbar">
          <MantineGroup className="manager-topbar-inner" px="sm" gap={0} wrap="nowrap">
            <WorkspaceHeader
              selectedCategory={selectedCategory}
              showBin={showBin}
              dragMarker={dragUiState.marker}
              onSelectCategory={handleSelectCategory}
              onToggleBin={() => setShowBin((value) => !value)}
              onOpenImport={() => setImportModalOpened(true)}
              onOpenExport={() => setExportModalOpened(true)}
            />
          </MantineGroup>
        </header>

        <aside className="manager-sidebar" id="manager-sidebar" aria-label="Open Tabs workspace" onMouseLeave={() => setSidebarHoverSuppressed(false)}>
          <Sidebar
            workspaceId={workspace?.id ?? activeWorkspaceId}
            category={selectedCategory}
            showBin={showBin}
            sidebarCollapsed={sidebarCollapsed}
            sidebarExpanded={!sidebarCollapsed || sidebarOverlayOpen || sidebarSelectionOpen || sidebarPreviewOpen}
            sidebarToggleRef={sidebarToggleRef}
            sidebarRailToggleRef={sidebarRailToggleRef}
            onToggleSidebar={handleSidebarToggle}
            onSelectionModeChange={setSidebarSelectionOpen}
            onOpenTabsSourceKeyChange={handleOpenTabsSourceKeyChange}
          />
        </aside>

        <main className="manager-main" id="manager-main">
          <div className="manager-main-content">
            {showBin ? (
              <BinView />
            ) : (
              <WorkspaceContent
                category={selectedCategory}
                workspaceName={workspace?.name || 'Workspace'}
                runtime={runtime}
                highlightedGroupId={highlightedGroupId}
                dragMarker={dragUiState.marker}
                sourceRect={dragUiState.sourceRect}
              />
            )}
          </div>

        <ImportModal
          opened={importModalOpened}
          onClose={() => setImportModalOpened(false)}
          category={selectedCategory}
        />
        <ExportModal
          opened={exportModalOpened}
          onClose={() => setExportModalOpened(false)}
        />
        </main>
      <DragOverlay dropAnimation={null}>
        <div className="manager-drag-overlay__preview" style={overlayStyle} aria-hidden="true">
          {dragUiState.payload?.kind === 'category' ? (
            <div className="manager-drag-overlay__label">{dragUiState.payload.categoryId}</div>
          ) : dragUiState.payload?.kind === 'tabs' ? (
            <div className="manager-drag-overlay__stack">
              {activeTabInfo && (
                <TabItemRow
                  tab={activeTabInfo.tab}
                  groupId={activeTabInfo.groupId}
                  workspaceId={activeWorkspaceId}
                  tabIndex={groups.find((group) => group.id === activeTabInfo.groupId)?.tabs.findIndex((tab) => tab.id === activeTabInfo.tab.id) ?? 0}
                  selectedRefs={[]}
                  runtime={runtime}
                  isDragOverlay
                />
              )}
              <span className="manager-drag-overlay__label">{dragUiState.payload.refs.length} saved tabs</span>
            </div>
          ) : dragUiState.payload?.kind === 'open-tabs' ? (
            <div className="manager-drag-overlay__stack">
              {dragUiState.payload.tabIds.slice(0, 3).map((tabId) => (
                <span key={tabId} className="manager-drag-overlay__row-silhouette" aria-hidden="true" />
              ))}
              <span className="manager-drag-overlay__label">{dragUiState.payload.tabIds.length} open tabs</span>
            </div>
          ) : activeGroup ? (
            <SessionCard group={activeGroup} runtime={runtime} isDragOverlay />
          ) : activeTabInfo ? (
            <TabItemRow
              tab={activeTabInfo.tab}
              groupId={activeTabInfo.groupId}
              workspaceId={activeWorkspaceId}
              tabIndex={groups.find((group) => group.id === activeTabInfo.groupId)?.tabs.findIndex((tab) => tab.id === activeTabInfo.tab.id) ?? 0}
              selectedRefs={[]}
              runtime={runtime}
              isDragOverlay
            />
          ) : null}
        </div>
      </DragOverlay>
      </div>
        <ManagerOverlayPortal onOpenTabPreviewChange={setSidebarPreviewOpen} />
      </DndContext>
    </ManagerOverlaysProvider>
  );
}
