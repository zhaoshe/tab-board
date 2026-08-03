// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import type { DragMarker, DragPayload } from '../../core/dnd';
import { savedSearchQueryStore } from '../../hooks/useSearchQuery';
import { getSessionCardDragMarker } from './WorkspaceContent';

type TestTab = {
  id: string;
  itemType: 'link';
  title: string;
  url: string;
  favIconUrl: string;
  note: string;
  pinned: boolean;
  incognito: boolean;
  starred: boolean;
  taskStatus: 'none';
  browserGroup: null;
  sourceWindowId: null;
  sourceTabId: null;
  createdAt: string;
  updatedAt: string;
};

type TestFolder = {
  id: string;
  name: string;
  workspaceId: string;
};

type TestGroup = {
  id: string;
  title: string;
  note: string;
  workspaceId: string;
  folderId: string | null;
  locked: boolean;
  starred: boolean;
  archived: boolean;
  collapsed: boolean;
  tabs: TestTab[];
  createdAt: string;
  updatedAt: string;
};

type TestState = {
  activeWorkspaceId: string;
  workspaces: readonly { id: string }[];
  groups: readonly TestGroup[];
  folders: readonly TestFolder[];
};

interface TestStore {
  <T>(selector: (state: TestState) => T): T;
  getState(): TestState;
  setState(partial: Partial<TestState>): void;
}

const testHarness = vi.hoisted(() => ({
  droppableTargets: [] as Array<{
    id: string;
    index: number;
    workspaceId: string;
  }>,
  sessionCards: [] as Array<{
    groupId: string;
    groupIndex: number;
  }>,
  newSessionTargets: new Map<string, {
    index: number;
    workspaceId: string;
  }>(),
  store: null as TestStore | null,
  sessionCardRenderCount: 0,
}));

const timestamp = '2026-01-01T00:00:00.000Z';

function testTab(id: string): TestTab {
  return {
    id,
    itemType: 'link',
    title: id,
    url: `https://${id}.example/`,
    favIconUrl: '',
    note: '',
    pinned: false,
    incognito: false,
    starred: false,
    taskStatus: 'none',
    browserGroup: null,
    sourceWindowId: null,
    sourceTabId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const currentFolder: TestFolder = {
  id: 'folder-current',
  name: 'Current folder',
  workspaceId: 'workspace-current',
};
const otherFolder: TestFolder = {
  id: 'folder-other',
  name: 'Other folder',
  workspaceId: 'workspace-other',
};
const group: TestGroup = {
  id: 'group-current',
  title: 'Current group',
  note: '',
  workspaceId: 'workspace-current',
  folderId: currentFolder.id,
  locked: false,
  starred: false,
  archived: false,
  collapsed: false,
  tabs: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};

vi.mock('@mantine/core', async () => {
  const { createElement } = await import('react');
  const NativeElement = ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    createElement('div', props, children)
  );
  return { Box: NativeElement, Text: NativeElement };
});

vi.mock('@dnd-kit/core', () => ({
  useDroppable: (options: {
    id: string;
    data: {
      dnd: {
        targets: Array<{
          kind: string;
          index: number;
          workspaceId: string;
        }>;
      };
    };
  }) => {
    const target = options.data.dnd.targets[0];
    testHarness.droppableTargets.push({
      id: options.id,
      index: target.index,
      workspaceId: target.workspaceId,
    });
    if (target.kind === 'new-session-insert') {
      testHarness.newSessionTargets.set(options.id, {
        index: target.index,
        workspaceId: target.workspaceId,
      });
    }
    return { setNodeRef: () => undefined };
  },
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children?: ReactNode }) => children,
  rectSortingStrategy: () => undefined,
  useSortable: (options: {
    data: {
      groupId: string;
      dnd: { groupIndex: number };
    };
  }) => {
    testHarness.sessionCards.push({
      groupId: options.data.groupId,
      groupIndex: options.data.dnd.groupIndex,
    });
    return {
      attributes: {},
      listeners: {},
      setNodeRef: () => undefined,
      setActivatorNodeRef: () => undefined,
      transform: null,
      transition: undefined,
      isDragging: false,
    };
  },
}));

vi.mock('../sessions/SessionCard', () => ({
  SessionCard: (props: {
    group: TestGroup;
  }) => {
    testHarness.sessionCardRenderCount += 1;
    void props.group;
    return null;
  },
}));

vi.mock('../../../shared/store/useTabBoardStore', () => ({
  useTabBoardStore: Object.assign(
    <T,>(selector: (state: TestState) => T): T => {
      if (!testHarness.store) throw new Error('Test store is not initialized.');
      return testHarness.store(selector);
    },
    {
      getState: (): TestState => {
        if (!testHarness.store) throw new Error('Test store is not initialized.');
        return testHarness.store.getState();
      },
    },
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function createTestStore(groups: readonly TestGroup[] = [group]): TestStore {
  return create<TestState>(() => ({
    activeWorkspaceId: currentFolder.workspaceId,
    workspaces: [{ id: currentFolder.workspaceId }, { id: otherFolder.workspaceId }],
    groups,
    folders: [currentFolder, otherFolder],
  }));
}

async function mountWorkspaceContent(input: {
  activeDragPayload?: DragPayload | null;
  activeDropTarget?: {
    kind: 'new-session-insert';
    category: 'inbox' | 'saved' | 'archive' | `folder:${string}`;
    index: number;
    workspaceId: string;
  } | null;
  category?: 'inbox' | 'saved' | 'archive' | `folder:${string}`;
  dragMarker?: DragMarker | null;
  groups?: readonly TestGroup[];
} = {}): Promise<TestStore> {
  const store = createTestStore(input.groups);
  testHarness.store = store;
  const { WorkspaceContent } = await import('./WorkspaceContent');
  root = createRoot(container!);
  await act(async () => {
    root?.render(createElement(WorkspaceContent, {
      category: input.category ?? `folder:${currentFolder.id}`,
      workspaceName: 'Workspace',
      runtime: {} as never,
      activeDragPayload: input.activeDragPayload ?? null,
      activeDropTarget: input.activeDropTarget ?? null,
      dragMarker: input.dragMarker ?? null,
      onOpenSessionTargetPicker: vi.fn(),
      selectionScope: {
        scope: null,
        commands: {
          enterOpenTabs: vi.fn(),
          enterSavedTabs: vi.fn(),
          exit: vi.fn(),
        },
        registerOpenTabsClear: vi.fn(() => () => undefined),
        registerSavedTabsClear: vi.fn(() => () => undefined),
      },
    }));
  });
  return store;
}

function boardLabel(): string {
  return document.querySelector<HTMLElement>('.manager-board')?.getAttribute('aria-label') || '';
}

beforeEach(() => {
  document.body.innerHTML = '';
  savedSearchQueryStore.set('');
  container = document.createElement('div');
  document.body.append(container);
  testHarness.droppableTargets = [];
  testHarness.sessionCards = [];
  testHarness.newSessionTargets = new Map();
  testHarness.store = null;
  testHarness.sessionCardRenderCount = 0;
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  savedSearchQueryStore.set('');
  vi.restoreAllMocks();
});

describe('WorkspaceContent folder selector updates', () => {
  it('ignores other-workspace folder renames without rerendering the board', async () => {
    const store = await mountWorkspaceContent();
    const initialRenderCount = testHarness.sessionCardRenderCount;

    await act(async () => {
      store.setState({
        folders: [currentFolder, { ...otherFolder, name: 'Updated elsewhere' }],
      });
    });

    expect(boardLabel()).toBe('Workspace Current folder sessions');
    expect(testHarness.sessionCardRenderCount).toBe(initialRenderCount);
  });

  it('updates the board title for current-folder rename and delete', async () => {
    const store = await mountWorkspaceContent();
    const initialRenderCount = testHarness.sessionCardRenderCount;

    await act(async () => {
      store.setState({
        folders: [{ ...currentFolder, name: 'Renamed folder' }, otherFolder],
      });
    });

    expect(boardLabel()).toBe('Workspace Renamed folder sessions');
    expect(testHarness.sessionCardRenderCount).toBeGreaterThan(initialRenderCount);

    await act(async () => {
      store.setState({ folders: [otherFolder] });
    });

    expect(boardLabel()).toBe('Workspace Category sessions');
  });
});

describe('WorkspaceContent drag marker scoping', () => {
  it('only passes a tab marker to its target session card', () => {
    const marker: DragMarker = {
      kind: 'tab',
      groupId: 'group-current',
      tabId: 'tab-current',
      placement: 'before',
    };

    expect(getSessionCardDragMarker(marker, 'group-current')).toBe(marker);
    expect(getSessionCardDragMarker(marker, 'group-other')).toBeNull();
    expect(getSessionCardDragMarker({ kind: 'group', index: 0 }, 'group-current')).toBeNull();
  });
});

describe('WorkspaceContent canonical board projection', () => {
  it.each([
    {
      kind: 'tab',
      groupId: 'source',
      tabId: 'tab-source',
      workspaceId: currentFolder.workspaceId,
    },
    {
      kind: 'tabs',
      refs: [{ groupId: 'source', tabId: 'tab-source' }],
      workspaceId: currentFolder.workspaceId,
    },
    {
      kind: 'open-tabs',
      tabIds: [1],
      windowId: 1,
      workspaceId: currentFolder.workspaceId,
    },
  ] satisfies DragPayload[])(
    'renders start, between, and canonical end anchors for $kind payloads',
    async (activeDragPayload) => {
      const groups = ['first', 'second', 'third'].map((id) => ({
        ...group,
        id,
        title: `${id} session`,
      }));

      await mountWorkspaceContent({ groups, activeDragPayload });

      expect([...testHarness.newSessionTargets.values()]).toEqual([0, 1, 2, 3].map((index) => ({
        index,
        workspaceId: currentFolder.workspaceId,
      })));
      expect(document.querySelectorAll('.new-session-gap-target')).toHaveLength(4);
    },
  );

  it('does not render new-session anchors for a whole-session drag', async () => {
    await mountWorkspaceContent({
      activeDragPayload: {
        kind: 'group',
        groupId: group.id,
        workspaceId: currentFolder.workspaceId,
      },
    });

    expect([...testHarness.newSessionTargets.values()]).toEqual([]);
    expect(document.querySelectorAll('.new-session-gap-target')).toHaveLength(0);
    expect(testHarness.droppableTargets.some(({ id }) =>
      id.startsWith('group-insert-'))).toBe(true);
  });

  it('suppresses every non-empty plus for exact Saved All Source Tabs while keeping Sessions', async () => {
    const source = {
      ...group,
      id: 'source',
      title: 'Source session',
      tabs: [testTab('source-a'), testTab('source-b')],
    };
    const target = {
      ...group,
      id: 'target',
      title: 'Existing target',
      tabs: [testTab('target-a')],
    };

    await mountWorkspaceContent({
      groups: [source, target],
      activeDragPayload: {
        kind: 'tabs',
        refs: source.tabs.map(({ id }) => ({ groupId: source.id, tabId: id })),
        workspaceId: currentFolder.workspaceId,
      },
    });

    expect([...testHarness.newSessionTargets.values()]).toEqual([]);
    expect(document.querySelectorAll('.new-session-gap-target')).toHaveLength(0);
    expect(document.querySelectorAll('.session-slot')).toHaveLength(2);
    expect(new Set(testHarness.sessionCards.map(({ groupId }) => groupId)))
      .toEqual(new Set(['source', 'target']));
  });

  it('keeps non-empty pluses for partial Saved Tabs and Open Tabs', async () => {
    const source = {
      ...group,
      id: 'source',
      tabs: [testTab('source-a'), testTab('source-b')],
    };

    await mountWorkspaceContent({
      groups: [source],
      activeDragPayload: {
        kind: 'tabs',
        refs: [{ groupId: source.id, tabId: 'source-a' }],
        workspaceId: currentFolder.workspaceId,
      },
    });
    expect([...testHarness.newSessionTargets.values()].map(({ index }) => index))
      .toEqual([0, 1]);

    await act(async () => root?.unmount());
    root = null;
    testHarness.droppableTargets = [];
    testHarness.newSessionTargets = new Map();
    await mountWorkspaceContent({
      groups: [source],
      activeDragPayload: {
        kind: 'open-tabs',
        tabIds: [1],
        windowId: 1,
        workspaceId: currentFolder.workspaceId,
      },
    });
    expect([...testHarness.newSessionTargets.values()].map(({ index }) => index))
      .toEqual([0, 1]);
  });

  it('keeps the full-height reorder marker inactive for tab-family targets', async () => {
    await mountWorkspaceContent({
      activeDragPayload: {
        kind: 'open-tabs',
        tabIds: [1],
        windowId: 1,
        workspaceId: currentFolder.workspaceId,
      },
      activeDropTarget: {
        kind: 'new-session-insert',
        category: `folder:${currentFolder.id}`,
        index: 0,
        workspaceId: currentFolder.workspaceId,
      },
      dragMarker: { kind: 'group', index: 0 },
    });

    expect(document.querySelector(
      '.new-session-gap-target[data-active="true"]',
    )).not.toBeNull();
    expect(document.querySelectorAll('.session-slot')).toHaveLength(1);
    expect(document.querySelectorAll(
      '.session-board__group-insert-target[data-over="true"]',
    )).toHaveLength(0);
  });

  it('uses unfiltered Inbox membership for orphan anchor indexes and the canonical end', async () => {
    const normal: TestGroup = {
      ...group,
      id: 'normal',
      title: 'Normal session',
      folderId: null,
    };
    const orphan: TestGroup = {
      ...group,
      id: 'orphan',
      title: 'Needle orphan session',
      folderId: 'missing-folder',
    };
    const hidden: TestGroup = {
      ...group,
      id: 'hidden',
      title: 'Hidden session',
      folderId: null,
    };
    savedSearchQueryStore.set('needle');

    await mountWorkspaceContent({
      activeDragPayload: {
        kind: 'open-tabs',
        tabIds: [1],
        windowId: 1,
        workspaceId: currentFolder.workspaceId,
      },
      category: 'inbox',
      groups: [normal, orphan, hidden],
    });

    expect(testHarness.sessionCards.length).toBeGreaterThan(0);
    expect(new Set(
      testHarness.sessionCards.map(({ groupId, groupIndex }) => `${groupId}:${groupIndex}`),
    )).toEqual(new Set(['orphan:1']));
    expect([...testHarness.newSessionTargets.values()]).toEqual([
      { index: 1, workspaceId: currentFolder.workspaceId },
      { index: 3, workspaceId: currentFolder.workspaceId },
    ]);
  });

  it.each([
    {
      kind: 'tab',
      groupId: 'source',
      tabId: 'tab-source',
      workspaceId: currentFolder.workspaceId,
    },
    {
      kind: 'tabs',
      refs: [{ groupId: 'source', tabId: 'tab-source' }],
      workspaceId: currentFolder.workspaceId,
    },
    {
      kind: 'open-tabs',
      tabIds: [1],
      windowId: 1,
      workspaceId: currentFolder.workspaceId,
    },
  ] satisfies DragPayload[])(
    'renders one full first-slot target for a canonical-empty category during a $kind drag',
    async (activeDragPayload) => {
      await mountWorkspaceContent({
        activeDragPayload,
        category: 'inbox',
        groups: [],
      });

      expect([...testHarness.newSessionTargets.values()]).toEqual([{
        index: 0,
        workspaceId: currentFolder.workspaceId,
      }]);
      expect(document.querySelectorAll('.session-board__empty-slot-target')).toHaveLength(1);
      expect(document.querySelectorAll('.session-board__empty-slot-plus')).toHaveLength(1);
      const primaryCopy = [...document.querySelectorAll<HTMLElement>('div')]
        .find((element) => element.textContent === 'No sessions here yet');
      expect(primaryCopy).toBeDefined();
      expect(primaryCopy?.getAttribute('mt')).toBe('24');
      expect(document.body.textContent).not.toContain('Release to create session');
    },
  );

  it('replaces only the canonical empty primary copy while its full-slot target is active', async () => {
    await mountWorkspaceContent({
      activeDragPayload: {
        kind: 'open-tabs',
        tabIds: [1],
        windowId: 1,
        workspaceId: currentFolder.workspaceId,
      },
      activeDropTarget: {
        kind: 'new-session-insert',
        category: 'inbox',
        index: 0,
        workspaceId: currentFolder.workspaceId,
      },
      category: 'inbox',
      groups: [],
    });

    expect(document.querySelector(
      '.session-board__empty-slot-target[data-active="true"]',
    )).not.toBeNull();
    expect(document.body.textContent).toContain('Release to create session');
    expect(document.body.textContent).not.toContain('No sessions here yet');
    expect(document.body.textContent).toContain('Save tabs from your browser to get started');
  });

  it('suppresses the canonical-empty full-slot target for exact Saved All Source Tabs', async () => {
    const source = {
      ...group,
      id: 'source',
      tabs: [testTab('source-a'), testTab('source-b')],
    };

    await mountWorkspaceContent({
      activeDragPayload: {
        kind: 'tabs',
        refs: source.tabs.map(({ id }) => ({ groupId: source.id, tabId: id })),
        workspaceId: currentFolder.workspaceId,
      },
      category: 'archive',
      groups: [source],
    });

    expect([...testHarness.newSessionTargets.values()]).toEqual([]);
    expect(document.querySelector('.session-board__empty-slot-target')).toBeNull();
    expect(document.body.textContent).toContain('No archived sessions yet');
  });

  it.each([
    ['saved', 'No saved sessions yet'],
    ['archive', 'No archived sessions yet'],
    [`folder:${currentFolder.id}`, 'This category is empty'],
  ] as const)(
    'preserves the %s empty-state copy when its first-slot target is at rest',
    async (category, expectedCopy) => {
      await mountWorkspaceContent({
        activeDragPayload: {
          kind: 'open-tabs',
          tabIds: [1],
          windowId: 1,
          workspaceId: currentFolder.workspaceId,
        },
        category,
        groups: [],
      });

      expect(document.body.textContent).toContain(expectedCopy);
      expect(document.body.textContent).not.toContain('No sessions here yet');
    },
  );

  it('does not register a full-slot target without an eligible active drag', async () => {
    await mountWorkspaceContent({
      category: 'inbox',
      groups: [],
    });

    expect([...testHarness.newSessionTargets.values()]).toEqual([]);
    expect(document.querySelector('.session-board__empty-slot-target')).toBeNull();
    const primaryCopy = [...document.querySelectorAll<HTMLElement>('div')]
      .find((element) => element.textContent === 'No sessions here yet');
    expect(primaryCopy).toBeDefined();
    expect(primaryCopy?.getAttribute('mt')).toBe('md');
  });

  it('keeps filtered-empty search UI and registers no empty full-slot target', async () => {
    savedSearchQueryStore.set('missing');

    await mountWorkspaceContent({
      activeDragPayload: {
        kind: 'open-tabs',
        tabIds: [1],
        windowId: 1,
        workspaceId: currentFolder.workspaceId,
      },
      category: 'inbox',
      groups: [{
        ...group,
        id: 'canonical-inbox',
        folderId: null,
      }],
    });

    expect([...testHarness.newSessionTargets.values()]).toEqual([]);
    expect(document.querySelector('.session-board__empty-slot-target')).toBeNull();
    expect(document.body.textContent).toContain('No results for "missing"');
    expect(document.body.textContent).not.toContain('No sessions here yet');
  });

  it('does not register a full-slot target when search is active over a canonical-empty category', async () => {
    savedSearchQueryStore.set('missing');

    await mountWorkspaceContent({
      activeDragPayload: {
        kind: 'open-tabs',
        tabIds: [1],
        windowId: 1,
        workspaceId: currentFolder.workspaceId,
      },
      category: 'inbox',
      groups: [],
    });

    expect([...testHarness.newSessionTargets.values()]).toEqual([]);
    expect(document.querySelector('.session-board__empty-slot-target')).toBeNull();
    expect(document.body.textContent).toContain('No results for "missing"');
  });
});
