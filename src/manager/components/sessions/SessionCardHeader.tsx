import type {
  KeyboardEvent,
  MouseEvent,
  RefObject,
} from 'react';
import { TextInput } from '@mantine/core';
import {
  Menu as IconDots,
  SquareArrowOutUpRight as IconRestore,
} from 'lucide-react';
import { AccessibleIconAction } from '../../../shared/components/AccessibleIconAction';
import { TabBoardIcon } from '../../../shared/components/TabBoardIcon';
import { SessionCardMeta } from './SessionCardMeta';

export function SessionCardHeader({
  createdAt,
  isDragOverlay,
  isEditingTitle,
  isMenuOpen,
  linkCount,
  locked,
  moreActionRef,
  noteCount,
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
  createdAt: string;
  isDragOverlay: boolean;
  isEditingTitle: boolean;
  isMenuOpen: boolean;
  linkCount: number;
  locked: boolean;
  moreActionRef: RefObject<HTMLButtonElement>;
  noteCount: number;
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
    <header className="session-card__header">
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
          <AccessibleIconAction
            label="Restore"
            disabled={isDragOverlay}
            onClick={onRestore}
          >
            <TabBoardIcon icon={IconRestore} />
          </AccessibleIconAction>
        )}
        <AccessibleIconAction
          ref={moreActionRef}
          label="More"
          tooltipDisabled={isMenuOpen}
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
          <TabBoardIcon icon={IconDots} />
        </AccessibleIconAction>
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
