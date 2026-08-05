import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type FocusEvent as ReactFocusEvent,
  type RefObject,
} from 'react';
import {
  Box,
  Button,
  Group,
  Menu,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import {
  ArrowDown,
  ArrowUp,
  Menu as MenuIcon,
  Pencil,
  Plus,
  Settings2,
  Trash,
} from 'lucide-react';
import {
  CATEGORY_COLOR_PALETTE,
  categoryColorCssValue,
  isLegacyCategoryColor,
  validateFolderName,
  type Folder,
  type FolderNameValidation,
  type Group as TabBoardGroup,
} from '../../../shared/model';
import type { CategoryFilter, CategoryStripItem } from '../../core/selectors';
import { AccessibleIconAction } from '../../../shared/components/AccessibleIconAction';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { TabBoardIcon } from '../../../shared/components/TabBoardIcon';
import { ManagerModal } from '../shell/ManagerModal';
import { ManagerMenuDescriptionTarget } from '../../hooks/useManagerOverlays';
import {
  MANAGER_DENSE_MENU_PROPS,
  useManagerMenuOpening,
} from './managerMenuPolicy';
import { formatNumber } from '../../../shared/utils/formatters';

const CATEGORY_DRAG_MIME = 'application/x-tabboard-category';

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

function moveCategoryToIndex(
  categories: readonly CategoryStripItem[],
  categoryId: CategoryFilter,
  targetIndex: number,
): CategoryFilter[] | null {
  const currentIndex = categories.findIndex(({ id }) => id === categoryId);
  if (
    currentIndex < 0
    || targetIndex < 0
    || targetIndex >= categories.length
    || currentIndex === targetIndex
  ) {
    return null;
  }
  const order = categories.map(({ id }) => id);
  const [moved] = order.splice(currentIndex, 1);
  order.splice(targetIndex, 0, moved);
  return order;
}

function moveCategoryToDrop(
  categories: readonly CategoryStripItem[],
  draggedCategoryId: CategoryFilter,
  targetCategoryId: CategoryFilter,
  placement: 'before' | 'after',
): CategoryFilter[] | null {
  if (draggedCategoryId === targetCategoryId) return null;
  const order = categories
    .map(({ id }) => id)
    .filter((id) => id !== draggedCategoryId);
  const targetIndex = order.indexOf(targetCategoryId);
  if (targetIndex < 0) return null;
  order.splice(
    targetIndex + (placement === 'after' ? 1 : 0),
    0,
    draggedCategoryId,
  );
  const current = categories.map(({ id }) => id);
  return order.every((id, index) => id === current[index]) ? null : order;
}

function countLabel(
  count: number,
  singular = 'Session',
  plural = 'Sessions',
): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

function restoreFinalFocus(finalFocusRef?: RefObject<HTMLElement>): void {
  window.setTimeout(() => finalFocusRef?.current?.focus(), 0);
}

interface CategoryManagerProps {
  workspaceId: string;
  confirmBeforeDestructive: boolean;
  categories: readonly CategoryStripItem[];
  folders: readonly Folder[];
  groups: readonly TabBoardGroup[];
  selectedCategory: CategoryFilter;
  onSelectCategory: (category: CategoryFilter) => void;
  onAddFolder: (name: string, color: string) => Promise<void>;
  onUpdateFolder: (
    folderId: string,
    updates: { name: string; color: string },
    expected: { name: string; color: string },
  ) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onUpdateOrder: (
    order: CategoryFilter[],
    options: { expectedCategoryOrder: CategoryFilter[] },
  ) => Promise<void>;
}

export function CategoryManager({
  workspaceId,
  confirmBeforeDestructive,
  categories,
  folders,
  groups,
  selectedCategory,
  onSelectCategory,
  onAddFolder,
  onUpdateFolder,
  onDeleteFolder,
  onUpdateOrder,
}: CategoryManagerProps) {
  const [managerOpen, setManagerOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editorExiting, setEditorExiting] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderExpected, setEditingFolderExpected] = useState<{
    name: string;
    color: string;
  } | null>(null);
  const [editorName, setEditorName] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>(
    CATEGORY_COLOR_PALETTE[0],
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [focusedRowId, setFocusedRowId] = useState<CategoryFilter | null>(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState<CategoryFilter | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const lock = useRef(false);
  const managerContentRef = useRef<HTMLDivElement | null>(null);
  const categoryOptionsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const editorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreEditorFocusRef = useRef(false);
  const deletingFolder = folders.find(({ id }) => id === deletingFolderId);
  const nestedModalOpen = Boolean(
    (managerOpen && (editorMode !== null || editorExiting)) || deletingFolder,
  );

  useEffect(() => {
    const dialog = managerContentRef.current?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog || !nestedModalOpen) return undefined;
    dialog.setAttribute('inert', '');
    dialog.setAttribute('aria-hidden', 'true');
    return () => {
      dialog.removeAttribute('inert');
      dialog.removeAttribute('aria-hidden');
    };
  }, [nestedModalOpen]);

  useEffect(() => {
    if (nestedModalOpen || !restoreEditorFocusRef.current) return undefined;
    restoreEditorFocusRef.current = false;
    const timeout = window.setTimeout(() => {
      editorTriggerRef.current?.focus();
      editorTriggerRef.current?.removeAttribute('data-autofocus');
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [nestedModalOpen]);

  const openCreate = (trigger: HTMLButtonElement) => {
    editorTriggerRef.current = trigger;
    setEditingFolderId(null);
    setEditingFolderExpected(null);
    setEditorName('');
    setSelectedColor(CATEGORY_COLOR_PALETTE[0]);
    setError(null);
    setEditorExiting(false);
    setEditorMode('create');
  };
  const openEdit = (folderId: string, trigger: HTMLButtonElement) => {
    const folder = folders.find(({ id }) => id === folderId);
    if (!folder) return;
    editorTriggerRef.current = trigger;
    setEditingFolderId(folder.id);
    setEditingFolderExpected({ name: folder.name, color: folder.color });
    setEditorName(folder.name);
    setSelectedColor(folder.color);
    setError(null);
    setEditorExiting(false);
    setEditorMode('edit');
  };
  const closeEditor = () => {
    if (submitting) return;
    if (managerOpen) {
      restoreEditorFocusRef.current = true;
      setEditorExiting(true);
    }
    setEditorMode(null);
    setError(null);
  };
  const submitEditor = async () => {
    if (!editorMode) return;
    const success = await runValidatedCategoryMutation(
      lock,
      () => validateFolderName(
        folders,
        workspaceId,
        editorName,
        editorMode === 'edit' ? editingFolderId ?? undefined : undefined,
      ),
      (value) => editorMode === 'edit'
        && editingFolderId
        && editingFolderExpected
        ? onUpdateFolder(
            editingFolderId,
            { name: value, color: selectedColor },
            editingFolderExpected,
          )
        : onAddFolder(value, selectedColor),
      setError,
      setSubmitting,
    );
    if (success) {
      if (managerOpen) {
        restoreEditorFocusRef.current = true;
        setEditorExiting(true);
      }
      setEditorMode(null);
    }
  };
  const publishOrder = async (order: CategoryFilter[] | null) => {
    if (!order) return;
    const expectedCategoryOrder = categories.map(({ id }) => id);
    await runCategoryMutation(
      lock,
      () => onUpdateOrder(
        [...order],
        { expectedCategoryOrder: [...expectedCategoryOrder] },
      ),
      setError,
      setSubmitting,
    );
  };
  const moveCategory = (categoryId: CategoryFilter, direction: -1 | 1) => {
    const currentIndex = categories.findIndex(({ id }) => id === categoryId);
    void publishOrder(moveCategoryToIndex(
      categories,
      categoryId,
      currentIndex + direction,
    ));
  };
  const handleDrop = (
    event: ReactDragEvent<HTMLElement>,
    targetCategoryId: CategoryFilter,
  ) => {
    event.preventDefault();
    const draggedId = (
      event.dataTransfer.getData(CATEGORY_DRAG_MIME)
      || draggedCategoryId
    ) as CategoryFilter;
    if (!draggedId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = rect.height > 0
      && event.clientY < rect.top + rect.height / 2
      ? 'before'
      : 'after';
    void publishOrder(moveCategoryToDrop(
      categories,
      draggedId,
      targetCategoryId,
      placement,
    ));
    setDraggedCategoryId(null);
  };
  const handleRowBlur = (
    event: ReactFocusEvent<HTMLElement>,
    categoryId: CategoryFilter,
  ) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setFocusedRowId((current) => current === categoryId ? null : current);
    }
  };
  const performDelete = async (folderId: string) => {
    if (submitting) return;
    const success = await runCategoryMutation(
      lock,
      () => onDeleteFolder(folderId),
      setDeleteError,
      setSubmitting,
    );
    if (!success) return;
    setDeletingFolderId(null);
    setDeleteError(null);
    if (selectedCategory === `folder:${folderId}`) onSelectCategory('inbox');
  };
  const requestDelete = (folderId: string) => {
    setDeleteError(null);
    if (confirmBeforeDestructive) {
      setDeletingFolderId(folderId);
      return;
    }
    void performDelete(folderId);
  };
  const validation = editorMode
    ? validateFolderName(
        folders,
        workspaceId,
        editorName,
        editorMode === 'edit' ? editingFolderId ?? undefined : undefined,
      )
    : null;
  const editorError = error
    ?? (validation && !validation.ok ? validationMessage(validation.reason) : null);
  const affectedGroups = deletingFolder
    ? groups.filter((group) =>
        group.workspaceId === workspaceId
        && group.folderId === deletingFolder.id)
    : [];
  const deleteMessage = deletingFolder
    ? [
        `Delete ${deletingFolder.name}?`,
        `${countLabel(affectedGroups.length)} will move to Inbox.`,
        deleteError,
      ].filter(Boolean).join(' ')
    : '';
  const menuOpening = useManagerMenuOpening('category-options-menu');

  return (
    <>
      <Menu
        {...MANAGER_DENSE_MENU_PROPS}
        keepMounted
        withInitialFocusPlaceholder={false}
        portalProps={{ target: '#manager-main' }}
        opened={categoryMenuOpen}
        onChange={setCategoryMenuOpen}
        onOpen={menuOpening.onMenuOpen}
        shadow="md"
        position="bottom-end"
      >
        <Menu.Target>
          <AccessibleIconAction
            ref={categoryOptionsTriggerRef}
            className="manager-category-actions"
            label="Category Options"
            variant="subtle"
            aria-haspopup="menu"
            aria-expanded={categoryMenuOpen}
            onPointerDown={menuOpening.onTriggerPointerDown}
            onKeyDown={menuOpening.onTriggerKeyDown}
          >
            <TabBoardIcon icon={MenuIcon} />
          </AccessibleIconAction>
        </Menu.Target>
        <Menu.Dropdown id="category-options-menu">
          <ManagerMenuDescriptionTarget description="Rename, reorder, or remove Categories">
            {(descriptionTargetProps) => (
              <Menu.Item
                {...descriptionTargetProps}
                leftSection={<TabBoardIcon icon={Settings2} size="menu" />}
                onClick={() => {
                  setCategoryMenuOpen(false);
                  setManagerOpen(true);
                }}
              >
                Manage Categories
              </Menu.Item>
            )}
          </ManagerMenuDescriptionTarget>
          <ManagerMenuDescriptionTarget description="Create a custom Category">
            {(descriptionTargetProps) => (
              <Menu.Item
                {...descriptionTargetProps}
                leftSection={<TabBoardIcon icon={Plus} size="menu" />}
                onClick={() => {
                  setCategoryMenuOpen(false);
                  const trigger = categoryOptionsTriggerRef.current;
                  if (trigger) openCreate(trigger);
                }}
              >
                Add Category
              </Menu.Item>
            )}
          </ManagerMenuDescriptionTarget>
        </Menu.Dropdown>
      </Menu>

      <ManagerModal
        opened={managerOpen}
        onClose={() => {
          if (submitting || nestedModalOpen) return;
          setManagerOpen(false);
          restoreFinalFocus(categoryOptionsTriggerRef);
        }}
        title="Manage Categories"
        size="md"
        centered
        trapFocus={!nestedModalOpen}
        closeOnClickOutside={!nestedModalOpen}
        closeOnEscape={!nestedModalOpen}
        returnFocus={false}
        headerSubtitle={`${countLabel(categories.length, 'Category', 'Categories')} · drag to reorder`}
        headerAction={(
          <Button
            variant="default"
            disabled={submitting}
            onClick={(event) => openCreate(event.currentTarget)}
          >
            Add Category
          </Button>
        )}
      >
        <div ref={managerContentRef}>
          <Stack gap="xs" className="manager-category-manager-list">
            {categories.map((item, index) => {
              const folder = item.folderId ? folders.find(({ id }) => id === item.folderId) : null;
              const locked = folder
                ? groups.some((group) =>
                    group.workspaceId === workspaceId
                    && group.folderId === folder.id
                    && group.locked)
                : false;
              const actionsAvailable = focusedRowId === item.id;
              return (
                <div
                  key={item.id}
                  className={[
                    'manager-category-manager-row',
                    item.id === selectedCategory
                      ? 'manager-category-manager-row--active'
                      : '',
                    draggedCategoryId === item.id
                      ? 'manager-category-manager-row--dragging'
                      : '',
                  ].filter(Boolean).join(' ')}
                  data-category-manager-id={item.id}
                  data-actions-visible={actionsAvailable || undefined}
                  draggable={!nestedModalOpen}
                  role="group"
                  tabIndex={0}
                  aria-label={`${item.label} Category`}
                  onFocus={() => setFocusedRowId(item.id)}
                  onBlur={(event) => handleRowBlur(event, item.id)}
                  onDragStart={(event) => {
                    setDraggedCategoryId(item.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData(CATEGORY_DRAG_MIME, item.id);
                  }}
                  onDragEnd={() => setDraggedCategoryId(null)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => handleDrop(event, item.id)}
                >
                  <Box
                    className="manager-category-manager-swatch"
                    style={{
                      backgroundColor: folder
                        ? categoryColorCssValue(folder.color)
                        : 'var(--mantine-color-gray-5)',
                    }}
                  />
                  <Stack
                    className="manager-category-manager-row__summary"
                    gap={0}
                  >
                    <Text
                      className="manager-category-manager-row__name"
                      size="sm"
                      fw={600}
                      lineClamp={1}
                    >
                      {item.label}
                    </Text>
                    <Text
                      className="manager-category-manager-row__meta"
                      component="span"
                      size="xs"
                      c="dimmed"
                    >
                      {countLabel(item.count)}
                      {item.kind === 'folder' ? ' · Custom' : ' · Built-in'}
                    </Text>
                  </Stack>
                  <Group
                    className="manager-category-manager-row__actions"
                    gap={2}
                    wrap="nowrap"
                  >
                    <AccessibleIconAction
                      className="manager-category-manager-row__action"
                      label={`Move ${item.label} up`}
                      variant="subtle"
                      disabled={submitting || index === 0}
                      tabIndex={actionsAvailable ? 0 : -1}
                      onClick={() => moveCategory(item.id, -1)}
                    >
                      <TabBoardIcon icon={ArrowUp} />
                    </AccessibleIconAction>
                    <AccessibleIconAction
                      className="manager-category-manager-row__action"
                      label={`Move ${item.label} down`}
                      variant="subtle"
                      disabled={submitting || index === categories.length - 1}
                      tabIndex={actionsAvailable ? 0 : -1}
                      onClick={() => moveCategory(item.id, 1)}
                    >
                      <TabBoardIcon icon={ArrowDown} />
                    </AccessibleIconAction>
                    {item.folderId && (
                      <AccessibleIconAction
                        className="manager-category-manager-row__action"
                        label={`Edit ${item.label}`}
                        variant="subtle"
                        disabled={submitting}
                        tabIndex={actionsAvailable ? 0 : -1}
                        onClick={(event) => openEdit(
                          item.folderId!,
                          event.currentTarget,
                        )}
                      >
                        <TabBoardIcon icon={Pencil} />
                      </AccessibleIconAction>
                    )}
                    {item.folderId && (
                      <AccessibleIconAction
                        className="manager-category-manager-row__action"
                        label={`Delete ${item.label}`}
                        tooltip={locked
                          ? 'Unlock every Session before deleting this Category'
                          : `Delete ${item.label}`}
                        aria-description={locked
                          ? 'Unlock every Session before deleting this Category'
                          : undefined}
                        variant="subtle"
                        danger
                        disabled={submitting || locked}
                        tabIndex={actionsAvailable ? 0 : -1}
                        onClick={(event) => {
                          deleteTriggerRef.current = event.currentTarget;
                          requestDelete(item.folderId!);
                        }}
                      >
                        <TabBoardIcon icon={Trash} />
                      </AccessibleIconAction>
                    )}
                  </Group>
                </div>
              );
            })}
          </Stack>
          {error ? <Text c="red" size="sm">{error}</Text> : null}
          {deleteError && !deletingFolder ? (
            <Text c="red" size="sm" role="alert">{deleteError}</Text>
          ) : null}
          <Group
            className="manager-management-footer"
            justify="flex-end"
            mt="sm"
          >
            <Button
              variant="default"
              disabled={submitting}
              onClick={() => {
                setManagerOpen(false);
                restoreFinalFocus(categoryOptionsTriggerRef);
              }}
            >
              Done
            </Button>
          </Group>
        </div>
      </ManagerModal>

      <ManagerModal
        opened={editorMode !== null}
        onClose={closeEditor}
        title={editorMode === 'edit' ? 'Edit Category' : 'New Category'}
        size="sm"
        centered
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
        returnFocus={false}
        onExitTransitionEnd={() => {
          if (managerOpen) {
            const trigger = editorTriggerRef.current;
            trigger?.setAttribute('data-autofocus', 'true');
            const row = trigger?.closest<HTMLElement>('[data-category-manager-id]');
            setFocusedRowId(
              row?.dataset.categoryManagerId as CategoryFilter | undefined ?? null,
            );
            setEditorExiting(false);
          } else {
            editorTriggerRef.current?.focus();
          }
        }}
      >
        <Stack gap="md">
          <TextInput
            name="category-name"
            autoComplete="off"
            label="Category name"
            placeholder="Enter category name…"
            value={editorName}
            onChange={(event) => {
              setEditorName(event.currentTarget.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submitEditor();
            }}
            error={editorError}
            disabled={submitting}
            data-autofocus
          />
          <div
            className="category-editor-color-grid"
            role="group"
            aria-label="Category color"
          >
            {isLegacyCategoryColor(selectedColor) ? (
              <UnstyledButton
                className="category-editor-color-option"
                type="button"
                aria-label={`Keep Legacy Color ${selectedColor}`}
                aria-pressed="true"
                disabled={submitting}
                onClick={() => setSelectedColor(selectedColor)}
              >
                <span
                  className="category-editor-color-swatch"
                  data-category-color={selectedColor}
                  aria-hidden="true"
                  style={{
                    backgroundColor: categoryColorCssValue(selectedColor),
                  }}
                />
              </UnstyledButton>
            ) : null}
            {CATEGORY_COLOR_PALETTE.map((color) => (
              <UnstyledButton
                key={color}
                className="category-editor-color-option"
                type="button"
                aria-label={`Use Color ${color}`}
                aria-pressed={selectedColor === color}
                disabled={submitting}
                onClick={() => setSelectedColor(color)}
              >
                <span
                  className="category-editor-color-swatch"
                  data-category-color={color}
                  aria-hidden="true"
                  style={{ backgroundColor: color }}
                />
              </UnstyledButton>
            ))}
          </div>
          <Group justify="flex-end">
            <Button variant="default" disabled={submitting} onClick={closeEditor}>
              Cancel
            </Button>
            <Button
              loading={submitting}
              disabled={!validation?.ok}
              aria-label={submitting
                ? editorMode === 'edit'
                  ? 'Saving Category…'
                  : 'Creating Category…'
                : editorMode === 'edit'
                  ? 'Save Category'
                  : 'Create Category'}
              leftSection={<TabBoardIcon icon={editorMode === 'edit' ? Pencil : Plus} size="menu" />}
              onClick={() => void submitEditor()}
            >
              {submitting
                ? editorMode === 'edit'
                  ? 'Saving Category…'
                  : 'Creating Category…'
                : editorMode === 'edit'
                  ? 'Save Category'
                  : 'Create Category'}
            </Button>
          </Group>
        </Stack>
      </ManagerModal>

      <ConfirmDialog
        opened={Boolean(deletingFolder)}
        title="Delete Category"
        message={deleteMessage}
        confirmLabel="Delete Category"
        loadingLabel="Deleting Category…"
        loading={submitting}
        finalFocusRef={deleteTriggerRef}
        onCancel={() => {
          if (submitting) return;
          setDeletingFolderId(null);
          setDeleteError(null);
        }}
        onConfirm={() => deletingFolder
          ? performDelete(deletingFolder.id)
          : undefined}
      />
    </>
  );
}
