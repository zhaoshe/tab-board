import {
  Group,
  Text,
} from '@mantine/core';
import type { RefObject } from 'react';
import {
  CheckCheck,
  FolderPlus,
  Inbox,
  PanelLeftOpen,
  SquareCheckBig,
  X,
} from 'lucide-react';
import { formatNumber } from '../../../shared/utils/formatters';
import { AccessibleIconAction } from '../../../shared/components/AccessibleIconAction';
import { TabBoardIcon } from '../../../shared/components/TabBoardIcon';

export function OpenTabsSelectionBar({
  capturing,
  openTabCount,
  filteredTabCount,
  filterActive,
  saveAllCount,
  selectedCount,
  selectionMode,
  sidebarCollapsed,
  allVisibleSelected,
  updatingSelection,
  onEnterSelection,
  onExpand,
  onSaveAll,
  expandRef,
  onCapture,
  onClear,
  onSaveTo,
  onSelectAll,
}: {
  capturing: boolean;
  openTabCount: number;
  filteredTabCount: number;
  filterActive: boolean;
  saveAllCount: number;
  selectedCount: number;
  selectionMode: boolean;
  sidebarCollapsed: boolean;
  allVisibleSelected: boolean;
  updatingSelection: boolean;
  onEnterSelection: () => void;
  onExpand: () => void;
  onSaveAll: () => void;
  expandRef: RefObject<HTMLButtonElement>;
  onCapture: () => void;
  onClear: () => void;
  onSaveTo: (trigger: HTMLButtonElement) => void;
  onSelectAll: () => void;
}) {
  return (
    <div
      className="manager-open-tabs-selection-bar"
      data-selection-mode={selectionMode || undefined}
      data-collapsed={sidebarCollapsed || undefined}
    >
      <div
        className="manager-open-tabs-context-layer manager-sidebar__expanded-content"
        aria-hidden={sidebarCollapsed || undefined}
        {...(sidebarCollapsed ? { inert: '' } : {})}
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
              <AccessibleIconAction
                label={allVisibleSelected
                  ? 'Unselect All Visible Tabs'
                  : 'Select All Visible Tabs'}
                disabled={updatingSelection}
                onClick={onSelectAll}
              >
                <TabBoardIcon icon={CheckCheck} />
              </AccessibleIconAction>
              <AccessibleIconAction
                label={capturing
                  ? 'Creating Session…'
                  : `Create Session from ${formatNumber(selectedCount)} Selected Tabs`}
                disabled={selectedCount === 0 || capturing || updatingSelection}
                loading={capturing}
                onClick={onCapture}
              >
                <TabBoardIcon icon={FolderPlus} />
              </AccessibleIconAction>
              <AccessibleIconAction
                label="Save Selected Tabs To"
                disabled={selectedCount === 0 || capturing || updatingSelection}
                onClick={(event) => onSaveTo(event.currentTarget)}
              >
                <TabBoardIcon icon={Inbox} />
              </AccessibleIconAction>
              <AccessibleIconAction
                label="Exit Tab Selection Mode"
                disabled={updatingSelection}
                onClick={onClear}
              >
                <TabBoardIcon icon={X} />
              </AccessibleIconAction>
            </div>
          </Group>
        ) : (
          <Group
            className="manager-open-tabs-context-actions"
            gap={8}
            wrap="nowrap"
          >
            <Text
              className="manager-open-tabs-context-actions__count"
              size="sm"
              fw={600}
            >
              {formatNumber(openTabCount)} Open {openTabCount === 1 ? 'Tab' : 'Tabs'}
            </Text>
            <div className="manager-open-tabs-context-actions__tools">
              <AccessibleIconAction
                label="Enter Tab Selection Mode"
                onClick={onEnterSelection}
              >
                <TabBoardIcon icon={SquareCheckBig} />
              </AccessibleIconAction>
              <AccessibleIconAction
                label={`Save All ${formatNumber(saveAllCount)} ${saveAllCount === 1 ? 'Tab' : 'Tabs'}`}
                disabled={saveAllCount === 0 || capturing}
                loading={capturing}
                onClick={onSaveAll}
              >
                <TabBoardIcon icon={Inbox} />
              </AccessibleIconAction>
            </div>
          </Group>
        )}
      </div>
      <AccessibleIconAction
        ref={expandRef}
        label={filterActive
          ? `Expand Sidebar, ${formatNumber(filteredTabCount)} of ${formatNumber(openTabCount)} open tabs match the filter`
          : 'Expand Sidebar'}
        aria-hidden={!sidebarCollapsed || undefined}
        tabIndex={sidebarCollapsed ? 0 : -1}
        className="manager-open-tabs-context-expand"
        onClick={onExpand}
      >
        <span className="manager-open-tabs-expand-glyph">
          <TabBoardIcon icon={PanelLeftOpen} />
          {filterActive ? (
            <span
              className="manager-open-tabs-filter-indicator"
              aria-hidden="true"
            />
          ) : null}
        </span>
      </AccessibleIconAction>
    </div>
  );
}
