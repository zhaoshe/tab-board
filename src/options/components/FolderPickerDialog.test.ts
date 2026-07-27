import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  createEmptyState,
  createGroupFromTabRecords,
  createTabRecord,
  createWorkspace,
  normalizeState,
  type TabBoardState,
} from '../../shared/model';
import { createMemoryDirectory } from '../../shared/testing/memoryFs';
import { createFileStorageAdapter } from '../../shared/store/fileStorage';
import type { MemoryDirectoryHandle } from '../../shared/testing/memoryFs';
import { migrateToFile } from './FolderPickerDialog';

// ---------- chrome.storage.local mock (fileStorage adapter writes FILE_PING_KEY) ----------

interface ChromeMock {
  storage: {
    local: {
      data: Record<string, unknown>;
      set: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
    onChanged: {
      addListener: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
    };
  };
  runtime: {
    sendMessage: ReturnType<typeof vi.fn>;
  };
}

function makeChromeMock(): ChromeMock {
  return {
    storage: {
      local: {
        data: {},
        set: vi.fn(async () => {}),
        get: vi.fn(async () => ({})),
        remove: vi.fn(async () => {}),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    runtime: {
      sendMessage: vi.fn(async () => {}),
    },
  };
}

// ---------- helpers ----------

function browserStateWith(label: string, url: string): TabBoardState {
  const state = createEmptyState();
  const ws = state.workspaces[0];
  const tab = createTabRecord({ url, title: `browser-${label}` });
  const group = createGroupFromTabRecords([tab], { title: `Browser ${label}`, workspaceId: ws.id, folderId: null });
  state.groups.push(group);
  state.categoryOrderByWorkspace[ws.id] = [...(state.categoryOrderByWorkspace[ws.id] || []), group.id];
  return normalizeState(state);
}

async function writeStateToFolder(
  root: MemoryDirectoryHandle,
  state: TabBoardState,
): Promise<void> {
  const adapter = await createFileStorageAdapter(root as unknown as FileSystemDirectoryHandle);
  await adapter.setState(state);
}

describe('migrateToFile', () => {
  let chromeMock: ChromeMock;

  beforeEach(() => {
    chromeMock = makeChromeMock();
    vi.stubGlobal('chrome', chromeMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('use-file mode returns file state when folder has data', async () => {
    const root = createMemoryDirectory('test-root');
    const fileState = browserStateWith('file', 'https://example.com/file');
    await writeStateToFolder(root, fileState);

    const browserState = browserStateWith('browser', 'https://example.com/browser');
    const result = migrateToFile(
      root as unknown as FileSystemDirectoryHandle,
      'use-file',
      browserState,
      fileState,
    );
    // Should contain the file tab, not the browser tab.
    const urls = result.groups.flatMap((g) => g.tabs.map((t) => t.url ?? ''));
    expect(urls).toContain('https://example.com/file');
    expect(urls).not.toContain('https://example.com/browser');
    expect(result.groups.length).toBe(fileState.groups.length);
  });

  it('export-browser mode returns cloned browser state (ignores file state)', async () => {
    const root = createMemoryDirectory('test-root');
    const fileState = browserStateWith('file', 'https://example.com/file');
    await writeStateToFolder(root, fileState);

    const browserState = browserStateWith('browser', 'https://example.com/browser');
    const result = migrateToFile(
      root as unknown as FileSystemDirectoryHandle,
      'export-browser',
      browserState,
      fileState,
    );
    // Should contain the browser tab, not the file tab.
    const urls = result.groups.flatMap((g) => g.tabs.map((t) => t.url ?? ''));
    expect(urls).toContain('https://example.com/browser');
    expect(urls).not.toContain('https://example.com/file');
    expect(result.groups.length).toBe(browserState.groups.length);
  });

  it('merge mode combines both states', async () => {
    const root = createMemoryDirectory('test-root');
    const fileState = browserStateWith('file', 'https://example.com/file');
    await writeStateToFolder(root, fileState);

    const browserState = browserStateWith('browser', 'https://example.com/browser');
    const result = migrateToFile(
      root as unknown as FileSystemDirectoryHandle,
      'merge',
      browserState,
      fileState,
    );
    // Should contain both tabs (merge).
    const urls = new Set(result.groups.flatMap((g) => g.tabs.map((t) => t.url ?? '')));
    expect(urls.has('https://example.com/file')).toBe(true);
    expect(urls.has('https://example.com/browser')).toBe(true);
    // Result must be normalized.
    expect(result.version).toBeGreaterThan(0);
    expect(typeof result.mutationRevision).toBe('number');
  });

  it('use-file on an empty folder returns a normalized empty state', () => {
    const root = createMemoryDirectory('empty-root');
    const browserState = browserStateWith('browser', 'https://example.com/browser');
    const result = migrateToFile(
      root as unknown as FileSystemDirectoryHandle,
      'use-file',
      browserState,
      null,
    );
    // Should be a valid normalized state (has default workspace, etc.)
    expect(result.workspaces.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(result.groups)).toBe(true);
  });

  it('does not mutate the input states', async () => {
    const root = createMemoryDirectory('test-root');
    const fileState = browserStateWith('file', 'https://example.com/file');
    await writeStateToFolder(root, fileState);
    const browserState = browserStateWith('browser', 'https://example.com/browser');
    const browserGroupCountBefore = browserState.groups.length;
    const fileGroupCountBefore = fileState.groups.length;

    migrateToFile(
      root as unknown as FileSystemDirectoryHandle,
      'merge',
      browserState,
      fileState,
    );

    expect(browserState.groups.length).toBe(browserGroupCountBefore);
    expect(fileState.groups.length).toBe(fileGroupCountBefore);
  });
});

describe('folder migration copy', () => {
  it('states that folder data wins same-ID merge conflicts', async () => {
    const source = await import('node:fs/promises').then(({ readFile }) =>
      readFile(new URL('./FolderPickerDialog.tsx', import.meta.url), 'utf8'));

    expect(source).toContain('Folder data wins when the same item ID exists in both places.');
    expect(source).not.toContain('newer items win');
  });

  it('uses the contrast-safe primary action class', async () => {
    const source = await import('node:fs/promises').then(({ readFile }) =>
      readFile(new URL('./DataStorageCard.tsx', import.meta.url), 'utf8'));

    expect(source).toContain('className="options-action-primary"');
  });
});
