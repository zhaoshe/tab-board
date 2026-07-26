import { useState, useEffect } from 'react';
import {
  Card,
  Stack,
  Group,
  Title,
  Text,
  Button,
  Alert,
} from '@mantine/core';
import {
  IconDatabase,
  IconFolder,
  IconAlertTriangle,
  IconRefresh,
  IconPlugConnectedX,
} from '@tabler/icons-react';
import {
  getActiveState,
  isFileModeActive,
  onFallback,
  reconnectFolder,
} from '../../shared/store/activeAdapter';
import { FolderPickerDialog } from './FolderPickerDialog';
import { DisconnectDialog } from './DisconnectDialog';

interface SavedRootInfo {
  name: string | null;
}

async function getFolderNameFromIdb(): Promise<string | null> {
  // The root handle is persisted via fsDirectory. loadRootHandle retrieves it.
  try {
    const { loadRootHandle } = await import('../../shared/store/fsDirectory');
    const root = await loadRootHandle();
    return root ? root.name : null;
  } catch {
    return null;
  }
}

async function readLastSavedFromAuthority(): Promise<string | null> {
  try {
    const state = await getActiveState();
    return state.updatedAt || null;
  } catch {
    return null;
  }
}

function formatRelativeTime(iso: string): string {
  try {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return iso;
    const diffMs = Date.now() - t;
    const diffSec = Math.round(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    return `${diffDay}d ago`;
  } catch {
    return iso;
  }
}

export function DataStorageCard() {
  const [fileMode, setFileMode] = useState<boolean>(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const refreshStatus = async () => {
    try {
      const active = await isFileModeActive();
      setFileMode(active);
      if (active) {
        const [name, saved] = await Promise.all([
          getFolderNameFromIdb(),
          readLastSavedFromAuthority(),
        ]);
        setFolderName(name);
        setUpdatedAt(saved);
      } else {
        setFolderName(null);
        setUpdatedAt(null);
      }
    } catch {
      setFileMode(false);
    }
  };

  useEffect(() => {
    void refreshStatus();
    const unsub = onFallback((reason: string) => {
      setFallbackReason(reason);
      setFileMode(false);
    });
    return () => {
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadPage = () => {
    window.location.reload();
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      // Prompt the user to re-pick the folder; this also re-grants permission.
      const picker = (globalThis as unknown as {
        showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker;
      if (!picker) {
        setFallbackReason('showDirectoryPicker is not available in this context.');
        setReconnecting(false);
        return;
      }
      const root = await picker({ mode: 'readwrite' });
      await reconnectFolder(root);
      try {
        await chrome.runtime.sendMessage({ type: 'tabboard-storage-switched' });
      } catch {
        // ignore
      }
      reloadPage();
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
        setReconnecting(false);
        return;
      }
      setFallbackReason(err instanceof Error ? err.message : String(err));
      setReconnecting(false);
    }
  };

  const storageLabel = fileMode
    ? (folderName ? `File storage — ${folderName}` : 'File storage')
    : 'Browser storage';

  return (
    <>
      <Card withBorder shadow="sm" padding="lg">
        <Stack gap="md">
          <div>
            <Group gap="xs" mb={2}>
              {fileMode ? <IconFolder size={18} /> : <IconDatabase size={18} />}
              <Title order={2} size="h5">
                Data Storage
              </Title>
            </Group>
            <Text size="sm" c="dimmed">
              Where TabBoard saves your sessions
            </Text>
          </div>

          <Text size="sm">
            <strong>Current storage:</strong> {storageLabel}
          </Text>

          {fileMode && updatedAt && (
            <Text size="xs" c="dimmed">
              Last saved: {formatRelativeTime(updatedAt)}
            </Text>
          )}

          {fallbackReason && (
            <Alert color="red" icon={<IconAlertTriangle size={16} />}>
              <Text size="sm">{fallbackReason}</Text>
              <Group mt="sm">
                <Button
                  size="xs"
                  leftSection={<IconRefresh size={14} />}
                  loading={reconnecting}
                  onClick={() => void handleReconnect()}
                >
                  Reconnect folder
                </Button>
              </Group>
            </Alert>
          )}

          <Group gap="xs">
            {!fileMode && (
              <Button
                variant="light"
                leftSection={<IconFolder size={16} />}
                onClick={() => setPickerOpen(true)}
              >
                Choose folder…
              </Button>
            )}
            {fileMode && (
              <>
                <Button
                  variant="light"
                  leftSection={<IconRefresh size={16} />}
                  loading={reconnecting}
                  onClick={() => void handleReconnect()}
                >
                  Reconnect folder
                </Button>
                <Button
                  variant="outline"
                  color="red"
                  leftSection={<IconPlugConnectedX size={16} />}
                  onClick={() => setDisconnectOpen(true)}
                >
                  Stop using file storage
                </Button>
              </>
            )}
          </Group>
        </Stack>
      </Card>

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
