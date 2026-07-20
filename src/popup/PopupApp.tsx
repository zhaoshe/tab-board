import { useState, useEffect, useMemo, useRef } from 'react';
import {
  MantineProvider,
  Stack,
  Text,
  Button,
  Group,
  ActionIcon,
  Tooltip,
  Paper,
  Checkbox,
} from '@mantine/core';
import '@mantine/core/styles.css';
import {
  IconArchive,
  IconCheck,
  IconBrandChrome,
  IconCopy,
  IconLayoutGrid,
  IconSettings,
} from '@tabler/icons-react';
import { theme } from '../shared/styles/theme';
import { isStorableCaptureCandidate } from '../shared/model/capture-policy';
import { useTabBoardStore } from '../shared/store/useTabBoardStore';
import { useStoreHydration } from '../shared/hooks/useStoreHydration';
import { useColorScheme } from '../shared/hooks/useColorScheme';
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

export function PopupApp() {
  const { hydrated } = useStoreHydration();
  const settings = useTabBoardStore((state) => state.settings);
  const colorScheme = useColorScheme();
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [includePinned, setIncludePinned] = useState(true);
  const [includeGroups, setIncludeGroups] = useState(true);
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
      setLoadError(errorMessage(error, 'Unable to load current tabs.'));
    }
  };

  const filteredTabs = useMemo(() => {
    if (!hydrated) return tabs;
    const extensionBaseUrl = import.meta.env.DEV
      ? `${window.location.origin}/dev/`
      : chrome.runtime.getURL('');
    return tabs.filter((tab) => isStorableCaptureCandidate(tab, settings, extensionBaseUrl));
  }, [tabs, settings, hydrated]);

  const duplicateCount = useMemo(() => {
    const urlMap = new Map<string, number>();
    filteredTabs.forEach((tab) => {
      urlMap.set(tab.url, (urlMap.get(tab.url) || 0) + 1);
    });
    let count = 0;
    urlMap.forEach((c) => {
      if (c > 1) count += c - 1;
    });
    return count;
  }, [filteredTabs]);

  const groupedTabCount = useMemo(
    () => filteredTabs.filter((tab) => typeof tab.groupId === 'number' && tab.groupId >= 0).length,
    [filteredTabs],
  );

  const groupCount = useMemo(
    () => new Set(filteredTabs.flatMap((tab) => typeof tab.groupId === 'number' && tab.groupId >= 0 ? [tab.groupId] : [])).size,
    [filteredTabs],
  );

  const selectedTabs = useMemo(
    () => filteredTabs.filter((tab) => (includePinned || !tab.pinned)
      && (includeGroups || typeof tab.groupId !== 'number' || tab.groupId < 0)),
    [filteredTabs, includeGroups, includePinned],
  );

  const handleSave = async () => {
    if (selectedTabs.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'saveSelectedTabs',
        tabIds: selectedTabs.map((tab) => tab.id),
      });
      if (response?.ok !== true) {
        throw new Error(errorMessage(response?.error, 'Unable to save selected tabs.'));
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
      setSaveError(errorMessage(error, 'Unable to save selected tabs.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDedupe = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await chrome.runtime.sendMessage({ action: 'dedupe-window' });
      if (response?.ok !== true) throw new Error(errorMessage(response?.error, 'Unable to remove duplicate tabs.'));
      window.close();
    } catch (error: unknown) {
      setSaveError(errorMessage(error, 'Unable to remove duplicate tabs.'));
      setSaving(false);
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
    return null;
  }

  const feedbackError = loadError || saveError;
  const pinnedTabCount = filteredTabs.filter((tab) => tab.pinned).length;
  const hasCaptureOptions = pinnedTabCount > 0 || groupedTabCount > 0;

  return (
    <MantineProvider theme={theme} forceColorScheme={colorScheme}>
      <Paper className="popup-app">
        <Group className="popup-app__header">
          <Group gap="xs">
            <IconBrandChrome size={18} style={{ color: 'var(--mantine-color-blue-6)' }} />
            <Text fw={700} size="sm">TabBoard</Text>
          </Group>
        </Group>

        <div className="popup-app__capture">
          <Text className="popup-app__count" fw={700} size="md">
            {filteredTabs.length} {filteredTabs.length === 1 ? 'Tab' : 'Tabs'}
          </Text>
          <Button
            className="popup-app__save"
            fullWidth
            leftSection={saved ? <IconCheck size={14} /> : <IconArchive size={14} />}
            size="sm"
            onClick={handleSave}
            loading={saving}
            disabled={selectedTabs.length === 0}
            color={saved ? 'green' : 'blue'}
            aria-label="Save selected tabs as a session"
          >
            {saved ? 'Saved' : selectedTabs.length ? 'Save' : 'No tabs'}
          </Button>

          {filteredTabs.length === 0 ? (
            <Text className="popup-app__empty" size="xs" c="dimmed">No savable tabs in this window.</Text>
          ) : hasCaptureOptions && (
            <Group className="popup-app__filters" gap="sm">
              {pinnedTabCount > 0 && (
                <Checkbox
                  size="sm"
                  label={`${pinnedTabCount} pinned`}
                  checked={includePinned}
                  onChange={(event) => setIncludePinned(event.currentTarget.checked)}
                />
              )}
              {groupedTabCount > 0 && (
                <Checkbox
                  size="sm"
                  label={`${groupCount} group${groupCount === 1 ? '' : 's'}`}
                  checked={includeGroups}
                  onChange={(event) => setIncludeGroups(event.currentTarget.checked)}
                />
              )}
            </Group>
          )}

          {duplicateCount > 0 && (
            <>
              <div className="popup-app__separator" />
              <Text className="popup-app__duplicate popup-app__stat" fw={700} size="md" c="orange.4">
                {duplicateCount} Duplicate{duplicateCount === 1 ? '' : 's'}
              </Text>
              <Button
                className="popup-app__dedupe"
                fullWidth
                variant="light"
                color="orange"
                size="sm"
                leftSection={<IconCopy size={14} />}
                onClick={handleDedupe}
                loading={saving}
                aria-label="Remove duplicate tabs from this window"
              >
                Dedupe
              </Button>
            </>
          )}
        </div>

        <Group className="popup-app__footer" justify="flex-end" gap={4}>
          <Tooltip label="Open manager">
            <ActionIcon variant="subtle" aria-label="Open manager" onClick={openManager}>
              <IconLayoutGrid size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Open settings">
            <ActionIcon variant="subtle" aria-label="Open settings" onClick={openOptions}>
              <IconSettings size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>

        {feedbackError && (
          <Text role="alert" size="xs" c="red" ta="center" px="md" pb="md">
            {feedbackError}
          </Text>
        )}
      </Paper>
    </MantineProvider>
  );
}
