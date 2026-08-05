import { memo, useCallback, useMemo, type ReactNode } from 'react';
import { Box, Text } from '@mantine/core';
import {
  Archive as IconArchive,
  Folder as IconFolder,
  Search as IconSearch,
  Star as IconStar,
} from 'lucide-react';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { useShallow } from 'zustand/react/shallow';
import { useBoardProjection } from '../../hooks/useBoardProjection';
import type { ManagerRuntime } from '../../hooks/useManagerRuntime';
import type { Group as SessionGroup } from '../../../shared/model';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import type { CategoryFilter } from '../../core/selectors';
import { filterGroupsByQuery, getCanonicalGroupIndexById } from '../../core/selectors';
import type {
  DndData,
  DragMarker,
  DragPayload,
  DragSourceRect,
  DropTarget,
} from '../../core/dnd';
import { isAllSourceTabs } from '../../core/dnd';
import { SessionSlot } from '../sessions/SessionSlot';
import { useOverflowCues } from '../../hooks/useOverflowCues';
import { useSessionActivation } from '../../hooks/useSessionActivation';
import type { ManagerSelectionScope } from '../../hooks/useManagerSelectionScope';
import type { OpenSessionTargetPickerInput } from '../shell/SessionTargetPicker';
import { NewSessionGapTarget } from './NewSessionGapTarget';

interface WorkspaceContentProps {
  category: CategoryFilter;
  bookmarkGroups?: readonly SessionGroup[];
  workspaceName: string;
  runtime: ManagerRuntime;
  registerBoardElement?: (element: HTMLElement | null) => void;
  activeDragPayload?: DragPayload | null;
  activeDropTarget?: DropTarget | null;
  highlightedGroupId?: string | null;
  dragMarker?: DragMarker | null;
  sourceRect?: DragSourceRect | null;
  selectionScope: ManagerSelectionScope;
  onOpenSessionTargetPicker: (input: OpenSessionTargetPickerInput) => void;
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
  return (
    <div
      ref={setNodeRef}
      className={`session-board__group-insert-target${isEndTarget ? ' session-board__group-end-target' : ''}`}
      data-drop-target="group-insert"
      data-over={isMarker || undefined}
      aria-hidden="true"
    >
      {isMarker && <span className="session-board__drop-marker" aria-hidden="true" />}
    </div>
  );
});

interface EmptySessionSlotTargetProps {
  category: CategoryFilter;
  workspaceId: string;
  active: boolean;
  children: ReactNode;
}

const EmptySessionSlotTarget = memo(function EmptySessionSlotTarget({
  category,
  workspaceId,
  active,
  children,
}: EmptySessionSlotTargetProps) {
  const { setNodeRef } = useDroppable({
    id: `new-session-insert-empty-${workspaceId}-${category}`,
    data: {
      type: 'new-session-insert',
      dnd: {
        targets: [{
          kind: 'new-session-insert',
          category,
          index: 0,
          workspaceId,
        }],
      } satisfies DndData,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className="session-board__empty-slot-target"
      data-active={active || undefined}
      data-drop-target="new-session-insert"
      data-empty-category={category}
    >
      <span className="session-board__empty-slot-plus" aria-hidden="true" />
      {children}
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
  bookmarkGroups = [],
  workspaceName,
  runtime,
  registerBoardElement,
  activeDragPayload = null,
  activeDropTarget = null,
  highlightedGroupId,
  dragMarker = null,
  sourceRect = null,
  selectionScope,
  onOpenSessionTargetPicker,
}: WorkspaceContentProps) {
  const {
    workspaceId,
    categoryGroups: savedCategoryGroups,
    visibleGroups: savedVisibleGroups,
    searchQuery,
  } = useBoardProjection(category);
  const isBookmarkCategory = category === 'bookmarks';
  const categoryGroups = isBookmarkCategory ? [...bookmarkGroups] : savedCategoryGroups;
  const visibleGroups = isBookmarkCategory
    ? filterGroupsByQuery(categoryGroups, searchQuery)
    : savedVisibleGroups;
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
  const canonicalGroups = useTabBoardStore.getState().groups;
  const suppressNewSessionTargets = isBookmarkCategory || activeDragPayload?.kind === 'tabs'
    && isAllSourceTabs(activeDragPayload, canonicalGroups);
  const newSessionAnchorsEnabled = !suppressNewSessionTargets
    && !isBookmarkCategory
    && (activeDragPayload?.kind === 'tab'
    || activeDragPayload?.kind === 'tabs'
    || activeDragPayload?.kind === 'open-tabs');
  const canonicalEmptyTargetEnabled = categoryGroups.length === 0
    && !hasSearch
    && newSessionAnchorsEnabled;
  const isNewSessionAnchorActive = useCallback((index: number) => (
    activeDropTarget?.kind === 'new-session-insert'
    && activeDropTarget.category === category
    && activeDropTarget.index === index
    && activeDropTarget.workspaceId === workspaceId
  ), [activeDropTarget, category, workspaceId]);
  const forcedIds = useMemo(
    () => [
      ...(highlightedGroupId ? [highlightedGroupId] : []),
      ...(selectionScope.scope?.kind === 'saved-tabs'
        ? [selectionScope.scope.groupId]
        : []),
    ],
    [highlightedGroupId, selectionScope.scope],
  );
  const sessionActivation = useSessionActivation({
    contextKey: activationContextKey,
    forcedIds,
    groupIds,
  });
  const setBoardRef = useCallback((element: HTMLElement | null) => {
    boardOverflow.ref(element);
    sessionActivation.rootRef(element);
    registerBoardElement?.(element);
  }, [
    boardOverflow.ref,
    registerBoardElement,
    sessionActivation.rootRef,
  ]);

  const getTitle = () => {
    if (category === 'saved') return 'Saved';
    if (category === 'bookmarks') return 'Bookmark';
    if (category === 'archive') return 'Archive';
    if (category === 'inbox') return 'Inbox';
    return currentFolder?.name || 'Category';
  };

  const getEmptyState = (
    replacePrimaryCopy = false,
    reservePlusSpace = false,
  ) => {
    const primaryCopyMargin = reservePlusSpace ? 24 : 'md';
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
          <Text mt={primaryCopyMargin} fw={500}>
            {replacePrimaryCopy ? 'Release to create session' : 'No saved sessions yet'}
          </Text>
          <Text size="sm" c="dimmed">Star important sessions to find them quickly</Text>
        </Box>
      );
    }

    if (category === 'archive') {
      return (
        <Box {...emptyStateProps}>
          <IconArchive size={48} aria-hidden="true" style={{ opacity: 0.3 }} />
          <Text mt={primaryCopyMargin} fw={500}>
            {replacePrimaryCopy ? 'Release to create session' : 'No archived sessions yet'}
          </Text>
          <Text size="sm" c="dimmed">Archive old sessions to keep your inbox clean</Text>
        </Box>
      );
    }

    if (category === 'bookmarks') {
      return (
        <Box {...emptyStateProps}>
          <IconFolder size={48} aria-hidden="true" style={{ opacity: 0.3 }} />
          <Text mt={primaryCopyMargin} fw={500}>No bookmark folders yet</Text>
          <Text size="sm" c="dimmed">Chrome bookmark folders will appear here</Text>
        </Box>
      );
    }

    if (category.startsWith('folder:')) {
      return (
        <Box {...emptyStateProps}>
          <IconFolder size={48} aria-hidden="true" style={{ opacity: 0.3 }} />
          <Text mt={primaryCopyMargin} fw={500}>
            {replacePrimaryCopy ? 'Release to create session' : 'This category is empty'}
          </Text>
          <Text size="sm" c="dimmed">Move sessions here to organize your work</Text>
        </Box>
      );
    }

    return (
      <Box {...emptyStateProps}>
        <IconArchive size={48} aria-hidden="true" style={{ opacity: 0.3 }} />
        <Text mt={primaryCopyMargin} fw={500}>
          {replacePrimaryCopy ? 'Release to create session' : 'No sessions here yet'}
        </Text>
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
        canonicalEmptyTargetEnabled ? (
          <div className="session-board" tabIndex={-1}>
            <EmptySessionSlotTarget
              category={category}
              workspaceId={workspaceId}
              active={isNewSessionAnchorActive(0)}
            >
              {getEmptyState(isNewSessionAnchorActive(0), true)}
            </EmptySessionSlotTarget>
          </div>
        ) : (
          <div className="manager-board__empty-content">
            {getEmptyState()}
            <div className="session-board" tabIndex={-1}>
              {!isBookmarkCategory && (
                <GroupInsertionTarget
                  id={`group-insert-end-${workspaceId}-${category}`}
                  category={category}
                  index={categoryGroups.length}
                  workspaceId={workspaceId}
                  isMarker={
                    activeDragPayload?.kind === 'group'
                    && dragMarker?.kind === 'group'
                    && dragMarker.index === categoryGroups.length
                  }
                  isEndTarget
                />
              )}
            </div>
          </div>
        )
      ) : (
        <SortableContext items={visibleGroups.map((group) => `group-${group.id}`)} strategy={rectSortingStrategy}>
          <div className="session-board" tabIndex={-1}>
            {visibleGroups.map((group) => {
              const groupIndex = canonicalIndexByGroupId.get(group.id) ?? 0;
              return (
                <div key={group.id} className="session-board__group-slot">
                  {newSessionAnchorsEnabled && (
                    <NewSessionGapTarget
                      category={category}
                      index={groupIndex}
                      workspaceId={workspaceId}
                      enabled
                      active={isNewSessionAnchorActive(groupIndex)}
                    />
                  )}
                  {!isBookmarkCategory && (
                    <GroupInsertionTarget
                      id={`group-insert-${group.id}`}
                      category={category}
                      index={groupIndex}
                      workspaceId={workspaceId}
                      isMarker={
                        activeDragPayload?.kind === 'group'
                        && dragMarker?.kind === 'group'
                        && dragMarker.index === groupIndex
                      }
                    />
                  )}
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
                    selectionScope={selectionScope}
                    readOnly={isBookmarkCategory}
                    onOpenSessionTargetPicker={onOpenSessionTargetPicker}
                  />
                </div>
              );
            })}
            {newSessionAnchorsEnabled && (
              <div className="session-board__new-session-end-anchor">
                <NewSessionGapTarget
                  category={category}
                  index={categoryGroups.length}
                  workspaceId={workspaceId}
                  enabled
                  active={isNewSessionAnchorActive(categoryGroups.length)}
                />
              </div>
            )}
            {!isBookmarkCategory && (
              <GroupInsertionTarget
                id={`group-insert-end-${workspaceId}-${category}`}
                category={category}
                index={categoryGroups.length}
                workspaceId={workspaceId}
                isMarker={
                  activeDragPayload?.kind === 'group'
                  && dragMarker?.kind === 'group'
                  && dragMarker.index === categoryGroups.length
                }
                isEndTarget
              />
            )}
          </div>
        </SortableContext>
      )}
    </section>
  );
}
