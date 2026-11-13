// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyState, type Group, type TabBoardState, type TabItem } from '../../shared/model';
import { applyStateMutations, type StateMutation } from '../../shared/store/stateMutations';
import type { useTabBoardStore as Store } from '../../shared/store/useTabBoardStore';
import type { OpenTabsWorkflow } from './useOpenTabsRuntime';
import type { OpenWindowInfo } from '../../shared/openTabs';
import { canRevealCapture, getCaptureOutcome } from '../core/capture';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const timestamp = '2026-01-01T00:00:00.000Z';
const sourceTab = {
  id: 7, windowId: 1, title: 'Source', url: 'https://source.test', favIconUrl: '',
  pinned: true, index: 0, browserGroup: null, storable: true, reason: null,
};
const windows: OpenWindowInfo[] = [{ id: 1, focused: true, incognito: false, tabCount: 1, tabs: [sourceTab] }];
function savedTab(): TabItem {
  return {
    id: 'saved-tab', itemType: 'link', title: 'Saved', url: 'https://saved.test', favIconUrl: '',
    note: '', pinned: false, incognito: false, starred: false, taskStatus: 'none', browserGroup: null,
    sourceWindowId: null, sourceTabId: null, createdAt: timestamp, updatedAt: timestamp,
  };
}
function group(id: string, tabs: TabItem[] = []): Group {
  return {
    id, title: id, note: '', workspaceId: 'workspace_default', folderId: null, locked: false,
    starred: false, archived: false, collapsed: false, tabs, createdAt: timestamp, updatedAt: timestamp,
  };
}
function event() {
  const listeners = new Set<(...args: any[]) => void>();
  return {
    addListener: (listener: (...args: any[]) => void) => listeners.add(listener),
    removeListener: (listener: (...args: any[]) => void) => listeners.delete(listener),
  };
}
let store: typeof Store;
let root: Root | null = null;
let runtime: OpenTabsWorkflow;
let initial: TabBoardState;
let persisted: TabBoardState;
let readFailure = false;
let refreshFailure = false;
let captureIds = ['captured'];
let resolveMutation: ((response: unknown) => void) | undefined;
let wire: StateMutation[] = [];
let sendMessage: ReturnType<typeof vi.fn>;
let feedback: unknown[];
let unsubscribe: (() => void) | undefined;

beforeEach(async () => {
  vi.resetModules();
  initial = { ...createEmptyState(), groups: [group('existing', [savedTab()])] };
  persisted = initial;
  readFailure = false;
  refreshFailure = false;
  captureIds = ['captured'];
  resolveMutation = undefined;
  wire = [];
  const values: Record<string, unknown> = {};
  sendMessage = vi.fn(async (message: { type: string; mutations?: StateMutation[] }) => {
    if (message.type === 'tabboard-state-mutations') {
      wire = message.mutations!;
      return new Promise((resolve) => { resolveMutation = resolve; });
    }
    if (message.type === 'saveSelectedTabs') {
      persisted = { ...initial, groups: [group('captured'), ...initial.groups], mutationRevision: 8 };
      return { ok: true, result: { storedTabs: 1, storedGroups: 1, cleanedDuplicates: 0, createdGroupIds: captureIds } };
    }
    if (message.type === 'list-open-tabs') {
      if (refreshFailure) throw new Error('refresh failed');
      return { ok: true, result: { windows } };
    }
    throw new Error(`Unexpected message ${message.type}`);
  });
  vi.stubGlobal('chrome', {
    runtime: { sendMessage, getURL: (path: string) => `chrome-extension://tabboard/${path}` },
    storage: {
      local: {
        get: async (key: string) => {
          if (key === 'tabboardState') {
            if (readFailure) throw new Error('read failed');
            return { [key]: persisted };
          }
          return values;
        },
        set: async (next: Record<string, unknown>) => { Object.assign(values, next); },
      },
      onChanged: event(),
    },
    tabs: { onActivated: event(), onCreated: event(), onRemoved: event(), onMoved: event(), onAttached: event(), onDetached: event(), onReplaced: event(), onUpdated: event() },
    windows: { onCreated: event(), onRemoved: event(), onFocusChanged: event() },
  });
  ({ useTabBoardStore: store } = await import('../../shared/store/useTabBoardStore'));
  await store.getState().hydrate();
  feedback = [];
  const { applicationFeedbackChannel } = await import('../../shared/applicationFeedback');
  unsubscribe = applicationFeedbackChannel.subscribe((item) => feedback.push(item));
  const { useOpenTabsRuntime } = await import('./useOpenTabsRuntime');
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  function Probe() { runtime = useOpenTabsRuntime(); return null; }
  await act(async () => { root!.render(createElement(Probe)); });
  await vi.waitFor(() => expect(runtime.model.selectedWindowId).toBe(1));
  await act(async () => { runtime.commands.toggleSelection(sourceTab.id); });
  vi.useFakeTimers();
});

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  root = null;
  document.body.innerHTML = '';
  unsubscribe?.();
  store?.getState().releaseHydration();
  // Cancel the debounce through the existing context reset instead of waiting for an unresolved test RPC.
  vi.stubGlobal('chrome', {});
  store?.getState().updateSettings({ theme: 'system' });
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function capture(): Promise<Awaited<ReturnType<OpenTabsWorkflow['commands']['captureSelection']>>> {
  let completion: Awaited<ReturnType<OpenTabsWorkflow['commands']['captureSelection']>> = null;
  await act(async () => {
    completion = await runtime.commands.captureSelection(
      { showBin: false, category: 'inbox' },
      () => ({ showBin: false, category: 'inbox' }),
    );
  });
  return completion;
}

describe('capture through the real Zustand facade and Publication', () => {
  it('publishes capture before an unrelated RPC resolves while preserving optimistic order and checked deletion', async () => {
    await act(async () => {
      store.getState().updateGroup('existing', { title: 'optimistic' });
    });
    const checked = store.getState().deleteTabs([{ groupId: 'existing', tabId: 'saved-tab' }]);
    let settled = false;
    void checked.then(() => { settled = true; });
    await vi.waitFor(() => expect(resolveMutation).toBeDefined());
    await act(async () => { store.getState().updateGroup('existing', { note: 'later' }); });
    const wireBefore = JSON.stringify(wire);
    const completion = await capture();
    expect(completion).toMatchObject({ committed: true, reconciled: true });
    expect(canRevealCapture({ ...completion!, categoryCurrent: true })).toBe(true);
    expect(store.getState().groups.map(({ id }) => id)).toEqual(['captured', 'existing']);
    expect(store.getState().groups[1]).toMatchObject({ title: 'optimistic', note: 'later' });
    expect(store.getState().groups[1].tabs.map(({ id }) => id)).toEqual(['saved-tab']);
    expect(store.getState().bin).toEqual([]);
    expect(settled).toBe(false);
    expect(JSON.stringify(wire)).toBe(wireBefore);
    expect(runtime.model.selection.ids).toEqual([]);
    expect(sendMessage.mock.calls.find(([message]) => message.type === 'saveSelectedTabs')?.[0]).toMatchObject({ tabIds: [7], selectedWindowId: 1, workspaceId: 'workspace_default' });
    await act(async () => {
      resolveMutation!({ ok: true, result: applyStateMutations(initial, wire) });
      await checked;
    });
    expect(store.getState().groups[0].id).toBe('captured');
    expect(store.getState().groups[1].tabs).toEqual([]);
    expect(store.getState().bin).toHaveLength(1);
    expect(feedback).toEqual([]);
  });

  it.each(['read', 'missing-id', 'refresh', 'admission'] as const)('keeps committed-but-unreconciled and selection when %s fails', async (failure) => {
    if (failure === 'read') readFailure = true;
    if (failure === 'missing-id') captureIds = ['missing'];
    if (failure === 'refresh') refreshFailure = true;
    if (failure === 'admission') {
      await act(async () => { store.getState().updateGroup('existing', { title: 'edit' }); });
      initial = { ...initial, groups: [group('existing', [savedTab()])].map((item) => ({ ...item, locked: true })) };
    }
    const completion = await capture();
    expect(completion).toMatchObject({ committed: true, reconciled: false });
    expect(getCaptureOutcome(completion!).shouldReveal).toBe(false);
    expect(runtime.model.selection.ids).toEqual([7]);
    expect(feedback).toEqual([]);
    if (failure === 'refresh') expect(store.getState().groups[0].id).toBe('captured');
  });

  it('keeps empty created IDs successful without reveal', async () => {
    const other = { ...initial.workspaces[0], id: 'other' };
    initial = { ...initial, workspaces: [...initial.workspaces, other] };
    await act(async () => { store.setState({ ...initial, activeWorkspaceId: 'other' }); });
    captureIds = [];
    const completion = await capture();
    expect(completion).toMatchObject({ committed: true, reconciled: true, createdGroupIds: [] });
    expect(canRevealCapture({ ...completion!, categoryCurrent: true })).toBe(false);
    expect(store.getState().activeWorkspaceId).toBe('other');
    expect(store.getState().groups[0].id).toBe('captured');
    expect(feedback).toEqual([]);
  });

  it('admits capture in its source workspace while preserving later navigation and suppressing reveal', async () => {
    const other = { ...initial.workspaces[0], id: 'other' };
    initial = { ...initial, workspaces: [...initial.workspaces, other] };
    await act(async () => { store.setState(initial); });
    let completion: Awaited<ReturnType<OpenTabsWorkflow['commands']['captureSelection']>> = null;
    await act(async () => {
      const pending = runtime.commands.captureSelection(
        { showBin: false, category: 'inbox' },
        () => ({ showBin: false, category: 'inbox' }),
      );
      store.setState({ activeWorkspaceId: 'other' });
      completion = await pending;
    });
    expect(completion).toMatchObject({ committed: true, reconciled: true, sourceWorkspaceId: 'workspace_default', activeWorkspaceId: 'other', selectionCurrent: false });
    expect(canRevealCapture({ ...completion!, categoryCurrent: true })).toBe(false);
    expect(store.getState().groups[0]).toMatchObject({ id: 'captured', workspaceId: 'workspace_default' });
    expect(store.getState().activeWorkspaceId).toBe('other');
    expect(runtime.model.selection.ids).toEqual([7]);
    expect(feedback).toEqual([]);
  });

});
