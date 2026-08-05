import { ActionIcon, Group } from '@mantine/core';
import type { OpenWindowInfo } from '../../../shared/openTabs';
import { formatNumber } from '../../../shared/utils/formatters';
import { TabBoardTooltip } from '../../../shared/components/TabBoardTooltip';
import type { SidebarDisclosureState } from '../../hooks/useSidebarDisclosure';

function windowAccessibleLabel(window: OpenWindowInfo): string {
  return `Browser window, ${formatNumber(window.tabCount)} ${window.tabCount === 1 ? 'tab' : 'tabs'}${window.focused ? ', focused' : ''}`;
}

export function OpenTabsWindowBar({
  windows,
  selectedWindow,
  sidebarState,
  onSelectWindow,
}: {
  windows: readonly OpenWindowInfo[];
  selectedWindow: OpenWindowInfo | null;
  sidebarState: SidebarDisclosureState;
  onSelectWindow: (windowId: number) => void;
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
    </Group>
  );
}
