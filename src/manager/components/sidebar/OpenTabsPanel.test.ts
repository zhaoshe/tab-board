// @vitest-environment happy-dom
import { act, createElement, forwardRef, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenTabsPanel } from './OpenTabsPanel';
import type { OpenTabInfo, OpenWindowInfo } from '../../core/open-tabs';

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
  const ActionIcon = forwardRef<HTMLButtonElement, NativeProps>(({ children, loading: _loading, ...props }, ref) =>
    createElement('button', { ...props, ref }, children as ReactNode));
  const Checkbox = ({ children: _children, ...props }: NativeProps) =>
    createElement('input', { ...props, type: 'checkbox' });
  const TextInput = (props: NativeProps) => createElement('input', props);
  const UnstyledButton = forwardRef<HTMLButtonElement, NativeProps>(({ children, ...props }, ref) =>
    createElement('button', { ...props, ref }, children as ReactNode));

  return {
    ActionIcon,
    Alert: NativeElement,
    Button: NativeElement,
    Checkbox,
    Group: NativeElement,
    ScrollArea: NativeElement,
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
    IconFolderPlus: Icon,
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
      transform: null,
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
    useManagerOverlayLifecycle: () => undefined,
  };
});

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
  return {
    workspaceId: 'workspace_default',
    windows: [selectedWindow],
    selectedWindow,
    selectedWindowId: selectedWindow.id ?? null,
    query: '',
    filteredTabs: tabs,
    selectionMode: true,
    selectedTabIds: [41, 42],
    selectedCount: 2,
    sidebarPinned: true,
    closingTabIds: [43],
    updatingSelection: false,
    loading: false,
    capturing: false,
    error: null,
    onQueryChange: vi.fn(),
    onSelectWindow: vi.fn(),
    onExitSelectionMode: vi.fn(),
    onToggleTabSelection: vi.fn(),
    onSelectAll: vi.fn(),
    onFocusTab: vi.fn(async () => undefined),
    onCloseTab: vi.fn(async () => undefined),
    onPinTab: vi.fn(async () => undefined),
    onCloseSelectedTabs: vi.fn(async () => undefined),
    onPinSelectedTabs: vi.fn(async () => undefined),
    onClearFilter: vi.fn(),
    onCaptureSelectedTabs: vi.fn(async () => undefined),
    onRefresh: vi.fn(async () => undefined),
    sidebarToggleRef: { current: null },
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
  it('keeps pinned storable tabs out of selection and drag records', async () => {
    await mountPanel();

    expect(document.querySelector('[aria-label="Select Pinned"]')).toBeNull();

    const pinnedDrag = testHarness.draggables.find((entry) => entry.id === 'open-tab-1-42');
    expect(pinnedDrag?.disabled).toBe(true);

    const regularDrag = testHarness.draggables.find((entry) => entry.id === 'open-tab-1-41');
    expect(regularDrag?.disabled).toBe(false);
    expect(regularDrag?.data?.dnd?.payload?.tabIds).toEqual([41]);
    expect(regularDrag?.data?.dnd?.records).toEqual([tabs[0]]);
  });

  it('disables the close control while that tab is closing', async () => {
    await mountPanel();

    const closeButton = document.querySelector<HTMLButtonElement>('[aria-label="Close Closing"]');
    expect(closeButton).not.toBeNull();
    expect(closeButton?.disabled).toBe(true);
  });
});
