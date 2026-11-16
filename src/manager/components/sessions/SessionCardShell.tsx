import type { PointerEvent, TouchEvent } from 'react';
import {
  Link as IconLink,
  Lock as IconLock,
  StickyNote as IconNote,
} from 'lucide-react';
import type { Group } from '../../../shared/model';
import { ITEM_LINK, ITEM_NOTE } from '../../../shared/model';
import { formatNumber } from '../../../shared/utils/formatters';
import type { SessionSortableBindings } from './SessionSortableBindings';

export function SessionCardShell({
  activate,
  group,
  readOnly = false,
  sortable,
}: {
  activate: () => void;
  group: Group;
  readOnly?: boolean;
  sortable: SessionSortableBindings;
}) {
  let linkCount = 0;
  let noteCount = 0;
  for (const tab of group.tabs) {
    if (tab.itemType === ITEM_LINK) linkCount += 1;
    if (tab.itemType === ITEM_NOTE) noteCount += 1;
  }

  const blocksSessionDrag = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false;
    if (target.closest(
      'input, textarea, a, [data-no-drag], .session-card__actions, .session-card__tabs',
    )) {
      return true;
    }
    const button = target.closest('button');
    return Boolean(button && !button.matches('.session-card__title, .session-card__note'));
  };
  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (readOnly) return;
    if (event.pointerType === 'touch' || blocksSessionDrag(event.target)) return;
    sortable.listeners?.onPointerDown?.(event);
  };
  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (readOnly) return;
    if (blocksSessionDrag(event.target)) return;
    sortable.listeners?.onTouchStart?.(event);
  };

  return (
    <article
      ref={sortable.setNodeRef}
      id={`session-shell-${group.id}`}
      className="session-card session-card--shell"
      data-group-id={group.id}
      data-session-shell="true"
      style={sortable.style}
      aria-label={`${group.title} session`}
      onPointerDown={handlePointerDown}
      onTouchStart={handleTouchStart}
    >
      <header className="session-card__header">
        <div className="session-card__heading">
          <button
            type="button"
            className="session-card__title"
            onClick={activate}
          >
            {group.title}
          </button>
        </div>
      </header>
      <div className="session-card__shell-summary" aria-label="Session Summary">
        <span>
          <IconLink size={14} aria-hidden="true" />
          {formatNumber(linkCount)}
        </span>
        {noteCount > 0 ? (
          <span>
            <IconNote size={14} aria-hidden="true" />
            {formatNumber(noteCount)}
          </span>
        ) : null}
        {group.locked ? (
          <span>
            <IconLock size={14} aria-hidden="true" />
            Locked
          </span>
        ) : null}
      </div>
    </article>
  );
}
