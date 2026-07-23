import { describe, it, expect } from 'vitest';
import { createMemoryDirectory, type MemoryFileHandle } from './memoryFs';

describe('memoryFs in-memory File System Access API mock', () => {
  it('creates a root directory with kind and name', () => {
    const root = createMemoryDirectory('root');
    expect(root.kind).toBe('directory');
    expect(root.name).toBe('root');
  });

  it('defaults root name to empty string when not provided', () => {
    const root = createMemoryDirectory();
    expect(root.name).toBe('');
  });

  it('creates a file handle and reports kind/name', async () => {
    const root = createMemoryDirectory('root');
    const fh = await root.getFileHandle('hello.txt', { create: true });
    expect(fh.kind).toBe('file');
    expect(fh.name).toBe('hello.txt');
  });

  it('throws NotFoundError when getting a non-existent file without create', async () => {
    const root = createMemoryDirectory('root');
    await expect(root.getFileHandle('missing.txt')).rejects.toHaveProperty('name', 'NotFoundError');
  });

  it('throws TypeMismatchError when name collides with a directory', async () => {
    const root = createMemoryDirectory('root');
    await root.getDirectoryHandle('sub', { create: true });
    await expect(root.getFileHandle('sub')).rejects.toHaveProperty('name', 'TypeMismatchError');
  });

  it('returns existing file handle on repeated getFileHandle', async () => {
    const root = createMemoryDirectory('root');
    const a = await root.getFileHandle('f.txt', { create: true });
    const b = await root.getFileHandle('f.txt');
    expect(a).toBe(b);
  });

  it('returns a File-like object from getFile() with empty initial content', async () => {
    const root = createMemoryDirectory('root');
    const fh = await root.getFileHandle('empty.txt', { create: true });
    const file = await fh.getFile();
    expect(file.name).toBe('empty.txt');
    expect(await file.text()).toBe('');
  });

  it('writes text via a writable and reads it back after close', async () => {
    const root = createMemoryDirectory('root');
    const fh = await root.getFileHandle('greet.txt', { create: true });
    const w = await fh.createWritable();
    await w.write('hello world');
    await w.close();
    const file = await fh.getFile();
    expect(await file.text()).toBe('hello world');
  });

  it('does NOT update the file content before the writable is closed (atomic commit)', async () => {
    const root = createMemoryDirectory('root');
    const fh = await root.getFileHandle('atom.txt', { create: true });
    // seed file
    const w0 = await fh.createWritable();
    await w0.write('initial');
    await w0.close();
    expect(await (await fh.getFile()).text()).toBe('initial');

    // open new writable, write but don't close — content must stay initial
    const w1 = await fh.createWritable();
    await w1.write('partial');
    expect(await (await fh.getFile()).text()).toBe('initial');
    await w1.close();
    expect(await (await fh.getFile()).text()).toBe('partial');
  });

  it('supports multiple sequential writes that concatenate', async () => {
    const root = createMemoryDirectory('root');
    const fh = await root.getFileHandle('multi.txt', { create: true });
    const w = await fh.createWritable();
    await w.write('foo');
    await w.write('bar');
    await w.write('baz');
    await w.close();
    expect(await (await fh.getFile()).text()).toBe('foobarbaz');
  });

  it('supports writing Uint8Array / ArrayBuffer chunks', async () => {
    const root = createMemoryDirectory('root');
    const fh = await root.getFileHandle('bytes.bin', { create: true });
    const w = await fh.createWritable();
    const enc = new TextEncoder();
    await w.write(enc.encode('AB'));
    await w.write(enc.encode('CD').buffer.slice(0, 2));
    await w.close();
    expect(await (await fh.getFile()).text()).toBe('ABCD');
  });

  it('abort() on writable discards uncommitted content', async () => {
    const root = createMemoryDirectory('root');
    const fh = await root.getFileHandle('a.txt', { create: true });
    const w0 = await fh.createWritable();
    await w0.write('saved');
    await w0.close();

    const w1 = await fh.createWritable();
    await w1.write('discarded');
    await w1.abort();
    expect(await (await fh.getFile()).text()).toBe('saved');
  });

  it('getFile() returns a Blob with correct size', async () => {
    const root = createMemoryDirectory('root');
    const fh = await root.getFileHandle('size.txt', { create: true });
    const w = await fh.createWritable();
    await w.write('12345');
    await w.close();
    const file = await fh.getFile();
    expect(file.size).toBe(5);
    expect(file.type).toBe('');
  });

  it('creates subdirectories and nests files', async () => {
    const root = createMemoryDirectory('root');
    const sub = await root.getDirectoryHandle('sub', { create: true });
    expect(sub.kind).toBe('directory');
    expect(sub.name).toBe('sub');

    const nested = await sub.getFileHandle('nested.txt', { create: true });
    const w = await nested.createWritable();
    await w.write('nested content');
    await w.close();
    expect(await (await nested.getFile()).text()).toBe('nested content');
  });

  it('throws TypeMismatchError when getDirectoryHandle collides with existing file', async () => {
    const root = createMemoryDirectory('root');
    await root.getFileHandle('f.txt', { create: true });
    await expect(root.getDirectoryHandle('f.txt')).rejects.toHaveProperty('name', 'TypeMismatchError');
  });

  it('throws NotFoundError when getting a non-existent directory without create', async () => {
    const root = createMemoryDirectory('root');
    await expect(root.getDirectoryHandle('missing')).rejects.toHaveProperty('name', 'NotFoundError');
  });

  it('iterates entries()/keys()/values() over directory contents', async () => {
    const root = createMemoryDirectory('root');
    const f1 = await root.getFileHandle('a.txt', { create: true });
    const d1 = await root.getDirectoryHandle('dir', { create: true });
    const f2 = await root.getFileHandle('b.txt', { create: true });
    void f2;

    const keys: string[] = [];
    for await (const k of root.keys()) keys.push(k);
    expect(keys.sort()).toEqual(['a.txt', 'b.txt', 'dir']);

    const entries = new Map<string, 'file' | 'directory'>();
    for await (const [name, handle] of root.entries()) {
      entries.set(name, handle.kind);
    }
    expect(entries.get('a.txt')).toBe('file');
    expect(entries.get('b.txt')).toBe('file');
    expect(entries.get('dir')).toBe('directory');

    const kinds: string[] = [];
    for await (const h of root.values()) kinds.push(h.kind);
    expect(kinds.sort()).toEqual(['directory', 'file', 'file']);

    void d1;
  });

  it('removeEntry() deletes a file', async () => {
    const root = createMemoryDirectory('root');
    await root.getFileHandle('bye.txt', { create: true });
    await root.removeEntry('bye.txt');
    await expect(root.getFileHandle('bye.txt')).rejects.toHaveProperty('name', 'NotFoundError');
  });

  it('removeEntry() deletes an empty directory', async () => {
    const root = createMemoryDirectory('root');
    await root.getDirectoryHandle('emptydir', { create: true });
    await root.removeEntry('emptydir');
    await expect(root.getDirectoryHandle('emptydir')).rejects.toHaveProperty('name', 'NotFoundError');
  });

  it('removeEntry({ recursive: true }) deletes a non-empty directory', async () => {
    const root = createMemoryDirectory('root');
    const sub = await root.getDirectoryHandle('sub', { create: true });
    await sub.getFileHandle('child.txt', { create: true });
    await root.removeEntry('sub', { recursive: true });
    await expect(root.getDirectoryHandle('sub')).rejects.toHaveProperty('name', 'NotFoundError');
  });

  it('removeEntry() without recursive throws on non-empty directory', async () => {
    const root = createMemoryDirectory('root');
    const sub = await root.getDirectoryHandle('sub', { create: true });
    await sub.getFileHandle('child.txt', { create: true });
    await expect(root.removeEntry('sub')).rejects.toHaveProperty('name', 'InvalidModificationError');
  });

  it('removeEntry() on missing name throws NotFoundError', async () => {
    const root = createMemoryDirectory('root');
    await expect(root.removeEntry('nope')).rejects.toHaveProperty('name', 'NotFoundError');
  });

  it('isSameEntry() is true for the same handle and false for different ones', async () => {
    const root = createMemoryDirectory('root');
    const fa = await root.getFileHandle('a.txt', { create: true });
    const fb = await root.getFileHandle('b.txt', { create: true });
    expect(await fa.isSameEntry(fa)).toBe(true);
    expect(await fa.isSameEntry(fb)).toBe(false);
    const root2 = createMemoryDirectory('root2');
    expect(await root.isSameEntry(root2)).toBe(false);
  });

  it('resolve() returns path components for descendants and null for others', async () => {
    const root = createMemoryDirectory('root');
    const sub = await root.getDirectoryHandle('sub', { create: true });
    const deep = await sub.getDirectoryHandle('deep', { create: true });
    const file = await deep.getFileHandle('leaf.txt', { create: true });

    await expect(root.resolve(file)).resolves.toEqual(['sub', 'deep', 'leaf.txt']);
    await expect(sub.resolve(file)).resolves.toEqual(['deep', 'leaf.txt']);
    await expect(deep.resolve(file)).resolves.toEqual(['leaf.txt']);

    const otherRoot = createMemoryDirectory('other');
    await expect(otherRoot.resolve(file)).resolves.toBe(null);
  });

  it('move(name) renames a file within the same parent', async () => {
    const root = createMemoryDirectory('root');
    const fh = await root.getFileHandle('old.txt', { create: true });
    const w = await fh.createWritable();
    await w.write('data');
    await w.close();
    await fh.move('new.txt');
    expect(fh.name).toBe('new.txt');
    await expect(root.getFileHandle('old.txt')).rejects.toHaveProperty('name', 'NotFoundError');
    const after = await root.getFileHandle('new.txt');
    expect(await (await after.getFile()).text()).toBe('data');
  });

  it('move(targetDir, newName) moves a file to another directory', async () => {
    const root = createMemoryDirectory('root');
    const dest = await root.getDirectoryHandle('dest', { create: true });
    const fh = await root.getFileHandle('f.txt', { create: true });
    const w = await fh.createWritable();
    await w.write('moved');
    await w.close();
    await fh.move(dest, 'f.txt');
    await expect(root.getFileHandle('f.txt')).rejects.toHaveProperty('name', 'NotFoundError');
    const inDest = await dest.getFileHandle('f.txt');
    expect(await (await inDest.getFile()).text()).toBe('moved');
    expect(inDest).toBe(fh);
  });

  it('close() on an already-closed writable is a no-op', async () => {
    const root = createMemoryDirectory('root');
    const fh = await root.getFileHandle('d.txt', { create: true });
    const w = await fh.createWritable();
    await w.write('x');
    await w.close();
    await w.close();
    expect(await (await fh.getFile()).text()).toBe('x');
  });

  it('write() after close() throws', async () => {
    const root = createMemoryDirectory('root');
    const fh = await root.getFileHandle('d.txt', { create: true });
    const w = await fh.createWritable();
    await w.close();
    await expect(w.write('y')).rejects.toThrow();
  });
});
