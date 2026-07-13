import { useState, useEffect, useRef } from 'react';
import {
  AppShell,
  Burger,
  Group as MantineGroup,
  Text,
  ActionIcon,
  Tooltip,
  Badge,
  Menu,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconSettings,
  IconTrash,
  IconDownload,
  IconUpload,
  IconPlus,
  IconChevronDown,
  IconLink,
  IconFolder,
  IconKeyboard,
} from '@tabler/icons-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Sidebar } from '../sidebar/Sidebar';
import { WorkspaceContent } from '../workspace/WorkspaceContent';
import { BinView } from '../bin/BinView';
import { useCurrentWorkspace, useWorkspaceFolders, useWorkspaceStats, useFilteredGroups } from '../../hooks/useFilteredGroups';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import { SearchBar } from '../search/SearchBar';
import { useToastNotifications } from './useToastNotifications';
import { useToast } from '../../hooks/useToast';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { SessionCard } from '../sessions/SessionCard';
import { TabItemRow } from '../sessions/TabItemRow';
import type { Group, TabItem } from '../../../shared/model';

export function ManagerLayout() {
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showStarred, setShowStarred] = useState(false);
  const [showBin, setShowBin] = useState(false);
  const [shortcutsOpened, setShortcutsOpened] = useState(false);
  const [highlightedGroupId, setHighlightedGroupId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspace = useCurrentWorkspace();
  const { showSuccess, showInfo } = useToast();
  const workspaces = useTabBoardStore((state) => state.workspaces);
  const setActiveWorkspace = useTabBoardStore((state) => state.setActiveWorkspace);
  const stats = useWorkspaceStats();
  const groups = useFilteredGroups(selectedFolderId, showStarred);
  const reorderGroupsInFolder = useTabBoardStore((state) => state.reorderGroupsInFolder);
  const moveGroup = useTabBoardStore((state) => state.moveGroup);
  const moveTab = useTabBoardStore((state) => state.moveTab);

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const activeGroup = groups.find((g) => `group-${g.id}` === activeId);

  const getActiveTab = (): { tab: TabItem; groupId: string } | null => {
    if (!activeId || !activeId.startsWith('tab-')) return null;
    for (const group of groups) {
      const tab = group.tabs.find((t) => `tab-${group.id}-${t.id}` === activeId);
      if (tab) {
        return { tab, groupId: group.id };
      }
    }
    return null;
  };

  const activeTabInfo = getActiveTab();

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    if (activeIdStr === overIdStr) return;

    const activeType = active.data.current?.type;

    if (activeType === 'group') {
      const activeGroupId = active.data.current?.groupId as string;
      const overType = over.data.current?.type;

      if (overType === 'group') {
        const overGroupId = over.data.current?.groupId as string;
        const oldIndex = groups.findIndex((g) => g.id === activeGroupId);
        const newIndex = groups.findIndex((g) => g.id === overGroupId);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newGroups = arrayMove(groups, oldIndex, newIndex);
          const orderedGroupIds = newGroups.map((g) => g.id);
          reorderGroupsInFolder(workspace.id, selectedFolderId, showStarred, orderedGroupIds);
        }
      } else if (overType === 'folder') {
        const overFolderId = over.data.current?.folderId as string | null;
        const targetFolderId = overFolderId;
        moveGroup(activeGroupId, targetFolderId, 0);
      } else if (overType === 'inbox') {
        moveGroup(activeGroupId, null, 0);
      }
    }

    if (activeType === 'tab') {
      const activeGroupId = active.data.current?.groupId as string;
      const activeTabId = active.data.current?.tabId as string;
      const overType = over.data.current?.type;

      if (overType === 'tab') {
        const overGroupId = over.data.current?.groupId as string;
        const overTabId = over.data.current?.tabId as string;

        const allGroups = useTabBoardStore.getState().groups;
        const targetGroup = allGroups.find((g) => g.id === overGroupId);
        if (targetGroup) {
          const targetIndex = targetGroup.tabs.findIndex((t) => t.id === overTabId);
          if (targetIndex !== -1) {
            moveTab(activeGroupId, activeTabId, overGroupId, targetIndex);
          }
        }
      }
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const targetGroupId = params.get('targetGroupId');
    if (targetGroupId) {
      const allGroups = useTabBoardStore.getState().groups;
      const targetGroup = allGroups.find((g) => g.id === targetGroupId);
      if (targetGroup) {
        if (targetGroup.folderId) {
          setSelectedFolderId(targetGroup.folderId);
          setShowStarred(false);
          setShowBin(false);
        } else if (targetGroup.starred) {
          setShowStarred(true);
          setSelectedFolderId(null);
          setShowBin(false);
        } else {
          setSelectedFolderId(null);
          setShowStarred(false);
          setShowBin(false);
        }

        setTimeout(() => {
          const element = document.getElementById(`session-card-${targetGroupId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedGroupId(targetGroupId);

            if (highlightTimeoutRef.current) {
              clearTimeout(highlightTimeoutRef.current);
            }
            highlightTimeoutRef.current = setTimeout(() => {
              setHighlightedGroupId(null);
            }, 3000);
          }
        }, 100);
      }
    }

    const feedback = params.get('feedback');
    if (feedback) {
      const [type, value] = feedback.split(':');
      const count = parseInt(value, 10);

      if (type === 'stored' && !isNaN(count)) {
        showSuccess(
          `${count} tab${count === 1 ? '' : 's'} saved successfully`,
          'Tabs saved'
        );
      } else if (type === 'deduped' && !isNaN(count)) {
        showInfo(
          `Removed ${count} duplicate${count === 1 ? '' : 's'}`,
          'Duplicates cleaned'
        );
      } else if (type === 'restored' && !isNaN(count)) {
        showSuccess(
          `${count} tab${count === 1 ? '' : 's'} restored`,
          'Tabs restored'
        );
      }
    }
  }, [showSuccess, showInfo]);

  useToastNotifications();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <AppShell
        header={{ height: 56 }}
        navbar={{
          width: 280,
          breakpoint: 'sm',
          collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
        }}
        padding="md"
      >
        <AppShell.Header>
          <MantineGroup h="100%" px="md" justify="space-between">
            <MantineGroup>
              <Burger
                opened={mobileOpened}
                onClick={toggleMobile}
                hiddenFrom="sm"
                size="sm"
              />
              <ActionIcon
                variant="subtle"
                onClick={toggleDesktop}
                visibleFrom="sm"
              >
                {desktopOpened ? (
                  <IconLayoutSidebarLeftCollapse size={18} />
                ) : (
                  <IconLayoutSidebarLeftExpand size={18} />
                )}
              </ActionIcon>
              <Menu shadow="md" width={240}>
                <Menu.Target>
                  <MantineGroup gap="xs" style={{ cursor: 'pointer' }}>
                    <Text fw={600} size="md">
                      {workspace?.name}
                    </Text>
                    <IconChevronDown size={16} />
                    <Badge size="sm" variant="light">
                      {stats.totalSessions} sessions
                    </Badge>
                  </MantineGroup>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Workspaces</Menu.Label>
                  {workspaces.map((ws) => (
                    <Menu.Item
                      key={ws.id}
                      onClick={() => setActiveWorkspace(ws.id)}
                    >
                      {ws.name}
                    </Menu.Item>
                  ))}
                  <Menu.Divider />
                  <Menu.Label>Workspace Stats</Menu.Label>
                  <Menu.Item disabled>
                    <MantineGroup gap="xs">
                      <IconLink size={14} />
                      <Text size="sm">{stats.totalTabs} tabs</Text>
                    </MantineGroup>
                  </Menu.Item>
                  <Menu.Item disabled>
                    <MantineGroup gap="xs">
                      <IconFolder size={14} />
                      <Text size="sm">{stats.totalFolders} categories</Text>
                    </MantineGroup>
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item leftSection={<IconPlus size={16} />}>
                    New workspace
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </MantineGroup>

            <MantineGroup style={{ flex: 1 }} justify="center" mx="xl" visibleFrom="md">
              <SearchBar />
            </MantineGroup>

            <MantineGroup gap="xs">
              <Tooltip label={`${stats.totalTabs} tabs saved`}>
                <Badge size="sm" variant="light" leftSection={<IconLink size={10} />}>
                  {stats.totalTabs}
                </Badge>
              </Tooltip>
              <Tooltip label="Keyboard shortcuts (?)">
                <ActionIcon variant="subtle" onClick={() => setShortcutsOpened(true)}>
                  <IconKeyboard size={18} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Import">
                <ActionIcon variant="subtle">
                  <IconUpload size={18} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Export">
                <ActionIcon variant="subtle">
                  <IconDownload size={18} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Trash">
                <ActionIcon variant="subtle" onClick={() => setShowBin(!showBin)} color={showBin ? 'blue' : 'gray'}>
                  <IconTrash size={18} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Settings">
                <ActionIcon variant="subtle" component="a" href="options.html">
                  <IconSettings size={18} />
                </ActionIcon>
              </Tooltip>
            </MantineGroup>
          </MantineGroup>
        </AppShell.Header>

        <AppShell.Navbar p="md">
          <Sidebar
            selectedFolderId={selectedFolderId}
            onSelectFolder={(id) => {
              setSelectedFolderId(id);
              setShowStarred(false);
              setShowBin(false);
            }}
            showStarred={showStarred}
            onSelectStarred={() => {
              setShowStarred(true);
              setSelectedFolderId(null);
              setShowBin(false);
            }}
            onSelectInbox={() => {
              setSelectedFolderId(null);
              setShowStarred(false);
              setShowBin(false);
            }}
            showBin={showBin}
            onSelectBin={() => {
              setShowBin(true);
              setSelectedFolderId(null);
              setShowStarred(false);
            }}
          />
        </AppShell.Navbar>

        <AppShell.Main>
          {showBin ? (
            <BinView />
          ) : (
            <WorkspaceContent
              folderId={selectedFolderId}
              starred={showStarred}
              workspaceName={workspace?.name || 'Workspace'}
              highlightedGroupId={highlightedGroupId}
            />
          )}
        </AppShell.Main>

        <KeyboardShortcutsHelp
          opened={shortcutsOpened}
          onClose={() => setShortcutsOpened(false)}
          onOpen={() => setShortcutsOpened(true)}
        />
      </AppShell>
      <DragOverlay>
        {activeGroup ? (
          <SessionCard group={activeGroup} isDragOverlay />
        ) : activeTabInfo ? (
          <TabItemRow
            tab={activeTabInfo.tab}
            groupId={activeTabInfo.groupId}
            isDragOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
