// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

type TestFolder = {
  id: string;
  name: string;
  workspaceId: string;
};

type TestGroup = {
  id: string;
  workspaceId: string;
  folderId: string | null;
  starred: boolean;
  archived: boolean;
};

type TestState = {
  activeWorkspaceId: string;
  groups: readonly TestGroup[];
  folders: readonly TestFolder[];
};

interface TestStore {
  <T>(selector: (state: TestState) => T): T;
  setState(partial: Partial<TestState>): void;
}

const testHarness = vi.hoisted(() => ({
  store: null as TestStore | null,
  groups: [] as readonly TestGroup[],
  sessionCardRenderCount: 0,
}));

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
  workspaceId: 'workspace-current',
  folderId: currentFolder.id,
  starred: false,
  archived: false,
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
  useDroppable: () => ({ setNodeRef: () => undefined }),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children?: ReactNode }) => children,
  rectSortingStrategy: () => undefined,
}));

vi.mock('../sessions/SessionCard', () => ({
  SessionCard: () => {
    testHarness.sessionCardRenderCount += 1;
    return null;
  },
}));

vi.mock('../../../shared/store/useTabBoardStore', () => ({
  useTabBoardStore: <T,>(selector: (state: TestState) => T): T => {
    if (!testHarness.store) throw new Error('Test store is not initialized.');
    return testHarness.store(selector);
  },
}));

vi.mock('../../hooks/useFilteredGroups', () => ({
  useFilteredGroups: () => testHarness.groups,
  useSearchQuery: () => '',
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function createTestStore(): TestStore {
  return create<TestState>(() => ({
    activeWorkspaceId: currentFolder.workspaceId,
    groups: [group],
    folders: [currentFolder, otherFolder],
  }));
}

async function mountWorkspaceContent(): Promise<TestStore> {
  const store = createTestStore();
  testHarness.store = store;
  testHarness.groups = [group];
  const { WorkspaceContent } = await import('./WorkspaceContent');
  root = createRoot(container!);
  await act(async () => {
    root?.render(createElement(WorkspaceContent, {
      category: `folder:${currentFolder.id}`,
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
  container = document.createElement('div');
  document.body.append(container);
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

    const renamedRenderCount = testHarness.sessionCardRenderCount;
    await act(async () => {
      store.setState({ folders: [otherFolder] });
    });

    expect(boardLabel()).toBe('Workspace Category sessions');
    expect(testHarness.sessionCardRenderCount).toBeGreaterThan(renamedRenderCount);
  });
});
