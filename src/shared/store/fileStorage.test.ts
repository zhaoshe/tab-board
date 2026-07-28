import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
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
import { atomicWriteFile } from './fsAtomic';
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
  });
});
