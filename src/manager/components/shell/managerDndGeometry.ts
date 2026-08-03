import {
  type ClientRect,
  type CollisionDetection,
  type DroppableContainer,
  type Over,
} from '@dnd-kit/core';
import {
  DROP_TARGET_RELEASE_MARGIN,
  getTabDropPlacement,
  lockDropTarget,
  type DndData,
  type DragPayload,
  type DragUiState,
  type DropTarget,
} from '../../core/dnd';

export function getPayload(data: unknown): DragPayload | null {
  if (!data || typeof data !== 'object') return null;
  return (data as { dnd?: DndData }).dnd?.payload ?? null;
}

export function getTargets(data: unknown): DropTarget[] {
  if (!data || typeof data !== 'object') return [];
  return (data as { dnd?: DndData }).dnd?.targets ?? [];
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
  const overTarget = getTargets(over.data.current)[0] ?? null;
  if (overTarget?.kind === 'new-session-insert') {
    return dragUiTarget?.kind === 'new-session-insert'
      && targetEquals(overTarget, dragUiTarget)
      ? dragUiTarget
      : null;
  }
  const ordinaryLockedTarget = lockedTarget?.kind === 'new-session-insert'
    ? null
    : lockedTarget;
  if (overTarget) return ordinaryLockedTarget ?? overTarget;
  return dragUiTarget?.kind === 'new-session-insert'
    ? null
    : ordinaryLockedTarget ?? dragUiTarget;
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
    && point.x < rect.right
    && point.y >= rect.top
    && point.y < rect.bottom;
}

function isCompatibleTarget(payload: DragPayload, target: DropTarget): boolean {
  if (payload.kind === 'group') {
    return target.kind === 'group-insert' || target.kind === 'category-column';
  }
  if (payload.kind === 'category') return target.kind === 'category-reorder';
  return target.kind === 'group-body'
    || target.kind === 'tab-before'
    || target.kind === 'new-session-insert';
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

export function markerForTarget(target: DropTarget | null): DragUiState['marker'] {
  if (!target) return null;
  if (target.kind === 'group-insert' || target.kind === 'new-session-insert') {
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
    let exactCandidate: GeometryCandidate | null = null;
    let lockedCandidate: GeometryCandidate | null = null;
    const lockedTarget = lockedTargetRef.current;

    for (const container of droppableContainers) {
      const rect = droppableRects.get(container.id);
      if (!rect) continue;
      const target = getTargets(container.data.current)
        .find((candidate) => isCompatibleTarget(payload, candidate));
      if (!target) continue;
      if (target.kind === 'new-session-insert') {
        if (pointerCoordinates && isPointWithinRect(pointerCoordinates, rect)) {
          exactCandidate = {
            container,
            target,
            distance: 0,
          };
        }
        continue;
      }
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
    if (exactCandidate) {
      lockedTargetRef.current = null;
      return [{
        id: exactCandidate.container.id,
        data: {
          droppableContainer: exactCandidate.container,
          value: 0,
        },
      }];
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
