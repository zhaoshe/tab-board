import { useState, useRef, useEffect } from 'react';
import {
  Group as MantineGroup,
  Text,
  ActionIcon,
  Tooltip,
  Menu,
  Textarea,
  Box,
  HoverCard,
  Paper,
  Stack,
  Badge,
  CopyButton,
  Anchor,
} from '@mantine/core';
import {
  IconLink,
  IconFileText,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconEdit,
  IconExternalLink,
  IconRestore,
  IconNotes,
  IconGripVertical,
  IconCopy,
  IconCheck,
  IconClock,
  IconWorld,
} from '@tabler/icons-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TabItem } from '../../../shared/model';
import { ITEM_LINK, ITEM_NOTE } from '../../../shared/model';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';

interface TabItemRowProps {
  tab: TabItem;
  groupId: string;
  isDragOverlay?: boolean;
}

export function TabItemRow({ tab, groupId, isDragOverlay = false }: TabItemRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(tab.note);
  const [contextMenuOpened, setContextMenuOpened] = useState(false);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);

  const updateTab = useTabBoardStore((state) => state.updateTab);
  const deleteTab = useTabBoardStore((state) => state.deleteTab);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `tab-${groupId}-${tab.id}`,
    data: {
      type: 'tab',
      groupId,
      tabId: tab.id,
    },
    disabled: isDragOverlay,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  useEffect(() => {
    if (isEditingNote && noteTextareaRef.current) {
      noteTextareaRef.current.focus();
      noteTextareaRef.current.select();
    }
  }, [isEditingNote]);

  const handleClick = () => {
    if (tab.itemType === ITEM_LINK && tab.url) {
      chrome.tabs.create({ url: tab.url });
    }
  };

  const handleToggleStar = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateTab(groupId, tab.id, { starred: !tab.starred });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteTab(groupId, tab.id);
  };

  const handleRestore = (e: React.MouseEvent) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'restore-tab', groupId, tabId: tab.id });
  };

  const handleEditNote = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNoteValue(tab.note);
    setIsEditingNote(true);
  };

  const handleNoteSubmit = () => {
    updateTab(groupId, tab.id, { note: noteValue.trim() });
    setIsEditingNote(false);
  };

  const handleNoteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setNoteValue(tab.note);
      setIsEditingNote(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuOpened(true);
  };

  const favicon =
    tab.itemType === ITEM_LINK && tab.favIconUrl
      ? tab.favIconUrl
      : null;

  const hasNote = Boolean(tab.note);

  const getDomain = (url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  const hoverCardDropdown = (
    <HoverCard.Dropdown>
      <Paper p="sm" withBorder style={{ maxWidth: 320 }}>
        <Stack gap="xs">
          <MantineGroup gap="xs" wrap="nowrap">
            {favicon ? (
              <img
                src={favicon}
                alt=""
                style={{ width: 32, height: 32, borderRadius: 4, flexShrink: 0 }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <ActionIcon size="lg" variant="light" color="gray" style={{ flexShrink: 0 }}>
                {tab.itemType === ITEM_NOTE ? <IconFileText size={20} /> : <IconLink size={20} />}
              </ActionIcon>
            )}
            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={600} lineClamp={2}>
                {tab.title}
              </Text>
              {tab.itemType === ITEM_LINK && tab.url && (
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {getDomain(tab.url)}
                </Text>
              )}
            </Stack>
          </MantineGroup>

          {tab.itemType === ITEM_LINK && tab.url && (
            <MantineGroup gap="xs" wrap="nowrap">
              <IconWorld size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
              <Text size="xs" lineClamp={2} style={{ flex: 1, minWidth: 0, wordBreak: 'break-all' }}>
                <Anchor href={tab.url} target="_blank" rel="noopener noreferrer" size="xs" onClick={(e) => e.stopPropagation()}>
                  {tab.url}
                </Anchor>
              </Text>
              <CopyButton value={tab.url}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Copied!' : 'Copy URL'} position="top">
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color={copied ? 'green' : 'gray'}
                      onClick={(e) => {
                        e.stopPropagation();
                        copy();
                      }}
                    >
                      {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </MantineGroup>
          )}

          {hasNote && (
            <Box>
              <MantineGroup gap={4} mb={4}>
                <IconNotes size={14} style={{ opacity: 0.6 }} />
                <Text size="xs" fw={500} c="dimmed">
                  Note
                </Text>
              </MantineGroup>
              <Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>
                {tab.note}
              </Text>
            </Box>
          )}

          <MantineGroup gap="xs" wrap="nowrap">
            <IconClock size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
            <Text size="xs" c="dimmed">
              Saved {new Date(tab.createdAt).toLocaleString()}
            </Text>
          </MantineGroup>

          <MantineGroup gap="xs">
            {tab.starred && (
              <Badge size="xs" variant="light" color="yellow" leftSection={<IconStar size={10} fill="currentColor" />}>
                Starred
              </Badge>
            )}
            {tab.itemType === ITEM_NOTE && (
              <Badge size="xs" variant="light" color="gray" leftSection={<IconFileText size={10} />}>
                Note
              </Badge>
            )}
            {tab.pinned && (
              <Badge size="xs" variant="light" color="blue">
                Pinned
              </Badge>
            )}
          </MantineGroup>
        </Stack>
      </Paper>
    </HoverCard.Dropdown>
  );

  const menuItems = (closeMenu?: () => void) => (
    <>
      {tab.itemType === ITEM_LINK && (
        <Menu.Item leftSection={<IconExternalLink size={14} />} onClick={() => { closeMenu?.(); handleClick(); }}>
          Open in new tab
        </Menu.Item>
      )}
      <Menu.Item
        leftSection={tab.starred ? <IconStarFilled size={14} /> : <IconStar size={14} />}
        onClick={() => { closeMenu?.(); handleToggleStar({ stopPropagation: () => {} } as React.MouseEvent); }}
      >
        {tab.starred ? 'Unstar' : 'Star'}
      </Menu.Item>
      <Menu.Item leftSection={<IconNotes size={14} />} onClick={() => { closeMenu?.(); handleEditNote({ stopPropagation: () => {} } as React.MouseEvent); }}>
        Add note
      </Menu.Item>
      {tab.itemType === ITEM_LINK && (
        <Menu.Item leftSection={<IconRestore size={14} />} onClick={() => { closeMenu?.(); handleRestore({ stopPropagation: () => {} } as React.MouseEvent); }}>
          Restore
        </Menu.Item>
      )}
      <Menu.Divider />
      <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={() => { closeMenu?.(); handleDelete({ stopPropagation: () => {} } as React.MouseEvent); }}>
        Delete
      </Menu.Item>
    </>
  );

  if (isEditingNote) {
    return (
      <div ref={setNodeRef} style={style} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '4px 6px' }}>
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
            autosize
          />
        </div>
      </div>
    );
  }

  if (isDragging && !isDragOverlay) {
    return (
      <Box
        style={{
          height: 28,
          margin: '2px 0',
          border: '2px dashed var(--mantine-color-blue-4)',
          borderRadius: 'var(--mantine-radius-sm)',
          backgroundColor: 'var(--mantine-color-blue-0)',
          opacity: 0.5,
        }}
      />
    );
  }

  const rowContent = (
    <MantineGroup
      gap="xs"
      wrap="nowrap"
      style={{
        padding: '4px 6px',
        borderRadius: 'var(--mantine-radius-sm)',
        cursor: tab.itemType === ITEM_LINK ? 'pointer' : 'default',
        transition: 'background-color 0.15s',
        boxShadow: isDragOverlay ? 'var(--mantine-shadow-md)' : undefined,
        backgroundColor: isDragOverlay ? 'var(--mantine-color-body)' : undefined,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {!isDragOverlay && (
        <Tooltip label="Drag to reorder">
          <ActionIcon
            size="xs"
            variant="subtle"
            color="gray"
            {...attributes}
            {...listeners}
            style={{ cursor: 'grab', flexShrink: 0 }}
          >
            <IconGripVertical size={12} />
          </ActionIcon>
        </Tooltip>
      )}
      {favicon ? (
        <img
          src={favicon}
          alt=""
          style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0 }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <ActionIcon size="xs" variant="subtle" color="gray" style={{ flexShrink: 0 }}>
          {tab.itemType === ITEM_NOTE ? <IconFileText size={12} /> : <IconLink size={12} />}
        </ActionIcon>
      )}

      <Text
        size="xs"
        lineClamp={1}
        style={{ flex: 1, minWidth: 0 }}
        title={tab.title}
      >
        {tab.title}
        {hasNote && (
          <IconNotes
            size={10}
            style={{
              display: 'inline',
              verticalAlign: 'middle',
              marginLeft: 4,
              opacity: 0.6,
            }}
          />
        )}
      </Text>

      <MantineGroup gap={2} style={{ flexShrink: 0, opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s' }}>
        {tab.itemType === ITEM_LINK && (
          <Tooltip label="Open in new tab">
            <ActionIcon
              size="xs"
              variant="subtle"
              color="gray"
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
            >
              <IconExternalLink size={12} />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label={tab.starred ? 'Unstar' : 'Star'}>
          <ActionIcon
            size="xs"
            variant="subtle"
            color={tab.starred ? 'yellow' : 'gray'}
            onClick={handleToggleStar}
          >
            {tab.starred ? <IconStarFilled size={12} fill="currentColor" /> : <IconStar size={12} />}
          </ActionIcon>
        </Tooltip>
        {tab.itemType === ITEM_LINK && (
          <Tooltip label="Restore tab">
            <ActionIcon
              size="xs"
              variant="subtle"
              color="green"
              onClick={handleRestore}
            >
              <IconRestore size={12} />
            </ActionIcon>
          </Tooltip>
        )}
        <Menu shadow="md" width={160} position="bottom-end">
          <Menu.Target>
            <ActionIcon size="xs" variant="subtle">
              <IconEdit size={12} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {menuItems()}
          </Menu.Dropdown>
        </Menu>
      </MantineGroup>
    </MantineGroup>
  );

  if (isDragOverlay) {
    return rowContent;
  }

  return (
    <div ref={setNodeRef} style={style}>
      <HoverCard width={320} position="right-start" offset={8} openDelay={500} closeDelay={200} withArrow>
        <HoverCard.Target>
          <div>
            <Menu
              shadow="md"
              width={160}
              position="right-start"
              opened={contextMenuOpened}
              onChange={setContextMenuOpened}
            >
              <Menu.Target>
                {rowContent}
              </Menu.Target>
              <Menu.Dropdown>
                {menuItems(() => setContextMenuOpened(false))}
              </Menu.Dropdown>
            </Menu>
          </div>
        </HoverCard.Target>
        {hoverCardDropdown}
      </HoverCard>
    </div>
  );
}
