import { useEffect, useMemo, useRef, useState } from 'react';
import { Group } from '@mantine/core';
import type { CategoryFilter } from '../../core/selectors';
import {
  shouldExitForOpenTabsSource,
  shouldExitForSidebarCollapse,
} from '../../core/selectionScope';
import { useFilteredGroups } from '../../hooks/useBoardProjection';
import { useCaptureReveal } from '../../hooks/useCaptureReveal';
import { useManagerPageState } from '../../hooks/useManagerPageState';
import { useManagerRuntime } from '../../hooks/useManagerRuntime';
import { useManagerSelectionScope } from '../../hooks/useManagerSelectionScope';
import { useBookmarkSessions } from '../../hooks/useBookmarkSessions';
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
import {
  createSessionTargetChoices,
  createSessionTargetChoiceLabels,
  createSessionTargetIntent,
  SessionTargetPicker,
  type OpenSessionTargetPickerInput,
} from './SessionTargetPicker';

export function getWorkspaceFiltersAfterDelete(): {
  category: 'inbox';
  showBin: false;
} {
  return { category: 'inbox', showBin: false };
}

export function shouldSyncActiveWorkspace(
  pageWorkspaceId: string,
  activeWorkspaceId: string,
  workspaces: readonly { id: string }[],
): boolean {
  return pageWorkspaceId !== activeWorkspaceId
    && workspaces.some(({ id }) => id === pageWorkspaceId);
}

export function ManagerLayout() {
  const sidebar = useSidebarDisclosure();
  const [importModalOpened, setImportModalOpened] = useState(false);
  const [exportModalOpened, setExportModalOpened] = useState(false);
  const [sessionTargetPicker, setSessionTargetPicker] =
    useState<OpenSessionTargetPickerInput | null>(null);

  const activeWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);
  const workspaces = useTabBoardStore((state) => state.workspaces);
  const folders = useTabBoardStore((state) => state.folders);
  const allGroups = useTabBoardStore((state) => state.groups);
  const categoryOrderByWorkspace = useTabBoardStore(
    (state) => state.categoryOrderByWorkspace,
  );
  const setActiveWorkspace = useTabBoardStore((state) => state.setActiveWorkspace);
  const applyDropIntent = useTabBoardStore((state) => state.applyDropIntent);
  const settings = useTabBoardStore((state) => state.settings);
  const pageValidationState = useMemo(() => ({
    activeWorkspaceId,
    workspaces,
    folders,
    groups: allGroups,
    categoryOrderByWorkspace,
  }), [
    activeWorkspaceId,
    allGroups,
    categoryOrderByWorkspace,
    folders,
    workspaces,
  ]);
  const pageState = useManagerPageState(pageValidationState);
  const selectedCategory = pageState.state.category;
  const showBin = pageState.state.view === 'bin';
  const groups = useFilteredGroups(showBin ? 'inbox' : selectedCategory);
  const workspace = useCurrentWorkspace();
  const bookmarkGroups = useBookmarkSessions(workspace?.id ?? activeWorkspaceId);
  const runtime = useManagerRuntime();
  const openTabsWorkflow = useOpenTabsRuntime();
  const selectionScope = useManagerSelectionScope();
  const previousSidebarCollapsedRef = useRef(sidebar.state === 'collapsed');
  const { showSuccess, showInfo, showError } = useToast();
  const sessionTargetChoices = useMemo(() => sessionTargetPicker
    ? createSessionTargetChoices({
        mode: sessionTargetPicker.mode,
        state: {
          ...useTabBoardStore.getState(),
          groups: allGroups,
          folders,
          workspaces,
          categoryOrderByWorkspace,
          activeWorkspaceId,
          settings,
        },
        workspaceId: activeWorkspaceId,
        source: sessionTargetPicker.source,
      })
    : [], [
    activeWorkspaceId,
    allGroups,
    categoryOrderByWorkspace,
    folders,
    sessionTargetPicker,
    settings,
    workspaces,
  ]);
  const sessionTargetChoiceLabels = useMemo(() =>
    createSessionTargetChoiceLabels({
      state: {
        ...useTabBoardStore.getState(),
        groups: allGroups,
        folders,
        workspaces,
        categoryOrderByWorkspace,
        activeWorkspaceId,
        settings,
      },
      workspaceId: activeWorkspaceId,
      choices: sessionTargetChoices,
    }), [
    activeWorkspaceId,
    allGroups,
    categoryOrderByWorkspace,
    folders,
    sessionTargetChoices,
    settings,
    workspaces,
  ]);
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
    if (shouldSyncActiveWorkspace(
      pageState.state.workspaceId,
      activeWorkspaceId,
      workspaces,
    )) {
      setActiveWorkspace(pageState.state.workspaceId);
    }
  }, [
    activeWorkspaceId,
    pageState.state.workspaceId,
    setActiveWorkspace,
    workspaces,
  ]);

  useToastNotifications();

  useEffect(() => {
    const wasCollapsed = previousSidebarCollapsedRef.current;
    const collapsed = sidebar.state === 'collapsed';
    previousSidebarCollapsedRef.current = collapsed;
    if (shouldExitForSidebarCollapse(
      selectionScope.scope,
      wasCollapsed,
      collapsed,
    )) {
      selectionScope.commands.exit();
    }
  }, [selectionScope.commands, selectionScope.scope, sidebar.state]);

  useEffect(() => {
    if (shouldExitForOpenTabsSource(
      selectionScope.scope,
      openTabsWorkflow.model.selectedWindowId,
    )) {
      selectionScope.commands.exit();
    }
  }, [
    openTabsWorkflow.model.selectedWindowId,
    selectionScope.commands,
    selectionScope.scope,
  ]);

  const toggleSidebar = (expanded: boolean) => {
    if (!expanded) selectionScope.commands.exit();
    sidebar.toggle(expanded);
  };

  const renderFrame = (dnd: ManagerDndState) => (
    <ManagerFrame
      dragActive={Boolean(dnd.activeId)}
      sidebarState={sidebar.state}
      openTabsDragActive={
        Boolean(dnd.activeId)
        && dnd.dragUiState.payload?.kind === 'open-tabs'
      }
      dragMarkerKind={dnd.dragUiState.marker?.kind}
      dragTargetKind={dnd.dragUiState.target?.kind}
      onSidebarPointerIntent={(active) =>
        sidebar.setPeekIntent('pointer', active)}
      onSidebarFocusIntent={(active, options) =>
        sidebar.setPeekIntent('focus', active, options)}
      header={(
        <Group className="manager-topbar-inner" px="sm" gap={0} wrap="nowrap">
          <WorkspaceHeader
            selectedCategory={selectedCategory}
            showBin={showBin}
            bookmarkGroups={bookmarkGroups}
            dragMarker={dnd.dragUiState.marker}
            onSelectCategory={(category: CategoryFilter) =>
              pageState.navigate({ category, view: 'board' })}
            onSelectWorkspace={(workspaceId, category, method = 'push') => {
              pageState[method === 'replace' ? 'replace' : 'navigate']({
                workspaceId,
                ...(category ? { category } : {}),
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
          sidebarState={sidebar.state}
          sidebarToggleRef={sidebar.expandedToggleRef}
          sidebarRailToggleRef={sidebar.compactToggleRef}
          onToggleSidebar={toggleSidebar}
          onPinSidebar={sidebar.pin}
          onPromoteSidebar={sidebar.promote}
          onOpenTabsSourceKeyChange={dnd.onOpenTabsSourceKeyChange}
          selectionScope={selectionScope}
          onOpenSessionTargetPicker={(input) => {
            input.trigger.focus();
            setSessionTargetPicker(input);
          }}
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
              bookmarkGroups={bookmarkGroups}
              category={selectedCategory}
              workspaceName={workspace?.name || 'Workspace'}
              runtime={runtime}
              registerBoardElement={dnd.registerBoardElement}
              activeDragPayload={dnd.dragUiState.payload}
              activeDropTarget={dnd.dragUiState.target}
              highlightedGroupId={highlightedGroupId}
              dragMarker={dnd.dragUiState.marker}
              sourceRect={dnd.dragUiState.sourceRect}
              selectionScope={selectionScope}
              onOpenSessionTargetPicker={(input) => {
                input.trigger.focus();
                setSessionTargetPicker(input);
              }}
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
          <SessionTargetPicker
            opened={sessionTargetPicker !== null}
            mode={sessionTargetPicker?.mode ?? 'move-saved-tabs'}
            choices={sessionTargetChoices}
            choiceLabels={sessionTargetChoiceLabels}
            onPreview={() => undefined}
            onCancel={() => setSessionTargetPicker(null)}
            onCommit={async (choice) => {
              if (!sessionTargetPicker) return;
              try {
                const intent = createSessionTargetIntent({
                  mode: sessionTargetPicker.mode,
                  choice,
                  workspaceId: activeWorkspaceId,
                  source: sessionTargetPicker.source,
                });
                if (!intent) {
                  throw new Error('The selected target is unavailable.');
                }
                await applyDropIntent(
                  intent,
                  sessionTargetPicker.source.kind === 'open-tabs'
                    ? sessionTargetPicker.source.records
                    : [],
                  { authority: 'checked' },
                );
                if (sessionTargetPicker.source.kind === 'open-tabs') {
                  openTabsWorkflow.commands.completeDrop();
                } else if (sessionTargetPicker.source.kind === 'saved-tabs') {
                  selectionScope.commands.exit();
                }
                setSessionTargetPicker(null);
              } catch (error: unknown) {
                showError(
                  error instanceof Error ? error.message : String(error),
                  'Move failed',
                );
                throw error;
              }
            }}
          />
        </>
      )}
    />
  );

  return (
    <ManagerOverlaysProvider
      workspaceKey={workspace?.id}
      categoryKey={`${selectedCategory}:${showBin ? 'bin' : 'workspace'}`}
      groupItems={groups}
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
      <ManagerOverlayPortal />
    </ManagerOverlaysProvider>
  );
}
