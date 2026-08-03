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
  type DragMoveEvent,
  type DragStartEvent,
  type Over,
  useDndContext,
  useDndMonitor,
} from '@dnd-kit/core';
import type {
  DropIntent,
  Group,
} from '../../../shared/model';
import type { OpenTabInfo } from '../../../shared/openTabs';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import {
  clearDragState,
  createDragPreviewGeometry,
  createDragPreviewItems,
  isDragSourceStillRendered,
  resolveDrop,
  type DndData,
  type DragPayload,
  type DragSourceRect,
  type DragUiState,
  type DropTarget,
} from '../../core/dnd';
import type { CategoryFilter } from '../../core/selectors';
import {
  useBoardDragAutoScroll,
  type BoardDragPointer,
} from '../../hooks/useBoardDragAutoScroll';
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
  getCollisionSelection,
  getDragEndTarget,
  isPointWithinRect,
  type GeometryCandidate,
} from './managerDndGeometry';

export interface DragReplacementSnapshot {
  workspaceId: string;
  category: CategoryFilter;
  view: string;
  groups: Group[];
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
    groups,
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

export function getDragStartSourceRect(
  event: Pick<DragStartEvent, 'active' | 'activatorEvent'>,
): DragSourceRect | null {
  const payload = getPayload(event.active.data.current);
  const target = event.activatorEvent?.target;
  const pointerSource = target instanceof Element
    ? target.closest<HTMLElement>('.tab-item-row__content, .manager-open-tab-row')
    : null;
  const rect = (
    payload?.kind === 'tab'
    || payload?.kind === 'tabs'
    || payload?.kind === 'open-tabs'
  )
    ? pointerSource?.getBoundingClientRect() ?? event.active.rect.current.initial
    : event.active.rect.current.initial;
  return rect
    ? {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }
    : null;
}

export function getDragPreviewBounds(): { width: number; height: number } {
  const viewportWidth = typeof window === 'undefined' ? 960 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 560 : window.innerHeight;
  return {
    width: Math.max(1, Math.floor(Math.min(
      960,
      viewportWidth - 32,
    ))),
    height: Math.max(1, Math.floor(Math.min(
      560,
      viewportHeight - 64,
    ))),
  };
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

type NativeDragPointerEvent = 'pointermove' | 'touchmove';

function getNativeDragPointerEvent(
  event: Event | null | undefined,
): NativeDragPointerEvent | null {
  if (!event || event instanceof KeyboardEvent) return null;
  const touchEvent = event as Event & {
    changedTouches?: ArrayLike<unknown>;
    touches?: ArrayLike<unknown>;
  };
  if (touchEvent.changedTouches || touchEvent.touches) return 'touchmove';
  const pointerEvent = event as Event & { clientX?: number; clientY?: number };
  return Number.isFinite(pointerEvent.clientX)
    && Number.isFinite(pointerEvent.clientY)
    ? 'pointermove'
    : null;
}

function ManagerOverlayDragLifecycle() {
  const { closeOverlays } = useManagerOverlayCommands();
  useDndMonitor({ onDragStart: () => closeOverlays() });
  return null;
}

function ManagerBoardDragAutoScroll({
  active,
  boardRef,
  pause,
  pointerRef,
  wakeRef,
}: {
  active: boolean;
  boardRef: React.RefObject<HTMLElement | null>;
  pause: boolean;
  pointerRef: React.MutableRefObject<BoardDragPointer | null>;
  wakeRef: React.MutableRefObject<() => void>;
}) {
  const {
    droppableContainers,
    measureDroppableContainers,
  } = useDndContext();
  const remeasureDroppables = useCallback(() => {
    measureDroppableContainers(
      droppableContainers.getEnabled().map(({ id }) => id),
    );
  }, [droppableContainers, measureDroppableContainers]);
  const wake = useBoardDragAutoScroll({
    active,
    boardRef,
    pointerRef,
    pause,
    onScrolled: remeasureDroppables,
  });
  wakeRef.current = wake;
  return null;
}

export interface ManagerDndState {
  activeId: string | null;
  dragUiState: DragUiState;
  onOpenTabsSourceKeyChange: (key: unknown) => void;
  registerBoardElement: (element: HTMLElement | null) => void;
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
  const [, setBoardElement] = useState<HTMLElement | null>(null);
  const [nativePointerEvent, setNativePointerEvent] =
    useState<NativeDragPointerEvent | null>(null);
  const boardRef = useRef<HTMLElement | null>(null);
  const pointerRef = useRef<BoardDragPointer | null>(null);
  const autoScrollWakeRef = useRef<() => void>(() => undefined);
  const pointerOriginRef = useRef<BoardDragPointer | null>(null);
  const hasNativePointerMoveRef = useRef(false);
  const dragUiStateRef = useRef<DragUiState>(clearDragState());
  const lockedTargetRef = useRef<DropTarget | null>(null);
  const dragReplacementKeyRef = useRef<DragReplacementSnapshot | null>(null);
  const openTabsSourceKeyRef = useRef<unknown>(null);
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
  const sensors = useManagerDndSensors();

  const applyDragUiState = useCallback((next: DragUiState) => {
    dragUiStateRef.current = next;
    setDragUiState(next);
  }, []);
  const registerBoardElement = useCallback((element: HTMLElement | null) => {
    if (boardRef.current === element) return;
    boardRef.current = element;
    setBoardElement(element);
  }, []);
  const finishDrag = useCallback(() => {
    lockedTargetRef.current = null;
    dragReplacementKeyRef.current = null;
    pointerOriginRef.current = null;
    pointerRef.current = null;
    hasNativePointerMoveRef.current = false;
    setNativePointerEvent(null);
    const finished = getFinishedDragState(dragUiStateRef.current);
    setActiveId(finished.activeId);
    applyDragUiState(finished.dragUiState);
  }, [applyDragUiState]);
  const onOpenTabsSourceKeyChange = useCallback((key: unknown) => {
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

  const getActivatorPointer = (
    event: Event | null | undefined,
  ): BoardDragPointer | null => {
    if (!event) return null;
    const touchEvent = event as Event & {
      changedTouches?: ArrayLike<{ clientX: number; clientY: number }>;
      touches?: ArrayLike<{ clientX: number; clientY: number }>;
    };
    const touch = touchEvent.changedTouches?.[0] ?? touchEvent.touches?.[0];
    const pointerEvent = event as Event & { clientX?: number; clientY?: number };
    const x = touch?.clientX ?? pointerEvent.clientX;
    const y = touch?.clientY ?? pointerEvent.clientY;
    return Number.isFinite(x) && Number.isFinite(y)
      ? { x: x!, y: y! }
      : null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const activeData = event.active.data.current;
    const dndData = (activeData as { dnd?: DndData } | undefined)?.dnd;
    const payload = getPayload(activeData);
    dragReplacementKeyRef.current = replacementSnapshot;
    const sourceRect = getDragStartSourceRect(event);
    const previewItems = createDragPreviewItems(
      payload,
      useTabBoardStore.getState().groups,
      dndData?.records ?? [],
    );
    const previewGeometry = sourceRect
      && (
        payload?.kind === 'tab'
        || payload?.kind === 'tabs'
        || payload?.kind === 'open-tabs'
      )
      ? createDragPreviewGeometry(
          sourceRect,
          previewItems.length,
          getDragPreviewBounds(),
        )
      : null;
    applyDragUiState({
      payload,
      target: null,
      marker: null,
      sourceRect,
      previewRect: previewGeometry?.previewRect ?? sourceRect,
      previewLayout: previewGeometry?.previewLayout ?? null,
      previewItems,
    });
    const nextPointer = getActivatorPointer(event.activatorEvent);
    pointerOriginRef.current = nextPointer;
    pointerRef.current = nextPointer;
    hasNativePointerMoveRef.current = false;
    setNativePointerEvent(getNativeDragPointerEvent(event.activatorEvent));
    setActiveId(String(event.active.id));
  };
  const handleDragMove = (event: DragMoveEvent) => {
    if (hasNativePointerMoveRef.current) return;
    const origin = pointerOriginRef.current;
    if (
      !origin
      || !Number.isFinite(event.delta.x)
      || !Number.isFinite(event.delta.y)
    ) {
      pointerRef.current = null;
      return;
    }
    pointerRef.current = {
      x: origin.x + event.delta.x,
      y: origin.y + event.delta.y,
    };
    autoScrollWakeRef.current();
  };
  const handleDragOver = (event: { over: Over | null }) => {
    const overTarget = getTargets(event.over?.data.current)[0] ?? null;
    const target = overTarget?.kind === 'new-session-insert'
      ? overTarget
      : lockedTargetRef.current
      ?? overTarget
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
    if (!activeId || !nativePointerEvent) return undefined;
    const handleNativePointerMove = (event: Event) => {
      const nextPointer = getActivatorPointer(event);
      if (!nextPointer) return;
      pointerRef.current = nextPointer;
      hasNativePointerMoveRef.current = true;
      autoScrollWakeRef.current();
    };
    document.addEventListener(nativePointerEvent, handleNativePointerMove, {
      passive: true,
    });
    return () => {
      document.removeEventListener(nativePointerEvent, handleNativePointerMove);
    };
  }, [activeId, nativePointerEvent]);
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
  return (
    <DndContext
      autoScroll={false}
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={(_event: DragCancelEvent) => finishDrag()}
    >
      <ManagerOverlayDragLifecycle />
      <ManagerBoardDragAutoScroll
        active={activeId !== null}
        boardRef={boardRef}
        pointerRef={pointerRef}
        pause={dragUiState.target?.kind === 'new-session-insert'}
        wakeRef={autoScrollWakeRef}
      />
      {children({
        activeId,
        dragUiState,
        onOpenTabsSourceKeyChange,
        registerBoardElement,
      })}
      <span
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-dnd-release-announcement
      >
        {dragUiState.target?.kind === 'new-session-insert'
          ? 'Release to create session'
          : ''}
      </span>
      <DragOverlay
        className="manager-drag-overlay"
        dropAnimation={null}
        style={{ pointerEvents: 'none' }}
        zIndex={17}
      >
        <ManagerDragOverlay
          activeGroup={activeGroup}
          dragUiState={dragUiState}
          runtime={runtime}
        />
      </DragOverlay>
    </DndContext>
  );
}
