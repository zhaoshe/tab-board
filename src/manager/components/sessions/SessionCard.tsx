import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
} from '@mantine/core';
import {
  IconLockOpen,
  IconNotes,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useShallow } from 'zustand/react/shallow';
import type { Group, TabItem } from '../../../shared/model';
import {
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
import { SessionCardHeader } from './SessionCardHeader';
import { SessionCardEditor } from './SessionCardEditor';
import { SessionTabList } from './SessionTabList';
import {
  SessionItemComposer,
  type SessionItemComposerMode,
} from './SessionItemComposer';
import { useDestructiveConfirmation } from '../../../shared/components/DestructiveConfirmation';
import {
  ManagerMenuItem,
  isContextMenuKey,
  useManagerMenuOpen,
  useManagerOverlayCommands,
  useManagerOverlayLifecycle,
} from '../../hooks/useManagerOverlays';
import { useOverflowCues } from '../../hooks/useOverflowCues';
import type { SessionSortableBindings } from './SessionSlot';

interface SessionCardProps {
  group: Group;
  runtime: ManagerRuntime;
  searchQuery?: string;
  isDragOverlay?: boolean;
  highlighted?: boolean;
  dragMarker?: DragMarker | null;
  sortable?: SessionSortableBindings;
  sourceRect?: DragSourceRect | null;
}

export const SessionCard = memo(function SessionCard({
  group,
  runtime,
  searchQuery = '',
  isDragOverlay = false,
  highlighted = false,
  dragMarker = null,
  sortable,
  sourceRect = null,
}: SessionCardProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(group.title);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [composerMode, setComposerMode] = useState<SessionItemComposerMode | null>(null);
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
  const confirmDestructive = useDestructiveConfirmation();
  const tabOverflow = useOverflowCues<HTMLDivElement>();

  const updateGroup = useTabBoardStore((state) => state.updateGroup);
  const folders = useTabBoardStore(
    useShallow((state) => state.folders.filter((folder) => folder.workspaceId === group.workspaceId)),
  );
  const deleteGroup = useTabBoardStore((state) => state.deleteGroup);
  const lockGroup = useTabBoardStore((state) => state.lockGroup);
  const addTabToGroup = useTabBoardStore((state) => state.addTabToGroup);
  const addNoteToGroup = useTabBoardStore((state) => state.addNoteToGroup);
  const confirmBeforeDestructive = useTabBoardStore(
    (state) => state.settings.confirmBeforeDestructive,
  );

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

  const style = isDragOverlay
    ? { pointerEvents: 'none' as const }
    : sortable?.style;

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
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable. Copy the text manually.');
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

  const handleDelete = async () => {
    if (group.locked) return;
    if (confirmBeforeDestructive) {
      const confirmed = await confirmDestructive({
        title: 'Delete Session',
        message: `Move “${group.title}” to Trash?`,
        confirmLabel: 'Delete Session',
      });
      if (!confirmed) return;
    }
    deleteGroup(group.id);
  };

  const handleTitleDoubleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setTitleValue(group.title);
    setIsEditingTitle(true);
  };

  const handleTitleActivationKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['Enter', 'F2', ' '].includes(event.key)) return;
    event.preventDefault();
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
    setComposerMode('link');
  };

  const addLink = ({ url, title }: { url: string; title: string }) => {
    addTabToGroup(group.id, {
      itemType: ITEM_LINK,
      title,
      url,
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
    setComposerMode('note');
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
      <ManagerMenuItem onClick={handleAddLink}>Add Link</ManagerMenuItem>
      <ManagerMenuItem onClick={handleAddNote}>Add Note</ManagerMenuItem>
      <ManagerMenuItem onClick={handleRename}>Rename</ManagerMenuItem>
      <button type="button" role="menuitem" className="manager-overlay-menu__item" onClick={openMoveMenu}>Move to Category</button>
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

  return (
    <article
      ref={sortable?.setNodeRef}
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
      <SessionCardHeader
        attributes={sortable?.attributes}
        createdAt={group.createdAt}
        dragHandleRef={sortable?.setActivatorNodeRef}
        isDragOverlay={isDragOverlay}
        isEditingTitle={isEditingTitle}
        isMenuOpen={isSessionMenuOpen}
        linkCount={tabMetadata.linkCount}
        listeners={sortable?.listeners}
        locked={group.locked}
        moreActionRef={moreActionRef}
        noteCount={tabMetadata.noteCount}
        onHeaderPointerDown={(event) => {
          if (event.target instanceof Element && event.target.closest('button, input, textarea, a, [data-no-drag]')) {
            return;
          }
          sortable?.listeners?.onPointerDown?.(event);
        }}
        onOpenMenu={openSessionMenu}
        onRestore={handleRestore}
        onTitleActivationKeyDown={handleTitleActivationKeyDown}
        onTitleBlur={handleTitleSubmit}
        onTitleChange={setTitleValue}
        onTitleDoubleClick={handleTitleDoubleClick}
        onTitleInputKeyDown={handleTitleKeyDown}
        restorableTabCount={tabMetadata.restorableTabCount}
        title={group.title}
        titleInputRef={titleInputRef}
        titleValue={titleValue}
      />

      <SessionCardEditor
        editing={isEditingNote}
        note={group.note}
        noteValue={noteValue}
        title={group.title}
        textareaRef={noteTextareaRef}
        onEdit={handleEditNote}
        onNoteChange={setNoteValue}
        onNoteKeyDown={handleNoteKeyDown}
        onSubmit={handleNoteSubmit}
      />

      <SessionTabList
        canonicalIndexByTabId={tabMetadata.canonicalIndexByTabId}
        dragMarker={dragMarker}
        groupId={group.id}
        isDragOverlay={isDragOverlay}
        locked={group.locked}
        overflowCues={tabOverflow.cues}
        overflowRef={tabOverflow.ref}
        runtime={runtime}
        searchActive={Boolean(normalizedQuery)}
        selectedRefs={tabMetadata.selectedRefs}
        selectedTabIds={selectedTabIds}
        sourceRect={sourceRect}
        tabs={tabMetadata.visibleTabs}
        workspaceId={group.workspaceId}
        onStartSelection={startSelection}
        onToggleSelection={toggleSelection}
      />
      {composerMode && (
        <SessionItemComposer
          mode={composerMode}
          onClose={() => setComposerMode(null)}
          onAddLink={addLink}
          onAddNote={(text) => addNoteToGroup(group.id, text)}
        />
      )}
    </article>
  );
});
