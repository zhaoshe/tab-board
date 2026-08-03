// @vitest-environment happy-dom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { theme } from '../../shared/styles/theme';
import type { StorageStatusProjection } from '../../shared/store/settingsProjection';
import { DataStorageCard } from './DataStorageCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  status: {
    configuredTarget: 'browser',
    activeBackend: 'browser',
    folderName: null,
    fallbackReason: null,
    fileUpdatedAt: null,
  } as StorageStatusProjection,
  statusListener: null as null | ((status: StorageStatusProjection) => void),
  getActiveAdapter: vi.fn(),
  reconnectFolder: vi.fn(),
}));

vi.mock('../../shared/store/fsBootstrap', () => ({
  readStorageStatusProjection: vi.fn(async () => harness.status),
  subscribeStorageStatusProjection: vi.fn((
    callback: (status: StorageStatusProjection) => void,
  ) => {
    harness.statusListener = callback;
    return () => {
      if (harness.statusListener === callback) harness.statusListener = null;
    };
  }),
}));

vi.mock('../../shared/store/activeAdapter', () => ({
  getActiveAdapter: harness.getActiveAdapter,
  isWorkerModuleFallbackReason: (reason: string | null) =>
    reason === 'File storage error: document is not defined'
    || reason === 'File storage error: window is not defined',
  reconnectFolder: harness.reconnectFolder,
}));

vi.mock('./FolderPickerDialog', () => ({
  FolderPickerDialog: ({ opened }: { opened: boolean }) => (
    opened ? createElement('div', { 'data-folder-picker': true }) : null
  ),
}));
vi.mock('./DisconnectDialog', () => ({
  DisconnectDialog: ({ opened }: { opened: boolean }) => (
    opened ? createElement('div', { 'data-disconnect-dialog': true }) : null
  ),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mountCard({ strict = false }: { strict?: boolean } = {}): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const card = createElement(DataStorageCard);
  await act(async () => {
    root?.render(createElement(
      MantineProvider,
      { theme },
      strict ? createElement(StrictMode, null, card) : card,
    ));
  });
  await vi.waitFor(() => {
    expect(document.querySelector('[aria-label="Storage location"]')).not.toBeNull();
  });
}

beforeEach(() => {
  harness.status = {
    configuredTarget: 'browser',
    activeBackend: 'browser',
    folderName: null,
    fallbackReason: null,
    fileUpdatedAt: null,
  };
  harness.statusListener = null;
  harness.getActiveAdapter.mockReset();
  harness.getActiveAdapter.mockResolvedValue({});
  harness.reconnectFolder.mockReset();
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn(async () => ({ ok: true })) },
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('DataStorageCard status composition', () => {
  it('renders Browser storage without folder metadata or fallback actions', async () => {
    await mountCard();

    expect(document.body.textContent).toContain('Storage location');
    expect(document.body.textContent)
      .toContain('Choose where TabBoard saves session data.');
    expect(document.body.textContent).toContain('Browser storage');
    expect(document.body.textContent).not.toContain('Local folder name:');
    expect(document.body.textContent).not.toContain('Reconnect folder');
    expect(document.body.textContent).not.toContain('updated:');
  });

  it('renders configured Local Folder details and file freshness', async () => {
    harness.status = {
      configuredTarget: 'file',
      activeBackend: 'file',
      folderName: 'TabBoard',
      fallbackReason: null,
      fileUpdatedAt: '2026-07-31T09:10:11',
    };
    await mountCard();

    expect(document.body.textContent).toContain('Local folder name: TabBoard');
    expect(document.body.textContent).toContain('updated: 09:10:11');
    expect(document.body.textContent).toContain('Change folder');
    expect(document.body.textContent).toContain('Use browser storage');
    expect(document.body.textContent).not.toContain('Reconnect folder');
  });

  it('keeps Local Folder primary during fallback and offers both recovery paths', async () => {
    harness.status = {
      configuredTarget: 'file',
      activeBackend: 'browser',
      folderName: 'TabBoard',
      fallbackReason: 'Permission to access the storage folder was denied.',
      fileUpdatedAt: '2026-07-31T09:10:11',
    };
    await mountCard();

    expect(document.body.textContent).toContain('Local folder name: TabBoard');
    expect(document.body.textContent).toContain('updated: 09:10:11');
    expect(document.body.textContent)
      .toContain('New writes are temporarily stored in browser storage.');
    expect(document.body.textContent)
      .toContain('Permission to access the storage folder was denied.');
    expect(document.body.textContent).toContain('Reconnect folder');
    expect(document.body.textContent).toContain('Use browser storage');
  });

  it('updates from the persisted status subscription without reloading authority', async () => {
    await mountCard();
    await act(async () => {
      harness.statusListener?.({
        configuredTarget: 'file',
        activeBackend: 'file',
        folderName: 'TabBoard',
        fallbackReason: null,
        fileUpdatedAt: '2026-07-31T09:10:11',
      });
    });

    expect(document.body.textContent).toContain('Local folder name: TabBoard');
    expect(document.body.textContent).toContain('updated: 09:10:11');
  });

  it('recovers the persisted worker preload fallback when Options opens', async () => {
    harness.status = {
      configuredTarget: 'file',
      activeBackend: 'browser',
      folderName: 'TabBoard',
      fallbackReason: 'File storage error: document is not defined',
      fileUpdatedAt: '2026-07-31T09:10:11',
    };
    harness.getActiveAdapter.mockImplementation(async () => {
      harness.statusListener?.({
        configuredTarget: 'file',
        activeBackend: 'file',
        folderName: 'TabBoard',
        fallbackReason: null,
        fileUpdatedAt: '2026-07-31T09:10:11',
      });
      return {};
    });

    await mountCard({ strict: true });

    await vi.waitFor(() => {
      expect(harness.getActiveAdapter).toHaveBeenCalledTimes(1);
      expect(document.body.textContent).not.toContain('document is not defined');
      expect(document.body.textContent).not.toContain('Reconnect folder');
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'tabboard-storage-switched',
      });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  it('recovers the persisted worker dynamic-import fallback when Options opens', async () => {
    harness.status = {
      configuredTarget: 'file',
      activeBackend: 'browser',
      folderName: 'TabBoard',
      fallbackReason: 'File storage error: window is not defined',
      fileUpdatedAt: '2026-08-03T00:00:00',
    };
    harness.getActiveAdapter.mockImplementation(async () => {
      harness.statusListener?.({
        configuredTarget: 'file',
        activeBackend: 'file',
        folderName: 'TabBoard',
        fallbackReason: null,
        fileUpdatedAt: '2026-08-03T00:00:00',
      });
      return {};
    });

    await mountCard({ strict: true });

    await vi.waitFor(() => {
      expect(harness.getActiveAdapter).toHaveBeenCalledTimes(1);
      expect(document.body.textContent).not.toContain('window is not defined');
      expect(document.body.textContent).not.toContain('Reconnect folder');
    });
  });

  it('does not automatically retry an ordinary persisted permission fallback', async () => {
    harness.status = {
      configuredTarget: 'file',
      activeBackend: 'browser',
      folderName: 'TabBoard',
      fallbackReason: 'Permission to access the storage folder was denied.',
      fileUpdatedAt: '2026-07-31T09:10:11',
    };

    await mountCard();

    expect(harness.getActiveAdapter).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Reconnect folder');
  });

  it('shows an explicit progress label while reconnecting the folder', async () => {
    harness.status = {
      configuredTarget: 'file',
      activeBackend: 'browser',
      folderName: 'TabBoard',
      fallbackReason: 'Permission was denied.',
      fileUpdatedAt: '2026-07-31T09:10:11',
    };
    let resolvePicker!: (root: FileSystemDirectoryHandle) => void;
    vi.stubGlobal('showDirectoryPicker', vi.fn(() => new Promise((resolve) => {
      resolvePicker = resolve;
    })));
    await mountCard();
    const reconnect = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Reconnect folder');

    await act(async () => {
      reconnect?.click();
      await Promise.resolve();
    });

    expect(reconnect?.textContent).toContain('Reconnecting…');

    await act(async () => {
      resolvePicker({ name: 'TabBoard' } as FileSystemDirectoryHandle);
      await Promise.resolve();
    });
  });
});
