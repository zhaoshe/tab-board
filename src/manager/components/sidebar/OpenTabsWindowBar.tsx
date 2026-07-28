import type { RefObject } from 'react';
import { ActionIcon, Group, Tooltip } from '@mantine/core';
import {
  IconArchive,
  IconBrowser,
  IconLayoutSidebarLeftCollapse,
  IconRefresh,
} from '@tabler/icons-react';
import type { OpenWindowInfo } from '../../../shared/openTabs';
import { getSelectableOpenTabIds } from '../../core/open-tabs';
import { formatNumber } from '../../../shared/utils/formatters';
import { AccessibleIconAction } from '../../../shared/components/AccessibleIconAction';

function windowAccessibleLabel(window: OpenWindowInfo, index: number): string {
  return `Window ${formatNumber(index + 1)}: ${formatNumber(window.tabCount)} ${window.tabCount === 1 ? 'tab' : 'tabs'}${window.focused ? ', current browser window' : ''}`;
}

export function OpenTabsWindowBar({
  windows,
  selectedWindow,
  loading,
  capturing,
  sidebarPinned,
  sidebarToggleRef,
  onSelectWindow,
  onRefresh,
  onSaveWindow,
  onToggleSidebar,
}: {
  windows: readonly OpenWindowInfo[];
  selectedWindow: OpenWindowInfo | null;
  loading: boolean;
  capturing: boolean;
  sidebarPinned: boolean;
  sidebarToggleRef: RefObject<HTMLButtonElement>;
  onSelectWindow: (windowId: number) => void;
  onRefresh: () => void;
  onSaveWindow: () => void;
  onToggleSidebar: (expanded: boolean) => void;
}) {
  const visibleWindows = windows.filter((window) => !window.incognito);
  const capturableCount = getSelectableOpenTabIds(selectedWindow).length;
  const saveLabel = capturableCount
    ? `Save ${formatNumber(capturableCount)} ${capturableCount === 1 ? 'Tab' : 'Tabs'} in This Window`
    : 'Save Window — No Capturable Tabs';

  return (
    <Group gap={2} wrap="nowrap" className="manager-open-tabs-window-bar">
      <Group className="manager-window-switcher" gap={2} wrap="nowrap">
        {visibleWindows.map((window, index) => {
          const isSelected = window.id === selectedWindow?.id;
          const accessibleLabel = windowAccessibleLabel(window, index);
          return (
            <Tooltip key={window.id ?? index} label={accessibleLabel} openDelay={1000}>
              <ActionIcon
                className="manager-sidebar-header-action manager-window-button"
                variant="subtle"
                aria-label={accessibleLabel}
                aria-pressed={isSelected}
                data-tab-count={window.tabCount}
                data-current={window.focused || undefined}
                disabled={window.id === undefined}
                onClick={() => window.id !== undefined && onSelectWindow(window.id)}
              >
                <span className="manager-window-glyph" aria-hidden="true">
                  <span className="manager-window-tab-count">{formatNumber(window.tabCount)}</span>
                </span>
                {isSelected && (
                  <span className="manager-window-label">
                    Window {formatNumber(index + 1)} · {formatNumber(window.tabCount)} {window.tabCount === 1 ? 'tab' : 'tabs'}
                  </span>
                )}
              </ActionIcon>
            </Tooltip>
          );
        })}
        {!visibleWindows.length && (
          <Tooltip label="No open browser windows" openDelay={1000}>
            <ActionIcon
              className="manager-sidebar-header-action"
              variant="subtle"
              aria-label="No open browser windows"
              disabled
            >
              <IconBrowser size={20} aria-hidden="true" />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      <Group className="manager-sidebar-utilities" gap={2} ml="auto" wrap="nowrap">
        <Tooltip label={saveLabel} openDelay={500}>
          <span>
            <AccessibleIconAction
              label={capturing ? 'Saving Window…' : saveLabel}
              tooltip={saveLabel}
              className="manager-sidebar-header-action manager-sidebar-utility-action manager-save-window"
              variant="light"
              color="blue"
              aria-busy={capturing || undefined}
              disabled={!capturableCount || capturing}
              loading={capturing}
              onClick={onSaveWindow}
            >
              <IconArchive size={19} aria-hidden="true" />
            </AccessibleIconAction>
          </span>
        </Tooltip>
        <Tooltip label={loading ? 'Refreshing open tabs' : 'Refresh open tabs'} openDelay={1000}>
          <AccessibleIconAction
            label={loading ? 'Refreshing Open Tabs…' : 'Refresh Open Tabs'}
            tooltip={loading ? 'Refreshing open tabs' : 'Refresh open tabs'}
            className="manager-sidebar-header-action manager-sidebar-utility-action"
            variant="subtle"
            aria-busy={loading || undefined}
            onClick={onRefresh}
          >
            <span className={loading ? 'manager-refresh-icon--loading' : undefined} aria-hidden="true">
              <IconRefresh size={20} aria-hidden="true" />
            </span>
          </AccessibleIconAction>
        </Tooltip>
        <Tooltip label="Collapse Sidebar" openDelay={1000}>
          <AccessibleIconAction
            ref={sidebarToggleRef}
            label="Collapse Sidebar"
            className="manager-sidebar-collapse-toggle manager-sidebar-header-action manager-sidebar-utility-action"
            variant="subtle"
            aria-controls="manager-sidebar"
            onClick={() => onToggleSidebar(!sidebarPinned)}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                transform: sidebarPinned ? undefined : 'rotate(180deg)',
                transformOrigin: 'center',
              }}
            >
              <IconLayoutSidebarLeftCollapse size={20} aria-hidden="true" />
            </span>
          </AccessibleIconAction>
        </Tooltip>
      </Group>
    </Group>
  );
}
