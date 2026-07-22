import { useEffect, useMemo, useState, type MouseEvent, type RefObject } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Group as MantineGroup,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconBrowser,
  IconFolderPlus,
  IconLayoutSidebarLeftCollapse,
  IconPin,
  IconRefresh,
  IconSelectAll,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  ManagerMenuItem,
  useManagerInfoTrigger,
  useManagerOverlayController,
  useManagerOverlayLifecycle,
} from '../../hooks/useManagerOverlays';
import type { OpenTabInfo, OpenWindowInfo } from '../../core/open-tabs';

export const OPEN_TABS_FILTER_INPUT_ID = 'open-tabs-filter-input';

export interface OpenTabsPanelProps {
  workspaceId: string;
  windows: OpenWindowInfo[];
  selectedWindow: OpenWindowInfo | null;
  selectedWindowId: number | null;
  query: string;
  filteredTabs: OpenTabInfo[];
  selectionMode: boolean;
  selectedTabIds: number[];
  selectedCount: number;
  sidebarPinned: boolean;
  closingTabIds: number[];
  updatingSelection: boolean;
  loading: boolean;
  capturing: boolean;
  error: string | null;
  onQueryChange: (value: string) => void;
  onSelectWindow: (windowId: number) => void;
  onExitSelectionMode: () => void;
  onToggleTabSelection: (tabId: number | undefined) => void;
  onSelectAll: () => void;
  onFocusTab: (tabId: number | undefined, windowId: number | undefined) => Promise<void>;
  onCloseTab: (tabId: number | undefined) => Promise<void>;
  onPinTab: (tabId: number | undefined) => Promise<void>;
  onCloseSelectedTabs: () => Promise<void>;
  onPinSelectedTabs: () => Promise<void>;
  onClearFilter: () => void;
  onCaptureSelectedTabs: () => Promise<unknown>;
  onRefresh: () => Promise<void>;
  sidebarToggleRef: RefObject<HTMLButtonElement>;
  onToggleSidebar: (expanded: boolean) => void;
  onSourceKeyChange?: (key: string) => void;
}

function windowAccessibleLabel(window: OpenWindowInfo): string {
  return `${window.tabCount} tabs${window.focused ? ', current browser window' : ''}`;
}

function isValidTabId(id: number | undefined): id is number {
  return Number.isSafeInteger(id);
}

export function deriveSelectedStorableRecords(
  selectedWindow: OpenWindowInfo | null,
  selectedTabIdSet: ReadonlySet<number>,
): OpenTabInfo[] {
  return selectedWindow?.tabs.filter((record) =>
    record.storable === true && isValidTabId(record.id) && selectedTabIdSet.has(record.id),
  ) ?? [];
}

export function deriveSelectedStorableTabIds(records: readonly OpenTabInfo[]): number[] {
  return records.flatMap((record) => isValidTabId(record.id) ? [record.id] : []);
}

export interface OpenTabDragData {
  records: OpenTabInfo[];
  tabIds: number[];
}

export function getOpenTabDragData(
  tab: OpenTabInfo,
  isSelectedDrag: boolean,
  selectedStorableRecords: OpenTabInfo[],
  selectedStorableTabIds: number[],
): OpenTabDragData {
  if (isSelectedDrag && selectedStorableRecords.length > 0) {
    return { records: selectedStorableRecords, tabIds: selectedStorableTabIds };
  }
  return {
    records: [tab],
    tabIds: isValidTabId(tab.id) ? [tab.id] : [],
  };
}

export function isOpenTabClosing(tab: OpenTabInfo, closingTabIdSet: ReadonlySet<number>): boolean {
  return isValidTabId(tab.id) && closingTabIdSet.has(tab.id);
}

function getOpenTabOverlayLifecycleKey(tab: OpenTabInfo): string {
  return JSON.stringify([
    tab.id,
    tab.windowId,
    tab.title,
    tab.url,
    tab.favIconUrl,
    tab.active,
    tab.pinned,
    tab.index,
    tab.browserGroup,
    tab.storable,
    tab.reason,
  ]);
}

interface OpenTabContentTriggerProps {
  tab: OpenTabInfo;
  workspaceId: string;
  selectedTabIdSet: ReadonlySet<number>;
  selectedStorableRecords: OpenTabInfo[];
  selectedStorableTabIds: number[];
  previewKey: string;
  onCloseTab: (tabId: number | undefined) => Promise<void>;
  onPinTab: (tabId: number | undefined) => Promise<void>;
}

function OpenTabContentTrigger({
  tab,
  workspaceId,
  selectedTabIdSet,
  selectedStorableRecords,
  selectedStorableTabIds,
  previewKey,
  onCloseTab,
  onPinTab,
}: OpenTabContentTriggerProps) {
  const { isPreviewOpen } = useManagerOverlayController();
  const [faviconFailed, setFaviconFailed] = useState(false);
  const showFavicon = Boolean(tab.favIconUrl) && !faviconFailed;
  const infoTriggerRef = useManagerInfoTrigger(previewKey, {
    kind: 'open',
    model: {
      title: tab.title || 'Untitled',
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      note: '',
          actions: (
            <>
              {isValidTabId(tab.id) && !tab.pinned && (
                <Tooltip label="Pin tab" openDelay={1000} zIndex={1100}>
                  <span>
                    <ManagerMenuItem className="manager-info-card-action" onClick={() => onPinTab(tab.id)}>
                      <IconPin size={16} />
                    </ManagerMenuItem>
                  </span>
                </Tooltip>
              )}
              {isValidTabId(tab.id) && (
                <Tooltip label="Close tab" openDelay={1000} zIndex={1100}>
                  <span>
                    <ManagerMenuItem
                      className="manager-info-card-action manager-overlay-menu__item--danger"
                      lifecycleAllowance="open-tab-removal"
                      onClick={() => onCloseTab(tab.id)}
                    >
                      <IconX size={16} />
                    </ManagerMenuItem>
                  </span>
                </Tooltip>
              )}
        </>
      ),
    },
  });
  const isSelectedDrag = isValidTabId(tab.id) && selectedTabIdSet.has(tab.id);
  const { records: dragRecords, tabIds: dragTabIds } = getOpenTabDragData(
    tab,
    isSelectedDrag,
    selectedStorableRecords,
    selectedStorableTabIds,
  );
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `open-tab-${tab.windowId ?? 'window'}-${tab.id ?? tab.index}`,
    disabled: tab.storable !== true || !isValidTabId(tab.id),
    data: {
      type: 'open-tab',
      dnd: {
        payload: {
          kind: 'open-tabs',
          tabIds: dragTabIds,
          windowId: tab.windowId ?? -1,
          workspaceId,
        },
        records: dragRecords,
      },
    },
  });

  return (
    <UnstyledButton
      ref={(node) => {
        setNodeRef(node);
        infoTriggerRef(node);
      }}
      {...attributes}
      {...listeners}
      type="button"
      aria-label={`Open ${tab.title || 'Untitled'}`}
      data-info-popover="open"
      data-info-key={previewKey}
      className="manager-open-tab-content"
      aria-haspopup="dialog"
      aria-expanded={isPreviewOpen(previewKey)}
      style={{
        transform: CSS.Translate.toString(transform),
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--mantine-spacing-xs)',
        flex: 1,
        minWidth: 0,
        textAlign: 'left',
      }}
    >
      <span className="manager-open-tab-favicon" aria-hidden="true">
        {!showFavicon && <IconBrowser className="manager-open-tab-favicon__fallback" size={20} />}
        {tab.favIconUrl && !faviconFailed && (
          <img
            src={tab.favIconUrl}
            alt=""
            onError={() => setFaviconFailed(true)}
          />
        )}
      </span>
      <Stack className="manager-open-tab-details" gap={0} style={{ flex: 1, minWidth: 0 }}>
        <Text size="xs" lineClamp={1} fw={tab.active ? 600 : 400}>
          {tab.title || 'Untitled'}
        </Text>
      </Stack>
    </UnstyledButton>
  );
}

export function OpenTabsPanel({
  workspaceId,
  windows,
  selectedWindow,
  selectedWindowId,
  query,
  filteredTabs,
  selectionMode,
  selectedTabIds,
  selectedCount,
  sidebarPinned,
  closingTabIds,
  updatingSelection,
  loading,
  capturing,
  error,
  onQueryChange,
  onSelectWindow,
  onExitSelectionMode,
  onToggleTabSelection,
  onSelectAll,
  onCloseTab,
  onPinTab,
  onCloseSelectedTabs,
  onPinSelectedTabs,
  onClearFilter,
  onCaptureSelectedTabs,
  onRefresh,
  sidebarToggleRef,
  onToggleSidebar,
  onSourceKeyChange,
}: OpenTabsPanelProps) {
  const {
    captureFocusRestoreIntent,
    restoreFocusAfterMutation,
  } = useManagerOverlayController();
  const overlayItemKey = useMemo(
    () => `${selectedWindowId ?? 'none'}:${filteredTabs.map(getOpenTabOverlayLifecycleKey).join('|')}`,
    [filteredTabs, selectedWindowId],
  );
  useManagerOverlayLifecycle(overlayItemKey);

  const selectedTabIdSet = useMemo(() => new Set(selectedTabIds), [selectedTabIds]);
  const closingTabIdSet = useMemo(() => new Set(closingTabIds), [closingTabIds]);
  const selectedStorableRecords = useMemo(
    () => deriveSelectedStorableRecords(selectedWindow, selectedTabIdSet),
    [selectedTabIdSet, selectedWindow],
  );
  const selectedStorableTabIds = useMemo(
    () => deriveSelectedStorableTabIds(selectedStorableRecords),
    [selectedStorableRecords],
  );

  useEffect(() => {
    onSourceKeyChange?.(overlayItemKey);
  }, [onSourceKeyChange, overlayItemKey]);

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
    try {
      await onCloseTab(tabId);
    } finally {
      if (focusIntent) setTimeout(() => restoreFocusAfterMutation(focusIntent), 0);
    }
  };

  const visibleWindows = windows.filter((window) => !window.incognito);
  const scrollSelectedWindowIntoView = (behavior: ScrollBehavior = 'smooth') => {
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
    <Stack gap="xs" h="100%" style={{ position: 'relative' }} onMouseEnter={() => scrollSelectedWindowIntoView('auto')}>
      <MantineGroup gap={2} px="xs" pt="xs" wrap="nowrap">
        <MantineGroup className="manager-window-switcher" gap={2} wrap="nowrap">
          {visibleWindows.map((window) => {
            const index = visibleWindows.indexOf(window);
            const isSelected = window.id === selectedWindow?.id;
            return (
              <Tooltip key={window.id ?? index} label={windowAccessibleLabel(window)} openDelay={1000}>
                <ActionIcon
                  className="manager-sidebar-header-action"
                  variant="subtle"
                  aria-label={windowAccessibleLabel(window)}
                  aria-pressed={isSelected}
                  data-tab-count={window.tabCount}
                  data-current={window.focused || undefined}
                  disabled={window.id === undefined}
                  onClick={() => window.id !== undefined && onSelectWindow(window.id)}
                >
                  <span className="manager-window-glyph" aria-hidden="true">
                    <span className="manager-window-tab-count">{window.tabCount}</span>
                  </span>
                </ActionIcon>
              </Tooltip>
            );
          })}
          {!visibleWindows.length && (
            <Tooltip label="No open browser windows" openDelay={1000}>
              <ActionIcon className="manager-sidebar-header-action" variant="subtle" aria-label="No open browser windows" disabled>
                <IconBrowser size={20} />
              </ActionIcon>
            </Tooltip>
          )}
        </MantineGroup>
        <MantineGroup className="manager-sidebar-utilities" gap={2} ml="auto" wrap="nowrap">
          <Tooltip label={loading ? 'Refreshing open tabs' : 'Refresh open tabs'} openDelay={1000}>
            <ActionIcon
              className="manager-sidebar-header-action manager-sidebar-utility-action"
              variant="subtle"
              aria-label={loading ? 'Refreshing open tabs' : 'Refresh open tabs'}
              aria-busy={loading || undefined}
              onClick={() => void onRefresh()}
            >
              <IconRefresh className={loading ? 'manager-refresh-icon--loading' : undefined} size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Collapse sidebar" openDelay={1000}>
            <ActionIcon
              ref={sidebarToggleRef}
              className="manager-sidebar-collapse-toggle manager-sidebar-header-action manager-sidebar-utility-action"
              variant="subtle"
              aria-label="Collapse sidebar"
              aria-controls="manager-sidebar"
              onClick={() => onToggleSidebar(!sidebarPinned)}
            >
              <IconLayoutSidebarLeftCollapse size={20} style={{ transform: sidebarPinned ? undefined : 'rotate(180deg)' }} />
            </ActionIcon>
          </Tooltip>
        </MantineGroup>
      </MantineGroup>

      {error && (
        <Alert color="red" title="Open Tabs unavailable" mx="xs" p="xs">
          {error}
        </Alert>
      )}
      {windows.length > 0 && !selectedWindow && (
        <Text size="xs" c="dimmed" px="xs">No selected browser window</Text>
      )}

      <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto" scrollbarSize={4}>
        <Stack
          gap={2}
          px="xs"
          pt="md"
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
            <MantineGroup justify="space-between" gap="xs" px="xs" py="xs" wrap="nowrap">
              <Text size="xs" c="dimmed">No tabs match “{query}”</Text>
              <Button size="compact-xs" variant="subtle" onClick={onClearFilter}>Clear filter</Button>
            </MantineGroup>
          )}
          {selectedWindow && filteredTabs.map((tab) => {
            const canSelect = tab.storable === true && isValidTabId(tab.id);
            const isSelected = isValidTabId(tab.id) && selectedTabIdSet.has(tab.id);
            const isClosing = isOpenTabClosing(tab, closingTabIdSet);
            const hasValidTabId = isValidTabId(tab.id);
            return (
              <MantineGroup
                key={`${selectedWindow.id ?? 'window'}-${tab.id ?? tab.index}`}
                gap="xs"
                wrap="nowrap"
                className="manager-open-tab-row"
                data-open-tab-id={hasValidTabId ? tab.id : undefined}
                data-open-window-id={hasValidTabId ? selectedWindow.id : undefined}
                data-selected={isSelected || undefined}
                onClick={() => {
                  if (selectionMode && canSelect) onToggleTabSelection(tab.id);
                }}
                px={0}
                py={1}
                style={{
                  borderRadius: 'var(--mantine-radius-sm)',
                  backgroundColor: 'transparent',
                  opacity: tab.storable === true ? 1 : 0.72,
                }}
              >
                {canSelect && (
                  <Checkbox
                    size="sm"
                    checked={isSelected}
                    aria-label={`Select ${tab.title || 'Untitled'}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => onToggleTabSelection(tab.id)}
                    className="manager-open-tab-select"
                    style={{ flexShrink: 0 }}
                  />
                )}
                <OpenTabContentTrigger
                  tab={tab}
                  workspaceId={workspaceId}
                  selectedTabIdSet={selectedTabIdSet}
                  selectedStorableRecords={selectedStorableRecords}
                  selectedStorableTabIds={selectedStorableTabIds}
                  previewKey={`open:${tab.id ?? tab.index}`}
                  onCloseTab={onCloseTab}
                  onPinTab={onPinTab}
                />
                <Tooltip label="Close tab" openDelay={1000}>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="gray"
                    aria-label={`Close ${tab.title || 'untitled tab'}`}
                    disabled={!isValidTabId(tab.id) || isClosing}
                    className="manager-open-tab-close"
                    onClick={(event) => void closeTabFromAction(event, tab.id)}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </Tooltip>
              </MantineGroup>
            );
          })}
        </Stack>
      </ScrollArea>

      {selectionMode ? (
        <MantineGroup className="manager-open-tabs-selection-actions" gap={8} wrap="nowrap">
          <Text className="manager-open-tabs-selection-actions__count" size="sm" fw={600} aria-live="polite">{selectedCount} Selected</Text>
          <div className="manager-open-tabs-selection-actions__tools">
            <Tooltip label="Select all" openDelay={1000}><ActionIcon size={32} variant="subtle" aria-label="Select all tabs" disabled={updatingSelection} onClick={onSelectAll}><IconSelectAll size={20} /></ActionIcon></Tooltip>
            <Tooltip label="Create session" openDelay={1000}><ActionIcon size={32} variant="subtle" color="blue" aria-label={`Create session from ${selectedCount} selected tabs`} disabled={selectedCount === 0 || capturing || updatingSelection} loading={capturing} onClick={() => void onCaptureSelectedTabs()}><IconFolderPlus size={20} /></ActionIcon></Tooltip>
            <Tooltip label="Delete selected tabs" openDelay={1000}><ActionIcon size={32} variant="subtle" color="red" aria-label={`Delete ${selectedCount} selected tabs`} disabled={selectedCount === 0 || capturing || updatingSelection} loading={updatingSelection} onClick={() => void onCloseSelectedTabs()}><IconTrash size={20} /></ActionIcon></Tooltip>
            <Tooltip label="Pin selected tabs" openDelay={1000}><ActionIcon size={32} variant="subtle" aria-label={`Pin ${selectedCount} selected tabs`} disabled={selectedCount === 0 || capturing || updatingSelection} onClick={() => void onPinSelectedTabs()}><IconPin size={20} /></ActionIcon></Tooltip>
            <Tooltip label="Exit selection mode" openDelay={1000}><ActionIcon size={32} variant="subtle" aria-label="Exit tab selection mode" disabled={updatingSelection} onClick={onExitSelectionMode}><IconX size={20} /></ActionIcon></Tooltip>
          </div>
        </MantineGroup>
      ) : (
        <TextInput
          id={OPEN_TABS_FILTER_INPUT_ID}
          mx="xs"
          mb="xs"
          size="xs"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder="Filter tabs"
          aria-label="Filter tabs by title or URL"
          rightSection={query ? (
            <Tooltip label="Clear tab filter" openDelay={1000}>
              <ActionIcon size="sm" variant="subtle" aria-label="Clear tab filter" onClick={onClearFilter}>
                <IconX size={13} />
              </ActionIcon>
            </Tooltip>
          ) : undefined}
        />
      )}

    </Stack>
  );
}
