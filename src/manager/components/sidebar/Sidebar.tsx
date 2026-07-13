import { useState } from 'react';
import {
  Stack,
  NavLink,
  Text,
  Group as MantineGroup,
  ActionIcon,
  Tooltip,
  Divider,
  ScrollArea,
  Box,
  Modal,
  TextInput,
  Button,
  Alert,
  Menu,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconInbox,
  IconStar,
  IconFolder,
  IconFolderPlus,
  IconUpload,
  IconDownload,
  IconTrash,
  IconEdit,
  IconTrashX,
  IconAlertTriangle,
  IconDots,
} from '@tabler/icons-react';
import { useDroppable } from '@dnd-kit/core';
import { useWorkspaceFolders } from '../../hooks/useFilteredGroups';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import { ImportModal } from '../import-export/ImportModal';
import { ExportModal } from '../import-export/ExportModal';
import { OpenTabsPanel } from './OpenTabsPanel';

const FOLDER_COLORS = [
  '#228be6',
  '#40c057',
  '#fab005',
  '#fa5252',
  '#be4bdb',
  '#7950f2',
  '#15aabf',
  '#fd7e14',
  '#868e96',
  '#e64980',
];

interface SidebarProps {
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  showStarred: boolean;
  onSelectStarred: () => void;
  onSelectInbox: () => void;
  showBin: boolean;
  onSelectBin: () => void;
}

export function Sidebar({
  selectedFolderId,
  onSelectFolder,
  showStarred,
  onSelectStarred,
  onSelectInbox,
  showBin,
  onSelectBin,
}: SidebarProps) {
  const folders = useWorkspaceFolders();
  const groups = useTabBoardStore((state) => state.groups);
  const bin = useTabBoardStore((state) => state.bin);
  const activeWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);
  const addFolder = useTabBoardStore((state) => state.addFolder);
  const renameFolder = useTabBoardStore((state) => state.renameFolder);
  const deleteFolder = useTabBoardStore((state) => state.deleteFolder);

  const [importModalOpened, { open: openImportModal, close: closeImportModal }] = useDisclosure(false);
  const [exportModalOpened, { open: openExportModal, close: closeExportModal }] = useDisclosure(false);
  const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);
  const [renameModalOpened, { open: openRenameModal, close: closeRenameModal }] = useDisclosure(false);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);

  const [newFolderName, setNewFolderName] = useState('');
  const [selectedColor, setSelectedColor] = useState(FOLDER_COLORS[0]);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [hoveredFolderId, setHoveredFolderId] = useState<string | null>(null);

  const inboxCount = groups.filter(
    (g) =>
      g.workspaceId === activeWorkspaceId && !g.starred && g.folderId === null
  ).length;

  const starredCount = groups.filter(
    (g) => g.workspaceId === activeWorkspaceId && g.starred
  ).length;

  const getFolderCount = (folderId: string) =>
    groups.filter(
      (g) => g.workspaceId === activeWorkspaceId && g.folderId === folderId
    ).length;

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      addFolder(activeWorkspaceId, newFolderName.trim(), selectedColor);
      setNewFolderName('');
      setSelectedColor(FOLDER_COLORS[0]);
      closeCreateModal();
    }
  };

  const openRenameFolderModal = (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);
    if (folder) {
      setEditingFolderId(folderId);
      setEditingFolderName(folder.name);
      openRenameModal();
    }
  };

  const handleRenameFolder = () => {
    if (editingFolderId && editingFolderName.trim()) {
      renameFolder(editingFolderId, editingFolderName.trim());
      closeRenameModal();
      setEditingFolderId(null);
      setEditingFolderName('');
    }
  };

  const openDeleteFolderModal = (folderId: string) => {
    setEditingFolderId(folderId);
    openDeleteModal();
  };

  const handleDeleteFolder = () => {
    if (editingFolderId) {
      deleteFolder(editingFolderId);
      closeDeleteModal();
      if (selectedFolderId === editingFolderId) {
        onSelectFolder(null);
      }
      setEditingFolderId(null);
    }
  };

  const getEditingFolder = () => folders.find((f) => f.id === editingFolderId);

  const openCreateModalAndReset = () => {
    setNewFolderName('');
    setSelectedColor(FOLDER_COLORS[0]);
    openCreateModal();
  };

  const InboxDroppable = () => {
    const { setNodeRef, isOver } = useDroppable({
      id: 'inbox-droppable',
      data: {
        type: 'inbox',
        folderId: null,
      },
    });

    return (
      <div ref={setNodeRef}>
        <NavLink
          label="Inbox"
          leftSection={<IconInbox size={18} />}
          rightSection={
            <Text size="xs" c="dimmed">
              {inboxCount}
            </Text>
          }
          active={!selectedFolderId && !showStarred && !showBin}
          onClick={onSelectInbox}
          style={{
            backgroundColor: isOver ? 'var(--mantine-color-blue-0)' : undefined,
            borderRadius: 'var(--mantine-radius-sm)',
          }}
        />
      </div>
    );
  };

  const FolderDroppable = ({ folder }: { folder: typeof folders[0] }) => {
    const { setNodeRef, isOver } = useDroppable({
      id: `folder-${folder.id}`,
      data: {
        type: 'folder',
        folderId: folder.id,
      },
    });

    return (
      <Menu shadow="md" width={160} key={folder.id} trigger="click">
        <Menu.Target>
          <div
            ref={setNodeRef}
            onMouseEnter={() => setHoveredFolderId(folder.id)}
            onMouseLeave={() => setHoveredFolderId(null)}
            style={{
              backgroundColor: isOver ? 'var(--mantine-color-blue-0)' : undefined,
              borderRadius: 'var(--mantine-radius-sm)',
            }}
          >
            <NavLink
              label={
                <MantineGroup gap="xs" wrap="nowrap">
                  <Box
                    w={8}
                    h={8}
                    style={{ backgroundColor: folder.color, flexShrink: 0, borderRadius: '100%' }}
                  />
                  <Text size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {folder.name}
                  </Text>
                </MantineGroup>
              }
              leftSection={<IconFolder size={18} color={folder.color} />}
              rightSection={
                <MantineGroup gap={2} style={{ visibility: hoveredFolderId === folder.id ? 'visible' : 'hidden' }}>
                  <Tooltip label="Rename">
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      onClick={(e) => {
                        e.stopPropagation();
                        openRenameFolderModal(folder.id);
                      }}
                    >
                      <IconEdit size={12} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Delete">
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeleteFolderModal(folder.id);
                      }}
                    >
                      <IconTrashX size={12} />
                    </ActionIcon>
                  </Tooltip>
                  <Text size="xs" c="dimmed" ml={4}>
                    {getFolderCount(folder.id)}
                  </Text>
                </MantineGroup>
              }
              active={selectedFolderId === folder.id}
              onClick={() => onSelectFolder(folder.id)}
            />
          </div>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconEdit size={14} />}
            onClick={() => openRenameFolderModal(folder.id)}
          >
            Rename
          </Menu.Item>
          <Menu.Item
            leftSection={<IconTrashX size={14} />}
            color="red"
            onClick={() => openDeleteFolderModal(folder.id)}
          >
            Delete
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    );
  };

  return (
    <Stack gap={0} h="100%">
      <Box style={{ height: 280, flexShrink: 0 }}>
        <OpenTabsPanel />
      </Box>

      <Divider my="sm" />

      <InboxDroppable />
      <NavLink
        label="Starred"
        leftSection={<IconStar size={18} />}
        rightSection={
          <Text size="xs" c="dimmed">
            {starredCount}
          </Text>
        }
        active={showStarred}
        onClick={onSelectStarred}
      />
      <NavLink
        label="Trash"
        leftSection={<IconTrash size={18} />}
        rightSection={
          <Text size="xs" c="dimmed">
            {bin.length}
          </Text>
        }
        active={showBin}
        onClick={onSelectBin}
      />

      <Divider my="sm" />

      <MantineGroup justify="space-between" px="xs" mb="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          Categories
        </Text>
        <Tooltip label="New category">
          <ActionIcon
            size="xs"
            variant="subtle"
            onClick={openCreateModalAndReset}
          >
            <IconFolderPlus size={16} />
          </ActionIcon>
        </Tooltip>
      </MantineGroup>

      <ScrollArea style={{ flex: 1 }} type="scroll" scrollbarSize={4}>
        <Stack gap={0}>
          {folders.map((folder) => (
            <FolderDroppable key={folder.id} folder={folder} />
          ))}
          {folders.length === 0 && (
            <Box px="md" py="xs">
              <Text size="sm" c="dimmed">
                No categories yet
              </Text>
            </Box>
          )}
        </Stack>
      </ScrollArea>

      <Divider my="sm" />

      <MantineGroup justify="center" gap="xs" pb="xs">
        <Tooltip label="Import">
          <ActionIcon
            variant="subtle"
            size="md"
            onClick={openImportModal}
          >
            <IconUpload size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Export">
          <ActionIcon
            variant="subtle"
            size="md"
            onClick={openExportModal}
          >
            <IconDownload size={18} />
          </ActionIcon>
        </Tooltip>
      </MantineGroup>

      <ImportModal opened={importModalOpened} onClose={closeImportModal} />
      <ExportModal opened={exportModalOpened} onClose={closeExportModal} />

      <Modal
        opened={createModalOpened}
        onClose={closeCreateModal}
        title="New Category"
        size="sm"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Category name"
            placeholder="Enter category name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
            }}
            autoFocus
          />
          <div>
            <Text size="sm" fw={500} mb="xs">
              Color
            </Text>
            <MantineGroup gap="xs">
              {FOLDER_COLORS.map((color) => (
                <ActionIcon
                  key={color}
                  size="lg"
                  variant={selectedColor === color ? 'filled' : 'light'}
                  style={{ backgroundColor: selectedColor === color ? color : 'transparent', color }}
                  onClick={() => setSelectedColor(color)}
                >
                  <Box w={16} h={16} style={{ backgroundColor: color, borderRadius: '50%' }} />
                </ActionIcon>
              ))}
            </MantineGroup>
          </div>
          <MantineGroup justify="flex-end" mt="md">
            <Button variant="default" onClick={closeCreateModal}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
              leftSection={<IconFolderPlus size={16} />}
            >
              Create
            </Button>
          </MantineGroup>
        </Stack>
      </Modal>

      <Modal
        opened={renameModalOpened}
        onClose={closeRenameModal}
        title="Rename Category"
        size="sm"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Category name"
            placeholder="Enter new name"
            value={editingFolderName}
            onChange={(e) => setEditingFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameFolder();
            }}
            autoFocus
          />
          <MantineGroup justify="flex-end" mt="md">
            <Button variant="default" onClick={closeRenameModal}>
              Cancel
            </Button>
            <Button
              onClick={handleRenameFolder}
              disabled={!editingFolderName.trim()}
              leftSection={<IconEdit size={16} />}
            >
              Rename
            </Button>
          </MantineGroup>
        </Stack>
      </Modal>

      <Modal
        opened={deleteModalOpened}
        onClose={closeDeleteModal}
        title="Delete Category"
        size="sm"
        centered
      >
        <Stack gap="md">
          <Alert icon={<IconAlertTriangle size={16} />} color="yellow" variant="light">
            <Text size="sm">
              Are you sure you want to delete <strong>{getEditingFolder()?.name}</strong>?
              Sessions in this category will be moved to Inbox.
            </Text>
          </Alert>
          <MantineGroup justify="flex-end" mt="md">
            <Button variant="default" onClick={closeDeleteModal}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleDeleteFolder}
              leftSection={<IconTrashX size={16} />}
            >
              Delete
            </Button>
          </MantineGroup>
        </Stack>
      </Modal>
    </Stack>
  );
}
