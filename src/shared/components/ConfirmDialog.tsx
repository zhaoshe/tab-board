import { useCallback, type RefObject } from 'react';
import {
  Button,
  Group,
  Modal,
  Stack,
  Text,
} from '@mantine/core';

export interface ConfirmDialogProps {
  opened: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  loadingLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  confirmColor?: string;
  portalTarget?: HTMLElement | string;
  finalFocusRef?: RefObject<HTMLElement>;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  opened,
  title,
  message,
  confirmLabel,
  loadingLabel = `${confirmLabel}…`,
  cancelLabel = 'Cancel',
  loading = false,
  confirmColor = 'red',
  portalTarget,
  finalFocusRef,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const setCancelRef = useCallback((element: HTMLButtonElement | null) => {
    if (opened) element?.focus();
  }, [opened]);

  return (
    <Modal
      opened={opened}
      onClose={loading ? () => undefined : onCancel}
      title={title}
      size="sm"
      centered
      portalProps={portalTarget ? { target: portalTarget } : undefined}
      closeButtonProps={{ 'aria-label': `Close ${title}` }}
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      returnFocus={!finalFocusRef}
      onExitTransitionEnd={() => finalFocusRef?.current?.focus()}
    >
      <Stack gap="md">
        <Text className="confirm-dialog__message" size="sm">{message}</Text>
        <Group justify="flex-end" gap="xs">
          <Button
            ref={setCancelRef}
            data-autofocus
            variant="default"
            disabled={loading}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            className="destructive-confirm-action"
            color={confirmColor}
            loading={loading}
            aria-label={loading ? loadingLabel : confirmLabel}
            onClick={() => void onConfirm()}
          >
            {loading ? loadingLabel : confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
