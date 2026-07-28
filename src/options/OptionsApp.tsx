import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import {
  Alert,
  MantineProvider,
  Center,
  Container,
  Title,
  Stack,
  Switch,
  Text,
  Divider,
  Group,
  Radio,
  SegmentedControl,
  Button,
  Textarea,
  Loader,
} from '@mantine/core';
import {
  IconSettings,
  IconExternalLink,
  IconAlertTriangle,
} from '@tabler/icons-react';
import '@mantine/core/styles.css';
import { theme } from '../shared/styles/theme';
import { usePreferredColorScheme } from '../shared/hooks/usePreferredColorScheme';
import { usePageTheme } from '../shared/hooks/usePageTheme';
import { SettingsSection } from './components/SettingsSection';
import { useSettingsDraft } from './hooks/useSettingsDraft';
import { useOptionsSettings } from './hooks/useOptionsSettings';
import './options.css';

const AdvancedSettingsContent = lazy(async () => ({
  default: (await import('./components/AdvancedSettingsContent'))
    .AdvancedSettingsContent,
}));

class AdvancedSettingsErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {}

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Alert
        mt="md"
        color="red"
        icon={<IconAlertTriangle size={16} aria-hidden="true" />}
      >
        Advanced Settings could not load.
        <Button ml="sm" size="xs" variant="light" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </Alert>
    );
  }
}

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

  const customFilter = useSettingsDraft({
    value: settings.customUrlFilter,
    onCommit: (value) => {
      updateSettings({ customUrlFilter: value });
    },
    onPendingChange: setSavePending,
  });

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
                {!hydrated
                  ? 'Loading settings…'
                  : persistenceError
                    ? 'Could not save'
                    : savePending
                      ? 'Saving…'
                      : 'Saved'}
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

          <fieldset
            className="options-basic"
            disabled={!hydrated}
            aria-busy={!hydrated}
          >
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
          </fieldset>

          {hydrated ? (
            <details
              className="options-advanced"
              open={advancedOpen}
              onToggle={(event) => handleAdvancedToggle(event.currentTarget.open)}
            >
              <summary>Advanced Settings</summary>
              {advancedOpen ? (
                <AdvancedSettingsErrorBoundary>
                  <Suspense
                    fallback={(
                      <Center mt="md" role="status" aria-live="polite">
                        <Loader size="sm" />
                        <Text size="sm" ml="xs">Loading Advanced Settings…</Text>
                      </Center>
                    )}
                  >
                    <AdvancedSettingsContent
                      settings={settings}
                      updateSettings={updateSettings}
                    />
                  </Suspense>
                </AdvancedSettingsErrorBoundary>
              ) : null}
            </details>
          ) : null}
          </Stack>
        </Container>
      </main>
    </MantineProvider>
  );
}
