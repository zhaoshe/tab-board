import { ActionIcon, TextInput, Tooltip } from '@mantine/core';
import { IconX } from '@tabler/icons-react';

export function OpenTabsFilterFooter({
  inputId,
  query,
  onChange,
  onClear,
}: {
  inputId: string;
  query: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <TextInput
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
      style={{ flexShrink: 0 }}
      rightSection={query ? (
        <Tooltip label="Clear Tab Filter" openDelay={1000}>
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-label="Clear Tab Filter"
            onClick={onClear}
          >
            <IconX size={13} aria-hidden="true" />
          </ActionIcon>
        </Tooltip>
      ) : undefined}
    />
  );
}
