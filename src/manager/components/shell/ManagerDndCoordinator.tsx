import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  DndContext,
  DragOverlay,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
  type Over,
  useDndMonitor,
} from '@dnd-kit/core';
import type {
  DropIntent,
  Group,
  TabItem,
} from '../../../shared/model';
import type { OpenTabInfo } from '../../../shared/openTabs';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import {
  clearDragState,
  isDragSourceStillRendered,
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
import {
  createGeometryCollisionDetection,
  getDragEndTarget,
  getPayload,
  getTargets,
  markerForTarget,
} from './managerDndGeometry';
import { ManagerDragOverlay } from './ManagerDragOverlay';
import { useManagerDndSensors } from './useManagerDndSensors';

export {
  createGeometryCollisionDetection,
  createManagerKeyboardCoordinates,
  getCollisionSelection,
  getDragEndTarget,
  getGroupKeyboardCoordinates,
  isPointWithinRect,
  type GeometryCandidate,
} from './managerDndGeometry';

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
  const sensors = useManagerDndSensors(groupKeyboardIndexRef);

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
        <ManagerDragOverlay
          activeWorkspaceId={activeWorkspaceId}
          activeGroup={activeGroup}
          activeTabInfo={activeTabInfo}
          dragUiState={dragUiState}
          groups={groups}
          runtime={runtime}
        />
      </DragOverlay>
    </DndContext>
  );
}
