import type { TabItem } from '../../../shared/model';
import { Text } from '@mantine/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type {
  DragMarker,
  DragSourceRect,
  SavedTabRef,
} from '../../core/dnd';
import type { ManagerRuntime } from '../../hooks/useManagerRuntime';
import type { OverflowCueState } from '../../hooks/useOverflowCues';
import { TabItemRow } from './TabItemRow';

export function SessionTabList({
  canonicalIndexByTabId,
  dragMarker,
  groupId,
  isDragOverlay,
  locked,
  overflowCues,
  overflowRef,
  runtime,
  searchActive,
  selectedRefs,
  selectedTabIds,
  sourceRect,
  tabs,
  workspaceId,
  onStartSelection,
  onToggleSelection,
}: {
  canonicalIndexByTabId: ReadonlyMap<string, number>;
  dragMarker: DragMarker | null;
  groupId: string;
  isDragOverlay: boolean;
  locked: boolean;
  overflowCues: OverflowCueState;
  overflowRef: (element: HTMLDivElement | null) => void;
  runtime: ManagerRuntime;
  searchActive: boolean;
  selectedRefs: SavedTabRef[];
  selectedTabIds: ReadonlySet<string>;
  sourceRect: DragSourceRect | null;
  tabs: TabItem[];
  workspaceId: string;
  onStartSelection: (tabId: string) => void;
  onToggleSelection: (tabId: string) => void;
}) {
  return (
    <div
      ref={overflowRef}
      className="session-card__tabs"
      role="list"
      data-block-end={overflowCues.blockEnd || undefined}
      data-block-start={overflowCues.blockStart || undefined}
    >
      <SortableContext
        items={tabs.map((tab) => `tab-${groupId}-${tab.id}`)}
        strategy={verticalListSortingStrategy}
      >
        {tabs.map((tab) => (
          <TabItemRow
            key={tab.id}
            tab={tab}
            groupId={groupId}
            workspaceId={workspaceId}
            tabIndex={canonicalIndexByTabId.get(tab.id) ?? 0}
            dropMarker={dragMarker}
            selectedRefs={selectedRefs}
            runtime={runtime}
            locked={locked}
            selectionMode={selectedTabIds.size > 0}
            selected={selectedTabIds.has(tab.id)}
            onStartSelection={() => onStartSelection(tab.id)}
            onToggleSelection={() => onToggleSelection(tab.id)}
            sourceRect={sourceRect}
            isDragOverlay={isDragOverlay}
          />
        ))}
        {dragMarker?.kind === 'tab'
          && dragMarker.groupId === groupId
          && dragMarker.placement === 'body' && (
          <span className="session-card__drop-marker" aria-hidden="true" />
        )}
      </SortableContext>
      {searchActive && tabs.length === 0 && (
        <Text size="xs" c="dimmed">No matching tabs</Text>
      )}
    </div>
  );
}
