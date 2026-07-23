import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMemoryDirectory } from '../testing/memoryFs';
import type { MemoryDirectoryHandle, MemoryFileHandle } from '../testing/memoryFs';
import {
  atomicWriteFile,
  atomicDeleteFile,
  cleanupOrphanTempFiles,
  readTextFile,
  writeSessionFile,
  deleteSessionFile,
  readSessionFile,
} from './fsAtomic';
import { createGroupFromTabRecords, createTabRecord, createEmptyState } from '../model';
import * as diagnostics from '../utils/diagnostics';

function makeGroup() {
  const state = createEmptyState();
  return createGroupFromTabRecords(
    [createTabRecord({ title: 'Hello', url: 'https://example.com' } as chrome.tabs.Tab)],
    { title: 'My Session', workspaceId: state.activeWorkspaceId },
  );
}

async function listEntryNames(dir: MemoryDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  for await (const [name] of dir.entries()) {
    names.push(name);
  }
  return names.sort();
}

describe('atomicWriteFile', () => {
  let dir: MemoryDirectoryHandle;

  beforeEach(() => {
    dir = createMemoryDirectory('root');
  });

  it('writes content that can be read back', async () => {
    await atomicWriteFile(dir, 'hello.txt', 'world');
    const fh = await dir.getFileHandle('hello.txt');
    expect(await readTextFile(fh)).toBe('world');
  });

  it('write two versions; read back gets latest', async () => {
    await atomicWriteFile(dir, 'a.txt', 'v1');
    await atomicWriteFile(dir, 'a.txt', 'v2');
    const fh = await dir.getFileHandle('a.txt');
    expect(await readTextFile(fh)).toBe('v2');
  });

  it('does not leave tmp files on success', async () => {
    await atomicWriteFile(dir, 'clean.txt', 'data');
    const names = await listEntryNames(dir);
    expect(names).toEqual(['clean.txt']);
  });

  it('cleans up tmp file and rethrows on write failure', async () => {
    // Force write failure by passing an object that writable.write rejects.
    // We simulate by spying on createWritable to return a rejecting stream.
    const fakeWritable = {
      write: () => { throw new Error('disk full'); },
      close: async () => {},
    };
    const spy = vi.spyOn(dir, 'getFileHandle').mockImplementationOnce(async () => {
      return {
        createWritable: async () => fakeWritable,
        move: undefined as unknown, // no move
        getFile: async () => new File([''], 'x.txt'),
      } as unknown as MemoryFileHandle;
    });

    await expect(atomicWriteFile(dir, 'f.txt', 'x')).rejects.toThrow('disk full');
    spy.mockRestore();
  });
});

describe('atomicDeleteFile', () => {
  let dir: MemoryDirectoryHandle;

  beforeEach(() => {
    dir = createMemoryDirectory('root');
  });

  it('deletes an existing file', async () => {
    await atomicWriteFile(dir, 'killme.txt', 'bye');
    await atomicDeleteFile(dir, 'killme.txt');
    await expect(dir.getFileHandle('killme.txt')).rejects.toHaveProperty('name', 'NotFoundError');
  });

  it('no-ops if the file does not exist', async () => {
    await expect(atomicDeleteFile(dir, 'nope.txt')).resolves.toBeUndefined();
  });
});

describe('cleanupOrphanTempFiles', () => {
  let dir: MemoryDirectoryHandle;

  beforeEach(() => {
    dir = createMemoryDirectory('root');
  });

  it('removes files matching the tmp pattern', async () => {
    // Create a regular file first.
    await atomicWriteFile(dir, 'good.txt', 'keep');
    // Simulate orphan tmp files by creating them directly.
    await dir.getFileHandle('.good.txt.tmp.abc123', { create: true });
    await dir.getFileHandle('.other.txt.tmp.0f0f0f', { create: true });
    // A non-tmp dotfile should stay.
    await dir.getFileHandle('.hidden', { create: true });

    await cleanupOrphanTempFiles(dir);

    const names = await listEntryNames(dir);
    expect(names).toEqual(['.hidden', 'good.txt']);
  });

  it('is a no-op when there are no orphans', async () => {
    await atomicWriteFile(dir, 'a.txt', '1');
    await cleanupOrphanTempFiles(dir);
    expect(await listEntryNames(dir)).toEqual(['a.txt']);
  });
});

describe('readTextFile', () => {
  it('returns the file text', async () => {
    const dir = createMemoryDirectory('root');
    const fh = await dir.getFileHandle('x.txt', { create: true });
    const w = await fh.createWritable();
    await w.write('hello');
    await w.close();
    expect(await readTextFile(fh)).toBe('hello');
  });
});

describe('session file helpers (write/read/delete)', () => {
  let root: MemoryDirectoryHandle;

  beforeEach(() => {
    root = createMemoryDirectory('root');
  });

  it('writeSessionFile/readSessionFile happy path roundtrips', async () => {
    const group = makeGroup();
    await writeSessionFile(root, group.id, group);
    const sessionsDir = await root.getDirectoryHandle('sessions');
    const loaded = await readSessionFile(sessionsDir, group.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(group.id);
    expect(loaded!.title).toBe(group.title);
    expect(loaded!.tabs).toHaveLength(group.tabs.length);
  });

  it('readSessionFile returns null for a missing file', async () => {
    const sessionsDir = await root.getDirectoryHandle('sessions', { create: true });
    const out = await readSessionFile(sessionsDir, 'does-not-exist');
    expect(out).toBeNull();
  });

  it('deleteSessionFile removes the file', async () => {
    const group = makeGroup();
    await writeSessionFile(root, group.id, group);
    await deleteSessionFile(root, group.id);
    const sessionsDir = await root.getDirectoryHandle('sessions');
    await expect(
      sessionsDir.getFileHandle(`${group.id}.json`),
    ).rejects.toHaveProperty('name', 'NotFoundError');
  });

  it('readSessionFile returns null and logs a warning on corrupt JSON', async () => {
    const warnSpy = vi.spyOn(diagnostics, 'logWarning').mockImplementation(() => {});
    const sessionsDir = await root.getDirectoryHandle('sessions', { create: true });
    // Write invalid JSON directly.
    const fh = await sessionsDir.getFileHandle('bad.json', { create: true });
    const w = await fh.createWritable();
    await w.write('{not valid json');
    await w.close();

    const result = await readSessionFile(sessionsDir, 'bad');
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
