import { useState } from 'react';
import {
  Modal,
  Stack,
  Button,
  Text,
  Radio,
  Group,
  Alert,
  Loader,
  Center,
} from '@mantine/core';
import {
  IconFolder,
  IconAlertTriangle,
  IconCheck,
} from '@tabler/icons-react';
import {
  clone,
  normalizeState,
  type TabBoardState,
} from '../../shared/model';
import { initFileStorageDirectory } from '../../shared/store/fileStorage';
import { switchToFileMode } from '../../shared/store/activeAdapter';
import { mergeStates } from '../../shared/store/mergeStates';

export type MigrationMode = 'use-file' | 'export-browser' | 'merge';

interface FolderPickerDialogProps {
  opened: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type Step = 'choose' | 'inspecting' | 'empty-confirm' | 'existing-choices' | 'migrating' | 'error' | 'success';

/**
 * Pure helper: compute the final TabBoardState for a file-mode migration.
 * Exported for unit testing. Does not perform any disk writes or adapter
 * switching; callers are responsible for persisting/switching afterwards.
 *
 * - 'use-file': returns the file state if present, otherwise an empty normalized state.
 * - 'export-browser': returns a clone of the browser state (to be written to the folder).
 * - 'merge': merges browser and file states using mergeStates().
 */
export function migrateToFile(
  root: FileSystemDirectoryHandle,
  mode: MigrationMode,
  browserState: TabBoardState,
  fileState: TabBoardState | null,
): TabBoardState {
  // `root` is accepted for API shape / future use but pure logic does not touch disk.
  void root;
  switch (mode) {
    case 'use-file':
      return fileState ? clone(fileState) : normalizeState(null);
    case 'export-browser':
      return clone(browserState);
    case 'merge':
      return mergeStates(clone(browserState), fileState ? clone(fileState) : normalizeState(null));
  }
}

export function FolderPickerDialog({ opened, onClose, onComplete }: FolderPickerDialogProps) {
  const [step, setStep] = useState<Step>('choose');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [pickedRoot, setPickedRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [fileState, setFileState] = useState<TabBoardState | null>(null);
  const [migrationMode, setMigrationMode] = useState<MigrationMode>('merge');

  function reset() {
    setStep('choose');
    setErrorMsg('');
    setPickedRoot(null);
    setFileState(null);
    setMigrationMode('merge');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function pickFolder() {
    try {
      const picker = (globalThis as unknown as {
        showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker;
      if (!picker) {
        setErrorMsg('showDirectoryPicker is not available in this context.');
        setStep('error');
        return;
      }
      const root = await picker({ mode: 'readwrite' });
      setPickedRoot(root);
      setStep('inspecting');
      try {
        const info = await initFileStorageDirectory(root);
        if (info.hasExistingData && info.state) {
          setFileState(info.state);
          setStep('existing-choices');
        } else {
          setFileState(null);
          setStep('empty-confirm');
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStep('error');
      }
    } catch (err) {
      // User cancelled — stay on choose step without showing error.
      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
        return;
      }
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  }

  async function performMigration(mode: MigrationMode) {
    if (!pickedRoot) return;
    setStep('migrating');
    try {
      // Read current browser state from the live store's getState() snapshot.
      // We import lazily to avoid circular issues in tests.
      const { useTabBoardStore } = await import('../../shared/store/useTabBoardStore');
      const browserState = useTabBoardStore.getState();
      // Persisted snapshot has no UI-only fields (hydrated/persistenceError).
      const browserPersisted: TabBoardState = {
        version: browserState.version,
        mutationRevision: browserState.mutationRevision,
        workspaces: browserState.workspaces,
        activeWorkspaceId: browserState.activeWorkspaceId,
        groups: browserState.groups,
        folders: browserState.folders,
        categoryOrderByWorkspace: browserState.categoryOrderByWorkspace,
        bin: browserState.bin,
        dropOperationLedger: browserState.dropOperationLedger,
        settings: browserState.settings,
        createdAt: browserState.createdAt,
        updatedAt: browserState.updatedAt,
      };
      const finalState = migrateToFile(pickedRoot, mode, browserPersisted, fileState);
      await switchToFileMode(pickedRoot, finalState);
      // Notify service worker, then reload to re-hydrate.
      try {
        await chrome.runtime.sendMessage({ type: 'tabboard-storage-switched' });
      } catch {
        // ignore (SW may not be listening in tests)
      }
      setStep('success');
      // Short delay so user sees success state; parent will call location.reload().
      setTimeout(() => {
        reset();
        onComplete();
      }, 300);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  }

  async function handleEmptyConfirm() {
    await performMigration('export-browser');
  }

  async function handleExistingConfirm() {
    await performMigration(migrationMode);
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Choose storage folder"
      centered
      size="md"
    >
      <Stack gap="md">
        {step === 'choose' && (
          <>
            <Text size="sm" c="dimmed">
              Pick a local folder where TabBoard will save your sessions as plain JSON files.
              The folder must be on a local disk and writable.
            </Text>
            <Button
              leftSection={<IconFolder size={16} />}
              onClick={() => void pickFolder()}
            >
              Choose folder
            </Button>
          </>
        )}

        {step === 'inspecting' && (
          <Center py="xl">
            <Stack align="center" gap="sm">
              <Loader />
              <Text size="sm" c="dimmed">Inspecting folder…</Text>
            </Stack>
          </Center>
        )}

        {step === 'empty-confirm' && (
          <>
            <Text size="sm">
              This folder is empty. Export your current browser data into it?
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => void handleEmptyConfirm()}>
                Export & use folder
              </Button>
            </Group>
          </>
        )}

        {step === 'existing-choices' && (
          <>
            <Text size="sm">
              This folder already contains TabBoard data. How should we proceed?
            </Text>
            <Radio.Group
              value={migrationMode}
              onChange={(value) => setMigrationMode(value as MigrationMode)}
            >
              <Stack gap="xs" mt="xs">
                <Radio
                  value="use-file"
                  label="Use this folder's data"
                  description="Replaces your current browser state with what's in the folder."
                />
                <Radio
                  value="export-browser"
                  label="Export current browser data (overwrite folder)"
                  description="Replaces the folder with your current browser data."
                />
                <Radio
                  value="merge"
                  label="Merge both (newer items win)"
                  description="Combines data from both sources; newer items win on conflict."
                />
              </Stack>
            </Radio.Group>
            <Group justify="flex-end" mt="sm">
              <Button variant="default" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => void handleExistingConfirm()}>
                Continue
              </Button>
            </Group>
          </>
        )}

        {step === 'migrating' && (
          <Center py="xl">
            <Stack align="center" gap="sm">
              <Loader />
              <Text size="sm" c="dimmed">Switching storage…</Text>
            </Stack>
          </Center>
        )}

        {step === 'success' && (
          <Alert color="teal" icon={<IconCheck size={16} />}>
            Switched to file storage. Reloading…
          </Alert>
        )}

        {step === 'error' && (
          <>
            <Alert color="red" icon={<IconAlertTriangle size={16} />}>
              {errorMsg || 'An unknown error occurred.'}
            </Alert>
            <Group justify="flex-end">
              <Button variant="default" onClick={handleClose}>Close</Button>
              <Button onClick={() => { reset(); }}>
                Try again
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
