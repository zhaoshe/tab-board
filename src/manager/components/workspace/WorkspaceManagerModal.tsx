import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type FocusEvent as ReactFocusEvent,
  type RefObject,
} from 'react';
import {
  Button,
  Group,
  Stack,
  Text,
} from '@mantine/core';
import {
  ArrowDown,
  ArrowUp,
  Pencil,
  Trash,
} from 'lucide-react';
import type {
  Folder,
  Group as TabBoardGroup,
  Workspace,
} from '../../../shared/model';
import { AccessibleIconAction } from '../../../shared/components/AccessibleIconAction';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { TabBoardIcon } from '../../../shared/components/TabBoardIcon';
import { formatNumber } from '../../../shared/utils/formatters';
import { ManagerModal } from '../shell/ManagerModal';
import {
  WorkspaceEditorModal,
  type WorkspaceEditorValue,
} from './WorkspaceEditorModal';

const WORKSPACE_DRAG_MIME = 'application/x-tabboard-workspace';

export interface WorkspaceManagerModalProps {
  opened: boolean;
  confirmBeforeDestructive: boolean;
  activeWorkspaceId: string;
  workspaces: readonly Workspace[];
  groups: readonly TabBoardGroup[];
  folders: readonly Folder[];
  finalFocusRef?: RefObject<HTMLElement>;
  onClose: () => void;
  onCreate: (value: WorkspaceEditorValue) => void | Promise<void>;
  onUpdateWorkspace: (
    workspaceId: string,
    value: WorkspaceEditorValue,
  ) => void | Promise<void>;
  onUpdateWorkspaceOrder: (
    orderedWorkspaceIds: readonly string[],
  ) => void | Promise<void>;
  onDeleteWorkspace: (workspaceId: string) => void | Promise<void>;
  onActiveWorkspaceDeleted: (replacementWorkspaceId: string) => void;
}

function moveWorkspace(
  workspaces: readonly Workspace[],
  workspaceId: string,
  targetIndex: number,
): string[] | null {
  const currentIndex = workspaces.findIndex(({ id }) => id === workspaceId);
  if (
    currentIndex < 0
    || targetIndex < 0
    || targetIndex >= workspaces.length
    || currentIndex === targetIndex
  ) {
    return null;
  }
  const ordered = workspaces.map(({ id }) => id);
  const [moved] = ordered.splice(currentIndex, 1);
  ordered.splice(targetIndex, 0, moved);
  return ordered;
}

function moveWorkspaceToDrop(
  workspaces: readonly Workspace[],
  draggedWorkspaceId: string,
  targetWorkspaceId: string,
  placement: 'before' | 'after',
): string[] | null {
  if (draggedWorkspaceId === targetWorkspaceId) return null;
  const ordered = workspaces
    .map(({ id }) => id)
    .filter((id) => id !== draggedWorkspaceId);
  const targetIndex = ordered.indexOf(targetWorkspaceId);
  if (targetIndex < 0) return null;
  ordered.splice(
    targetIndex + (placement === 'after' ? 1 : 0),
    0,
    draggedWorkspaceId,
  );
  return ordered;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

function restoreFinalFocus(finalFocusRef?: RefObject<HTMLElement>): void {
  window.setTimeout(() => finalFocusRef?.current?.focus(), 0);
}

export function WorkspaceManagerModal({
  opened,
  confirmBeforeDestructive,
  activeWorkspaceId,
  workspaces,
  groups,
  folders,
  finalFocusRef,
  onClose,
  onCreate,
  onUpdateWorkspace,
  onUpdateWorkspaceOrder,
  onDeleteWorkspace,
  onActiveWorkspaceDeleted,
}: WorkspaceManagerModalProps) {
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [draggedWorkspaceId, setDraggedWorkspaceId] = useState<string | null>(null);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editorExiting, setEditorExiting] = useState(false);
  const [deletingWorkspace, setDeletingWorkspace] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const managerContentRef = useRef<HTMLDivElement | null>(null);
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreEditFocusRef = useRef(false);
  const editingWorkspace = workspaces.find(({ id }) => id === editingWorkspaceId);
  const nestedModalOpen = Boolean(
    creatingWorkspace || editingWorkspace || editorExiting || deletingWorkspace,
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
    if (nestedModalOpen || !restoreEditFocusRef.current) return undefined;
    restoreEditFocusRef.current = false;
    const timeout = window.setTimeout(() => {
      editTriggerRef.current?.focus();
      editTriggerRef.current?.removeAttribute('data-autofocus');
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [nestedModalOpen]);

  const closeManager = () => {
    if (nestedModalOpen) return;
    onClose();
    restoreFinalFocus(finalFocusRef);
  };

  const updateOrder = (orderedWorkspaceIds: readonly string[] | null) => {
    if (!orderedWorkspaceIds) return;
    void onUpdateWorkspaceOrder(orderedWorkspaceIds);
  };

  const handleDrop = (
    event: ReactDragEvent<HTMLElement>,
    targetWorkspaceId: string,
  ) => {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData(WORKSPACE_DRAG_MIME)
      || draggedWorkspaceId;
    if (!draggedId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = rect.height > 0 && event.clientY < rect.top + rect.height / 2
      ? 'before'
      : 'after';
    updateOrder(moveWorkspaceToDrop(
      workspaces,
      draggedId,
      targetWorkspaceId,
      placement,
    ));
    setDraggedWorkspaceId(null);
  };

  const handleRowBlur = (
    event: ReactFocusEvent<HTMLElement>,
    workspaceId: string,
  ) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setFocusedRowId((current) => current === workspaceId ? null : current);
    }
  };

  const replacementWorkspace = deletingWorkspace?.id === activeWorkspaceId
    ? workspaces.find(({ id }) => id !== deletingWorkspace.id)
    : undefined;
  const deletingSessionCount = deletingWorkspace
    ? groups.filter(({ workspaceId }) => workspaceId === deletingWorkspace.id).length
    : 0;
  const deletingCategoryCount = deletingWorkspace
    ? folders.filter(({ workspaceId }) => workspaceId === deletingWorkspace.id).length
    : 0;
  const deleteMessage = deletingWorkspace
    ? [
      `Delete ${deletingWorkspace.name}?`,
      `This removes ${countLabel(deletingSessionCount, 'Session', 'Sessions')}`,
      `and ${countLabel(deletingCategoryCount, 'custom Category', 'custom Categories')}.`,
      replacementWorkspace
        ? `${replacementWorkspace.name} will become the active Workspace.`
        : '',
    ].filter(Boolean).join(' ')
    : '';
  const deleteConfirmationMessage = deleteError
    ? `${deleteMessage} ${deleteError}`
    : deleteMessage;

  const performDelete = async (workspace: Workspace) => {
    if (deleting) return;
    const deletedWorkspaceId = workspace.id;
    const replacementId = workspace.id === activeWorkspaceId
      ? workspaces.find(({ id }) => id !== workspace.id)?.id
      : undefined;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteWorkspace(deletedWorkspaceId);
      setDeletingWorkspace(null);
      if (replacementId) onActiveWorkspaceDeleted(replacementId);
    } catch (error: unknown) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'Unable to enqueue Workspace deletion.',
      );
    } finally {
      setDeleting(false);
    }
  };

  const requestDelete = (workspace: Workspace) => {
    setDeleteError(null);
    if (confirmBeforeDestructive) {
      setDeletingWorkspace(workspace);
      return;
    }
    void performDelete(workspace);
  };

  return (
    <>
      <ManagerModal
        opened={opened}
        onClose={closeManager}
        title="Manage Workspaces"
        size="md"
        centered
        trapFocus={!nestedModalOpen}
        closeOnClickOutside={!nestedModalOpen}
        closeOnEscape={!nestedModalOpen}
        returnFocus={false}
        classNames={{ content: 'workspace-manager-modal' }}
        headerSubtitle={`${countLabel(workspaces.length, 'Workspace', 'Workspaces')} · drag to reorder`}
        headerAction={(
          <Button
            variant="default"
            onClick={(event) => {
              editTriggerRef.current = event.currentTarget;
              setEditorExiting(false);
              setCreatingWorkspace(true);
            }}
          >
            New Workspace
          </Button>
        )}
      >
        <div ref={managerContentRef}>
          <Stack gap="xs" className="workspace-manager-list">
            {workspaces.map((workspace, index) => {
              const sessionCount = groups.filter(
                ({ workspaceId }) => workspaceId === workspace.id,
              ).length;
              const categoryCount = folders.filter(
                ({ workspaceId }) => workspaceId === workspace.id,
              ).length;
              const locked = groups.some(
                (group) => group.workspaceId === workspace.id && group.locked,
              );
              const deleteDisabled = deleting || workspaces.length <= 1 || locked;
              const actionsAvailable = focusedRowId === workspace.id;

              return (
                <div
                  key={workspace.id}
                  className={[
                    'workspace-manager-row',
                    workspace.id === activeWorkspaceId
                      ? 'workspace-manager-row--current'
                      : '',
                    draggedWorkspaceId === workspace.id
                      ? 'workspace-manager-row--dragging'
                      : '',
                  ].filter(Boolean).join(' ')}
                  data-workspace-id={workspace.id}
                  data-actions-visible={actionsAvailable || undefined}
                  draggable={!nestedModalOpen}
                  role="group"
                  tabIndex={0}
                  aria-label={`${workspace.name} Workspace`}
                  onFocus={() => setFocusedRowId(workspace.id)}
                  onBlur={(event) => handleRowBlur(event, workspace.id)}
                  onDragStart={(event) => {
                    setDraggedWorkspaceId(workspace.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData(WORKSPACE_DRAG_MIME, workspace.id);
                  }}
                  onDragEnd={() => setDraggedWorkspaceId(null)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => handleDrop(event, workspace.id)}
                >
                  <span className="workspace-manager-row__emoji" aria-hidden="true">
                    {workspace.emoji}
                  </span>
                  <Stack gap={0} className="workspace-manager-row__summary">
                    <Group gap="xs" wrap="nowrap">
                      <Text size="sm" fw={600} lineClamp={1}>
                        {workspace.name}
                      </Text>
                      {workspace.id === activeWorkspaceId ? (
                        <Text component="span" size="xs" c="dimmed">Current</Text>
                      ) : null}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {countLabel(sessionCount, 'Session', 'Sessions')}
                      {' · '}
                      {countLabel(categoryCount, 'custom Category', 'custom Categories')}
                    </Text>
                  </Stack>

                  <Group
                    className="workspace-manager-row__actions"
                    gap={2}
                    wrap="nowrap"
                  >
                    <AccessibleIconAction
                      label={`Move ${workspace.name} up`}
                      variant="subtle"
                      disabled={index === 0}
                      tabIndex={actionsAvailable ? 0 : -1}
                      onClick={() => updateOrder(
                        moveWorkspace(workspaces, workspace.id, index - 1),
                      )}
                    >
                      <TabBoardIcon icon={ArrowUp} />
                    </AccessibleIconAction>
                    <AccessibleIconAction
                      label={`Move ${workspace.name} down`}
                      variant="subtle"
                      disabled={index === workspaces.length - 1}
                      tabIndex={actionsAvailable ? 0 : -1}
                      onClick={() => updateOrder(
                        moveWorkspace(workspaces, workspace.id, index + 1),
                      )}
                    >
                      <TabBoardIcon icon={ArrowDown} />
                    </AccessibleIconAction>
                    <AccessibleIconAction
                      label={`Edit ${workspace.name}`}
                      variant="subtle"
                      tabIndex={actionsAvailable ? 0 : -1}
                      onClick={(event) => {
                        editTriggerRef.current = event.currentTarget;
                        setEditorExiting(false);
                        setEditingWorkspaceId(workspace.id);
                      }}
                    >
                      <TabBoardIcon icon={Pencil} />
                    </AccessibleIconAction>
                    <AccessibleIconAction
                      label={`Delete ${workspace.name}`}
                      tooltip={locked
                        ? 'Unlock every Session before deleting this Workspace'
                        : workspaces.length <= 1
                          ? 'The only Workspace cannot be deleted'
                          : `Delete ${workspace.name}`}
                      variant="subtle"
                      danger
                      disabled={deleteDisabled}
                      tabIndex={actionsAvailable ? 0 : -1}
                      onClick={(event) => {
                        deleteTriggerRef.current = event.currentTarget;
                        requestDelete(workspace);
                      }}
                    >
                      <TabBoardIcon icon={Trash} />
                    </AccessibleIconAction>
                  </Group>
                </div>
              );
            })}
          </Stack>
          {deleteError && !deletingWorkspace ? (
            <Text c="red" size="sm" role="alert">{deleteError}</Text>
          ) : null}
          <Group
            className="manager-management-footer"
            justify="flex-end"
            mt="sm"
          >
            <Button variant="default" onClick={closeManager}>
              Done
            </Button>
          </Group>
        </div>
      </ManagerModal>

      <WorkspaceEditorModal
        opened={creatingWorkspace || Boolean(editingWorkspace)}
        mode={creatingWorkspace ? 'create' : 'edit'}
        workspace={editingWorkspace}
        workspaces={workspaces}
        onClose={() => {
          restoreEditFocusRef.current = true;
          setEditorExiting(true);
          setCreatingWorkspace(false);
          setEditingWorkspaceId(null);
        }}
        onExited={() => {
          const trigger = editTriggerRef.current;
          trigger?.setAttribute('data-autofocus', 'true');
          const row = trigger?.closest<HTMLElement>('[data-workspace-id]');
          setFocusedRowId(row?.dataset.workspaceId ?? null);
          setEditorExiting(false);
        }}
        onSubmit={(value) => {
          if (editingWorkspace) {
            return onUpdateWorkspace(editingWorkspace.id, value);
          }
          return onCreate(value);
        }}
      />

      <ConfirmDialog
        opened={Boolean(deletingWorkspace)}
        title="Delete Workspace"
        message={deleteConfirmationMessage}
        confirmLabel="Delete Workspace"
        loadingLabel="Deleting Workspace…"
        loading={deleting}
        finalFocusRef={deleteTriggerRef}
        onCancel={() => {
          if (deleting) return;
          setDeleteError(null);
          setDeletingWorkspace(null);
        }}
        onConfirm={() => deletingWorkspace
          ? performDelete(deletingWorkspace)
          : undefined}
      />
    </>
  );
}
