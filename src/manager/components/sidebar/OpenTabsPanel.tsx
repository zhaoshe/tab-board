import { useEffect, useMemo, type MouseEvent, type RefObject } from 'react';
import {
  ActionIcon,
  Alert,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import {
  useManagerOverlayCommands,
  useManagerOverlayLifecycle,
} from '../../hooks/useManagerOverlays';
import type { OpenTabsWorkflow } from '../../hooks/useOpenTabsRuntime';
import { useDestructiveConfirmation } from '../../../shared/components/DestructiveConfirmation';
import { formatNumber } from '../../../shared/utils/formatters';
import { OpenTabsWindowBar } from './OpenTabsWindowBar';
import { useOverflowCues } from '../../hooks/useOverflowCues';
import { OpenTabsSelectionBar } from './OpenTabsSelectionBar';
import { OpenTabsList } from './OpenTabsList';
import { OpenTabsFilterFooter } from './OpenTabsFilterFooter';

export const OPEN_TABS_FILTER_INPUT_ID = 'open-tabs-filter-input';

export interface OpenTabsPanelProps {
  workspaceId: string;
  workflow: OpenTabsWorkflow;
  sidebarPinned: boolean;
  onCaptureSelectedWindow: () => Promise<unknown>;
  onCaptureSelectedTabs: () => Promise<unknown>;
  sidebarToggleRef: RefObject<HTMLButtonElement>;
  sidebarCompactToggleRef: RefObject<HTMLButtonElement>;
  onToggleSidebar: (expanded: boolean) => void;
  onSourceKeyChange?: (key: unknown) => void;
}

function isValidTabId(id: number | undefined): id is number {
  return Number.isSafeInteger(id);
}

export function OpenTabsPanel({
  workspaceId,
  workflow,
  sidebarPinned,
  onCaptureSelectedWindow,
  onCaptureSelectedTabs,
  sidebarToggleRef,
  sidebarCompactToggleRef,
  onToggleSidebar,
  onSourceKeyChange,
}: OpenTabsPanelProps) {
  const { model, commands } = workflow;
  const {
    windows,
    selectedWindow,
    selectedWindowId,
    filteredTabs,
    query,
    selection,
    status,
  } = model;
  const {
    loading,
    capturing,
    updatingSelection,
    closingTabIds,
    error,
  } = status;
  const selectionMode = selection.active;
  const selectedTabIds = selection.ids;
  const selectedCount = selection.count;
  const {
    captureFocusRestoreIntent,
    restoreFocusAfterMutation,
  } = useManagerOverlayCommands();
  const confirmDestructive = useDestructiveConfirmation();
  const openTabsOverflow = useOverflowCues<HTMLDivElement>();
  const sourceSnapshot = useMemo(
    () => ({ selectedWindowId, filteredTabs }),
    [filteredTabs, selectedWindowId],
  );
  useManagerOverlayLifecycle(sourceSnapshot);

  const selectedTabIdSet = useMemo(() => new Set(selectedTabIds), [selectedTabIds]);
  const closingTabIdSet = useMemo(() => new Set(closingTabIds), [closingTabIds]);
  const selectedStorableRecords = selection.records;
  const selectedStorableTabIds = selection.recordIds;

  useEffect(() => {
    onSourceKeyChange?.(sourceSnapshot);
  }, [onSourceKeyChange, sourceSnapshot]);

  const closeTabFromAction = async (event: MouseEvent<HTMLButtonElement>, tabId: number | undefined) => {
    if (!isValidTabId(tabId)) return;
    const focusIntent = event.detail === 0
      ? (() => {
          const row = event.currentTarget.closest<HTMLElement>('.manager-open-tab-row');
          const openTabId = row?.dataset.openTabId;
          if (!openTabId) return undefined;
          return {
            ...captureFocusRestoreIntent(event.currentTarget),
            lifecycleAllowance: {
              kind: 'open-tab-removal' as const,
              tabId: openTabId,
              windowId: row.dataset.openWindowId ?? null,
            },
          };
        })()
      : undefined;
    const confirmed = await confirmDestructive({
      title: 'Close Browser Tab',
      message: 'Close this browser tab? This action cannot be undone from TabBoard.',
      confirmLabel: 'Close Tab',
    });
    if (!confirmed) return;
    try {
      await commands.closeTab(tabId);
    } finally {
      if (focusIntent) setTimeout(() => restoreFocusAfterMutation(focusIntent), 0);
    }
  };

  const closeTabFromPreview = async (tabId: number | undefined) => {
    if (!isValidTabId(tabId)) return;
    const confirmed = await confirmDestructive({
      title: 'Close Browser Tab',
      message: 'Close this browser tab? This action cannot be undone from TabBoard.',
      confirmLabel: 'Close Tab',
    });
    if (!confirmed) return;
    await commands.closeTab(tabId);
  };

  const closeSelectedTabs = async () => {
    if (!selectedCount) return;
    const confirmed = await confirmDestructive({
      title: 'Close Browser Tabs',
      message: `Close ${formatNumber(selectedCount)} selected browser tabs? This action cannot be undone from TabBoard.`,
      confirmLabel: `Close ${formatNumber(selectedCount)} Tabs`,
    });
    if (!confirmed) return;
    await commands.closeSelection();
  };

  const scrollSelectedWindowIntoView = (
    behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
  ) => {
    if (selectedWindow?.id === undefined) return;
    document.querySelector<HTMLButtonElement>('.manager-window-switcher [aria-pressed="true"]')?.scrollIntoView({
      behavior,
      block: 'nearest',
      inline: 'start',
    });
  };

  useEffect(() => {
    scrollSelectedWindowIntoView();
  }, [selectedWindow?.id]);

  return (
    <Stack gap={0} h="100%" className="manager-open-tabs-layout" onMouseEnter={() => scrollSelectedWindowIntoView('auto')}>
      <OpenTabsWindowBar
        windows={windows}
        selectedWindow={selectedWindow}
        loading={loading}
        capturing={capturing}
        sidebarPinned={sidebarPinned}
        sidebarToggleRef={sidebarToggleRef}
        onSelectWindow={commands.selectWindow}
        onRefresh={() => void commands.refresh()}
        onSaveWindow={() => void onCaptureSelectedWindow()}
        onToggleSidebar={onToggleSidebar}
      />

      <OpenTabsSelectionBar
        capturing={capturing}
        selectedCount={selectedCount}
        selectionMode={selectionMode}
        updatingSelection={updatingSelection}
        onCapture={() => void onCaptureSelectedTabs()}
        onClear={commands.clearSelection}
        onClose={() => void closeSelectedTabs()}
        onPin={() => void commands.pinSelection()}
        onSelectAll={commands.selectAll}
      />

      {error && (
        <Alert color="red" title="Open Tabs Unavailable" mx="xs" mt={4} p="xs" style={{ flexShrink: 0 }}>
          {error}
        </Alert>
      )}
      {windows.length > 0 && !selectedWindow && (
        <Text size="xs" c="dimmed" px="xs" mt={4} style={{ flexShrink: 0 }}>No selected browser window</Text>
      )}

      <OpenTabsList
        closingTabIdSet={closingTabIdSet}
        filteredTabs={filteredTabs}
        overflowCues={openTabsOverflow.cues}
        overflowRef={openTabsOverflow.ref}
        query={query}
        selectedCount={selectedCount}
        selectedStorableRecords={selectedStorableRecords}
        selectedStorableTabIds={selectedStorableTabIds}
        selectedTabIdSet={selectedTabIdSet}
        selectedWindow={selectedWindow}
        selectionMode={selectionMode}
        windows={windows}
        workspaceId={workspaceId}
        onClearQuery={commands.clearQuery}
        onCloseTab={closeTabFromPreview}
        onCloseTabAction={(event, tabId) => void closeTabFromAction(event, tabId)}
        onFocusTab={commands.focusTab}
        onPinTab={commands.pinTab}
        onToggleSelection={commands.toggleSelection}
      />

      {!sidebarPinned && (
        <Tooltip label="Expand Sidebar" position="right" openDelay={500}>
          <ActionIcon
            ref={sidebarCompactToggleRef}
            className="manager-sidebar-compact-toggle"
            variant="subtle"
            aria-label="Expand Sidebar"
            aria-controls="manager-sidebar"
            onClick={() => onToggleSidebar(true)}
          >
            <IconLayoutSidebarLeftExpand size={18} aria-hidden="true" />
          </ActionIcon>
        </Tooltip>
      )}

      <OpenTabsFilterFooter
        inputId={OPEN_TABS_FILTER_INPUT_ID}
        query={query}
        onChange={commands.setQuery}
        onClear={commands.clearQuery}
      />

    </Stack>
  );
}
