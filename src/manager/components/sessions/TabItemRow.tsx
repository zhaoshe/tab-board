import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  Group as MantineGroup,
  Text,
  Textarea,
} from '@mantine/core';
import {
  Check as IconCheck,
  Copy,
  FilePenLine,
  FileText as IconFileText,
  Link as IconLink,
  Trash,
  Trash as IconTrash,
  X,
  X as IconX,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TabItem } from '../../../shared/model';
import { ITEM_LINK } from '../../../shared/model';
import type { ManagerRuntime } from '../../hooks/useManagerRuntime';
import {
  getDragPlaceholderStyle,
  type DragMarker,
  type DragSourceRect,
  type SavedTabRef,
} from '../../core/dnd';
import { useToast } from '../../hooks/useToast';
import {
  getTabHoverDomain,
  isContextMenuKey,
  ManagerMenuItem,
  useManagerInfoTrigger,
  useManagerOverlayCommands,
} from '../../hooks/useManagerOverlays';
import { useDestructiveConfirmation } from '../../../shared/components/DestructiveConfirmation';
import { AccessibleIconAction } from '../../../shared/components/AccessibleIconAction';
import { Favicon } from '../../../shared/components/Favicon';
import { TabBoardIcon } from '../../../shared/components/TabBoardIcon';

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

const SAVED_TAB_MENU_INVOKER_SELECTOR = [
  'button:not(:disabled)',
  'input:not(:disabled)',
  'textarea:not(:disabled)',
  'select:not(:disabled)',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function getSavedTabMenuTrigger(
  target: EventTarget | null,
  row: HTMLElement,
  fallback: HTMLElement,
): HTMLElement {
  const element = target instanceof Element
    ? target.closest<HTMLElement>(SAVED_TAB_MENU_INVOKER_SELECTOR)
    : null;
  return element && row.contains(element) ? element : fallback;
}

interface TabItemRowProps {
  tab: TabItem;
  groupId: string;
  workspaceId: string;
  tabIndex: number;
  selectedRefs: SavedTabRef[];
  runtime: ManagerRuntime;
  locked?: boolean;
  readOnly?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  dropMarker?: DragMarker | null;
  onStartSelection?: () => void;
  onToggleSelection?: () => void;
  sourceRect?: DragSourceRect | null;
  isDragOverlay?: boolean;
  commands?: SessionTabCommands;
}

export interface SessionTabCommands {
  confirmBeforeDestructive: boolean;
  deleteTab: (groupId: string, tabId: string) => void;
  updateTab: (
    groupId: string,
    tabId: string,
    updates: Partial<TabItem>,
  ) => void;
}

export function TabItemRow({
  tab,
  groupId,
  workspaceId,
  tabIndex,
  selectedRefs,
  runtime,
  locked = false,
  readOnly = false,
  selectionMode = false,
  selected = false,
  dropMarker = null,
  onStartSelection,
  onToggleSelection,
  sourceRect = null,
  isDragOverlay = false,
  commands,
}: TabItemRowProps) {
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(tab.note);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const titleTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { closeOverlays, openMenu } = useManagerOverlayCommands();
  const infoKey = `saved:${groupId}:${tab.id}`;
  const { showError, showSuccess } = useToast();
  const confirmDestructive = useDestructiveConfirmation();
  const displayText = tab.note || tab.title;

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
    disabled: isDragOverlay || readOnly,
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

  const handleDelete = async () => {
    if (locked) return;
    if (commands?.confirmBeforeDestructive) {
      const confirmed = await confirmDestructive({
        title: tab.itemType === ITEM_LINK ? 'Delete Saved Tab' : 'Delete Saved Note',
        message: `Move “${tab.title}” to Trash?`,
        confirmLabel: tab.itemType === ITEM_LINK ? 'Delete Saved Tab' : 'Delete Saved Note',
      });
      if (!confirmed) return;
    }
    closeOverlays();
    commands?.deleteTab(groupId, tab.id);
  };

  const handleEditNote = () => {
    setNoteValue(tab.note);
    setIsEditingNote(true);
    closeOverlays();
  };

  const handleNoteSubmit = () => {
    commands?.updateTab(groupId, tab.id, { note: noteValue.trim() });
    setIsEditingNote(false);
  };

  const handleNoteCancel = () => {
    setNoteValue(tab.note);
    setIsEditingNote(false);
  };

  const handleNoteDelete = async () => {
    if (commands?.confirmBeforeDestructive) {
      const confirmed = await confirmDestructive({
        title: 'Delete Note',
        message: `Delete the note attached to “${tab.title}”?`,
        confirmLabel: 'Delete Note',
      });
      if (!confirmed) return;
    }
    commands?.updateTab(groupId, tab.id, { note: '' });
    setIsEditingNote(false);
  };

  const handleNoteKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleNoteCancel();
    }
  };

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable. Copy the text manually.');
      await navigator.clipboard.writeText(tab.itemType === ITEM_LINK ? tab.url : displayText);
      showSuccess('Copied');
    } catch (error: unknown) {
      showError(error instanceof Error ? error.message : String(error));
    }
  };

  const registerInfoTrigger = useManagerInfoTrigger(infoKey, {
    kind: 'saved',
    model: {
      title: tab.itemType === ITEM_LINK ? tab.title : displayText,
      domain: getTabHoverDomain(tab.url),
      link: tab.itemType === ITEM_LINK ? tab.url : '',
      savedAt: tab.createdAt,
    },
  });
  const setTitleTrigger = useCallback((element: HTMLButtonElement | null) => {
    titleTriggerRef.current = element;
    registerInfoTrigger(element);
  }, [registerInfoTrigger]);
  const menuItems = (
    <>
      {!readOnly && (
        <ManagerMenuItem
          description={tab.itemType === ITEM_LINK && !tab.note
            ? 'Attach context to this saved tab'
            : 'Edit saved tab context'}
          icon={FilePenLine}
          label={tab.itemType === ITEM_LINK && !tab.note ? 'Add Note' : 'Edit Note'}
          onClick={handleEditNote}
        />
      )}
      {tab.itemType === ITEM_LINK ? (
        <ManagerMenuItem
          description="Copy the saved address"
          icon={Copy}
          label="Copy URL"
          onClick={handleCopy}
        />
      ) : (
        <ManagerMenuItem
          description="Copy the saved text"
          icon={Copy}
          label="Copy Text"
          onClick={handleCopy}
        />
      )}
      {!readOnly && (
        <ManagerMenuItem
          description="Move this item to Bin"
          icon={Trash}
          label={tab.itemType === ITEM_LINK
            ? 'Delete Saved Tab'
            : 'Delete Saved Note'}
          danger
          disabled={locked}
          lifecycleAllowance="saved-tab-removal"
          onClick={handleDelete}
        />
      )}
    </>
  );
  const openSavedTabMenu = (
    anchor: { x: number; y: number },
    openedByKeyboard: boolean,
    trigger: HTMLElement,
  ) => {
    closeOverlays();
    openMenu({
      id: `saved-tab-menu:${groupId}:${tab.id}`,
      kind: 'saved-tab',
      anchor,
      content: menuItems,
      trigger,
      openedByKeyboard,
      restoreFocusOnClose: true,
      ariaLabel: 'Saved Tab Actions',
    });
  };

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
          name="saved-tab-note"
          aria-label={`Note for ${tab.title}`}
          autoComplete="off"
          value={noteValue}
          onChange={(event) => setNoteValue(event.target.value)}
          onKeyDown={handleNoteKeyDown}
          size="xs"
          minRows={2}
          maxRows={6}
          placeholder="Add a note…"
          autosize
        />
        <MantineGroup gap={6} mt={6} justify="flex-end">
          <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={14} aria-hidden="true" />} onClick={handleNoteDelete}>
            Delete
          </Button>
          <Button size="xs" variant="subtle" leftSection={<IconX size={14} aria-hidden="true" />} onClick={handleNoteCancel}>
            Cancel
          </Button>
          <Button size="xs" leftSection={<IconCheck size={14} aria-hidden="true" />} onClick={handleNoteSubmit}>
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
        onContextMenu={isDragOverlay ? undefined : (event) => {
          const fallback = titleTriggerRef.current;
          if (!fallback) return;
          event.preventDefault();
          event.stopPropagation();
          openSavedTabMenu(
            { x: event.clientX, y: event.clientY },
            false,
            getSavedTabMenuTrigger(event.target, event.currentTarget, fallback),
          );
        }}
        onPointerDown={(event) => {
          if (
            isDragOverlay
            || readOnly
            || event.pointerType === 'touch'
            || (
              event.target instanceof Element
              && event.target.closest('button, input, textarea, a, [data-no-drag]')
            )
          ) {
            return;
          }
          listeners?.onPointerDown?.(event);
        }}
        onTouchStart={(event) => {
          if (
            isDragOverlay
            || readOnly
            || (
              event.target instanceof Element
              && event.target.closest('button, input, textarea, a, [data-no-drag]')
            )
          ) {
            return;
          }
          listeners?.onTouchStart?.(event);
        }}
        onKeyDown={(event) => {
          if (!isDragOverlay && isContextMenuKey(event)) {
            const fallback = titleTriggerRef.current;
            if (!fallback) return;
            event.preventDefault();
            event.stopPropagation();
            const trigger = getSavedTabMenuTrigger(
              event.target,
              event.currentTarget,
              fallback,
            );
            const triggerRect = trigger.getBoundingClientRect();
            openSavedTabMenu(
              { x: triggerRect.left, y: triggerRect.bottom },
              true,
              trigger,
            );
            return;
          }
          if (
            readOnly
            || (event.target instanceof Element && event.target.closest('button, input, textarea, a, [data-no-drag]'))
          ) {
            return;
          }
          listeners?.onKeyDown?.(event);
        }}
      >
        <span className="manager-tab-owner-slot tab-item-row__owner-slot">
          <span className="tab-item-row__icon" aria-hidden="true">
          {tab.itemType === ITEM_LINK
            ? (
              <Favicon
                src={tab.favIconUrl}
                size={16}
                fallback={<IconLink aria-hidden="true" />}
              />
            )
            : <IconFileText size={16} aria-hidden="true" />}
          </span>
          {!isDragOverlay && !readOnly && (
            <Checkbox
              size="sm"
              name="saved-tab-selection"
              checked={selected}
              aria-label={`Select ${tab.title}`}
              className="tab-item-row__select"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onChange={() => (selectionMode ? onToggleSelection : onStartSelection)?.()}
            />
          )}
        </span>
        <div className="tab-item-row__details">
          {tab.itemType === ITEM_LINK ? (
            <button
              ref={isDragOverlay ? undefined : setTitleTrigger}
              type="button"
              className="tab-item-row__title"
              data-no-drag
              data-info-popover={isDragOverlay ? undefined : 'saved'}
              data-info-key={isDragOverlay ? undefined : infoKey}
              onClick={isDragOverlay ? undefined : handleClick}
              disabled={isDragOverlay}
              tabIndex={isDragOverlay ? -1 : undefined}
            >
              {tab.title}
            </button>
          ) : (
            <button
              ref={isDragOverlay ? undefined : setTitleTrigger}
              type="button"
              className="tab-item-row__title"
              data-info-popover={isDragOverlay ? undefined : 'saved'}
              data-info-key={isDragOverlay ? undefined : infoKey}
              disabled={isDragOverlay}
              tabIndex={isDragOverlay ? -1 : 0}
            >
              {displayText}
            </button>
          )}
          {tab.itemType === ITEM_LINK && tab.url && (
            <Text className="tab-item-row__url" component="span" size="xs" c="dimmed">
              {tab.url}
            </Text>
          )}
          {tab.itemType !== ITEM_LINK && (
            <Text className="tab-item-row__type" component="span" c="dimmed">
              note
            </Text>
          )}
          {tab.itemType === ITEM_LINK && tab.note && (
            <Text className="tab-item-row__note" component="span" size="xs" c="dimmed" lineClamp={2}>
              {tab.note}
            </Text>
          )}
        </div>
        {!isDragOverlay && !readOnly ? (
          <AccessibleIconAction
            label="Delete"
            danger
            className="tab-item-row__delete"
            disabled={locked}
            onClick={handleDelete}
          >
            <TabBoardIcon icon={X} />
          </AccessibleIconAction>
        ) : null}
      </MantineGroup>
        {showsAfterMarker && <span className="tab-item-row__drop-marker tab-item-row__drop-marker--after" aria-hidden="true" />}
      </>
    );
  }
}
