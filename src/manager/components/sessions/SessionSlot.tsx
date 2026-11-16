import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Group } from '../../../shared/model';
import { normalizeSearch } from '../../../shared/model';
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
  readOnly = false,
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
  readOnly?: boolean;
}) {
  const slotElement = useRef<HTMLDivElement | null>(null);
  const transfersFocus = useRef(false);
  const setSlotRef = useCallback((element: HTMLDivElement | null) => {
    slotElement.current = element;
    registerSlot(element);
  }, [registerSlot]);
  const [retainsInteraction, setRetainsInteraction] = useState(false);
  const [focused, setFocused] = useState(false);
  const active = interactive || retainsInteraction || focused;
  useLayoutEffect(() => {
    if (!active || !transfersFocus.current) return;
    transfersFocus.current = false;
    slotElement.current?.querySelector<HTMLElement>('.session-card__title')?.focus();
  }, [active]);
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
    disabled: readOnly,
  });
  const readingPosition = useRef({ contextKey: '', scrollTop: 0 });
  const listContextKey = JSON.stringify([
    group.workspaceId, group.id, groupCategory, readOnly, normalizeSearch(searchQuery),
  ]);
  useLayoutEffect(() => {
    if (readingPosition.current.contextKey !== listContextKey) {
      readingPosition.current = { contextKey: listContextKey, scrollTop: 0 };
    }
    const list = slotElement.current?.querySelector<HTMLDivElement>('.session-card__tabs');
    if (!list) return;
    // This record belongs to the old context during cleanup, even if the Slot is reused.
    const position = readingPosition.current;
    list.scrollTop = Math.min(position.scrollTop, Math.max(0, list.scrollHeight - list.clientHeight));
    const capture = () => {
      // Removed/hidden Chromium nodes have no layout box and report zero, not their reading position.
      if (list.isConnected && list.clientHeight > 0) position.scrollTop = list.scrollTop;
    };
    capture();
    list.addEventListener('scroll', capture, { passive: true });
    return () => {
      capture();
      list.removeEventListener('scroll', capture);
    };
  }, [active, isDragging, listContextKey, group]);
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
  const content = active ? (
    <SessionCard
      onInteractionChange={setRetainsInteraction}
      dragMarker={dragMarker}
      group={group}
      highlighted={highlighted}
      runtime={runtime}
      searchQuery={searchQuery}
      selectionScope={selectionScope}
      readOnly={readOnly}
      onOpenSessionTargetPicker={onOpenSessionTargetPicker}
      sortable={sortable}
      sourceRect={sourceRect}
    />
  ) : (
    <SessionCardShell
      activate={activate}
      group={group}
      readOnly={readOnly}
      sortable={sortable}
    />
  );
  return (
    <div
      ref={setSlotRef}
      className="session-slot"
      data-session-slot-id={group.id}
      data-session-active={active || undefined}
      onFocusCapture={() => {
        if (!active) transfersFocus.current = true;
        setFocused(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {content}
    </div>
  );
}
