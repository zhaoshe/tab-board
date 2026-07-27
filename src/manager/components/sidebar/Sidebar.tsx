import { useEffect, useRef, type RefObject } from 'react';
import { Box, Stack } from '@mantine/core';
import { OpenTabsPanel } from './OpenTabsPanel';
import {
  type CaptureCompletion,
  type OpenTabsWorkflow,
} from '../../hooks/useOpenTabsRuntime';
import type { CaptureCategorySnapshot } from '../../core/capture';
import type { CategoryFilter } from '../../core/selectors';

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
              sidebarCompactToggleRef={sidebarRailToggleRef}
              onToggleSidebar={onToggleSidebar}
              onSourceKeyChange={onOpenTabsSourceKeyChange}
            />
          </Box>
        </Stack>
    </div>
  );
}
