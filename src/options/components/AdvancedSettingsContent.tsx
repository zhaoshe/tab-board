import { useRef, useState } from 'react';
import {
  Button,
  Card,
  Group,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { IconKeyboard, IconRefresh } from '@tabler/icons-react';
import type { Settings } from '../../shared/model';
import { DEFAULT_SETTINGS } from '../../shared/model';
import { ConfirmDialog } from '../../shared/components/ConfirmDialog';
import { DataStorageCard } from './DataStorageCard';

export function AdvancedSettingsContent({
  settings,
  updateSettings,
}: {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;
}) {
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const resetActionRef = useRef<HTMLButtonElement>(null);

  const handleOpenShortcuts = () => {
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  };
  const handleResetSettings = () => {
    updateSettings(DEFAULT_SETTINGS);
    setResetConfirmOpen(false);
  };

  return (
    <>
      <Stack gap="md" mt="md">
        <DataStorageCard />

        <Card withBorder shadow="sm" padding="lg">
          <Stack gap="md">
            <div>
              <Title order={2} size="h5">
                Safety
              </Title>
              <Text size="sm" c="dimmed">
                Confirmation for saved-item deletion
              </Text>
            </div>
            <Switch
              name="confirm-before-destructive"
              label="Confirm before deleting saved items"
              description="Session and saved-item deletion can skip confirmation. Closing browser tabs and permanent deletion always require confirmation."
              checked={settings.confirmBeforeDestructive}
              onChange={(event) => updateSettings({
                confirmBeforeDestructive: event.currentTarget.checked,
              })}
            />
          </Stack>
        </Card>

        <Card withBorder shadow="sm" padding="lg">
          <Stack gap="md">
            <div>
              <Title order={2} size="h5">
                Keyboard & Reset
              </Title>
              <Text size="sm" c="dimmed">
                Chrome shortcuts and settings recovery
              </Text>
            </div>
            <Group className="options-advanced-actions" grow>
              <Button
                variant="default"
                leftSection={<IconKeyboard size={16} aria-hidden="true" />}
                onClick={handleOpenShortcuts}
              >
                Open Keyboard Shortcuts
              </Button>
              <Button
                ref={resetActionRef}
                className="options-action-danger"
                variant="outline"
                color="red"
                leftSection={<IconRefresh size={16} aria-hidden="true" />}
                onClick={() => setResetConfirmOpen(true)}
              >
                Reset to Defaults
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>
      <ConfirmDialog
        opened={resetConfirmOpen}
        title="Reset Settings"
        message="Reset all settings? Saved data stays."
        confirmLabel="Reset Settings"
        finalFocusRef={resetActionRef}
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={handleResetSettings}
      />
    </>
  );
}
