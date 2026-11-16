import { useEffect, useState } from 'react';
import { Notification, Portal, Text } from '@mantine/core';

export const FIRST_SAVED_HINT_STORAGE_KEY = 'tabboard.firstSavedHint';

type FirstSavedHintState = 'shown' | 'dismissed';

function readFirstSavedHintState(): FirstSavedHintState | null {
  try {
    const stored = window.localStorage?.getItem(FIRST_SAVED_HINT_STORAGE_KEY);
    return stored === 'shown' || stored === 'dismissed' ? stored : null;
  } catch {
    return null;
  }
}

function writeFirstSavedHintState(value: FirstSavedHintState): void {
  try {
    window.localStorage?.setItem(FIRST_SAVED_HINT_STORAGE_KEY, value);
  } catch {
    // Ignore storage failures and keep the current page usable.
  }
}

export function FirstSavedHint({
  savedSessionCount,
}: {
  savedSessionCount: number;
}) {
  const [state, setState] = useState<FirstSavedHintState | null>(() =>
    readFirstSavedHintState());
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (savedSessionCount <= 0 || state !== null) return;
    writeFirstSavedHintState('shown');
    setState('shown');
    setVisible(true);
  }, [savedSessionCount, state]);

  if (savedSessionCount <= 0 || !visible) return null;

  return (
    <Portal>
      <Notification
        className="manager-first-saved-hint"
        role="status"
        title="Saved Sessions Help"
        color="blue"
        closeButtonProps={{ 'aria-label': 'Dismiss saved sessions help' }}
        onClose={() => {
          writeFirstSavedHintState('dismissed');
          setState('dismissed');
          setVisible(false);
        }}
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 1790,
          maxWidth: 'min(320px, calc(100vw - 32px))',
        }}
      >
        <Text size="sm">
          Saved sessions are drag-and-drop surfaces. Drag from the session body,
          and right-click tabs or saved items for more actions.
        </Text>
      </Notification>
    </Portal>
  );
}
