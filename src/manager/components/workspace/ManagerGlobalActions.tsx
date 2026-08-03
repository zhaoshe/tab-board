import { useState } from 'react';
import {
  Group,
  Menu,
} from '@mantine/core';
import {
  Download,
  Menu as MenuIcon,
  Settings2,
  Trash,
  Upload,
} from 'lucide-react';
import { AccessibleIconAction } from '../../../shared/components/AccessibleIconAction';
import { TabBoardIcon } from '../../../shared/components/TabBoardIcon';
import { ManagerMenuDescriptionTarget } from '../../hooks/useManagerOverlays';
import {
  MANAGER_DENSE_MENU_PROPS,
  useManagerMenuOpening,
} from './managerMenuPolicy';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuOpening = useManagerMenuOpening('manager-global-actions-menu');

  return (
    <Group className="manager-header-actions" gap={2} ml="sm" wrap="nowrap">
      <AccessibleIconAction
        label="Bin"
        variant="subtle"
        onClick={onToggleBin}
        selected={showBin}
      >
        <TabBoardIcon icon={Trash} />
      </AccessibleIconAction>

      <Menu
        {...MANAGER_DENSE_MENU_PROPS}
        keepMounted
        withInitialFocusPlaceholder={false}
        portalProps={{ target: '#manager-main' }}
        opened={menuOpen}
        onChange={setMenuOpen}
        onOpen={menuOpening.onMenuOpen}
        shadow="md"
        position="bottom-end"
      >
        <Menu.Target>
          <AccessibleIconAction
            label="More Actions"
            variant="subtle"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onPointerDown={menuOpening.onTriggerPointerDown}
            onKeyDown={menuOpening.onTriggerKeyDown}
          >
            <TabBoardIcon icon={MenuIcon} />
          </AccessibleIconAction>
        </Menu.Target>
        <Menu.Dropdown id="manager-global-actions-menu">
          <ManagerMenuDescriptionTarget description="Bring sessions into TabBoard">
            {(descriptionTargetProps) => (
              <Menu.Item
                {...descriptionTargetProps}
                leftSection={<TabBoardIcon icon={Download} size="menu" />}
                onClick={onOpenImport}
              >
                Import
              </Menu.Item>
            )}
          </ManagerMenuDescriptionTarget>
          <ManagerMenuDescriptionTarget description="Download a TabBoard backup">
            {(descriptionTargetProps) => (
              <Menu.Item
                {...descriptionTargetProps}
                leftSection={<TabBoardIcon icon={Upload} size="menu" />}
                onClick={onOpenExport}
              >
                Export
              </Menu.Item>
            )}
          </ManagerMenuDescriptionTarget>
          <ManagerMenuDescriptionTarget description="Open extension settings">
            {(descriptionTargetProps) => (
              <Menu.Item
                {...descriptionTargetProps}
                component="a"
                href="options.html"
                leftSection={<TabBoardIcon icon={Settings2} size="menu" />}
              >
                Options
              </Menu.Item>
            )}
          </ManagerMenuDescriptionTarget>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
