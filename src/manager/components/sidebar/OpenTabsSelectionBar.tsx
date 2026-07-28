import {
  ActionIcon,
  Group,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconFolderPlus,
  IconPin,
  IconSelectAll,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { formatNumber } from '../../../shared/utils/formatters';

export function OpenTabsSelectionBar({
  capturing,
  selectedCount,
  selectionMode,
  updatingSelection,
  onCapture,
  onClear,
  onClose,
  onPin,
  onSelectAll,
}: {
  capturing: boolean;
  selectedCount: number;
  selectionMode: boolean;
  updatingSelection: boolean;
  onCapture: () => void;
  onClear: () => void;
  onClose: () => void;
  onPin: () => void;
  onSelectAll: () => void;
}) {
  return (
    <div
      className="manager-open-tabs-selection-bar"
      data-selection-mode={selectionMode || undefined}
    >
      {selectionMode ? (
        <Group
          className="manager-open-tabs-selection-actions"
          gap={8}
          wrap="nowrap"
        >
          <Text
            className="manager-open-tabs-selection-actions__count"
            size="sm"
            fw={600}
            aria-live="polite"
          >
            {formatNumber(selectedCount)} Selected
          </Text>
          <div className="manager-open-tabs-selection-actions__tools">
            <Tooltip label="Select All" openDelay={1000}>
              <ActionIcon
                size={24}
                variant="subtle"
                aria-label="Select All Tabs"
                disabled={updatingSelection}
                onClick={onSelectAll}
              >
                <IconSelectAll size={16} aria-hidden="true" />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Create Session" openDelay={1000}>
              <ActionIcon
                size={24}
                variant="subtle"
                color="blue"
                aria-label={capturing
                  ? 'Creating Session…'
                  : `Create Session from ${formatNumber(selectedCount)} Selected Tabs`}
                disabled={selectedCount === 0 || capturing || updatingSelection}
                loading={capturing}
                onClick={onCapture}
              >
                <IconFolderPlus size={16} aria-hidden="true" />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Close Selected Tabs" openDelay={1000}>
              <ActionIcon
                size={24}
                variant="subtle"
                color="red"
                aria-label={updatingSelection
                  ? 'Closing Selected Tabs…'
                  : `Close ${formatNumber(selectedCount)} Selected Tabs`}
                disabled={selectedCount === 0 || capturing || updatingSelection}
                loading={updatingSelection}
                onClick={onClose}
              >
                <IconTrash size={16} aria-hidden="true" />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Pin Selected Tabs" openDelay={1000}>
              <ActionIcon
                size={24}
                variant="subtle"
                aria-label={`Pin ${formatNumber(selectedCount)} Selected Tabs`}
                disabled={selectedCount === 0 || capturing || updatingSelection}
                onClick={onPin}
              >
                <IconPin size={16} aria-hidden="true" />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Exit Selection Mode" openDelay={1000}>
              <ActionIcon
                size={24}
                variant="subtle"
                aria-label="Exit Tab Selection Mode"
                disabled={updatingSelection}
                onClick={onClear}
              >
                <IconX size={16} aria-hidden="true" />
              </ActionIcon>
            </Tooltip>
          </div>
        </Group>
      ) : null}
    </div>
  );
}
