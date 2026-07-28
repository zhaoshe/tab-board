import type {
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  RefObject,
} from 'react';
import {
  ActionIcon,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconDots,
  IconGripVertical,
  IconRestore,
} from '@tabler/icons-react';
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core';
import { SessionCardMeta } from './SessionCardMeta';

export function SessionCardHeader({
  attributes,
  createdAt,
  dragHandleRef,
  isDragOverlay,
  isEditingTitle,
  isMenuOpen,
  linkCount,
  listeners,
  locked,
  moreActionRef,
  noteCount,
  onHeaderPointerDown,
  onOpenMenu,
  onRestore,
  onTitleActivationKeyDown,
  onTitleBlur,
  onTitleChange,
  onTitleDoubleClick,
  onTitleInputKeyDown,
  restorableTabCount,
  title,
  titleInputRef,
  titleValue,
}: {
  attributes: DraggableAttributes | undefined;
  createdAt: string;
  dragHandleRef: ((element: HTMLElement | null) => void) | undefined;
  isDragOverlay: boolean;
  isEditingTitle: boolean;
  isMenuOpen: boolean;
  linkCount: number;
  listeners: DraggableSyntheticListeners | undefined;
  locked: boolean;
  moreActionRef: RefObject<HTMLButtonElement>;
  noteCount: number;
  onHeaderPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onOpenMenu: (
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
    trigger?: HTMLElement,
  ) => void;
  onRestore: () => void;
  onTitleActivationKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onTitleBlur: () => void;
  onTitleChange: (value: string) => void;
  onTitleDoubleClick: (event: MouseEvent) => void;
  onTitleInputKeyDown: (event: KeyboardEvent) => void;
  restorableTabCount: number;
  title: string;
  titleInputRef: RefObject<HTMLInputElement>;
  titleValue: string;
}) {
  return (
    <header
      className="session-card__header"
      onPointerDown={onHeaderPointerDown}
    >
      {isDragOverlay ? (
        <span
          className="session-card__drag-handle session-card__drag-handle--static"
          aria-hidden="true"
        >
          <IconGripVertical size={16} aria-hidden="true" />
        </span>
      ) : (
        <button
          type="button"
          ref={dragHandleRef}
          className="session-card__drag-handle"
          aria-label={`Drag ${title} to reorder`}
          {...attributes}
          {...listeners}
        >
          <IconGripVertical size={16} aria-hidden="true" />
        </button>
      )}
      <div className="session-card__heading">
        {isEditingTitle ? (
          <TextInput
            ref={titleInputRef}
            name="session-title"
            aria-label={`Session title for ${title}`}
            autoComplete="off"
            value={titleValue}
            onChange={(event) => onTitleChange(event.target.value)}
            onBlur={onTitleBlur}
            onKeyDown={onTitleInputKeyDown}
            size="xs"
            style={{ minWidth: 0 }}
          />
        ) : (
          <button
            type="button"
            className="session-card__title"
            onDoubleClick={isDragOverlay ? undefined : onTitleDoubleClick}
            onKeyDown={isDragOverlay ? undefined : onTitleActivationKeyDown}
            disabled={isDragOverlay}
            tabIndex={isDragOverlay ? -1 : undefined}
          >
            {title}
          </button>
        )}
      </div>
      <div
        className="session-card__actions"
        data-overlay-open={isMenuOpen ? 'true' : undefined}
      >
        {restorableTabCount > 0 && (
          <Tooltip label="Restore">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="blue"
              disabled={isDragOverlay}
              onClick={onRestore}
              aria-label="Restore"
            >
              <IconRestore size={16} aria-hidden="true" />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label="More" disabled={isMenuOpen}>
          <ActionIcon
            ref={moreActionRef}
            size="sm"
            variant="subtle"
            aria-label="More"
            aria-haspopup={isDragOverlay ? undefined : 'menu'}
            aria-expanded={isDragOverlay ? undefined : isMenuOpen}
            disabled={isDragOverlay}
            onClick={isDragOverlay
              ? undefined
              : (event) => onOpenMenu(event, event.currentTarget)}
            onContextMenu={isDragOverlay
              ? undefined
              : (event) => onOpenMenu(event, event.currentTarget)}
            onKeyDown={isDragOverlay
              ? undefined
              : (event) => onOpenMenu(event, event.currentTarget)}
          >
            <IconDots size={16} aria-hidden="true" />
          </ActionIcon>
        </Tooltip>
      </div>
      <SessionCardMeta
        createdAt={createdAt}
        linkCount={linkCount}
        locked={locked}
        noteCount={noteCount}
      />
    </header>
  );
}
