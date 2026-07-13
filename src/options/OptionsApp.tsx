import { useState, useEffect } from 'react';
import {
  MantineProvider,
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
  Notification,
} from '@mantine/core';
import {
  IconSettings,
  IconRefresh,
  IconKeyboard,
  IconExternalLink,
  IconCheck,
} from '@tabler/icons-react';
import '@mantine/core/styles.css';
import { theme } from '../shared/styles/theme';
import { useTabBoardStore } from '../shared/store/useTabBoardStore';
import { useStoreHydration } from '../shared/hooks/useStoreHydration';
import { DEFAULT_SETTINGS } from '../shared/model';

export function OptionsApp() {
  const { hydrated } = useStoreHydration();
  const settings = useTabBoardStore((state) => state.settings);
  const updateSettings = useTabBoardStore((state) => state.updateSettings);
  const groups = useTabBoardStore((state) => state.groups);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const totalTabs = groups.reduce((sum, g) => sum + g.tabs.length, 0);
  const totalGroups = groups.length;

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  const handleSettingChange = <K extends keyof typeof settings>(
    key: K,
    value: (typeof settings)[K]
  ) => {
    updateSettings({ [key]: value } as Partial<typeof settings>);
    showToast('Settings saved');

    if (key === 'actionClick') {
      chrome.runtime
        .sendMessage({ type: 'actionClickChanged', value })
        .catch(() => {});
    }
  };

  const handleResetSettings = () => {
    updateSettings(DEFAULT_SETTINGS);
    showToast('Settings reset to defaults');
  };

  const handleOpenShortcuts = () => {
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  };

  const handleOpenManager = () => {
    void chrome.tabs.create({ url: 'manager.html' });
  };

  useEffect(() => {
    document.title = 'ZipTab - Settings';
  }, []);

  if (!hydrated) {
    return null;
  }

  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <div
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 1000,
        }}
      >
        <Notification
          icon={<IconCheck size={20} />}
          color="teal"
          withBorder
          withCloseButton={false}
          style={{
            opacity: toastVisible ? 1 : 0,
            transform: toastVisible ? 'translateY(0)' : 'translateY(-10px)',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
            pointerEvents: 'none',
          }}
        >
          {toastMessage}
        </Notification>
      </div>

      <Container size="sm" py="xl">
        <Stack gap="xl">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={1} size="h3">
                ZipTab Settings
              </Title>
              <Text c="dimmed" size="sm" mt={4}>
                Configure how ZipTab works
              </Text>
            </div>
            <Button
              variant="light"
              leftSection={<IconExternalLink size={16} />}
              onClick={handleOpenManager}
            >
              Open Manager
            </Button>
          </Group>

          <Group grow>
            <Card withBorder shadow="sm" padding="md">
              <Text size="xl" fw={700}>
                {totalGroups}
              </Text>
              <Text size="sm" c="dimmed">
                Saved groups
              </Text>
            </Card>
            <Card withBorder shadow="sm" padding="md">
              <Text size="xl" fw={700}>
                {totalTabs}
              </Text>
              <Text size="sm" c="dimmed">
                Saved tabs
              </Text>
            </Card>
          </Group>

          <Divider />

          <Card withBorder shadow="sm" padding="lg">
            <Stack gap="md">
              <div>
                <Group gap="xs" mb={2}>
                  <IconSettings size={18} />
                  <Title order={2} size="h5">
                    Toolbar
                  </Title>
                </Group>
                <Text size="sm" c="dimmed">
                  Extension button behavior
                </Text>
              </div>

              <Radio.Group
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
            </Stack>
          </Card>

          <Card withBorder shadow="sm" padding="lg">
            <Stack gap="md">
              <div>
                <Title order={2} size="h5">
                  Capture
                </Title>
                <Text size="sm" c="dimmed">
                  Daily save behavior
                </Text>
              </div>

              <Stack gap="sm">
                <Switch
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
                  label="Deduplicate on save"
                  description="Skip tabs whose URL is already saved somewhere"
                  checked={settings.dedupeOnSave}
                  onChange={(e) =>
                    handleSettingChange(
                      'dedupeOnSave',
                      e.currentTarget.checked
                    )
                  }
                />

                <Divider />

                <Switch
                  label="Exclude pinned tabs"
                  description="Do not include pinned tabs when saving"
                  checked={settings.excludePinned}
                  onChange={(e) =>
                    handleSettingChange(
                      'excludePinned',
                      e.currentTarget.checked
                    )
                  }
                />

                <Switch
                  label="Include chrome:// URLs"
                  description="Save tabs with chrome://, edge://, and other browser internal URLs"
                  checked={settings.includeChromeUrls}
                  onChange={(e) =>
                    handleSettingChange(
                      'includeChromeUrls',
                      e.currentTarget.checked
                    )
                  }
                />

                <Switch
                  label="Include file:// URLs"
                  description="Save tabs with local file:// URLs"
                  checked={settings.includeFileUrls}
                  onChange={(e) =>
                    handleSettingChange(
                      'includeFileUrls',
                      e.currentTarget.checked
                    )
                  }
                />
              </Stack>
            </Stack>
          </Card>

          <Card withBorder shadow="sm" padding="lg">
            <Stack gap="md">
              <div>
                <Title order={2} size="h5">
                  Restore
                </Title>
                <Text size="sm" c="dimmed">
                  How saved tabs return
                </Text>
              </div>

              <Stack gap="sm">
                <Switch
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
            </Stack>
          </Card>

          <Card withBorder shadow="sm" padding="lg">
            <Stack gap="md">
              <div>
                <Title order={2} size="h5">
                  Appearance
                </Title>
                <Text size="sm" c="dimmed">
                  Theme preference
                </Text>
              </div>

              <SegmentedControl
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
            </Stack>
          </Card>

          <Divider />

          <Card withBorder shadow="sm" padding="lg">
            <Stack gap="md">
              <div>
                <Title order={2} size="h5">
                  Keyboard & Advanced
                </Title>
                <Text size="sm" c="dimmed">
                  Shortcuts and reset options
                </Text>
              </div>

              <Group grow>
                <Button
                  variant="light"
                  leftSection={<IconKeyboard size={16} />}
                  onClick={handleOpenShortcuts}
                >
                  Open keyboard shortcuts
                </Button>
                <Button
                  variant="light"
                  color="red"
                  leftSection={<IconRefresh size={16} />}
                  onClick={handleResetSettings}
                >
                  Reset to defaults
                </Button>
              </Group>
            </Stack>
          </Card>
        </Stack>
      </Container>
    </MantineProvider>
  );
}
