import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Box,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconDots,
  IconFileText,
  IconGripVertical,
  IconLink,
  IconLock,
  IconLockOpen,
  IconNotes,
  IconPlus,
  IconRestore,
  IconTrash,
} from '@tabler/icons-react';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useShallow } from 'zustand/react/shallow';
import type { Group, TabItem } from '../../../shared/model';
import type { CategoryFilter } from '../../core/selectors';
import {
  getDragPlaceholderStyle,
  type DragMarker,
  type DragSourceRect,
  type SavedTabRef,
} from '../../core/dnd';
import {
  ITEM_LINK,
  ITEM_NOTE,
  isRestorableTab,
  normalizeSearch,
  tabMatchesQuery,
  TASK_NONE,
} from '../../../shared/model';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import type { ManagerRuntime } from '../../hooks/useManagerRuntime';
import { useToast } from '../../hooks/useToast';
import { TabItemRow } from './TabItemRow';
import { SessionPlaceholder } from './SessionPlaceholder';
import {
  ManagerMenuItem,
  isContextMenuKey,
  useManagerMenuOpen,
  useManagerOverlayCommands,
  useManagerOverlayLifecycle,
} from '../../hooks/useManagerOverlays';

interface SessionCardProps {
  group: Group;
  runtime: ManagerRuntime;
  searchQuery?: string;
  groupIndex?: number;
  groupCategory?: CategoryFilter;
  isDragOverlay?: boolean;
  highlighted?: boolean;
  dragMarker?: DragMarker | null;
  sourceRect?: DragSourceRect | null;
}

export const SessionCard = memo(function SessionCard({
  group,
  runtime,
  searchQuery = '',
  groupIndex = 0,
  groupCategory = 'inbox',
  isDragOverlay = false,
  highlighted = false,
  dragMarker = null,
  sourceRect = null,
}: SessionCardProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(group.title);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(group.note);
  const { openMenu, closeOverlays } = useManagerOverlayCommands();
  const menuKey = `session:${group.id}`;
  const isSessionMenuOpen = useManagerMenuOpen(menuKey);
  useManagerOverlayLifecycle(`${group.id}:${group.updatedAt}:${group.tabs.map((tab) => tab.id).join(',')}`);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const moreActionRef = useRef<HTMLButtonElement>(null);
  const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(new Set());
  const { showError, showSuccess } = useToast();

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
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
        payload: { kind: 'group', groupId: group.id, workspaceId: group.workspaceId },
        targets: [{ kind: 'group-body', groupId: group.id, workspaceId: group.workspaceId }],
        groupIndex,
        groupCategory,
      },
    },
    disabled: isDragOverlay,
  });

  const updateGroup = useTabBoardStore((state) => state.updateGroup);
  const folders = useTabBoardStore(
    useShallow((state) => state.folders.filter((folder) => folder.workspaceId === group.workspaceId)),
  );
  const deleteGroup = useTabBoardStore((state) => state.deleteGroup);
  const lockGroup = useTabBoardStore((state) => state.lockGroup);
  const addTabToGroup = useTabBoardStore((state) => state.addTabToGroup);
  const addNoteToGroup = useTabBoardStore((state) => state.addNoteToGroup);

  const normalizedQuery = normalizeSearch(searchQuery);
  const titleMatches = normalizedQuery.length > 0 && group.title.toLowerCase().includes(normalizedQuery);
  const tabMetadata = useMemo(() => {
    const visibleTabs: TabItem[] = [];
    const selectedRefs: SavedTabRef[] = [];
    const canonicalIndexByTabId = new Map<string, number>();
    let restorableTabCount = 0;
    let linkCount = 0;
    let noteCount = 0;

    group.tabs.forEach((tab, index) => {
      canonicalIndexByTabId.set(tab.id, index);
      if (isRestorableTab(tab)) restorableTabCount += 1;
      if (tab.itemType === ITEM_LINK) linkCount += 1;
      if (tab.itemType === ITEM_NOTE) noteCount += 1;
      if (selectedTabIds.has(tab.id)) selectedRefs.push({ groupId: group.id, tabId: tab.id });
      if (!normalizedQuery || titleMatches || tabMatchesQuery(tab, normalizedQuery)) {
        visibleTabs.push(tab);
      }
    });

    return {
      canonicalIndexByTabId,
      linkCount,
      noteCount,
      restorableTabCount,
      selectedRefs,
      visibleTabs,
    };
  }, [group.id, group.tabs, normalizedQuery, selectedTabIds, titleMatches]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'default',
    pointerEvents: isDragOverlay ? 'none' as const : undefined,
  };

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (isEditingNote && noteTextareaRef.current) {
      noteTextareaRef.current.focus();
      noteTextareaRef.current.select();
    }
  }, [isEditingNote]);

  const copyText = async (text: string): Promise<void> => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable.');
      await navigator.clipboard.writeText(text);
      showSuccess('Copied');
    } catch (error: unknown) {
      showError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRestore = () => {
    closeOverlays();
    void runtime.restoreGroup(group.id);
  };

  const handleToggleLock = () => {
    closeOverlays();
    lockGroup(group.id);
  };

  const handleDelete = () => {
    if (group.locked || !confirm(`Delete "${group.title}"?`)) return;
    deleteGroup(group.id);
  };

  const handleTitleDoubleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setTitleValue(group.title);
    setIsEditingTitle(true);
  };

  const handleTitleSubmit = () => {
    const trimmed = titleValue.trim();
    if (trimmed && trimmed !== group.title) updateGroup(group.id, { title: trimmed });
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleTitleSubmit();
    } else if (event.key === 'Escape') {
      setTitleValue(group.title);
      setIsEditingTitle(false);
    }
  };

  const handleNoteSubmit = () => {
    updateGroup(group.id, { note: noteValue.trim() });
    setIsEditingNote(false);
  };

  const handleNoteKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setNoteValue(group.note);
      setIsEditingNote(false);
    }
  };

  const handleRename = () => {
    setTitleValue(group.title);
    setIsEditingTitle(true);
  };

  const handleEditNote = () => {
    setNoteValue(group.note);
    setIsEditingNote(true);
  };

  const handleAddLink = () => {
    const url = window.prompt('Link URL');
    if (!url?.trim()) return;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      showError('Enter a valid URL.');
      return;
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      showError('Only HTTP and HTTPS links can be added.');
      return;
    }
    const title = window.prompt('Link title', parsedUrl.href)?.trim() || parsedUrl.href;
    addTabToGroup(group.id, {
      itemType: ITEM_LINK,
      title,
      url: parsedUrl.href,
      favIconUrl: '',
      note: '',
      pinned: false,
      incognito: false,
      starred: false,
      taskStatus: TASK_NONE,
      browserGroup: null,
      sourceWindowId: null,
      sourceTabId: null,
    });
  };

  const handleAddNote = () => {
    const text = window.prompt('Note');
    if (text?.trim()) addNoteToGroup(group.id, text.trim());
  };

  const handleCopyGroup = () => {
    const text = group.tabs
      .map((tab) => tab.itemType === ITEM_LINK ? tab.url : tab.note || tab.title)
      .filter(Boolean)
      .join('\n');
    void copyText(text);
  };

  const categoryOptions = [
    { id: 'inbox', label: 'Inbox', folderId: null, starred: false, archived: false },
    { id: 'saved', label: 'Saved', folderId: null, starred: true, archived: false },
    { id: 'archive', label: 'Archive', folderId: null, starred: false, archived: true },
    ...folders.map((folder) => ({ id: `folder:${folder.id}`, label: folder.name, folderId: folder.id, starred: false, archived: false })),
  ].filter((category) => category.folderId !== group.folderId || category.starred !== group.starred || category.archived !== group.archived);

  const handleMoveToCategory = (category: typeof categoryOptions[number]) => {
    updateGroup(group.id, { folderId: category.folderId, starred: category.starred, archived: category.archived });
  };

  const startSelection = (tabId: string) => {
    setSelectedTabIds(new Set([tabId]));
  };

  const toggleSelection = (tabId: string) => {
    setSelectedTabIds((current) => {
      const next = new Set(current);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      return next;
    });
  };

  const moveMenuItems = () => (
    <>
      {categoryOptions.map((category) => (
        <ManagerMenuItem key={category.id} onClick={() => handleMoveToCategory(category)}>
          {category.label}
        </ManagerMenuItem>
      ))}
    </>
  );

  const openMoveMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    openMenu({
      id: `${menuKey}:move`,
      kind: 'session',
      anchor: { x: bounds.right + 4, y: bounds.top },
      trigger: moreActionRef.current,
      content: moveMenuItems(),
    });
  };

  const menuItems = () => (
    <>
      <ManagerMenuItem onClick={handleAddLink}>Add link</ManagerMenuItem>
      <ManagerMenuItem onClick={handleAddNote}>Add note</ManagerMenuItem>
      <ManagerMenuItem onClick={handleRename}>Rename</ManagerMenuItem>
      <button type="button" role="menuitem" className="manager-overlay-menu__item" onClick={openMoveMenu}>Move to category</button>
      <ManagerMenuItem onClick={handleToggleLock}>{group.locked ? 'Unlock' : 'Lock'}</ManagerMenuItem>
      <ManagerMenuItem onClick={handleCopyGroup}>Copy</ManagerMenuItem>
      <div role="separator" className="manager-overlay-menu__divider" />
      <ManagerMenuItem
        disabled={group.locked}
        className="manager-overlay-menu__item--danger"
        lifecycleAllowance="session-removal"
        onClick={handleDelete}
      >
        Delete
      </ManagerMenuItem>
    </>
  );

  const openSessionMenu = (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>, trigger: HTMLElement = event.currentTarget) => {
    if ('key' in event) {
      if (!isContextMenuKey(event)) return;
      event.preventDefault();
    } else {
      event.preventDefault();
    }
    event.stopPropagation();
    const bounds = trigger.getBoundingClientRect();
    openMenu({
      id: menuKey,
      kind: 'session',
      anchor: 'key' in event ? { x: bounds.left, y: bounds.bottom } : { x: event.clientX, y: event.clientY },
      trigger,
      openedByKeyboard: 'key' in event,
      content: menuItems(),
    });
  };

  if (isDragging && !isDragOverlay) {
    return (
      <div ref={setNodeRef} style={style} className="session-card__placeholder-slot">
        <SessionPlaceholder style={getDragPlaceholderStyle(sourceRect)} />
      </div>
    );
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      id={`session-card-${group.id}`}
      className="session-card"
      data-group-id={group.id}
      data-highlighted={highlighted || undefined}
      aria-hidden={isDragOverlay}
      aria-haspopup="menu"
      aria-expanded={isSessionMenuOpen}
      tabIndex={isDragOverlay ? -1 : 0}
      onContextMenu={isDragOverlay ? undefined : (event) => openSessionMenu(event)}
      onKeyDown={isDragOverlay ? undefined : (event) => openSessionMenu(event)}
    >
      <header
        className="session-card__header"
        onPointerDown={(event) => {
          if (event.target instanceof Element && event.target.closest('button, input, textarea, a, [data-no-drag]')) {
            return;
          }
          listeners?.onPointerDown?.(event);
        }}
      >
        {isDragOverlay ? (
          <span className="session-card__drag-handle session-card__drag-handle--static" aria-hidden="true">
            <IconGripVertical size={16} />
          </span>
        ) : (
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="session-card__drag-handle"
            aria-label={`Drag ${group.title} to reorder`}
            {...attributes}
            {...listeners}
          >
            <IconGripVertical size={16} />
          </button>
        )}
        <div className="session-card__heading">
          {isEditingTitle ? (
            <TextInput
              ref={titleInputRef}
              value={titleValue}
              onChange={(event) => setTitleValue(event.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={handleTitleKeyDown}
              size="xs"
              style={{ minWidth: 0 }}
            />
          ) : (
            <button
              type="button"
              className="session-card__title"
              onDoubleClick={isDragOverlay ? undefined : handleTitleDoubleClick}
              disabled={isDragOverlay}
              tabIndex={isDragOverlay ? -1 : undefined}
            >
              {group.title}
            </button>
          )}
        </div>
        <div className="session-card__actions" data-overlay-open={isSessionMenuOpen ? 'true' : undefined}>
          {tabMetadata.restorableTabCount > 0 && (
            <Tooltip label="Restore">
              <ActionIcon size="sm" variant="subtle" color="blue" disabled={isDragOverlay} onClick={handleRestore} aria-label="Restore">
                <IconRestore size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="More" disabled={isSessionMenuOpen}>
            <ActionIcon
              ref={moreActionRef}
              size="sm"
              variant="subtle"
              aria-label="More"
              aria-haspopup={isDragOverlay ? undefined : 'menu'}
              aria-expanded={isDragOverlay ? undefined : isSessionMenuOpen}
              disabled={isDragOverlay}
              onClick={isDragOverlay ? undefined : (event) => openSessionMenu(event, event.currentTarget)}
              onContextMenu={isDragOverlay ? undefined : (event) => openSessionMenu(event, event.currentTarget)}
              onKeyDown={isDragOverlay ? undefined : (event) => openSessionMenu(event, event.currentTarget)}
            >
              <IconDots size={16} />
            </ActionIcon>
          </Tooltip>
        </div>
        <div className="session-card__meta" aria-label="Session details">
          {tabMetadata.linkCount > 0 && <span className="session-card__meta-item"><IconLink size={12} />{tabMetadata.linkCount} link{tabMetadata.linkCount === 1 ? '' : 's'}</span>}
          {tabMetadata.noteCount > 0 && <span className="session-card__meta-item"><IconFileText size={12} />{tabMetadata.noteCount} note{tabMetadata.noteCount === 1 ? '' : 's'}</span>}
          {group.locked && <span className="session-card__meta-item"><IconLock size={12} />Locked</span>}
          <Text className="session-card__created" size="xs" c="dimmed">
            {new Date(group.createdAt).toLocaleDateString()}
          </Text>
        </div>
      </header>

      {isEditingNote ? (
        <Textarea
          ref={noteTextareaRef}
          className="session-card__note"
          value={noteValue}
          onChange={(event) => setNoteValue(event.target.value)}
          onBlur={handleNoteSubmit}
          onKeyDown={handleNoteKeyDown}
          size="xs"
          minRows={2}
          maxRows={6}
          placeholder="Add a note..."
          autosize
        />
      ) : (
        group.note && (
          <Box className="session-card__note" onClick={handleEditNote} title="Click to edit note">
            <Text size="xs" c="dimmed" lineClamp={2}>
              <IconFileText size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              {group.note}
            </Text>
          </Box>
        )
      )}

      <div className="session-card__tabs" role="list">
        <SortableContext
          items={tabMetadata.visibleTabs.map((tab) => `tab-${group.id}-${tab.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {tabMetadata.visibleTabs.map((tab) => (
            <TabItemRow
              key={tab.id}
              tab={tab}
              groupId={group.id}
              workspaceId={group.workspaceId}
              tabIndex={tabMetadata.canonicalIndexByTabId.get(tab.id) ?? 0}
              dropMarker={dragMarker}
              selectedRefs={tabMetadata.selectedRefs}
              runtime={runtime}
              locked={group.locked}
              selectionMode={selectedTabIds.size > 0}
              selected={selectedTabIds.has(tab.id)}
              onStartSelection={() => startSelection(tab.id)}
              onToggleSelection={() => toggleSelection(tab.id)}
              sourceRect={sourceRect}
              isDragOverlay={isDragOverlay}
            />
          ))}
          {dragMarker?.kind === 'tab'
            && dragMarker.groupId === group.id
            && dragMarker?.placement === 'body' && (
            <span className="session-card__drop-marker" aria-hidden="true" />
          )}
        </SortableContext>
        {normalizedQuery && tabMetadata.visibleTabs.length === 0 && <Text size="xs" c="dimmed">No matching tabs</Text>}
      </div>
    </article>
  );
});
