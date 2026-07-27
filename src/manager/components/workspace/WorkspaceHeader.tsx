import { useState } from 'react';
import { Group } from '@mantine/core';
import { useShallow } from 'zustand/react/shallow';
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
  dragMarker?: DragMarker | null;
  onSelectCategory: (category: CategoryFilter) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onToggleBin: () => void;
  onOpenImport: () => void;
  onOpenExport: () => void;
}

export function WorkspaceHeader({
  selectedCategory,
  showBin,
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
      renameWorkspace: currentState.renameWorkspace,
      addFolder: currentState.addFolder,
      renameFolder: currentState.renameFolder,
      deleteFolder: currentState.deleteFolder,
      updateCategoryOrder: currentState.updateCategoryOrder,
    })),
  );
  const { closeOverlays } = useManagerOverlayCommands();
  const [searchExpanded, setSearchExpanded] = useState(false);
  const workspace = state.workspaces.find(({ id }) => id === state.activeWorkspaceId)
    ?? state.workspaces[0];
  const folders = state.folders.filter(({ workspaceId }) => workspaceId === workspace?.id);
  const categories = getCategoryStrip({
    activeWorkspaceId: state.activeWorkspaceId,
    workspaces: state.workspaces,
    folders: state.folders,
    groups: state.groups,
    categoryOrderByWorkspace: state.categoryOrderByWorkspace,
  });

  return (
    <Group
      className={`workspace-header${searchExpanded ? ' workspace-header--search-expanded' : ''}`}
      gap={0}
      wrap="nowrap"
      style={{ flex: 1, minWidth: 0 }}
    >
      <WorkspaceMenu
        activeWorkspaceId={state.activeWorkspaceId}
        workspaces={state.workspaces}
        onSelect={(workspaceId) => {
          closeOverlays();
          onSelectWorkspace(workspaceId);
        }}
        onCreate={(name) => {
          state.addWorkspace(name);
          onSelectCategory('inbox');
        }}
        onRename={state.renameWorkspace}
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
            categories={categories}
            folders={folders}
            selectedCategory={selectedCategory}
            onSelectCategory={onSelectCategory}
            onAddFolder={(name, color) => state.addFolder(workspace.id, name, color)}
            onRenameFolder={state.renameFolder}
            onDeleteFolder={state.deleteFolder}
            onUpdateOrder={(order) => state.updateCategoryOrder(workspace.id, order)}
          />
        )}
      </div>

      <ManagerSearchCommand
        category={showBin ? 'inbox' : selectedCategory}
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
