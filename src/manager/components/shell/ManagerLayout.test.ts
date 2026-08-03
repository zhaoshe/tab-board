// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  act,
  createElement,
  StrictMode,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getWorkspaceFiltersAfterDelete,
  ManagerLayout,
  shouldSyncActiveWorkspace,
} from './ManagerLayout';
import { ManagerFrame } from './ManagerFrame';
import {
  createGeometryCollisionDetection,
  getCollisionSelection,
  getDragEndTarget,
  getDragStartSourceRect,
  getFinishedDragState,
  isPointWithinRect,
  ManagerDndCoordinator,
  persistDropWithFeedback,
  shouldInvalidateDragReplacement,
  type GeometryCandidate,
} from './ManagerDndCoordinator';
import { markerForTarget } from './managerDndGeometry';
import { ManagerDragOverlay } from './ManagerDragOverlay';
import type { DragUiState, DropTarget } from '../../core/dnd';

const testHarness = vi.hoisted(() => {
  const state = {
    activeWorkspaceId: 'workspace_default',
    workspaces: [{ id: 'workspace_default' }],
    folders: [],
    groups: [],
    applyDropIntent: vi.fn(),
  };
  const useStore = vi.fn((selector: (value: typeof state) => unknown) => selector(state));
  Object.assign(useStore, { getState: () => state });

  return {
    autoScroll: null as boolean | null,
    autoScrollInput: null as null | {
      active: boolean;
      boardRef: { current: HTMLElement | null };
      onScrolled?: () => void;
      pause: boolean;
      pointerRef: {
        current: { x: number; y: number } | null;
      };
    },
    autoScrollWake: vi.fn(),
    collisionDetection: null as null | ((args: unknown) => unknown),
    dndOnDragCancel: null as ((event: unknown) => void) | null,
    dndOnDragEnd: null as ((event: unknown) => Promise<void>) | null,
    dndOnDragMove: null as ((event: unknown) => void) | null,
    dndOnDragOver: null as ((event: unknown) => void) | null,
    dndOnDragStart: null as ((event: unknown) => void) | null,
    dragOverlayProps: null as null | {
      className?: string;
      style?: Record<string, unknown>;
      zIndex?: number;
    },
    overlayStates: [] as DragUiState[],
    onOpenTabsSourceKeyChange: null as ((key: unknown) => void) | null,
    completeDrop: vi.fn(),
    measureDroppableContainers: vi.fn(),
    resolveDrop: vi.fn(() => ({
      kind: 'create-session' as const,
      source: { kind: 'open-tabs' as const, tabIds: [1], windowId: 1 },
      category: 'inbox' as const,
      index: 0,
      workspaceId: 'workspace_default',
    })),
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
    showError: vi.fn(),
    setSearchQuery: vi.fn(),
    state,
    useStore,
  };
});

vi.mock('@mantine/core', () => ({
  Group: ({ children }: { children?: ReactNode }) => children,
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    autoScroll,
    children,
    collisionDetection,
    onDragCancel,
    onDragEnd,
    onDragMove,
    onDragOver,
    onDragStart,
  }: {
    autoScroll: boolean;
    children?: ReactNode;
    collisionDetection: (args: unknown) => unknown;
    onDragCancel: (event: unknown) => void;
    onDragEnd: (event: unknown) => Promise<void>;
    onDragMove: (event: unknown) => void;
    onDragOver: (event: unknown) => void;
    onDragStart: (event: unknown) => void;
  }) => {
    testHarness.autoScroll = autoScroll;
    testHarness.collisionDetection = collisionDetection;
    testHarness.dndOnDragCancel = onDragCancel;
    testHarness.dndOnDragEnd = onDragEnd;
    testHarness.dndOnDragMove = onDragMove;
    testHarness.dndOnDragOver = onDragOver;
    testHarness.dndOnDragStart = onDragStart;
    return children;
  },
  DragOverlay: ({
    children,
    className,
    style,
    zIndex,
  }: {
    children?: ReactNode;
    className?: string;
    style?: Record<string, unknown>;
    zIndex?: number;
  }) => {
    testHarness.dragOverlayProps = { className, style, zIndex };
    return createElement('div', {
      className,
      style: { ...style, zIndex },
    }, children);
  },
  PointerSensor: class PointerSensor {},
  TouchSensor: class TouchSensor {},
  useDndContext: () => ({
    droppableContainers: {
      getEnabled: () => [{ id: 'drop-a' }, { id: 'drop-b' }],
    },
    measureDroppableContainers: testHarness.measureDroppableContainers,
  }),
  useDndMonitor: () => undefined,
  useSensor: () => ({}),
  useSensors: () => [],
}));

vi.mock('../sidebar/Sidebar', () => ({
  Sidebar: ({ onOpenTabsSourceKeyChange }: { onOpenTabsSourceKeyChange: (key: unknown) => void }) => {
    testHarness.onOpenTabsSourceKeyChange = onOpenTabsSourceKeyChange;
    return null;
  },
}));
vi.mock('../import-export/ImportModal', () => ({ ImportModal: () => null }));
vi.mock('../import-export/ExportModal', () => ({ ExportModal: () => null }));
vi.mock('../workspace/WorkspaceContent', () => ({
  WorkspaceContent: ({
    registerBoardElement,
  }: {
    registerBoardElement: (element: HTMLElement | null) => void;
  }) => createElement('section', {
    className: 'manager-board',
    ref: registerBoardElement,
  }),
}));
vi.mock('../bin/BinView', () => ({ BinView: () => null }));
vi.mock('../sessions/SessionCard', () => ({ SessionCard: () => null }));
vi.mock('../sessions/TabItemRow', () => ({ TabItemRow: () => null }));
vi.mock('../workspace/WorkspaceHeader', () => ({ WorkspaceHeader: () => null }));
vi.mock('./SessionTargetPicker', () => ({
  createSessionTargetChoices: () => [],
  createSessionTargetChoiceLabels: () => new Map(),
  createSessionTargetIntent: vi.fn(),
  SessionTargetPicker: () => null,
}));

vi.mock('../../hooks/useBoardProjection', () => ({
  useFilteredGroups: () => [],
}));
vi.mock('../../hooks/useWorkspaceState', () => ({
  useCurrentWorkspace: () => ({ id: 'workspace_default', name: 'Workspace' }),
}));
vi.mock('../../hooks/useSearchQuery', () => ({
  savedSearchQueryStore: {
    getSnapshot: () => '',
    subscribe: () => () => undefined,
    set: testHarness.setSearchQuery,
  },
  useSearchQuery: () => '',
  useSetSearchQuery: () => testHarness.setSearchQuery,
}));
vi.mock('../../hooks/useOpenTabsRuntime', () => ({
  useOpenTabsRuntime: () => ({
    model: {
      windows: [],
      selectedWindow: null,
      selectedWindowId: null,
      filteredTabs: [],
      query: '',
      tabFilterUrl: null,
      isTabFilterActive: false,
      selection: {
        active: false,
        ids: [],
        count: 0,
        records: [],
        recordIds: [],
      },
      status: {
        closingTabIds: [],
        updatingSelection: false,
        loading: false,
        capturing: false,
        error: null,
      },
    },
    commands: {
      completeDrop: testHarness.completeDrop,
    },
  }),
}));
vi.mock('../../hooks/useManagerRuntime', () => ({ useManagerRuntime: () => ({}) }));
vi.mock('../../hooks/useBoardDragAutoScroll', () => ({
  useBoardDragAutoScroll: (input: typeof testHarness.autoScrollInput) => {
    testHarness.autoScrollInput = input;
    return testHarness.autoScrollWake;
  },
}));
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({
    showSuccess: testHarness.showSuccess,
    showInfo: testHarness.showInfo,
    showError: testHarness.showError,
  }),
}));
vi.mock('./useToastNotifications', () => ({ useToastNotifications: () => undefined }));
vi.mock('../../hooks/useManagerOverlays', () => ({
  ManagerOverlayPortal: () => null,
  ManagerOverlaysProvider: ({ children }: { children?: ReactNode }) => children,
  useManagerOverlayController: () => ({ closeOverlays: vi.fn() }),
  useManagerOverlayCommands: () => ({ closeOverlays: vi.fn() }),
}));
vi.mock('./ManagerDragOverlay', async () => {
  const React = await import('react');
  const actual = await vi.importActual<typeof import('./ManagerDragOverlay')>(
    './ManagerDragOverlay',
  );
  return {
    ManagerDragOverlay: (
      props: Parameters<typeof actual.ManagerDragOverlay>[0],
    ) => {
      testHarness.overlayStates.push(props.dragUiState);
      return React.createElement(actual.ManagerDragOverlay, props);
    },
  };
});
vi.mock('../../../shared/store/useTabBoardStore', () => ({ useTabBoardStore: testHarness.useStore }));
vi.mock('../../core/dnd', async () => {
  const actual = await vi.importActual<typeof import('../../core/dnd')>('../../core/dnd');
  return { ...actual, resolveDrop: testHarness.resolveDrop };
});

const layoutSource = readFileSync(resolve(process.cwd(), 'src/manager/components/shell/ManagerLayout.tsx'), 'utf8');
const dndSource = readFileSync(resolve(process.cwd(), 'src/manager/components/shell/ManagerDndCoordinator.tsx'), 'utf8');
const captureSource = readFileSync(resolve(process.cwd(), 'src/manager/hooks/useCaptureReveal.ts'), 'utf8');
const frameSource = readFileSync(resolve(process.cwd(), 'src/manager/components/shell/ManagerFrame.tsx'), 'utf8');
const source = `${layoutSource}
${dndSource}
${captureSource}
${frameSource}`;
const runtimeSource = readFileSync(resolve(process.cwd(), 'src/manager/hooks/useOpenTabsRuntime.ts'), 'utf8');
const overlayCssSource = readFileSync(
  resolve(process.cwd(), 'src/manager/styles/overlays.css'),
  'utf8',
);
const shellCssSource = readFileSync(
  resolve(process.cwd(), 'src/manager/styles/shell.css'),
  'utf8',
);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
  testHarness.autoScroll = null;
  testHarness.autoScrollInput = null;
  testHarness.autoScrollWake.mockClear();
  testHarness.dndOnDragCancel = null;
  testHarness.dndOnDragEnd = null;
  testHarness.dndOnDragMove = null;
  testHarness.dndOnDragOver = null;
  testHarness.dndOnDragStart = null;
  testHarness.collisionDetection = null;
  testHarness.dragOverlayProps = null;
  testHarness.overlayStates = [];
  testHarness.onOpenTabsSourceKeyChange = null;
  testHarness.measureDroppableContainers.mockClear();
  testHarness.resolveDrop.mockClear();
  testHarness.showSuccess.mockClear();
  testHarness.showInfo.mockClear();
  testHarness.showError.mockClear();
  testHarness.setSearchQuery.mockClear();
  testHarness.completeDrop.mockClear();
  testHarness.state.applyDropIntent.mockReset();
  testHarness.state.applyDropIntent.mockResolvedValue(undefined);
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

async function mountManagerLayout(strict = false): Promise<void> {
  root = createRoot(container!);
  await act(async () => {
    root?.render(
      strict
        ? createElement(StrictMode, null, createElement(ManagerLayout))
        : createElement(ManagerLayout),
    );
  });
  expect(testHarness.dndOnDragEnd).not.toBeNull();
  expect(testHarness.dndOnDragMove).not.toBeNull();
  expect(testHarness.dndOnDragStart).not.toBeNull();
  expect(testHarness.onOpenTabsSourceKeyChange).not.toBeNull();
}

function createOpenTabsDragActive(): unknown {
  return {
    id: 'open-tab-1',
    data: {
      current: {
        dnd: {
          payload: {
            kind: 'open-tabs',
            tabIds: [1],
            windowId: 1,
            workspaceId: 'workspace_default',
          },
          records: [],
        },
      },
    },
    rect: { current: { initial: null } },
  };
}

function createOpenTabsPreviewDragActive(): unknown {
  return {
    id: 'open-tab-1',
    data: {
      current: {
        dnd: {
          payload: {
            kind: 'open-tabs',
            tabIds: [2, 1],
            windowId: 1,
            workspaceId: 'workspace_default',
          },
          records: [
            {
              id: 1,
              windowId: 1,
              title: '',
              url: 'https://one.example.test/path',
              favIconUrl: '',
              pinned: false,
              index: 0,
              browserGroup: null,
              storable: true,
              reason: null,
            },
            {
              id: 2,
              windowId: 1,
              title: 'Open Two',
              url: 'https://two.example.test/path',
              favIconUrl: '',
              pinned: false,
              index: 1,
              browserGroup: null,
              storable: true,
              reason: null,
            },
          ],
        },
      },
    },
    rect: {
      current: {
        initial: {
          left: 20,
          top: 30,
          width: 312,
          height: 88,
        },
      },
    },
  };
}

function createOpenTabsDragEndEvent(): unknown {
  return {
    active: createOpenTabsDragActive(),
    over: {
      data: {
        current: {
          dnd: {
            targets: [{
              kind: 'category-column',
              category: 'inbox',
              workspaceId: 'workspace_default',
            }],
          },
        },
      },
    },
  };
}

function createNewSessionOver(index = 0): {
  data: {
    current: {
      dnd: {
        targets: DropTarget[];
      };
    };
  };
} {
  return {
    data: {
      current: {
        dnd: {
          targets: [{
            kind: 'new-session-insert',
            category: 'inbox',
            index,
            workspaceId: 'workspace_default',
          }],
        },
      },
    },
  };
}

async function renderDragOverlay(dragUiState: DragUiState): Promise<void> {
  if (root) {
    await act(async () => root?.unmount());
  }
  container!.innerHTML = '';
  root = createRoot(container!);
  await act(async () => {
    root?.render(createElement(ManagerDragOverlay, {
      activeGroup: undefined,
      dragUiState,
      runtime: {} as never,
    }));
  });
}

describe('tooltip ownership', () => {
  it('does not globally reinterpret every aria description as a tooltip', () => {
    expect(frameSource).not.toContain('ManagerTooltipDismissal');
    expect(frameSource).not.toContain("document.querySelectorAll<HTMLElement>('[aria-describedby]')");
    expect(frameSource).not.toContain("new MouseEvent('mouseout'");
  });
});

describe('ManagerFrame sidebar disclosure DOM', () => {
  it('forwards focus-intent cancellation options to the disclosure owner', () => {
    const layoutSource = readFileSync(
      resolve(process.cwd(), 'src/manager/components/shell/ManagerLayout.tsx'),
      'utf8',
    );
    expect(layoutSource).toContain(
      "sidebar.setPeekIntent('focus', active, options)",
    );
  });

  async function renderFrame(
    sidebarState: 'collapsed' | 'peek' | 'pinned' | 'drawer',
    callbacks: {
      onSidebarPointerIntent?: (active: boolean) => void;
      onSidebarFocusIntent?: (
        active: boolean,
        options?: { cancelPending?: boolean },
      ) => void;
    } = {},
  ) {
    if (root) {
      await act(async () => root?.unmount());
      root = null;
    }
    container!.innerHTML = '';
    root = createRoot(container!);
    await act(async () => {
      root?.render(createElement(ManagerFrame, {
        dragActive: false,
        sidebarState,
        openTabsDragActive: false,
        onSidebarPointerIntent: callbacks.onSidebarPointerIntent ?? vi.fn(),
        onSidebarFocusIntent: callbacks.onSidebarFocusIntent ?? vi.fn(),
        header: createElement('button', null, 'Header action'),
        sidebar: createElement(
          'div',
          null,
          createElement('button', { 'aria-label': 'Browser window' }, 'Window'),
          createElement('button', {
            className: 'manager-open-tabs-context-expand',
            'aria-label': 'Expand Sidebar',
          }, 'Expand'),
        ),
        main: createElement('button', null, 'Main action'),
      }));
    });
    return document.querySelector<HTMLElement>('.manager-shell');
  }

  it('keeps pinned in the grid and peek overlaid without making the board inert', async () => {
    const pinned = await renderFrame('pinned');
    expect(pinned?.classList.contains('manager-shell--sidebar-pinned')).toBe(true);
    expect(pinned?.classList.contains('manager-shell--sidebar-collapsed')).toBe(false);
    expect(document.querySelector('.manager-topbar')?.hasAttribute('inert')).toBe(false);
    expect(document.querySelector('.manager-main-surface')?.hasAttribute('inert')).toBe(false);

    const peek = await renderFrame('peek');
    expect(peek?.classList.contains('manager-shell--sidebar-peek')).toBe(true);
    expect(peek?.classList.contains('manager-shell--sidebar-collapsed')).toBe(true);
    expect(document.querySelector('.manager-topbar')?.hasAttribute('inert')).toBe(false);
    expect(document.querySelector('.manager-main-surface')?.hasAttribute('inert')).toBe(false);
  });

  it('makes only the compact drawer-covered surfaces inert', async () => {
    const drawer = await renderFrame('drawer');
    expect(drawer?.classList.contains('manager-shell--sidebar-drawer')).toBe(true);
    expect(drawer?.classList.contains('manager-shell--sidebar-collapsed')).toBe(true);
    expect(document.querySelector('.manager-topbar')?.hasAttribute('inert')).toBe(true);
    expect(document.querySelector('.manager-main-surface')?.hasAttribute('inert')).toBe(true);

    const collapsed = await renderFrame('collapsed');
    expect(collapsed?.classList.contains('manager-shell--sidebar-collapsed')).toBe(true);
    expect(collapsed?.classList.contains('manager-shell--sidebar-peek')).toBe(false);
    expect(collapsed?.classList.contains('manager-shell--sidebar-drawer')).toBe(false);
    expect(collapsed?.className.split(/\s+/).filter(
      (name) => name === 'manager-shell--sidebar-collapsed',
    )).toHaveLength(1);
    expect(document.querySelector('.manager-topbar')?.hasAttribute('inert')).toBe(false);
  });

  it('cancels focus peek intent when focus moves from the window glyph to Expand', async () => {
    const onSidebarFocusIntent = vi.fn();
    await renderFrame('collapsed', { onSidebarFocusIntent });
    const windowButton = document.querySelector<HTMLButtonElement>(
      '[aria-label="Browser window"]',
    );
    const expandButton = document.querySelector<HTMLButtonElement>(
      '[aria-label="Expand Sidebar"]',
    );

    await act(async () => windowButton?.focus());
    await act(async () => expandButton?.focus());

    expect(onSidebarFocusIntent).toHaveBeenNthCalledWith(1, true);
    expect(onSidebarFocusIntent).toHaveBeenNthCalledWith(
      2,
      false,
      { cancelPending: true },
    );
  });
});

describe('drag end lifecycle', () => {
  const validTarget: DropTarget = {
    kind: 'group-body',
    groupId: 'target',
    workspaceId: 'workspace_default',
  };

  it('does not reuse a locked target when release happens outside', () => {
    const over = {
      data: { current: { dnd: { targets: [validTarget] } } },
    } as never;

    expect(getDragEndTarget(over, validTarget)).toEqual(validTarget);
    expect(getDragEndTarget(null, validTarget)).toBeNull();
  });

  it('prefers the latest geometry target over stale UI state on the same droppable', () => {
    const lockedTarget: DropTarget = {
      kind: 'tab-before',
      groupId: 'target',
      tabId: 'tab-b',
      index: 1,
      placement: 'after',
      workspaceId: 'workspace_default',
    };
    const staleUiTarget: DropTarget = {
      kind: 'tab-before',
      groupId: 'target',
      tabId: 'tab-a',
      index: 0,
      workspaceId: 'workspace_default',
    };
    const over = {
      id: 'group-target',
      data: { current: { dnd: { targets: [staleUiTarget] } } },
    } as never;

    expect(getDragEndTarget(over, lockedTarget, staleUiTarget)).toEqual(lockedTarget);
  });

  it('prefers an active exact plus over an old ordinary lock at release', () => {
    const lockedTarget: DropTarget = {
      kind: 'group-body',
      groupId: 'target',
      workspaceId: 'workspace_default',
    };
    const exactTarget: DropTarget = {
      kind: 'new-session-insert',
      category: 'inbox',
      index: 2,
      workspaceId: 'workspace_default',
    };
    const over = {
      id: 'new-session-insert-workspace_default-inbox-2',
      data: { current: { dnd: { targets: [exactTarget] } } },
    } as never;

    expect(getDragEndTarget(over, lockedTarget, exactTarget)).toEqual(exactTarget);
  });

  it('rejects stale exact UI state after the pointer leaves its real over target', () => {
    const ordinaryTarget: DropTarget = {
      kind: 'group-body',
      groupId: 'target',
      workspaceId: 'workspace_default',
    };
    const staleExactTarget: DropTarget = {
      kind: 'new-session-insert',
      category: 'inbox',
      index: 2,
      workspaceId: 'workspace_default',
    };
    const over = {
      id: 'group-target',
      data: { current: { dnd: { targets: [ordinaryTarget] } } },
    } as never;

    expect(getDragEndTarget(over, null, staleExactTarget)).toEqual(ordinaryTarget);
    expect(getDragEndTarget(null, null, staleExactTarget)).toBeNull();
  });

  it('wires geometry target precedence without collapsing it into UI state fallback', () => {
    expect(dndSource).toContain(`event.over,\n        lockedTargetRef.current,\n        dragUiStateRef.current.target,`);
    expect(dndSource).not.toContain('dragUiStateRef.current.target ?? lockedTargetRef.current');
  });

  it('invalidates only replaced or disappeared drag sources', () => {
    const payload = { kind: 'group', groupId: 'group-a', workspaceId: 'workspace_default' } as const;
    const groups = [] as never[];
    const snapshot = { workspaceId: 'workspace_default', category: 'inbox' as const, view: 'workspace', groups };
    expect(shouldInvalidateDragReplacement(null, payload, snapshot, snapshot, true)).toBe(false);
    expect(shouldInvalidateDragReplacement('group-a', payload, snapshot, snapshot, true)).toBe(false);
    expect(shouldInvalidateDragReplacement('group-a', payload, snapshot, { ...snapshot, groups: [] }, true)).toBe(true);
    expect(shouldInvalidateDragReplacement('group-a', payload, snapshot, snapshot, false)).toBe(true);
  });

  it('clears active drag state through one finish-state helper', () => {
    const finished = getFinishedDragState({
      payload: { kind: 'group', groupId: 'group-a', workspaceId: 'workspace_default' },
      target: validTarget,
      marker: { kind: 'group', index: 0 },
      sourceRect: { left: 1, top: 2, width: 3, height: 4 },
      previewRect: { left: 1, top: 2, width: 300, height: 200 },
      previewLayout: { columns: 2, mode: 'details', rows: 2 },
      previewItems: [{
        id: 'tab-a',
        title: 'Saved A',
        domain: 'saved.example',
        itemType: 'link',
      }],
    });
    expect(finished.activeId).toBeNull();
    expect(finished.dragUiState).toEqual({
      payload: null,
      target: null,
      marker: null,
      sourceRect: null,
      previewRect: null,
      previewLayout: null,
      previewItems: [],
    });
    expect(finished.dragUiState.previewItems).toEqual([]);
    expect(Object.isFrozen(finished.dragUiState.previewItems)).toBe(true);
    expect(Object.prototype.propertyIsEnumerable.call(
      finished.dragUiState,
      'previewItems',
    )).toBe(true);
  });

  it('suppresses no-op session targets before rendering a marker', () => {
    expect(dndSource).toMatch(/payload\?\.kind === 'group'[\s\S]*!resolveDrop\(\{ payload, target, state: useTabBoardStore\.getState\(\) \}\)/);
    expect(dndSource).toContain('target: null, marker: null');
  });
});

describe('drag start source geometry', () => {
  const initial = {
    left: 4,
    top: 5,
    width: 100,
    height: 32,
  };

  it('captures the visible Saved row pointer surface before drag replacement', () => {
    const row = document.createElement('div');
    row.className = 'tab-item-row__content';
    const child = document.createElement('span');
    row.append(child);
    document.body.append(row);
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 314,
      height: 48,
      right: 324,
      bottom: 68,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });

    expect(getDragStartSourceRect({
      active: {
        data: {
          current: {
            dnd: {
              payload: {
                kind: 'tabs',
                refs: [{ groupId: 'group-a', tabId: 'tab-a' }],
                workspaceId: 'workspace_default',
              },
            },
          },
        },
        rect: { current: { initial, translated: null } },
      } as never,
      activatorEvent: { target: child } as unknown as Event,
    })).toEqual({
      left: 10,
      top: 20,
      width: 314,
      height: 48,
    });
  });

  it('keeps dnd-kit initial geometry for non-item and non-DOM activation', () => {
    expect(getDragStartSourceRect({
      active: {
        data: {
          current: {
            dnd: {
              payload: {
                kind: 'group',
                groupId: 'group-a',
                workspaceId: 'workspace_default',
              },
            },
          },
        },
        rect: { current: { initial, translated: null } },
      } as never,
      activatorEvent: { target: null } as unknown as Event,
    })).toEqual(initial);
  });
});

describe('immutable Saved and Open Tabs drag ghosts', () => {
  const sourceRect = {
    left: 20,
    top: 30,
    width: 312,
    height: 88,
  };
  const previewItems = Object.freeze([
    Object.freeze({
      id: 'saved-link',
      title: 'Saved Link',
      domain: 'saved.example.test',
      itemType: 'link' as const,
    }),
    Object.freeze({
      id: 'saved-note',
      title: 'Saved note body',
      itemType: 'note' as const,
    }),
    Object.freeze({
      id: 'saved-link-2',
      title: 'Saved Link Two',
      domain: 'two.saved.example.test',
      itemType: 'link' as const,
    }),
    Object.freeze({
      id: 'saved-link-3',
      title: 'Saved Link Three',
      domain: 'three.saved.example.test',
      itemType: 'link' as const,
    }),
    Object.freeze({
      id: 'saved-link-4',
      title: 'Saved Link Four',
      domain: 'four.saved.example.test',
      itemType: 'link' as const,
    }),
  ]);

  it('uses one inert row-list template for single and multi-item Saved previews', async () => {
    await renderDragOverlay({
      payload: {
        kind: 'tab',
        groupId: 'group-a',
        tabId: 'saved-link',
        workspaceId: 'workspace_default',
      },
      target: null,
      marker: null,
      sourceRect,
      previewRect: sourceRect,
      previewLayout: { columns: 1, mode: 'details', rows: 1 },
      previewItems: previewItems.slice(0, 1),
    });

    expect(document.querySelectorAll('.manager-drag-overlay__row')).toHaveLength(1);
    expect(document.querySelector('.manager-drag-overlay__title')?.textContent)
      .toBe('Saved Link');
    expect(document.querySelector('.manager-drag-overlay__domain')?.textContent)
      .toBe('saved.example.test');
    expect(document.querySelector('.manager-drag-overlay__stack')).not.toBeNull();

    await renderDragOverlay({
      payload: {
        kind: 'tabs',
        refs: [
          { groupId: 'group-a', tabId: 'saved-link' },
          { groupId: 'group-a', tabId: 'saved-note' },
          { groupId: 'group-a', tabId: 'saved-link-2' },
          { groupId: 'group-a', tabId: 'saved-link-3' },
          { groupId: 'group-a', tabId: 'saved-link-4' },
        ],
        workspaceId: 'workspace_default',
      },
      target: {
        kind: 'new-session-insert',
        category: 'inbox',
        index: 1,
        workspaceId: 'workspace_default',
      },
      marker: { kind: 'group', index: 1 },
      sourceRect,
      previewRect: { ...sourceRect, height: 140 },
      previewLayout: { columns: 1, mode: 'details', rows: 5 },
      previewItems,
    });

    expect(document.querySelectorAll('.manager-drag-overlay__row')).toHaveLength(5);
    expect(Array.from(document.querySelectorAll('.manager-drag-overlay__title'))
      .map((element) => element.textContent)).toEqual([
      'Saved Link',
      'Saved note body',
      'Saved Link Two',
      'Saved Link Three',
      'Saved Link Four',
    ]);
    expect(document.querySelector('[data-preview-item-type="note"] .manager-drag-overlay__item-type')?.textContent)
      .toBe('Note');
    expect(document.querySelector('.manager-drag-overlay__preview')?.getAttribute('style'))
      .toContain('width: 312px');
    expect(document.querySelector('.manager-drag-overlay__preview')?.getAttribute('style'))
      .toContain('height: 140px');
    expect(document.querySelector('.manager-drag-overlay__preview')?.getAttribute('style'))
      .toContain('--drag-preview-rows: 5');
    expect(document.querySelector('.manager-drag-overlay__preview')?.getAttribute('style'))
      .toContain('--drag-preview-columns: 1');
    expect(document.querySelector('.manager-drag-overlay__count')).toBeNull();
    expect(document.querySelector('button, input, textarea, a, [role="button"]')).toBeNull();
  });

  it('renders all 128 legal items in the finite readable desktop envelope', async () => {
    const denseItems = Object.freeze(Array.from({ length: 128 }, (_, index) =>
      Object.freeze({
        id: `dense-${index}`,
        title: `Dense ${index + 1}`,
        domain: `dense-${index + 1}.example.test`,
        itemType: 'link' as const,
      })));
    await renderDragOverlay({
      payload: {
        kind: 'tabs',
        refs: denseItems.map((item) => ({
          groupId: 'group-a',
          tabId: item.id,
        })),
        workspaceId: 'workspace_default',
      },
      target: null,
      marker: null,
      sourceRect: { ...sourceRect, height: 32 },
      previewRect: { ...sourceRect, width: 952, height: 532 },
      previewLayout: { columns: 7, mode: 'details', rows: 19 },
      previewItems: denseItems,
    });

    const previewStyle = document.querySelector(
      '.manager-drag-overlay__preview',
    )?.getAttribute('style');
    expect(document.querySelectorAll('.manager-drag-overlay__row')).toHaveLength(128);
    expect(previewStyle).toContain('height: 532px');
    expect(previewStyle).toContain('--drag-preview-rows: 19');
    expect(previewStyle).toContain('--drag-preview-columns: 7');
    expect(Array.from(document.querySelectorAll('.manager-drag-overlay__title'))
      .map((element) => element.textContent)).toEqual(
      denseItems.map((item) => item.title),
    );
  });

  it('keeps Open Tabs snapshot references, content, and geometry across target changes', async () => {
    const style = document.createElement('style');
    style.textContent = overlayCssSource;
    document.head.append(style);
    await mountManagerLayout();

    await act(async () => {
      testHarness.dndOnDragStart?.({
        active: createOpenTabsPreviewDragActive(),
      });
    });
    const pickup = testHarness.overlayStates.at(-1)!;
    const pickupItems = pickup.previewItems;
    const pickupRect = pickup.previewRect;
    const pickupLayout = pickup.previewLayout;
    const pickupItemReferences = [...pickupItems];
    const pickupPreview = document.querySelector<HTMLElement>(
      '.manager-drag-overlay__preview',
    );

    expect(pickupItems).toEqual([
      {
        id: '2',
        title: 'Open Two',
        domain: 'two.example.test',
        itemType: 'link',
      },
      {
        id: '1',
        title: 'Untitled',
        domain: 'one.example.test',
        itemType: 'link',
      },
    ]);
    expect(Array.from(document.querySelectorAll('.manager-drag-overlay__title'))
      .map((element) => element.textContent)).toEqual(['Open Two', 'Untitled']);
    expect(Array.from(document.querySelectorAll('.manager-drag-overlay__domain'))
      .map((element) => element.textContent)).toEqual([
      'two.example.test',
      'one.example.test',
    ]);
    expect(pickupPreview?.style.width).toBe('312px');
    expect(pickupPreview?.style.height).toBe('88px');

    await act(async () => {
      testHarness.dndOnDragOver?.({
        over: {
          data: {
            current: {
              dnd: {
                targets: [{
                  kind: 'group-body',
                  groupId: 'group-existing',
                  workspaceId: 'workspace_default',
                }],
              },
            },
          },
        },
      });
    });
    const existingTarget = testHarness.overlayStates.at(-1)!;

    expect(existingTarget.previewItems).toBe(pickupItems);
    expect(existingTarget.previewRect).toBe(pickupRect);
    expect(existingTarget.previewLayout).toBe(pickupLayout);
    expect(existingTarget.previewItems[0]).toBe(pickupItemReferences[0]);
    expect(existingTarget.previewItems[1]).toBe(pickupItemReferences[1]);
    expect(document.querySelector<HTMLElement>('.manager-drag-overlay__preview')?.style)
      .toMatchObject({ width: '312px', height: '88px' });

    await act(async () => {
      testHarness.dndOnDragOver?.({
        over: {
          data: {
            current: {
              dnd: {
                targets: [{
                  kind: 'new-session-insert',
                  category: 'inbox',
                  index: 2,
                  workspaceId: 'workspace_default',
                }],
              },
            },
          },
        },
      });
    });
    const plusActive = testHarness.overlayStates.at(-1)!;
    const plusPreview = document.querySelector<HTMLElement>(
      '.manager-drag-overlay__preview',
    );

    expect(plusActive.previewItems).toBe(pickupItems);
    expect(plusActive.previewRect).toBe(pickupRect);
    expect(plusActive.previewLayout).toBe(pickupLayout);
    expect(plusActive.previewItems[0]).toBe(pickupItemReferences[0]);
    expect(plusActive.previewItems[1]).toBe(pickupItemReferences[1]);
    expect(Array.from(document.querySelectorAll('.manager-drag-overlay__title'))
      .map((element) => element.textContent)).toEqual(['Open Two', 'Untitled']);
    expect(plusPreview?.style.width).toBe('312px');
    expect(plusPreview?.style.height).toBe('88px');
    expect(Number.parseFloat(getComputedStyle(plusPreview!).opacity))
      .toBeGreaterThan(0);
    expect(Number.parseFloat(getComputedStyle(plusPreview!).opacity))
      .toBeLessThan(1);
    expect(getComputedStyle(plusPreview!).pointerEvents).toBe('none');
  });

  it('owns a pointer-transparent overlay layer above every Task 3 new-session target', async () => {
    await mountManagerLayout();

    expect(testHarness.dragOverlayProps).toEqual({
      className: 'manager-drag-overlay',
      style: { pointerEvents: 'none' },
      zIndex: 17,
    });
    const targetZIndexes = [
      ...shellCssSource.matchAll(
        /\.(?:new-session-gap-target(?!__)|session-board__empty-slot-target|session-board__empty-slot-plus)[^{]*\{[^}]*z-index:\s*(\d+)/g,
      ),
    ].map((match) => Number(match[1]));
    expect(targetZIndexes).not.toHaveLength(0);
    expect(testHarness.dragOverlayProps!.zIndex)
      .toBeGreaterThan(Math.max(...targetZIndexes));
    expect(getComputedStyle(document.querySelector<HTMLElement>(
      '.manager-drag-overlay',
    )!).pointerEvents).toBe('none');
  });

  it('keeps the delayed release tip pointer-transparent above the immutable ghost', () => {
    const tipRule = shellCssSource.match(
      /\.new-session-gap-target__release-tip,\s*\n\.new-session-gap-target__release-tip-measure\s*\{([^}]*)\}/,
    )?.[1] ?? '';
    const tipZIndex = Number.parseInt(
      tipRule.match(/z-index:\s*(\d+)/)?.[1] ?? '',
      10,
    );

    expect(tipRule).toContain('pointer-events: none');
    expect(tipZIndex).toBeGreaterThan(17);
  });

  it('positions the exact droppable without a transform so visual and measured rects match', () => {
    const targetRule = shellCssSource.match(
      /\.new-session-gap-target\s*\{([^}]*)\}/,
    )?.[1] ?? '';

    expect(targetRule).toContain('width: 20px');
    expect(targetRule).toContain('height: 20px');
    expect(targetRule).toContain('inset-inline-start: -18px');
    expect(targetRule).toContain('inset-block-start: calc(50% - 10px)');
    expect(targetRule).not.toContain('transform:');
  });
});

describe('geometry collision detector integration', () => {
  const workspaceId = 'workspace_default';
  const collisionRect = { left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 };
  const createDroppable = (id: string, target: DropTarget) => ({
    id,
    data: { current: { dnd: { targets: [target] } } },
  });

  function runDetector(
    droppableContainers: Array<{ id: string; data: unknown }>,
    droppableRects: Map<string, typeof collisionRect>,
    pointerCoordinates: { x: number; y: number } | null,
    payload: { kind: 'tabs'; refs: never[]; workspaceId: string }
      | { kind: 'group'; groupId: string; workspaceId: string } = {
        kind: 'tabs',
        refs: [],
        workspaceId,
      },
    lockedTargetRef = { current: null as DropTarget | null },
  ) {
    const detector = createGeometryCollisionDetection(lockedTargetRef);
    const collisions = detector({
      active: {
        data: {
          current: {
            dnd: {
              payload,
            },
          },
        },
      },
      pointerCoordinates,
      collisionRect,
      droppableRects,
      droppableContainers,
    } as never);
    return { collisions, lockedTargetRef };
  }

  it('requires real pointer coordinates for exact pluses but keeps ordinary keyboard fallback', () => {
    const ordinaryTarget: DropTarget = {
      kind: 'group-body',
      groupId: 'group',
      workspaceId,
    };
    const exactTarget: DropTarget = {
      kind: 'new-session-insert',
      category: 'inbox',
      index: 1,
      workspaceId,
    };
    const ordinary = createDroppable('ordinary', ordinaryTarget);
    const exact = createDroppable('exact', exactTarget);

    const result = runDetector(
      [ordinary, exact],
      new Map([
        ['ordinary', collisionRect],
        ['exact', collisionRect],
      ]),
      null,
    );

    expect(result.collisions[0]?.id).toBe('ordinary');
    expect(result.lockedTargetRef.current).toEqual(ordinaryTarget);
  });

  it('prioritizes a category in an overlapping rect and returns its original droppable', () => {
    const ordinary = createDroppable('ordinary', { kind: 'group-body', groupId: 'group', workspaceId });
    const categoryTarget: DropTarget = { kind: 'category-column', category: 'inbox', workspaceId };
    const category = createDroppable('category', categoryTarget);
    const rects = new Map([
      ['ordinary', collisionRect],
      ['category', collisionRect],
    ]);

    const { collisions, lockedTargetRef } = runDetector(
      [ordinary, category],
      rects,
      { x: 50, y: 50 },
      { kind: 'group', groupId: 'group', workspaceId },
    );

    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.id).toBe('category');
    expect(collisions[0]?.data?.droppableContainer).toBe(category);
    expect(lockedTargetRef.current).toEqual(categoryTarget);
  });

  it('resolves tab edge placement while preserving the original droppable id', () => {
    const tabTarget: DropTarget = {
      kind: 'tab-before',
      groupId: 'group',
      tabId: 'tab',
      index: 0,
      workspaceId,
    };
    const tabDroppable = createDroppable('tab-edge', tabTarget);
    const { collisions, lockedTargetRef } = runDetector(
      [tabDroppable],
      new Map([['tab-edge', collisionRect]]),
      { x: 50, y: 10 },
    );

    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.id).toBe('tab-edge');
    expect(collisions[0]?.data?.droppableContainer).toBe(tabDroppable);
    expect(lockedTargetRef.current).toEqual({ ...tabTarget, placement: 'before' });
  });

  it('selects only the explicit new-session target for saved tab payloads', () => {
    const newSessionTarget: DropTarget = {
      kind: 'new-session-insert',
      category: 'inbox',
      index: 1,
      workspaceId,
    };
    const newSession = createDroppable('new-session', newSessionTarget);
    const groupInsert = createDroppable('group-insert', {
      kind: 'group-insert',
      category: 'inbox',
      index: 1,
      workspaceId,
    });
    const categoryColumn = createDroppable('category-column', {
      kind: 'category-column',
      category: 'inbox',
      workspaceId,
    });
    const rects = new Map([
      ['new-session', collisionRect],
      ['group-insert', collisionRect],
      ['category-column', collisionRect],
    ]);

    const { collisions, lockedTargetRef } = runDetector(
      [groupInsert, categoryColumn, newSession],
      rects,
      { x: 50, y: 50 },
    );

    expect(collisions[0]?.id).toBe('new-session');
    expect(lockedTargetRef.current).toBeNull();
  });

  it('includes exact left and top edges while excluding exact right and bottom edges', () => {
    const exactTarget: DropTarget = {
      kind: 'new-session-insert',
      category: 'inbox',
      index: 1,
      workspaceId,
    };
    const exact = createDroppable('exact', exactTarget);
    const rects = new Map([['exact', collisionRect]]);

    expect(runDetector([exact], rects, { x: 0, y: 0 }).collisions[0]?.id)
      .toBe('exact');
    expect(runDetector([exact], rects, { x: 100, y: 50 }).collisions)
      .toEqual([]);
    expect(runDetector([exact], rects, { x: 50, y: 100 }).collisions)
      .toEqual([]);
  });

  it('activates an exact plus through the known 8px body-to-center path and clears the old lock', () => {
    const bodyTarget: DropTarget = {
      kind: 'group-body',
      groupId: 'last-session',
      workspaceId,
    };
    const exactTarget: DropTarget = {
      kind: 'new-session-insert',
      category: 'inbox',
      index: 2,
      workspaceId,
    };
    const body = createDroppable('last-session', bodyTarget);
    const plus = createDroppable('end-plus', exactTarget);
    const lockedTargetRef = { current: bodyTarget as DropTarget | null };
    const rects = new Map([
      ['last-session', {
        left: 0,
        right: 340,
        top: 0,
        bottom: 100,
        width: 340,
        height: 100,
      }],
      ['end-plus', {
        left: 338,
        right: 358,
        top: 40,
        bottom: 60,
        width: 20,
        height: 20,
      }],
    ]);

    const inside = runDetector(
      [body, plus],
      rects,
      { x: 348, y: 50 },
      undefined,
      lockedTargetRef,
    );

    expect(inside.collisions[0]?.id).toBe('end-plus');
    expect(inside.lockedTargetRef.current).toBeNull();
  });

  it('never chooses an exact plus by nearest distance and leaves it immediately', () => {
    const bodyTarget: DropTarget = {
      kind: 'group-body',
      groupId: 'last-session',
      workspaceId,
    };
    const exactTarget: DropTarget = {
      kind: 'new-session-insert',
      category: 'inbox',
      index: 2,
      workspaceId,
    };
    const body = createDroppable('last-session', bodyTarget);
    const plus = createDroppable('end-plus', exactTarget);
    const lockedTargetRef = { current: null as DropTarget | null };
    const rects = new Map([
      ['last-session', {
        left: 0,
        right: 340,
        top: 0,
        bottom: 100,
        width: 340,
        height: 100,
      }],
      ['end-plus', {
        left: 338,
        right: 358,
        top: 40,
        bottom: 60,
        width: 20,
        height: 20,
      }],
    ]);

    expect(runDetector(
      [body, plus],
      rects,
      { x: 348, y: 50 },
      undefined,
      lockedTargetRef,
    ).collisions[0]?.id).toBe('end-plus');

    const outside = runDetector(
      [body, plus],
      rects,
      { x: 359, y: 50 },
      undefined,
      lockedTargetRef,
    );
    expect(outside.collisions[0]?.id).toBe('last-session');
    expect(outside.lockedTargetRef.current).toEqual(bodyTarget);

    const plusOnlyOutside = runDetector(
      [plus],
      new Map([['end-plus', rects.get('end-plus')!]]),
      { x: 359, y: 50 },
    );
    expect(plusOnlyOutside.collisions).toEqual([]);
    expect(plusOnlyOutside.lockedTargetRef.current).toBeNull();
  });

  it('renders a session insertion marker for the explicit new-session target', () => {
    expect(markerForTarget({
      kind: 'new-session-insert',
      category: 'inbox',
      index: 2,
      workspaceId,
    })).toEqual({ kind: 'group', index: 2 });
  });
});

describe('category drag targets', () => {
  const categoryRect = { left: 100, right: 200, top: 20, bottom: 60 } as DOMRect;
  const workspaceId = 'workspace_default';
  const groupTarget = (groupId: string): DropTarget => ({ kind: 'group-body', groupId, workspaceId });
  const categoryTarget: DropTarget = { kind: 'category-column', category: 'inbox', workspaceId };
  const candidate = (id: string, target: DropTarget, distance: number): GeometryCandidate => ({
    container: { id } as never,
    target,
    distance,
  });

  it('only activates when the pointer is inside the category itself', () => {
    expect(isPointWithinRect({ x: 150, y: 40 }, categoryRect)).toBe(true);
    expect(isPointWithinRect({ x: 99, y: 40 }, categoryRect)).toBe(false);
  });

  it('uses browser-style half-open right and bottom rect boundaries', () => {
    expect(isPointWithinRect({ x: 100, y: 20 }, categoryRect)).toBe(true);
    expect(isPointWithinRect({ x: 199.999, y: 59.999 }, categoryRect)).toBe(true);
    expect(isPointWithinRect({ x: 200, y: 40 }, categoryRect)).toBe(false);
    expect(isPointWithinRect({ x: 150, y: 60 }, categoryRect)).toBe(false);
  });

  it('selects the nearest category before a nearer ordinary candidate', () => {
    const ordinary = candidate('ordinary', groupTarget('ordinary'), 2);
    const category = candidate('category', categoryTarget, 10);

    expect(getCollisionSelection({
      nearestCandidate: ordinary,
      categoryCandidate: category,
      lockedTarget: null,
      lockedCandidate: null,
    })).toEqual({ candidate: category, target: categoryTarget });
  });

  it('selects the nearest ordinary candidate when no category is under the pointer', () => {
    const nearest = candidate('nearest', groupTarget('nearest'), 2);
    const farther = candidate('farther', groupTarget('farther'), 10);

    expect(getCollisionSelection({
      nearestCandidate: nearest,
      categoryCandidate: null,
      lockedTarget: null,
      lockedCandidate: farther,
    })).toEqual({ candidate: nearest, target: nearest.target });
  });

  it('keeps a matching locked target inside the release margin', () => {
    const locked = candidate('locked', groupTarget('locked'), 8);
    const nearest = candidate('nearest', groupTarget('nearest'), 2);

    expect(getCollisionSelection({
      nearestCandidate: nearest,
      categoryCandidate: null,
      lockedTarget: locked.target,
      lockedCandidate: locked,
    })).toEqual({ candidate: locked, target: locked.target });
  });

  it('releases a matching locked target beyond the release margin', () => {
    const locked = candidate('locked', groupTarget('locked'), 13);
    const nearest = candidate('nearest', groupTarget('nearest'), 2);

    expect(getCollisionSelection({
      nearestCandidate: nearest,
      categoryCandidate: null,
      lockedTarget: locked.target,
      lockedCandidate: locked,
    })).toEqual({ candidate: nearest, target: nearest.target });
  });

  it('returns no selection when no candidate is available', () => {
    expect(getCollisionSelection({
      nearestCandidate: null,
      categoryCandidate: null,
      lockedTarget: null,
      lockedCandidate: null,
    })).toBeNull();
  });
});

describe('drag persistence feedback', () => {
  it('updates the pointer ref and wakes without rerendering coordinator children', async () => {
    const childStates: unknown[] = [];
    root = createRoot(container!);
    await act(async () => {
      root?.render(createElement(ManagerDndCoordinator, {
        activeWorkspaceId: 'workspace_default',
        selectedCategory: 'inbox',
        showBin: false,
        groups: [],
        runtime: {} as never,
        openTabsWorkflow: {
          commands: {
            completeDrop: testHarness.completeDrop,
          },
        } as never,
        applyDropIntent: async () => undefined,
        showSuccess: testHarness.showSuccess,
        showError: testHarness.showError,
        children: (state) => {
          childStates.push(state);
          return null;
        },
      }));
    });
    await act(async () => {
      testHarness.dndOnDragStart?.({
        active: createOpenTabsDragActive(),
        activatorEvent: new PointerEvent('pointerdown', {
          clientX: 140,
          clientY: 200,
        }),
      });
    });
    const stateAfterStart = childStates.at(-1);
    const renderCountAfterStart = childStates.length;
    testHarness.autoScrollWake.mockClear();

    await act(async () => {
      document.dispatchEvent(new PointerEvent('pointermove', {
        clientX: 492,
        clientY: 200,
      }));
    });

    expect(testHarness.autoScrollInput?.pointerRef?.current)
      .toEqual({ x: 492, y: 200 });
    expect(testHarness.autoScrollWake).toHaveBeenCalledTimes(1);
    expect(childStates).toHaveLength(renderCountAfterStart);
    expect(childStates.at(-1)).toBe(stateAfterStart);

    await act(async () => {
      testHarness.dndOnDragMove?.({
        delta: { x: 1_785, y: 0 },
      });
    });
    expect(testHarness.autoScrollInput?.pointerRef?.current)
      .toEqual({ x: 492, y: 200 });
    expect(childStates).toHaveLength(renderCountAfterStart);

    await act(async () => {
      testHarness.dndOnDragCancel?.({});
    });
    expect(testHarness.autoScrollInput?.pointerRef?.current).toBeNull();
  });

  it('registers the Workspace board and disables dnd-kit auto-scroll', async () => {
    await mountManagerLayout();

    expect(testHarness.autoScroll).toBe(false);
    expect(testHarness.autoScrollInput?.boardRef.current)
      .toBe(document.querySelector('.manager-board'));
  });

  it('tracks pointer origin plus current dnd-kit delta without accumulating moves', async () => {
    await mountManagerLayout();
    const active = createOpenTabsDragActive();

    await act(async () => {
      testHarness.dndOnDragStart?.({
        active,
        activatorEvent: new PointerEvent('pointerdown', {
          clientX: 140,
          clientY: 210,
        }),
      });
    });
    expect(testHarness.autoScrollInput).toMatchObject({
      active: true,
      pause: false,
    });
    expect(testHarness.autoScrollInput?.pointerRef.current)
      .toEqual({ x: 140, y: 210 });

    await act(async () => {
      testHarness.dndOnDragMove?.({ delta: { x: 24, y: -10 } });
    });
    expect(testHarness.autoScrollInput?.pointerRef.current)
      .toEqual({ x: 164, y: 200 });

    await act(async () => {
      testHarness.dndOnDragMove?.({ delta: { x: 30, y: 5 } });
    });
    expect(testHarness.autoScrollInput?.pointerRef.current)
      .toEqual({ x: 170, y: 215 });
  });

  it('keeps the native viewport pointer authoritative over scroll-compensated dnd-kit delta', async () => {
    await mountManagerLayout();
    const active = createOpenTabsDragActive();

    await act(async () => {
      testHarness.dndOnDragStart?.({
        active,
        activatorEvent: new PointerEvent('pointerdown', {
          clientX: 140,
          clientY: 200,
        }),
      });
    });
    await act(async () => {
      document.dispatchEvent(new PointerEvent('pointermove', {
        clientX: 492,
        clientY: 200,
      }));
      testHarness.dndOnDragMove?.({ delta: { x: 352, y: 0 } });
    });
    expect(testHarness.autoScrollInput?.pointerRef.current)
      .toEqual({ x: 492, y: 200 });

    await act(async () => {
      document.dispatchEvent(new PointerEvent('pointermove', {
        clientX: 108,
        clientY: 200,
      }));
      testHarness.dndOnDragMove?.({
        // dnd-kit includes Board scroll adjustment in this value.
        delta: { x: 1_785, y: 0 },
      });
    });

    expect(testHarness.autoScrollInput?.pointerRef.current)
      .toEqual({ x: 108, y: 200 });
  });

  it('uses native touch viewport coordinates after drag activation', async () => {
    await mountManagerLayout();
    const active = createOpenTabsDragActive();

    await act(async () => {
      testHarness.dndOnDragStart?.({
        active,
        activatorEvent: {
          changedTouches: [{ clientX: 72, clientY: 88 }],
          touches: [{ clientX: 72, clientY: 88 }],
        },
      });
    });
    const move = new Event('touchmove');
    Object.defineProperties(move, {
      changedTouches: {
        value: [{ clientX: 118, clientY: 96 }],
      },
      touches: {
        value: [{ clientX: 118, clientY: 96 }],
      },
    });
    await act(async () => {
      document.dispatchEvent(move);
      testHarness.dndOnDragMove?.({ delta: { x: 800, y: 0 } });
    });

    expect(testHarness.autoScrollInput?.pointerRef.current)
      .toEqual({ x: 118, y: 96 });
  });

  it('attaches one passive native listener only for an active pointer drag and cleans it up', async () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    await mountManagerLayout();
    const active = createOpenTabsDragActive();

    await act(async () => {
      testHarness.dndOnDragStart?.({
        active,
        activatorEvent: new KeyboardEvent('keydown', { key: ' ' }),
      });
    });
    expect(add.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(0);

    await act(async () => {
      testHarness.dndOnDragCancel?.({});
      testHarness.dndOnDragStart?.({
        active,
        activatorEvent: new PointerEvent('pointerdown', {
          clientX: 140,
          clientY: 200,
        }),
      });
    });
    expect(add.mock.calls.filter(([type]) => type === 'pointermove')).toEqual([
      ['pointermove', expect.any(Function), { passive: true }],
    ]);

    await act(async () => {
      testHarness.dndOnDragCancel?.({});
    });
    expect(remove.mock.calls.filter(([type]) => type === 'pointermove'))
      .toHaveLength(1);
  });

  it('keeps one native pointer listener through StrictMode and removes it on unmount', async () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    await mountManagerLayout(true);

    await act(async () => {
      testHarness.dndOnDragStart?.({
        active: createOpenTabsDragActive(),
        activatorEvent: new PointerEvent('pointerdown', {
          clientX: 140,
          clientY: 200,
        }),
      });
    });
    const nativeAdds = add.mock.calls.filter(
      ([type, , options]) => type === 'pointermove'
        && (options as AddEventListenerOptions | undefined)?.passive,
    );
    expect(nativeAdds).toHaveLength(1);

    await act(async () => root?.unmount());
    root = null;
    const nativeRemoves = remove.mock.calls.filter(
      ([type, listener]) => type === 'pointermove'
        && listener === nativeAdds[0]?.[1],
    );
    expect(nativeRemoves).toHaveLength(1);
  });

  it('uses the first changed touch as the native drag pointer', async () => {
    await mountManagerLayout();
    const active = createOpenTabsDragActive();

    await act(async () => {
      testHarness.dndOnDragStart?.({
        active,
        activatorEvent: {
          changedTouches: [{ clientX: 72, clientY: 88 }],
          touches: [{ clientX: 90, clientY: 96 }],
        },
      });
    });
    expect(testHarness.autoScrollInput?.pointerRef.current)
      .toEqual({ x: 72, y: 88 });
  });

  it('pauses on exact targets, resumes on leave, and remeasures after scrolling', async () => {
    await mountManagerLayout();
    const active = createOpenTabsDragActive();

    await act(async () => {
      testHarness.dndOnDragStart?.({
        active,
        activatorEvent: new MouseEvent('mousedown', {
          clientX: 490,
          clientY: 200,
        }),
      });
      testHarness.dndOnDragOver?.({ over: createNewSessionOver() });
    });
    expect(testHarness.autoScrollInput).toMatchObject({
      active: true,
      pause: true,
    });
    expect(testHarness.autoScrollInput?.pointerRef.current)
      .toEqual({ x: 490, y: 200 });

    await act(async () => {
      testHarness.dndOnDragOver?.({ over: null });
    });
    expect(testHarness.autoScrollInput?.pause).toBe(false);

    testHarness.autoScrollInput?.onScrolled?.();
    expect(testHarness.measureDroppableContainers)
      .toHaveBeenCalledWith(['drop-a', 'drop-b']);
  });

  it('clears pointer state on finish and source invalidation', async () => {
    await mountManagerLayout();
    const active = createOpenTabsDragActive();

    await act(async () => {
      testHarness.dndOnDragStart?.({
        active,
        activatorEvent: new PointerEvent('pointerdown', {
          clientX: 140,
          clientY: 210,
        }),
      });
      testHarness.dndOnDragCancel?.({});
    });
    expect(testHarness.autoScrollInput).toMatchObject({
      active: false,
    });
    expect(testHarness.autoScrollInput?.pointerRef.current).toBeNull();

    await act(async () => {
      testHarness.onOpenTabsSourceKeyChange?.('source-before-drag');
      testHarness.dndOnDragStart?.({
        active,
        activatorEvent: new PointerEvent('pointerdown', {
          clientX: 140,
          clientY: 210,
        }),
      });
      testHarness.onOpenTabsSourceKeyChange?.('source-after-drag');
    });
    expect(testHarness.autoScrollInput).toMatchObject({
      active: false,
    });
    expect(testHarness.autoScrollInput?.pointerRef.current).toBeNull();
  });

  it('shows success only after persistence resolves', async () => {
    let resolvePersistence: (() => void) | undefined;
    const apply = () => new Promise<void>((resolve) => { resolvePersistence = resolve; });
    const showSuccess = vi.fn();
    const showError = vi.fn();

    const result = persistDropWithFeedback(apply, showSuccess, showError);
    expect(showSuccess).not.toHaveBeenCalled();
    resolvePersistence?.();

    await expect(result).resolves.toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('Drop saved', 'Drop complete');
    expect(showError).not.toHaveBeenCalled();
  });

  it('shows error for synchronous persistence failure', async () => {
    const error = new Error('sync failure');
    const showSuccess = vi.fn();
    const showError = vi.fn();

    await expect(persistDropWithFeedback(() => { throw error; }, showSuccess, showError)).resolves.toBe(false);
    expect(showSuccess).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledTimes(1);
    expect(showError).toHaveBeenCalledWith('sync failure', 'Drop failed');
  });

  it('shows error for asynchronous persistence failure', async () => {
    const showSuccess = vi.fn();
    const showError = vi.fn();

    await expect(persistDropWithFeedback(
      () => Promise.reject(new Error('worker failure')),
      showSuccess,
      showError,
    )).resolves.toBe(false);
    expect(showSuccess).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledTimes(1);
    expect(showError).toHaveBeenCalledWith('worker failure', 'Drop failed');
  });

  it('does not complete the Open Tabs workflow when persistence fails', async () => {
    await mountManagerLayout();
    testHarness.state.applyDropIntent.mockRejectedValueOnce(new Error('persistence failed'));

    await act(async () => {
      testHarness.dndOnDragStart?.({ active: createOpenTabsDragActive() });
      await testHarness.dndOnDragEnd?.(createOpenTabsDragEndEvent());
    });

    expect(testHarness.completeDrop).not.toHaveBeenCalled();
    expect(testHarness.showError).toHaveBeenCalledWith('persistence failed', 'Drop failed');
  });

  it('completes the Open Tabs workflow when persistence succeeds', async () => {
    await mountManagerLayout();

    await act(async () => {
      testHarness.dndOnDragStart?.({ active: createOpenTabsDragActive() });
      await testHarness.dndOnDragEnd?.(createOpenTabsDragEndEvent());
    });

    expect(testHarness.completeDrop).toHaveBeenCalledTimes(1);
    expect(testHarness.state.applyDropIntent).toHaveBeenCalledTimes(1);
    expect(testHarness.showSuccess).toHaveBeenCalledWith('Drop saved', 'Drop complete');
  });

  it('announces exact activation immediately, clears on leave, and persists only on release', async () => {
    await mountManagerLayout();
    const exactOver = createNewSessionOver();

    await act(async () => {
      testHarness.dndOnDragStart?.({ active: createOpenTabsDragActive() });
      testHarness.dndOnDragOver?.({ over: exactOver });
    });

    const status = document.querySelector<HTMLElement>(
      '[data-dnd-release-announcement]',
    );
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.textContent).toBe('Release to create session');
    expect(testHarness.overlayStates.at(-1)?.target?.kind)
      .toBe('new-session-insert');
    expect(testHarness.state.applyDropIntent).not.toHaveBeenCalled();

    await act(async () => {
      testHarness.dndOnDragOver?.({ over: null });
    });
    expect(status?.textContent).toBe('');
    expect(testHarness.overlayStates.at(-1)?.target).toBeNull();
    expect(testHarness.state.applyDropIntent).not.toHaveBeenCalled();

    await act(async () => {
      testHarness.dndOnDragOver?.({ over: exactOver });
      await testHarness.dndOnDragEnd?.({
        active: createOpenTabsDragActive(),
        over: exactOver,
      });
    });

    expect(testHarness.state.applyDropIntent).toHaveBeenCalledTimes(1);
    expect(testHarness.completeDrop).toHaveBeenCalledTimes(1);
  });

  it('does not let an old ordinary lock mask a real exact plus during drag over', async () => {
    await mountManagerLayout();
    const active = createOpenTabsDragActive() as {
      data: { current: unknown };
    };
    const ordinaryTarget: DropTarget = {
      kind: 'group-body',
      groupId: 'target',
      workspaceId: 'workspace_default',
    };
    const ordinary = {
      id: 'group-target',
      data: { current: { dnd: { targets: [ordinaryTarget] } } },
    };
    const rect = {
      left: 0,
      right: 100,
      top: 0,
      bottom: 100,
      width: 100,
      height: 100,
    };

    testHarness.collisionDetection?.({
      active,
      pointerCoordinates: { x: 50, y: 50 },
      collisionRect: rect,
      droppableRects: new Map([['group-target', rect]]),
      droppableContainers: [ordinary],
    });

    await act(async () => {
      testHarness.dndOnDragStart?.({ active });
      testHarness.dndOnDragOver?.({ over: createNewSessionOver(2) });
    });

    expect(testHarness.overlayStates.at(-1)?.target).toEqual({
      kind: 'new-session-insert',
      category: 'inbox',
      index: 2,
      workspaceId: 'workspace_default',
    });
  });

  it('cancels a drag whose Open Tabs source changed before release', async () => {
    await mountManagerLayout();

    await act(async () => {
      testHarness.onOpenTabsSourceKeyChange?.('source-before-drag');
      testHarness.dndOnDragStart?.({ active: createOpenTabsDragActive() });
      testHarness.onOpenTabsSourceKeyChange?.('source-after-drag');
      await testHarness.dndOnDragEnd?.(createOpenTabsDragEndEvent());
    });

    expect(testHarness.state.applyDropIntent).not.toHaveBeenCalled();
    expect(testHarness.showSuccess).not.toHaveBeenCalled();
  });
});

describe('workspace deletion filters', () => {
  it('clears the selected category and all category UI modes', () => {
    expect(getWorkspaceFiltersAfterDelete()).toEqual({
      category: 'inbox',
      showBin: false,
    });
  });

  it('never syncs a deleted page Workspace back into the store', () => {
    expect(shouldSyncActiveWorkspace(
      'workspace-deleted',
      'workspace-replacement',
      [{ id: 'workspace-replacement' }],
    )).toBe(false);
    expect(shouldSyncActiveWorkspace(
      'workspace-replacement',
      'workspace-other',
      [{ id: 'workspace-replacement' }, { id: 'workspace-other' }],
    )).toBe(true);
    expect(shouldSyncActiveWorkspace(
      'workspace-replacement',
      'workspace-replacement',
      [{ id: 'workspace-replacement' }],
    )).toBe(false);
  });
});

describe('Task106 manager shell contracts', () => {
  it('does not wire the removed keyboard shortcuts action or modal', () => {
    expect(source).not.toContain('KeyboardShortcutsHelp');
    expect(source).not.toContain('shortcutsOpened');
    expect(source).not.toContain('onOpenShortcuts');
  });
});

describe('Task108 target reveal contracts', () => {
  it('retries a missed lookup after the target filter renders without a delay poll', () => {
    expect(source).toContain('const [pendingTargetGroupId, setPendingTargetGroupId] = useState<string | null>(null);');
    expect(source).toContain('setPendingTargetGroupId(targetGroupId);');
    expect(source).toContain('if (!element) return;');
    expect(source).toContain('pendingTargetFilterSnapshot');
    expect(source).toContain('tabFilterUrl');
    expect(source).toContain('}, [');
    expect(source).toContain("params.delete('targetGroupId')");
    expect(source).toContain('window.history.replaceState');
    expect(source).toContain('clearTimeout(highlightTimeoutRef.current)');
    expect(source).not.toContain('}, 100);');
  });

  it('clears persisted search only when accepting a valid target group', () => {
    expect(source).toContain('useManagerPageState');
    const targetStart = source.indexOf('const targetGroupId =');
    const targetEnd = source.indexOf('const savedCount =', targetStart);
    const targetHandling = source.slice(targetStart, targetEnd);
    const validTargetIndex = targetHandling.indexOf('if (targetGroup');
    const clearSearchIndex = targetHandling.indexOf("pageState.setQuery('');");
    expect(validTargetIndex).toBeGreaterThanOrEqual(0);
    expect(clearSearchIndex).toBeGreaterThan(validTargetIndex);
    expect([...source.matchAll(/pageState\.setQuery\(''\)/g)]).toHaveLength(1);
  });
});

describe('Task174 capture selection ownership contracts', () => {
  it('guards category/filter reset and pending reveal after capture toast', () => {
    const handlerStart = source.indexOf('const handleCaptureCompleted');
    const toastIndex = source.indexOf('showSuccess(', handlerStart);
    const selectionGuardIndex = source.indexOf('if (!detail.selectionCurrent) return;', toastIndex);
    const filterOwnershipIndex = source.indexOf('if (!detail.filterCurrent) return;', selectionGuardIndex);
    const resetIndices = [
      source.indexOf("pageState.replace({ category: 'inbox', view: 'board' });", selectionGuardIndex),
    ];
    const pendingTargetIndices = [
      source.indexOf('setPendingTargetWorkspaceId(detail.sourceWorkspaceId);', selectionGuardIndex),
      source.indexOf('setPendingTargetGroupId(createdGroupId);', selectionGuardIndex),
      source.indexOf('setPendingTargetCategorySnapshot(detail.targetCategorySnapshot);', selectionGuardIndex),
      source.indexOf('setPendingTargetFilterSnapshot(detail.targetFilterSnapshot);', selectionGuardIndex),
    ];

    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(toastIndex).toBeGreaterThan(handlerStart);
    expect(selectionGuardIndex).toBeGreaterThan(toastIndex);
    expect(filterOwnershipIndex).toBeGreaterThan(selectionGuardIndex);
    resetIndices.forEach((index) => expect(index).toBeGreaterThan(selectionGuardIndex));
    pendingTargetIndices.forEach((index) => expect(index).toBeGreaterThan(selectionGuardIndex));
  });
});

describe('Task110 capture category race contracts', () => {
  it('checks capture-start category before resetting category or revealing', () => {
    expect(source).toContain('sameCaptureCategorySnapshot');
    expect(source).toContain('if (!detail.filterCurrent) return;');
    expect(source).toContain('const currentCategorySnapshot = useMemo<CaptureCategorySnapshot>');
    expect(source).toContain('currentCategorySnapshotRef.current');
    const categoryGuardIndex = source.indexOf('sameCaptureCategorySnapshot(');
    const filterGuardIndex = source.indexOf('if (!detail.filterCurrent) return;');
    const resetIndex = source.indexOf("pageState.replace({ category: 'inbox', view: 'board' });", categoryGuardIndex);
    expect(categoryGuardIndex).toBeGreaterThanOrEqual(0);
    expect(filterGuardIndex).toBeGreaterThanOrEqual(0);
    expect(resetIndex).toBeGreaterThan(categoryGuardIndex);
    expect(resetIndex).toBeGreaterThan(filterGuardIndex);
  });

  it('keeps runtime filter cleanup behind category ownership', () => {
    expect(runtimeSource).toContain('categoryCurrent');
    expect(runtimeSource).toContain('filterCurrent');
    expect(runtimeSource).toContain('if (canReveal && result) {');
    expect(runtimeSource).toContain("dispatch({ type: 'tab-filter-changed', url: null });");
  });

  it('resets the saved search owner before publishing the target filter snapshot for a non-matching group', () => {
    const nonMatchingBranchStart = runtimeSource.indexOf(`if (
          currentFilterSnapshot.searchQuery === captureFilterSnapshot.searchQuery
          && captureFilterSnapshot.searchQuery
          && createdGroup
          && !groupMatchesQuery(createdGroup, captureFilterSnapshot.searchQuery)
        ) {`);
    const savedSearchResetIndex = runtimeSource.indexOf("setSavedSearchQuery('');", nonMatchingBranchStart);
    const targetFilterSnapshotIndex = runtimeSource.indexOf('const targetFilterSnapshot', nonMatchingBranchStart);
    const ownerSnapshotIndex = runtimeSource.indexOf(
      'searchQuery: savedSearchQueryStore.getSnapshot(),',
      targetFilterSnapshotIndex,
    );

    expect(nonMatchingBranchStart).toBeGreaterThanOrEqual(0);
    expect(savedSearchResetIndex).toBeGreaterThan(nonMatchingBranchStart);
    expect(savedSearchResetIndex).toBeLessThan(targetFilterSnapshotIndex);
    expect(ownerSnapshotIndex).toBeGreaterThan(targetFilterSnapshotIndex);
  });

  it('rechecks pending target ownership and clears stale targets when view changes', () => {
    expect(source).toContain('pendingTargetCategorySnapshot');
    expect(source).toContain('pendingTargetFilterSnapshot');
    expect(source).toContain('shouldKeepPendingCaptureTarget');
    expect(source).toContain('targetGroupExists');
    expect(source).toContain('setPendingTargetCategorySnapshot(null);');
    expect(source).toContain('setPendingTargetFilterSnapshot(null);');
    expect(source).toContain('searchQuery,');
  });

  it('stores independent highlight ownership before clearing a revealed target', () => {
    const revealIndex = source.indexOf('setHighlightedGroupId(pendingTargetGroupId);');
    const ownershipStateIndex = source.indexOf('highlightOwnership');
    const ownershipIndex = source.indexOf('setHighlightOwnership({', revealIndex);
    const pendingClearIndex = source.indexOf('clearPendingTarget();', ownershipIndex);
    const ownershipBlock = source.slice(ownershipIndex, pendingClearIndex);

    expect(source).toMatch(/const \[highlightOwnership,\s*setHighlightOwnership\]\s*=\s*useState<[^;]+>\(null\);/);
    expect(ownershipStateIndex).toBeGreaterThanOrEqual(0);
    expect(revealIndex).toBeGreaterThanOrEqual(0);
    expect(ownershipStateIndex).toBeLessThan(revealIndex);
    expect(ownershipIndex).toBeGreaterThan(revealIndex);
    expect(ownershipBlock).toMatch(/groupId:\s*pendingTargetGroupId/);
    expect(ownershipBlock).toMatch(/workspaceId:\s*pendingTargetWorkspaceId/);
    expect(ownershipBlock).toMatch(/categorySnapshot:\s*pendingTargetCategorySnapshot/);
    expect(ownershipBlock).toMatch(/filterSnapshot:\s*pendingTargetFilterSnapshot/);
    expect(pendingClearIndex).toBeGreaterThan(ownershipIndex);
  });

  it('uses rendered view snapshots when a URL target has no pending snapshots', () => {
    const ownershipIndex = source.indexOf('setHighlightOwnership({');
    const ownershipEnd = source.indexOf('});', ownershipIndex);
    const ownershipBlock = source.slice(ownershipIndex, ownershipEnd);

    expect(ownershipIndex).toBeGreaterThanOrEqual(0);
    expect(ownershipBlock).toMatch(/categorySnapshot:\s*pendingTargetCategorySnapshot\s*\?\?\s*currentCategorySnapshot/);
    expect(ownershipBlock).toMatch(/filterSnapshot:\s*pendingTargetFilterSnapshot\s*\?\?\s*\{\s*searchQuery,\s*tabFilterUrl\s*\}/s);
  });

  it('invalidates highlight ownership on view changes and clears it on timeout', () => {
    const invalidationMarker = source.search(/if\s*\(\s*!highlightOwnership\s*\)\s*(?:return;|\{\s*return;\s*\})/);
    const effectStart = source.lastIndexOf('useEffect', invalidationMarker);
    const effectEnd = source.indexOf('return { highlightedGroupId', invalidationMarker);
    const invalidationEffect = source.slice(effectStart, effectEnd);

    expect(invalidationMarker).toBeGreaterThanOrEqual(0);
    expect(invalidationEffect).toContain('activeWorkspaceId');
    expect(invalidationEffect).toMatch(/activeWorkspaceId\s*!==\s*highlightOwnership\.workspaceId|highlightOwnership\.workspaceId\s*!==\s*activeWorkspaceId/);
    expect(invalidationEffect).toContain('sameCaptureCategorySnapshot');
    expect(invalidationEffect).toContain('currentCategorySnapshot');
    expect(invalidationEffect).toContain('highlightOwnership.categorySnapshot');
    expect(invalidationEffect).toMatch(/sameCaptureCategorySnapshot\([\s\S]*highlightOwnership\.categorySnapshot[\s\S]*currentCategorySnapshot|sameCaptureCategorySnapshot\([\s\S]*currentCategorySnapshot[\s\S]*highlightOwnership\.categorySnapshot/);
    expect(invalidationEffect).toContain('sameCaptureFilterSnapshot');
    expect(invalidationEffect).toContain('highlightOwnership.filterSnapshot');
    expect(invalidationEffect).toMatch(/sameCaptureFilterSnapshot\([\s\S]*highlightOwnership\.filterSnapshot[\s\S]*searchQuery[\s\S]*tabFilterUrl|sameCaptureFilterSnapshot\([\s\S]*searchQuery[\s\S]*tabFilterUrl[\s\S]*highlightOwnership\.filterSnapshot/);
    expect(invalidationEffect).toContain('targetGroupExists');
    expect(invalidationEffect).toMatch(/!targetGroupExists/);
    expect(invalidationEffect).not.toContain('pendingTarget');
    expect(invalidationEffect).toContain('searchQuery');
    expect(invalidationEffect).toContain('tabFilterUrl');
    expect(invalidationEffect).toContain('selectedCategory');
    expect(invalidationEffect).toContain('showBin');
    expect(invalidationEffect).toContain('groups');
    const dependencyStart = invalidationEffect.lastIndexOf('}, [');
    const dependencies = invalidationEffect.slice(dependencyStart);
    for (const dependency of [
      'activeWorkspaceId',
      'selectedCategory',
      'showBin',
      'searchQuery',
      'tabFilterUrl',
      'groups',
      'highlightOwnership',
    ]) {
      expect(dependencies).toContain(dependency);
    }
    expect(invalidationEffect).toContain('clearCaptureHighlight();');
    const clearHelperStart = source.indexOf('const clearCaptureHighlight = useCallback(() => {');
    const clearHelperEnd = source.indexOf('}, []);', clearHelperStart);
    const clearHelper = source.slice(clearHelperStart, clearHelperEnd);
    expect(clearHelper).toContain('setHighlightedGroupId(null);');
    expect(clearHelper).toContain('setHighlightOwnership(null);');
    expect(clearHelper).toContain('clearTimeout(highlightTimeoutRef.current)');
    expect(clearHelper).toContain('highlightTimeoutRef.current = null;');

    const timeoutStart = source.indexOf('highlightTimeoutRef.current = setTimeout(() => {');
    const timeoutEnd = source.indexOf('}, 3000);', timeoutStart);
    const timeoutBody = source.slice(timeoutStart, timeoutEnd);
    const timeoutHighlightClearIndex = timeoutBody.indexOf('setHighlightedGroupId(null);');
    const timeoutOwnershipClearIndex = timeoutBody.indexOf('setHighlightOwnership(null);');
    const timeoutRefClearIndex = timeoutBody.indexOf('highlightTimeoutRef.current = null;');
    expect(timeoutHighlightClearIndex).toBeGreaterThanOrEqual(0);
    expect(timeoutOwnershipClearIndex).toBeGreaterThan(timeoutHighlightClearIndex);
    expect(timeoutRefClearIndex).toBeGreaterThan(timeoutOwnershipClearIndex);
  });
});
