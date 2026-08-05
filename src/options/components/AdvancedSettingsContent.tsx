import { useRef, useState } from 'react';
import {
  Button,
  Group,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import {
  Keyboard as IconKeyboard,
  RotateCcw as IconRefresh,
} from 'lucide-react';
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
  const handleResetAction = () => {
    if (!settings.confirmBeforeDestructive) {
      handleResetSettings();
      return;
    }
    setResetConfirmOpen(true);
  };

  return (
    <>
      <Stack className="options-advanced-sections" gap={0}>
        <DataStorageCard />

        <section className="options-advanced-row">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div className="options-advanced-row__copy">
              <Title order={2} size="h5">
                Confirm before dangerous operations
              </Title>
              <Text size="sm" c="dimmed">
                Ask before closing browser tabs, deleting saved data or structure, permanently deleting Trash items, and resetting settings.
              </Text>
            </div>
            <Switch
              name="confirm-before-destructive"
              aria-label="Confirm before dangerous operations"
              checked={settings.confirmBeforeDestructive}
              onChange={(event) => updateSettings({
                confirmBeforeDestructive: event.currentTarget.checked,
              })}
            />
          </Group>
        </section>

        <section className="options-advanced-row">
          <Group justify="space-between" align="center" wrap="nowrap">
            <div className="options-advanced-row__copy">
              <Title order={2} size="h5">Keyboard shortcuts</Title>
              <Text size="sm" c="dimmed">
                Configure Save and Open Manager commands in Chrome.
              </Text>
            </div>
            <Button
              variant="default"
              leftSection={<IconKeyboard size={16} aria-hidden="true" />}
              onClick={handleOpenShortcuts}
            >
              Open Keyboard Shortcuts
            </Button>
          </Group>
        </section>

        <section className="options-advanced-row">
          <Group justify="space-between" align="center" wrap="nowrap">
            <div className="options-advanced-row__copy">
              <Title order={2} size="h5">Reset settings</Title>
              <Text size="sm" c="dimmed">
                Restore defaults. Saved sessions and local folder files remain unchanged.
              </Text>
            </div>
            <Button
              ref={resetActionRef}
              className="options-action-danger"
              variant="outline"
              color="red"
              leftSection={<IconRefresh size={16} aria-hidden="true" />}
              onClick={handleResetAction}
            >
              Reset to Defaults
            </Button>
          </Group>
        </section>
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
