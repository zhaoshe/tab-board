import { useState, type MouseEvent } from 'react';
import {
  ActionIcon,
  Checkbox,
  Group,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconBrowser,
  IconDots,
  IconGripVertical,
  IconPin,
  IconX,
} from '@tabler/icons-react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { OpenTabInfo } from '../../../shared/openTabs';
import { getOpenTabDragData } from '../../core/open-tabs';
import {
  ManagerMenuItem,
  useManagerInfoTrigger,
  useManagerPreviewOpen,
} from '../../hooks/useManagerOverlays';

function isValidTabId(id: number | undefined): id is number {
  return Number.isSafeInteger(id);
}

export function OpenTabRow({
  tab,
  workspaceId,
  selectedTabIdSet,
  selectedStorableRecords,
  selectedStorableTabIds,
  selectedCount,
  selectionMode,
  isClosing,
  onToggleSelection,
  onCloseTab,
  onCloseTabAction,
  onPinTab,
  onFocusTab,
}: {
  tab: OpenTabInfo;
  workspaceId: string;
  selectedTabIdSet: ReadonlySet<number>;
  selectedStorableRecords: OpenTabInfo[];
  selectedStorableTabIds: number[];
  selectedCount: number;
  selectionMode: boolean;
  isClosing: boolean;
  onToggleSelection: (tabId: number | undefined) => void;
  onCloseTab: (tabId: number | undefined) => Promise<void>;
  onCloseTabAction: (event: MouseEvent<HTMLButtonElement>, tabId: number | undefined) => void;
  onPinTab: (tabId: number | undefined) => Promise<void>;
  onFocusTab: (tabId: number | undefined, windowId: number | undefined) => Promise<void>;
}) {
  const previewKey = `open:${tab.id ?? tab.index}`;
  const isPreviewOpen = useManagerPreviewOpen(previewKey);
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
                <ManagerMenuItem
                  className="manager-info-card-action"
                  ariaLabel={`Pin ${tab.title || 'untitled tab'}`}
                  semanticRole="button"
                  onClick={() => onPinTab(tab.id)}
                >
                  <IconPin size={16} aria-hidden="true" />
                </ManagerMenuItem>
              </span>
            </Tooltip>
          )}
          {isValidTabId(tab.id) && (
            <Tooltip label="Close tab" openDelay={1000} zIndex={1100}>
              <span>
                <ManagerMenuItem
                  className="manager-info-card-action manager-overlay-menu__item--danger"
                  ariaLabel={`Close ${tab.title || 'untitled tab'}`}
                  semanticRole="button"
                  lifecycleAllowance="open-tab-removal"
                  onClick={() => onCloseTab(tab.id)}
                >
                  <IconX size={16} aria-hidden="true" />
                </ManagerMenuItem>
              </span>
            </Tooltip>
          )}
        </>
      ),
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
    attributes,
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

  return (
    <Group
      ref={(node) => {
        setNodeRef(node);
        if (node) node.inert = isDragging;
      }}
      gap={2}
      wrap="nowrap"
      className="manager-open-tab-row"
      data-open-tab-id={hasValidTabId ? tab.id : undefined}
      data-open-window-id={hasValidTabId ? tab.windowId : undefined}
      data-selected={isSelected || undefined}
      aria-hidden={isDragging || undefined}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.45 : tab.storable === true ? 1 : 0.72,
      }}
    >
      {canSelect && (
        <Checkbox
          size="sm"
          name="open-tab-selection"
          checked={isSelected}
          aria-label={`Select ${title}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            onToggleSelection(tab.id);
            if (isSelected && selectedCount === 1) {
              requestAnimationFrame(() => event.currentTarget.blur());
            }
          }}
          className="manager-open-tab-select"
        />
      )}
      <Tooltip label={`Drag ${title}`} openDelay={1000}>
        <ActionIcon
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="manager-open-tab-drag-handle"
          variant="subtle"
          aria-label={`Drag ${title} to a Session`}
          disabled={!canSelect}
        >
          <IconGripVertical size={14} aria-hidden="true" />
        </ActionIcon>
      </Tooltip>
      <UnstyledButton
        type="button"
        aria-label={`Focus ${title}`}
        className="manager-open-tab-content"
        disabled={!hasValidTabId}
        onClick={() => void onFocusTab(tab.id, tab.windowId)}
      >
        <span className="manager-open-tab-favicon" aria-hidden="true">
          {!showFavicon && (
            <IconBrowser
              className="manager-open-tab-favicon__fallback"
              size={20}
              aria-hidden="true"
            />
          )}
          {tab.favIconUrl && !faviconFailed && (
            <img
              src={tab.favIconUrl}
              alt=""
              width={20}
              height={20}
              loading="lazy"
              onError={() => setFaviconFailed(true)}
            />
          )}
        </span>
        <Stack className="manager-open-tab-details" gap={0}>
          <Text size="xs" lineClamp={1} fw={tab.active ? 600 : 400}>
            {title}
          </Text>
        </Stack>
      </UnstyledButton>
      <Tooltip label={`More Actions for ${title}`} openDelay={500}>
        <ActionIcon
          ref={infoTriggerRef}
          className="manager-open-tab-more"
          variant="subtle"
          aria-label={`More Actions for ${title}`}
          data-info-popover="open"
          data-info-key={previewKey}
          aria-haspopup="dialog"
          aria-expanded={isPreviewOpen}
        >
          <IconDots size={15} aria-hidden="true" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Close tab" openDelay={1000}>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          aria-label={`Close ${tab.title || 'untitled tab'}`}
          disabled={!isValidTabId(tab.id) || isClosing}
          className="manager-open-tab-close"
          onClick={(event) => onCloseTabAction(event, tab.id)}
        >
          <IconX size={14} aria-hidden="true" />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
