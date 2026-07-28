import type { CSSProperties } from 'react';
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Group } from '../../../shared/model';
import type { CategoryFilter } from '../../core/selectors';
import {
  getDragPlaceholderStyle,
  type DragMarker,
  type DragSourceRect,
} from '../../core/dnd';
import type { ManagerRuntime } from '../../hooks/useManagerRuntime';
import { SessionCard } from './SessionCard';
import { SessionPlaceholder } from './SessionPlaceholder';

export interface SessionSortableBindings {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  setNodeRef: (element: HTMLElement | null) => void;
  style: CSSProperties;
}

export function SessionSlot({
  dragMarker,
  group,
  groupCategory,
  groupIndex,
  highlighted,
  runtime,
  searchQuery,
  sourceRect,
}: {
  dragMarker: DragMarker | null;
  group: Group;
  groupCategory: CategoryFilter;
  groupIndex: number;
  highlighted: boolean;
  runtime: ManagerRuntime;
  searchQuery: string;
  sourceRect: DragSourceRect | null;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `group-${group.id}`,
    data: {
      type: 'group',
      groupId: group.id,
      workspaceId: group.workspaceId,
      dnd: {
        payload: {
          kind: 'group',
          groupId: group.id,
          workspaceId: group.workspaceId,
        },
        targets: [{
          kind: 'group-body',
          groupId: group.id,
          workspaceId: group.workspaceId,
        }],
        groupIndex,
        groupCategory,
      },
    },
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'default',
  };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="session-card__placeholder-slot"
      >
        <SessionPlaceholder style={getDragPlaceholderStyle(sourceRect)} />
      </div>
    );
  }

  const sortable: SessionSortableBindings = {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    style,
  };
  return (
    <SessionCard
      dragMarker={dragMarker}
      group={group}
      highlighted={highlighted}
      runtime={runtime}
      searchQuery={searchQuery}
      sortable={sortable}
      sourceRect={sourceRect}
    />
  );
}
