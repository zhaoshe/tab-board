import { useTabBoardStore } from '../../shared/store/useTabBoardStore';
import type { Workspace } from '../../shared/model';

export function useCurrentWorkspace(): Workspace | undefined {
  const workspaces = useTabBoardStore((state) => state.workspaces);
  const activeWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);
  return workspaces.find((workspace) => workspace.id === activeWorkspaceId)
    ?? workspaces[0];
}
