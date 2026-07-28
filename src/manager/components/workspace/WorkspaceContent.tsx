import { memo, useCallback, useMemo } from 'react';
import { Box, Text } from '@mantine/core';
import { IconArchive, IconFolder, IconSearch, IconStar } from '@tabler/icons-react';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { useShallow } from 'zustand/react/shallow';
import { useBoardProjection } from '../../hooks/useBoardProjection';
import type { ManagerRuntime } from '../../hooks/useManagerRuntime';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import type { CategoryFilter } from '../../core/selectors';
import { getCanonicalGroupIndexById } from '../../core/selectors';
import type { DndData, DragMarker, DragSourceRect } from '../../core/dnd';
import { SessionSlot } from '../sessions/SessionSlot';
import { useOverflowCues } from '../../hooks/useOverflowCues';
import { useSessionActivation } from '../../hooks/useSessionActivation';

interface WorkspaceContentProps {
  category: CategoryFilter;
  workspaceName: string;
  runtime: ManagerRuntime;
  highlightedGroupId?: string | null;
  dragMarker?: DragMarker | null;
  sourceRect?: DragSourceRect | null;
}

interface GroupInsertionTargetProps {
  id: string;
  category: CategoryFilter;
  index: number;
  workspaceId: string;
  isMarker?: boolean;
  isEndTarget?: boolean;
}

const GroupInsertionTarget = memo(function GroupInsertionTarget({
  id,
  category,
  index,
  workspaceId,
  isMarker = false,
  isEndTarget = false,
}: GroupInsertionTargetProps) {
  const { setNodeRef } = useDroppable({
    id,
    data: {
      type: 'group-insert',
      dnd: {
        targets: [{ kind: 'group-insert', category, index, workspaceId }],
      } satisfies DndData,
    },
  });
  // data-drop-target="new-group" remains oracle marker for end insertion targets.
  return (
    <div
      ref={setNodeRef}
      className={`session-board__group-insert-target${isEndTarget ? ' session-board__end-target' : ''}`}
      data-drop-target={id.startsWith('new-group') ? 'new-group' : 'group-insert'}
      data-over={isMarker || undefined}
      aria-hidden="true"
    >
      {isMarker && <span className="session-board__drop-marker" aria-hidden="true" />}
    </div>
  );
});

export function getSessionCardDragMarker(
  dragMarker: DragMarker | null,
  groupId: string,
): DragMarker | null {
  return dragMarker?.kind === 'tab' && dragMarker.groupId === groupId
    ? dragMarker
    : null;
}

export function WorkspaceContent({
  category,
  workspaceName,
  runtime,
  highlightedGroupId,
  dragMarker = null,
  sourceRect = null,
}: WorkspaceContentProps) {
  const {
    workspaceId,
    categoryGroups,
    visibleGroups,
    searchQuery,
  } = useBoardProjection(category);
  const folderId = category.startsWith('folder:') ? category.slice('folder:'.length) : null;
  const { currentFolder } = useTabBoardStore(
    useShallow((state) => ({
      currentFolder: folderId
        ? state.folders.find((folder) => folder.id === folderId) ?? null
        : null,
    })),
  );
  const hasSearch = searchQuery.trim().length > 0;
  const boardOverflow = useOverflowCues<HTMLElement>();
  const activationContextKey = `${workspaceId}:${category}:${searchQuery}`;
  const groupIds = useMemo(
    () => visibleGroups.map((group) => group.id),
    [visibleGroups],
  );
  const canonicalIndexByGroupId = useMemo(
    () => getCanonicalGroupIndexById(categoryGroups),
    [categoryGroups],
  );
  const forcedIds = highlightedGroupId ? [highlightedGroupId] : [];
  const sessionActivation = useSessionActivation({
    contextKey: activationContextKey,
    forcedIds,
    groupIds,
  });
  const setBoardRef = useCallback((element: HTMLElement | null) => {
    boardOverflow.ref(element);
    sessionActivation.rootRef(element);
  }, [boardOverflow.ref, sessionActivation.rootRef]);

  const getTitle = () => {
    if (category === 'saved') return 'Saved';
    if (category === 'archive') return 'Archive';
    if (category === 'inbox') return 'Inbox';
    return currentFolder?.name || 'Category';
  };

  const getEmptyState = () => {
    const emptyStateProps = {
      style: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        height: '100%',
        padding: '20px',
      },
    };

    if (hasSearch) {
      return (
        <Box {...emptyStateProps}>
          <IconSearch size={48} aria-hidden="true" style={{ opacity: 0.3 }} />
          <Text mt="md" fw={500}>No results for "{searchQuery}"</Text>
          <Text size="sm" c="dimmed">Try different keywords or check your spelling</Text>
        </Box>
      );
    }

    if (category === 'saved') {
      return (
        <Box {...emptyStateProps}>
          <IconStar size={48} aria-hidden="true" style={{ opacity: 0.3 }} />
          <Text mt="md" fw={500}>No saved sessions yet</Text>
          <Text size="sm" c="dimmed">Star important sessions to find them quickly</Text>
        </Box>
      );
    }

    if (category === 'archive') {
      return (
        <Box {...emptyStateProps}>
          <IconArchive size={48} aria-hidden="true" style={{ opacity: 0.3 }} />
          <Text mt="md" fw={500}>No archived sessions yet</Text>
          <Text size="sm" c="dimmed">Archive old sessions to keep your inbox clean</Text>
        </Box>
      );
    }

    if (category.startsWith('folder:')) {
      return (
        <Box {...emptyStateProps}>
          <IconFolder size={48} aria-hidden="true" style={{ opacity: 0.3 }} />
          <Text mt="md" fw={500}>This category is empty</Text>
          <Text size="sm" c="dimmed">Move sessions here to organize your work</Text>
        </Box>
      );
    }

    return (
      <Box {...emptyStateProps}>
        <IconArchive size={48} aria-hidden="true" style={{ opacity: 0.3 }} />
        <Text mt="md" fw={500}>No sessions here yet</Text>
        <Text size="sm" c="dimmed">Save tabs from your browser to get started</Text>
      </Box>
    );
  };

  return (
    <section
      ref={setBoardRef}
      className="manager-board"
      aria-label={`${workspaceName} ${getTitle()} sessions`}
      data-inline-end={boardOverflow.cues.inlineEnd || undefined}
      data-inline-start={boardOverflow.cues.inlineStart || undefined}
      tabIndex={-1}
    >
      {visibleGroups.length === 0 ? (
        <div className="manager-board__empty-content">
          {getEmptyState()}
          <div className="session-board" tabIndex={-1}>
            <GroupInsertionTarget
              id={`new-group-${workspaceId}-${category}`}
              category={category}
              index={categoryGroups.length}
              workspaceId={workspaceId}
              isMarker={dragMarker?.kind === 'group' && dragMarker.index === categoryGroups.length}
              isEndTarget
            />
          </div>
        </div>
      ) : (
        <SortableContext items={visibleGroups.map((group) => `group-${group.id}`)} strategy={rectSortingStrategy}>
          <div className="session-board" tabIndex={-1}>
            {visibleGroups.map((group) => {
              const groupIndex = canonicalIndexByGroupId.get(group.id) ?? 0;
              return (
                <div key={group.id} className="session-board__group-slot">
                  <GroupInsertionTarget
                    id={`group-insert-${group.id}`}
                    category={category}
                    index={groupIndex}
                    workspaceId={workspaceId}
                    isMarker={dragMarker?.kind === 'group' && dragMarker.index === groupIndex}
                  />
                  <SessionSlot
                    activate={() => sessionActivation.activate(group.id)}
                    group={group}
                    runtime={runtime}
                    searchQuery={searchQuery}
                    groupIndex={groupIndex}
                    groupCategory={category}
                    highlighted={highlightedGroupId === group.id}
                    interactive={sessionActivation.activeIds.has(group.id)}
                    registerSlot={sessionActivation.registerSlot(group.id)}
                    dragMarker={getSessionCardDragMarker(dragMarker, group.id)}
                    sourceRect={sourceRect}
                  />
                </div>
              );
            })}
            <GroupInsertionTarget
              id={`new-group-${workspaceId}-${category}`}
              category={category}
              index={categoryGroups.length}
              workspaceId={workspaceId}
              isMarker={dragMarker?.kind === 'group' && dragMarker.index === categoryGroups.length}
              isEndTarget
            />
          </div>
        </SortableContext>
      )}
    </section>
  );
}
