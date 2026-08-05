import { useEffect, useMemo, type MouseEvent, type RefObject } from 'react';
import {
  Alert,
  Stack,
  Text,
} from '@mantine/core';
import {
  useManagerOverlayCommands,
  useManagerOverlayLifecycle,
} from '../../hooks/useManagerOverlays';
import type { OpenTabsWorkflow } from '../../hooks/useOpenTabsRuntime';
import type { ManagerSelectionScope } from '../../hooks/useManagerSelectionScope';
import { useDestructiveConfirmation } from '../../../shared/components/DestructiveConfirmation';
import { formatNumber } from '../../../shared/utils/formatters';
import { OpenTabsWindowBar } from './OpenTabsWindowBar';
import { useOverflowCues } from '../../hooks/useOverflowCues';
import { OpenTabsSelectionBar } from './OpenTabsSelectionBar';
import { OpenTabsList } from './OpenTabsList';
import { OpenTabsFilterFooter } from './OpenTabsFilterFooter';
import type { OpenSessionTargetPickerInput } from '../shell/SessionTargetPicker';
import type { SidebarDisclosureState } from '../../hooks/useSidebarDisclosure';
import { getSelectableOpenTabIds } from '../../core/open-tabs';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';

export const OPEN_TABS_FILTER_INPUT_ID = 'open-tabs-filter-input';

export interface OpenTabsPanelProps {
  workspaceId: string;
  workflow: OpenTabsWorkflow;
  sidebarState: SidebarDisclosureState;
  onCaptureSelectedWindow: () => Promise<unknown>;
  onCaptureSelectedTabs: () => Promise<unknown>;
  sidebarToggleRef: RefObject<HTMLButtonElement>;
  sidebarCompactToggleRef: RefObject<HTMLButtonElement>;
  onToggleSidebar: (expanded: boolean) => void;
  onPinSidebar: () => void;
  onPromoteSidebar: () => void;
  onSourceKeyChange?: (key: unknown) => void;
  selectionScope: ManagerSelectionScope;
  onOpenSessionTargetPicker: (input: OpenSessionTargetPickerInput) => void;
}

function isValidTabId(id: number | undefined): id is number {
  return Number.isSafeInteger(id);
}

export function OpenTabsPanel({
  workspaceId,
  workflow,
  sidebarState,
  onCaptureSelectedWindow,
  onCaptureSelectedTabs,
  sidebarToggleRef,
  sidebarCompactToggleRef,
  onToggleSidebar,
  onPinSidebar,
  onPromoteSidebar,
  onSourceKeyChange,
  selectionScope,
  onOpenSessionTargetPicker,
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
    capturing,
    updatingSelection,
    closingTabIds,
    error,
  } = status;
  const selectionMode = selectionScope.scope?.kind === 'open-tabs'
    && selectionScope.scope.windowId === selectedWindowId;
  const selectedTabIds = selection.ids;
  const selectedCount = selection.count;
  const {
    captureFocusRestoreIntent,
    restoreFocusAfterMutation,
  } = useManagerOverlayCommands();
  const confirmDestructive = useDestructiveConfirmation();
  const confirmBeforeDestructive = useTabBoardStore(
    (state) => state.settings.confirmBeforeDestructive,
  );
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
  const visibleSelectableTabIds = useMemo(
    () => filteredTabs.flatMap((tab) =>
      tab.storable && isValidTabId(tab.id) ? [tab.id] : []),
    [filteredTabs],
  );
  const allVisibleSelected = visibleSelectableTabIds.length > 0
    && visibleSelectableTabIds.every((id) => selectedTabIdSet.has(id));
  const openTabCount = selectedWindow?.tabs.length ?? 0;
  const saveAllCount = getSelectableOpenTabIds(selectedWindow).length;

  useEffect(() => {
    onSourceKeyChange?.(sourceSnapshot);
  }, [onSourceKeyChange, sourceSnapshot]);

  useEffect(
    () => selectionScope.registerOpenTabsClear(commands.clearSelection),
    [commands.clearSelection, selectionScope.registerOpenTabsClear],
  );

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
    if (confirmBeforeDestructive) {
      const confirmed = await confirmDestructive({
        title: 'Close Browser Tab',
        message: 'Close this browser tab? This action cannot be undone from TabBoard.',
        confirmLabel: 'Close Tab',
      });
      if (!confirmed) return;
    }
    try {
      await commands.closeTab(tabId);
    } finally {
      if (focusIntent) setTimeout(() => restoreFocusAfterMutation(focusIntent), 0);
    }
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
        sidebarState={sidebarState}
        onSelectWindow={commands.selectWindow}
      />

      <OpenTabsSelectionBar
        capturing={capturing}
        openTabCount={openTabCount}
        filteredTabCount={filteredTabs.length}
        filterActive={query.trim().length > 0}
        saveAllCount={saveAllCount}
        selectedCount={selectedCount}
        selectionMode={selectionMode}
        sidebarCollapsed={sidebarState === 'collapsed'}
        sidebarState={sidebarState}
        allVisibleSelected={allVisibleSelected}
        updatingSelection={updatingSelection}
        canEnterSelection={openTabCount > 0}
        onEnterSelection={() => {
          if (selectedWindowId === null || openTabCount === 0) return;
          commands.clearSelection();
          selectionScope.commands.enterOpenTabs(selectedWindowId);
          if (sidebarState === 'peek') onPromoteSidebar();
        }}
        onExpand={() => onToggleSidebar(true)}
        onCollapse={() => {
          if (sidebarState === 'peek') {
            onPinSidebar();
          } else {
            onToggleSidebar(false);
          }
        }}
        onSaveAll={() => void onCaptureSelectedWindow()}
        expandRef={sidebarCompactToggleRef}
        collapseRef={sidebarToggleRef}
        onCapture={() => void onCaptureSelectedTabs()}
        onClear={selectionScope.commands.exit}
        onSaveTo={(trigger) => {
          if (selectedWindowId === null || selectedStorableTabIds.length === 0) {
            return;
          }
          onOpenSessionTargetPicker({
            mode: 'save-open-tabs',
            source: {
              kind: 'open-tabs',
              tabIds: selectedStorableTabIds,
              windowId: selectedWindowId,
              records: selectedStorableRecords,
            },
            trigger,
          });
        }}
        onSelectAll={() => commands.selectAll(visibleSelectableTabIds)}
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
        sidebarCollapsed={sidebarState === 'collapsed'}
        workspaceId={workspaceId}
        onClearQuery={commands.clearQuery}
        onCloseTabAction={(event, tabId) => void closeTabFromAction(event, tabId)}
        onFocusTab={commands.focusTab}
        onToggleSelection={(tabId) => {
          if (selectedWindowId === null) return;
          selectionScope.commands.enterOpenTabs(selectedWindowId);
          if (sidebarState === 'peek') onPromoteSidebar();
          commands.toggleSelection(tabId);
        }}
      />

      <OpenTabsFilterFooter
        inputId={OPEN_TABS_FILTER_INPUT_ID}
        query={query}
        collapsed={sidebarState === 'collapsed'}
        onChange={commands.setQuery}
        onClear={commands.clearQuery}
        onFocus={() => {
          if (sidebarState === 'peek') onPromoteSidebar();
        }}
      />

    </Stack>
  );
}
