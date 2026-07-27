import { useRef, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Menu,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconDots,
  IconEdit,
  IconFolderPlus,
  IconTrash,
  IconTrashX,
} from '@tabler/icons-react';
import {
  validateFolderName,
  type Folder,
  type FolderNameValidation,
} from '../../../shared/model';
import type { CategoryFilter, CategoryStripItem } from '../../core/selectors';
import { ManagerModal } from '../shell/ManagerModal';
import { MANAGER_MENU_A11Y_PROPS } from './managerMenuPolicy';
import { formatNumber } from '../../../shared/utils/formatters';

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to save category. Try again.';
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

interface CategoryManagerProps {
  workspaceId: string;
  categories: readonly CategoryStripItem[];
  folders: readonly Folder[];
  selectedCategory: CategoryFilter;
  onSelectCategory: (category: CategoryFilter) => void;
  onAddFolder: (name: string, color: string) => Promise<void>;
  onRenameFolder: (folderId: string, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onUpdateOrder: (order: CategoryFilter[]) => Promise<void>;
}

export function CategoryManager({
  workspaceId,
  categories,
  folders,
  selectedCategory,
  onSelectCategory,
  onAddFolder,
  onRenameFolder,
  onDeleteFolder,
  onUpdateOrder,
}: CategoryManagerProps) {
  const [managerOpen, setManagerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [selectedColor, setSelectedColor] = useState(FOLDER_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const lock = useRef(false);

  const resetCreate = () => {
    setManagerOpen(false);
    setNewName('');
    setSelectedColor(FOLDER_COLORS[0]);
    setError(null);
    setCreateOpen(true);
  };
  const openRename = (folderId: string) => {
    const folder = folders.find(({ id }) => id === folderId);
    if (!folder) return;
    setManagerOpen(false);
    setEditingFolderId(folder.id);
    setEditingName(folder.name);
    setError(null);
    setRenameOpen(true);
  };
  const openDelete = (folderId: string) => {
    setManagerOpen(false);
    setEditingFolderId(folderId);
    setError(null);
    setDeleteOpen(true);
  };
  const createFolder = async () => {
    const success = await runValidatedCategoryMutation(
      lock,
      () => validateFolderName(folders, workspaceId, newName),
      (value) => onAddFolder(value, selectedColor),
      setError,
      setSubmitting,
    );
    if (success) setCreateOpen(false);
  };
  const renameFolder = async () => {
    if (!editingFolderId) return;
    const success = await runValidatedCategoryMutation(
      lock,
      () => validateFolderName(folders, workspaceId, editingName, editingFolderId),
      (value) => onRenameFolder(editingFolderId, value),
      setError,
      setSubmitting,
    );
    if (success) setRenameOpen(false);
  };
  const deleteFolder = async () => {
    if (!editingFolderId) return;
    const deletedId = editingFolderId;
    const success = await runCategoryMutation(
      lock,
      () => onDeleteFolder(deletedId),
      setError,
      setSubmitting,
    );
    if (!success) return;
    setDeleteOpen(false);
    if (selectedCategory === `folder:${deletedId}`) onSelectCategory('inbox');
  };
  const moveCategory = async (categoryId: CategoryFilter, direction: -1 | 1) => {
    const order = categories.map(({ id }) => id);
    const currentIndex = order.indexOf(categoryId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= order.length) return;
    [order[currentIndex], order[targetIndex]] = [order[targetIndex], order[currentIndex]];
    await runCategoryMutation(lock, () => onUpdateOrder(order), setError, setSubmitting);
  };

  return (
    <>
      <Menu
        {...MANAGER_MENU_A11Y_PROPS}
        keepMounted
        withInitialFocusPlaceholder={false}
        portalProps={{ target: '#manager-main' }}
        opened={categoryMenuOpen}
        onChange={setCategoryMenuOpen}
        shadow="md"
        width={190}
        position="bottom-end"
      >
        <Menu.Target>
          <ActionIcon
            className="manager-category-actions"
            variant="subtle"
            aria-label="Category Options"
            aria-haspopup="menu"
            aria-expanded={categoryMenuOpen}
          >
            <IconDots size={17} aria-hidden="true" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown id="category-options-menu">
          <Menu.Item onClick={() => setManagerOpen(true)}>Manage Categories</Menu.Item>
          <Menu.Item leftSection={<IconFolderPlus size={16} aria-hidden="true" />} onClick={resetCreate}>
            Add Category
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <ManagerModal opened={managerOpen} onClose={() => !submitting && setManagerOpen(false)} title="Manage Categories" size="md" centered>
        <Stack gap="md">
          <Text size="sm" c="dimmed">Reorder categories in the top bar, or rename and remove custom categories.</Text>
          {error && <Text c="red" size="sm">{error}</Text>}
          <Stack gap="xs" className="manager-category-manager-list">
            {categories.map((item, index) => {
              const folder = item.folderId ? folders.find(({ id }) => id === item.folderId) : null;
              return (
                <Group key={item.id} className="manager-category-manager-row" gap="xs" wrap="nowrap">
                  <Box className="manager-category-manager-swatch" style={{ backgroundColor: folder?.color ?? 'var(--mantine-color-gray-5)' }} />
                  <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={600} lineClamp={1}>{item.label}</Text>
                    <Text size="xs" c="dimmed">{item.kind === 'folder' ? `${formatNumber(item.count)} sessions` : `${formatNumber(item.count)} sessions · Built-in`}</Text>
                  </Stack>
                  <Group gap={2} wrap="nowrap">
                    <Tooltip label="Move up">
                      <ActionIcon size="sm" variant="subtle" aria-label={`Move ${item.label} up`} disabled={submitting || index === 0} onClick={() => void moveCategory(item.id, -1)}>
                        <IconArrowUp size={15} aria-hidden="true" />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Move down">
                      <ActionIcon size="sm" variant="subtle" aria-label={`Move ${item.label} down`} disabled={submitting || index === categories.length - 1} onClick={() => void moveCategory(item.id, 1)}>
                        <IconArrowDown size={15} aria-hidden="true" />
                      </ActionIcon>
                    </Tooltip>
                    {item.folderId && (
                      <Tooltip label="Rename">
                        <ActionIcon size="sm" variant="subtle" aria-label={`Rename ${item.label}`} disabled={submitting} onClick={() => openRename(item.folderId!)}>
                          <IconEdit size={15} aria-hidden="true" />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    {item.folderId && (
                      <Tooltip label="Delete">
                        <ActionIcon size="sm" color="red" variant="subtle" aria-label={`Delete ${item.label}`} disabled={submitting} onClick={() => openDelete(item.folderId!)}>
                          <IconTrash size={15} aria-hidden="true" />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Group>
              );
            })}
          </Stack>
          <Group justify="space-between">
            <Button variant="light" leftSection={<IconFolderPlus size={16} aria-hidden="true" />} disabled={submitting} onClick={resetCreate}>Add Category</Button>
            <Button variant="default" disabled={submitting} onClick={() => setManagerOpen(false)}>Done</Button>
          </Group>
        </Stack>
      </ManagerModal>

      <ManagerModal opened={createOpen} onClose={() => !submitting && setCreateOpen(false)} title="New Category" size="sm" centered>
        <Stack gap="md">
          <TextInput name="category-name" autoComplete="off" label="Category name" placeholder="Enter category name…" value={newName} onChange={(event) => setNewName(event.currentTarget.value)} onKeyDown={(event) => event.key === 'Enter' && void createFolder()} error={error} disabled={submitting} data-autofocus />
          <Group gap="xs" aria-label="Category color">
            {FOLDER_COLORS.map((color) => (
              <ActionIcon key={color} size="lg" variant={selectedColor === color ? 'filled' : 'light'} aria-label={`Use color ${color}`} aria-pressed={selectedColor === color} disabled={submitting} style={{ backgroundColor: selectedColor === color ? color : 'transparent', color }} onClick={() => setSelectedColor(color)}>
                <Box w={16} h={16} aria-hidden="true" style={{ backgroundColor: color, borderRadius: '50%' }} />
              </ActionIcon>
            ))}
          </Group>
          <Group justify="flex-end">
            <Button variant="default" disabled={submitting} onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={submitting} aria-label={submitting ? 'Creating Category…' : 'Create Category'} onClick={() => void createFolder()} leftSection={<IconFolderPlus size={16} aria-hidden="true" />}>{submitting ? 'Creating Category…' : 'Create Category'}</Button>
          </Group>
        </Stack>
      </ManagerModal>

      <ManagerModal opened={renameOpen} onClose={() => !submitting && setRenameOpen(false)} title="Rename Category" size="sm" centered>
        <Stack gap="md">
          <TextInput name="category-name" autoComplete="off" label="Category name" placeholder="Enter category name…" value={editingName} onChange={(event) => setEditingName(event.currentTarget.value)} onKeyDown={(event) => event.key === 'Enter' && void renameFolder()} error={error} disabled={submitting} data-autofocus />
          <Group justify="flex-end">
            <Button variant="default" disabled={submitting} onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button loading={submitting} aria-label={submitting ? 'Renaming Category…' : 'Rename Category'} onClick={() => void renameFolder()} leftSection={<IconEdit size={16} aria-hidden="true" />}>{submitting ? 'Renaming Category…' : 'Rename Category'}</Button>
          </Group>
        </Stack>
      </ManagerModal>

      <ManagerModal opened={deleteOpen} onClose={() => !submitting && setDeleteOpen(false)} title="Delete Category" size="sm" centered>
        <Stack gap="md">
          <Text>Delete <strong>{folders.find(({ id }) => id === editingFolderId)?.name}</strong>? Sessions move to Inbox.</Text>
          {error && <Text c="red" size="sm">{error}</Text>}
          <Group justify="flex-end">
            <Button variant="default" disabled={submitting} onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button color="red" loading={submitting} aria-label={submitting ? 'Deleting Category…' : 'Delete Category'} onClick={() => void deleteFolder()} leftSection={<IconTrashX size={16} aria-hidden="true" />}>{submitting ? 'Deleting Category…' : 'Delete Category'}</Button>
          </Group>
        </Stack>
      </ManagerModal>
    </>
  );
}
