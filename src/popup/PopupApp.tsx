import { useState, useEffect, useMemo, useRef } from 'react';
import {
  MantineProvider,
  Stack,
  Text,
  Button,
  Group,
  Paper,
  Checkbox,
  Center,
  Loader,
} from '@mantine/core';
import '@mantine/core/styles.css';
import {
  AppWindow as IconLayoutGrid,
  Settings2 as IconSettings,
} from 'lucide-react';
import { theme } from '../shared/styles/theme';
import { isStorableCaptureCandidate } from '../shared/model/capture-policy';
import {
  classifyWindowDuplicates,
  isWindowDedupeUrl,
} from '../shared/model/window-dedupe';
import { useTabBoardStore } from '../shared/store/useTabBoardStore';
import { useStoreHydration } from '../shared/hooks/useStoreHydration';
import { useColorScheme } from '../shared/hooks/useColorScheme';
import { usePageTheme } from '../shared/hooks/usePageTheme';
import { AccessibleIconAction } from '../shared/components/AccessibleIconAction';
import { formatNumber } from '../shared/utils/formatters';
import './popup.css';

interface TabInfo {
  id: number;
  url: string;
  pinned: boolean;
  active: boolean;
  groupId?: number;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

export function popupSaveHelper(closeTabsAfterSave: boolean): string {
  return closeTabsAfterSave
    ? 'Save and close tabs'
    : 'Save and keep tabs open';
}

export function PopupApp() {
  const { hydrated } = useStoreHydration();
  const settings = useTabBoardStore((state) => state.settings);
  const colorScheme = useColorScheme();
  usePageTheme(colorScheme);
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [savingTabs, setSavingTabs] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [includePinned, setIncludePinned] = useState(true);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hydrated) {
      void loadTabs();
    }
  }, [hydrated]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
    }
  }, []);

  const loadTabs = async (): Promise<void> => {
    try {
      const currentTabs = await chrome.tabs.query({ currentWindow: true });
      const tabList: TabInfo[] = currentTabs
        .filter((tab) => tab.id !== undefined && tab.url)
        .map((tab) => ({
          id: tab.id!,
          url: tab.url!,
          pinned: tab.pinned || false,
          active: tab.active || false,
          groupId: tab.groupId,
        }));
      setTabs(tabList);
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(errorMessage(error, 'Unable to load current tabs. Reopen the popup and try again.'));
    }
  };

  const filteredTabs = useMemo(() => {
    if (!hydrated) return tabs;
    const extensionBaseUrl = import.meta.env.DEV
      ? `${window.location.origin}/dev/`
      : chrome.runtime.getURL('');
    return tabs.filter((tab) => isStorableCaptureCandidate(tab, settings, extensionBaseUrl));
  }, [tabs, settings, hydrated]);

  const duplicateClassification = useMemo(() => {
    const extensionBaseUrl = import.meta.env.DEV
      ? `${window.location.origin}/dev/`
      : chrome.runtime.getURL('');
    return classifyWindowDuplicates(
      tabs.filter((tab) => isWindowDedupeUrl(tab.url, extensionBaseUrl)),
    );
  }, [tabs]);
  const duplicateCount = duplicateClassification.removable.length;
  const hasProtectedPinnedDuplicates =
    duplicateClassification.protectedPinnedCount > 0;

  const selectedTabs = useMemo(
    () => filteredTabs.filter((tab) => includePinned || !tab.pinned),
    [filteredTabs, includePinned],
  );

  const handleSave = async () => {
    if (selectedTabs.length === 0) return;
    setSavingTabs(true);
    setSaveError(null);
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'saveSelectedTabs',
        tabIds: selectedTabs.map((tab) => tab.id),
      });
      if (response?.ok !== true) {
        throw new Error(errorMessage(response?.error, 'Unable to save selected tabs. Try again.'));
      }
      setSaved(true);
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
      }
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        window.close();
      }, 800);
    } catch (error: unknown) {
      setSaveError(errorMessage(error, 'Unable to save selected tabs. Try again.'));
    } finally {
      setSavingTabs(false);
    }
  };

  const handleDedupe = async () => {
    setDeduping(true);
    setSaveError(null);
    try {
      const response = await chrome.runtime.sendMessage({ action: 'dedupe-window' });
      if (response?.ok !== true) throw new Error(errorMessage(response?.error, 'Unable to remove duplicate tabs. Try again.'));
      window.close();
    } catch (error: unknown) {
      setSaveError(errorMessage(error, 'Unable to remove duplicate tabs. Try again.'));
      setDeduping(false);
    }
  };

  const openManager = () => {
    chrome.tabs.create({ url: 'manager.html' });
    window.close();
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  if (!hydrated) {
    return (
      <MantineProvider theme={theme} forceColorScheme={colorScheme}>
        <Paper component="main" className="popup-app popup-app--loading">
          <h1 className="visually-hidden"><span translate="no">TabBoard</span></h1>
          <Center className="popup-app__loading" role="status" aria-live="polite">
            <Stack align="center" gap="xs">
              <Loader size="sm" aria-hidden="true" />
              <Text size="sm">Loading current window…</Text>
            </Stack>
          </Center>
        </Paper>
      </MantineProvider>
    );
  }

  const feedbackError = loadError || saveError;
  const pinnedTabCount = filteredTabs.filter((tab) => tab.pinned).length;
  const selectedCount = selectedTabs.length;
  const saveButtonText = savingTabs
    ? 'Saving…'
    : saved
      ? 'Saved'
      : 'Save';
  const saveButtonLabel = savingTabs
    ? 'Saving Selected Tabs…'
    : selectedCount
      ? `Save ${formatNumber(selectedCount)} ${selectedCount === 1 ? 'tab' : 'tabs'} as a session`
      : 'No Tabs Selected to Save';

  return (
    <MantineProvider theme={theme} forceColorScheme={colorScheme}>
      <Paper component="main" className="popup-app">
        <h1 className="visually-hidden"><span translate="no">TabBoard</span></h1>
        <Group className="popup-app__header" justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <img
              className="popup-app__brand-icon"
              src="/icons/icon-32.png"
              alt=""
              width={22}
              height={22}
            />
            <Text fw={700} size="sm"><span translate="no">TabBoard</span></Text>
          </Group>
          <Group gap={4} wrap="nowrap">
            <AccessibleIconAction label="Open Manager" variant="subtle" onClick={openManager}>
              <IconLayoutGrid size={18} aria-hidden="true" />
            </AccessibleIconAction>
            <AccessibleIconAction label="Open Settings" variant="subtle" onClick={openOptions}>
              <IconSettings size={18} aria-hidden="true" />
            </AccessibleIconAction>
          </Group>
        </Group>

        <div className="popup-app__capture">
          <div className="popup-app__save-copy">
            <Text className="popup-app__count">
              {formatNumber(selectedCount)} {selectedCount === 1 ? 'tab' : 'tabs'}
            </Text>
            <Text className="popup-app__save-helper" c="dimmed">
              {popupSaveHelper(settings.closeTabsAfterSave)}
            </Text>
          </div>
          <Button
            className="popup-app__save"
            data-popup-save
            size="sm"
            onClick={handleSave}
            loading={savingTabs}
            disabled={selectedTabs.length === 0}
            variant="default"
            aria-label={saveButtonLabel}
          >
            {saveButtonText}
          </Button>
          <span className="visually-hidden" role="status" aria-live="polite">
            {saved ? 'Tabs saved. Closing popup…' : ''}
          </span>

          {pinnedTabCount > 0 && (
            <div className="popup-app__pinned">
              <Checkbox
                size="16px"
                name="include-pinned-tabs"
                label={`${formatNumber(pinnedTabCount)} pinned`}
                aria-label={`Include ${formatNumber(pinnedTabCount)} pinned ${pinnedTabCount === 1 ? 'tab' : 'tabs'}`}
                checked={includePinned}
                onChange={(event) => setIncludePinned(event.currentTarget.checked)}
              />
              <Text className="popup-app__pinned-helper" c="dimmed">
                {includePinned
                  ? 'Pinned tabs will be saved and stay open after capture.'
                  : 'Pinned tabs will not be saved and will stay open.'}
              </Text>
            </div>
          )}

          {duplicateCount > 0 && (
            <Group className="popup-app__duplicate-row" justify="space-between" wrap="nowrap">
              <div className="popup-app__duplicate-copy">
                <Text className="popup-app__duplicate">
                  {formatNumber(duplicateCount)} duplicate {duplicateCount === 1 ? 'tab' : 'tabs'}
                </Text>
                <Text className="popup-app__duplicate-helper" c="dimmed">
                  {hasProtectedPinnedDuplicates
                    ? 'Pinned duplicates stay open'
                    : 'Keep one copy in this window'}
                </Text>
              </div>
              <Button
                className="popup-app__dedupe"
                variant="default"
                size="compact-sm"
                onClick={handleDedupe}
                loading={deduping}
                disabled={savingTabs || deduping}
                aria-label={deduping ? 'Removing Duplicate Tabs…' : 'Remove Duplicate Tabs from This Window'}
              >
                {deduping ? 'Removing…' : 'Remove'}
              </Button>
            </Group>
          )}
        </div>

        {feedbackError && (
          <Text role="alert" size="xs" c="red" ta="center" px="md" pb="md">
            {feedbackError}
          </Text>
        )}
      </Paper>
    </MantineProvider>
  );
}
