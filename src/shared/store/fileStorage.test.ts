import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOTSTRAP_KEY,
  FILE_PING_KEY,
  SETTINGS_PROJECTION_KEY,
} from '../model/constants';
import {
  createEmptyState,
  createGroupFromTabRecords,
  createTabRecord,
  normalizeState,
  type TabBoardState,
} from '../model';
import { createMemoryDirectory } from '../testing/memoryFs';
import type { MemoryDirectoryHandle, MemoryFileHandle } from '../testing/memoryFs';
import { createFileStorageAdapter, initFileStorageDirectory } from './fileStorage';
import type { AdapterInitError } from './storageAdapter';
import { atomicWriteFile, deleteSessionFile, readTextFile, writeSessionFile } from './fsAtomic';
import { projectionFromState } from './settingsProjection';

// ---------- chrome.storage.local mock ----------

interface ChromeMock {
  storage: {
    local: {
      data: Record<string, unknown>;
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
    onChanged: {
      addListener: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
    };
  };
}

function makeChromeMock(): ChromeMock {
  const data: Record<string, unknown> = {};
  return {
    storage: {
      local: {
        data,
        get: vi.fn(async (keys) => {
          if (keys == null) return { ...data };
          if (typeof keys === 'string') {
            return keys in data ? { [keys]: data[keys] } : {};
          }
          if (Array.isArray(keys)) {
            const out: Record<string, unknown> = {};
            for (const k of keys) if (k in data) out[k] = data[k];
            return out;
          }
          if (keys && typeof keys === 'object') {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(keys)) {
              out[k] = k in data ? data[k] : (keys as Record<string, unknown>)[k];
            }
            return out;
          }
          return {};
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(data, items);
        }),
        remove: vi.fn(async (_keys: string | string[]) => {
          const keys = Array.isArray(_keys) ? _keys : [_keys];
          for (const k of keys) delete data[k];
        }),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  };
}

function stubChrome(chromeMock: ChromeMock): void {
  vi.stubGlobal('chrome', chromeMock);
}

// ---------- helpers ----------

function knownState(seed?: Partial<TabBoardState>): TabBoardState {
  const base = createEmptyState();
  const ts = '2026-07-23T10:00:00.000Z';
  const group1 = createGroupFromTabRecords(
    [createTabRecord({ title: 'Example', url: 'https://example.com' } as chrome.tabs.Tab)],
    { title: 'Session One', workspaceId: base.activeWorkspaceId },
  );
  const group2 = createGroupFromTabRecords(
    [createTabRecord({ title: 'Tab 2', url: 'https://a.example' } as chrome.tabs.Tab)],
    { title: 'Session Two', workspaceId: base.activeWorkspaceId },
  );
  return normalizeState({
    ...base,
    mutationRevision: 7,
    groups: [group1, group2],
    categoryOrderByWorkspace: {
      [base.activeWorkspaceId]: [group1.id, group2.id],
    },
    createdAt: ts,
    updatedAt: ts,
    ...seed,
  });
}

async function listEntryNames(dir: MemoryDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  for await (const [name] of dir.entries()) names.push(name);
  return names.sort();
}

async function listSessionFileIds(root: MemoryDirectoryHandle): Promise<string[]> {
  const sessionsDir = await root.getDirectoryHandle('sessions');
  const names: string[] = [];
  for await (const [name, handle] of sessionsDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.json')) {
      names.push(name.replace(/\.json$/, ''));
    }
  }
  return names.sort();
}

const topLevelDataFiles = ['settings.json', 'workspaces.json', 'folders.json', 'categoryOrder.json', 'bin.json', 'ledger.json'];

// Default permission: granted.
function withPermission(root: MemoryDirectoryHandle, state: PermissionState = 'granted'): void {
  (root as unknown as {
    queryPermission: () => Promise<PermissionState>;
    requestPermission: () => Promise<PermissionState>;
  }).queryPermission = async () => state;
  (root as unknown as {
    queryPermission: () => Promise<PermissionState>;
    requestPermission: () => Promise<PermissionState>;
  }).requestPermission = async () => state;
}

// ---------- tests ----------

describe('initFileStorageDirectory', () => {
  let chromeMock: ChromeMock;

  beforeEach(() => {
    chromeMock = makeChromeMock();
    stubChrome(chromeMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('empty directory returns null state with hasExistingData=false', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const info = await initFileStorageDirectory(root);
    expect(info.hasExistingData).toBe(false);
    expect(info.state).toBeNull();
  });

  it('throws PERMISSION_DENIED when permission is denied after request', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root, 'denied');
    await expect(initFileStorageDirectory(root)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    } as Partial<AdapterInitError>);
  });
});

describe('createFileStorageAdapter', () => {
  it('keeps unchanged data files when only a workspace name changes', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const previous = knownState();
    const writer = await createFileStorageAdapter(root);
    await writer.setState(previous);
    const names = [...topLevelDataFiles, 'meta.json'];
    const writes = await Promise.all(names.map(async (name) => vi.spyOn(await root.getFileHandle(name), 'createWritable')));
    const sessions = await root.getDirectoryHandle('sessions');
    const sessionWrites = await Promise.all(previous.groups.map(async (group) => vi.spyOn(await sessions.getFileHandle(`${group.id}.json`), 'createWritable')));
    const next = normalizeState({
      ...previous, mutationRevision: 8,
      workspaces: previous.workspaces.map((workspace) => ({ ...workspace, name: 'Renamed' })),
    });
    await writer.setState(next);
    for (const [index, name] of names.entries()) {
      expect(writes[index]).toHaveBeenCalledTimes(name === 'meta.json' ? 2 : name === 'workspaces.json' ? 1 : 0);
    }
    for (const index of previous.groups.keys()) {
      expect(sessionWrites[index]).not.toHaveBeenCalled();
    }
    expect(await (await createFileStorageAdapter(root)).getState()).toEqual(next);
  });

  it.each(['restore', 'repair'] as const)('rewrites all data files for forced %s even when content is equal', async (mode) => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const previous = knownState();
    await (await createFileStorageAdapter(root)).setState(previous);
    let interrupt = mode === 'repair';
    const writer = await createFileStorageAdapter(root, {
      locks: { beforeMetaWrite: () => {
        if (interrupt) { interrupt = false; throw new Error('Interrupted'); }
      } },
    });
    if (mode === 'repair') await expect(writer.setState(previous)).rejects.toThrow('Interrupted');
    const writes = await Promise.all(topLevelDataFiles.map(async (name) => vi.spyOn(await root.getFileHandle(name), 'createWritable')));
    const sessions = await root.getDirectoryHandle('sessions');
    const sessionWrites = await Promise.all(previous.groups.map(async (group) => vi.spyOn(await sessions.getFileHandle(`${group.id}.json`), 'createWritable')));
    const next = { ...previous, mutationRevision: 9 };
    await writer.setState(next, mode === 'restore' ? { backupBeforeRestore: previous } : undefined);
    for (const index of topLevelDataFiles.keys()) {
      expect(writes[index]).toHaveBeenCalledTimes(1);
    }
    for (const index of previous.groups.keys()) {
      expect(sessionWrites[index]).toHaveBeenCalledTimes(1);
    }
    expect(await (await createFileStorageAdapter(root)).getState()).toEqual(next);
  });
  let chromeMock: ChromeMock;

  beforeEach(() => {
    chromeMock = makeChromeMock();
    stubChrome(chromeMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trip: ensureState seeds default, setState then getState returns equivalent', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const adapter = await createFileStorageAdapter(root);

    const seeded = await adapter.ensureState();
    expect(seeded).toBeTruthy();
    expect(seeded.workspaces.length).toBeGreaterThan(0);
    expect(seeded.mutationRevision).toBe(0);

    const state = knownState();
    await adapter.setState(state);

    const loaded = await adapter.getState();
    expect(loaded.mutationRevision).toBe(state.mutationRevision);
    expect(loaded.groups).toHaveLength(2);
    expect(loaded.groups.map((g) => g.title).sort()).toEqual(
      state.groups.map((g) => g.title).sort(),
    );
    // categoryOrder is preserved
    expect(loaded.categoryOrderByWorkspace[state.activeWorkspaceId]).toEqual(
      state.categoryOrderByWorkspace[state.activeWorkspaceId],
    );
  });

  it('setState creates session files named <id>.json in sessions/', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const adapter = await createFileStorageAdapter(root);
    await adapter.ensureState();

    const state = knownState();
    await adapter.setState(state);

    const ids = await listSessionFileIds(root);
    expect(ids.sort()).toEqual(state.groups.map((g) => g.id).sort());

    // Content parses as a Group
    const sessionsDir = await root.getDirectoryHandle('sessions');
    for (const g of state.groups) {
      const fh = await sessionsDir.getFileHandle(`${g.id}.json`);
      const f = await fh.getFile();
      const text = await f.text();
      const parsed = JSON.parse(text);
      expect(parsed.id).toBe(g.id);
      expect(parsed.title).toBe(g.title);
      expect(Array.isArray(parsed.tabs)).toBe(true);
    }
  });

  it('preserves session order after rewriting one session file', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const adapter = await createFileStorageAdapter(root);
    await adapter.ensureState();

    const state = knownState();
    await adapter.setState(state);
    const updatedAt = '2026-07-23T10:01:00.000Z';
    await adapter.setState({
      ...state,
      mutationRevision: state.mutationRevision + 1,
      groups: state.groups.map((group, index) => index === 0
        ? { ...group, title: 'Session One Updated', updatedAt }
        : group),
      updatedAt,
    });

    const reloaded = await createFileStorageAdapter(root);
    expect((await reloaded.getState()).groups.map(({ id }) => id))
      .toEqual(state.groups.map(({ id }) => id));
  });

  it('loads legacy meta without sessionOrder and backfills it on the next write', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const adapter = await createFileStorageAdapter(root);
    await adapter.ensureState();
    await adapter.setState(knownState());

    const metaFile = await root.getFileHandle('meta.json');
    const legacyMeta = JSON.parse(await (await metaFile.getFile()).text());
    delete legacyMeta.sessionOrder;
    await atomicWriteFile(root, 'meta.json', JSON.stringify(legacyMeta, null, 2));

    const legacyAdapter = await createFileStorageAdapter(root);
    const legacyState = await legacyAdapter.getState();
    expect(legacyState.groups).toHaveLength(2);

    const updatedAt = '2026-07-23T10:02:00.000Z';
    await legacyAdapter.setState({
      ...legacyState,
      mutationRevision: legacyState.mutationRevision + 1,
      updatedAt,
    });
    const backfilledMeta = JSON.parse(
      await (await (await root.getFileHandle('meta.json')).getFile()).text(),
    );
    expect(backfilledMeta.sessionOrder)
      .toEqual(legacyState.groups.map(({ id }) => id));
  });

  it('recovery: meta.writeInProgress=true + orphan tmp files loads last good state and cleans tmps', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);

    // First write: populate with a known good state.
    const adapter1 = await createFileStorageAdapter(root);
    await adapter1.ensureState();
    const good = knownState();
    await adapter1.setState(good);

    // Simulate a crashed write: flip meta.writeInProgress=true and drop an orphan tmp.
    const metaFh = await root.getFileHandle('meta.json');
    const rawMetaText = await (await metaFh.getFile()).text();
    const meta = JSON.parse(rawMetaText);
    meta.writeInProgress = true;
    await atomicWriteFile(root, 'meta.json', JSON.stringify(meta, null, 2));
    // orphan tmp in root and in sessions/
    await root.getFileHandle('.settings.json.tmp.deadbe', { create: true });
    const sessionsDir = await root.getDirectoryHandle('sessions');
    await sessionsDir.getFileHandle('.whatever.json.tmp.abc123', { create: true });

    // New adapter init should recover: load last good state, clean orphans.
    const adapter2 = await createFileStorageAdapter(root);
    const loaded = await adapter2.getState();
    expect(loaded.groups).toHaveLength(2);
    expect(loaded.mutationRevision).toBe(good.mutationRevision);

    const rootNames = await listEntryNames(root);
    expect(rootNames.some((n) => n.startsWith('.') && n.includes('.tmp.'))).toBe(false);
    const sessionNames = await listEntryNames(sessionsDir);
    expect(sessionNames.some((n) => n.startsWith('.') && n.includes('.tmp.'))).toBe(false);

    // Newly written meta should not have writeInProgress true; but we didn't setState yet.
    // After initial load, meta.json on disk still contains writeInProgress:true from our
    // simulation. We only log warning and continue. Write a new state and confirm meta resets.
    const next = { ...good, mutationRevision: good.mutationRevision + 1 };
    await adapter2.setState(next);
    const metaAfter = await root.getFileHandle('meta.json');
    const metaText = await (await metaAfter.getFile()).text();
    expect(JSON.parse(metaText).writeInProgress).toBeFalsy();
  });

  it.each(['replace-session', 'delete-session', 'top-level-files'] as const)(
    'recovers the complete committed snapshot after interruption at %s', async (phase) => {
      const root = createMemoryDirectory('root');
      withPermission(root);
      const good = knownState();
      const seed = await createFileStorageAdapter(root);
      await seed.setState(good);
      const next = normalizeState({
        ...good,
        mutationRevision: 8,
        groups: good.groups.slice(1).map((group) => ({ ...group, title: 'Uncommitted title' })),
        settings: { ...good.settings, closeTabsAfterSave: false },
      });
      const interrupt = async () => {
        if (phase === 'replace-session') await writeSessionFile(root, good.groups[1].id, next.groups[0]);
        if (phase === 'delete-session') await deleteSessionFile(root, good.groups[0].id);
        throw new Error('Interrupted file transaction');
      };
      const writer = await createFileStorageAdapter(root, {
        locks: phase === 'top-level-files'
          ? { beforeFinalMeta: interrupt }
          : { beforeMetaWrite: interrupt },
      });

      await expect(writer.setState(next)).rejects.toThrow('Interrupted file transaction');
      const reader = await createFileStorageAdapter(root);
      expect(await reader.getState()).toEqual(good);
    },
  );

  it('repairs replaced, removed and orphan session files before the next commit', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const good = knownState();
    await (await createFileStorageAdapter(root)).setState(good);
    const orphan = createGroupFromTabRecords(
      [createTabRecord({ title: 'Pending', url: 'https://pending.example' } as chrome.tabs.Tab)],
      { title: 'Orphan', workspaceId: good.activeWorkspaceId },
    );
    let interrupted = false;
    const writer = await createFileStorageAdapter(root, {
      locks: { beforeMetaWrite: async () => {
        if (interrupted) return;
        interrupted = true;
        await deleteSessionFile(root, good.groups[0].id);
        await writeSessionFile(root, good.groups[1].id, { ...good.groups[1], title: 'Uncommitted' });
        await writeSessionFile(root, orphan.id, orphan);
        throw new Error('Interrupted file transaction');
      } },
    });
    await expect(writer.setState({ ...good, mutationRevision: 8 })).rejects.toThrow('Interrupted');
    const next = normalizeState({ ...good, mutationRevision: 9, settings: { ...good.settings, theme: 'dark' } });
    await writer.setState(next);

    expect(await (await createFileStorageAdapter(root)).getState()).toEqual(next);
    expect(await listSessionFileIds(root)).not.toContain(orphan.id);
  });

  it('reads the prior snapshot while another context is publishing changed files', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const good = knownState();
    await (await createFileStorageAdapter(root)).setState(good);
    let resume!: () => void;
    let entered!: () => void;
    const paused = new Promise<void>((resolve) => { resume = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const writer = await createFileStorageAdapter(root, {
      locks: { beforeFinalMeta: async () => { entered(); await paused; } },
    });
    const next = normalizeState({ ...good, mutationRevision: 8, groups: [], settings: { ...good.settings, theme: 'dark' } });
    const writing = writer.setState(next);
    await ready;
    let during: TabBoardState;
    try {
      during = await (await createFileStorageAdapter(root)).getState();
    } finally {
      resume();
      await writing;
    }
    expect(during!).toEqual(good);
    expect(await (await createFileStorageAdapter(root)).getState()).toEqual(next);
  });

  it('rejects an interrupted transaction whose recovery snapshot is missing', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const good = knownState();
    await (await createFileStorageAdapter(root)).setState(good);
    const writer = await createFileStorageAdapter(root, {
      locks: { beforeFinalMeta: () => { throw new Error('Interrupted'); } },
    });
    await expect(writer.setState({ ...good, mutationRevision: 8 })).rejects.toThrow('Interrupted');
    const meta = JSON.parse(await readTextFile(await root.getFileHandle('meta.json')));
    await root.removeEntry(meta.recoveryFile ?? '.tabboard-recovery.json').catch(() => undefined);
    await expect(createFileStorageAdapter(root)).rejects.toMatchObject({ code: 'FILE_CORRUPT' });
  });

  it('retains the recovery snapshot while a retry prepares its next snapshot', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const good = knownState();
    await (await createFileStorageAdapter(root)).setState(good);
    let fail = true;
    const writer = await createFileStorageAdapter(root, {
      locks: { beforeFinalMeta: () => {
        if (fail) { fail = false; throw new Error('Interrupted'); }
      } },
    });
    await expect(writer.setState({ ...good, mutationRevision: 8 })).rejects.toThrow('Interrupted');

    let resume!: () => void;
    let entered!: () => void;
    const paused = new Promise<void>((resolve) => { resume = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const getFile = root.getFileHandle.bind(root);
    let blocked = false;
    vi.spyOn(root, 'getFileHandle').mockImplementation(async (name, options) => {
      const file = await getFile(name, options);
      if (name.startsWith('.tabboard-recovery') && !blocked) {
        blocked = true;
        const createWritable = file.createWritable.bind(file);
        file.createWritable = async () => {
          const stream = await createWritable();
          const close = stream.close.bind(stream);
          stream.close = async () => { await close(); entered(); await paused; };
          return stream;
        };
      }
      return file;
    });
    const next = normalizeState({ ...good, mutationRevision: 9, settings: { ...good.settings, theme: 'dark' } });
    const writing = writer.setState(next);
    await ready;
    let during: TabBoardState | undefined;
    let failure: unknown;
    try {
      during = await (await createFileStorageAdapter(root)).getState();
    } catch (error) {
      failure = error;
    } finally {
      resume();
      await writing;
    }
    expect(failure).toBeUndefined();
    expect(during).toEqual(good);
  });

  it('settles other session writes before rejecting a failed transaction', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const good = knownState();
    const writer = await createFileStorageAdapter(root);
    await writer.setState(good);
    const sessions = await root.getDirectoryHandle('sessions');
    const getFile = sessions.getFileHandle.bind(sessions);
    let resume!: () => void;
    let entered!: () => void;
    const paused = new Promise<void>((resolve) => { resume = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    vi.spyOn(sessions, 'getFileHandle').mockImplementation(async (name, options) => {
      const file = await getFile(name, options);
      const createWritable = file.createWritable.bind(file);
      file.createWritable = async () => {
        const stream = await createWritable();
        if (name === `${good.groups[0].id}.json`) {
          stream.close = async () => { throw new Error('Failed session write'); };
        } else {
          const close = stream.close.bind(stream);
          stream.close = async () => { entered(); await paused; await close(); };
        }
        return stream;
      };
      return file;
    });
    const next = normalizeState({
      ...good, mutationRevision: 8,
      groups: good.groups.map((group) => ({ ...group, title: 'Uncommitted' })),
    });
    const writing = writer.setState(next);
    const outcome = writing.then(() => 'resolved', () => 'rejected');
    await ready;
    const beforeResume = await Promise.race([
      outcome,
      new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 10)),
    ]);
    resume();
    await expect(writing).rejects.toThrow('Failed session write');
    expect(beforeResume).toBe('pending');
  });

  it('corrupt meta.json throws FILE_CORRUPT', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    // Write garbage meta.json
    const fh = await root.getFileHandle('meta.json', { create: true });
    const w = await fh.createWritable();
    await w.write('{not json');
    await w.close();

    await expect(createFileStorageAdapter(root)).rejects.toMatchObject({
      code: 'FILE_CORRUPT',
    } as Partial<AdapterInitError>);
  });

  it('corrupt top-level file (settings.json) throws FILE_CORRUPT', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    // Seed with a good meta.json so init proceeds to top-level reads.
    const adapter0 = await createFileStorageAdapter(root);
    await adapter0.ensureState();
    await adapter0.setState(knownState());

    // Now corrupt settings.json
    await atomicWriteFile(root, 'settings.json', '{not json');

    const fresh = createMemoryDirectory('root');
    // Copy contents by writing to fresh is tedious; instead re-init on same root by creating a new adapter
    // But the adapter caches init state. We test by simulating via initFileStorageDirectory directly.
    // Actually easier: call initFileStorageDirectory on the same root with fresh in-memory state
    // by using a new adapter? The adapter doesn't cache across invocations. Let's just call it directly:
    await expect(initFileStorageDirectory(root)).rejects.toMatchObject({
      code: 'FILE_CORRUPT',
    } as Partial<AdapterInitError>);
  });

  it('corrupt session file is skipped (group missing from loaded state)', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const adapter = await createFileStorageAdapter(root);
    await adapter.ensureState();
    const state = knownState();
    await adapter.setState(state);

    // Corrupt one session file
    const sessionsDir = await root.getDirectoryHandle('sessions');
    const victimId = state.groups[0].id;
    await atomicWriteFile(sessionsDir, `${victimId}.json`, '{not json');

    // New adapter should skip corrupt session (log warning) and load the other group
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter2 = await createFileStorageAdapter(root);
    const loaded = await adapter2.getState();
    warnSpy.mockRestore();

    // One group should still be present; the corrupted group is missing
    expect(loaded.groups.map((g) => g.id)).not.toContain(victimId);
    expect(loaded.groups.map((g) => g.id)).toContain(state.groups[1].id);
  });

  it('reports unread sessions and clears the report after the original file is repaired', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const state = knownState();
    await (await createFileStorageAdapter(root)).setState(state);
    const sessions = await root.getDirectoryHandle('sessions');
    const fileName = `${state.groups[0].id}.json`;
    await atomicWriteFile(sessions, fileName, '{broken');

    const info = await initFileStorageDirectory(root);
    expect(info.unreadSessionFiles).toEqual([fileName]);
    const reader = await createFileStorageAdapter(root);
    expect(reader.getUnreadSessionCount()).toBe(1);
    expect(await readTextFile(await sessions.getFileHandle(fileName))).toBe('{broken');

    await writeSessionFile(root, state.groups[0].id, state.groups[0]);
    await reader.reloadFromDisk();
    expect(reader.getUnreadSessionCount()).toBe(0);
    expect((await reader.getState()).groups).toHaveLength(2);
    expect(chromeMock.storage.local.data[BOOTSTRAP_KEY]).not.toHaveProperty('unreadSessionCount');
  });

  it('preserves unread files during recovery rather than deleting them as orphan sessions', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const state = knownState();
    await (await createFileStorageAdapter(root)).setState(state);
    const sessions = await root.getDirectoryHandle('sessions');
    const fileName = `${state.groups[0].id}.json`;
    await atomicWriteFile(sessions, fileName, '{original broken content');
    let interrupted = false;
    const writer = await createFileStorageAdapter(root, {
      locks: { beforeFinalMeta: () => {
        if (!interrupted) { interrupted = true; throw new Error('Interrupted'); }
      } },
    });
    const partial = await writer.getState();
    await expect(writer.setState({ ...partial, mutationRevision: 8 })).rejects.toThrow('Interrupted');
    await writer.setState({ ...partial, mutationRevision: 9 });
    expect(await readTextFile(await sessions.getFileHandle(fileName))).toBe('{original broken content');
  });

  it('concurrent setStates are serialized via the write queue', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const adapter = await createFileStorageAdapter(root);
    await adapter.ensureState();

    // Issue 5 concurrent setState calls with unique mutations
    const base = knownState();
    const results: number[] = [];
    const promises: Promise<void>[] = [];
    for (let i = 1; i <= 5; i++) {
      const next = normalizeState({ ...base, mutationRevision: i });
      promises.push(
        adapter.setState(next).then(() => {
          results.push(i);
        }),
      );
    }
    await Promise.all(promises);

    // Final state should be the last-written one (revision 5).
    const loaded = await adapter.getState();
    expect(loaded.mutationRevision).toBe(5);
    // Results should reflect queued completion order 1..5 (FIFO)
    expect(results).toEqual([1, 2, 3, 4, 5]);
  });

  it('subscribeState fires callback on setState within same context', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const adapter = await createFileStorageAdapter(root);
    await adapter.ensureState();

    const cb = vi.fn();
    const unsub = adapter.subscribeState(cb);

    const state = knownState();
    await adapter.setState(state);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].mutationRevision).toBe(state.mutationRevision);

    // Unsubscribe stops delivery
    unsub();
    await adapter.setState(normalizeState({ ...state, mutationRevision: state.mutationRevision + 1 }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('setState publishes one post-commit projection and file ping update', async () => {
    const root = createMemoryDirectory('root');
    withPermission(root);
    const adapter = await createFileStorageAdapter(root);
    await adapter.ensureState();

    const state = knownState();
    await adapter.setState(state);

    expect(chromeMock.storage.local.set).toHaveBeenCalled();
    const lastCall = chromeMock.storage.local.set.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
    const ping = lastCall?.[FILE_PING_KEY] as { mutationRevision?: number; updatedAt?: string } | undefined;
    expect(ping).toBeTruthy();
    expect(ping?.mutationRevision).toBe(state.mutationRevision);
    expect(ping?.updatedAt).toBe(state.updatedAt);
    expect(lastCall?.[SETTINGS_PROJECTION_KEY]).toEqual(projectionFromState(state));
    expect(lastCall?.[BOOTSTRAP_KEY]).toEqual({
      configuredTarget: 'file',
      activeBackend: 'file',
      folderName: 'root',
      fallbackReason: null,
      fileUpdatedAt: state.updatedAt,
    });
  });
});
