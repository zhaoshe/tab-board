import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Group } from '@mantine/core';
import { useShallow } from 'zustand/react/shallow';
import type { Workspace } from '../../../shared/model';
import type { Group as SessionGroup } from '../../../shared/model';
import type { DragMarker } from '../../core/dnd';
import {
  getCategoryStrip,
  type CategoryFilter,
} from '../../core/selectors';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import { useManagerOverlayCommands } from '../../hooks/useManagerOverlays';
import { WorkspaceMenu } from './WorkspaceMenu';
import {
  CategoryNav,
  isCategoryDragMarkerFor,
} from './CategoryNav';
import {
  CategoryManager,
  runCategoryMutation,
  runValidatedCategoryMutation,
} from './CategoryManager';
import {
  ManagerSearchCommand,
  SEARCH_INPUT_ID,
  collapseSearchState,
  getInitialSearchExpanded,
  shouldExpandSearchShortcut,
} from './ManagerSearchCommand';
import { ManagerGlobalActions } from './ManagerGlobalActions';

export {
  SEARCH_INPUT_ID,
  collapseSearchState,
  getInitialSearchExpanded,
  isCategoryDragMarkerFor,
  runCategoryMutation,
  runValidatedCategoryMutation,
  shouldExpandSearchShortcut,
};

export interface WorkspaceHeaderProps {
  selectedCategory: CategoryFilter;
  showBin: boolean;
  bookmarkGroups?: readonly SessionGroup[];
  dragMarker?: DragMarker | null;
  onSelectCategory: (category: CategoryFilter) => void;
  onSelectWorkspace: (
    workspaceId: string,
    category?: CategoryFilter,
    method?: 'push' | 'replace',
  ) => void;
  onToggleBin: () => void;
  onOpenImport: () => void;
  onOpenExport: () => void;
}

export function usePendingCreatedWorkspaceNavigation({
  workspaces,
  onSelectWorkspace,
}: {
  workspaces: readonly Workspace[];
  onSelectWorkspace: (workspaceId: string, category: 'inbox') => void;
}): (workspaceId: string) => void {
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string | null>(null);
  const pendingWorkspaceIdRef = useRef<string | null>(null);

  useEffect(() => {
    const workspaceId = pendingWorkspaceIdRef.current;
    if (
      !workspaceId
      || workspaceId !== pendingWorkspaceId
      || !workspaces.some(({ id }) => id === workspaceId)
    ) {
      return;
    }
    pendingWorkspaceIdRef.current = null;
    setPendingWorkspaceId((current) => current === workspaceId ? null : current);
    onSelectWorkspace(workspaceId, 'inbox');
  }, [
    onSelectWorkspace,
    pendingWorkspaceId,
    workspaces,
  ]);

  return useCallback((workspaceId: string) => {
    pendingWorkspaceIdRef.current = workspaceId;
    setPendingWorkspaceId(workspaceId);
  }, []);
}

export function WorkspaceHeader({
  selectedCategory,
  showBin,
  bookmarkGroups = [],
  dragMarker,
  onSelectCategory,
  onSelectWorkspace,
  onToggleBin,
  onOpenImport,
  onOpenExport,
}: WorkspaceHeaderProps) {
  const state = useTabBoardStore(
    useShallow((currentState) => ({
      activeWorkspaceId: currentState.activeWorkspaceId,
      workspaces: currentState.workspaces,
      folders: currentState.folders,
      groups: currentState.groups,
      categoryOrderByWorkspace: currentState.categoryOrderByWorkspace,
      addWorkspace: currentState.addWorkspace,
      updateWorkspace: currentState.updateWorkspace,
      updateWorkspaceOrder: currentState.updateWorkspaceOrder,
      deleteWorkspace: currentState.deleteWorkspace,
      addFolder: currentState.addFolder,
      updateFolder: currentState.updateFolder,
      deleteFolder: currentState.deleteFolder,
      updateCategoryOrder: currentState.updateCategoryOrder,
      confirmBeforeDestructive: currentState.settings.confirmBeforeDestructive,
    })),
  );
  const { closeOverlays } = useManagerOverlayCommands();
  const [searchExpanded, setSearchExpanded] = useState(false);
  const queueCreatedWorkspaceNavigation = usePendingCreatedWorkspaceNavigation({
    workspaces: state.workspaces,
    onSelectWorkspace,
  });
  const workspace = state.workspaces.find(({ id }) => id === state.activeWorkspaceId)
    ?? state.workspaces[0];
  const folders = state.folders.filter(({ workspaceId }) => workspaceId === workspace?.id);
  const categories = getCategoryStrip({
    activeWorkspaceId: state.activeWorkspaceId,
    workspaces: state.workspaces,
    folders: state.folders,
    groups: state.groups,
    bookmarkGroups,
    categoryOrderByWorkspace: state.categoryOrderByWorkspace,
  });

  return (
    <Group
      className={[
        'workspace-header',
        searchExpanded && 'workspace-header--search-expanded',
      ].filter(Boolean).join(' ')}
      gap={0}
      wrap="nowrap"
      style={{ flex: 1, minWidth: 0 }}
    >
      <WorkspaceMenu
        activeWorkspaceId={state.activeWorkspaceId}
        confirmBeforeDestructive={state.confirmBeforeDestructive}
        workspaces={state.workspaces}
        groups={state.groups}
        folders={state.folders}
        onSelect={(workspaceId) => {
          closeOverlays();
          onSelectWorkspace(workspaceId);
        }}
        onCreate={({ name, emoji }) => {
          const workspaceId = state.addWorkspace(name, emoji);
          queueCreatedWorkspaceNavigation(workspaceId);
        }}
        onUpdateWorkspace={state.updateWorkspace}
        onUpdateWorkspaceOrder={state.updateWorkspaceOrder}
        onDeleteWorkspace={state.deleteWorkspace}
        onActiveWorkspaceDeleted={(workspaceId) => {
          onSelectWorkspace(workspaceId, 'inbox', 'replace');
        }}
      />

      <div className="manager-category-strip">
        <CategoryNav
          categories={categories}
          workspaceId={state.activeWorkspaceId}
          selectedCategory={selectedCategory}
          showBin={showBin}
          dragMarker={dragMarker}
          onSelect={(category) => {
            closeOverlays();
            onSelectCategory(category);
          }}
        />
        {workspace && (
          <CategoryManager
            workspaceId={workspace.id}
            confirmBeforeDestructive={state.confirmBeforeDestructive}
            categories={categories}
            folders={folders}
            groups={state.groups}
            selectedCategory={selectedCategory}
            onSelectCategory={onSelectCategory}
            onAddFolder={(name, color) => state.addFolder(workspace.id, name, color)}
            onUpdateFolder={state.updateFolder}
            onDeleteFolder={state.deleteFolder}
            onUpdateOrder={(order, { expectedCategoryOrder }) =>
              state.updateCategoryOrder(
                workspace.id,
                order,
                { expectedCategoryOrder },
              )}
          />
        )}
      </div>

      <ManagerSearchCommand
        category={showBin ? 'inbox' : selectedCategory}
        bookmarkGroups={bookmarkGroups}
        onExpandedChange={setSearchExpanded}
      />

      <ManagerGlobalActions
        showBin={showBin}
        onOpenImport={onOpenImport}
        onOpenExport={onOpenExport}
        onToggleBin={onToggleBin}
      />
    </Group>
  );
}
