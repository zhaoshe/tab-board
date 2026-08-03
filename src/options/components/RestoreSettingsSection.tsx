import {
  Group,
  Radio,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import type { Settings } from '../../shared/model';
import { SettingsSection } from './SettingsSection';

export function RestoreSettingsSection({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (updates: Partial<Settings>) => void;
}) {
  const newWindow = settings.restoreGroupsInNewWindow;

  return (
    <SettingsSection title="Restore" description="How saved tabs return">
      <Stack gap="md">
        <div className="options-switch-row">
          <Switch
            name="delete-restored-tabs"
            label="Delete saved tabs after restore"
            description="Remove restored items from the session."
            labelPosition="left"
            checked={settings.deleteRestoredTabs}
            onChange={(event) => onChange({
              deleteRestoredTabs: event.currentTarget.checked,
            })}
          />
        </div>

        <Radio.Group
          className="options-radio-setting"
          label="Destination"
          name="restore-destination"
          value={newWindow ? 'new' : 'current'}
          onChange={(value) => onChange({
            restoreGroupsInNewWindow: value === 'new',
          })}
        >
          <Group gap="xl" mt="xs">
            <Radio
              value="current"
              label="Current window"
            />
            <Radio
              value="new"
              label="New window"
            />
          </Group>
        </Radio.Group>

        <Radio.Group
          className="options-radio-setting"
          label="Placement"
          name="restore-placement"
          value={settings.restoreNextToCurrent ? 'next' : 'end'}
          onChange={(value) => onChange({
            restoreNextToCurrent: value === 'next',
          })}
        >
          <Group gap="xl" mt="xs">
            <Radio
              value="next"
              label="Next to current tab"
              disabled={newWindow}
            />
            <Radio
              value="end"
              label="End of window"
              disabled={newWindow}
            />
          </Group>
        </Radio.Group>
        {newWindow && (
          <Text size="xs" c="dimmed">
            Placement applies only when restoring into the current window.
          </Text>
        )}

        <div className="options-switch-row">
          <Switch
            name="focus-restored-tabs"
            label="Focus restored tabs"
            description="Bring focus to the first newly opened tab."
            labelPosition="left"
            checked={settings.focusRestoredTabs}
            onChange={(event) => onChange({
              focusRestoredTabs: event.currentTarget.checked,
            })}
          />
        </div>
      </Stack>
    </SettingsSection>
  );
}
