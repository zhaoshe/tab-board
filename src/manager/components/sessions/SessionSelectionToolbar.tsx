import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCheck,
  Copy,
  MoveRight,
  SquareArrowOutUpRight,
  Trash,
  X,
} from 'lucide-react';
import type { TabItem } from '../../../shared/model';
import type { SavedTabRef } from '../../../shared/model/drop-intent';
import { AccessibleIconAction } from '../../../shared/components/AccessibleIconAction';
import { TabBoardIcon } from '../../../shared/components/TabBoardIcon';
import { formatNumber } from '../../../shared/utils/formatters';

export interface SessionSelectionToolbarProps {
  groupId: string;
  locked: boolean;
  selectedItems: readonly TabItem[];
  selectedTabIds: ReadonlySet<string>;
  visibleTabIds: readonly string[];
  onChangeVisibleSelection(tabIds: readonly string[], selected: boolean): void;
  onRestore(refs: readonly SavedTabRef[]): Promise<readonly string[]>;
  onCopy(urls: readonly string[]): Promise<void>;
  onMove(trigger: HTMLButtonElement): void;
  onDelete(refs: readonly SavedTabRef[]): Promise<void>;
  onRemoveSelection(tabIds: readonly string[]): void;
  onClearSelection(): void;
  onExit(): void;
}

type PendingAction = 'restore' | 'copy' | 'delete' | null;

export function SessionSelectionToolbar({
  groupId,
  locked,
  selectedItems,
  selectedTabIds,
  visibleTabIds,
  onChangeVisibleSelection,
  onRestore,
  onCopy,
  onMove,
  onDelete,
  onRemoveSelection,
  onClearSelection,
  onExit,
}: SessionSelectionToolbarProps) {
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const selectedLinks = useMemo(
    () => selectedItems.filter((item) => item.itemType === 'link' && item.url),
    [selectedItems],
  );
  const selectedRefs = useMemo(
    () => selectedItems.map(({ id }) => ({ groupId, tabId: id })),
    [groupId, selectedItems],
  );
  const selectedLinkRefs = useMemo(
    () => selectedLinks.map(({ id }) => ({ groupId, tabId: id })),
    [groupId, selectedLinks],
  );
  const allVisibleSelected = visibleTabIds.length > 0
    && visibleTabIds.every((id) => selectedTabIds.has(id));
  const busy = pendingAction !== null;

  useEffect(() => {
    firstActionRef.current?.focus();
  }, []);

  const run = async <T,>(
    action: Exclude<PendingAction, null>,
    operation: () => Promise<T>,
    onSuccess?: (result: T) => void,
  ): Promise<void> => {
    if (busy) return;
    setPendingAction(action);
    try {
      const result = await operation();
      onSuccess?.(result);
    } catch {
      // The injected command owns user-facing error feedback. Keep selection for retry.
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <header
      className="session-card__header session-selection-toolbar"
      aria-label="Session Selection"
      data-no-drag
    >
      <span
        className="session-selection-toolbar__count"
        aria-live="polite"
      >
        {formatNumber(selectedItems.length)} Selected
      </span>
      <div className="session-selection-toolbar__actions">
        <AccessibleIconAction
          ref={firstActionRef}
          label={allVisibleSelected
            ? 'Unselect All Visible Items'
            : 'Select All Visible Items'}
          disabled={visibleTabIds.length === 0 || busy}
          onClick={() => onChangeVisibleSelection(
            visibleTabIds,
            !allVisibleSelected,
          )}
        >
          <TabBoardIcon icon={CheckCheck} />
        </AccessibleIconAction>
        <AccessibleIconAction
          label="Restore Selected Links"
          disabled={locked || selectedLinks.length === 0 || busy}
          loading={pendingAction === 'restore'}
          onClick={() => void run(
            'restore',
            () => onRestore(selectedLinkRefs),
            onRemoveSelection,
          )}
        >
          <TabBoardIcon icon={SquareArrowOutUpRight} />
        </AccessibleIconAction>
        <AccessibleIconAction
          label="Copy Selected URLs"
          disabled={selectedLinks.length === 0 || busy}
          loading={pendingAction === 'copy'}
          onClick={() => void run(
            'copy',
            () => onCopy(selectedLinks.map(({ url }) => url)),
          )}
        >
          <TabBoardIcon icon={Copy} />
        </AccessibleIconAction>
        <AccessibleIconAction
          label="Move Selected Items"
          disabled={locked || selectedItems.length === 0 || busy}
          onClick={(event) => onMove(event.currentTarget)}
        >
          <TabBoardIcon icon={MoveRight} />
        </AccessibleIconAction>
        <AccessibleIconAction
          label="Delete Selected Items"
          danger
          disabled={locked || selectedItems.length === 0 || busy}
          loading={pendingAction === 'delete'}
          onClick={() => void run(
            'delete',
            () => onDelete(selectedRefs),
            onClearSelection,
          )}
        >
          <TabBoardIcon icon={Trash} />
        </AccessibleIconAction>
        <AccessibleIconAction
          label="Exit Session Selection Mode"
          disabled={busy}
          onClick={onExit}
        >
          <TabBoardIcon icon={X} />
        </AccessibleIconAction>
      </div>
    </header>
  );
}
