import { useState, useEffect, useRef } from 'react';
import { TextInput, ActionIcon, Badge } from '@mantine/core';
import {
  Keyboard as IconKeyboard,
  Search as IconSearch,
  X as IconX,
} from 'lucide-react';
import { useBoardProjection } from '../../hooks/useBoardProjection';
import { useSearchQuery, useSetSearchQuery } from '../../hooks/useSearchQuery';
import { filterGroupsByQuery, type CategoryFilter } from '../../core/selectors';
import { normalizeSearch } from '../../../shared/model';
import { formatNumber } from '../../../shared/utils/formatters';
import { TabBoardTooltip } from '../../../shared/components/TabBoardTooltip';

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
  const { categoryGroups } = useBoardProjection(category);

  const normalized = normalizeSearch(localValue);
  const matchCount = normalized
    ? filterGroupsByQuery(categoryGroups, localValue).length
    : 0;

  useEffect(() => {
    setLocalValue(query);
  }, [query]);

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
        className="manager-search-input"
        id={inputId}
        ref={inputRef}
        name="saved-session-search"
        aria-label="Search Saved Sessions"
        autoComplete="off"
        placeholder="Search sessions, tabs, URLs, notes…"
        leftSection={<IconSearch size={16} aria-hidden="true" />}
        rightSectionPointerEvents="all"
        rightSection={
          onEscape ? (
            <TabBoardTooltip label="Close Search" position="left">
              <ActionIcon variant="subtle" onClick={handleClose} aria-label="Close Search">
                <IconX size={16} aria-hidden="true" />
              </ActionIcon>
            </TabBoardTooltip>
          ) : localValue ? (
            <TabBoardTooltip label="Clear Search" position="left">
              <ActionIcon variant="subtle" onClick={handleClear} aria-label="Clear Search">
                <IconX size={16} aria-hidden="true" />
              </ActionIcon>
            </TabBoardTooltip>
          ) : (
            <TabBoardTooltip label="/ or Ctrl/Cmd + K" position="left">
              <span aria-hidden="true">
                <IconKeyboard size={14} aria-hidden="true" />
              </span>
            </TabBoardTooltip>
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
          className="tabular-nums"
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
          {formatNumber(matchCount)} {matchCount === 1 ? 'result' : 'results'}
        </Badge>
      )}
    </div>
  );
}
