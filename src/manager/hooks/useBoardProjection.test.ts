// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createEmptyState,
  type Folder,
  type Group,
  type TabBoardState,
  type Workspace,
} from '../../shared/model';
import { useTabBoardStore } from '../../shared/store/useTabBoardStore';
import type { BoardProjection } from '../core/selectors';
import { useBoardProjection } from './useBoardProjection';
import { savedSearchQueryStore } from './useSearchQuery';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const timestamp = '2026-01-01T00:00:00.000Z';

function workspace(id: string): Workspace {
  return { id, name: id, createdAt: timestamp, updatedAt: timestamp };
}

function folder(id: string, workspaceId: string, name = id): Folder {
  return {
    id,
    name,
    color: 'slate',
    workspaceId,
    collapsed: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function group(
  id: string,
  workspaceId: string,
  overrides: Partial<Group> = {},
): Group {
  return {
    id,
    title: id,
    note: '',
    workspaceId,
    folderId: null,
    locked: false,
    starred: false,
    archived: false,
    collapsed: false,
    tabs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let observed: BoardProjection | null = null;
let forceRender: (() => void) | null = null;
let renderCount = 0;

function HookProbe() {
  const [, setRenderCount] = useState(0);
  forceRender = () => setRenderCount((count) => count + 1);
  observed = useBoardProjection('inbox');
  renderCount += 1;
  return null;
}

function setBoardState(state: TabBoardState): void {
  useTabBoardStore.setState(state);
}

beforeEach(() => {
  savedSearchQueryStore.set('');
  setBoardState(createEmptyState());
  observed = null;
  forceRender = null;
  renderCount = 0;
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  savedSearchQueryStore.set('');
  setBoardState(createEmptyState());
});

async function mountProbe(): Promise<void> {
  root = createRoot(container!);
  await act(async () => {
    root?.render(createElement(HookProbe));
  });
}

describe('useBoardProjection', () => {
  it('reuses the projection when state, category, and query survive a rerender', async () => {
    const state = createEmptyState();
    state.groups = [group('inbox', state.activeWorkspaceId)];
    setBoardState(state);
    await mountProbe();
    const firstProjection = observed;

    await act(async () => {
      forceRender?.();
    });

    expect(observed).toBe(firstProjection);
  });

  it('ignores folder updates outside the active workspace', async () => {
    const active = workspace('workspace-active');
    const other = workspace('workspace-other');
    const activeFolder = folder('folder-active', active.id);
    const otherFolder = folder('folder-other', other.id);
    const state = {
      ...createEmptyState(),
      workspaces: [active, other],
      activeWorkspaceId: active.id,
      folders: [activeFolder, otherFolder],
      groups: [group('inbox', active.id)],
    };
    setBoardState(state);
    await mountProbe();
    const firstProjection = observed;
    const firstRenderCount = renderCount;

    await act(async () => {
      useTabBoardStore.setState({
        folders: [activeFolder, { ...otherFolder, name: 'Renamed elsewhere' }],
      });
    });

    expect(renderCount).toBe(firstRenderCount);
    expect(observed).toBe(firstProjection);
  });

  it('keeps canonical category groups stable when only the query changes', async () => {
    const state = createEmptyState();
    const matching = group('matching', state.activeWorkspaceId, {
      title: 'Needle',
    });
    const hidden = group('hidden', state.activeWorkspaceId);
    state.groups = [matching, hidden];
    setBoardState(state);
    await mountProbe();
    const categoryGroups = observed?.categoryGroups;

    await act(async () => {
      savedSearchQueryStore.set('needle');
    });

    expect(observed?.searchQuery).toBe('needle');
    expect(observed?.categoryGroups).toBe(categoryGroups);
    expect(observed?.visibleGroups).toEqual([matching]);
  });
});
