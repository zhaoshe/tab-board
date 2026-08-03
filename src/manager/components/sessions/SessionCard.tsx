import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
} from '@mantine/core';
import {
  Copy,
  FileText,
  Folder,
  Link,
  Lock,
  LockOpen,
  Pencil,
  SquareCheckBig,
  Trash,
} from 'lucide-react';
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
import type { SessionSortableBindings } from './SessionSortableBindings';
import type { ManagerSelectionScope } from '../../hooks/useManagerSelectionScope';
import { SessionSelectionToolbar } from './SessionSelectionToolbar';
import type { OpenSessionTargetPickerInput } from '../shell/SessionTargetPicker';

interface SessionCardProps {
  group: Group;
  runtime: ManagerRuntime;
  searchQuery?: string;
  isDragOverlay?: boolean;
  highlighted?: boolean;
  dragMarker?: DragMarker | null;
  sortable?: SessionSortableBindings;
  sourceRect?: DragSourceRect | null;
  selectionScope?: ManagerSelectionScope;
  onOpenSessionTargetPicker?: (input: OpenSessionTargetPickerInput) => void;
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
  selectionScope,
  onOpenSessionTargetPicker,
}: SessionCardProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(group.title);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [composerMode, setComposerMode] = useState<SessionItemComposerMode | null>(null);
  const [noteValue, setNoteValue] = useState(group.note);
  const { openMenu, closeOverlays } = useManagerOverlayCommands();
  const menuKey = `session:${group.id}`;
  const isSessionMenuOpen = useManagerMenuOpen(menuKey);
  useManagerOverlayLifecycle(group);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const moreActionRef = useRef<HTMLButtonElement>(null);
  const [selectedTabIds, setSelectedTabIds] = useState<Set<string>>(new Set());
  const selectionMode = selectionScope?.scope?.kind === 'saved-tabs'
    && selectionScope.scope.groupId === group.id;
  const registerSavedTabsClear = selectionScope?.registerSavedTabsClear;
  const { showError, showSuccess } = useToast();
  const confirmDestructive = useDestructiveConfirmation();
  const tabOverflow = useOverflowCues<HTMLDivElement>();

  const updateGroup = useTabBoardStore((state) => state.updateGroup);
  const deleteGroup = useTabBoardStore((state) => state.deleteGroup);
  const lockGroup = useTabBoardStore((state) => state.lockGroup);
  const addTabToGroup = useTabBoardStore((state) => state.addTabToGroup);
  const addNoteToGroup = useTabBoardStore((state) => state.addNoteToGroup);
  const confirmBeforeDestructive = useTabBoardStore(
    (state) => state.settings.confirmBeforeDestructive,
  );
  const updateTab = useTabBoardStore((state) => state.updateTab);
  const deleteTab = useTabBoardStore((state) => state.deleteTab);
  const deleteTabs = useTabBoardStore((state) => state.deleteTabs);
  const tabCommands = useMemo(() => ({
    confirmBeforeDestructive,
    deleteTab,
    updateTab,
  }), [confirmBeforeDestructive, deleteTab, updateTab]);

  const normalizedQuery = normalizeSearch(searchQuery);
  const titleMatches = normalizedQuery.length > 0 && group.title.toLowerCase().includes(normalizedQuery);
  const tabMetadata = useMemo(() => {
    const visibleTabs: TabItem[] = [];
    const selectedRefs: SavedTabRef[] = [];
    const selectedItems: TabItem[] = [];
    const canonicalIndexByTabId = new Map<string, number>();
    let restorableTabCount = 0;
    let linkCount = 0;
    let noteCount = 0;

    group.tabs.forEach((tab, index) => {
      canonicalIndexByTabId.set(tab.id, index);
      if (isRestorableTab(tab)) restorableTabCount += 1;
      if (tab.itemType === ITEM_LINK) linkCount += 1;
      if (tab.itemType === ITEM_NOTE) noteCount += 1;
      if (selectedTabIds.has(tab.id)) {
        selectedRefs.push({ groupId: group.id, tabId: tab.id });
        selectedItems.push(tab);
      }
      if (!normalizedQuery || titleMatches || tabMatchesQuery(tab, normalizedQuery)) {
        visibleTabs.push(tab);
      }
    });

    return {
      canonicalIndexByTabId,
      linkCount,
      noteCount,
      restorableTabCount,
      selectedItems,
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
    if (isDragOverlay || !registerSavedTabsClear) return;
    return registerSavedTabsClear(
      group.id,
      () => setSelectedTabIds(new Set()),
    );
  }, [
    group.id,
    isDragOverlay,
    registerSavedTabsClear,
  ]);

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

  const startSelection = (tabId: string) => {
    selectionScope?.commands.enterSavedTabs(group.id);
    setSelectedTabIds(new Set([tabId]));
  };

  const toggleSelection = (tabId: string) => {
    selectionScope?.commands.enterSavedTabs(group.id);
    setSelectedTabIds((current) => {
      const next = new Set(current);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      return next;
    });
  };

  const changeVisibleSelection = (
    tabIds: readonly string[],
    selected: boolean,
  ) => {
    setSelectedTabIds((current) => {
      const next = new Set(current);
      tabIds.forEach((tabId) => {
        if (selected) next.add(tabId);
        else next.delete(tabId);
      });
      return next;
    });
  };

  const removeSelection = (tabIds: readonly string[]) => {
    if (!tabIds.length) return;
    const removed = new Set(tabIds);
    setSelectedTabIds((current) => new Set(
      [...current].filter((tabId) => !removed.has(tabId)),
    ));
  };

  const enterSelectionMode = () => {
    setSelectedTabIds(new Set());
    selectionScope?.commands.enterSavedTabs(group.id);
  };

  const restoreSelectedTabs = async (
    refs: readonly SavedTabRef[],
  ): Promise<readonly string[]> => {
    const result = await runtime.restoreTabs(refs);
    const restoredTabIds = result.outcomes.flatMap((outcome) =>
      outcome.status === 'restored' ? [outcome.tabId] : []);
    const failedCount = result.outcomes.length - restoredTabIds.length;
    if (failedCount > 0) {
      showError(
        `${failedCount} ${failedCount === 1 ? 'link could' : 'links could'} not be restored and ${failedCount === 1 ? 'remains' : 'remain'} selected. Retry or copy the URL.`,
      );
    }
    return restoredTabIds;
  };

  const copySelectedUrls = async (urls: readonly string[]) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard is unavailable. Copy the URLs manually.');
      }
      await navigator.clipboard.writeText(urls.join('\n'));
      showSuccess('Copied');
    } catch (error: unknown) {
      showError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  };

  const deleteSelectedTabs = async (refs: readonly SavedTabRef[]) => {
    if (group.locked) throw new Error('Cannot modify a locked group.');
    if (confirmBeforeDestructive) {
      const confirmed = await confirmDestructive({
        title: 'Delete Selected Items',
        message: `Move ${refs.length} selected items to Trash?`,
        confirmLabel: 'Delete Selected Items',
      });
      if (!confirmed) throw new Error('Delete cancelled.');
    }
    try {
      await deleteTabs(refs);
    } catch (error: unknown) {
      showError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  };

  const menuItems = () => (
    <>
      <ManagerMenuItem
        icon={Link}
        label="Add Link"
        description="Add a saved URL"
        onClick={handleAddLink}
      />
      <ManagerMenuItem
        icon={FileText}
        label="Add Note"
        description="Add a note item"
        onClick={handleAddNote}
      />
      <div role="separator" className="manager-overlay-menu__divider" />
      <ManagerMenuItem
        icon={Pencil}
        label="Rename Session"
        description="Edit the Session title"
        onClick={handleRename}
      />
      <ManagerMenuItem
        icon={FileText}
        label="Edit Session Note"
        description="Edit the summary note"
        onClick={handleEditNote}
      />
      <ManagerMenuItem
        icon={Folder}
        label="Move Session"
        disabled={group.locked || !onOpenSessionTargetPicker}
        description="Choose a Category and Session position"
        preventFocusRestore={Boolean(onOpenSessionTargetPicker)}
        onClick={(focusIntent) => {
          const trigger = focusIntent?.trigger instanceof HTMLButtonElement
            ? focusIntent.trigger
            : moreActionRef.current;
          if (!onOpenSessionTargetPicker || !trigger) return;
          onOpenSessionTargetPicker({
            mode: 'move-session-category',
            source: { kind: 'session', groupId: group.id },
            trigger,
          });
        }}
      />
      <ManagerMenuItem
        icon={group.locked ? LockOpen : Lock}
        label={group.locked ? 'Unlock Session' : 'Lock Session'}
        description={group.locked ? 'Allow records to change after restore' : 'Keep records after restore'}
        onClick={handleToggleLock}
      />
      <ManagerMenuItem
        icon={Copy}
        label="Copy Links"
        description="Copy all URLs in this Session"
        onClick={handleCopyGroup}
      />
      <ManagerMenuItem
        icon={SquareCheckBig}
        label="Select Tabs"
        description="Enter this Session's selection mode"
        onClick={enterSelectionMode}
      />
      <div role="separator" className="manager-overlay-menu__divider" />
      <ManagerMenuItem
        icon={Trash}
        label="Delete Session"
        danger
        disabled={group.locked}
        description="Move this Session to Bin"
        lifecycleAllowance="session-removal"
        onClick={handleDelete}
      />
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
      ariaLabel: 'Session Actions',
    });
  };

  const blocksSessionDrag = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false;
    if (target.closest(
      'input, textarea, a, [data-no-drag], .session-card__actions, .session-card__tabs',
    )) {
      return true;
    }
    const button = target.closest('button');
    return Boolean(
      button
      && !button.matches('.session-card__title, .session-card__note'),
    );
  };
  const handleSessionPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch' || blocksSessionDrag(event.target)) return;
    sortable?.listeners?.onPointerDown?.(event);
  };
  const handleSessionTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (blocksSessionDrag(event.target)) return;
    sortable?.listeners?.onTouchStart?.(event);
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
      onPointerDown={handleSessionPointerDown}
      onTouchStart={handleSessionTouchStart}
    >
      {selectionMode ? (
        <SessionSelectionToolbar
          groupId={group.id}
          locked={group.locked}
          selectedItems={tabMetadata.selectedItems}
          selectedTabIds={selectedTabIds}
          visibleTabIds={tabMetadata.visibleTabs.map(({ id }) => id)}
          onChangeVisibleSelection={changeVisibleSelection}
          onRestore={restoreSelectedTabs}
          onCopy={copySelectedUrls}
          onMove={(trigger) => onOpenSessionTargetPicker?.({
            mode: 'move-saved-tabs',
            source: {
              kind: 'saved-tabs',
              refs: tabMetadata.selectedRefs,
            },
            trigger,
          })}
          onDelete={deleteSelectedTabs}
          onRemoveSelection={removeSelection}
          onClearSelection={() => setSelectedTabIds(new Set())}
          onExit={() => selectionScope?.commands.exit()}
        />
      ) : (
        <SessionCardHeader
          createdAt={group.createdAt}
          isDragOverlay={isDragOverlay}
          isEditingTitle={isEditingTitle}
          isMenuOpen={isSessionMenuOpen}
          linkCount={tabMetadata.linkCount}
          locked={group.locked}
          moreActionRef={moreActionRef}
          noteCount={tabMetadata.noteCount}
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
      )}

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
        commands={tabCommands}
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
        selectionMode={selectionMode}
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
