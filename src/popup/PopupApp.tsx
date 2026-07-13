import { useState, useEffect, useMemo } from 'react';
import {
  MantineProvider,
  Stack,
  Text,
  Button,
  Group,
  ActionIcon,
  Tooltip,
  Checkbox,
  ScrollArea,
  Divider,
  Badge,
  Box,
  Paper,
  Center,
} from '@mantine/core';
import '@mantine/core/styles.css';
import {
  IconLayoutGrid,
  IconSettings,
  IconArchive,
  IconCheck,
  IconBrandChrome,
  IconPin,
  IconCopy,
  IconAlertCircle,
} from '@tabler/icons-react';
import { theme } from '../shared/styles/theme';
import { useTabBoardStore } from '../shared/store/useTabBoardStore';
import { useStoreHydration } from '../shared/hooks/useStoreHydration';

interface TabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl: string;
  pinned: boolean;
  active: boolean;
  windowId: number;
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return url;
  }
}

function isChromeUrl(url: string): boolean {
  return /^(chrome|edge|brave|vivaldi|opera|about):/i.test(url);
}

function isFileUrl(url: string): boolean {
  return /^file:/i.test(url);
}

export function PopupApp() {
  const { hydrated } = useStoreHydration();
  const settings = useTabBoardStore((state) => state.settings);
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [selectedTabIds, setSelectedTabIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (hydrated) {
      void loadTabs();
    }
  }, [hydrated]);

  const loadTabs = async () => {
    const currentTabs = await chrome.tabs.query({ currentWindow: true });
    const tabList: TabInfo[] = currentTabs
      .filter((tab) => tab.id !== undefined && tab.url)
      .map((tab) => ({
        id: tab.id!,
        title: tab.title || tab.url || '',
        url: tab.url!,
        favIconUrl: tab.favIconUrl || '',
        pinned: tab.pinned || false,
        active: tab.active || false,
        windowId: tab.windowId,
      }));
    setTabs(tabList);
    setSelectedTabIds(new Set(tabList.map((t) => t.id)));
  };

  const filteredTabs = useMemo(() => {
    if (!hydrated) return tabs;
    return tabs.filter((tab) => {
      if (settings.excludePinned && tab.pinned) return false;
      if (!settings.includeChromeUrls && isChromeUrl(tab.url)) return false;
      if (!settings.includeFileUrls && isFileUrl(tab.url)) return false;
      return true;
    });
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

  const allSelected =
    filteredTabs.length > 0 &&
    selectedTabIds.size === filteredTabs.length;
  const someSelected =
    selectedTabIds.size > 0 && selectedTabIds.size < filteredTabs.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedTabIds(new Set());
    } else {
      setSelectedTabIds(new Set(filteredTabs.map((t) => t.id)));
    }
  };

  const toggleTab = (tabId: number) => {
    const next = new Set(selectedTabIds);
    if (next.has(tabId)) {
      next.delete(tabId);
    } else {
      next.add(tabId);
    }
    setSelectedTabIds(next);
  };

  const selectExceptPinned = () => {
    const exceptPinned = filteredTabs.filter((t) => !t.pinned);
    setSelectedTabIds(new Set(exceptPinned.map((t) => t.id)));
  };

  const selectActiveOnly = () => {
    const active = filteredTabs.find((t) => t.active);
    if (active) {
      setSelectedTabIds(new Set([active.id]));
    }
  };

  const selectDeduped = () => {
    const seen = new Set<string>();
    const dedupedIds: number[] = [];
    filteredTabs.forEach((tab) => {
      if (!seen.has(tab.url)) {
        seen.add(tab.url);
        dedupedIds.push(tab.id);
      }
    });
    setSelectedTabIds(new Set(dedupedIds));
  };

  const handleSave = async () => {
    if (selectedTabIds.size === 0) return;
    setSaving(true);
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'saveSelectedTabs',
        tabIds: Array.from(selectedTabIds),
      });
      if (response?.success) {
        setSaved(true);
        setTimeout(() => {
          window.close();
        }, 800);
      }
    } catch (e) {
      console.error('Save failed:', e);
    } finally {
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

  const selectedFilteredCount = Array.from(selectedTabIds).filter((id) =>
    filteredTabs.some((t) => t.id === id)
  ).length;

  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Stack gap={0} style={{ width: 380, minHeight: 450 }}>
        <Group justify="space-between" px="md" py="sm">
          <Group gap="xs">
            <IconBrandChrome size={20} style={{ color: 'var(--mantine-color-blue-6)' }} />
            <Text fw={700} size="md">TabBoard</Text>
          </Group>
          <Group gap={4}>
            <Tooltip label="Open manager">
              <ActionIcon variant="subtle" onClick={openManager}>
                <IconLayoutGrid size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Settings">
              <ActionIcon variant="subtle" onClick={openOptions}>
                <IconSettings size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Divider />

        <Group justify="space-between" px="md" py="xs">
          <Checkbox
            size="xs"
            checked={allSelected}
            indeterminate={someSelected}
            onChange={toggleAll}
            label={
              <Text size="xs" fw={500}>
                {selectedFilteredCount} of {filteredTabs.length} tabs
              </Text>
            }
          />
          <Badge size="sm" variant="light">
            {filteredTabs.length} tabs
          </Badge>
        </Group>

        <Divider />

        <Box px="md" py="xs">
          <Group gap="xs" grow>
            <Button
              variant="light"
              size="xs"
              leftSection={<IconPin size={14} />}
              onClick={selectExceptPinned}
            >
              Except pinned
            </Button>
            <Button
              variant="light"
              size="xs"
              leftSection={<IconCheck size={14} />}
              onClick={selectActiveOnly}
            >
              Active only
            </Button>
            <Button
              variant="light"
              size="xs"
              leftSection={<IconCopy size={14} />}
              onClick={selectDeduped}
              disabled={duplicateCount === 0}
            >
              Deduped
            </Button>
          </Group>
        </Box>

        {duplicateCount > 0 && (
          <>
            <Divider />
            <Paper withBorder p="xs" mx="md" my="xs" bg="var(--mantine-color-yellow-0)">
              <Group gap="xs" justify="space-between">
                <Group gap="xs">
                  <IconAlertCircle size={14} color="var(--mantine-color-yellow-7)" />
                  <Text size="xs" c="yellow.8">
                    {duplicateCount} duplicate{duplicateCount > 1 ? 's' : ''} found
                  </Text>
                </Group>
                <Button
                  variant="subtle"
                  size="xs"
                  color="yellow"
                  onClick={selectDeduped}
                >
                  Keep first
                </Button>
              </Group>
            </Paper>
          </>
        )}

        <Divider />

        <Box style={{ flex: 1 }}>
          <ScrollArea h={240} scrollbarSize={4}>
            {filteredTabs.length === 0 ? (
              <Center py="xl">
                <Stack gap="xs" align="center">
                  <IconAlertCircle size={32} color="var(--mantine-color-gray-4)" />
                  <Text size="sm" c="dimmed" ta="center">
                    No tabs available
                  </Text>
                  <Text size="xs" c="dimmed" ta="center">
                    All tabs are filtered out by your settings
                  </Text>
                </Stack>
              </Center>
            ) : (
              <Stack gap={2} py="xs">
                {filteredTabs.map((tab) => (
                  <Group
                    key={tab.id}
                    gap="xs"
                    wrap="nowrap"
                    px="sm"
                    py="xs"
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleTab(tab.id)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        'var(--mantine-color-gray-0)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <Checkbox
                      size="xs"
                      checked={selectedTabIds.has(tab.id)}
                      onChange={() => toggleTab(tab.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    {tab.favIconUrl ? (
                      <img
                        src={tab.favIconUrl}
                        alt=""
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 2,
                          flexShrink: 0,
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Box
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 2,
                          backgroundColor: 'var(--mantine-color-gray-2)',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        size="xs"
                        lineClamp={1}
                        fw={tab.active ? 600 : 400}
                        title={tab.title}
                      >
                        {tab.title}
                      </Text>
                      <Text size="xs" c="dimmed" lineClamp={1} title={tab.url}>
                        {extractDomain(tab.url)}
                      </Text>
                    </Stack>
                    {tab.pinned && (
                      <Tooltip label="Pinned">
                        <IconPin size={12} color="var(--mantine-color-gray-5)" />
                      </Tooltip>
                    )}
                    {tab.active && (
                      <Badge size="xs" variant="dot" color="blue">
                        Active
                      </Badge>
                    )}
                  </Group>
                ))}
              </Stack>
            )}
          </ScrollArea>
        </Box>

        <Divider />

        <Stack gap="xs" p="md">
          <Button
            leftSection={saved ? <IconCheck size={16} /> : <IconArchive size={16} />}
            fullWidth
            size="md"
            onClick={handleSave}
            loading={saving}
            disabled={selectedTabIds.size === 0}
            color={saved ? 'green' : 'blue'}
          >
            {saved ? 'Saved!' : `Save ${selectedTabIds.size} selected tabs`}
          </Button>
        </Stack>
      </Stack>
    </MantineProvider>
  );
}
