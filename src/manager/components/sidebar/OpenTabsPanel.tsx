import { useState, useEffect, useCallback } from 'react';
import {
  Stack,
  Group as MantineGroup,
  Text,
  ActionIcon,
  Tooltip,
  ScrollArea,
  Collapse,
  Checkbox,
  Button,
  Badge,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconBrowser,
  IconDeviceFloppy,
} from '@tabler/icons-react';

interface OpenTabInfo {
  id: number | undefined;
  windowId: number | undefined;
  title: string;
  url: string;
  favIconUrl: string;
  active: boolean;
  pinned: boolean;
  index: number;
}

interface OpenWindowInfo {
  id: number | undefined;
  focused: boolean;
  incognito: boolean;
  tabCount: number;
  tabs: OpenTabInfo[];
}

export function OpenTabsPanel() {
  const [windows, setWindows] = useState<OpenWindowInfo[]>([]);
  const [expandedWindows, setExpandedWindows] = useState<Set<number>>(new Set());
  const [selectedTabIds, setSelectedTabIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  const fetchOpenTabs = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'list-open-tabs' });
      if (response?.ok && response.result?.windows) {
        setWindows(response.result.windows);
        setExpandedWindows((prev) => {
          const next = new Set(prev);
          response.result.windows.forEach((w: OpenWindowInfo) => {
            if (w.focused && w.id !== undefined) {
              next.add(w.id);
            }
          });
          return next;
        });
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchOpenTabs();

    const handleCreated = () => {
      void fetchOpenTabs();
    };
    const handleRemoved = () => {
      void fetchOpenTabs();
    };
    const handleUpdated = () => {
      void fetchOpenTabs();
    };

    chrome.tabs.onCreated.addListener(handleCreated);
    chrome.tabs.onRemoved.addListener(handleRemoved);
    chrome.tabs.onUpdated.addListener(handleUpdated);
    chrome.windows.onFocusChanged.addListener(handleCreated);

    return () => {
      chrome.tabs.onCreated.removeListener(handleCreated);
      chrome.tabs.onRemoved.removeListener(handleRemoved);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      chrome.windows.onFocusChanged.removeListener(handleCreated);
    };
  }, [fetchOpenTabs]);

  const toggleWindow = (windowId: number) => {
    setExpandedWindows((prev) => {
      const next = new Set(prev);
      if (next.has(windowId)) {
        next.delete(windowId);
      } else {
        next.add(windowId);
      }
      return next;
    });
  };

  const handleTabClick = (tabId: number | undefined, windowId: number | undefined) => {
    if (tabId === undefined) return;
    void chrome.tabs.update(tabId, { active: true });
    if (windowId !== undefined) {
      void chrome.windows.update(windowId, { focused: true });
    }
  };

  const toggleTabSelection = (tabId: number | undefined) => {
    if (tabId === undefined) return;
    setSelectedTabIds((prev) => {
      const next = new Set(prev);
      if (next.has(tabId)) {
        next.delete(tabId);
      } else {
        next.add(tabId);
      }
      return next;
    });
  };

  const handleSaveSelected = async () => {
    if (selectedTabIds.size === 0) return;
    setLoading(true);
    try {
      await chrome.runtime.sendMessage({
        type: 'saveSelectedTabs',
        tabIds: Array.from(selectedTabIds),
      });
      setSelectedTabIds(new Set());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const totalTabs = windows.reduce((sum, w) => sum + w.tabCount, 0);
  const selectedCount = selectedTabIds.size;

  return (
    <Stack gap={0} h="100%">
      <MantineGroup justify="space-between" px="xs" py="xs">
        <MantineGroup gap="xs">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            Open tabs
          </Text>
          <Badge size="sm" variant="light">
            {totalTabs}
          </Badge>
        </MantineGroup>
        {selectedCount > 0 && (
          <Tooltip label={`Save ${selectedCount} selected tab${selectedCount > 1 ? 's' : ''}`}>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconDeviceFloppy size={12} />}
              onClick={handleSaveSelected}
              loading={loading}
            >
              Save selected
            </Button>
          </Tooltip>
        )}
      </MantineGroup>

      <ScrollArea style={{ flex: 1 }} type="scroll" scrollbarSize={4}>
        <Stack gap={2} pb="xs">
          {windows.map((window, windowIndex) => (
            <div key={window.id ?? windowIndex}>
              <MantineGroup
                gap="xs"
                wrap="nowrap"
                style={{
                  padding: '4px 6px',
                  borderRadius: 'var(--mantine-radius-sm)',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-0)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                onClick={() => window.id !== undefined && toggleWindow(window.id)}
              >
                <ActionIcon size="xs" variant="subtle" color="gray" style={{ flexShrink: 0 }}>
                  {expandedWindows.has(window.id ?? -1) ? (
                    <IconChevronDown size={14} />
                  ) : (
                    <IconChevronRight size={14} />
                  )}
                </ActionIcon>
                <IconBrowser size={14} style={{ flexShrink: 0 }} color="var(--mantine-color-dimmed)" />
                <Text size="xs" fw={500} style={{ flex: 1, minWidth: 0 }} lineClamp={1}>
                  Window {windowIndex + 1}
                  {window.focused && (
                    <Text component="span" size="xs" c="dimmed" ml="xs">
                      (active)
                    </Text>
                  )}
                </Text>
                <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                  {window.tabCount}
                </Text>
              </MantineGroup>

              <Collapse in={expandedWindows.has(window.id ?? -1)}>
                <Stack gap={0} pl="lg" pr="xs">
                  {window.tabs.map((tab) => (
                    <MantineGroup
                      key={tab.id ?? tab.index}
                      gap="xs"
                      wrap="nowrap"
                      style={{
                        padding: '3px 6px',
                        borderRadius: 'var(--mantine-radius-sm)',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s',
                        backgroundColor: tab.active
                          ? 'var(--mantine-color-blue-0)'
                          : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!tab.active) {
                          e.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-0)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = tab.active
                          ? 'var(--mantine-color-blue-0)'
                          : 'transparent';
                      }}
                      onClick={() => handleTabClick(tab.id, tab.windowId)}
                    >
                      <Checkbox
                        size="xs"
                        checked={tab.id !== undefined && selectedTabIds.has(tab.id)}
                        onChange={() => toggleTabSelection(tab.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ flexShrink: 0 }}
                      />
                      {tab.favIconUrl ? (
                        <img
                          src={tab.favIconUrl}
                          alt=""
                          style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0 }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div style={{ width: 14, height: 14, flexShrink: 0 }} />
                      )}
                      <Text
                        size="xs"
                        lineClamp={1}
                        style={{ flex: 1, minWidth: 0 }}
                        title={tab.title}
                        fw={tab.active ? 500 : 400}
                      >
                        {tab.title || 'Untitled'}
                      </Text>
                    </MantineGroup>
                  ))}
                </Stack>
              </Collapse>
            </div>
          ))}
          {windows.length === 0 && (
            <Text size="xs" c="dimmed" px="md" py="xs">
              No open tabs
            </Text>
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}
