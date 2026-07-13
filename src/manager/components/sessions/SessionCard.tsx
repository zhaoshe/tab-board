import { useState, useRef, useEffect } from 'react';
import {
  Card,
  Text,
  Group as MantineGroup,
  ActionIcon,
  Tooltip,
  Badge,
  Stack,
  Menu,
  TextInput,
  Textarea,
  Box,
} from '@mantine/core';
import {
  IconStar,
  IconStarFilled,
  IconDots,
  IconTrash,
  IconEdit,
  IconExternalLink,
  IconChevronDown,
  IconChevronUp,
  IconRestore,
  IconLink,
  IconLock,
  IconLockOpen,
  IconFileText,
  IconNotes,
  IconGripVertical,
} from '@tabler/icons-react';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Group } from '../../../shared/model';
import { ITEM_LINK, ITEM_NOTE } from '../../../shared/model';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import { TabItemRow } from './TabItemRow';
import { SessionPlaceholder } from './SessionPlaceholder';

interface SessionCardProps {
  group: Group;
  isDragOverlay?: boolean;
  highlighted?: boolean;
}

export function SessionCard({ group, isDragOverlay = false, highlighted = false }: SessionCardProps) {
  const [expanded, setExpanded] = useState(!group.collapsed && group.tabs.length <= 10);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(group.title);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(group.note);
  const [isHovered, setIsHovered] = useState(false);
  const [contextMenuOpened, setContextMenuOpened] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `group-${group.id}`,
    data: {
      type: 'group',
      groupId: group.id,
    },
    disabled: isDragOverlay,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'default',
  };

  const updateGroup = useTabBoardStore((state) => state.updateGroup);
  const deleteGroup = useTabBoardStore((state) => state.deleteGroup);
  const lockGroup = useTabBoardStore((state) => state.lockGroup);
  const collapseGroup = useTabBoardStore((state) => state.collapseGroup);
  const starGroup = useTabBoardStore((state) => state.starGroup);

  const linkCount = group.tabs.filter((t) => t.itemType === ITEM_LINK).length;
  const noteCount = group.tabs.filter((t) => t.itemType === ITEM_NOTE).length;
  const hasNote = Boolean(group.note);

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

  const handleToggleStar = (e: React.MouseEvent) => {
    e.stopPropagation();
    starGroup(group.id);
  };

  const handleToggleLock = (e: React.MouseEvent) => {
    e.stopPropagation();
    lockGroup(group.id);
  };

  const handleToggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
    collapseGroup(group.id);
  };

  const handleDelete = () => {
    if (group.locked) return;
    if (confirm(`Delete "${group.title}"?`)) {
      deleteGroup(group.id);
    }
  };

  const handleOpenAll = () => {
    const urls = group.tabs
      .filter((t) => t.itemType === ITEM_LINK)
      .map((t) => t.url);
    if (urls.length) {
      chrome.tabs.create({ url: urls[0] });
      urls.slice(1).forEach((url) => {
        chrome.tabs.create({ url, active: false });
      });
    }
  };

  const handleRestoreAll = () => {
    chrome.runtime.sendMessage({ type: 'restore-group', groupId: group.id });
  };

  const handleTitleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTitleValue(group.title);
    setIsEditingTitle(true);
  };

  const handleTitleSubmit = () => {
    const trimmed = titleValue.trim();
    if (trimmed && trimmed !== group.title) {
      updateGroup(group.id, { title: trimmed });
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSubmit();
    } else if (e.key === 'Escape') {
      setTitleValue(group.title);
      setIsEditingTitle(false);
    }
  };

  const handleNoteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNoteValue(group.note);
    setIsEditingNote(true);
  };

  const handleNoteSubmit = () => {
    updateGroup(group.id, { note: noteValue.trim() });
    setIsEditingNote(false);
  };

  const handleNoteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setNoteValue(group.note);
      setIsEditingNote(false);
    }
  };

  const handleRename = () => {
    setTitleValue(group.title);
    setIsEditingTitle(true);
    setContextMenuOpened(false);
  };

  const handleEditNote = () => {
    setNoteValue(group.note);
    setIsEditingNote(true);
    setContextMenuOpened(false);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuOpened(true);
  };

  const visibleTabs = expanded ? group.tabs : group.tabs.slice(0, 5);
  const hiddenCount = group.tabs.length - visibleTabs.length;

  const menuItems = (closeMenu?: () => void) => (
    <>
      <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => { closeMenu?.(); handleRename(); }}>
        Rename
      </Menu.Item>
      <Menu.Item leftSection={<IconNotes size={14} />} onClick={() => { closeMenu?.(); handleEditNote(); }}>
        Edit note
      </Menu.Item>
      <Menu.Item
        leftSection={group.starred ? <IconStarFilled size={14} /> : <IconStar size={14} />}
        onClick={() => { closeMenu?.(); handleToggleStar({ stopPropagation: () => {} } as React.MouseEvent); }}
      >
        {group.starred ? 'Unstar' : 'Star'}
      </Menu.Item>
      <Menu.Item
        leftSection={group.locked ? <IconLockOpen size={14} /> : <IconLock size={14} />}
        onClick={() => { closeMenu?.(); handleToggleLock({ stopPropagation: () => {} } as React.MouseEvent); }}
      >
        {group.locked ? 'Unlock' : 'Lock'}
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item leftSection={<IconExternalLink size={14} />} onClick={() => { closeMenu?.(); handleOpenAll(); }}>
        Open all tabs
      </Menu.Item>
      <Menu.Item leftSection={<IconRestore size={14} />} onClick={() => { closeMenu?.(); handleRestoreAll(); }}>
        Restore all
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item
        leftSection={<IconTrash size={14} />}
        color="red"
        onClick={() => { closeMenu?.(); handleDelete(); }}
        disabled={group.locked}
      >
        Delete
      </Menu.Item>
    </>
  );

  if (isDragging && !isDragOverlay) {
    return <SessionPlaceholder />;
  }

  const cardContent = (
    <Card
      withBorder
      padding="sm"
      radius="md"
      style={{
        overflow: 'visible',
        boxShadow: isDragOverlay
          ? 'var(--mantine-shadow-lg)'
          : highlighted
          ? '0 0 0 2px var(--mantine-color-blue-5), var(--mantine-shadow-md)'
          : undefined,
        transform: isDragOverlay ? 'scale(1.02)' : undefined,
        opacity: isDragOverlay ? 0.95 : undefined,
        transition: 'box-shadow 0.3s ease',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={handleContextMenu}
    >
          <Stack gap="xs">
            <MantineGroup justify="space-between" wrap="nowrap">
              <MantineGroup gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                {!isDragOverlay && (
                  <Tooltip label="Drag to reorder">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="gray"
                      {...attributes}
                      {...listeners}
                      style={{ cursor: 'grab' }}
                    >
                      <IconGripVertical size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}
                <Tooltip label={group.starred ? 'Unstar' : 'Star'}>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    onClick={handleToggleStar}
                    color={group.starred ? 'yellow' : 'gray'}
                  >
                    {group.starred ? (
                      <IconStarFilled size={16} fill="currentColor" />
                    ) : (
                      <IconStar size={16} />
                    )}
                  </ActionIcon>
                </Tooltip>
                {isEditingTitle ? (
                  <TextInput
                    ref={titleInputRef}
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    onBlur={handleTitleSubmit}
                    onKeyDown={handleTitleKeyDown}
                    size="xs"
                    style={{ flex: 1, minWidth: 0 }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <Text
                    size="sm"
                    fw={600}
                    lineClamp={1}
                    style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
                    onClick={handleOpenAll}
                    onDoubleClick={handleTitleDoubleClick}
                    title="Double-click to rename, click to open all tabs"
                  >
                    {group.title}
                  </Text>
                )}
              </MantineGroup>

              <MantineGroup gap={2} style={{ flexShrink: 0, opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s' }}>
                <Tooltip label={group.locked ? 'Unlock' : 'Lock'}>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    onClick={handleToggleLock}
                    color={group.locked ? 'blue' : 'gray'}
                  >
                    {group.locked ? <IconLock size={14} /> : <IconLockOpen size={14} />}
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={expanded ? 'Collapse' : 'Expand'}>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    onClick={handleToggleCollapse}
                    color="gray"
                  >
                    {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                  </ActionIcon>
                </Tooltip>
                <Menu shadow="md" width={180} position="bottom-end">
                  <Menu.Target>
                    <ActionIcon size="sm" variant="subtle">
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {menuItems()}
                  </Menu.Dropdown>
                </Menu>
              </MantineGroup>
            </MantineGroup>

            {isEditingNote ? (
              <Textarea
                ref={noteTextareaRef}
                value={noteValue}
                onChange={(e) => setNoteValue(e.target.value)}
                onBlur={handleNoteSubmit}
                onKeyDown={handleNoteKeyDown}
                size="xs"
                minRows={2}
                maxRows={6}
                placeholder="Add a note..."
                onClick={(e) => e.stopPropagation()}
                autosize
              />
            ) : (
              hasNote && (
                <Box
                  onClick={handleNoteClick}
                  style={{ cursor: 'pointer' }}
                  title="Click to edit note"
                >
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    <IconFileText size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                    {group.note}
                  </Text>
                </Box>
              )
            )}

            <Stack gap={4}>
              <SortableContext
                items={visibleTabs.map((t) => `tab-${group.id}-${t.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {visibleTabs.map((tab) => (
                  <TabItemRow key={tab.id} tab={tab} groupId={group.id} />
                ))}
              </SortableContext>
              {hiddenCount > 0 && (
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => setExpanded(!expanded)}
                  style={{ alignSelf: 'flex-start' }}
                >
                  <MantineGroup gap={4}>
                    {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                    <Text size="xs">
                      {expanded ? 'Show less' : `${hiddenCount} more`}
                    </Text>
                  </MantineGroup>
                </ActionIcon>
              )}
            </Stack>

            <MantineGroup gap="xs" mt="xs">
              {linkCount > 0 && (
                <Badge size="xs" variant="light" leftSection={<IconLink size={10} />}>
                  {linkCount}
                </Badge>
              )}
              {noteCount > 0 && (
                <Badge size="xs" variant="light" color="gray" leftSection={<IconFileText size={10} />}>
                  {noteCount} notes
                </Badge>
              )}
              {group.locked && (
                <Badge size="xs" variant="light" color="blue" leftSection={<IconLock size={10} />}>
                  Locked
                </Badge>
              )}
              <Text size="xs" c="dimmed" style={{ marginLeft: 'auto' }}>
                {new Date(group.createdAt).toLocaleDateString()}
              </Text>
            </MantineGroup>
          </Stack>
        </Card>
  );

  if (isDragOverlay) {
    return cardContent;
  }

  return (
    <div ref={setNodeRef} style={style} id={`session-card-${group.id}`}>
      <Menu
        shadow="md"
        width={180}
        position="bottom-start"
        opened={contextMenuOpened}
        onChange={setContextMenuOpened}
      >
        <Menu.Target>
          {cardContent}
        </Menu.Target>
        <Menu.Dropdown>
          {menuItems(() => setContextMenuOpened(false))}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}
