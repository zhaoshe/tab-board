import { ActionIcon, Button, Group, Text, Tooltip } from '@mantine/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { IconGripVertical } from '@tabler/icons-react';
import type { CategoryFilter, CategoryStripItem } from '../../core/selectors';
import type { DndData, DragMarker } from '../../core/dnd';
import { formatNumber } from '../../../shared/utils/formatters';

export function isCategoryDragMarkerFor(
  marker: DragMarker | null | undefined,
  categoryId: string,
  placement?: 'before' | 'after',
): boolean {
  return marker?.kind === 'category-reorder'
    && marker.categoryId === categoryId
    && (placement === undefined || marker.placement === placement);
}

function CategoryReorderTarget({
  id,
  categoryId,
  placement,
  workspaceId,
  dragMarker,
}: {
  id: string;
  categoryId: string;
  placement: 'before' | 'after';
  workspaceId: string;
  dragMarker?: DragMarker | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: {
      type: 'category-reorder',
      dnd: {
        targets: [{ kind: 'category-reorder', categoryId, placement, workspaceId }],
      } satisfies DndData,
    },
  });
  const isMarker = isCategoryDragMarkerFor(dragMarker, categoryId, placement);
  return (
    <span
      ref={setNodeRef}
      className="manager-category-reorder-target"
      data-over={isOver || isMarker || undefined}
      data-drag-marker={isMarker ? placement : undefined}
      aria-hidden="true"
    />
  );
}

function CategoryDndItem({
  item,
  workspaceId,
  dragMarker,
  isActive,
  onSelect,
}: {
  item: CategoryStripItem;
  workspaceId: string;
  dragMarker?: DragMarker | null;
  isActive: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragNodeRef,
    setActivatorNodeRef,
  } = useDraggable({
    id: `category-${item.id}`,
    data: {
      type: 'category',
      dnd: {
        payload: { kind: 'category', categoryId: item.id, workspaceId },
      } satisfies DndData,
    },
  });
  const { setNodeRef: setColumnNodeRef, isOver } = useDroppable({
    id: `category-column-${item.id}`,
    data: {
      type: 'category-column',
      dnd: {
        targets: [{ kind: 'category-column', category: item.id, workspaceId }],
      } satisfies DndData,
    },
  });
  const isMarker = dragMarker?.kind === 'category' && dragMarker.categoryId === item.id;
  return (
    <div
      ref={(node) => {
        setColumnNodeRef(node);
        setDragNodeRef(node);
      }}
      className="manager-category-item"
      data-category-column={item.id}
      data-over={isOver || isMarker || undefined}
      data-drag-marker={isMarker ? dragMarker.placement : undefined}
    >
      <CategoryReorderTarget
        id={`category-reorder-${item.id}-before`}
        categoryId={item.id}
        placement="before"
        workspaceId={workspaceId}
        dragMarker={dragMarker}
      />
      <Group className="manager-category-control" gap={0} wrap="nowrap">
        <Tooltip label={`Reorder ${item.label}`}>
          <ActionIcon
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="manager-category-drag-handle"
            data-category-drag-handle
            variant="subtle"
            aria-label={`Reorder ${item.label}`}
          >
            <IconGripVertical size={14} aria-hidden="true" />
          </ActionIcon>
        </Tooltip>
        <Button
          variant={isActive ? 'light' : 'subtle'}
          color={isActive ? 'blue' : 'gray'}
          size="sm"
          data-category-id={item.id}
          data-category-trigger="label"
          aria-current={isActive ? 'page' : undefined}
          onClick={onSelect}
        >
          <Text size="sm">{item.label}</Text>
          {(item.count > 0 || isActive) && (
            <span className="manager-category-count tabular-nums">
              {formatNumber(item.count)}
            </span>
          )}
        </Button>
      </Group>
      <CategoryReorderTarget
        id={`category-reorder-${item.id}-after`}
        categoryId={item.id}
        placement="after"
        workspaceId={workspaceId}
        dragMarker={dragMarker}
      />
    </div>
  );
}

export function CategoryNav({
  categories,
  workspaceId,
  selectedCategory,
  showBin,
  dragMarker,
  onSelect,
}: {
  categories: readonly CategoryStripItem[];
  workspaceId: string;
  selectedCategory: CategoryFilter;
  showBin: boolean;
  dragMarker?: DragMarker | null;
  onSelect: (category: CategoryFilter) => void;
}) {
  return (
    <nav className="manager-category-nav" aria-label="Categories">
      <Group gap={2} wrap="nowrap">
        {categories.map((item) => (
          <CategoryDndItem
            key={item.id}
            item={item}
            workspaceId={workspaceId}
            dragMarker={dragMarker}
            isActive={!showBin && selectedCategory === item.id}
            onSelect={() => onSelect(item.id)}
          />
        ))}
      </Group>
    </nav>
  );
}
