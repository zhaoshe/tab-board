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
  Group,
  Radio,
  SegmentedControl,
  Button,
  Textarea,
  Loader,
} from '@mantine/core';
import {
  AppWindow as IconExternalLink,
  ChevronDown,
  TriangleAlert as IconAlertTriangle,
} from 'lucide-react';
import '@mantine/core/styles.css';
import { theme } from '../shared/styles/theme';
import { usePreferredColorScheme } from '../shared/hooks/usePreferredColorScheme';
import { usePageTheme } from '../shared/hooks/usePageTheme';
import { SettingsSection } from './components/SettingsSection';
import { RestoreSettingsSection } from './components/RestoreSettingsSection';
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
    retryLastFailedMutation,
    saveStatus,
    updateSettings,
  } = useOptionsSettings();
  const colorScheme = usePreferredColorScheme(settings.theme);
  usePageTheme(colorScheme);

  const [advancedOpen, setAdvancedOpen] = useState(
    () => new URLSearchParams(window.location.search).get('advanced') === '1',
  );

  const handleSettingChange = <K extends keyof typeof settings>(
    key: K,
    value: (typeof settings)[K]
  ) => {
    updateSettings({ [key]: value } as Partial<typeof settings>);

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
        <Container className="options-page-container" size="sm">
          <Stack gap={0}>
          <Group className="options-header" justify="space-between" align="flex-start" wrap="nowrap">
            <div className="options-header__title">
              <Title order={1} size="h3">
                <span translate="no">TabBoard</span> Settings
              </Title>
            </div>
            <Group className="options-header__actions" gap="md" wrap="nowrap">
              <Text
                className="options-save-status"
                role="status"
                aria-live="polite"
                aria-atomic="true"
                size="xs"
                c={persistenceError ? 'red' : 'dimmed'}
              >
                {!hydrated
                  ? 'Loading settings…'
                  : saveStatus === 'error' || persistenceError
                    ? 'Could not save'
                    : customFilter.pending || saveStatus === 'saving'
                      ? 'Saving…'
                      : 'Saved'}
              </Text>
              {hydrated && saveStatus === 'error' && (
                <Button
                  className="options-save-retry"
                  size="compact-xs"
                  variant="subtle"
                  onClick={retryLastFailedMutation}
                >
                  Retry
                </Button>
              )}
              <Button
                variant="default"
                leftSection={<IconExternalLink size={16} aria-hidden="true" />}
                onClick={handleOpenManager}
              >
                Open Manager
              </Button>
            </Group>
          </Group>

          <fieldset
            className="options-basic"
            disabled={!hydrated}
            aria-busy={!hydrated}
          >
          <SettingsSection
            title="Toolbar"
            description="Extension button behavior"
          >

              <Radio.Group
                label="When the toolbar button is clicked"
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
                  <Radio value="popup" label="Open Popup" />
                </Group>
              </Radio.Group>
          </SettingsSection>

          <SettingsSection title="Capture" description="Daily save behavior">

              <Stack gap="sm">
                <div className="options-switch-row">
                  <Switch
                    name="close-tabs-after-save"
                    label="Close tabs after saving"
                    description="Close regular source tabs after they are stored; pinned tabs stay open."
                    labelPosition="left"
                    checked={settings.closeTabsAfterSave}
                    onChange={(e) =>
                      handleSettingChange(
                        'closeTabsAfterSave',
                        e.currentTarget.checked
                      )
                    }
                  />
                </div>

                <div className="options-switch-row">
                  <Switch
                    name="open-manager-after-save"
                    label="Open manager after save"
                    description="Show the manager after capturing tabs."
                    labelPosition="left"
                    checked={settings.openManagerAfterSave}
                    onChange={(e) =>
                      handleSettingChange(
                        'openManagerAfterSave',
                        e.currentTarget.checked
                      )
                    }
                  />
                </div>

                <div className="options-switch-row">
                  <Switch
                    name="dedupe-on-save"
                    label="Deduplicate on save"
                    description="Keep one copy of repeated URLs; pinned source tabs stay open."
                    labelPosition="left"
                    checked={settings.dedupeOnSave}
                    onChange={(e) =>
                      handleSettingChange(
                        'dedupeOnSave',
                        e.currentTarget.checked
                      )
                    }
                  />
                </div>

                <Textarea
                  className="options-exclude-setting"
                  label="Exclude URL rules"
                  description="Matching tabs are hidden from Open Tabs and excluded from selection, drag, and save. Separate URL keywords with commas or new lines."
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

          <RestoreSettingsSection
            settings={settings}
            onChange={updateSettings}
          />

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
              <summary>
                <span>Advanced Settings</span>
                <ChevronDown
                  className="options-advanced-chevron"
                  size={16}
                  aria-hidden="true"
                />
              </summary>
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
