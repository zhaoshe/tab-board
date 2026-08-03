import { Text } from '@mantine/core';
import {
  FileText as IconFileText,
  Link as IconLink,
  Lock as IconLock,
} from 'lucide-react';
import { formatDate, formatNumber } from '../../../shared/utils/formatters';

export function SessionCardMeta({
  createdAt,
  linkCount,
  locked,
  noteCount,
}: {
  createdAt: string;
  linkCount: number;
  locked: boolean;
  noteCount: number;
}) {
  return (
    <div className="session-card__meta" role="group" aria-label="Session Details">
      {linkCount > 0 && (
        <span className="session-card__meta-item">
          <IconLink size={12} aria-hidden="true" />
          {formatNumber(linkCount)} link{linkCount === 1 ? '' : 's'}
        </span>
      )}
      {noteCount > 0 && (
        <span className="session-card__meta-item">
          <IconFileText size={12} aria-hidden="true" />
          {formatNumber(noteCount)} note{noteCount === 1 ? '' : 's'}
        </span>
      )}
      {locked && (
        <span className="session-card__meta-item">
          <IconLock size={12} aria-hidden="true" />
          Locked
        </span>
      )}
      <Text className="session-card__created" size="xs" c="dimmed">
        {formatDate(createdAt)}
      </Text>
    </div>
  );
}
