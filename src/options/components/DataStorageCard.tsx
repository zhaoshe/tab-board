import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  FolderOpen as IconFolder,
  RefreshCw as IconRefresh,
  TriangleAlert as IconAlertTriangle,
  Unplug as IconPlugConnectedX,
} from 'lucide-react';
import {
  getActiveAdapter,
  isWorkerModuleFallbackReason,
  reconnectFolder,
} from '../../shared/store/activeAdapter';
import {
  readStorageStatusProjection,
  subscribeStorageStatusProjection,
} from '../../shared/store/fsBootstrap';
import type { StorageStatusProjection } from '../../shared/store/settingsProjection';
import { formatTime } from '../../shared/utils/formatters';
import { FolderPickerDialog } from './FolderPickerDialog';
import { DisconnectDialog } from './DisconnectDialog';

export function DataStorageCard() {
  const [status, setStatus] = useState<StorageStatusProjection | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [legacyRecoveryAttempted, setLegacyRecoveryAttempted] = useState(false);

  useEffect(() => {
    let disposed = false;
    let receivedSubscriptionUpdate = false;
    const unsubscribe = subscribeStorageStatusProjection((nextStatus) => {
      receivedSubscriptionUpdate = true;
      setStatus(nextStatus);
    });

    void readStorageStatusProjection().then((initialStatus) => {
      if (!disposed && !receivedSubscriptionUpdate) setStatus(initialStatus);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (
      legacyRecoveryAttempted
      || status?.configuredTarget !== 'file'
      || status.activeBackend !== 'browser'
      || !isWorkerModuleFallbackReason(status.fallbackReason)
    ) {
      return;
    }
    setLegacyRecoveryAttempted(true);
    void getActiveAdapter()
      .then(async () => {
        try {
          await chrome.runtime.sendMessage({ type: 'tabboard-storage-switched' });
        } catch {
          // Other extension contexts will re-read the persisted backend on next startup.
        }
      })
      .catch(() => {
        // The persisted fallback remains visible with its normal recovery actions.
      });
  }, [legacyRecoveryAttempted, status]);

  const reloadPage = () => {
    window.location.reload();
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    setReconnectError(null);
    try {
      const picker = (globalThis as unknown as {
        showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker;
      if (!picker) {
        throw new Error('Folder access is not available in this context.');
      }
      const root = await picker({ mode: 'readwrite' });
      await reconnectFolder(root);
      try {
        await chrome.runtime.sendMessage({ type: 'tabboard-storage-switched' });
      } catch {
        // ignore
      }
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
        return;
      }
      setReconnectError(err instanceof Error ? err.message : String(err));
    } finally {
      setReconnecting(false);
    }
  };

  const isFileConfigured = status?.configuredTarget === 'file';
  const isFallback = isFileConfigured && status.activeBackend === 'browser';
  const updatedTime = status?.fileUpdatedAt
    ? formatTime(status.fileUpdatedAt)
    : null;

  return (
    <>
      <section
        className="options-advanced-row options-storage-panel"
        aria-label="Storage location"
        aria-busy={status === null}
      >
        <Stack gap="md">
          <Group
            className="options-storage-heading-row"
            justify="space-between"
            align="flex-start"
            wrap="nowrap"
          >
            <div>
              <Title order={2} size="h5">
                Storage location
              </Title>
              <Text size="sm" c="dimmed">
                Choose where <span translate="no">TabBoard</span> saves session data.
              </Text>
            </div>
            {status?.configuredTarget === 'browser' && (
              <Button
                variant="default"
                leftSection={<IconFolder size={16} aria-hidden="true" />}
                onClick={() => setPickerOpen(true)}
              >
                Choose folder
              </Button>
            )}
            {isFileConfigured && !isFallback && (
              <Button
                variant="default"
                leftSection={<IconPlugConnectedX size={16} aria-hidden="true" />}
                onClick={() => setDisconnectOpen(true)}
              >
                Use browser storage
              </Button>
            )}
          </Group>

          {status === null && (
            <Text size="sm" c="dimmed" role="status">
              Loading storage status…
            </Text>
          )}

          {status?.configuredTarget === 'browser' && (
            <div
              className="options-storage-detail-row"
            >
              <Text size="sm">Browser storage</Text>
              <Text size="xs" c="dimmed">
                Session data is stored in this Chrome profile.
              </Text>
            </div>
          )}

          {isFileConfigured && (
            <>
              <Group
                className="options-storage-detail-row"
                justify="space-between"
                align="center"
                wrap="nowrap"
              >
                <Group
                  className="options-storage-folder-meta"
                  gap="md"
                  justify="space-between"
                  wrap="nowrap"
                >
                  <Text size="sm">
                    Local folder name: {status.folderName ?? 'Unavailable'}
                  </Text>
                  {updatedTime && (
                    <Text size="xs" c="dimmed">
                      updated: {updatedTime}
                    </Text>
                  )}
                </Group>
                {!isFallback && (
                  <Button
                    variant="default"
                    leftSection={<IconFolder size={16} aria-hidden="true" />}
                    onClick={() => setPickerOpen(true)}
                  >
                    Change folder
                  </Button>
                )}
              </Group>

              {isFallback && (
                <Alert
                  className="options-storage-fallback"
                  color="yellow"
                  icon={<IconAlertTriangle size={16} aria-hidden="true" />}
                >
                  <Stack gap="xs">
                    <Text size="sm">
                      New writes are temporarily stored in browser storage.
                    </Text>
                    {status.fallbackReason && (
                      <Text size="xs" c="dimmed">{status.fallbackReason}</Text>
                    )}
                    {reconnectError && (
                      <Text size="xs" c="red">{reconnectError}</Text>
                    )}
                    <Group className="options-storage-fallback-actions">
                      <Button
                        size="xs"
                        variant="default"
                        leftSection={<IconRefresh size={14} aria-hidden="true" />}
                        loading={reconnecting}
                        aria-label={reconnecting ? 'Reconnecting…' : 'Reconnect folder'}
                        onClick={() => void handleReconnect()}
                      >
                        {reconnecting ? 'Reconnecting…' : 'Reconnect folder'}
                      </Button>
                      <Button
                        size="xs"
                        variant="default"
                        leftSection={<IconPlugConnectedX size={14} aria-hidden="true" />}
                        onClick={() => setDisconnectOpen(true)}
                      >
                        Use browser storage
                      </Button>
                    </Group>
                  </Stack>
                </Alert>
              )}
            </>
          )}
        </Stack>
      </section>

      <FolderPickerDialog
        opened={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onComplete={reloadPage}
      />
      <DisconnectDialog
        opened={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        onComplete={reloadPage}
      />
    </>
  );
}
