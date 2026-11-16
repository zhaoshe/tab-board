import { useEffect, useState } from 'react';
import { ActionIcon, Group } from '@mantine/core';
import { Search as IconSearch } from 'lucide-react';
import { TabBoardIcon } from '../../../shared/components/TabBoardIcon';
import { TabBoardTooltip } from '../../../shared/components/TabBoardTooltip';
import type { CategoryFilter } from '../../core/selectors';
import { useSearchQuery } from '../../hooks/useSearchQuery';
import { SearchBar } from '../search/SearchBar';
import type { Group as SessionGroup } from '../../../shared/model';

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
  bookmarkGroups = [],
  onExpandedChange,
}: {
  category: CategoryFilter;
  bookmarkGroups?: readonly SessionGroup[];
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
        <TabBoardTooltip label="Show Search">
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
            <TabBoardIcon icon={IconSearch} />
          </ActionIcon>
        </TabBoardTooltip>
      )}
      {expanded && (
        <div style={{ width: 280, minWidth: 200 }}>
          <SearchBar
            inputId={SEARCH_INPUT_ID}
            autoFocus
            category={category}
            bookmarkGroups={bookmarkGroups}
            fullWidth={false}
            onEscape={() => setSearchExpanded(collapseSearchState(query).isExpanded)}
          />
        </div>
      )}
    </Group>
  );
}
