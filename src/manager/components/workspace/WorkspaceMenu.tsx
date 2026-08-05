import { useRef, useState } from 'react';
import {
  Button,
  Group,
  Menu,
  Stack,
  Text,
} from '@mantine/core';
import {
  ChevronDown,
  Settings2,
  Pencil,
  Plus,
} from 'lucide-react';
import type {
  Folder,
  Group as TabBoardGroup,
  Workspace,
} from '../../../shared/model/types';
import { AccessibleIconAction } from '../../../shared/components/AccessibleIconAction';
import { TabBoardIcon } from '../../../shared/components/TabBoardIcon';
import { TabBoardTooltip } from '../../../shared/components/TabBoardTooltip';
import {
  ManagerMenuDescriptionTarget,
  mergeManagerMenuDescriptionRef,
} from '../../hooks/useManagerOverlays';
import {
  MANAGER_DENSE_MENU_PROPS,
  useManagerMenuOpening,
} from './managerMenuPolicy';
import {
  WorkspaceEditorModal,
  type WorkspaceEditorValue,
} from './WorkspaceEditorModal';
import { WorkspaceManagerModal } from './WorkspaceManagerModal';

interface WorkspaceMenuProps {
  activeWorkspaceId: string;
  confirmBeforeDestructive: boolean;
  workspaces: readonly Workspace[];
  groups: readonly TabBoardGroup[];
  folders: readonly Folder[];
  onSelect: (workspaceId: string) => void;
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

function savedSessionCountDescription(count: number): string {
  return `${count} saved ${count === 1 ? 'Session' : 'Sessions'}`;
}

export function WorkspaceMenu({
  activeWorkspaceId,
  confirmBeforeDestructive,
  workspaces,
  groups,
  folders,
  onSelect,
  onCreate,
  onUpdateWorkspace,
  onUpdateWorkspaceOrder,
  onDeleteWorkspace,
  onActiveWorkspaceDeleted,
}: WorkspaceMenuProps) {
  const workspace = workspaces.find(({ id }) => id === activeWorkspaceId) ?? workspaces[0];
  const [menuOpen, setMenuOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const createTriggerRef = useRef<HTMLButtonElement | null>(null);
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);
  const managerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuOpening = useManagerMenuOpening('manager-workspace-menu');

  return (
    <>
      <div className="manager-workspace-switcher">
        <Menu
          {...MANAGER_DENSE_MENU_PROPS}
          keepMounted
          withInitialFocusPlaceholder={false}
          portalProps={{ target: '#manager-main' }}
          opened={menuOpen}
          onChange={setMenuOpen}
          onOpen={menuOpening.onMenuOpen}
          shadow="md"
        >
          <TabBoardTooltip
            label={workspace?.name ?? 'Workspace'}
            disabled={menuOpen}
          >
            <Menu.Target>
              <Button
                className="manager-workspace-trigger"
                variant="subtle"
                size="sm"
                aria-label={`Workspace: ${workspace?.name ?? 'Workspace'}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onPointerDown={menuOpening.onTriggerPointerDown}
                onKeyDown={menuOpening.onTriggerKeyDown}
                leftSection={(
                  <span className="manager-workspace-trigger__emoji" aria-hidden="true">
                    {workspace?.emoji}
                  </span>
                )}
                rightSection={(
                  <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
                )}
              >
                <span className="manager-workspace-trigger__label">
                  {workspace?.name ?? 'Workspace'}
                </span>
              </Button>
            </Menu.Target>
          </TabBoardTooltip>
          <Menu.Dropdown id="manager-workspace-menu">
            <Stack gap={2} px={4} className="manager-workspace-list">
              {workspaces.map((item) => {
                const isCurrent = item.id === workspace?.id;
                const sessionCount = groups.filter(
                  (group) => group.workspaceId === item.id,
                ).length;
                return (
                  <Group
                    key={item.id}
                    className={`manager-workspace-row${isCurrent ? ' manager-workspace-row--current' : ''}`}
                    data-workspace-menu-id={item.id}
                    gap={2}
                    wrap="nowrap"
                  >
                    <ManagerMenuDescriptionTarget
                      description={savedSessionCountDescription(sessionCount)}
                    >
                      {(descriptionTargetProps) => (
                        <Menu.Item
                          {...descriptionTargetProps}
                          className="manager-workspace-row-trigger"
                          leftSection={(
                            <span className="manager-workspace-menu-emoji" aria-hidden="true">
                              {item.emoji}
                            </span>
                          )}
                          onClick={() => onSelect(item.id)}
                        >
                          <Text size="sm" lineClamp={1}>{item.name}</Text>
                        </Menu.Item>
                      )}
                    </ManagerMenuDescriptionTarget>
                    {isCurrent && (
                      <AccessibleIconAction
                        ref={editTriggerRef}
                        className="manager-workspace-edit"
                        label="Edit Workspace"
                        variant="subtle"
                        onClick={() => {
                          setMenuOpen(false);
                          setEditorMode('edit');
                        }}
                      >
                        <TabBoardIcon icon={Pencil} />
                      </AccessibleIconAction>
                    )}
                  </Group>
                );
              })}
            </Stack>
            <Menu.Divider />
            <ManagerMenuDescriptionTarget description="Create another Workspace">
              {(descriptionTargetProps) => (
                <Menu.Item
                  {...descriptionTargetProps}
                  className="manager-workspace-create"
                  leftSection={<TabBoardIcon icon={Plus} size="menu" />}
                  onClick={(event) => {
                    createTriggerRef.current = event.currentTarget;
                    setMenuOpen(false);
                    setEditorMode('create');
                  }}
                >
                  New Workspace
                </Menu.Item>
              )}
            </ManagerMenuDescriptionTarget>
            <ManagerMenuDescriptionTarget description="Rename, reorder, or remove Workspaces">
              {(descriptionTargetProps) => (
                <Menu.Item
                  {...descriptionTargetProps}
                  ref={mergeManagerMenuDescriptionRef(
                    descriptionTargetProps.ref,
                    managerTriggerRef,
                  )}
                  leftSection={<TabBoardIcon icon={Settings2} size="menu" />}
                  onClick={() => {
                    setMenuOpen(false);
                    setManagerOpen(true);
                  }}
                >
                  Manage Workspaces
                </Menu.Item>
              )}
            </ManagerMenuDescriptionTarget>
          </Menu.Dropdown>
        </Menu>
      </div>

      <WorkspaceEditorModal
        opened={editorMode !== null}
        mode={editorMode ?? 'create'}
        workspace={editorMode === 'edit' ? workspace : undefined}
        workspaces={workspaces}
        finalFocusRef={editorMode === 'edit' ? editTriggerRef : createTriggerRef}
        onClose={() => {
          setEditorMode(null);
          setMenuOpen(true);
        }}
        onSubmit={(value) => {
          if (editorMode === 'edit' && workspace) {
            return onUpdateWorkspace(workspace.id, value);
          }
          return onCreate(value);
        }}
      />

      <WorkspaceManagerModal
        opened={managerOpen}
        confirmBeforeDestructive={confirmBeforeDestructive}
        activeWorkspaceId={activeWorkspaceId}
        workspaces={workspaces}
        groups={groups}
        folders={folders}
        finalFocusRef={managerTriggerRef}
        onClose={() => {
          setManagerOpen(false);
          setMenuOpen(true);
        }}
        onCreate={onCreate}
        onUpdateWorkspace={onUpdateWorkspace}
        onUpdateWorkspaceOrder={onUpdateWorkspaceOrder}
        onDeleteWorkspace={onDeleteWorkspace}
        onActiveWorkspaceDeleted={onActiveWorkspaceDeleted}
      />
    </>
  );
}
