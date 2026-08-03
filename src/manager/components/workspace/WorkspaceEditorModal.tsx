import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import {
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import {
  DEFAULT_WORKSPACE_EMOJI,
  normalizeWorkspaceEmoji,
  type Workspace,
} from '../../../shared/model';
import { ManagerModal } from '../shell/ManagerModal';

export const WORKSPACE_FAVORITE_EMOJIS = [
  '🗂️',
  '🏠',
  '💼',
  '📚',
  '✍️',
  '🎨',
  '💡',
  '🎯',
  '📊',
  '🛠️',
  '🧠',
  '🧪',
  '🚀',
  '🌱',
  '🤝',
  '⭐',
] as const;

const FAVORITE_COLUMNS = 8;

export interface WorkspaceEditorValue {
  name: string;
  emoji: string;
}

export interface WorkspaceEditorModalProps {
  opened: boolean;
  mode: 'create' | 'edit';
  workspace?: Workspace;
  workspaces: readonly Workspace[];
  finalFocusRef?: RefObject<HTMLElement>;
  onExited?: () => void;
  onClose: () => void;
  onSubmit: (value: WorkspaceEditorValue) => void | Promise<void>;
}

interface WorkspaceEditorValidation extends WorkspaceEditorValue {
  nameError: string | null;
  emojiError: string | null;
  valid: boolean;
}

function normalizeWorkspaceName(value: string): string {
  return value.normalize('NFC').trim();
}

function workspaceNameKey(value: string): string {
  return normalizeWorkspaceName(value).toLocaleLowerCase('en-US');
}

function normalizeCustomEmoji(value: string): string | null {
  const normalized = value.normalize('NFC');
  if (!normalized) return null;
  const parsed = normalizeWorkspaceEmoji(normalized);
  if (parsed !== normalized) return null;
  return parsed;
}

function validateEditor(
  name: string,
  emoji: string,
  workspaces: readonly Workspace[],
  excludedWorkspaceId?: string,
): WorkspaceEditorValidation {
  const normalizedName = normalizeWorkspaceName(name);
  const normalizedEmoji = normalizeCustomEmoji(emoji);
  const duplicate = normalizedName
    ? workspaces.some((workspace) =>
      workspace.id !== excludedWorkspaceId
      && workspaceNameKey(workspace.name) === workspaceNameKey(normalizedName))
    : false;
  const nameError = !normalizedName
    ? 'Workspace name is required.'
    : duplicate
      ? 'A workspace with this name already exists.'
      : null;
  const emojiError = normalizedEmoji ? null : 'Enter exactly one emoji.';
  return {
    name: normalizedName,
    emoji: normalizedEmoji ?? '',
    nameError,
    emojiError,
    valid: !nameError && !emojiError,
  };
}

function initialEmoji(
  mode: WorkspaceEditorModalProps['mode'],
  workspace?: Workspace,
): string {
  return mode === 'edit' && workspace
    ? workspace.emoji
    : DEFAULT_WORKSPACE_EMOJI;
}

export function WorkspaceEditorModal({
  opened,
  mode,
  workspace,
  workspaces,
  finalFocusRef,
  onExited,
  onClose,
  onSubmit,
}: WorkspaceEditorModalProps) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(DEFAULT_WORKSPACE_EMOJI);
  const [customMode, setCustomMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const favoriteRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!opened) return;
    const nextEmoji = initialEmoji(mode, workspace);
    setName(mode === 'edit' ? workspace?.name ?? '' : '');
    setEmoji(nextEmoji);
    setCustomMode(!WORKSPACE_FAVORITE_EMOJIS.includes(
      nextEmoji as (typeof WORKSPACE_FAVORITE_EMOJIS)[number],
    ));
    setSubmitting(false);
  }, [mode, opened, workspace]);

  const validation = validateEditor(
    name,
    emoji,
    workspaces,
    mode === 'edit' ? workspace?.id : undefined,
  );
  const title = mode === 'edit' ? 'Edit Workspace' : 'New Workspace';
  const submitLabel = mode === 'edit' ? 'Save Workspace' : 'Create Workspace';

  const close = () => {
    if (submitting) return;
    onClose();
  };

  const submit = async () => {
    if (!validation.valid || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: validation.name,
        emoji: validation.emoji,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const moveFavoriteFocus = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex = index;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = Math.min(index + 1, WORKSPACE_FAVORITE_EMOJIS.length - 1);
        break;
      case 'ArrowLeft':
        nextIndex = Math.max(index - 1, 0);
        break;
      case 'ArrowDown':
        if (index + FAVORITE_COLUMNS < WORKSPACE_FAVORITE_EMOJIS.length) {
          nextIndex = index + FAVORITE_COLUMNS;
        }
        break;
      case 'ArrowUp':
        if (index - FAVORITE_COLUMNS >= 0) {
          nextIndex = index - FAVORITE_COLUMNS;
        }
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = WORKSPACE_FAVORITE_EMOJIS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const nextEmoji = WORKSPACE_FAVORITE_EMOJIS[nextIndex];
    setEmoji(nextEmoji);
    setCustomMode(false);
    favoriteRefs.current[nextIndex]?.focus();
  };

  return (
    <ManagerModal
      opened={opened}
      onClose={close}
      title={title}
      size="sm"
      centered
      closeOnClickOutside={!submitting}
      closeOnEscape={!submitting}
      returnFocus={false}
      onExitTransitionEnd={() => {
        finalFocusRef?.current?.focus();
        onExited?.();
      }}
    >
      <Stack gap="md">
        <TextInput
          name="workspace-name"
          label="Workspace name"
          autoComplete="off"
          value={name}
          error={validation.nameError}
          disabled={submitting}
          onChange={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
          }}
          data-autofocus
        />

        <Stack gap="xs">
          <Text component="span" size="sm" fw={500}>Workspace emoji</Text>
          <div
            className="workspace-editor-emoji-grid"
            role="group"
            aria-label="Workspace emoji"
            data-columns={FAVORITE_COLUMNS}
          >
            {WORKSPACE_FAVORITE_EMOJIS.map((favorite, index) => (
              <UnstyledButton
                key={favorite}
                ref={(element) => {
                  favoriteRefs.current[index] = element;
                }}
                className="workspace-editor-emoji-option"
                type="button"
                data-workspace-emoji={favorite}
                aria-label={`Use ${favorite}`}
                aria-pressed={!customMode && emoji === favorite}
                tabIndex={!customMode && emoji === favorite
                  ? 0
                  : customMode && index === 0
                    ? 0
                    : -1}
                disabled={submitting}
                onClick={() => {
                  setEmoji(favorite);
                  setCustomMode(false);
                }}
                onKeyDown={(event) => moveFavoriteFocus(event, index)}
              >
                {favorite}
              </UnstyledButton>
            ))}
          </div>

          <Button
            className="workspace-editor-custom-toggle"
            type="button"
            size="compact-sm"
            variant={customMode ? 'light' : 'default'}
            aria-pressed={customMode}
            disabled={submitting}
            onClick={() => {
              setCustomMode(true);
              if (WORKSPACE_FAVORITE_EMOJIS.includes(
                emoji as (typeof WORKSPACE_FAVORITE_EMOJIS)[number],
              )) {
                setEmoji('');
              }
            }}
          >
            Custom
          </Button>

          {customMode ? (
            <TextInput
              name="workspace-emoji"
              label="Custom emoji"
              autoComplete="off"
              value={emoji}
              error={validation.emojiError}
              disabled={submitting}
              onChange={(event) => setEmoji(event.currentTarget.value.normalize('NFC'))}
            />
          ) : null}
        </Stack>

        <div className="workspace-editor-preview" aria-live="polite">
          <span className="workspace-editor-preview__emoji" aria-hidden="true">
            {validation.emoji || emoji || DEFAULT_WORKSPACE_EMOJI}
          </span>
          <Text component="span" size="sm" fw={600} lineClamp={1}>
            {validation.name || 'Untitled workspace'}
          </Text>
        </div>

        <Group justify="flex-end">
          <Button variant="default" disabled={submitting} onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!validation.valid}
            loading={submitting}
            onClick={() => void submit()}
          >
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </ManagerModal>
  );
}
