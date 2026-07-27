import { useEffect, useState } from 'react';
import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import type { CategoryFilter } from '../../core/selectors';
import { useSearchQuery } from '../../hooks/useSearchQuery';
import { SearchBar } from '../search/SearchBar';

export const SEARCH_INPUT_ID = 'manager-search-input';

export function getInitialSearchExpanded(query: string): boolean {
  return Boolean(query);
}

export function collapseSearchState(query: string): { query: string; isExpanded: false } {
  return { query, isExpanded: false };
}

export function shouldExpandSearchShortcut(target: EventTarget | null): boolean {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null;
  const tagName = element?.tagName?.toLowerCase() ?? '';
  return !element?.isContentEditable && !['input', 'textarea', 'select'].includes(tagName);
}

export function ManagerSearchCommand({
  category,
  onExpandedChange,
}: {
  category: CategoryFilter;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const query = useSearchQuery();
  const [expanded, setExpanded] = useState(() => getInitialSearchExpanded(query));

  const setSearchExpanded = (next: boolean) => {
    setExpanded(next);
    onExpandedChange?.(next);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcut = event.key === '/'
        || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k');
      if (!shortcut || !shouldExpandSearchShortcut(event.target)) return;
      event.preventDefault();
      setSearchExpanded(true);
      requestAnimationFrame(() => document.getElementById(SEARCH_INPUT_ID)?.focus());
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Group
      className={`manager-search-slot${expanded ? ' manager-search-slot--expanded' : ''}`}
      gap={4}
      justify="center"
      ml={expanded ? 'xs' : 'auto'}
    >
      {!expanded && (
        <Tooltip label="Show Search">
          <ActionIcon
            className="manager-search-toggle"
            variant="subtle"
            aria-label="Show Search"
            aria-controls={SEARCH_INPUT_ID}
            aria-expanded={expanded}
            onClick={() => {
              setSearchExpanded(true);
              requestAnimationFrame(() => document.getElementById(SEARCH_INPUT_ID)?.focus());
            }}
          >
            <IconSearch size={20} aria-hidden="true" />
          </ActionIcon>
        </Tooltip>
      )}
      {expanded && (
        <div style={{ width: 280, minWidth: 200 }}>
          <SearchBar
            inputId={SEARCH_INPUT_ID}
            autoFocus
            category={category}
            fullWidth={false}
            onEscape={() => setSearchExpanded(collapseSearchState(query).isExpanded)}
          />
        </div>
      )}
    </Group>
  );
}
