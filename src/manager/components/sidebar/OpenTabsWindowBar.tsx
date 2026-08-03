import type { RefObject } from 'react';
import { ActionIcon, Group } from '@mantine/core';
import {
  PanelLeftClose,
  Pin,
  X,
} from 'lucide-react';
import type { OpenWindowInfo } from '../../../shared/openTabs';
import { formatNumber } from '../../../shared/utils/formatters';
import { AccessibleIconAction } from '../../../shared/components/AccessibleIconAction';
import { TabBoardIcon } from '../../../shared/components/TabBoardIcon';
import { TabBoardTooltip } from '../../../shared/components/TabBoardTooltip';
import type { SidebarDisclosureState } from '../../hooks/useSidebarDisclosure';

function windowAccessibleLabel(window: OpenWindowInfo): string {
  return `Browser window, ${formatNumber(window.tabCount)} ${window.tabCount === 1 ? 'tab' : 'tabs'}${window.focused ? ', focused' : ''}`;
}

export function OpenTabsWindowBar({
  windows,
  selectedWindow,
  sidebarState,
  sidebarToggleRef,
  onSelectWindow,
  onToggleSidebar,
  onPinSidebar,
}: {
  windows: readonly OpenWindowInfo[];
  selectedWindow: OpenWindowInfo | null;
  sidebarState: SidebarDisclosureState;
  sidebarToggleRef: RefObject<HTMLButtonElement>;
  onSelectWindow: (windowId: number) => void;
  onToggleSidebar: (expanded: boolean) => void;
  onPinSidebar: () => void;
}) {
  const visibleWindows = windows.filter((window) => !window.incognito);

  return (
    <Group gap={2} wrap="nowrap" className="manager-open-tabs-window-bar">
      <Group className="manager-window-switcher" gap={2} wrap="nowrap">
        {visibleWindows.map((window, index) => {
          const isSelected = window.id === selectedWindow?.id;
          const accessibleLabel = windowAccessibleLabel(window);
          return (
            <TabBoardTooltip key={window.id ?? index} label={accessibleLabel}>
              <ActionIcon
                className={[
                  'manager-sidebar-header-action',
                  'manager-window-button',
                  !isSelected && 'manager-sidebar__expanded-content',
                ].filter(Boolean).join(' ')}
                variant="subtle"
                aria-label={accessibleLabel}
                aria-pressed={isSelected}
                aria-hidden={!isSelected && sidebarState === 'collapsed' || undefined}
                data-tab-count={window.tabCount}
                data-focused={window.focused || undefined}
                disabled={window.id === undefined || (
                  !isSelected && sidebarState === 'collapsed'
                )}
                tabIndex={!isSelected && sidebarState === 'collapsed' ? -1 : undefined}
                onClick={() => window.id !== undefined && onSelectWindow(window.id)}
              >
                <span className="manager-window-glyph" aria-hidden="true">
                  <span className="manager-window-tab-count">{formatNumber(window.tabCount)}</span>
                  {window.focused ? (
                    <span className="manager-window-focused-badge" />
                  ) : null}
                </span>
              </ActionIcon>
            </TabBoardTooltip>
          );
        })}
        {!visibleWindows.length && (
          <TabBoardTooltip label="No open browser windows">
            <ActionIcon
              className="manager-sidebar-header-action"
              variant="subtle"
              aria-label="No open browser windows"
              disabled
            >
              <span className="manager-window-glyph" aria-hidden="true">
                <span className="manager-window-tab-count">0</span>
              </span>
            </ActionIcon>
          </TabBoardTooltip>
        )}
      </Group>
      <Group
        className="manager-sidebar-utilities manager-sidebar__expanded-content"
        gap={2}
        ml="auto"
        wrap="nowrap"
        aria-hidden={sidebarState === 'collapsed' || undefined}
        {...(sidebarState === 'collapsed' ? { inert: '' } : {})}
      >
        <AccessibleIconAction
          ref={sidebarToggleRef}
          label={sidebarState === 'peek'
            ? 'Pin Sidebar'
            : sidebarState === 'drawer'
              ? 'Close Sidebar'
              : 'Collapse Sidebar'}
          className="manager-sidebar-collapse-toggle manager-sidebar-header-action manager-sidebar-utility-action"
          variant="subtle"
          aria-controls="manager-sidebar"
          disabled={sidebarState === 'collapsed'}
          tabIndex={sidebarState === 'collapsed' ? -1 : undefined}
          onClick={() => {
            if (sidebarState === 'peek') {
              onPinSidebar();
            } else {
              onToggleSidebar(false);
            }
          }}
        >
          <TabBoardIcon
            icon={sidebarState === 'peek'
              ? Pin
              : sidebarState === 'drawer'
                ? X
                : PanelLeftClose}
          />
        </AccessibleIconAction>
      </Group>
    </Group>
  );
}
