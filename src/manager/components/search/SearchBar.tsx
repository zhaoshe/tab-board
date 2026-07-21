import { useState, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { TextInput, ActionIcon, Tooltip, Badge } from '@mantine/core';
import { IconSearch, IconX, IconKeyboard } from '@tabler/icons-react';
import { useSearchQuery, useSetSearchQuery } from '../../hooks/useFilteredGroups';
import { getVisibleGroups, type CategoryFilter } from '../../core/selectors';
import { useTabBoardStore } from '../../../shared/store/useTabBoardStore';
import { normalizeSearch } from '../../../shared/model';

interface SearchBarProps {
  autoFocus?: boolean;
  inputId?: string;
  category?: CategoryFilter;
  fullWidth?: boolean;
  onEscape?: () => void;
}

export function SearchBar({ autoFocus = false, inputId, category = 'inbox', fullWidth = false, onEscape }: SearchBarProps) {
  const query = useSearchQuery();
  const setQuery = useSetSearchQuery();
  const [localValue, setLocalValue] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const state = useTabBoardStore(
    useShallow((currentState) => ({
      activeWorkspaceId: currentState.activeWorkspaceId,
      workspaces: currentState.workspaces,
      folders: currentState.folders,
      groups: currentState.groups,
    })),
  );

  const normalized = normalizeSearch(localValue);
  const matchCount = normalized
    ? getVisibleGroups(state, category, localValue).length
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
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQuery(localValue);
    }, 150);
    return () => clearTimeout(timeout);
  }, [localValue, setQuery]);

  const handleClear = () => {
    setLocalValue('');
    setQuery('');
    inputRef.current?.focus();
  };

  const handleClose = () => {
    setLocalValue('');
    setQuery('');
    onEscape?.();
  };

  return (
    <div style={{ position: 'relative', maxWidth: fullWidth ? undefined : 500, width: '100%' }}>
      <TextInput
        id={inputId}
        ref={inputRef}
        placeholder="Search sessions, tabs, URLs, notes..."
        leftSection={<IconSearch size={16} />}
        rightSectionPointerEvents="all"
        rightSection={
          onEscape ? (
            <Tooltip label="Close search" position="left">
              <ActionIcon variant="subtle" onClick={handleClose} aria-label="Close search">
                <IconX size={16} />
              </ActionIcon>
            </Tooltip>
          ) : localValue ? (
            <ActionIcon variant="subtle" onClick={handleClear} title="Clear (Esc)" aria-label="Clear search">
              <IconX size={16} />
            </ActionIcon>
          ) : (
            <Tooltip label="/ or Ctrl/Cmd + K" position="left">
              <span aria-hidden="true">
                <IconKeyboard size={14} />
              </span>
            </Tooltip>
          )
        }
        value={localValue}
        onChange={(e) => setLocalValue(e.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            if (onEscape) {
              handleClose();
            } else {
              handleClear();
            }
          }
        }}
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
