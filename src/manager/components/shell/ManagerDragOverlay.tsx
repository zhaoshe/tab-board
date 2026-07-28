import type { Group, TabItem } from '../../../shared/model';
import { formatNumber } from '../../../shared/utils/formatters';
import type { DragUiState } from '../../core/dnd';
import type { ManagerRuntime } from '../../hooks/useManagerRuntime';
import { SessionCard } from '../sessions/SessionCard';
import { TabItemRow } from '../sessions/TabItemRow';

export function ManagerDragOverlay({
  activeWorkspaceId,
  activeGroup,
  activeTabInfo,
  dragUiState,
  groups,
  runtime,
}: {
  activeWorkspaceId: string;
  activeGroup: Group | undefined;
  activeTabInfo: { tab: TabItem; groupId: string } | null;
  dragUiState: DragUiState;
  groups: Group[];
  runtime: ManagerRuntime;
}) {
  const style = {
    width: dragUiState.sourceRect?.width,
    height: dragUiState.sourceRect?.height,
    opacity: dragUiState.payload?.kind === 'group' ? 0.5 : 1,
    pointerEvents: 'none' as const,
  };

  return (
    <div
      className="manager-drag-overlay__preview"
      style={style}
      aria-hidden="true"
    >
      {dragUiState.payload?.kind === 'category' ? (
        <div className="manager-drag-overlay__label">
          {dragUiState.payload.categoryId}
        </div>
      ) : dragUiState.payload?.kind === 'tabs' ? (
        <div className="manager-drag-overlay__stack">
          {activeTabInfo && (
            <TabItemRow
              tab={activeTabInfo.tab}
              groupId={activeTabInfo.groupId}
              workspaceId={activeWorkspaceId}
              tabIndex={groups.find(({ id }) => id === activeTabInfo.groupId)
                ?.tabs.findIndex(({ id }) => id === activeTabInfo.tab.id) ?? 0}
              selectedRefs={[]}
              runtime={runtime}
              isDragOverlay
            />
          )}
          <span className="manager-drag-overlay__label tabular-nums">
            {formatNumber(dragUiState.payload.refs.length)} saved tabs
          </span>
        </div>
      ) : dragUiState.payload?.kind === 'open-tabs' ? (
        <div className="manager-drag-overlay__stack">
          {dragUiState.payload.tabIds.slice(0, 3).map((tabId) => (
            <span
              key={tabId}
              className="manager-drag-overlay__row-silhouette"
              aria-hidden="true"
            />
          ))}
          <span className="manager-drag-overlay__label tabular-nums">
            {formatNumber(dragUiState.payload.tabIds.length)} open tabs
          </span>
        </div>
      ) : activeGroup ? (
        <SessionCard group={activeGroup} runtime={runtime} isDragOverlay />
      ) : activeTabInfo ? (
        <TabItemRow
          tab={activeTabInfo.tab}
          groupId={activeTabInfo.groupId}
          workspaceId={activeWorkspaceId}
          tabIndex={groups.find(({ id }) => id === activeTabInfo.groupId)
            ?.tabs.findIndex(({ id }) => id === activeTabInfo.tab.id) ?? 0}
          selectedRefs={[]}
          runtime={runtime}
          isDragOverlay
        />
      ) : null}
    </div>
  );
}
