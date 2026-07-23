import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  Checkbox,
  Group as MantineGroup,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  IconCheck,
  IconCopy,
  IconFileText,
  IconLink,
  IconNotes,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TabItem } from '../../../shared/model';
import { ITEM_LINK } from '../../../shared/model';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import type { ManagerRuntime } from '../../hooks/useManagerRuntime';
import {
  getDragPlaceholderStyle,
  type DragMarker,
  type DragSourceRect,
  type SavedTabRef,
} from '../../core/dnd';
import { useToast } from '../../hooks/useToast';
import {
  useManagerInfoTrigger,
  useManagerOverlayCommands,
  useManagerPreviewOpen,
} from '../../hooks/useManagerOverlays';

export function getTabDropMarkerPlacement(
  marker: DragMarker | null | undefined,
  groupId: string,
  tabId: string,
): 'before' | 'after' | null {
  return marker?.kind === 'tab'
    && marker.groupId === groupId
    && marker.tabId === tabId
    && marker.placement !== 'body'
    ? marker.placement
    : null;
}

interface TabItemRowProps {
  tab: TabItem;
  groupId: string;
  workspaceId: string;
  tabIndex: number;
  selectedRefs: SavedTabRef[];
  runtime: ManagerRuntime;
  locked?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  dropMarker?: DragMarker | null;
  onStartSelection?: () => void;
  onToggleSelection?: () => void;
  sourceRect?: DragSourceRect | null;
  isDragOverlay?: boolean;
}

export function TabItemRow({
  tab,
  groupId,
  workspaceId,
  tabIndex,
  selectedRefs,
  runtime,
  locked = false,
  selectionMode = false,
  selected = false,
  dropMarker = null,
  onStartSelection,
  onToggleSelection,
  sourceRect = null,
  isDragOverlay = false,
}: TabItemRowProps) {
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(tab.note);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { closeOverlays } = useManagerOverlayCommands();
  const infoKey = `saved:${groupId}:${tab.id}`;
  const isPreviewOpen = useManagerPreviewOpen(infoKey);
  const { showError, showSuccess } = useToast();
  const updateTab = useTabBoardStore((state) => state.updateTab);
  const deleteTab = useTabBoardStore((state) => state.deleteTab);
  const settings = useTabBoardStore((state) => state.settings);

  const {
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `tab-${groupId}-${tab.id}`,
    data: {
      type: 'tab',
      groupId,
      tabId: tab.id,
      dnd: {
        payload: selectedRefs.some((ref) => ref.groupId === groupId && ref.tabId === tab.id)
          ? { kind: 'tabs', refs: selectedRefs, workspaceId }
          : { kind: 'tab', groupId, tabId: tab.id, workspaceId },
        targets: [{
          kind: 'tab-before',
          groupId,
          tabId: tab.id,
          index: tabIndex,
          workspaceId,
        }],
      },
    },
    disabled: isDragOverlay,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    pointerEvents: isDragOverlay ? 'none' as const : undefined,
  };

  useEffect(() => {
    if (isEditingNote && noteTextareaRef.current) {
      noteTextareaRef.current.focus();
      noteTextareaRef.current.select();
    }
  }, [isEditingNote]);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (tab.itemType === ITEM_LINK && tab.url) {
      event.stopPropagation();
      if (event.detail !== 0) event.currentTarget.blur();
      closeOverlays();
      void runtime.openSavedTab(tab.url);
    }
  };

  const handleDelete = () => {
    if (locked) return;
    if (settings.confirmBeforeDestructive && !confirm('Delete this saved tab?')) return;
    closeOverlays();
    deleteTab(groupId, tab.id);
  };

  const handleEditNote = () => {
    setNoteValue(tab.note);
    setIsEditingNote(true);
    closeOverlays();
  };

  const handleNoteSubmit = () => {
    updateTab(groupId, tab.id, { note: noteValue.trim() });
    setIsEditingNote(false);
  };

  const handleNoteCancel = () => {
    setNoteValue(tab.note);
    setIsEditingNote(false);
  };

  const handleNoteDelete = () => {
    updateTab(groupId, tab.id, { note: '' });
    setIsEditingNote(false);
  };

  const handleNoteKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleNoteCancel();
    }
  };

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable.');
      await navigator.clipboard.writeText(tab.itemType === ITEM_LINK ? tab.url : tab.note || tab.title);
      showSuccess('Copied');
    } catch (error: unknown) {
      showError(error instanceof Error ? error.message : String(error));
    }
  };

  const infoActions = (
    <>
      <Tooltip label={tab.itemType === ITEM_LINK ? 'Add note' : 'Edit note'}>
        <ActionIcon className="manager-info-card-action" variant="subtle" aria-label={tab.itemType === ITEM_LINK ? 'Add note' : 'Edit note'} onClick={handleEditNote}>
          <IconNotes size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={tab.itemType === ITEM_LINK ? 'Copy URL' : 'Copy text'}>
        <ActionIcon className="manager-info-card-action" variant="subtle" aria-label={tab.itemType === ITEM_LINK ? 'Copy URL' : 'Copy text'} onClick={() => void handleCopy()}>
          <IconCopy size={16} />
        </ActionIcon>
      </Tooltip>
    </>
  );

  const infoTriggerRef = useManagerInfoTrigger(infoKey, {
    kind: 'saved',
    model: {
      title: tab.title,
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      note: tab.note || (tab.itemType === ITEM_LINK ? '' : tab.title),
      savedAt: tab.createdAt,
      actions: infoActions,
    },
  });

  if (isEditingNote) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="tab-item-row tab-item-row--editing"
        role="listitem"
        data-group-id={groupId}
        data-tab-id={tab.id}
      >
        <Textarea
          ref={noteTextareaRef}
          value={noteValue}
          onChange={(event) => setNoteValue(event.target.value)}
          onKeyDown={handleNoteKeyDown}
          size="xs"
          minRows={2}
          maxRows={6}
          placeholder="Add a note..."
          autosize
        />
        <MantineGroup gap={6} mt={6} justify="flex-end">
          <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={14} />} onClick={handleNoteDelete}>
            Delete
          </Button>
          <Button size="xs" variant="subtle" leftSection={<IconX size={14} />} onClick={handleNoteCancel}>
            Cancel
          </Button>
          <Button size="xs" leftSection={<IconCheck size={14} />} onClick={handleNoteSubmit}>
            Save
          </Button>
        </MantineGroup>
      </div>
    );
  }

  if (isDragging && !isDragOverlay) {
    return (
      <div
        ref={setNodeRef}
        style={{ ...style, ...getDragPlaceholderStyle(sourceRect) }}
        className="tab-item-row-placeholder"
        aria-hidden="true"
      />
    );
  }

  if (isDragOverlay) {
    return (
      <div className="tab-item-row" style={style} role="listitem" aria-hidden="true">
        {renderRowContent()}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="tab-item-row"
      role="listitem"
      data-group-id={groupId}
      data-tab-id={tab.id}
    >
      {renderRowContent()}
    </div>
  );

  function renderRowContent() {
    const tabMarkerPlacement = getTabDropMarkerPlacement(dropMarker, groupId, tab.id);
    const showsBeforeMarker = tabMarkerPlacement === 'before';
    const showsAfterMarker = tabMarkerPlacement === 'after';
    return (
      <>
        {showsBeforeMarker && <span className="tab-item-row__drop-marker" aria-hidden="true" />}
      <MantineGroup
        ref={isDragOverlay ? undefined : setActivatorNodeRef}
        gap="xs"
        wrap="nowrap"
        className="tab-item-row__content"
        data-selection-mode={selectionMode || undefined}
        data-selected={selected || undefined}
        {...(!isDragOverlay ? listeners : {})}
        onPointerDown={(event) => {
          if (event.target instanceof Element && event.target.closest('button, input, textarea, a, [data-no-drag]')) {
            return;
          }
          listeners?.onPointerDown?.(event);
        }}
        onKeyDown={(event) => {
          if (event.target instanceof Element && event.target.closest('button, input, textarea, a, [data-no-drag]')) {
            return;
          }
          listeners?.onKeyDown?.(event);
        }}
      >
        <span className="tab-item-row__icon" aria-hidden="true">
          {tab.itemType === ITEM_LINK ? <IconLink size={14} /> : <IconFileText size={14} />}
        </span>
        {!isDragOverlay && (
          <Checkbox
            size="sm"
            checked={selected}
            aria-label={`Select ${tab.title}`}
            className="tab-item-row__select"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onChange={() => (selectionMode ? onToggleSelection : onStartSelection)?.()}
          />
        )}
        <div className="tab-item-row__details">
          {tab.itemType === ITEM_LINK ? (
            <button
              ref={isDragOverlay ? undefined : infoTriggerRef}
              type="button"
              className="tab-item-row__title"
              data-no-drag
              data-info-popover={isDragOverlay ? undefined : 'saved'}
              data-info-key={isDragOverlay ? undefined : infoKey}
              aria-haspopup={isDragOverlay ? undefined : 'dialog'}
              aria-expanded={isDragOverlay ? undefined : isPreviewOpen}
              onClick={isDragOverlay ? undefined : handleClick}
              disabled={isDragOverlay}
              tabIndex={isDragOverlay ? -1 : undefined}
            >
              {tab.title}
            </button>
          ) : (
            <Text
              ref={isDragOverlay ? undefined : infoTriggerRef}
              component="span"
              size="xs"
              className="tab-item-row__title"
              data-info-popover={isDragOverlay ? undefined : 'saved'}
              data-info-key={isDragOverlay ? undefined : infoKey}
              aria-haspopup={isDragOverlay ? undefined : 'dialog'}
              aria-expanded={isDragOverlay ? undefined : isPreviewOpen}
              tabIndex={isDragOverlay ? -1 : 0}
            >
              {tab.note || tab.title}
            </Text>
          )}
          {tab.itemType === ITEM_LINK && tab.url && (
            <Text className="tab-item-row__url" component="span" size="xs" c="dimmed">
              {tab.url}
            </Text>
          )}
          {tab.itemType === ITEM_LINK && tab.note && (
            <Text className="tab-item-row__note" component="span" size="xs" c="dimmed" lineClamp={2}>
              {tab.note}
            </Text>
          )}
        </div>
        {!isDragOverlay && !selectionMode ? (
          <Tooltip label="Delete">
            <ActionIcon
              size="xs"
              variant="subtle"
              color="red"
              className="tab-item-row__more"
              aria-label="Delete"
              disabled={locked}
              onClick={handleDelete}
            >
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        ) : null}
      </MantineGroup>
        {showsAfterMarker && <span className="tab-item-row__drop-marker tab-item-row__drop-marker--after" aria-hidden="true" />}
      </>
    );
  }
}
