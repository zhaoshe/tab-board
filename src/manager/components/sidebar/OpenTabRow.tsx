import type { MouseEvent } from 'react';
import {
  Checkbox,
  Group,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { Globe2, X } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { OpenTabInfo } from '../../../shared/openTabs';
import { AccessibleIconAction } from '../../../shared/components/AccessibleIconAction';
import { Favicon } from '../../../shared/components/Favicon';
import { TabBoardIcon } from '../../../shared/components/TabBoardIcon';
import { getOpenTabDragData } from '../../core/open-tabs';
import { getTabHoverDomain, useManagerInfoTrigger } from '../../hooks/useManagerOverlays';

function isValidTabId(id: number | undefined): id is number {
  return Number.isSafeInteger(id);
}

function blocksOpenTabDrag(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, a, [data-no-drag]')) return true;
  const button = target.closest('button');
  return Boolean(button && !button.matches('.manager-open-tab-content'));
}

export function OpenTabRow({
  tab,
  workspaceId,
  selectedTabIdSet,
  selectedStorableRecords,
  selectedStorableTabIds,
  selectedCount,
  selectionMode,
  sidebarCollapsed,
  isClosing,
  onToggleSelection,
  onCloseTabAction,
  onFocusTab,
}: {
  tab: OpenTabInfo;
  workspaceId: string;
  selectedTabIdSet: ReadonlySet<number>;
  selectedStorableRecords: OpenTabInfo[];
  selectedStorableTabIds: number[];
  selectedCount: number;
  selectionMode: boolean;
  sidebarCollapsed: boolean;
  isClosing: boolean;
  onToggleSelection: (tabId: number | undefined) => void;
  onCloseTabAction: (event: MouseEvent<HTMLButtonElement>, tabId: number | undefined) => void;
  onFocusTab: (tabId: number | undefined, windowId: number | undefined) => Promise<void>;
}) {
  const previewKey = `open:${tab.id ?? tab.index}`;
  const infoTriggerRef = useManagerInfoTrigger(previewKey, {
    kind: 'open',
    model: {
      title: tab.title || 'Untitled',
      domain: getTabHoverDomain(tab.url),
      link: tab.url,
    },
  });
  const isSelected = isValidTabId(tab.id) && selectedTabIdSet.has(tab.id);
  const isSelectedDrag = isValidTabId(tab.id) && selectedTabIdSet.has(tab.id);
  const { records: dragRecords, tabIds: dragTabIds } = getOpenTabDragData(
    tab,
    isSelectedDrag,
    selectedStorableRecords,
    selectedStorableTabIds,
  );
  const {
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({
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
  const canSelect = tab.storable === true && isValidTabId(tab.id);
  const hasValidTabId = isValidTabId(tab.id);
  const title = tab.title || 'Untitled';
  const titleDetails = (
    <Stack className="manager-open-tab-details" gap={0}>
      <Text className="manager-open-tab-title" lineClamp={1} fw={600}>
        {title}
      </Text>
      <Text className="manager-open-tab-url" c="dimmed" lineClamp={1}>
        {tab.url}
      </Text>
    </Stack>
  );

  return (
    <Group
      gap={2}
      wrap="nowrap"
      className="manager-open-tab-row"
      data-open-tab-id={hasValidTabId ? tab.id : undefined}
      data-open-window-id={hasValidTabId ? tab.windowId : undefined}
      data-selected={isSelected || undefined}
      data-selection-mode={selectionMode || undefined}
      aria-hidden={isDragging || undefined}
      ref={(node) => {
        setNodeRef(node);
        setActivatorNodeRef(node);
        if (node) node.inert = isDragging;
      }}
      onPointerDown={(event) => {
        if (
          event.pointerType === 'touch'
          || blocksOpenTabDrag(event.target)
        ) {
          return;
        }
        listeners?.onPointerDown?.(event);
      }}
      onTouchStart={(event) => {
        if (blocksOpenTabDrag(event.target)) return;
        listeners?.onTouchStart?.(event);
      }}
      onClick={(event) => {
        if (!sidebarCollapsed || event.defaultPrevented) return;
        void onFocusTab(tab.id, tab.windowId);
      }}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.45 : tab.storable === true ? 1 : 0.72,
      }}
    >
      <span
        className="manager-tab-owner-slot manager-open-tab-owner-slot"
        data-pinned={tab.pinned || undefined}
      >
        <Favicon
          className="manager-open-tab-favicon"
          src={tab.favIconUrl}
          size={16}
          fallback={<Globe2 aria-hidden="true" />}
        />
        {tab.pinned ? <span className="manager-tab-owner-slot__badge" aria-hidden="true" /> : null}
        {canSelect && (
          <Checkbox
            size="sm"
            name="open-tab-selection"
            checked={isSelected}
            aria-label={`Select ${title}`}
            tabIndex={sidebarCollapsed ? -1 : undefined}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              const checkbox = event.currentTarget;
              onToggleSelection(tab.id);
              if (isSelected && selectedCount === 1) {
                requestAnimationFrame(() => checkbox.blur());
              }
            }}
            className="manager-open-tab-select"
          />
        )}
      </span>
      <UnstyledButton
        ref={infoTriggerRef}
        type="button"
        aria-label={`Go to ${title}`}
        aria-hidden={sidebarCollapsed || undefined}
        className="manager-open-tab-content manager-sidebar__expanded-content"
        data-info-popover={sidebarCollapsed ? undefined : 'open'}
        data-info-key={sidebarCollapsed ? undefined : previewKey}
        disabled={sidebarCollapsed || !hasValidTabId}
        tabIndex={sidebarCollapsed ? -1 : undefined}
        onClick={(event) => {
          event.stopPropagation();
          void onFocusTab(tab.id, tab.windowId);
        }}
      >
        {titleDetails}
      </UnstyledButton>
      <AccessibleIconAction
        label={`Close ${tab.title || 'untitled tab'}`}
        tooltip="Close tab"
        disabled={!isValidTabId(tab.id) || isClosing}
        tabIndex={sidebarCollapsed ? -1 : undefined}
        className="manager-open-tab-close"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onCloseTabAction(event, tab.id);
        }}
      >
        <TabBoardIcon icon={X} />
      </AccessibleIconAction>
    </Group>
  );
}
