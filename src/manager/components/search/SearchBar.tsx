import { useState, useEffect, useRef } from 'react';
import { TextInput, ActionIcon, Tooltip, Badge } from '@mantine/core';
import { IconSearch, IconX, IconKeyboard } from '@tabler/icons-react';
import { useSearchQuery, useSetSearchQuery } from '../../hooks/useFilteredGroups';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import { normalizeSearch, groupMatchesQuery } from '../../../shared/model';

export function SearchBar() {
  const query = useSearchQuery();
  const setQuery = useSetSearchQuery();
  const [localValue, setLocalValue] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const groups = useTabBoardStore((state) => state.groups);
  const activeWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);

  const normalized = normalizeSearch(localValue);
  const matchCount = normalized
    ? groups.filter(
        (g) =>
          g.workspaceId === activeWorkspaceId && groupMatchesQuery(g, normalized)
      ).length
    : 0;

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      setLocalValue(customEvent.detail);
    };
    window.addEventListener('tabboard-search-change', handler);
    return () =>
      window.removeEventListener('tabboard-search-change', handler);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQuery(localValue);
    }, 150);
    return () => clearTimeout(timeout);
  }, [localValue, setQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setLocalValue('');
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleClear = () => {
    setLocalValue('');
    inputRef.current?.focus();
  };

  return (
    <div style={{ position: 'relative', maxWidth: 500, width: '100%' }}>
      <TextInput
        ref={inputRef}
        placeholder="Search sessions, tabs, URLs, notes..."
        leftSection={<IconSearch size={16} />}
        rightSection={
          localValue ? (
            <ActionIcon variant="subtle" onClick={handleClear} title="Clear (Esc)">
              <IconX size={16} />
            </ActionIcon>
          ) : (
            <Tooltip label="Ctrl/Cmd + F" position="left">
              <ActionIcon variant="subtle" size="sm">
                <IconKeyboard size={14} />
              </ActionIcon>
            </Tooltip>
          )
        }
        value={localValue}
        onChange={(e) => setLocalValue(e.currentTarget.value)}
        style={{ width: '100%' }}
      />
      {normalized && matchCount > 0 && (
        <Badge
          size="sm"
          variant="light"
          style={{
            position: 'absolute',
            right: 44,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }}
        >
          {matchCount} {matchCount === 1 ? 'result' : 'results'}
        </Badge>
      )}
    </div>
  );
}
