import type { CSSProperties } from 'react';
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core';

export interface SessionSortableBindings {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  setNodeRef: (element: HTMLElement | null) => void;
  style: CSSProperties;
}
