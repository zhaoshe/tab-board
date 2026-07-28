// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import type { DragMarker } from '../../core/dnd';
import { savedSearchQueryStore } from '../../hooks/useSearchQuery';
import { getSessionCardDragMarker } from './WorkspaceContent';

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
  tabs: never[];
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
  store: null as TestStore | null,
  sessionCardRenderCount: 0,
}));

const timestamp = '2026-01-01T00:00:00.000Z';

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

vi.mock('@tabler/icons-react', () => {
  const Icon = () => null;
  return {
    IconArchive: Icon,
    IconFolder: Icon,
    IconSearch: Icon,
    IconStar: Icon,
  };
});

vi.mock('@dnd-kit/core', () => ({
  useDroppable: (options: {
    id: string;
    data: {
      dnd: {
        targets: Array<{
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
  useTabBoardStore: <T,>(selector: (state: TestState) => T): T => {
    if (!testHarness.store) throw new Error('Test store is not initialized.');
    return testHarness.store(selector);
  },
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
  category?: 'inbox' | `folder:${string}`;
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
  it('uses unfiltered Inbox membership for orphan indexes and the end target', async () => {
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
      category: 'inbox',
      groups: [normal, orphan, hidden],
    });

    expect(testHarness.sessionCards.length).toBeGreaterThan(0);
    expect(new Set(
      testHarness.sessionCards.map(({ groupId, groupIndex }) => `${groupId}:${groupIndex}`),
    )).toEqual(new Set(['orphan:1']));
    expect(testHarness.droppableTargets).toContainEqual({
      id: `new-group-${currentFolder.workspaceId}-inbox`,
      index: 3,
      workspaceId: currentFolder.workspaceId,
    });
  });
});
