import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Group as MantineGroup,
  Menu,
  Modal,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconDots,
  IconDownload,
  IconEdit,
  IconFolderPlus,
  IconLayoutGrid,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrash,
  IconTrashX,
  IconUpload,
} from '@tabler/icons-react';
import { useShallow } from 'zustand/react/shallow';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { getCategoryStrip, type CategoryFilter, type CategoryStripItem } from '../../core/selectors';
import type { DndData, DragMarker } from '../../core/dnd';
import { useSearchQuery } from '../../hooks/useFilteredGroups';
import { SearchBar } from '../search/SearchBar';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import { validateFolderName, type FolderNameValidation } from '../../../shared/model';
import { useManagerOverlayController } from '../../hooks/useManagerOverlays';

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

export const SEARCH_INPUT_ID = 'manager-search-input';

export interface WorkspaceHeaderProps {
  selectedCategory: CategoryFilter;
  showBin: boolean;
  dragMarker?: DragMarker | null;
  onSelectCategory: (category: CategoryFilter) => void;
  onToggleBin: () => void;
  onOpenImport: () => void;
  onOpenExport: () => void;
}

export function getInitialSearchExpanded(query: string): boolean {
  return Boolean(query);
}

export function collapseSearchState(query: string): { query: string; isExpanded: false } {
  return { query, isExpanded: false };
}

export function shouldExpandSearchShortcut(target: EventTarget | null): boolean {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null;
  const tagName = element?.tagName?.toLowerCase() ?? '';
  return !element?.isContentEditable && !['input', 'textarea', 'select'].includes(tagName);
}

export function isCategoryDragMarkerFor(
  marker: DragMarker | null | undefined,
  categoryId: string,
  placement?: 'before' | 'after',
): boolean {
  return marker?.kind === 'category-reorder'
    && marker.categoryId === categoryId
    && (placement === undefined || marker.placement === placement);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to save category.';
}

function validationMessage(reason: 'empty' | 'duplicate'): string {
  return reason === 'empty'
    ? 'Category name is required.'
    : 'A category with this name already exists in this workspace.';
}

export async function runCategoryMutation<T>(
  lock: { current: boolean },
  mutation: () => Promise<T>,
  onError: (message: string) => void,
  onBusyChange?: (busy: boolean) => void,
): Promise<boolean> {
  if (lock.current) return false;
  lock.current = true;
  onBusyChange?.(true);
  try {
    await mutation();
    return true;
  } catch (error: unknown) {
    onError(errorMessage(error));
    return false;
  } finally {
    lock.current = false;
    onBusyChange?.(false);
  }
}

export async function runValidatedCategoryMutation<T>(
  lock: { current: boolean },
  validate: () => FolderNameValidation,
  mutation: (value: string) => Promise<T>,
  onError: (message: string) => void,
  onBusyChange?: (busy: boolean) => void,
): Promise<boolean> {
  const validation = validate();
  if (!validation.ok) {
    onError(validationMessage(validation.reason));
    return false;
  }
  return runCategoryMutation(lock, () => mutation(validation.value), onError, onBusyChange);
}

interface CategoryDndItemProps {
  item: CategoryStripItem;
  workspaceId: string;
  dragMarker?: DragMarker | null;
  isActive: boolean;
  onSelect: () => void;
}

function CategoryReorderTarget({
  id,
  categoryId,
  placement,
  workspaceId,
  dragMarker,
}: {
  id: string;
  categoryId: string;
  placement: 'before' | 'after';
  workspaceId: string;
  dragMarker?: DragMarker | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: {
      type: 'category-reorder',
      dnd: {
        targets: [{ kind: 'category-reorder', categoryId, placement, workspaceId }],
      } satisfies DndData,
    },
  });
  const isCategoryMarker = isCategoryDragMarkerFor(dragMarker, categoryId, placement);
  return (
    <span
      ref={setNodeRef}
      className="manager-category-reorder-target"
      data-over={isOver || isCategoryMarker || undefined}
      data-drag-marker={isCategoryMarker ? placement : undefined}
      aria-hidden="true"
    />
  );
}

function CategoryDndItem({
  item,
  workspaceId,
  dragMarker,
  isActive,
  onSelect,
}: CategoryDndItemProps) {
  const { attributes, listeners, setNodeRef: setDragNodeRef } = useDraggable({
    id: `category-${item.id}`,
    data: {
      type: 'category',
      dnd: {
        payload: { kind: 'category', categoryId: item.id, workspaceId },
      } satisfies DndData,
    },
  });
  const { setNodeRef: setColumnNodeRef, isOver: isColumnOver } = useDroppable({
    id: `category-column-${item.id}`,
    data: {
      type: 'category-column',
      dnd: {
        targets: [{ kind: 'category-column', category: item.id, workspaceId }],
      } satisfies DndData,
    },
  });
  const isCategoryMarker = dragMarker?.kind === 'category' && dragMarker.categoryId === item.id;
  const categoryMarkerPlacement = isCategoryMarker ? dragMarker.placement : undefined;
  return (
    <div
      ref={setColumnNodeRef}
      className="manager-category-item"
      data-category-column={item.id}
      data-over={isColumnOver || isCategoryMarker || undefined}
      data-drag-marker={isCategoryMarker ? categoryMarkerPlacement : undefined}
    >
      <CategoryReorderTarget id={`category-reorder-${item.id}-before`} categoryId={item.id} placement="before" workspaceId={workspaceId} dragMarker={dragMarker} />
      <MantineGroup gap={0} wrap="nowrap">
        <Button
          ref={setDragNodeRef}
          {...attributes}
          {...listeners}
          variant={isActive ? 'light' : 'subtle'}
          color={isActive ? 'blue' : 'gray'}
          size="sm"
          data-category-id={item.id}
          data-category-trigger="label"
          aria-current={isActive ? 'page' : undefined}
          onClick={onSelect}
        >
          <Text size="sm">{item.label}</Text>
        </Button>
      </MantineGroup>
      <CategoryReorderTarget id={`category-reorder-${item.id}-after`} categoryId={item.id} placement="after" workspaceId={workspaceId} dragMarker={dragMarker} />
    </div>
  );
}

export function WorkspaceHeader({
  selectedCategory,
  showBin,
  dragMarker,
  onSelectCategory,
  onToggleBin,
  onOpenImport,
  onOpenExport,
}: WorkspaceHeaderProps) {
  const state = useTabBoardStore(
    useShallow((currentState) => ({
      activeWorkspaceId: currentState.activeWorkspaceId,
      workspaces: currentState.workspaces,
      folders: currentState.folders,
      groups: currentState.groups,
      categoryOrderByWorkspace: currentState.categoryOrderByWorkspace,
      setActiveWorkspace: currentState.setActiveWorkspace,
      addWorkspace: currentState.addWorkspace,
      renameWorkspace: currentState.renameWorkspace,
      addFolder: currentState.addFolder,
      renameFolder: currentState.renameFolder,
      deleteFolder: currentState.deleteFolder,
      updateCategoryOrder: currentState.updateCategoryOrder,
    })),
  );
  const query = useSearchQuery();
  const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId) ?? state.workspaces[0];
  const folders = state.folders.filter((folder) => folder.workspaceId === workspace?.id);
  const categories = getCategoryStrip({
    activeWorkspaceId: state.activeWorkspaceId,
    workspaces: state.workspaces,
    folders: state.folders,
    groups: state.groups,
    categoryOrderByWorkspace: state.categoryOrderByWorkspace,
  });
  const [isSearchExpanded, setIsSearchExpanded] = useState(() => getInitialSearchExpanded(query));
  const { closeOverlays } = useManagerOverlayController();
  const [categoryManagerOpened, setCategoryManagerOpened] = useState(false);
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [renameModalOpened, setRenameModalOpened] = useState(false);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [selectedColor, setSelectedColor] = useState(FOLDER_COLORS[0]);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSearchShortcut =
        event.key === '/' ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k');
      if (!isSearchShortcut || !shouldExpandSearchShortcut(event.target)) return;
      event.preventDefault();
      setIsSearchExpanded(true);
      requestAnimationFrame(() => document.getElementById(SEARCH_INPUT_ID)?.focus());
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleSearch = () => {
    if (isSearchExpanded) {
      setIsSearchExpanded(collapseSearchState(query).isExpanded);
      return;
    }
    setIsSearchExpanded(true);
    requestAnimationFrame(() => document.getElementById(SEARCH_INPUT_ID)?.focus());
  };

  const resetCreateModal = () => {
    closeOverlays();
    setCategoryManagerOpened(false);
    setNewFolderName('');
    setSelectedColor(FOLDER_COLORS[0]);
    setCategoryError(null);
    setCreateModalOpened(true);
  };

  const openRenameModal = (folderId: string) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) return;
    setCategoryManagerOpened(false);
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
    setCategoryError(null);
    setRenameModalOpened(true);
  };

  const openDeleteModal = (folderId: string) => {
    setCategoryManagerOpened(false);
    setEditingFolderId(folderId);
    setCategoryError(null);
    setDeleteModalOpened(true);
  };

  const handleCreateFolder = async () => {
    if (!workspace) return;
    const succeeded = await runValidatedCategoryMutation(
      isSubmittingRef,
      () => validateFolderName(state.folders, workspace.id, newFolderName),
      (value) => state.addFolder(workspace.id, value, selectedColor),
      setCategoryError,
      setIsSubmitting,
    );
    if (!succeeded) return;
    setNewFolderName('');
    setCategoryError(null);
    setCreateModalOpened(false);
  };

  const handleRenameFolder = async () => {
    if (!editingFolderId) return;
    const folder = state.folders.find((item) => item.id === editingFolderId);
    if (!folder) return;
    const succeeded = await runValidatedCategoryMutation(
      isSubmittingRef,
      () => validateFolderName(state.folders, folder.workspaceId, editingFolderName, folder.id),
      (value) => state.renameFolder(folder.id, value),
      setCategoryError,
      setIsSubmitting,
    );
    if (!succeeded) return;
    setEditingFolderId(null);
    setEditingFolderName('');
    setCategoryError(null);
    setRenameModalOpened(false);
  };

  const handleDeleteFolder = async () => {
    if (!editingFolderId) return;
    closeOverlays();
    const deletedId = editingFolderId;
    const succeeded = await runCategoryMutation(
      isSubmittingRef,
      () => state.deleteFolder(deletedId),
      setCategoryError,
      setIsSubmitting,
    );
    if (!succeeded) return;
    setEditingFolderId(null);
    setCategoryError(null);
    setDeleteModalOpened(false);
    if (selectedCategory === `folder:${deletedId}`) onSelectCategory('inbox');
  };

  const handleMoveCategory = async (categoryId: CategoryFilter, direction: -1 | 1) => {
    if (!workspace) return;
    const order = categories.map((item) => item.id);
    const currentIndex = order.indexOf(categoryId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= order.length) return;
    [order[currentIndex], order[targetIndex]] = [order[targetIndex], order[currentIndex]];
    await runCategoryMutation(
      isSubmittingRef,
      () => state.updateCategoryOrder(workspace.id, order),
      setCategoryError,
      setIsSubmitting,
    );
  };

  const handleAddWorkspace = () => {
    closeOverlays();
    const name = window.prompt('Workspace name');
    if (name?.trim()) {
      state.addWorkspace(name.trim());
      onSelectCategory('inbox');
    }
  };

  const handleRenameWorkspace = () => {
    if (!workspace) return;
    closeOverlays();
    const name = window.prompt('Workspace name', workspace.name);
    if (name?.trim()) state.renameWorkspace(workspace.id, name.trim());
  };

  return (
    <MantineGroup className={`workspace-header${isSearchExpanded ? ' workspace-header--search-expanded' : ''}`} gap={0} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
      <div className="manager-workspace-switcher">
        <Menu shadow="md" width={250}>
          <Menu.Target>
            <Tooltip label={workspace?.name ?? 'Workspace'}>
              <Button
                className="manager-workspace-trigger"
                variant="subtle"
                size="sm"
                aria-label={`Workspace: ${workspace?.name ?? 'Workspace'}`}
              >
                <IconLayoutGrid size={18} />
                <IconChevronDown size={14} />
              </Button>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Stack gap={2} px={4} className="manager-workspace-list">
              {state.workspaces.map((item) => {
                const isCurrent = item.id === workspace?.id;
                return (
                  <MantineGroup key={item.id} className={`manager-workspace-row${isCurrent ? ' manager-workspace-row--current' : ''}`} gap={2} wrap="nowrap">
                    <Button
                      className="manager-workspace-row-trigger"
                      variant="subtle"
                      color="gray"
                      size="sm"
                      justify="flex-start"
                      onClick={() => {
                        closeOverlays();
                        state.setActiveWorkspace(item.id);
                        onSelectCategory('inbox');
                      }}
                    >
                      <Text size="sm" lineClamp={1}>{item.name}</Text>
                    </Button>
                    {isCurrent && (
                      <>
                        <Tooltip label="Rename workspace" openDelay={1000}>
                          <ActionIcon className="manager-workspace-rename" variant="subtle" aria-label="Rename workspace" onClick={handleRenameWorkspace}>
                            <IconEdit size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Current workspace" openDelay={1000}>
                          <span className="manager-workspace-current-icon" aria-label="Current workspace">
                            <IconCheck size={16} />
                          </span>
                        </Tooltip>
                      </>
                    )}
                  </MantineGroup>
                );
              })}
            </Stack>
            <Menu.Divider />
            <Menu.Item className="manager-workspace-create" rightSection={<IconPlus size={16} />} onClick={handleAddWorkspace}>
              New workspace
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>

      <div className="manager-category-strip">
        <nav className="manager-category-nav" aria-label="Categories">
          <MantineGroup gap={2} wrap="nowrap">
            {categories.map((item) => {
              const isActive = !showBin && selectedCategory === item.id;
              return (
                <CategoryDndItem
                  key={item.id}
                  item={item}
                  workspaceId={state.activeWorkspaceId}
                  dragMarker={dragMarker}
                  isActive={isActive}
                  onSelect={() => {
                    closeOverlays();
                    onSelectCategory(item.id);
                  }}
                />
              );
            })}
          </MantineGroup>
        </nav>

        <Menu shadow="md" width={190} position="bottom-end">
          <Menu.Target>
            <ActionIcon className="manager-category-actions" variant="subtle" aria-label="Category options">
              <IconDots size={17} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => setCategoryManagerOpened(true)}>Manage categories</Menu.Item>
            <Menu.Item leftSection={<IconFolderPlus size={16} />} onClick={resetCreateModal}>Add category</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>

      <MantineGroup className={`manager-search-slot${isSearchExpanded ? ' manager-search-slot--expanded' : ''}`} gap={4} justify={isSearchExpanded ? 'flex-start' : 'center'} ml="auto">
        <Tooltip label={isSearchExpanded ? 'Hide search' : 'Show search'}>
          <ActionIcon
            className="manager-search-toggle"
            variant={isSearchExpanded ? 'light' : 'subtle'}
            aria-label={isSearchExpanded ? 'Hide search' : 'Show search'}
            aria-controls={SEARCH_INPUT_ID}
            aria-expanded={isSearchExpanded}
            onClick={toggleSearch}
          >
            <IconSearch size={20} />
          </ActionIcon>
        </Tooltip>
        <div className={isSearchExpanded ? undefined : 'manager-search-input-collapsed'}>
          <SearchBar
            inputId={SEARCH_INPUT_ID}
            autoFocus={isSearchExpanded}
            category={showBin ? 'inbox' : selectedCategory}
            fullWidth={isSearchExpanded}
            onEscape={() => setIsSearchExpanded(false)}
          />
        </div>
      </MantineGroup>

      <MantineGroup className="manager-header-actions" gap={2} ml="sm" wrap="nowrap">
        <Tooltip label="Import">
          <ActionIcon className="manager-header-action--compact-hidden" variant="subtle" aria-label="Import" onClick={onOpenImport}>
            <IconDownload size={20} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Export">
          <ActionIcon className="manager-header-action--compact-hidden" variant="subtle" aria-label="Export" onClick={onOpenExport}>
            <IconUpload size={20} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Trash">
          <ActionIcon className="manager-header-action--compact-hidden" aria-label="Trash" variant="subtle" onClick={onToggleBin} color={showBin ? 'blue' : 'gray'}>
            <IconTrash size={20} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Options">
          <ActionIcon aria-label="Options" variant="subtle" component="a" href="options.html">
            <IconSettings size={20} />
          </ActionIcon>
        </Tooltip>
      </MantineGroup>

      <Modal
        opened={categoryManagerOpened}
        onClose={() => {
          if (!isSubmitting) setCategoryManagerOpened(false);
        }}
        title="Manage categories"
        size="md"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">Reorder categories in the top bar, or rename and remove custom categories.</Text>
          {categoryError && <Text c="red" size="sm">{categoryError}</Text>}
          <Stack gap="xs" className="manager-category-manager-list">
            {categories.map((item, index) => {
              const folder = item.folderId ? folders.find((candidate) => candidate.id === item.folderId) : null;
              return (
                <MantineGroup key={item.id} className="manager-category-manager-row" gap="xs" wrap="nowrap">
                  <Box
                    className="manager-category-manager-swatch"
                    style={{ backgroundColor: folder?.color ?? 'var(--mantine-color-gray-5)' }}
                  />
                  <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={600} lineClamp={1}>{item.label}</Text>
                    <Text size="xs" c="dimmed">{item.kind === 'folder' ? `${item.count} sessions` : `${item.count} sessions · Built-in`}</Text>
                  </Stack>
                  <MantineGroup gap={2} wrap="nowrap">
                    <Tooltip label="Move up">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        aria-label={`Move ${item.label} up`}
                        disabled={isSubmitting || index === 0}
                        onClick={() => void handleMoveCategory(item.id, -1)}
                      >
                        <IconArrowUp size={15} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Move down">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        aria-label={`Move ${item.label} down`}
                        disabled={isSubmitting || index === categories.length - 1}
                        onClick={() => void handleMoveCategory(item.id, 1)}
                      >
                        <IconArrowDown size={15} />
                      </ActionIcon>
                    </Tooltip>
                    {item.folderId && (
                      <Tooltip label="Rename">
                        <ActionIcon size="sm" variant="subtle" aria-label={`Rename ${item.label}`} disabled={isSubmitting} onClick={() => openRenameModal(item.folderId!)}>
                          <IconEdit size={15} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    {item.folderId && (
                      <Tooltip label="Delete">
                        <ActionIcon size="sm" color="red" variant="subtle" aria-label={`Delete ${item.label}`} disabled={isSubmitting} onClick={() => openDeleteModal(item.folderId!)}>
                          <IconTrash size={15} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </MantineGroup>
                </MantineGroup>
              );
            })}
          </Stack>
          <MantineGroup justify="space-between">
            <Button variant="light" leftSection={<IconFolderPlus size={16} />} disabled={isSubmitting} onClick={resetCreateModal}>Add category</Button>
            <Button variant="default" disabled={isSubmitting} onClick={() => setCategoryManagerOpened(false)}>Done</Button>
          </MantineGroup>
        </Stack>
      </Modal>

      <Modal
        opened={createModalOpened}
        onClose={() => {
          if (!isSubmitting) setCreateModalOpened(false);
        }}
        title="New Category"
        size="sm"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Category name"
            placeholder="Enter category name"
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleCreateFolder();
            }}
            error={categoryError}
            disabled={isSubmitting}
            autoFocus
          />
          <MantineGroup gap="xs">
            {FOLDER_COLORS.map((color) => (
              <ActionIcon
                key={color}
                size="lg"
                variant={selectedColor === color ? 'filled' : 'light'}
                aria-label={`Use color ${color}`}
                aria-pressed={selectedColor === color}
                disabled={isSubmitting}
                style={{ backgroundColor: selectedColor === color ? color : 'transparent', color }}
                onClick={() => setSelectedColor(color)}
              >
                <Box w={16} h={16} style={{ backgroundColor: color, borderRadius: '50%' }} />
              </ActionIcon>
            ))}
          </MantineGroup>
          <MantineGroup justify="flex-end">
            <Button variant="default" disabled={isSubmitting} onClick={() => setCreateModalOpened(false)}>Cancel</Button>
            <Button disabled={isSubmitting} onClick={() => void handleCreateFolder()} leftSection={<IconFolderPlus size={16} />}>
              Create
            </Button>
          </MantineGroup>
        </Stack>
      </Modal>

      <Modal
        opened={renameModalOpened}
        onClose={() => {
          if (!isSubmitting) setRenameModalOpened(false);
        }}
        title="Rename Category"
        size="sm"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Category name"
            placeholder="Enter new name"
            value={editingFolderName}
            onChange={(event) => setEditingFolderName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleRenameFolder();
            }}
            error={categoryError}
            disabled={isSubmitting}
            autoFocus
          />
          <MantineGroup justify="flex-end">
            <Button variant="default" disabled={isSubmitting} onClick={() => setRenameModalOpened(false)}>Cancel</Button>
            <Button disabled={isSubmitting} onClick={() => void handleRenameFolder()} leftSection={<IconEdit size={16} />}>
              Rename
            </Button>
          </MantineGroup>
        </Stack>
      </Modal>

      <Modal
        opened={deleteModalOpened}
        onClose={() => {
          if (!isSubmitting) setDeleteModalOpened(false);
        }}
        title="Delete Category"
        size="sm"
        centered
      >
        <Stack gap="md">
          <Text>
            Delete <strong>{state.folders.find((folder) => folder.id === editingFolderId)?.name}</strong>? Sessions move to Inbox.
          </Text>
          {categoryError && <Text c="red" size="sm">{categoryError}</Text>}
          <MantineGroup justify="flex-end">
            <Button
              variant="default"
              disabled={isSubmitting}
              onClick={() => setDeleteModalOpened(false)}
            >
              Cancel
            </Button>
            <Button color="red" disabled={isSubmitting} onClick={() => void handleDeleteFolder()} leftSection={<IconTrashX size={16} />}>
              Delete
            </Button>
          </MantineGroup>
        </Stack>
      </Modal>
    </MantineGroup>
  );
}
