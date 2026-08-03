import { ActionIcon, TextInput } from '@mantine/core';
import { X } from 'lucide-react';
import { TabBoardIcon } from '../../../shared/components/TabBoardIcon';
import { TabBoardTooltip } from '../../../shared/components/TabBoardTooltip';

export function OpenTabsFilterFooter({
  inputId,
  query,
  collapsed,
  onChange,
  onClear,
  onFocus,
}: {
  inputId: string;
  query: string;
  collapsed: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
  onFocus: () => void;
}) {
  return (
    <TextInput
      className="manager-open-tabs-filter-footer manager-sidebar__expanded-content"
      id={inputId}
      name="open-tabs-filter"
      autoComplete="off"
      spellCheck={false}
      mx="xs"
      mb="xs"
      mt={4}
      size="xs"
      value={query}
      onChange={(event) => onChange(event.currentTarget.value)}
      placeholder="Filter tabs…"
      aria-label="Filter Tabs by Title or URL"
      aria-hidden={collapsed || undefined}
      disabled={collapsed}
      tabIndex={collapsed ? -1 : undefined}
      onFocus={onFocus}
      style={{ flexShrink: 0 }}
      rightSection={query ? (
        <TabBoardTooltip label="Clear Tab Filter">
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-label="Clear Tab Filter"
            onClick={onClear}
          >
            <TabBoardIcon icon={X} size="menu" />
          </ActionIcon>
        </TabBoardTooltip>
      ) : undefined}
    />
  );
}
