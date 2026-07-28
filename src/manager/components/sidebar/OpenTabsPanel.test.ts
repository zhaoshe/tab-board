// @vitest-environment happy-dom
import { act, createElement, forwardRef, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenTabsPanel } from './OpenTabsPanel';
import type { OpenTabInfo, OpenWindowInfo } from '../../../shared/openTabs';

interface NativeProps {
  children?: ReactNode;
  [key: string]: unknown;
}

interface DraggableOptions {
  id: string;
  disabled?: boolean;
  data?: {
    dnd?: {
      payload?: { tabIds?: number[] };
      records?: OpenTabInfo[];
    };
  };
}

const testHarness = vi.hoisted(() => ({
  confirmDestructive: vi.fn(async () => true),
  confirmBeforeDestructive: true,
  draggables: [] as DraggableOptions[],
}));

vi.mock('@mantine/core', async () => {
  const { createElement, forwardRef } = await import('react');
  function NativeElement({
    children,
    openDelay: _openDelay,
    lineClamp: _lineClamp,
    scrollbarSize: _scrollbarSize,
    ...props
  }: NativeProps) {
    return createElement('div', props, children);
  }
  const NativeRefElement = forwardRef<HTMLDivElement, NativeProps>(({
    children,
    openDelay: _openDelay,
    lineClamp: _lineClamp,
    scrollbarSize: _scrollbarSize,
    ...props
  }, ref) => createElement('div', { ...props, ref }, children as ReactNode));
  const ActionIcon = forwardRef<HTMLButtonElement, NativeProps>(({ children, loading: _loading, ...props }, ref) =>
    createElement('button', { ...props, ref }, children as ReactNode));
  const Checkbox = ({ children: _children, ...props }: NativeProps) =>
    createElement('input', { ...props, type: 'checkbox' });
  const ScrollArea = ({
    children,
    viewportRef,
    scrollbarSize: _scrollbarSize,
    ...props
  }: NativeProps & { viewportRef?: (element: HTMLDivElement | null) => void }) => (
    createElement('div', {
      ...props,
      ref: viewportRef,
    }, children as ReactNode)
  );
  const TextInput = ({ rightSection: _rightSection, ...props }: NativeProps) =>
    createElement('input', props);
  const UnstyledButton = forwardRef<HTMLButtonElement, NativeProps>(({ children, ...props }, ref) =>
    createElement('button', { ...props, ref }, children as ReactNode));

  return {
    ActionIcon,
    Alert: NativeElement,
    Button: NativeElement,
    Checkbox,
    Group: NativeRefElement,
    ScrollArea,
    Stack: NativeElement,
    Text: NativeElement,
    TextInput,
    Tooltip: NativeElement,
    UnstyledButton,
  };
});

vi.mock('@tabler/icons-react', () => {
  const Icon = () => null;
  return {
    IconBrowser: Icon,
    IconArchive: Icon,
    IconDots: Icon,
    IconFolderPlus: Icon,
    IconGripVertical: Icon,
    IconLayoutSidebarLeftCollapse: Icon,
    IconPin: Icon,
    IconRefresh: Icon,
    IconSelectAll: Icon,
    IconTrash: Icon,
    IconX: Icon,
  };
});

vi.mock('@dnd-kit/core', () => ({
  useDraggable: (options: DraggableOptions) => {
    testHarness.draggables.push(options);
    return {
      attributes: {},
      listeners: {},
      setNodeRef: () => undefined,
      setActivatorNodeRef: () => undefined,
      transform: null,
      isDragging: false,
    };
  },
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Translate: { toString: () => undefined } },
}));

vi.mock('../../hooks/useManagerOverlays', async () => {
  const { createElement } = await import('react');
  const ManagerMenuItem = ({ children, ...props }: NativeProps) => createElement('button', props, children);
  return {
    ManagerMenuItem,
    useManagerInfoTrigger: () => () => undefined,
    useManagerOverlayController: () => ({
      captureFocusRestoreIntent: () => ({}),
      isPreviewOpen: () => false,
      restoreFocusAfterMutation: () => undefined,
    }),
    useManagerOverlayCommands: () => ({
      captureFocusRestoreIntent: () => ({}),
      restoreFocusAfterMutation: () => undefined,
    }),
    useManagerPreviewOpen: () => false,
    useManagerOverlayLifecycle: () => undefined,
  };
});

vi.mock('../../../shared/components/DestructiveConfirmation', () => ({
  useDestructiveConfirmation: () => testHarness.confirmDestructive,
}));

vi.mock('../../../shared/store/useTabBoardStore', () => ({
  useTabBoardStore: (selector: (state: unknown) => unknown) => selector({
    settings: { confirmBeforeDestructive: testHarness.confirmBeforeDestructive },
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tabs: OpenTabInfo[] = [
  {
    id: 41,
    windowId: 1,
    title: 'Regular',
    url: 'https://regular.test',
    favIconUrl: '',
    active: false,
    pinned: false,
    index: 0,
    browserGroup: null,
    storable: true,
    reason: null,
  },
  {
    id: 42,
    windowId: 1,
    title: 'Pinned',
    url: 'https://pinned.test',
    favIconUrl: '',
    active: false,
    pinned: true,
    index: 1,
    browserGroup: null,
    storable: true,
    reason: null,
  },
  {
    id: 43,
    windowId: 1,
    title: 'Closing',
    url: 'https://closing.test',
    favIconUrl: '',
    active: false,
    pinned: false,
    index: 2,
    browserGroup: null,
    storable: true,
    reason: null,
  },
];

const selectedWindow: OpenWindowInfo = {
  id: 1,
  focused: true,
  incognito: false,
  tabCount: tabs.length,
  tabs,
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function createProps(overrides: Partial<ComponentProps<typeof OpenTabsPanel>> = {}) {
  const workflow = {
    model: {
      windows: [selectedWindow],
      selectedWindow,
      selectedWindowId: selectedWindow.id ?? null,
      filteredTabs: tabs,
      query: '',
      tabFilterUrl: null,
      isTabFilterActive: false,
      selection: {
        active: true,
        ids: [41, 42],
        count: 2,
        records: [tabs[0], tabs[1]],
        recordIds: [41, 42],
      },
      status: {
        closingTabIds: [43],
        updatingSelection: false,
        loading: false,
        capturing: false,
        error: null,
      },
    },
    commands: {
      setQuery: vi.fn(),
      selectWindow: vi.fn(),
      clearSelection: vi.fn(),
      toggleSelection: vi.fn(),
      selectAll: vi.fn(),
      focusTab: vi.fn(async () => undefined),
      closeTab: vi.fn(async () => undefined),
      pinTab: vi.fn(async () => undefined),
      closeSelection: vi.fn(async () => undefined),
      pinSelection: vi.fn(async () => undefined),
      clearQuery: vi.fn(),
      captureSelection: vi.fn(async () => null),
      captureWindow: vi.fn(async () => null),
      refresh: vi.fn(async () => undefined),
      filterSessionsByTab: vi.fn(),
      clearSessionFilter: vi.fn(),
      completeDrop: vi.fn(),
    },
  };
  return {
    workspaceId: 'workspace_default',
    workflow,
    sidebarPinned: true,
    onCaptureSelectedWindow: vi.fn(async () => undefined),
    onCaptureSelectedTabs: vi.fn(async () => undefined),
    sidebarToggleRef: { current: null },
    sidebarCompactToggleRef: { current: null },
    onToggleSidebar: vi.fn(),
    ...overrides,
  };
}

async function mountPanel(overrides: Partial<ComponentProps<typeof OpenTabsPanel>> = {}) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(OpenTabsPanel, createProps(overrides)));
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  testHarness.confirmDestructive.mockReset().mockResolvedValue(true);
  testHarness.confirmBeforeDestructive = true;
  testHarness.draggables = [];
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
});

describe('OpenTabsPanel drag constraints', () => {
  it('exposes one-click Save Window with the eligible tab count', async () => {
    const props = createProps();
    await mountPanel(props);

    const saveWindow = document.querySelector<HTMLButtonElement>(
      '[aria-label="Save 3 Tabs in This Window"]',
    );
    expect(saveWindow).not.toBeNull();
    expect(saveWindow?.disabled).toBe(false);

    await act(async () => saveWindow?.click());
    expect(props.onCaptureSelectedWindow).toHaveBeenCalledTimes(1);
  });

  it('disables Save Window with an explanatory name when nothing is capturable', async () => {
    const unavailableTabs = tabs.map((tab) => ({
      ...tab,
      storable: false,
      reason: 'Matches custom filter rule' as const,
    }));
    const unavailableWindow = {
      ...selectedWindow,
      tabs: unavailableTabs,
    };
    await mountPanel({
      workflow: {
        ...createProps().workflow,
        model: {
          ...createProps().workflow.model,
          windows: [unavailableWindow],
          selectedWindow: unavailableWindow,
          filteredTabs: unavailableTabs,
        },
      },
    });

    const saveWindow = document.querySelector<HTMLButtonElement>(
      '[aria-label="Save Window — No Capturable Tabs"]',
    );
    expect(saveWindow).not.toBeNull();
    expect(saveWindow?.disabled).toBe(true);
  });

  it('focuses an open browser tab with one click and keeps details in More', async () => {
    const props = createProps();
    await mountPanel(props);

    const focus = document.querySelector<HTMLButtonElement>('[aria-label="Focus Regular"]');
    const more = document.querySelector<HTMLButtonElement>(
      '[aria-label="More Actions for Regular"]',
    );
    expect(focus).not.toBeNull();
    expect(more).not.toBeNull();

    await act(async () => focus?.click());
    expect(props.workflow.commands.focusTab).toHaveBeenCalledWith(41, 1);
  });

  it('allows pinned storable tabs in selection and drag records', async () => {
    await mountPanel();

    expect(document.querySelector('[aria-label="Select Pinned"]')).not.toBeNull();

    const pinnedDrag = testHarness.draggables.find((entry) => entry.id === 'open-tab-1-42');
    expect(pinnedDrag?.disabled).toBe(false);
    expect(pinnedDrag?.data?.dnd?.payload?.tabIds).toEqual([41, 42]);
    expect(pinnedDrag?.data?.dnd?.records).toEqual([tabs[0], tabs[1]]);

    const regularDrag = testHarness.draggables.find((entry) => entry.id === 'open-tab-1-41');
    expect(regularDrag?.disabled).toBe(false);
    expect(regularDrag?.data?.dnd?.payload?.tabIds).toEqual([41, 42]);
    expect(regularDrag?.data?.dnd?.records).toEqual([tabs[0], tabs[1]]);
  });

  it('disables the close control while that tab is closing', async () => {
    await mountPanel();

    const closeButton = document.querySelector<HTMLButtonElement>('[aria-label="Close Closing"]');
    expect(closeButton).not.toBeNull();
    expect(closeButton?.disabled).toBe(true);
  });

  it('provides complete filter metadata and fixed favicon dimensions', async () => {
    const faviconTabs = tabs.map((tab, index) => ({
      ...tab,
      favIconUrl: index === 0 ? 'https://regular.test/favicon.ico' : tab.favIconUrl,
    }));
    await mountPanel({
      workflow: {
        ...createProps().workflow,
        model: {
          ...createProps().workflow.model,
          windows: [{ ...selectedWindow, tabs: faviconTabs }],
          selectedWindow: { ...selectedWindow, tabs: faviconTabs },
          filteredTabs: faviconTabs,
        },
      },
    });

    const filter = document.querySelector<HTMLInputElement>('#open-tabs-filter-input');
    expect(filter?.name).toBe('open-tabs-filter');
    expect(filter?.autocomplete).toBe('off');
    expect(filter?.getAttribute('spellcheck')).toBe('false');
    expect(filter?.placeholder).toBe('Filter tabs…');

    const favicon = document.querySelector<HTMLImageElement>('.manager-open-tab-favicon img');
    expect(favicon?.width).toBe(20);
    expect(favicon?.height).toBe(20);
    expect(favicon?.loading).toBe('lazy');
  });

  it('uses singular window copy and stable selection names', async () => {
    const singleTabWindow = {
      ...selectedWindow,
      tabCount: 1,
      tabs: [tabs[0]],
    };
    await mountPanel({
      workflow: {
        ...createProps().workflow,
        model: {
          ...createProps().workflow.model,
          windows: [singleTabWindow],
          selectedWindow: singleTabWindow,
          filteredTabs: [tabs[0]],
          selection: {
            active: true,
            ids: [41],
            count: 1,
            records: [tabs[0]],
            recordIds: [41],
          },
        },
      },
    });

    expect(document.querySelector(
      '[aria-label="Window 1: 1 tab, current browser window"]',
    )).not.toBeNull();
    expect(document.querySelector<HTMLInputElement>('[aria-label="Select Regular"]')?.name)
      .toBe('open-tab-selection');
  });

  it('shows stable window ordinals and counts in the expanded selector', async () => {
    await mountPanel();

    expect(document.querySelectorAll('.manager-window-label')).toHaveLength(1);
    expect(document.querySelector('.manager-window-label')?.textContent)
      .toContain('Window 1');
    expect(document.querySelector('.manager-window-label')?.textContent)
      .toContain('3 tabs');
    expect(document.querySelector('[aria-label="Window 1: 3 tabs, current browser window"]'))
      .not.toBeNull();
  });

  it('confirms both single-tab and selected-tab close actions', async () => {
    const props = createProps();
    await mountPanel(props);

    const closeButton = document.querySelector<HTMLButtonElement>('[aria-label="Close Regular"]');
    await act(async () => closeButton?.click());
    expect(testHarness.confirmDestructive).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Close Browser Tab',
      confirmLabel: 'Close Tab',
    }));
    await vi.waitFor(() => expect(props.workflow.commands.closeTab).toHaveBeenCalledWith(41));

    const closeSelected = document.querySelector<HTMLButtonElement>(
      '[aria-label="Close 2 Selected Tabs"]',
    );
    await act(async () => closeSelected?.click());
    expect(testHarness.confirmDestructive).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Close Browser Tabs',
      confirmLabel: 'Close 2 Tabs',
    }));
    await vi.waitFor(() => expect(props.workflow.commands.closeSelection).toHaveBeenCalledTimes(1));
  });

  it('still confirms irreversible browser-tab closing when saved-item confirmation is off', async () => {
    testHarness.confirmBeforeDestructive = false;
    const props = createProps();
    await mountPanel(props);

    const closeButton = document.querySelector<HTMLButtonElement>('[aria-label="Close Regular"]');
    await act(async () => closeButton?.click());

    expect(testHarness.confirmDestructive).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Close Browser Tab',
    }));
    await vi.waitFor(() => expect(props.workflow.commands.closeTab).toHaveBeenCalledWith(41));
  });
});
