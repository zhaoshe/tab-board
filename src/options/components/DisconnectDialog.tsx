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
import { IconAlertTriangle, IconPlugConnectedX } from '@tabler/icons-react';
import { switchToBrowserMode } from '../../shared/store/activeAdapter';

interface DisconnectDialogProps {
  opened: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type DisconnectStep = 'choose' | 'disconnecting' | 'error';

export function DisconnectDialog({ opened, onClose, onComplete }: DisconnectDialogProps) {
  const [step, setStep] = useState<DisconnectStep>('choose');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copyData, setCopyData] = useState<boolean>(true);

  function reset() {
    setStep('choose');
    setErrorMsg('');
    setCopyData(true);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleConfirm() {
    setStep('disconnecting');
    try {
      await switchToBrowserMode(copyData);
      try {
        await chrome.runtime.sendMessage({ type: 'tabboard-storage-switched' });
      } catch {
        // ignore
      }
      reset();
      onComplete();
    } catch (err) {
      setErrorMsg(`${err instanceof Error ? err.message : String(err)} Keep file storage connected and try again.`);
      setStep('error');
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Stop Using File Storage"
      centered
      size="md"
    >
      <Stack gap="md">
        {step === 'choose' && (
          <>
            <Alert color="yellow" icon={<IconPlugConnectedX size={16} aria-hidden="true" />}>
              This will stop using the file-based storage and switch back to browser storage.
            </Alert>
            <Text size="sm">What should happen to the data in your file folder?</Text>
            <Radio.Group
              label="File data"
              name="file-data-migration"
              value={copyData ? 'copy' : 'keep'}
              onChange={(val) => setCopyData(val === 'copy')}
            >
              <Stack gap="xs" mt="xs">
                <Radio
                  value="copy"
                  label="Copy file data into browser storage first (recommended)"
                  description="Your data remains available in browser storage after the switch."
                />
                <Radio
                  value="keep"
                  label="Keep file as backup; switch to browser storage now"
                  description="Browser storage will start fresh. The file folder stays on disk as backup."
                />
              </Stack>
            </Radio.Group>
            <Group justify="flex-end" mt="sm">
              <Button variant="default" onClick={handleClose}>Cancel</Button>
              <Button color="red" onClick={() => void handleConfirm()}>
                Stop Using File Storage
              </Button>
            </Group>
          </>
        )}

        {step === 'disconnecting' && (
          <Center py="xl" role="status" aria-live="polite">
            <Stack align="center" gap="sm">
              <Loader aria-hidden="true" />
              <Text size="sm" c="dimmed">Switching storage…</Text>
            </Stack>
          </Center>
        )}

        {step === 'error' && (
          <>
            <Alert color="red" icon={<IconAlertTriangle size={16} aria-hidden="true" />}>
              {errorMsg || 'Storage could not be switched. Keep file storage connected and try again.'}
            </Alert>
            <Group justify="flex-end">
              <Button variant="default" onClick={handleClose}>Close</Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
