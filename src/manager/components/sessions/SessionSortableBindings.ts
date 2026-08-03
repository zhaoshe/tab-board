import type { CSSProperties } from 'react';
import type { DraggableSyntheticListeners } from '@dnd-kit/core';

export interface SessionSortableBindings {
  listeners: DraggableSyntheticListeners;
  setNodeRef: (element: HTMLElement | null) => void;
  style: CSSProperties;
}
