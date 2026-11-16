// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyState, exportToJson, normalizeState } from '../../../shared/model';
import { restoreWorkerHarness } from '../../../shared/testing/restoreWorkerHarness';
import { STATE_KEY } from '../../../shared/model/constants';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

it('real ImportModal and navigation complete normally after the first committed worker reply is lost', async () => {
  vi.resetModules();
  const old = normalizeState({ ...createEmptyState(), mutationRevision: 7 });
  const workspace = { ...old.workspaces[0], id: 'restored-workspace', name: 'Restored' };
  const backup = normalizeState({ ...old, workspaces: [workspace], activeWorkspaceId: workspace.id });
  const harness = await restoreWorkerHarness(old);
  const { useTabBoardStore } = await import('../../../shared/store/useTabBoardStore');
  const { useManagerPageState } = await import('../../hooks/useManagerPageState');
  const { ImportModal } = await import('./ImportModal');
  await useTabBoardStore.getState().hydrate();
  history.replaceState(null, '', '/manager.html?workspace=workspace_default&view=bin');
  let closed = 0;
  function App() {
    const page = useManagerPageState();
    const [opened, setOpened] = useState(true);
    return createElement(MantineProvider, {}, createElement(ImportModal, { opened, onRestoreBackup: page.restoreBackup, onClose: () => { closed++; setOpened(false); } }));
  }
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(App)));
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, exportToJson(backup));
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 170)); });
    await act(async () => document.querySelector<HTMLInputElement>('input[value="restore"]')!.click());
    harness.dropReply();
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'Restore Backup')!.click());
    expect(closed).toBe(0);
    await act(async () => { await vi.waitFor(() => expect(closed).toBe(1)); });
    expect(location.search).toContain('workspace=restored-workspace');
    expect(location.search).toContain('view=board');
    expect(document.body.textContent).not.toContain('Import failed');
    expect(harness.data.tabboardBackupBeforeRestore).toEqual(old);
    expect(harness.writes.filter(items => STATE_KEY in items)).toHaveLength(1);
  } finally { await act(async () => root.unmount()); container.remove(); useTabBoardStore.getState().releaseHydration(); }
});
