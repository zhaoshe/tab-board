import { useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconCheck,
  IconChevronDown,
  IconEdit,
  IconLayoutGrid,
  IconPlus,
} from '@tabler/icons-react';
import type { Workspace } from '../../../shared/model/types';
import { ManagerModal } from '../shell/ManagerModal';

interface WorkspaceMenuProps {
  activeWorkspaceId: string;
  workspaces: readonly Workspace[];
  onSelect: (workspaceId: string) => void;
  onCreate: (name: string) => void;
  onRename: (workspaceId: string, name: string) => void;
}

type DialogMode = 'create' | 'rename' | null;

function validateWorkspaceName(
  workspaces: readonly Workspace[],
  name: string,
  excludedId?: string,
): { value: string; error: string | null } {
  const value = String(name ?? '').normalize('NFC').trim();
  if (!value) return { value, error: 'Workspace name is required.' };
  const key = value.toLocaleLowerCase('en-US');
  const duplicate = workspaces.some((workspace) =>
    workspace.id !== excludedId
    && workspace.name.normalize('NFC').trim().toLocaleLowerCase('en-US') === key);
  return {
    value,
    error: duplicate ? 'A workspace with this name already exists.' : null,
  };
}

export function WorkspaceMenu({
  activeWorkspaceId,
  workspaces,
  onSelect,
  onCreate,
  onRename,
}: WorkspaceMenuProps) {
  const workspace = workspaces.find(({ id }) => id === activeWorkspaceId) ?? workspaces[0];
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setName('');
    setError(null);
    setDialogMode('create');
  };
  const openRename = () => {
    if (!workspace) return;
    setName(workspace.name);
    setError(null);
    setDialogMode('rename');
  };
  const closeDialog = () => {
    setDialogMode(null);
    setError(null);
  };
  const submit = () => {
    const validation = validateWorkspaceName(
      workspaces,
      name,
      dialogMode === 'rename' ? workspace?.id : undefined,
    );
    if (validation.error) {
      setError(validation.error);
      return;
    }
    if (dialogMode === 'create') onCreate(validation.value);
    if (dialogMode === 'rename' && workspace) onRename(workspace.id, validation.value);
    closeDialog();
  };

  return (
    <>
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
                <IconLayoutGrid size={18} aria-hidden="true" />
                <IconChevronDown size={14} aria-hidden="true" />
              </Button>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Stack gap={2} px={4} className="manager-workspace-list">
              {workspaces.map((item) => {
                const isCurrent = item.id === workspace?.id;
                return (
                  <Group
                    key={item.id}
                    className={`manager-workspace-row${isCurrent ? ' manager-workspace-row--current' : ''}`}
                    gap={2}
                    wrap="nowrap"
                  >
                    <Button
                      className="manager-workspace-row-trigger"
                      variant="subtle"
                      color="gray"
                      size="sm"
                      justify="flex-start"
                      onClick={() => onSelect(item.id)}
                    >
                      <Text size="sm" lineClamp={1}>{item.name}</Text>
                    </Button>
                    {isCurrent && (
                      <>
                        <Tooltip label="Rename Workspace" openDelay={1000}>
                          <ActionIcon
                            className="manager-workspace-rename"
                            variant="subtle"
                            aria-label="Rename Workspace"
                            onClick={openRename}
                          >
                            <IconEdit size={16} aria-hidden="true" />
                          </ActionIcon>
                        </Tooltip>
                        <span className="manager-workspace-current-icon" aria-label="Current Workspace">
                          <IconCheck size={16} aria-hidden="true" />
                        </span>
                      </>
                    )}
                  </Group>
                );
              })}
            </Stack>
            <Menu.Divider />
            <Menu.Item
              className="manager-workspace-create"
              rightSection={<IconPlus size={16} aria-hidden="true" />}
              onClick={openCreate}
            >
              New Workspace
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>

      <ManagerModal
        opened={dialogMode !== null}
        onClose={closeDialog}
        title={dialogMode === 'rename' ? 'Rename Workspace' : 'New Workspace'}
        size="sm"
        centered
      >
        <Stack gap="md">
          <TextInput
            name="workspace-name"
            label="Workspace name"
            autoComplete="off"
            value={name}
            error={error}
            onChange={(event) => {
              setName(event.currentTarget.value);
              if (error) setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
            }}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeDialog}>Cancel</Button>
            <Button onClick={submit}>
              {dialogMode === 'rename' ? 'Rename Workspace' : 'Create Workspace'}
            </Button>
          </Group>
        </Stack>
      </ManagerModal>
    </>
  );
}
