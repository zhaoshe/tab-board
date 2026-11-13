// @vitest-environment happy-dom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTabBoardStore } from '../../shared/store/useTabBoardStore';
import type { TabBoardState } from '../../shared/model';
import { savedSearchQueryStore } from './useSearchQuery';
import {
  useManagerPageState,
  type ManagerPageStateController,
} from './useManagerPageState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const validationState = {
  activeWorkspaceId: 'workspace-a',
  workspaces: [
    { id: 'workspace-a', name: 'A', emoji: '🗂️', createdAt: '', updatedAt: '' },
    { id: 'workspace-b', name: 'B', emoji: '🗂️', createdAt: '', updatedAt: '' },
  ],
  folders: [],
  groups: [{
    id: 'saved-a',
    title: 'Saved A',
    note: '',
    workspaceId: 'workspace-a',
    folderId: null,
    locked: false,
    starred: true,
    archived: false,
    collapsed: false,
    tabs: [],
    createdAt: '',
    updatedAt: '',
  }],
  categoryOrderByWorkspace: {},
} as Pick<
  TabBoardState,
  'activeWorkspaceId' | 'workspaces' | 'folders' | 'groups' | 'categoryOrderByWorkspace'
>;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Probe({ onValue }: { onValue: (value: ManagerPageStateController) => void }) {
  const value = useManagerPageState();
  onValue(value);
  return null;
}

beforeEach(() => {
  useTabBoardStore.setState({ ...validationState, setActiveWorkspace: vi.fn((id: string) => useTabBoardStore.setState({ activeWorkspaceId: id })), restoreBackup: vi.fn() });
  history.replaceState(null, '', '/manager.html?workspace=workspace-b&category=saved&view=bin&q=url-query');
  sessionStorage.clear();
  localStorage.clear();
  savedSearchQueryStore.set('');
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  savedSearchQueryStore.set('');
  vi.restoreAllMocks();
});

describe('useManagerPageState', () => {
  it('restores URL state and uses push for navigation and replace for search', async () => {
    const observed: { current: ManagerPageStateController | null } = { current: null };
    const push = vi.spyOn(history, 'pushState');
    const replace = vi.spyOn(history, 'replaceState');
    root = createRoot(container!);
    await act(async () => {
      root?.render(createElement(Probe, { onValue: (value) => { observed.current = value; } }));
    });

    expect(observed.current?.state).toEqual({
      workspaceId: 'workspace-b',
      category: 'saved',
      view: 'bin',
      query: 'url-query',
    });
    expect(savedSearchQueryStore.getSnapshot()).toBe('url-query');

    await act(async () => observed.current?.navigate({ category: 'archive', view: 'board' }));
    expect(push).toHaveBeenCalled();
    expect(location.search).toContain('category=archive');
    expect(location.search).toContain('view=board');

    await act(async () => observed.current?.setQuery('updated'));
    expect(replace).toHaveBeenCalled();
    expect(location.search).toContain('q=updated');
  });

  it('pushes exactly one history entry for one atomic navigation under StrictMode', async () => {
    const observed: { current: ManagerPageStateController | null } = { current: null };
    const push = vi.spyOn(history, 'pushState');
    root = createRoot(container!);
    await act(async () => {
      root?.render(createElement(
        StrictMode,
        null,
        createElement(Probe, {
          onValue: (value) => {
            observed.current = value;
          },
        }),
      ));
    });
    push.mockClear();

    await act(async () => observed.current?.navigate({
      workspaceId: 'workspace-a',
      category: 'inbox',
      view: 'board',
    }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(location.search).toContain('workspace=workspace-a');
    expect(location.search).toContain('category=inbox');
  });

  it('restores state on popstate without pushing a new entry', async () => {
    const observed: { current: ManagerPageStateController | null } = { current: null };
    const push = vi.spyOn(history, 'pushState');
    root = createRoot(container!);
    await act(async () => {
      root?.render(createElement(Probe, { onValue: (value) => { observed.current = value; } }));
    });
    push.mockClear();

    history.replaceState(null, '', '/manager.html?workspace=workspace-a&category=inbox&view=board&q=back');
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')));

    expect(observed.current?.state).toEqual({
      workspaceId: 'workspace-a',
      category: 'inbox',
      view: 'board',
      query: 'back',
    });
    expect(savedSearchQueryStore.getSnapshot()).toBe('back');
    expect(push).not.toHaveBeenCalled();
  });

  it('uses the workspace preference for a bare URL but preserves explicit Inbox', async () => {
    localStorage.setItem('tabboard.managerCategoryPreference', JSON.stringify({
      version: 1,
      byWorkspace: { 'workspace-a': 'saved' },
    }));
    history.replaceState(null, '', '/manager.html');
    const observed: { current: ManagerPageStateController | null } = { current: null };
    root = createRoot(container!);
    await act(async () => {
      root?.render(createElement(Probe, { onValue: (value) => { observed.current = value; } }));
    });
    expect(observed.current?.state.category).toBe('saved');

    await act(async () => root?.unmount());
    root = null;
    history.replaceState(null, '', '/manager.html?category=inbox');
    root = createRoot(container!);
    await act(async () => {
      root?.render(createElement(Probe, { onValue: (value) => { observed.current = value; } }));
    });
    expect(observed.current?.state.category).toBe('inbox');
  });
  it('restores Bookmark on refresh and preserves it through history changes', async () => {
    const observed: { current: ManagerPageStateController | null } = { current: null };
    history.replaceState(null, '', '/manager.html?workspace=workspace-a&category=bookmarks&q=bookmark');
    root = createRoot(container!);
    await act(async () => root?.render(createElement(Probe, { onValue: value => { observed.current = value; } })));
    expect(observed.current!.state.category).toBe('bookmarks');
    await act(async () => root?.unmount());
    root = createRoot(container!);
    await act(async () => root?.render(createElement(Probe, { onValue: value => { observed.current = value; } })));
    expect(observed.current!.state.category).toBe('bookmarks');
    const push = vi.spyOn(history, 'pushState');
    for (const category of ['saved', 'bookmarks']) {
      history.replaceState(null, '', `/manager.html?workspace=workspace-a&category=${category}&q=bookmark`);
      await act(async () => window.dispatchEvent(new PopStateEvent('popstate')));
      expect(observed.current!.state.category).toBe(category);
    }
    expect(push).not.toHaveBeenCalled();
  });

  it('guards synchronous publication and uses fresh success/query/history while pending', async () => {
    const observed: { current: ManagerPageStateController | null } = { current: null };
    history.replaceState({ marker: 7 }, '', '/manager.html?workspace=workspace-b&category=saved&view=bin&q=url-query&other=keep#anchor');
    let finish!: () => void;
    const freshWorkspace = { ...validationState.workspaces[0], id: 'fresh' };
    const freshFolder = { id: 'fresh-folder', workspaceId: 'fresh', name: 'New', color: '', collapsed: false, createdAt: '', updatedAt: '' };
    localStorage.setItem('tabboard.managerCategoryPreference', JSON.stringify({ version: 1, byWorkspace: { fresh: 'folder:fresh-folder' } }));
    useTabBoardStore.setState({ restoreBackup: vi.fn(() => {
      useTabBoardStore.setState({ activeWorkspaceId: 'fresh', workspaces: [...validationState.workspaces, freshWorkspace], folders: [freshFolder] });
      return new Promise<void>(resolve => { finish = resolve; });
    }) });
    root = createRoot(container!);
    await act(async () => root?.render(createElement(Probe, { onValue: value => { observed.current = value; } })));
    const push = vi.spyOn(history, 'pushState');
    const replace = vi.spyOn(history, 'replaceState');
    let pending!: Promise<void>;
    await act(async () => { pending = observed.current!.restoreBackup('backup', 3); });
    expect(useTabBoardStore.getState().activeWorkspaceId).toBe('fresh');
    expect(location.search).toContain('workspace=workspace-b');
    await act(async () => { savedSearchQueryStore.set('latest query'); finish(); await pending; });
    expect(observed.current!.state).toEqual({ workspaceId: 'fresh', category: 'folder:fresh-folder', view: 'board', query: 'latest query' });
    expect(push).not.toHaveBeenCalled();
    expect(replace.mock.calls.every(call => String(call[2]).includes('workspace=fresh'))).toBe(true);
    expect(location.search).toContain('other=keep');
    expect(location.hash).toBe('#anchor');
    expect(history.state).toEqual({ marker: 7 });
    expect(JSON.parse(localStorage.getItem('tabboard.managerCategoryPreference')!).byWorkspace.fresh).toBe('folder:fresh-folder');
  });

  it.each(['mismatch', 'deleted', 'equal', 'sync-throw'])('immediately resumes %s reconciliation before the original restore rejection', async (scenario) => {
    const warning = scenario === 'sync-throw' ? vi.spyOn(console, 'warn').mockImplementation(() => undefined) : null;
    try {
      const observed: { current: ManagerPageStateController | null } = { current: null };
      let reject!: (error: unknown) => void;
      const original = new Error('restore failed');
      useTabBoardStore.setState({ restoreBackup: vi.fn(() => new Promise<void>((_, fail) => { reject = fail; })) });
      root = createRoot(container!);
      await act(async () => root?.render(createElement(Probe, { onValue: value => { observed.current = value; } })));
      const sync = vi.fn((id: string) => {
        if (scenario === 'sync-throw') throw new Error('secondary');
        useTabBoardStore.setState({ activeWorkspaceId: id, mutationRevision: 8 });
      });
      useTabBoardStore.setState({ setActiveWorkspace: sync });
      let result!: Promise<unknown>;
      await act(async () => {
        result = observed.current!.restoreBackup('backup', 3).catch(error => {
          expect(sync).toHaveBeenCalledTimes(scenario === 'mismatch' || scenario === 'sync-throw' ? 1 : 0);
          if (scenario === 'mismatch') expect(useTabBoardStore.getState().mutationRevision).toBe(8);
          return error;
        });
        useTabBoardStore.setState({ activeWorkspaceId: scenario === 'equal' ? 'workspace-b' : 'workspace-a', workspaces: scenario === 'deleted' ? [validationState.workspaces[0]] : validationState.workspaces });
      });
      expect(sync).not.toHaveBeenCalled();
      await act(async () => { reject(original); expect(await result).toBe(original); });
      if (warning) {
        expect(warning).toHaveBeenCalledExactlyOnceWith(
          '[tabboard:manager-navigation] Workspace reconciliation failed after restore', 'Error: secondary',
        );
      }
    } finally {
      warning?.mockRestore();
    }
  });

  it('reconciles synchronous parse failure and validates commands/popstate against current store', async () => {
    const observed: { current: ManagerPageStateController | null } = { current: null };
    root = createRoot(container!);
    await act(async () => root?.render(createElement(Probe, { onValue: value => { observed.current = value; } })));
    const original = new Error('parse');
    const sync = vi.fn((id: string) => useTabBoardStore.setState({ activeWorkspaceId: id }));
    useTabBoardStore.setState({ restoreBackup: () => { useTabBoardStore.setState({ activeWorkspaceId: 'workspace-a' }); throw original; }, setActiveWorkspace: sync });
    await act(async () => { await expect(observed.current!.restoreBackup('bad', 1)).rejects.toBe(original); });
    expect(sync).toHaveBeenCalledWith('workspace-b');
    const staleController = observed.current!;
    await act(async () => {
      useTabBoardStore.setState({ folders: [{ id: 'late', workspaceId: 'workspace-b', name: '', color: '', collapsed: false, createdAt: '', updatedAt: '' }] });
      staleController.navigate({ category: 'folder:late' });
      savedSearchQueryStore.set('queued');
      staleController.replace({ category: 'bookmarks' });
    });
    expect(observed.current!.state.category).toBe('bookmarks');
    expect(location.search).toContain('category=bookmarks');
    for (const category of ['folder:late', 'bookmarks', 'folder:missing']) {
      history.replaceState(null, '', `/manager.html?workspace=workspace-b&category=${category}&q=history`);
      await act(async () => window.dispatchEvent(new PopStateEvent('popstate')));
      expect(observed.current!.state.category).toBe(category === 'folder:missing' ? 'inbox' : category);
    }
  });

});
