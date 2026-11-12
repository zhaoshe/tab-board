import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDndContext } from '@dnd-kit/core';
import { ITEM_LINK } from '../../../shared/model';
import { useSessionActivation } from '../../hooks/useSessionActivation';
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
import type { SessionTabCommands } from './TabItemRow';

export function SessionTabList({
  onInteractionChange,
  searchQuery = '',
  ownedOverlayTabId = null,
  canonicalIndexByTabId,
  commands,
  dragMarker,
  groupId,
  isDragOverlay,
  locked,
  overflowCues,
  overflowRef,
  runtime,
  searchActive,
  readOnly = false,
  selectionMode,
  selectedRefs,
  selectedTabIds,
  sourceRect,
  tabs,
  workspaceId,
  onStartSelection,
  onToggleSelection,
}: {
  onInteractionChange?: (retained: boolean) => void;
  searchQuery?: string;
  ownedOverlayTabId?: string | null;
  canonicalIndexByTabId: ReadonlyMap<string, number>;
  commands: SessionTabCommands;
  dragMarker: DragMarker | null;
  groupId: string;
  isDragOverlay: boolean;
  locked: boolean;
  overflowCues: OverflowCueState;
  overflowRef: (element: HTMLDivElement | null) => void;
  runtime: ManagerRuntime;
  searchActive: boolean;
  readOnly?: boolean;
  selectionMode: boolean;
  selectedRefs: SavedTabRef[];
  selectedTabIds: ReadonlySet<string>;
  sourceRect: DragSourceRect | null;
  tabs: TabItem[];
  workspaceId: string;
  onStartSelection: (tabId: string) => void;
  onToggleSelection: (tabId: string) => void;
}) {
  const [editingTabIds, setEditingTabIds] = useState<ReadonlySet<string>>(new Set());
  const retainRowInteraction = useCallback((tabId: string, retained: boolean) => {
    setEditingTabIds((current) => {
      if (current.has(tabId) === retained) return current;
      const next = new Set(current);
      if (retained) next.add(tabId);
      else next.delete(tabId);
      return next;
    });
  }, []);
  useLayoutEffect(() => {
    onInteractionChange?.(editingTabIds.size > 0);
  }, [editingTabIds, onInteractionChange]);
  const [focusedTabId, setFocusedTabId] = useState<string | null>(null);
  const focusTransfer = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const { active } = useDndContext();
  const payload = active?.data.current?.dnd?.payload;
  const rowIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);
  const forcedIds = useMemo(() => [
    ...editingTabIds,
    ...tabs.filter((tab) => tab.itemType !== ITEM_LINK || selectedTabIds.has(tab.id)).map((tab) => tab.id),
    ...(focusedTabId ? [focusedTabId] : []),
    ...(ownedOverlayTabId ? [ownedOverlayTabId] : []),
    ...(payload?.kind === 'tab' && payload.groupId === groupId ? [payload.tabId] : []),
    ...(payload?.kind === 'tabs' ? payload.refs.filter((ref: SavedTabRef) => ref.groupId === groupId).map((ref: SavedTabRef) => ref.tabId) : []),
    ...(dragMarker?.kind === 'tab' && dragMarker.groupId === groupId && dragMarker.tabId ? [dragMarker.tabId] : []),
  ], [editingTabIds, tabs, selectedTabIds, focusedTabId, ownedOverlayTabId, payload, groupId, dragMarker]);
  const activation = useSessionActivation({
    contextKey: `${groupId}:${searchActive}:${searchQuery}`, groupIds: rowIds, forcedIds,
    initialCount: 24, overscanPx: 440, axis: 'vertical',
  });
  const setListRef = useCallback((element: HTMLDivElement | null) => {
    listRef.current = element;
    overflowRef(element);
    activation.rootRef(element);
  }, [overflowRef, activation.rootRef]);
  useLayoutEffect(() => {
    const tabId = focusTransfer.current;
    if (!tabId) return;
    const slot = Array.from(listRef.current?.children ?? [])
      .find((element) => (element as HTMLElement).dataset.sessionRowId === tabId);
    const title = slot?.querySelector<HTMLButtonElement>('.tab-item-row__title');
    if (title) {
      focusTransfer.current = null;
      title.focus();
    }
  }, [activation.activeIds]);
  return (
    <div
      ref={setListRef}
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
          <div key={tab.id}
            ref={activation.registerSlot(tab.id)}
            data-session-row-id={tab.id}
            data-link-note={tab.itemType === ITEM_LINK && Boolean(tab.note) || undefined}
            style={{ flex: '0 0 auto', minHeight: tab.itemType === ITEM_LINK ? 'var(--session-link-row-height)' : undefined }}
            onFocusCapture={() => setFocusedTabId(tab.id)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setFocusedTabId((current) => current === tab.id ? null : current);
              }
            }}
          >
          {activation.activeIds.has(tab.id) ? <TabItemRow
            key={tab.id}
            onInteractionChange={retainRowInteraction}
            tab={tab}
            commands={commands}
            groupId={groupId}
            workspaceId={workspaceId}
            tabIndex={canonicalIndexByTabId.get(tab.id) ?? 0}
            dropMarker={dragMarker}
            selectedRefs={selectedRefs}
            runtime={runtime}
            locked={locked}
            readOnly={readOnly}
            selectionMode={selectionMode}
            selected={selectedTabIds.has(tab.id)}
            onStartSelection={() => onStartSelection(tab.id)}
            onToggleSelection={() => onToggleSelection(tab.id)}
            sourceRect={sourceRect}
            isDragOverlay={isDragOverlay}
          /> : <button type="button"
            className="session-card__row-shell"
            aria-label={`Show ${tab.title}`}
            onFocus={() => {
              focusTransfer.current = tab.id;
            }}
          />}
          </div>
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
