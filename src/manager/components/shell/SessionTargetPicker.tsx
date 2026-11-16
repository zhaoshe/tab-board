import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Button, Group, Stack, Text } from '@mantine/core';
import type { OpenTabInfo } from '../../../shared/openTabs';
import {
  categoryForGroup,
  categoryOrder,
  groupsForCategory,
  type CategoryFilter,
} from '../../../shared/model/categories';
import type { DropIntent, SavedTabRef } from '../../../shared/model/drop-intent';
import { executeDropIntent } from '../../../shared/model/drop-operations';
import type { TabBoardState } from '../../../shared/model';
import { isLockedDropIntent } from '../../../shared/store/stateMutations';
import { isAllSourceTabs } from '../../core/dnd';
import { ManagerModal } from './ManagerModal';

export interface SessionTargetChoice {
  kind: 'existing-session' | 'new-session' | 'session-position';
  groupId?: string;
  category: CategoryFilter;
  index: number;
}

export type SessionTargetPickerMode =
  | 'move-saved-tabs'
  | 'save-open-tabs'
  | 'move-session-category';

type SavedTabTargetSource =
  | {
      kind: 'saved-tabs';
      refs: readonly SavedTabRef[];
    };

type OpenTabTargetSource =
  | {
      kind: 'open-tabs';
      tabIds: readonly number[];
      windowId: number;
      records: readonly OpenTabInfo[];
    };

type ExistingTabTargetSource = SavedTabTargetSource | OpenTabTargetSource;

type WholeSessionTargetSource = {
  kind: 'session';
  groupId: string;
};

export type SessionTargetSource =
  | ExistingTabTargetSource
  | WholeSessionTargetSource;

type SessionTargetOperation =
  | {
      mode: 'move-saved-tabs';
      source: SavedTabTargetSource;
    }
  | {
      mode: 'save-open-tabs';
      source: OpenTabTargetSource;
    }
  | {
      mode: 'move-session-category';
      source: WholeSessionTargetSource;
    };

export type OpenSessionTargetPickerInput = SessionTargetOperation & {
  trigger: HTMLButtonElement;
};

type CreateSessionTargetChoicesInput = {
  mode: SessionTargetPickerMode;
  source: SessionTargetSource;
  state: TabBoardState;
  workspaceId: string;
};

type CreateSessionTargetIntentInput = {
  mode: SessionTargetPickerMode;
  choice: SessionTargetChoice;
  workspaceId: string;
  source: SessionTargetSource;
};

export interface SessionTargetPickerProps {
  opened: boolean;
  mode: SessionTargetPickerMode;
  choices: readonly SessionTargetChoice[];
  choiceLabels: ReadonlyMap<string, string>;
  onPreview(choice: SessionTargetChoice): void;
  onCancel(): void;
  onCommit(choice: SessionTargetChoice): void | Promise<void>;
}

export function sessionTargetChoiceKey(choice: SessionTargetChoice): string {
  if (choice.kind === 'existing-session') {
    return `${choice.kind}:${choice.groupId ?? ''}`;
  }
  if (choice.kind === 'session-position') {
    return [
      choice.kind,
      choice.groupId ?? '',
      choice.category,
      choice.index,
    ].join(':');
  }
  return `${choice.kind}:${choice.category}:${choice.index}`;
}

function sourceRecords(source: SessionTargetSource): readonly OpenTabInfo[] {
  return source.kind === 'open-tabs' ? source.records : [];
}

function isSavedExistingNoOp(
  state: TabBoardState,
  source: Extract<SessionTargetSource, { kind: 'saved-tabs' }>,
  choice: SessionTargetChoice,
): boolean {
  if (!choice.groupId
    || source.refs.some(({ groupId }) => groupId !== choice.groupId)) {
    return false;
  }
  const target = state.groups.find(({ id }) => id === choice.groupId);
  if (!target) return false;
  const selected = new Set(source.refs.map(({ tabId }) => tabId));
  const moved = target.tabs.filter(({ id }) => selected.has(id));
  if (moved.length !== selected.size) return false;
  const remaining = target.tabs.filter(({ id }) => !selected.has(id));
  const next = [
    ...remaining.slice(0, choice.index),
    ...moved,
    ...remaining.slice(choice.index),
  ];
  return next.length === target.tabs.length
    && next.every(({ id }, index) => id === target.tabs[index]?.id);
}

export function createSessionTargetIntent({
  mode,
  choice,
  workspaceId,
  source,
}: CreateSessionTargetIntentInput): DropIntent | null {
  if (mode === 'move-session-category') {
    if (
      source.kind !== 'session'
      || choice.kind !== 'session-position'
      || choice.groupId !== source.groupId
    ) {
      return null;
    }
    return {
      kind: 'move-session',
      groupId: source.groupId,
      category: choice.category,
      index: choice.index,
      workspaceId,
    };
  }
  if (
    choice.kind === 'session-position'
    || (mode === 'move-saved-tabs' && source.kind !== 'saved-tabs')
    || (mode === 'save-open-tabs' && source.kind !== 'open-tabs')
    || source.kind === 'session'
  ) {
    return null;
  }
  if (choice.kind === 'existing-session') {
    if (!choice.groupId) return null;
    return source.kind === 'saved-tabs'
      ? {
          kind: 'move-tabs',
          refs: source.refs.map((ref) => ({ ...ref })),
          targetGroupId: choice.groupId,
          targetIndex: choice.index,
          workspaceId,
        }
      : {
          kind: 'copy-open-tabs',
          tabIds: [...source.tabIds],
          windowId: source.windowId,
          targetGroupId: choice.groupId,
          targetIndex: choice.index,
          workspaceId,
        };
  }
  return {
    kind: 'create-session',
    source: source.kind === 'saved-tabs'
      ? {
          kind: 'saved-tabs',
          refs: source.refs.map((ref) => ({ ...ref })),
        }
      : {
          kind: 'open-tabs',
          tabIds: [...source.tabIds],
          windowId: source.windowId,
        },
    category: choice.category,
    index: choice.index,
    workspaceId,
  };
}

function canCommitChoice(
  state: TabBoardState,
  mode: SessionTargetPickerMode,
  source: SessionTargetSource,
  choice: SessionTargetChoice,
  workspaceId: string,
): boolean {
  const intent = createSessionTargetIntent({
    mode,
    choice,
    workspaceId,
    source,
  });
  if (!intent
    || (
      choice.kind === 'existing-session'
      && source.kind === 'saved-tabs'
      && isSavedExistingNoOp(state, source, choice)
    )
    || isLockedDropIntent(state, intent, sourceRecords(source))) {
    return false;
  }
  return executeDropIntent(
    state,
    intent,
    sourceRecords(source),
    'target-choice-preview',
    state.updatedAt,
  ) !== state;
}

export function createSessionTargetChoices({
  mode,
  state,
  workspaceId,
  source,
}: CreateSessionTargetChoicesInput): SessionTargetChoice[] {
  if (state.activeWorkspaceId !== workspaceId
    || !state.workspaces.some(({ id }) => id === workspaceId)
    || (mode === 'move-saved-tabs' && source.kind !== 'saved-tabs')
    || (mode === 'save-open-tabs' && source.kind !== 'open-tabs')
    || (mode === 'move-session-category' && source.kind !== 'session')) {
    return [];
  }
  if (source.kind === 'session') {
    const sourceGroup = state.groups.find(({ id }) => id === source.groupId);
    if (
      !sourceGroup
      || sourceGroup.workspaceId !== workspaceId
      || sourceGroup.locked
    ) {
      return [];
    }
    const sourceCategory = categoryForGroup(state, sourceGroup);
    const sourceIndex = groupsForCategory(
      state,
      sourceCategory,
      workspaceId,
    ).findIndex(({ id }) => id === sourceGroup.id);
    const choices: SessionTargetChoice[] = [];

    for (const rawCategory of categoryOrder(state, workspaceId)) {
      if (rawCategory === 'bookmarks') continue;
      const category = rawCategory as CategoryFilter;
      const remaining = groupsForCategory(state, category, workspaceId)
        .filter(({ id }) => id !== sourceGroup.id);
      for (let index = 0; index <= remaining.length; index += 1) {
        if (category === sourceCategory && index === sourceIndex) continue;
        const choice: SessionTargetChoice = {
          kind: 'session-position',
          groupId: sourceGroup.id,
          category,
          index,
        };
        if (canCommitChoice(state, mode, source, choice, workspaceId)) {
          choices.push(choice);
        }
      }
    }
    return choices;
  }
  const suppressNew = source.kind === 'saved-tabs'
    && isAllSourceTabs({
      kind: 'tabs',
      refs: source.refs.map((ref) => ({ ...ref })),
      workspaceId,
    }, state.groups);
  const choices: SessionTargetChoice[] = [];

  for (const rawCategory of categoryOrder(state, workspaceId)) {
    if (rawCategory === 'bookmarks') continue;
    const category = rawCategory as CategoryFilter;
    const groups = groupsForCategory(state, category, workspaceId);
    groups.forEach((group, groupIndex) => {
      if (!suppressNew) {
        const newChoice: SessionTargetChoice = {
          kind: 'new-session',
          category,
          index: groupIndex,
        };
        if (canCommitChoice(state, mode, source, newChoice, workspaceId)) {
          choices.push(newChoice);
        }
      }
      const choice: SessionTargetChoice = {
        kind: 'existing-session',
        groupId: group.id,
        category: categoryForGroup(state, group),
        index: source.kind === 'saved-tabs'
          ? group.tabs.length - source.refs.filter(({ groupId }) =>
              groupId === group.id).length
          : group.tabs.length,
      };
      if (canCommitChoice(state, mode, source, choice, workspaceId)) {
        choices.push(choice);
      }
    });
    if (!suppressNew) {
      const newChoice: SessionTargetChoice = {
        kind: 'new-session',
        category,
        index: groups.length,
      };
      if (canCommitChoice(state, mode, source, newChoice, workspaceId)) {
        choices.push(newChoice);
      }
    }
  }
  return choices;
}

function categoryLabel(
  state: TabBoardState,
  category: CategoryFilter,
  workspaceId: string,
): string {
  if (category === 'inbox') return 'Inbox';
  if (category === 'saved') return 'Saved';
  if (category === 'archive') return 'Archive';
  const folderId = category.slice('folder:'.length);
  return state.folders.find((folder) =>
    folder.id === folderId && folder.workspaceId === workspaceId)?.name
    ?? 'Category';
}

export function createSessionTargetChoiceLabels({
  state,
  workspaceId,
  choices,
}: {
  state: TabBoardState;
  workspaceId: string;
  choices: readonly SessionTargetChoice[];
}): Map<string, string> {
  const labels = new Map<string, string>();
  for (const choice of choices) {
    const key = sessionTargetChoiceKey(choice);
    if (choice.kind === 'existing-session') {
      labels.set(
        key,
        state.groups.find((group) =>
          group.id === choice.groupId
          && group.workspaceId === workspaceId)?.title
          ?? 'Existing Session',
      );
      continue;
    }
    const groups = groupsForCategory(state, choice.category, workspaceId)
      .filter(({ id }) =>
        choice.kind !== 'session-position' || id !== choice.groupId);
    const category = categoryLabel(state, choice.category, workspaceId);
    const previous = groups[choice.index - 1];
    const next = groups[choice.index];
    if (choice.kind === 'session-position') {
      labels.set(
        key,
        choice.index === 0 && next
          ? `Before ${next.title} in ${category}`
          : previous
            ? `After ${previous.title} in ${category}`
            : `First in ${category}`,
      );
      continue;
    }
    const placement = previous && next
      ? `between ${previous.title} and ${next.title}`
      : next
        ? `before ${next.title}`
        : previous
          ? `after ${previous.title}`
          : '';
    labels.set(
      key,
      placement
        ? `New Session ${placement} in ${category}`
        : `New Session in ${category}`,
    );
  }
  return labels;
}

function choiceLabel(
  choice: SessionTargetChoice,
  choiceLabels: ReadonlyMap<string, string>,
): string {
  return choiceLabels.get(sessionTargetChoiceKey(choice))
    ?? (choice.kind === 'existing-session'
      ? 'Existing Session'
      : choice.kind === 'session-position'
        ? 'Session Position'
        : 'New Session');
}

function modeTitle(mode: SessionTargetPickerMode): string {
  if (mode === 'save-open-tabs') return 'Save Selected Tabs To';
  if (mode === 'move-session-category') return 'Move Session To';
  return 'Move Selected Items To';
}

function modeCommitLabel(
  mode: SessionTargetPickerMode,
  committing: boolean,
): string {
  if (mode === 'save-open-tabs') return committing ? 'Saving…' : 'Save';
  return committing ? 'Moving…' : 'Move';
}

export function SessionTargetPicker({
  opened,
  mode,
  choices,
  choiceLabels,
  onPreview,
  onCancel,
  onCommit,
}: SessionTargetPickerProps) {
  const [previewIndex, setPreviewIndex] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [committing, setCommitting] = useState(false);
  const closingRef = useRef(false);
  const focusRestoreRequestedRef = useRef(false);
  const focusAfterRejectRef = useRef(false);
  const choiceRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const triggerRef = useRef<HTMLElement | null>(null);
  const fallbackSelectorsRef = useRef<string[]>([]);
  const wasOpenedRef = useRef(false);
  const previewKeyRef = useRef<string | null>(null);
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;
  const choicesKey = useMemo(
    () => choices.map(sessionTargetChoiceKey).join('|'),
    [choices],
  );
  const preview = choices[previewIndex] ?? null;

  const restoreFocus = (): void => {
    window.setTimeout(() => {
      const trigger = triggerRef.current;
      const triggerDisabled = trigger instanceof HTMLButtonElement
        && trigger.disabled;
      if (
        trigger?.isConnected
        && !triggerDisabled
        && !trigger.closest('[inert]')
      ) {
        trigger.focus();
        return;
      }
      for (const selector of fallbackSelectorsRef.current) {
        const fallback = document.querySelector<HTMLElement>(selector);
        if (fallback?.isConnected) {
          fallback.focus();
          return;
        }
      }
    }, 0);
  };

  useEffect(() => {
    const justOpened = opened && !wasOpenedRef.current;
    if (justOpened) {
      closingRef.current = false;
      focusRestoreRequestedRef.current = false;
      triggerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      const sourceSession = triggerRef.current?.closest<HTMLElement>('.session-card');
      const sourceOpenTabs = triggerRef.current?.closest<HTMLElement>(
        '.manager-open-tabs-layout',
      );
      fallbackSelectorsRef.current = sourceOpenTabs
        ? [
            '[data-open-tabs-panel]',
            '.manager-open-tabs-layout',
            '.manager-board',
          ]
        : [
            ...(sourceSession?.dataset.groupId
              ? [`#session-card-${CSS.escape(sourceSession.dataset.groupId)}`]
              : []),
            '.session-board .session-card',
            '.session-card',
            '.session-board',
            '.manager-board',
          ];
    }
    if (
      !opened
      && wasOpenedRef.current
      && focusRestoreRequestedRef.current
    ) {
      focusRestoreRequestedRef.current = false;
      restoreFocus();
    }
    wasOpenedRef.current = opened;
    if (!opened) return;
    const preservedIndex = previewKeyRef.current === null
      ? -1
      : choices.findIndex((choice) =>
        sessionTargetChoiceKey(choice) === previewKeyRef.current);
    const nextIndex = justOpened
      ? 0
      : preservedIndex >= 0
        ? preservedIndex
        : Math.min(previewIndex, Math.max(0, choices.length - 1));
    const next = choices[nextIndex];
    previewKeyRef.current = next ? sessionTargetChoiceKey(next) : null;
    setPreviewIndex(nextIndex);
    setAnnouncement(next
      ? `Preview ${choiceLabel(next, choiceLabels)}`
      : 'No eligible targets');
    if (next) onPreviewRef.current(next);
    const target = choiceRefs.current[nextIndex];
    if (!justOpened && next && target && !target.disabled) target.focus();
  }, [choiceLabels, choices, choicesKey, opened]);

  useEffect(() => {
    if (!opened || committing || !focusAfterRejectRef.current) return;
    const preservedIndex = previewKeyRef.current === null
      ? -1
      : choices.findIndex((choice) =>
        sessionTargetChoiceKey(choice) === previewKeyRef.current);
    const nextIndex = preservedIndex >= 0
      ? preservedIndex
      : Math.min(previewIndex, Math.max(0, choices.length - 1));
    const target = choiceRefs.current[nextIndex];
    if (!target || target.disabled) return;
    focusAfterRejectRef.current = false;
    target.focus();
  }, [choices, choicesKey, committing, opened, previewIndex]);

  const selectPreview = (nextIndex: number): void => {
    if (!choices.length) return;
    const normalized = (nextIndex + choices.length) % choices.length;
    const next = choices[normalized]!;
    previewKeyRef.current = sessionTargetChoiceKey(next);
    setPreviewIndex(normalized);
    setAnnouncement(`Preview ${choiceLabel(next, choiceLabels)}`);
    onPreview(next);
    queueMicrotask(() => choiceRefs.current[normalized]?.focus());
  };

  const cancel = (): void => {
    if (closingRef.current || committing) return;
    closingRef.current = true;
    focusRestoreRequestedRef.current = true;
    setAnnouncement('Target selection cancelled');
    onCancel();
  };

  const commit = async (choice = preview): Promise<void> => {
    if (!choice || committing) return;
    setCommitting(true);
    focusRestoreRequestedRef.current = true;
    try {
      await onCommit(choice);
      closingRef.current = true;
      setAnnouncement(`Committed ${choiceLabel(choice, choiceLabels)}`);
    } catch {
      focusRestoreRequestedRef.current = false;
      focusAfterRejectRef.current = true;
      setAnnouncement('Unable to complete target selection. Try again.');
    } finally {
      setCommitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      selectPreview(previewIndex + 1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      selectPreview(previewIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      selectPreview(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      selectPreview(choices.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!committing) cancel();
    }
  };

  return (
    <>
      <ManagerModal
        opened={opened}
        title={modeTitle(mode)}
        onClose={() => {
          if (opened && !committing) cancel();
        }}
        closeOnClickOutside={!committing}
        closeOnEscape={!committing}
        closeButtonProps={{ disabled: committing }}
        returnFocus={false}
      >
        <Stack gap="xs" className="session-target-picker">
          <div
            className="session-target-picker__choices"
            role="listbox"
            aria-label={modeTitle(mode)}
          >
            {choices.map((choice, index) => (
              <button
                key={sessionTargetChoiceKey(choice)}
                ref={(element) => {
                  choiceRefs.current[index] = element;
                }}
                type="button"
                role="option"
                className="session-target-picker__choice"
                aria-label={choiceLabel(choice, choiceLabels)}
                aria-selected={index === previewIndex}
                disabled={committing}
                tabIndex={index === previewIndex ? 0 : -1}
                data-autofocus={index === 0 ? true : undefined}
                data-choice-kind={choice.kind}
                data-choice-group-id={choice.groupId}
                onFocus={() => {
                  if (index !== previewIndex) selectPreview(index);
                }}
                onClick={() => {
                  if (index !== previewIndex) {
                    selectPreview(index);
                  }
                  void commit(choice);
                }}
                onKeyDown={handleKeyDown}
              >
                <Text size="sm" fw={600}>
                  {choiceLabel(choice, choiceLabels)}
                </Text>
              </button>
            ))}
          </div>
          {choices.length === 0 ? (
            <Text size="sm" c="dimmed">No eligible Session targets</Text>
          ) : null}
          <Group justify="flex-end" gap="xs">
            <Button
              variant="default"
              disabled={committing}
              onClick={cancel}
            >
              Cancel
            </Button>
            <Button
              disabled={!preview || committing}
              loading={committing}
              onClick={() => void commit()}
            >
              {modeCommitLabel(mode, committing)}
            </Button>
          </Group>
        </Stack>
      </ManagerModal>
      <span
        className="visually-hidden"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </span>
    </>
  );
}
