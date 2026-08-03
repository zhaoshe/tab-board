import {
  useLayoutEffect,
  useRef,
} from 'react';
import { Button, Group, Text } from '@mantine/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
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
  categoryId,
  placement,
  workspaceId,
  dragMarker,
}: {
  categoryId: string;
  placement: 'before' | 'after';
  workspaceId: string;
  dragMarker?: DragMarker | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `category-reorder-${categoryId}-${placement}`,
    data: {
      type: 'category-reorder',
      dnd: {
        targets: [{
          kind: 'category-reorder',
          categoryId,
          placement,
          workspaceId,
        }],
      } satisfies DndData,
    },
  });
  const isMarker = isCategoryDragMarkerFor(
    dragMarker,
    categoryId,
    placement,
  );
  return (
    <span
      ref={setNodeRef}
      className="manager-category-reorder-target"
      data-category-reorder-target={`${categoryId}-${placement}`}
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
    listeners,
    setNodeRef: setDragNodeRef,
    setActivatorNodeRef,
  } = useDraggable({
    id: `category-${item.id}`,
    data: {
      type: 'category',
      dnd: {
        payload: {
          kind: 'category',
          categoryId: item.id,
          workspaceId,
        },
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
  const {
    onKeyDown: _keyboardListener,
    onPointerDown,
    onTouchStart,
    ...surfaceListeners
  } = listeners ?? {};

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
        categoryId={item.id}
        placement="before"
        workspaceId={workspaceId}
        dragMarker={dragMarker}
      />
      <Group className="manager-category-control" gap={0} wrap="nowrap">
        <Button
          ref={setActivatorNodeRef}
          variant={isActive ? 'light' : 'subtle'}
          color={isActive ? 'cobalt' : 'gray'}
          size="sm"
          data-category-id={item.id}
          data-category-trigger="label"
          aria-current={isActive ? 'page' : undefined}
          {...surfaceListeners}
          onPointerDown={(event) => {
            if (event.pointerType === 'touch') return;
            onPointerDown?.(event);
          }}
          onTouchStart={(event) => onTouchStart?.(event)}
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
  const navRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav || showBin) return undefined;
    const active = [...nav.querySelectorAll<HTMLElement>('[data-category-id]')]
      .find((item) => item.dataset.categoryId === selectedCategory);
    if (!active) return undefined;

    let frame = 0;
    const revealActiveCategory = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const navRect = nav.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        if (activeRect.left < navRect.left) {
          nav.scrollLeft += activeRect.left - navRect.left;
        } else if (activeRect.right > navRect.right) {
          nav.scrollLeft += activeRect.right - navRect.right;
        }
      });
    };

    revealActiveCategory();
    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(revealActiveCategory)
      : null;
    observer?.observe(nav);
    observer?.observe(active);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [selectedCategory, showBin]);

  return (
    <nav ref={navRef} className="manager-category-nav" aria-label="Categories">
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
