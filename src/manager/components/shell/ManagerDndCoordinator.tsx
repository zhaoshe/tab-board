import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  type ClientRect,
  type CollisionDetection,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
  type DroppableContainer,
  type KeyboardCoordinateGetter,
  type Over,
  useDndMonitor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type {
  DropIntent,
  Group,
  TabItem,
} from '../../../shared/model';
import type { OpenTabInfo } from '../../../shared/openTabs';
import { formatNumber } from '../../../shared/utils/formatters';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import {
  DROP_TARGET_RELEASE_MARGIN,
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
import type { CategoryFilter } from '../../core/selectors';
import type { ManagerRuntime } from '../../hooks/useManagerRuntime';
import type { OpenTabsWorkflow } from '../../hooks/useOpenTabsRuntime';
import {
  useManagerOverlayCommands,
} from '../../hooks/useManagerOverlays';
import { SessionCard } from '../sessions/SessionCard';
import { TabItemRow } from '../sessions/TabItemRow';

function getPayload(data: unknown): DragPayload | null {
  if (!data || typeof data !== 'object') return null;
  return (data as { dnd?: DndData }).dnd?.payload ?? null;
}

function getTargets(data: unknown): DropTarget[] {
  if (!data || typeof data !== 'object') return [];
  return (data as { dnd?: DndData }).dnd?.targets ?? [];
}

interface GroupKeyboardTarget {
  target: DropTarget;
  rect: ClientRect;
}

interface KeyboardCoordinates {
  x: number;
  y: number;
}

interface GroupKeyboardCoordinateResult {
  coordinates: KeyboardCoordinates;
  index: number;
}

export function getGroupKeyboardCoordinates(
  code: string,
  currentIndex: number,
  collisionRect: ClientRect,
  targets: readonly GroupKeyboardTarget[],
): GroupKeyboardCoordinateResult | null {
  if (code !== 'ArrowLeft' && code !== 'ArrowRight') return null;
  const direction = code === 'ArrowRight' ? 1 : -1;
  const nextIndex = currentIndex + direction;
  const candidate = targets.find(({ target }) => (
    (target.kind === 'group-insert' || target.kind === 'new-group')
    && target.index === nextIndex
  ));
  if (!candidate) return null;
  return {
    coordinates: {
      x: candidate.rect.left + candidate.rect.width / 2 - collisionRect.width / 2,
      y: candidate.rect.top + candidate.rect.height / 2 - collisionRect.height / 2,
    },
    index: nextIndex,
  };
}

export function createManagerKeyboardCoordinates(
  groupIndexRef: MutableRefObject<number | null>,
): KeyboardCoordinateGetter {
  return (event, args) => {
    const payload = getPayload(args.context.active?.data.current);
    if (
      payload?.kind !== 'group'
      || groupIndexRef.current === null
      || (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight')
      || !args.context.collisionRect
    ) {
      return sortableKeyboardCoordinates(event, args);
    }
    event.preventDefault();
    const targets = args.context.droppableContainers.getEnabled().flatMap((container) => {
      const rect = args.context.droppableRects.get(container.id);
      const target = getTargets(container.data.current)
        .find((candidate) => candidate.kind === 'group-insert' || candidate.kind === 'new-group');
      return rect && target ? [{ rect, target }] : [];
    });
    const result = getGroupKeyboardCoordinates(
      event.code,
      groupIndexRef.current,
      args.context.collisionRect,
      targets,
    );
    if (!result) return undefined;
    groupIndexRef.current = result.index;
    return result.coordinates;
  };
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
    ?? (lockedCandidate && targetEquals(target, lockedCandidate.target)
      ? lockedCandidate
      : nearestCandidate);
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
    groups: groups.map((group) =>
      `${group.id}:${group.updatedAt}:${group.tabs.map((tab) =>
        `${tab.id}:${tab.updatedAt}`).join(',')}`).join('|'),
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

export function getFinishedDragState(
  state: DragUiState,
): { activeId: null; dragUiState: DragUiState } {
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
  const dx = point.x < rect.left
    ? rect.left - point.x
    : point.x > rect.right
      ? point.x - rect.right
      : 0;
  const dy = point.y < rect.top
    ? rect.top - point.y
    : point.y > rect.bottom
      ? point.y - rect.bottom
      : 0;
  return Math.hypot(dx, dy);
}

export function isPointWithinRect(
  point: { x: number; y: number },
  rect: ClientRect,
): boolean {
  return point.x >= rect.left
    && point.x <= rect.right
    && point.y >= rect.top
    && point.y <= rect.bottom;
}

function isCompatibleTarget(payload: DragPayload, target: DropTarget): boolean {
  if (payload.kind === 'group') {
    return target.kind === 'group-insert' || target.kind === 'category-column';
  }
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
  if (target.kind === 'group-insert' || target.kind === 'new-group') {
    return { kind: 'group', index: target.index };
  }
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
  return {
    kind: 'category-reorder',
    categoryId: target.categoryId,
    placement: target.placement,
  };
}

export function createGeometryCollisionDetection(
  lockedTargetRef: { current: DropTarget | null },
): CollisionDetection {
  return ({
    active,
    pointerCoordinates,
    collisionRect,
    droppableRects,
    droppableContainers,
  }) => {
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
      const target = getTargets(container.data.current)
        .find((candidate) => isCompatibleTarget(payload, candidate));
      if (!target) continue;
      if (target.kind === 'category-column' && !isPointWithinRect(pointer, rect)) {
        continue;
      }
      const candidate: GeometryCandidate = {
        container,
        target: resolveTabEdgeTarget(target, pointer, rect),
        distance: distanceToRect(pointer, rect),
      };
      if (target.kind === 'category-column') {
        if (!categoryCandidate || candidate.distance < categoryCandidate.distance) {
          categoryCandidate = candidate;
        }
      } else if (!nearestCandidate || candidate.distance < nearestCandidate.distance) {
        nearestCandidate = candidate;
      }
      if (
        lockedTarget
        && targetEquals(candidate.target, lockedTarget)
        && (!lockedCandidate || candidate.distance < lockedCandidate.distance)
      ) {
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

function ManagerOverlayDragLifecycle() {
  const { closeOverlays } = useManagerOverlayCommands();
  useDndMonitor({ onDragStart: () => closeOverlays() });
  return null;
}

export interface ManagerDndState {
  activeId: string | null;
  dragUiState: DragUiState;
  onOpenTabsSourceKeyChange: (key: string) => void;
}

interface ManagerDndCoordinatorProps {
  activeWorkspaceId: string;
  selectedCategory: CategoryFilter;
  showBin: boolean;
  groups: Group[];
  runtime: ManagerRuntime;
  openTabsWorkflow: OpenTabsWorkflow;
  applyDropIntent: (
    intent: DropIntent,
    openTabs?: readonly OpenTabInfo[],
  ) => Promise<void>;
  showSuccess: (message: string, title?: string) => void;
  showError: (message: string, title?: string) => void;
  children: (state: ManagerDndState) => ReactNode;
}

export function ManagerDndCoordinator({
  activeWorkspaceId,
  selectedCategory,
  showBin,
  groups,
  runtime,
  openTabsWorkflow,
  applyDropIntent,
  showSuccess,
  showError,
  children,
}: ManagerDndCoordinatorProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragUiState, setDragUiState] = useState<DragUiState>(clearDragState());
  const dragUiStateRef = useRef<DragUiState>(clearDragState());
  const lockedTargetRef = useRef<DropTarget | null>(null);
  const groupKeyboardIndexRef = useRef<number | null>(null);
  const dragReplacementKeyRef = useRef<DragReplacementSnapshot | null>(null);
  const openTabsSourceKeyRef = useRef<string | null>(null);
  const replacementSnapshot = useMemo(
    () => getDragReplacementSnapshot(
      activeWorkspaceId,
      selectedCategory,
      showBin,
      groups,
    ),
    [activeWorkspaceId, groups, selectedCategory, showBin],
  );
  const collisionDetection = useMemo(
    () => createGeometryCollisionDetection(lockedTargetRef),
    [],
  );
  const keyboardCoordinates = useMemo(
    () => createManagerKeyboardCoordinates(groupKeyboardIndexRef),
    [],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
    }),
  );

  const applyDragUiState = useCallback((next: DragUiState) => {
    dragUiStateRef.current = next;
    setDragUiState(next);
  }, []);
  const finishDrag = useCallback(() => {
    lockedTargetRef.current = null;
    groupKeyboardIndexRef.current = null;
    dragReplacementKeyRef.current = null;
    const finished = getFinishedDragState(dragUiStateRef.current);
    setActiveId(finished.activeId);
    applyDragUiState(finished.dragUiState);
  }, [applyDragUiState]);
  const onOpenTabsSourceKeyChange = useCallback((key: string) => {
    const previous = openTabsSourceKeyRef.current;
    openTabsSourceKeyRef.current = key;
    if (
      previous !== null
      && previous !== key
      && dragUiStateRef.current.payload?.kind === 'open-tabs'
    ) {
      finishDrag();
    }
  }, [finishDrag]);

  const handleDragStart = (event: DragStartEvent) => {
    const initial = event.active.rect.current.initial;
    const dndData = (event.active.data.current as { dnd?: DndData } | undefined)?.dnd;
    groupKeyboardIndexRef.current = dndData?.payload?.kind === 'group'
      && Number.isSafeInteger(dndData.groupIndex)
      ? dndData.groupIndex!
      : null;
    dragReplacementKeyRef.current = replacementSnapshot;
    applyDragUiState({
      payload: getPayload(event.active.data.current),
      target: null,
      marker: null,
      sourceRect: initial
        ? {
            left: initial.left,
            top: initial.top,
            width: initial.width,
            height: initial.height,
          }
        : null,
    });
    setActiveId(String(event.active.id));
  };
  const handleDragOver = (event: { over: Over | null }) => {
    const target = lockedTargetRef.current
      ?? getTargets(event.over?.data.current)[0]
      ?? null;
    if (!target) {
      applyDragUiState({ ...dragUiStateRef.current, target: null, marker: null });
      return;
    }
    const payload = dragUiStateRef.current.payload;
    if (
      payload?.kind === 'group'
      && !resolveDrop({ payload, target, state: useTabBoardStore.getState() })
    ) {
      lockedTargetRef.current = null;
      applyDragUiState({ ...dragUiStateRef.current, target: null, marker: null });
      return;
    }
    applyDragUiState({
      ...dragUiStateRef.current,
      target,
      marker: markerForTarget(target),
    });
  };
  const handleDragEnd = async (event: DragEndEvent) => {
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
      const openTabs = (
        event.active.data.current as { dnd?: DndData } | undefined
      )?.dnd?.records ?? [];
      const intent = resolveDrop({
        payload,
        target,
        state: useTabBoardStore.getState(),
        openTabs,
      });
      if (!intent) return;
      const persisted = await persistDropWithFeedback(
        () => applyDropIntent(intent, openTabs as OpenTabInfo[]),
        showSuccess,
        showError,
      );
      if (persisted && payload.kind === 'open-tabs') {
        openTabsWorkflow.commands.completeDrop();
      }
    } finally {
      finishDrag();
    }
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
    if (shouldInvalidateDragReplacement(
      activeId,
      payload,
      dragReplacementKeyRef.current,
      replacementSnapshot,
      payload ? isDragSourceStillRendered(payload, groups) : false,
    )) {
      finishDrag();
    }
  }, [activeId, finishDrag, groups, replacementSnapshot]);
  useEffect(() => () => finishDrag(), [finishDrag]);

  const activeGroup = groups.find((group) => `group-${group.id}` === activeId);
  let activeTabInfo: { tab: TabItem; groupId: string } | null = null;
  if (activeId?.startsWith('tab-')) {
    for (const group of groups) {
      const tab = group.tabs.find((candidate) =>
        `tab-${group.id}-${candidate.id}` === activeId);
      if (tab) {
        activeTabInfo = { tab, groupId: group.id };
        break;
      }
    }
  }
  const overlayStyle = {
    width: dragUiState.sourceRect?.width,
    height: dragUiState.sourceRect?.height,
    opacity: dragUiState.payload?.kind === 'group' ? 0.5 : 1,
    pointerEvents: 'none' as const,
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={(_event: DragCancelEvent) => finishDrag()}
    >
      <ManagerOverlayDragLifecycle />
      {children({ activeId, dragUiState, onOpenTabsSourceKeyChange })}
      <DragOverlay dropAnimation={null}>
        <div
          className="manager-drag-overlay__preview"
          style={overlayStyle}
          aria-hidden="true"
        >
          {dragUiState.payload?.kind === 'category' ? (
            <div className="manager-drag-overlay__label">
              {dragUiState.payload.categoryId}
            </div>
          ) : dragUiState.payload?.kind === 'tabs' ? (
            <div className="manager-drag-overlay__stack">
              {activeTabInfo && (
                <TabItemRow
                  tab={activeTabInfo.tab}
                  groupId={activeTabInfo.groupId}
                  workspaceId={activeWorkspaceId}
                  tabIndex={groups.find(({ id }) => id === activeTabInfo?.groupId)
                    ?.tabs.findIndex(({ id }) => id === activeTabInfo?.tab.id) ?? 0}
                  selectedRefs={[]}
                  runtime={runtime}
                  isDragOverlay
                />
              )}
              <span className="manager-drag-overlay__label tabular-nums">
                {formatNumber(dragUiState.payload.refs.length)} saved tabs
              </span>
            </div>
          ) : dragUiState.payload?.kind === 'open-tabs' ? (
            <div className="manager-drag-overlay__stack">
              {dragUiState.payload.tabIds.slice(0, 3).map((tabId) => (
                <span
                  key={tabId}
                  className="manager-drag-overlay__row-silhouette"
                  aria-hidden="true"
                />
              ))}
              <span className="manager-drag-overlay__label tabular-nums">
                {formatNumber(dragUiState.payload.tabIds.length)} open tabs
              </span>
            </div>
          ) : activeGroup ? (
            <SessionCard group={activeGroup} runtime={runtime} isDragOverlay />
          ) : activeTabInfo ? (
            <TabItemRow
              tab={activeTabInfo.tab}
              groupId={activeTabInfo.groupId}
              workspaceId={activeWorkspaceId}
              tabIndex={groups.find(({ id }) => id === activeTabInfo?.groupId)
                ?.tabs.findIndex(({ id }) => id === activeTabInfo?.tab.id) ?? 0}
              selectedRefs={[]}
              runtime={runtime}
              isDragOverlay
            />
          ) : null}
        </div>
      </DragOverlay>
    </DndContext>
  );
}
