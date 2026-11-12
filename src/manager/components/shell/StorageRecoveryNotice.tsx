import { useEffect, useState } from 'react';
import { Button, Notification, Portal, Text } from '@mantine/core';
import { useStorageStatusProjection } from '../../../shared/hooks/useStorageStatusProjection';
import { formatNumber } from '../../../shared/utils/formatters';

export function StorageRecoveryNotice() {
  const status = useStorageStatusProjection();
  const count = status?.unreadSessionCount ?? 0;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { setDismissed(false); }, [count]);
  if (!count || dismissed) return null;
  return (
    <Portal>
      <Notification
        className="manager-storage-notice"
        role="alert"
        title="Incomplete folder data"
        color="yellow"
        closeButtonProps={{ 'aria-label': 'Dismiss storage notice' }}
        onClose={() => setDismissed(true)}
        style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1800, maxWidth: 'min(360px, calc(100vw - 32px))' }}
      >
        <Text size="sm">{formatNumber(count)} saved {count === 1 ? 'session could' : 'sessions could'} not be read. Original files remain in your folder.</Text>
        <Button variant="subtle" size="compact-sm" onClick={() => void chrome.runtime.sendMessage({ type: 'open-options' }).catch(() => undefined)}>Open settings</Button>
      </Notification>
    </Portal>
  );
}
