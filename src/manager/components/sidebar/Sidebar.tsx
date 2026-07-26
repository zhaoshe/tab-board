import { useEffect, useRef, type RefObject } from 'react';
import { ActionIcon, Box, Stack, Tooltip } from '@mantine/core';
import { IconBrowser, IconSearch } from '@tabler/icons-react';
import { OPEN_TABS_FILTER_INPUT_ID, OpenTabsPanel } from './OpenTabsPanel';
import {
  type CaptureCompletion,
  type OpenTabsWorkflow,
} from '../../hooks/useOpenTabsRuntime';
import type { CaptureCategorySnapshot } from '../../core/capture';
import type { CategoryFilter } from '../../core/selectors';
import type { OpenTabInfo, OpenWindowInfo } from '../../../shared/openTabs';

interface SidebarRailProps {
  sidebarExpanded: boolean;
  selectedWindow: OpenWindowInfo | null;
  windows: OpenWindowInfo[];
  tabs: OpenTabInfo[];
  toggleRef: RefObject<HTMLButtonElement>;
  onToggleSidebar: (expanded: boolean) => void;
  onSelectionModeChange?: (selectionMode: boolean) => void;
  onSelectWindow: (windowId: number) => void;
  onFocusTab: (tabId: number | undefined) => void;
  onFocusFilter: () => void;
}

function SidebarRail({
  sidebarExpanded,
  selectedWindow,
  windows,
  tabs,
  toggleRef,
  onToggleSidebar,
  onSelectionModeChange,
  onSelectWindow,
  onFocusTab,
  onFocusFilter,
}: SidebarRailProps) {
  return (
    <div className="manager-sidebar-rail" aria-label="Open Tabs quick access">
      <Tooltip label={selectedWindow ? `Current window · ${selectedWindow.tabCount} tabs` : 'No open browser window'} position="right">
        <ActionIcon
          ref={toggleRef}
          className="manager-sidebar-rail-window"
          variant="subtle"
          aria-label={selectedWindow ? `Current window, ${selectedWindow.tabCount} tabs` : 'No open browser window'}
          onClick={() => {
            const visibleWindows = windows.filter((window) => !window.incognito && window.id !== undefined);
            if (visibleWindows.length < 2) return;
            const index = visibleWindows.findIndex((window) => window.id === selectedWindow?.id);
            onSelectWindow(visibleWindows[(index + 1) % visibleWindows.length].id!);
          }}
        >
          <IconBrowser size={20} />
        </ActionIcon>
      </Tooltip>

      <div className="manager-sidebar-rail-tabs" aria-label={`${tabs.length} visible open tabs`}>
        {tabs.map((tab) => {
          const title = tab.title || tab.url || 'Untitled tab';
          return (
            <Tooltip key={`${tab.windowId ?? 'window'}-${tab.id ?? tab.index}`} label={title} position="right">
              <ActionIcon
                className="manager-sidebar-rail-tab"
                variant="subtle"
                aria-label={`Focus ${title}`}
                aria-current={tab.active ? 'page' : undefined}
                data-active={tab.active || undefined}
                data-pinned={tab.pinned || undefined}
                onClick={() => onFocusTab(tab.id)}
              >
                <IconBrowser className="manager-sidebar-rail-tab__fallback" size={16} aria-hidden="true" />
                {tab.favIconUrl && (
                  <img
                    src={tab.favIconUrl}
                    alt=""
                    onLoad={(event) => {
                      event.currentTarget.dataset.loaded = 'true';
                    }}
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                )}
              </ActionIcon>
            </Tooltip>
          );
        })}
      </div>

      <Tooltip label="Filter open tabs" position="right">
        <ActionIcon
          className="manager-sidebar-rail-filter"
          variant="subtle"
          aria-label="Filter open tabs"
          onClick={onFocusFilter}
        >
          <IconSearch size={17} />
        </ActionIcon>
      </Tooltip>
    </div>
  );
}

interface SidebarProps {
  workspaceId: string;
  category: CategoryFilter;
  showBin: boolean;
  sidebarCollapsed: boolean;
  sidebarExpanded: boolean;
  sidebarToggleRef: RefObject<HTMLButtonElement>;
  sidebarRailToggleRef: RefObject<HTMLButtonElement>;
  onToggleSidebar: (expanded: boolean) => void;
  onSelectionModeChange?: (selectionMode: boolean) => void;
  onOpenTabsSourceKeyChange?: (key: string) => void;
  workflow: OpenTabsWorkflow;
  onCaptureCompleted: (completion: CaptureCompletion | null) => void;
}

export function Sidebar({
  workspaceId,
  category,
  showBin,
  sidebarCollapsed,
  sidebarExpanded,
  sidebarToggleRef,
  sidebarRailToggleRef,
  onToggleSidebar,
  onSelectionModeChange,
  onOpenTabsSourceKeyChange,
  workflow: openTabs,
  onCaptureCompleted,
}: SidebarProps) {
  useEffect(() => {
    onSelectionModeChange?.(openTabs.model.selection.active);
    return () => onSelectionModeChange?.(false);
  }, [onSelectionModeChange, openTabs.model.selection.active]);
  const currentCategorySnapshot: CaptureCategorySnapshot = {
    showBin,
    category,
  };
  const categorySnapshotRef = useRef(currentCategorySnapshot);
  categorySnapshotRef.current = currentCategorySnapshot;
  const captureSelectedTabs = () => {
    const categorySnapshot = { ...categorySnapshotRef.current };
    return openTabs.commands.captureSelection(
      categorySnapshot,
      () => ({ ...categorySnapshotRef.current }),
    ).then((completion) => {
      onCaptureCompleted(completion);
      return completion;
    });
  };
  const focusFilter = () => document.getElementById(OPEN_TABS_FILTER_INPUT_ID)?.focus();
  const focusTab = (tabId: number | undefined) => {
    if (!Number.isSafeInteger(tabId)) return;
    document.querySelector<HTMLElement>(
      `.manager-open-tab-row[data-open-tab-id="${tabId}"] [data-info-popover="open"]`,
    )?.focus();
  };

  return (
    <div className="manager-sidebar__overlay">
        <Stack gap={0} className="manager-sidebar-content">
          <Box className="manager-open-tabs">
            <OpenTabsPanel
              workspaceId={workspaceId}
              workflow={openTabs}
              sidebarPinned={sidebarExpanded}
              onCaptureSelectedTabs={captureSelectedTabs}
              sidebarToggleRef={sidebarToggleRef}
              onToggleSidebar={onToggleSidebar}
              onSourceKeyChange={onOpenTabsSourceKeyChange}
            />
          </Box>
        </Stack>
    </div>
  );
}
