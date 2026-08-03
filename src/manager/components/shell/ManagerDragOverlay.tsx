import type { Group } from '../../../shared/model';
import { formatNumber } from '../../../shared/utils/formatters';
import type { CSSProperties } from 'react';
import type { DragUiState } from '../../core/dnd';
import type { ManagerRuntime } from '../../hooks/useManagerRuntime';
import { SessionCard } from '../sessions/SessionCard';

type DragPreviewStyle = CSSProperties & {
  '--drag-preview-columns'?: number;
  '--drag-preview-rows'?: number;
};

export function ManagerDragOverlay({
  activeGroup,
  dragUiState,
  runtime,
}: {
  activeGroup: Group | undefined;
  dragUiState: DragUiState;
  runtime: ManagerRuntime;
}) {
  const isItemPreview = dragUiState.payload?.kind === 'tab'
    || dragUiState.payload?.kind === 'tabs'
    || dragUiState.payload?.kind === 'open-tabs';
  const previewRect = dragUiState.previewRect ?? dragUiState.sourceRect;
  const previewLayout = dragUiState.previewLayout ?? {
    columns: 1,
    mode: 'details' as const,
    rows: 1,
  };
  const style: DragPreviewStyle = {
    width: previewRect?.width,
    height: previewRect?.height,
    maxWidth: previewRect?.width,
    maxHeight: previewRect?.height,
    opacity: dragUiState.payload?.kind === 'group' ? 0.5 : undefined,
    pointerEvents: 'none' as const,
    ...(isItemPreview ? {
      '--drag-preview-columns': previewLayout.columns,
      '--drag-preview-rows': previewLayout.rows,
    } : {}),
  };

  return (
    <div
      className="manager-drag-overlay__preview"
      style={style}
      aria-hidden="true"
      data-item-preview={isItemPreview || undefined}
      data-preview-mode={isItemPreview ? previewLayout.mode : undefined}
    >
      {dragUiState.payload?.kind === 'category' ? (
        <div className="manager-drag-overlay__label">
          {dragUiState.payload.categoryId}
        </div>
      ) : isItemPreview ? (
        <div className="manager-drag-overlay__stack tabular-nums">
          {dragUiState.previewItems.map((item, index) => (
            <div
              key={`${item.id}-${index}`}
              className="manager-drag-overlay__row"
              data-preview-item-type={item.itemType}
            >
              <span className="manager-drag-overlay__index">
                {formatNumber(index + 1)}
              </span>
              <span className="manager-drag-overlay__title">
                {item.title}
              </span>
              {item.itemType === 'note' ? (
                <span className="manager-drag-overlay__item-type">Note</span>
              ) : item.domain ? (
                <span className="manager-drag-overlay__domain">
                  {item.domain}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : activeGroup ? (
        <SessionCard group={activeGroup} runtime={runtime} isDragOverlay />
      ) : null}
    </div>
  );
}
