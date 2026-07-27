import { useState } from 'react';
import {
  ActionIcon,
  Group,
  Menu,
  Tooltip,
} from '@mantine/core';
import {
  IconDots,
  IconDownload,
  IconSettings,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { MANAGER_MENU_A11Y_PROPS } from './managerMenuPolicy';

interface ManagerGlobalActionsProps {
  showBin: boolean;
  onOpenImport: () => void;
  onOpenExport: () => void;
  onToggleBin: () => void;
}

export function ManagerGlobalActions({
  showBin,
  onOpenImport,
  onOpenExport,
  onToggleBin,
}: ManagerGlobalActionsProps) {
  const [compactMenuOpen, setCompactMenuOpen] = useState(false);

  return (
    <Group className="manager-header-actions" gap={2} ml="sm" wrap="nowrap">
      <Group className="manager-header-actions-desktop" gap={2} wrap="nowrap">
        <Tooltip label="Import">
          <ActionIcon variant="subtle" aria-label="Import" onClick={onOpenImport}>
            <IconDownload size={20} aria-hidden="true" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Export">
          <ActionIcon variant="subtle" aria-label="Export" onClick={onOpenExport}>
            <IconUpload size={20} aria-hidden="true" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Trash">
          <ActionIcon
            aria-label="Trash"
            variant="subtle"
            onClick={onToggleBin}
            color={showBin ? 'blue' : 'gray'}
          >
            <IconTrash size={20} aria-hidden="true" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Options">
          <ActionIcon aria-label="Options" variant="subtle" component="a" href="options.html">
            <IconSettings size={20} aria-hidden="true" />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Menu
        {...MANAGER_MENU_A11Y_PROPS}
        keepMounted
        withInitialFocusPlaceholder={false}
        portalProps={{ target: '#manager-main' }}
        opened={compactMenuOpen}
        onChange={setCompactMenuOpen}
        shadow="md"
        width={180}
        position="bottom-end"
      >
        <Menu.Target>
          <ActionIcon
            className="manager-header-actions-compact"
            variant="subtle"
            aria-label="More Actions"
            aria-haspopup="menu"
            aria-expanded={compactMenuOpen}
          >
            <IconDots size={20} aria-hidden="true" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown id="manager-global-actions-menu">
          <Menu.Item leftSection={<IconDownload size={16} aria-hidden="true" />} onClick={onOpenImport}>
            Import
          </Menu.Item>
          <Menu.Item leftSection={<IconUpload size={16} aria-hidden="true" />} onClick={onOpenExport}>
            Export
          </Menu.Item>
          <Menu.Item leftSection={<IconTrash size={16} aria-hidden="true" />} onClick={onToggleBin}>
            Trash
          </Menu.Item>
          <Menu.Item
            component="a"
            href="options.html"
            leftSection={<IconSettings size={16} aria-hidden="true" />}
          >
            Options
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
