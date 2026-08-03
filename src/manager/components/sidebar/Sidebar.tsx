import { useRef, type RefObject } from 'react';
import { Box, Stack } from '@mantine/core';
import { OpenTabsPanel } from './OpenTabsPanel';
import {
  type CaptureCompletion,
  type OpenTabsWorkflow,
} from '../../hooks/useOpenTabsRuntime';
import type { CaptureCategorySnapshot } from '../../core/capture';
import type { CategoryFilter } from '../../core/selectors';
import type { ManagerSelectionScope } from '../../hooks/useManagerSelectionScope';
import type { OpenSessionTargetPickerInput } from '../shell/SessionTargetPicker';
import type { SidebarDisclosureState } from '../../hooks/useSidebarDisclosure';

interface SidebarProps {
  workspaceId: string;
  category: CategoryFilter;
  showBin: boolean;
  sidebarState: SidebarDisclosureState;
  sidebarToggleRef: RefObject<HTMLButtonElement>;
  sidebarRailToggleRef: RefObject<HTMLButtonElement>;
  onToggleSidebar: (expanded: boolean) => void;
  onPinSidebar: () => void;
  onPromoteSidebar: () => void;
  onOpenTabsSourceKeyChange?: (key: unknown) => void;
  selectionScope: ManagerSelectionScope;
  onOpenSessionTargetPicker: (input: OpenSessionTargetPickerInput) => void;
  workflow: OpenTabsWorkflow;
  onCaptureCompleted: (completion: CaptureCompletion | null) => void;
}

export function Sidebar({
  workspaceId,
  category,
  showBin,
  sidebarState,
  sidebarToggleRef,
  sidebarRailToggleRef,
  onToggleSidebar,
  onPinSidebar,
  onPromoteSidebar,
  onOpenTabsSourceKeyChange,
  selectionScope,
  onOpenSessionTargetPicker,
  workflow: openTabs,
  onCaptureCompleted,
}: SidebarProps) {
  const currentCategorySnapshot: CaptureCategorySnapshot = {
    showBin,
    category,
  };
  const categorySnapshotRef = useRef(currentCategorySnapshot);
  categorySnapshotRef.current = currentCategorySnapshot;
  const capture = (
    operation: OpenTabsWorkflow['commands']['captureSelection'],
  ) => {
    const categorySnapshot = { ...categorySnapshotRef.current };
    return operation(
      categorySnapshot,
      () => ({ ...categorySnapshotRef.current }),
    ).then((completion) => {
      onCaptureCompleted(completion);
      return completion;
    });
  };
  const captureSelectedWindow = () => capture(openTabs.commands.captureWindow);
  const captureSelectedTabs = () => capture(openTabs.commands.captureSelection);
  return (
    <div className="manager-sidebar__overlay">
        <Stack gap={0} className="manager-sidebar-content">
          <Box className="manager-open-tabs">
            <OpenTabsPanel
              workspaceId={workspaceId}
              workflow={openTabs}
              sidebarState={sidebarState}
              onCaptureSelectedWindow={captureSelectedWindow}
              onCaptureSelectedTabs={captureSelectedTabs}
              sidebarToggleRef={sidebarToggleRef}
              sidebarCompactToggleRef={sidebarRailToggleRef}
              onToggleSidebar={onToggleSidebar}
              onPinSidebar={onPinSidebar}
              onPromoteSidebar={onPromoteSidebar}
              onSourceKeyChange={onOpenTabsSourceKeyChange}
              selectionScope={selectionScope}
              onOpenSessionTargetPicker={onOpenSessionTargetPicker}
            />
          </Box>
        </Stack>
    </div>
  );
}
