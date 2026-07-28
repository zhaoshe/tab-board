import type { MouseEvent } from 'react';
import {
  Button,
  Group,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import type { OpenTabInfo, OpenWindowInfo } from '../../../shared/openTabs';
import type { OverflowCueState } from '../../hooks/useOverflowCues';
import { OpenTabRow } from './OpenTabRow';

function isValidTabId(id: number | undefined): id is number {
  return Number.isSafeInteger(id);
}

export function OpenTabsList({
  closingTabIdSet,
  filteredTabs,
  overflowCues,
  overflowRef,
  query,
  selectedCount,
  selectedStorableRecords,
  selectedStorableTabIds,
  selectedTabIdSet,
  selectedWindow,
  selectionMode,
  windows,
  workspaceId,
  onClearQuery,
  onCloseTab,
  onCloseTabAction,
  onFocusTab,
  onPinTab,
  onToggleSelection,
}: {
  closingTabIdSet: ReadonlySet<number>;
  filteredTabs: OpenTabInfo[];
  overflowCues: OverflowCueState;
  overflowRef: (element: HTMLDivElement | null) => void;
  query: string;
  selectedCount: number;
  selectedStorableRecords: OpenTabInfo[];
  selectedStorableTabIds: number[];
  selectedTabIdSet: ReadonlySet<number>;
  selectedWindow: OpenWindowInfo | null;
  selectionMode: boolean;
  windows: OpenWindowInfo[];
  workspaceId: string;
  onClearQuery: () => void;
  onCloseTab: (tabId: number | undefined) => Promise<void>;
  onCloseTabAction: (
    event: MouseEvent<HTMLButtonElement>,
    tabId: number | undefined,
  ) => void;
  onFocusTab: (
    tabId: number | undefined,
    windowId: number | undefined,
  ) => Promise<void>;
  onPinTab: (tabId: number | undefined) => Promise<void>;
  onToggleSelection: (tabId: number | undefined) => void;
}) {
  return (
    <ScrollArea
      className="manager-open-tabs-scroll"
      data-block-end={overflowCues.blockEnd || undefined}
      data-block-start={overflowCues.blockStart || undefined}
      viewportRef={overflowRef}
      style={{ flex: 1, minHeight: 0 }}
      type="auto"
      scrollbarSize={4}
    >
      <Stack
        gap={2}
        px={0}
        pt={0}
        pb="xs"
        data-open-tabs-panel
        className={selectionMode ? 'manager-open-tabs--selection-mode' : undefined}
        tabIndex={-1}
        data-open-window-id={selectedWindow?.id ?? undefined}
        style={{ alignItems: 'stretch' }}
      >
        {(windows.length === 0 || selectedWindow?.tabs.length === 0) && (
          <Text size="xs" c="dimmed" px="xs" py="xs">No open tabs</Text>
        )}
        {selectedWindow && filteredTabs.length === 0 && selectedWindow.tabs.length > 0 && (
          <Group justify="space-between" gap="xs" px="xs" py="xs" wrap="nowrap">
            <Text size="xs" c="dimmed">No tabs match “{query}”</Text>
            <Button size="compact-xs" variant="subtle" onClick={onClearQuery}>
              Clear Filter
            </Button>
          </Group>
        )}
        {selectedWindow && filteredTabs.map((tab) => (
          <OpenTabRow
            key={`${selectedWindow.id ?? 'window'}-${tab.id ?? tab.index}`}
            tab={tab}
            workspaceId={workspaceId}
            selectedTabIdSet={selectedTabIdSet}
            selectedStorableRecords={selectedStorableRecords}
            selectedStorableTabIds={selectedStorableTabIds}
            selectedCount={selectedCount}
            selectionMode={selectionMode}
            isClosing={isValidTabId(tab.id) && closingTabIdSet.has(tab.id)}
            onToggleSelection={onToggleSelection}
            onCloseTab={onCloseTab}
            onCloseTabAction={onCloseTabAction}
            onPinTab={onPinTab}
            onFocusTab={onFocusTab}
          />
        ))}
      </Stack>
    </ScrollArea>
  );
}
