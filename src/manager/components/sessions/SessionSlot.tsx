import type { CSSProperties } from 'react';
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
import { SessionCardShell } from './SessionCardShell';
import { SessionPlaceholder } from './SessionPlaceholder';
import type { SessionSortableBindings } from './SessionSortableBindings';
import type { ManagerSelectionScope } from '../../hooks/useManagerSelectionScope';
import type { OpenSessionTargetPickerInput } from '../shell/SessionTargetPicker';

export function SessionSlot({
  dragMarker,
  activate,
  group,
  groupCategory,
  groupIndex,
  highlighted,
  interactive,
  registerSlot,
  runtime,
  searchQuery,
  selectionScope,
  onOpenSessionTargetPicker,
  sourceRect,
}: {
  dragMarker: DragMarker | null;
  activate: () => void;
  group: Group;
  groupCategory: CategoryFilter;
  groupIndex: number;
  highlighted: boolean;
  interactive: boolean;
  registerSlot: (element: Element | null) => void;
  runtime: ManagerRuntime;
  searchQuery: string;
  selectionScope: ManagerSelectionScope;
  onOpenSessionTargetPicker: (input: OpenSessionTargetPickerInput) => void;
  sourceRect: DragSourceRect | null;
}) {
  const {
    listeners,
    setNodeRef,
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
    listeners,
    setNodeRef,
    style,
  };
  const content = interactive ? (
    <SessionCard
      dragMarker={dragMarker}
      group={group}
      highlighted={highlighted}
      runtime={runtime}
      searchQuery={searchQuery}
      selectionScope={selectionScope}
      onOpenSessionTargetPicker={onOpenSessionTargetPicker}
      sortable={sortable}
      sourceRect={sourceRect}
    />
  ) : (
    <SessionCardShell
      activate={activate}
      group={group}
      sortable={sortable}
    />
  );
  return (
    <div
      ref={registerSlot}
      className="session-slot"
      data-session-slot-id={group.id}
      data-session-active={interactive || undefined}
    >
      {content}
    </div>
  );
}
