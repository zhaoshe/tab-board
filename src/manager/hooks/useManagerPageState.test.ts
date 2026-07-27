// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    { id: 'workspace-a', name: 'A', createdAt: '', updatedAt: '' },
    { id: 'workspace-b', name: 'B', createdAt: '', updatedAt: '' },
  ],
  folders: [],
} as Pick<TabBoardState, 'activeWorkspaceId' | 'workspaces' | 'folders'>;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Probe({ onValue }: { onValue: (value: ManagerPageStateController) => void }) {
  const value = useManagerPageState(validationState);
  onValue(value);
  return null;
}

beforeEach(() => {
  history.replaceState(null, '', '/manager.html?workspace=workspace-b&category=saved&view=bin&q=url-query');
  sessionStorage.clear();
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
});
