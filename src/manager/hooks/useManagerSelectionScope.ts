import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  reduceSelectionScope,
  type SelectionScope,
  type SelectionScopeAction,
} from '../core/selectionScope';

export interface SelectionScopeCommands {
  enterOpenTabs(windowId: number): void;
  enterSavedTabs(groupId: string): void;
  exit(): void;
}

export interface ManagerSelectionScope {
  scope: SelectionScope;
  commands: SelectionScopeCommands;
  registerOpenTabsClear(clear: () => void): () => void;
  registerSavedTabsClear(groupId: string, clear: () => void): () => void;
}

export function useManagerSelectionScope(): ManagerSelectionScope {
  const [scope, setScope] = useState<SelectionScope>(null);
  const scopeRef = useRef<SelectionScope>(null);
  const openTabsClearRef = useRef<(() => void) | null>(null);
  const savedTabsClearRef = useRef(new Map<string, () => void>());

  const clearOwner = useCallback((owner: SelectionScope) => {
    if (owner?.kind === 'open-tabs') {
      openTabsClearRef.current?.();
    } else if (owner?.kind === 'saved-tabs') {
      savedTabsClearRef.current.get(owner.groupId)?.();
    }
  }, []);

  const transition = useCallback((action: SelectionScopeAction) => {
    const next = reduceSelectionScope(scopeRef.current, action);
    scopeRef.current = next.scope;
    clearOwner(next.clearedScope);
    setScope(next.scope);
  }, [clearOwner]);

  const commands = useMemo<SelectionScopeCommands>(() => ({
    enterOpenTabs: (windowId) => {
      if (Number.isSafeInteger(windowId)) {
        transition({ type: 'enter-open-tabs', windowId });
      }
    },
    enterSavedTabs: (groupId) => {
      if (groupId) transition({ type: 'enter-saved-tabs', groupId });
    },
    exit: () => transition({ type: 'exit' }),
  }), [transition]);

  const registerOpenTabsClear = useCallback((clear: () => void) => {
    openTabsClearRef.current = clear;
    return () => {
      if (openTabsClearRef.current === clear) openTabsClearRef.current = null;
    };
  }, []);

  const registerSavedTabsClear = useCallback((groupId: string, clear: () => void) => {
    savedTabsClearRef.current.set(groupId, clear);
    return () => {
      if (savedTabsClearRef.current.get(groupId) === clear) {
        savedTabsClearRef.current.delete(groupId);
        if (
          scopeRef.current?.kind === 'saved-tabs'
          && scopeRef.current.groupId === groupId
        ) {
          transition({ type: 'exit' });
        }
      }
    };
  }, [transition]);

  return {
    scope,
    commands,
    registerOpenTabsClear,
    registerSavedTabsClear,
  };
}
