import { useState, useEffect, useRef } from 'react';
import {
  MantineProvider,
  Center,
  Container,
  Title,
  Stack,
  Switch,
  Text,
  Divider,
  Group,
  Card,
  Radio,
  SegmentedControl,
  Button,
  Textarea,
  Loader,
} from '@mantine/core';
import {
  IconSettings,
  IconRefresh,
  IconKeyboard,
  IconExternalLink,
} from '@tabler/icons-react';
import '@mantine/core/styles.css';
import { theme } from '../shared/styles/theme';
import { usePreferredColorScheme } from '../shared/hooks/usePreferredColorScheme';
import { usePageTheme } from '../shared/hooks/usePageTheme';
import { DEFAULT_SETTINGS } from '../shared/model';
import { DataStorageCard } from './components/DataStorageCard';
import { SettingsSection } from './components/SettingsSection';
import { useSettingsDraft } from './hooks/useSettingsDraft';
import { useOptionsSettings } from './hooks/useOptionsSettings';
import { ConfirmDialog } from '../shared/components/ConfirmDialog';
import './options.css';

export function OptionsApp() {
  const {
    hydrated,
    settings,
    persistenceError,
    updateSettings,
  } = useOptionsSettings();
  const colorScheme = usePreferredColorScheme(settings.theme);
  usePageTheme(colorScheme);

  const [savePending, setSavePending] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const resetActionRef = useRef<HTMLButtonElement>(null);
  const [advancedOpen, setAdvancedOpen] = useState(
    () => new URLSearchParams(window.location.search).get('advanced') === '1',
  );

  const handleSettingChange = <K extends keyof typeof settings>(
    key: K,
    value: (typeof settings)[K]
  ) => {
    setSavePending(true);
    updateSettings({ [key]: value } as Partial<typeof settings>);
    setSavePending(false);

    if (key === 'actionClick') {
      chrome.runtime
        .sendMessage({ type: 'actionClickChanged', value })
        .catch(() => {});
    }
  };

  const handleResetSettings = () => {
    setSavePending(true);
    updateSettings(DEFAULT_SETTINGS);
    setSavePending(false);
    setResetConfirmOpen(false);
  };

  const customFilter = useSettingsDraft({
    value: settings.customUrlFilter,
    onCommit: (value) => {
      updateSettings({ customUrlFilter: value });
    },
    onPendingChange: setSavePending,
  });

  const handleOpenShortcuts = () => {
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  };

  const handleOpenManager = () => {
    void chrome.tabs.create({ url: 'manager.html' });
  };

  useEffect(() => {
    document.title = 'TabBoard - Settings';
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setAdvancedOpen(
        new URLSearchParams(window.location.search).get('advanced') === '1',
      );
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleAdvancedToggle = (open: boolean) => {
    setAdvancedOpen(open);
    const params = new URLSearchParams(window.location.search);
    if (open) params.set('advanced', '1');
    else params.delete('advanced');
    const search = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
    );
  };

  if (!hydrated) {
    return (
      <MantineProvider theme={theme} forceColorScheme={colorScheme}>
        <main>
          <Center mih="100vh" role="status" aria-live="polite">
            <Stack align="center" gap="xs">
              <Loader size="sm" />
              <Text size="sm">Loading settings…</Text>
            </Stack>
          </Center>
        </main>
      </MantineProvider>
    );
  }

  return (
    <MantineProvider theme={theme} forceColorScheme={colorScheme}>
      <main>
        <Container size="sm" py="xl">
          <Stack gap="xl">
          <Group className="options-header" justify="space-between" align="flex-start">
            <div className="options-header__title">
              <Title order={1} size="h3">
                <span translate="no">TabBoard</span> Settings
              </Title>
              <Text c="dimmed" size="sm" mt={4}>
                Configure how <span translate="no">TabBoard</span> works
              </Text>
              <Text
                className="options-save-status"
                role="status"
                aria-live="polite"
                aria-atomic="true"
                size="xs"
                c={persistenceError ? 'red' : 'dimmed'}
                mt={4}
              >
                {persistenceError ? 'Could not save' : savePending ? 'Saving…' : 'Saved'}
              </Text>
            </div>
            <Button
              variant="default"
              leftSection={<IconExternalLink size={16} aria-hidden="true" />}
              onClick={handleOpenManager}
            >
              Open Manager
            </Button>
          </Group>

          <div className="options-basic">
          <SettingsSection
            title="Toolbar"
            description="Extension button behavior"
            icon={<IconSettings size={18} aria-hidden="true" />}
          >

              <Radio.Group
                label="Extension button behavior"
                value={settings.actionClick}
                onChange={(value) =>
                  handleSettingChange(
                    'actionClick',
                    value as 'store' | 'popup'
                  )
                }
                name="actionClick"
              >
                <Group mt="xs">
                  <Radio value="store" label="Save current window" />
                  <Radio value="popup" label="Open popup" />
                </Group>
              </Radio.Group>
          </SettingsSection>

          <SettingsSection title="Capture" description="Daily save behavior">

              <Stack gap="sm">
                <Switch
                  name="close-tabs-after-save"
                  label="Close tabs after saving"
                  description="Tabs are closed once they are stored in a session"
                  checked={settings.closeTabsAfterSave}
                  onChange={(e) =>
                    handleSettingChange(
                      'closeTabsAfterSave',
                      e.currentTarget.checked
                    )
                  }
                />

                <Switch
                  name="open-manager-after-save"
                  label="Open manager after save"
                  description="Show the manager page after saving tabs"
                  checked={settings.openManagerAfterSave}
                  onChange={(e) =>
                    handleSettingChange(
                      'openManagerAfterSave',
                      e.currentTarget.checked
                    )
                  }
                />

                <Switch
                  name="dedupe-on-save"
                  label="Deduplicate on save"
                  description="Remove duplicate URLs within the tabs being saved. Keep one copy in the new session and close duplicate source tabs."
                  checked={settings.dedupeOnSave}
                  onChange={(e) =>
                    handleSettingChange(
                      'dedupeOnSave',
                      e.currentTarget.checked
                    )
                  }
                />

                <Divider />

                <Textarea
                  label="Custom filter rules"
                  description="Hide matching open tabs. Separate URL keywords with commas or new lines."
                  placeholder="example.com, chrome://newtab…"
                  name="custom-url-filter"
                  autoComplete="off"
                  spellCheck={false}
                  autosize
                  minRows={2}
                  value={customFilter.draft}
                  onChange={(event) => customFilter.setDraft(event.currentTarget.value)}
                  onBlur={customFilter.flush}
                />
              </Stack>
          </SettingsSection>

          <SettingsSection title="Restore" description="How saved tabs return">

              <Stack gap="sm">
                <Switch
                  name="delete-restored-tabs"
                  label="Delete saved tabs after restore"
                  description="Remove tabs from the session when restored"
                  checked={settings.deleteRestoredTabs}
                  onChange={(e) =>
                    handleSettingChange(
                      'deleteRestoredTabs',
                      e.currentTarget.checked
                    )
                  }
                />

                <Switch
                  name="restore-groups-in-new-window"
                  label="Restore groups in new window"
                  description="Open entire tab groups in a new window"
                  checked={settings.restoreGroupsInNewWindow}
                  onChange={(e) =>
                    handleSettingChange(
                      'restoreGroupsInNewWindow',
                      e.currentTarget.checked
                    )
                  }
                />

                <Switch
                  name="restore-next-to-current"
                  label="Restore next to current tab"
                  description="Open restored tabs next to the currently active tab"
                  checked={settings.restoreNextToCurrent}
                  onChange={(e) =>
                    handleSettingChange(
                      'restoreNextToCurrent',
                      e.currentTarget.checked
                    )
                  }
                />

                <Switch
                  name="focus-restored-tabs"
                  label="Focus restored tabs"
                  description="Bring focus to newly opened tabs"
                  checked={settings.focusRestoredTabs}
                  onChange={(e) =>
                    handleSettingChange(
                      'focusRestoredTabs',
                      e.currentTarget.checked
                    )
                  }
                />
              </Stack>
          </SettingsSection>

          <SettingsSection title="Appearance" description="Theme preference">

              <SegmentedControl
                className="options-theme-control"
                aria-label="Theme preference"
                name="theme"
                value={settings.theme}
                onChange={(value) =>
                  handleSettingChange(
                    'theme',
                    value as 'system' | 'light' | 'dark'
                  )
                }
                data={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
                w="100%"
                size="sm"
              />
          </SettingsSection>
          </div>

          <details
            className="options-advanced"
            open={advancedOpen}
            onToggle={(event) => handleAdvancedToggle(event.currentTarget.open)}
          >
            <summary>Advanced Settings</summary>
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
                    onChange={(e) =>
                      handleSettingChange(
                        'confirmBeforeDestructive',
                        e.currentTarget.checked
                      )
                    }
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
          </details>
          </Stack>
        </Container>
      </main>
      <ConfirmDialog
        opened={resetConfirmOpen}
        title="Reset Settings"
        message="Reset all settings? Saved data stays."
        confirmLabel="Reset Settings"
        finalFocusRef={resetActionRef}
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={handleResetSettings}
      />
    </MantineProvider>
  );
}
