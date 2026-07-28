import { IconGripVertical, IconLink, IconLock, IconNote } from '@tabler/icons-react';
import type { Group } from '../../../shared/model';
import { ITEM_LINK, ITEM_NOTE } from '../../../shared/model';
import { formatNumber } from '../../../shared/utils/formatters';
import type { SessionSortableBindings } from './SessionSlot';

export function SessionCardShell({
  activate,
  group,
  sortable,
}: {
  activate: () => void;
  group: Group;
  sortable: SessionSortableBindings;
}) {
  let linkCount = 0;
  let noteCount = 0;
  for (const tab of group.tabs) {
    if (tab.itemType === ITEM_LINK) linkCount += 1;
    if (tab.itemType === ITEM_NOTE) noteCount += 1;
  }

  return (
    <article
      ref={sortable.setNodeRef}
      id={`session-shell-${group.id}`}
      className="session-card session-card--shell"
      data-group-id={group.id}
      data-session-shell="true"
      style={sortable.style}
      aria-label={`${group.title} session`}
    >
      <header className="session-card__header">
        <button
          ref={sortable.setActivatorNodeRef}
          type="button"
          className="session-card__drag-handle"
          aria-label={`Drag ${group.title} to reorder`}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <IconGripVertical size={16} aria-hidden="true" />
        </button>
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
