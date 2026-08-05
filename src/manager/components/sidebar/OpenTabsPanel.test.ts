// @vitest-environment happy-dom
import { act, createElement, forwardRef, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  activatorNodes: new Map<string, HTMLElement | null>(),
  pointerDrag: vi.fn(),
  touchDrag: vi.fn(),
  keyboardDrag: vi.fn(),
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
  const ActionIcon = forwardRef<HTMLButtonElement, NativeProps>(({
    children,
    loading: _loading,
    style,
    ...props
  }, ref) => createElement('button', {
    ...props,
    ref,
    style: Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style,
  }, children as ReactNode));
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
    createTheme: (value: unknown) => value,
    ActionIcon,
    Alert: NativeElement,
    Button: NativeElement,
    Checkbox,
    Group: NativeRefElement,
    ScrollArea,
    Stack: NativeElement,
    Text: NativeElement,
    TextInput,
    Tooltip: NativeRefElement,
    UnstyledButton,
    useMantineTheme: () => ({
      other: {
        tabBoard: {
          icon: {
            toolbarSize: 18,
            menuSize: 16,
            emptySize: 48,
            strokeWidth: 1.75,
          },
          action: {
            desktopSize: 32,
            touchSize: 44,
            states: {
              selectedColor: 'blue',
              selectedBackground: 'lightblue',
              dangerColor: 'red',
              disabledOpacity: 0.45,
            },
          },
        },
      },
    }),
  };
});

vi.mock('@dnd-kit/core', () => ({
  useDraggable: (options: DraggableOptions) => {
    testHarness.draggables.push(options);
    return {
      attributes: {
        role: 'button',
        tabIndex: 0,
        'aria-roledescription': 'draggable',
      },
      listeners: {
        onPointerDown: testHarness.pointerDrag,
        onTouchStart: testHarness.touchDrag,
        onKeyDown: testHarness.keyboardDrag,
      },
      setNodeRef: () => undefined,
      setActivatorNodeRef: (element: HTMLElement | null) => {
        testHarness.activatorNodes.set(options.id, element);
      },
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
    getTabHoverDomain: (url: string) => new URL(url).host,
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
  const selectionScope = {
    scope: { kind: 'open-tabs' as const, windowId: 1 } as
      | { kind: 'open-tabs'; windowId: number }
      | null,
    commands: {
      enterOpenTabs: vi.fn(),
      enterSavedTabs: vi.fn(),
      exit: vi.fn(),
    },
    registerOpenTabsClear: vi.fn(() => () => undefined),
    registerSavedTabsClear: vi.fn(() => () => undefined),
  };
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
    sidebarState: 'pinned' as const,
    onCaptureSelectedWindow: vi.fn(async () => undefined),
    onCaptureSelectedTabs: vi.fn(async () => undefined),
    sidebarToggleRef: { current: null },
    sidebarCompactToggleRef: { current: null },
    onToggleSidebar: vi.fn(),
    onPinSidebar: vi.fn(),
    onPromoteSidebar: vi.fn(),
    selectionScope,
    onOpenSessionTargetPicker: vi.fn(),
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
  testHarness.activatorNodes.clear();
  testHarness.pointerDrag.mockReset();
  testHarness.touchDrag.mockReset();
  testHarness.keyboardDrag.mockReset();
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
  it('exposes exactly one whole-window save action in the context bar', async () => {
    const props = createProps({
      selectionScope: {
        ...createProps().selectionScope,
        scope: null,
      },
    });
    await mountPanel(props);

    const wholeWindowActions = document.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Save All 3 Tabs"], [aria-label="Save 3 Tabs in This Window"]',
    );
    expect(wholeWindowActions).toHaveLength(1);
    expect(wholeWindowActions[0].getAttribute('aria-label')).toBe(
      'Save All 3 Tabs',
    );
    expect(wholeWindowActions[0].closest(
      '.manager-open-tabs-selection-bar',
    )).not.toBeNull();
    expect(wholeWindowActions[0].disabled).toBe(false);

    await act(async () => wholeWindowActions[0].click());
    expect(props.onCaptureSelectedWindow).toHaveBeenCalledTimes(1);
  });

  it('disables the sole Save All action when nothing is capturable', async () => {
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
      selectionScope: {
        ...createProps().selectionScope,
        scope: null,
      },
    });

    const saveAll = document.querySelector<HTMLButtonElement>(
      '[aria-label="Save All 0 Tabs"]',
    );
    expect(saveAll).not.toBeNull();
    expect(saveAll?.disabled).toBe(true);
    expect(document.querySelector(
      '[aria-label^="Save Window"], [aria-label*="in This Window"]',
    )).toBeNull();
  });

  it('focuses an open browser tab from its title without exposing a row menu', async () => {
    const props = createProps();
    await mountPanel(props);

    const focus = document.querySelector<HTMLButtonElement>('[aria-label="Go to Regular"]');
    expect(focus).not.toBeNull();
    expect(document.querySelector('[aria-label="More Actions for Regular"]')).toBeNull();
    expect(document.querySelector('[aria-label="Pin Regular"]')).toBeNull();

    await act(async () => focus?.click());
    expect(props.workflow.commands.focusTab).toHaveBeenCalledWith(41, 1);
  });

  it('uses one row-title weight when a legacy row includes active', async () => {
    const legacyTabs = tabs.map((tab, index) => (
      index === 0 ? { ...tab, active: true } : tab
    ));
    const legacyWindow = { ...selectedWindow, tabs: legacyTabs };
    await mountPanel({
      workflow: {
        ...createProps().workflow,
        model: {
          ...createProps().workflow.model,
          windows: [legacyWindow],
          selectedWindow: legacyWindow,
          filteredTabs: legacyTabs,
        },
      },
    });

    const regularTitle = document.querySelector(
      '[aria-label="Go to Regular"] .manager-open-tab-details > div',
    );
    expect(regularTitle?.getAttribute('fw')).toBe('600');
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

  it('wires row and title-copy pointer drag without making the row a keyboard drag control', async () => {
    await mountPanel();

    const row = document.querySelector<HTMLElement>('[data-open-tab-id="41"]');
    expect(row).not.toBeNull();
    expect(testHarness.activatorNodes.get('open-tab-1-41')).toBe(row);
    expect(row?.getAttribute('role')).toBeNull();
    expect(row?.getAttribute('tabindex')).toBeNull();
    expect(row?.getAttribute('aria-roledescription')).toBeNull();
    expect(row?.onkeydown).toBeNull();

    await act(async () => {
      row?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      row?.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        pointerType: 'touch',
      }));
    });
    expect(testHarness.pointerDrag).toHaveBeenCalledTimes(1);

    await act(async () => {
      row?.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
    });
    expect(testHarness.touchDrag).toHaveBeenCalledTimes(1);

    await act(async () => {
      row?.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: ' ',
      }));
    });
    expect(testHarness.keyboardDrag).not.toHaveBeenCalled();

    const title = row?.querySelector<HTMLButtonElement>('[aria-label="Go to Regular"]');
    await act(async () => {
      title?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      title?.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
    });
    expect(testHarness.pointerDrag).toHaveBeenCalledTimes(2);
    expect(testHarness.touchDrag).toHaveBeenCalledTimes(2);
  });

  it('keeps the Open row source pointer-only and removes dead per-row callbacks', () => {
    const sourceRoot = resolve(process.cwd(), 'src/manager/components/sidebar');
    const rowSource = readFileSync(resolve(sourceRoot, 'OpenTabRow.tsx'), 'utf8');
    const listSource = readFileSync(resolve(sourceRoot, 'OpenTabsList.tsx'), 'utf8');
    const panelSource = readFileSync(resolve(sourceRoot, 'OpenTabsPanel.tsx'), 'utf8');

    expect(rowSource).toContain('listeners?.onPointerDown?.(event)');
    expect(rowSource).toContain('listeners?.onTouchStart?.(event)');
    expect(rowSource).toContain("event.pointerType === 'touch'");
    expect(rowSource).toContain('setActivatorNodeRef(node)');
    expect(rowSource).not.toContain('{...attributes}');
    expect(rowSource).not.toContain('{...listeners}');
    expect(rowSource).not.toContain('onKeyDown=');
    expect(rowSource).not.toContain('Record<`on${string}`, unknown>');
    expect(listSource).not.toContain('onCloseTab:');
    expect(listSource).not.toContain('onCloseTab={');
    expect(listSource).not.toContain('onPinTab');
    expect(panelSource).not.toContain('closeTabFromPreview');
    expect(panelSource).not.toContain('onPinTab={commands.pinTab}');
    expect(panelSource).not.toContain('onPin={() => void commands.pinSelection()}');
  });

  it('disables the close control while that tab is closing', async () => {
    await mountPanel();

    const closeButton = document.querySelector<HTMLButtonElement>('[aria-label="Close Closing"]');
    expect(closeButton).not.toBeNull();
    expect(closeButton?.disabled).toBe(true);
  });

  it('uses one 20px checkbox-over-favicon owner slot with a 16px favicon', async () => {
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

    const row = document.querySelector<HTMLElement>('[data-open-tab-id="41"]');
    const ownerSlot = row?.querySelector<HTMLElement>('.manager-tab-owner-slot');
    const checkbox = ownerSlot?.querySelector<HTMLInputElement>('[aria-label="Select Regular"]');
    const favicon = ownerSlot?.querySelector<HTMLImageElement>('.manager-open-tab-favicon img');
    expect(ownerSlot).not.toBeNull();
    expect(checkbox).not.toBeNull();
    expect(favicon?.width).toBe(16);
    expect(favicon?.height).toBe(16);
    expect(favicon?.loading).toBe('lazy');
  });

  it('uses semantic window copy without exposing ordinals or raw window IDs', async () => {
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
            ids: [41],
            count: 1,
            records: [tabs[0]],
            recordIds: [41],
          },
        },
      },
    });

    expect(document.querySelector(
      '[aria-label="Browser window, 1 tab, focused"]',
    )).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/Window 1/);
    expect(document.querySelector<HTMLInputElement>('[aria-label="Select Regular"]')?.name)
      .toBe('open-tab-selection');
  });

  it('enters Open Tabs scope before toggling a checkbox and exits explicitly', async () => {
    const props = createProps({
      selectionScope: {
        scope: { kind: 'open-tabs', windowId: 1 },
        commands: {
          enterOpenTabs: vi.fn(),
          enterSavedTabs: vi.fn(),
          exit: vi.fn(),
        },
        registerOpenTabsClear: vi.fn(() => () => undefined),
        registerSavedTabsClear: vi.fn(() => () => undefined),
      },
    });
    await mountPanel(props);

    const checkbox = document.querySelector<HTMLInputElement>('[aria-label="Select Regular"]');
    await act(async () => checkbox?.click());
    expect(props.selectionScope.commands.enterOpenTabs).toHaveBeenCalledWith(1);
    expect(props.workflow.commands.toggleSelection).toHaveBeenCalledWith(41);

    const exit = document.querySelector<HTMLButtonElement>(
      '[aria-label="Exit Tab Selection Mode"]',
    );
    await act(async () => exit?.click());
    expect(props.selectionScope.commands.exit).toHaveBeenCalledTimes(1);
  });

  it('shows Save to without replacing direct Create Session and opens the picker', async () => {
    const props = createProps();
    await mountPanel(props);

    expect(document.querySelector(
      '[aria-label="Create Session from 2 Selected Tabs"]',
    )).not.toBeNull();
    const saveTo = document.querySelector<HTMLButtonElement>(
      '[aria-label="Save Selected Tabs To"]',
    );
    expect(saveTo).not.toBeNull();

    await act(async () => saveTo?.click());

    expect(props.onOpenSessionTargetPicker).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'save-open-tabs',
        source: {
          kind: 'open-tabs',
          tabIds: [41, 42],
          windowId: 1,
          records: [tabs[0], tabs[1]],
        },
        trigger: saveTo,
      }),
    );
    expect(document.querySelector('[aria-label="More Actions for Regular"]'))
      .toBeNull();
  });

  it('uses Select/Unselect All state for the visible Open Tab IDs', async () => {
    const selectProps = createProps({
      workflow: {
        ...createProps().workflow,
        model: {
          ...createProps().workflow.model,
          selection: {
            ids: [41],
            count: 1,
            records: [tabs[0]],
            recordIds: [41],
          },
        },
      },
    });
    await mountPanel(selectProps);

    const selectAll = document.querySelector<HTMLButtonElement>(
      '[aria-label="Select All Visible Tabs"]',
    );
    expect(selectAll).not.toBeNull();
    await act(async () => selectAll?.click());
    expect(selectProps.workflow.commands.selectAll).toHaveBeenCalledWith([
      41,
      42,
      43,
    ]);

    await act(async () => root?.unmount());
    root = null;
    document.body.innerHTML = '';

    const unselectProps = createProps({
      workflow: {
        ...createProps().workflow,
        model: {
          ...createProps().workflow.model,
          selection: {
            ids: [41, 42, 43],
            count: 3,
            records: tabs,
            recordIds: [41, 42, 43],
          },
        },
      },
    });
    await mountPanel(unselectProps);
    const unselectAll = document.querySelector<HTMLButtonElement>(
      '[aria-label="Unselect All Visible Tabs"]',
    );
    expect(unselectAll).not.toBeNull();
    await act(async () => unselectAll?.click());
    expect(unselectProps.workflow.commands.selectAll).toHaveBeenCalledWith([
      41,
      42,
      43,
    ]);
  });

  it('renders zero-selected Open Tabs mode from the Manager scope', async () => {
    await mountPanel({
      workflow: {
        ...createProps().workflow,
        model: {
          ...createProps().workflow.model,
          selection: {
            ids: [],
            count: 0,
            records: [],
            recordIds: [],
          },
        },
      },
      selectionScope: {
        scope: { kind: 'open-tabs', windowId: 1 },
        commands: {
          enterOpenTabs: vi.fn(),
          enterSavedTabs: vi.fn(),
          exit: vi.fn(),
        },
        registerOpenTabsClear: vi.fn(() => () => undefined),
        registerSavedTabsClear: vi.fn(() => () => undefined),
      },
    });

    expect(document.querySelector('.manager-open-tabs-selection-actions')?.textContent)
      .toContain('0 Selected');
    expect(document.querySelector('[data-open-tabs-panel]')?.className)
      .toContain('manager-open-tabs--selection-mode');
  });

  it('renders every window as a count glyph with a focused badge and quiet selected state', async () => {
    await mountPanel();

    expect(document.querySelectorAll('.manager-window-label')).toHaveLength(0);
    expect(document.querySelector('.manager-window-tab-count')?.textContent).toBe('3');
    expect(document.querySelector('.manager-window-focused-badge')).not.toBeNull();
    expect(document.querySelector(
      '[aria-label="Browser window, 3 tabs, focused"]',
    ))
      .not.toBeNull();
    expect(document.querySelector('.manager-window-button')?.getAttribute('aria-pressed'))
      .toBe('true');
    expect(document.body.textContent).not.toMatch(/Window 1/);
  });

  it('renders the normal context bar in place with count, selection entry, and Save All', async () => {
    const props = createProps({
      selectionScope: {
        ...createProps().selectionScope,
        scope: null,
      },
    });
    await mountPanel(props);

    const contextBar = document.querySelector('.manager-open-tabs-selection-bar');
    expect(contextBar?.textContent).toContain('3 Open Tabs');
    const enterSelection = document.querySelector<HTMLButtonElement>(
      '[aria-label="Enter Tab Selection Mode"]',
    );
    const saveAll = document.querySelector<HTMLButtonElement>(
      '[aria-label="Save All 3 Tabs"]',
    );
    const collapse = document.querySelector<HTMLButtonElement>(
      '[aria-label="Collapse Sidebar"]',
    );
    expect(enterSelection).not.toBeNull();
    expect(saveAll).not.toBeNull();
    expect(collapse?.closest('.manager-open-tabs-selection-bar')).not.toBeNull();
    expect(collapse?.closest('.manager-open-tabs-window-bar')).toBeNull();
    expect(document.querySelector('[aria-label="Exit Tab Selection Mode"]')).toBeNull();

    await act(async () => enterSelection?.click());
    expect(props.selectionScope.commands.enterOpenTabs).toHaveBeenCalledWith(1);
    expect(props.workflow.commands.clearSelection).toHaveBeenCalledTimes(1);
    expect(props.onPinSidebar).not.toHaveBeenCalled();

    await act(async () => saveAll?.click());
    expect(props.onCaptureSelectedWindow).toHaveBeenCalledTimes(1);
  });

  it('leaves the empty Open Tabs area blank and disables selection entry', async () => {
    const emptyWindow = {
      ...selectedWindow,
      tabCount: 0,
      tabs: [],
    };
    const props = createProps({
      workflow: {
        ...createProps().workflow,
        model: {
          ...createProps().workflow.model,
          windows: [emptyWindow],
          selectedWindow: emptyWindow,
          filteredTabs: [],
        },
      },
      selectionScope: {
        ...createProps().selectionScope,
        scope: null,
      },
    });
    await mountPanel(props);

    expect(document.body.textContent).not.toContain('No open tabs');
    const enterSelection = document.querySelector<HTMLButtonElement>(
      '[aria-label="Enter Tab Selection Mode"]',
    );
    expect(enterSelection?.disabled).toBe(true);

    await act(async () => enterSelection?.click());
    expect(props.selectionScope.commands.enterOpenTabs).not.toHaveBeenCalled();
  });

  it('uses the confirmed Inbox glyph for every Manager save action', async () => {
    await mountPanel();

    for (const label of ['Save Selected Tabs To']) {
      const action = document.querySelector<HTMLElement>(
        `[aria-label="${label}"]`,
      );
      expect(action?.querySelector('.lucide-inbox')).not.toBeNull();
      expect(action?.querySelector('.lucide-archive')).toBeNull();
      expect(action?.querySelector('.lucide-save')).toBeNull();
    }

    await act(async () => root?.unmount());
    root = null;
    document.body.innerHTML = '';
    await mountPanel({
      selectionScope: {
        ...createProps().selectionScope,
        scope: null,
      },
    });

    const saveAll = document.querySelector<HTMLElement>(
      '[aria-label="Save All 3 Tabs"]',
    );
    expect(saveAll?.querySelector('.lucide-inbox')).not.toBeNull();
    expect(saveAll?.querySelector('.lucide-archive')).toBeNull();
  });

  it('replaces the same context bar in selection mode and never duplicates it', async () => {
    await mountPanel();

    expect(document.querySelectorAll('.manager-open-tabs-selection-bar')).toHaveLength(1);
    expect(document.querySelector('.manager-open-tabs-selection-bar')?.textContent)
      .toContain('2 Selected');
    expect(document.querySelector('[aria-label="Enter Tab Selection Mode"]')).toBeNull();
    expect(document.querySelector('[aria-label="Save All 3 Tabs"]')).toBeNull();
    expect(document.querySelector('[aria-label="Exit Tab Selection Mode"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Close 2 Selected Tabs"]')).toBeNull();
    expect(document.querySelector('[aria-label="Pin 2 Selected Tabs"]')).toBeNull();
    expect(document.querySelectorAll(
      '.manager-open-tabs-selection-actions__tools button',
    )).toHaveLength(5);
  });

  it('keeps row Close progressive during selection while the checkbox stays visible', async () => {
    await mountPanel();

    const row = document.querySelector<HTMLElement>('[data-open-tab-id="41"]');
    const checkbox = row?.querySelector<HTMLElement>('.manager-open-tab-select');
    const close = row?.querySelector<HTMLElement>('.manager-open-tab-close');
    expect(checkbox).not.toBeNull();
    expect(close).not.toBeNull();
    expect(row?.closest('.manager-open-tabs--selection-mode')).not.toBeNull();

    const sidebarCss = readFileSync(
      resolve(process.cwd(), 'src/manager/styles/sidebar.css'),
      'utf8',
    );
    expect(sidebarCss).toContain(
      '.manager-open-tabs--selection-mode .manager-open-tab-select',
    );
    expect(sidebarCss).not.toContain(
      '.manager-open-tabs--selection-mode .manager-open-tab-close',
    );
  });

  it('uses the same context bar as the only centered Expand control when collapsed', async () => {
    await mountPanel({
      sidebarState: 'collapsed',
    } as Partial<ComponentProps<typeof OpenTabsPanel>>);

    expect(document.querySelectorAll('.manager-open-tabs-selection-bar')).toHaveLength(1);
    expect(document.querySelector('[aria-label="Expand Sidebar"]')).not.toBeNull();
    expect(document.querySelector('.manager-sidebar-compact-toggle')).toBeNull();
    expect(document.querySelector('[aria-label="Enter Tab Selection Mode"]')).toBeNull();
    const filter = document.querySelector<HTMLInputElement>('#open-tabs-filter-input');
    expect(filter).not.toBeNull();
    expect(filter?.disabled).toBe(true);
    expect(filter?.tabIndex).toBe(-1);
    expect(filter?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector<HTMLInputElement>('[aria-label="Select Regular"]')?.tabIndex)
      .toBe(-1);
    expect(document.querySelector<HTMLButtonElement>('[aria-label="Close Regular"]')?.tabIndex)
      .toBe(-1);
  });

  it('describes and marks an active filter on the collapsed Expand action', async () => {
    await mountPanel({
      sidebarState: 'collapsed',
      workflow: {
        ...createProps().workflow,
        model: {
          ...createProps().workflow.model,
          query: 'regular',
          filteredTabs: [tabs[0]],
        },
      },
    } as Partial<ComponentProps<typeof OpenTabsPanel>>);

    expect(document.querySelector(
      '[aria-label="Expand Sidebar, 1 of 3 open tabs match the filter"]',
    )).not.toBeNull();
    expect(document.querySelector(
      '.manager-open-tabs-filter-indicator',
    )).not.toBeNull();
  });

  it('removes collapsed Focus controls from the accessibility tree while preserving pointer focus', async () => {
    const props = createProps({
      sidebarState: 'collapsed',
    } as Partial<ComponentProps<typeof OpenTabsPanel>>);
    await mountPanel(props);

    const row = document.querySelector<HTMLElement>('[data-open-tab-id="41"]');
    const focusControl = row?.querySelector<HTMLButtonElement>(
      'button[aria-label="Go to Regular"]',
    );
    expect(focusControl).not.toBeNull();
    expect(focusControl?.disabled).toBe(true);
    expect(focusControl?.tabIndex).toBe(-1);
    expect(focusControl?.getAttribute('aria-hidden')).toBe('true');
    expect(row?.getAttribute('role')).toBeNull();
    expect(row?.getAttribute('tabindex')).toBeNull();

    await act(async () => row?.click());
    expect(props.workflow.commands.focusTab).toHaveBeenCalledWith(41, 1);
  });

  it('pins a temporary peek before selection entry or Filter focus', async () => {
    const onPromoteSidebar = vi.fn();
    const props = createProps({
      sidebarState: 'peek',
      onPromoteSidebar,
      selectionScope: {
        ...createProps().selectionScope,
        scope: null,
      },
    } as Partial<ComponentProps<typeof OpenTabsPanel>>);
    await mountPanel(props);

    await act(async () => {
      const filter = document.querySelector<HTMLInputElement>('#open-tabs-filter-input');
      filter?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
    expect(onPromoteSidebar).toHaveBeenCalledTimes(1);

    const enterSelection = document.querySelector<HTMLButtonElement>(
      '[aria-label="Enter Tab Selection Mode"]',
    );
    await act(async () => enterSelection?.click());
    expect(onPromoteSidebar).toHaveBeenCalledTimes(2);
    expect(props.onPinSidebar).not.toHaveBeenCalled();
  });

  it('has no manual Refresh action and uses neutral sidebar commands', async () => {
    await mountPanel({
      selectionScope: {
        ...createProps().selectionScope,
        scope: null,
      },
    });

    expect(document.querySelector('[aria-label*="Refresh"]')).toBeNull();
    expect(document.querySelector(
      '[aria-label^="Save Window"], [aria-label*="in This Window"]',
    )).toBeNull();
    const saveAll = document.querySelector<HTMLElement>(
      '[aria-label="Save All 3 Tabs"]',
    );
    const collapse = document.querySelector<HTMLElement>(
      '[aria-label="Collapse Sidebar"]',
    );
    expect(saveAll?.getAttribute('variant')).not.toBe('light');
    expect(saveAll?.getAttribute('color')).not.toBe('blue');
    expect(collapse?.getAttribute('variant')).not.toBe('light');
  });

  it('confirms the single-tab row Close action', async () => {
    const props = createProps();
    await mountPanel(props);

    const closeButton = document.querySelector<HTMLButtonElement>('[aria-label="Close Regular"]');
    await act(async () => closeButton?.click());
    expect(testHarness.confirmDestructive).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Close Browser Tab',
      confirmLabel: 'Close Tab',
    }));
    await vi.waitFor(() => expect(props.workflow.commands.closeTab).toHaveBeenCalledWith(41));
  });

  it('closes a browser tab directly when dangerous-operation confirmation is off', async () => {
    testHarness.confirmBeforeDestructive = false;
    const props = createProps();
    await mountPanel(props);

    const closeButton = document.querySelector<HTMLButtonElement>('[aria-label="Close Regular"]');
    await act(async () => closeButton?.click());

    expect(testHarness.confirmDestructive).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(props.workflow.commands.closeTab).toHaveBeenCalledWith(41));
  });
});
