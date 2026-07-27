import { useEffect, useMemo, useState } from 'react';
import { Group } from '@mantine/core';
import type { CategoryFilter } from '../../core/selectors';
import { useFilteredGroups } from '../../hooks/useBoardProjection';
import { useCaptureReveal } from '../../hooks/useCaptureReveal';
import { useManagerPageState } from '../../hooks/useManagerPageState';
import { useManagerRuntime } from '../../hooks/useManagerRuntime';
import {
  ManagerOverlayPortal,
  ManagerOverlaysProvider,
} from '../../hooks/useManagerOverlays';
import { useOpenTabsRuntime } from '../../hooks/useOpenTabsRuntime';
import { useSidebarDisclosure } from '../../hooks/useSidebarDisclosure';
import { useToast } from '../../hooks/useToast';
import { useCurrentWorkspace } from '../../hooks/useWorkspaceState';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import { BinView } from '../bin/BinView';
import { ExportModal } from '../import-export/ExportModal';
import { ImportModal } from '../import-export/ImportModal';
import { Sidebar } from '../sidebar/Sidebar';
import { WorkspaceContent } from '../workspace/WorkspaceContent';
import { WorkspaceHeader } from '../workspace/WorkspaceHeader';
import {
  ManagerDndCoordinator,
  type ManagerDndState,
} from './ManagerDndCoordinator';
import { ManagerFrame } from './ManagerFrame';
import { useToastNotifications } from './useToastNotifications';

export function getWorkspaceFiltersAfterDelete(): {
  category: 'inbox';
  showBin: false;
} {
  return { category: 'inbox', showBin: false };
}

export function ManagerLayout() {
  const sidebar = useSidebarDisclosure();
  const [sidebarSelectionOpen, setSidebarSelectionOpen] = useState(false);
  const [sidebarPreviewOpen, setSidebarPreviewOpen] = useState(false);
  const [importModalOpened, setImportModalOpened] = useState(false);
  const [exportModalOpened, setExportModalOpened] = useState(false);

  const activeWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);
  const workspaces = useTabBoardStore((state) => state.workspaces);
  const folders = useTabBoardStore((state) => state.folders);
  const setActiveWorkspace = useTabBoardStore((state) => state.setActiveWorkspace);
  const applyDropIntent = useTabBoardStore((state) => state.applyDropIntent);
  const pageValidationState = useMemo(() => ({
    activeWorkspaceId,
    workspaces,
    folders,
  }), [activeWorkspaceId, folders, workspaces]);
  const pageState = useManagerPageState(pageValidationState);
  const selectedCategory = pageState.state.category;
  const showBin = pageState.state.view === 'bin';
  const groups = useFilteredGroups(showBin ? 'inbox' : selectedCategory);
  const workspace = useCurrentWorkspace();
  const runtime = useManagerRuntime();
  const openTabsWorkflow = useOpenTabsRuntime();
  const { showSuccess, showInfo, showError } = useToast();
  const { highlightedGroupId, handleCaptureCompleted } = useCaptureReveal({
    activeWorkspaceId,
    groups,
    selectedCategory,
    showBin,
    searchQuery: pageState.state.query,
    tabFilterUrl: openTabsWorkflow.model.tabFilterUrl,
    pageState,
    showSuccess,
    showInfo,
    showError,
  });

  useEffect(() => {
    if (pageState.state.workspaceId !== activeWorkspaceId) {
      setActiveWorkspace(pageState.state.workspaceId);
    }
  }, [activeWorkspaceId, pageState.state.workspaceId, setActiveWorkspace]);

  useToastNotifications();

  const renderFrame = (dnd: ManagerDndState) => (
    <ManagerFrame
      dragActive={Boolean(dnd.activeId)}
      sidebarCollapsed={sidebar.collapsed}
      sidebarOverlayOpen={
        sidebar.overlayOpen
        || sidebarSelectionOpen
        || sidebarPreviewOpen
      }
      sidebarHoverSuppressed={sidebar.hoverSuppressed}
      openTabsDragActive={
        Boolean(dnd.activeId)
        && dnd.dragUiState.payload?.kind === 'open-tabs'
      }
      dragMarkerKind={dnd.dragUiState.marker?.kind}
      dragTargetKind={dnd.dragUiState.target?.kind}
      onSidebarMouseLeave={() => sidebar.setHoverSuppressed(false)}
      header={(
        <Group className="manager-topbar-inner" px="sm" gap={0} wrap="nowrap">
          <WorkspaceHeader
            selectedCategory={selectedCategory}
            showBin={showBin}
            dragMarker={dnd.dragUiState.marker}
            onSelectCategory={(category: CategoryFilter) =>
              pageState.navigate({ category, view: 'board' })}
            onSelectWorkspace={(workspaceId) => {
              setActiveWorkspace(workspaceId);
              pageState.navigate({
                workspaceId,
                category: 'inbox',
                view: 'board',
              });
            }}
            onToggleBin={() => pageState.navigate({
              view: showBin ? 'board' : 'bin',
            })}
            onOpenImport={() => setImportModalOpened(true)}
            onOpenExport={() => setExportModalOpened(true)}
          />
        </Group>
      )}
      sidebar={(
        <Sidebar
          workspaceId={workspace?.id ?? activeWorkspaceId}
          category={selectedCategory}
          showBin={showBin}
          sidebarCollapsed={sidebar.collapsed}
          sidebarExpanded={
            !sidebar.collapsed
            || sidebar.overlayOpen
            || sidebarSelectionOpen
            || sidebarPreviewOpen
          }
          sidebarToggleRef={sidebar.expandedToggleRef}
          sidebarRailToggleRef={sidebar.compactToggleRef}
          onToggleSidebar={sidebar.toggle}
          onSelectionModeChange={setSidebarSelectionOpen}
          onOpenTabsSourceKeyChange={dnd.onOpenTabsSourceKeyChange}
          workflow={openTabsWorkflow}
          onCaptureCompleted={handleCaptureCompleted}
        />
      )}
      main={(
        <div className="manager-main-content">
          {showBin ? (
            <BinView />
          ) : (
            <WorkspaceContent
              category={selectedCategory}
              workspaceName={workspace?.name || 'Workspace'}
              runtime={runtime}
              highlightedGroupId={highlightedGroupId}
              dragMarker={dnd.dragUiState.marker}
              sourceRect={dnd.dragUiState.sourceRect}
            />
          )}
        </div>
      )}
      dialogs={(
        <>
          <ImportModal
            opened={importModalOpened}
            onClose={() => setImportModalOpened(false)}
            category={selectedCategory}
          />
          <ExportModal
            opened={exportModalOpened}
            onClose={() => setExportModalOpened(false)}
          />
        </>
      )}
    />
  );

  return (
    <ManagerOverlaysProvider
      workspaceKey={workspace?.id}
      categoryKey={`${selectedCategory}:${showBin ? 'bin' : 'workspace'}`}
      itemKey={groups.map((group) => `${group.id}:${group.updatedAt}`).join('|')}
    >
      <ManagerDndCoordinator
        activeWorkspaceId={activeWorkspaceId}
        selectedCategory={selectedCategory}
        showBin={showBin}
        groups={groups}
        runtime={runtime}
        openTabsWorkflow={openTabsWorkflow}
        applyDropIntent={applyDropIntent}
        showSuccess={showSuccess}
        showError={showError}
      >
        {renderFrame}
      </ManagerDndCoordinator>
      <ManagerOverlayPortal onOpenTabPreviewChange={setSidebarPreviewOpen} />
    </ManagerOverlaysProvider>
  );
}
