/**
 * Atomic file-write helpers used by FileStorageAdapter.
 *
 * All writes go through a temp sibling file that is created, fully written,
 * then renamed (or copied on browsers without FileSystemFileHandle.move())
 * into place. A crashed write leaves behind the old file plus a tmp sibling;
 * cleanupOrphanTempFiles() sweeps those up on startup.
 */

import type { Group } from '../model/types';
import { serializeJson, parseJsonFile } from './fileSerialization';
import { logWarning } from '../utils/diagnostics';

// ---------- error helpers ----------

function isNotFoundError(err: unknown): boolean {
  return (
    !!err
    && typeof err === 'object'
    && 'name' in err
    && (err as { name: string }).name === 'NotFoundError'
  );
}

// ---------- random suffix ----------

function randomHex6(): string {
  const bytes = new Uint8Array(3);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

function tmpNameFor(filename: string): string {
  return `.${filename}.tmp.${randomHex6()}`;
}

// ---------- core primitives ----------

/**
 * Atomically write `content` to `filename` inside `parent`. Writes to a
 * temp sibling first, then replaces the target. If the process crashes
 * mid-write the old file (if any) remains intact and the tmp is reclaimed
 * later by cleanupOrphanTempFiles().
 */
export async function atomicWriteFile(
  parent: FileSystemDirectoryHandle,
  filename: string,
  content: string,
): Promise<void> {
  let tmpName: string | null = null;
  try {
    tmpName = tmpNameFor(filename);
    const tmpHandle = await parent.getFileHandle(tmpName, { create: true });
    const w = await tmpHandle.createWritable();
    await w.write(content);
    await w.close();

    // Remove existing target (best-effort; NotFoundError is fine).
    try {
      await parent.removeEntry(filename);
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
    }

    // Move tmp to final name.
    const moveable = tmpHandle as unknown as { move?: (dir: FileSystemDirectoryHandle, name: string) => Promise<void> };
    if (typeof moveable.move === 'function') {
      await moveable.move.call(tmpHandle, parent, filename);
    } else {
      // Fallback for browsers without FileSystemFileHandle.move():
      // read back tmp content, write to new target, then delete tmp.
      const text = await (await tmpHandle.getFile()).text();
      const target = await parent.getFileHandle(filename, { create: true });
      const w2 = await target.createWritable();
      await w2.write(text);
      await w2.close();
      await parent.removeEntry(tmpName);
    }
    tmpName = null;
  } catch (err) {
    if (tmpName) {
      try {
        await parent.removeEntry(tmpName);
      } catch {
        // secondary cleanup failure is ignored
      }
    }
    throw err;
  }
}

/**
 * Delete `filename` from `parent` if it exists. No-op if the file is absent.
 */
export async function atomicDeleteFile(
  parent: FileSystemDirectoryHandle,
  filename: string,
): Promise<void> {
  try {
    await parent.removeEntry(filename);
  } catch (err) {
    if (isNotFoundError(err)) return;
    throw err;
  }
}

/**
 * Remove any files in `parent` whose names match the orphan-tmp pattern
 * produced by atomicWriteFile (i.e. `.name.tmp.xxxxxx`). Called on startup
 * to clean up leftovers from interrupted writes.
 */
// TypeScript's bundled DOM lib (as of 5.5) does not yet expose the async
// iterable methods on FileSystemDirectoryHandle, even though browsers
// (Chrome 86+) and our in-memory test double support them. We widen via a
// minimal local interface so cleanupOrphanTempFiles can iterate entries.
interface IterableDirectoryHandle extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

function asIterable(dir: FileSystemDirectoryHandle): IterableDirectoryHandle {
  return dir as unknown as IterableDirectoryHandle;
}

/**
 * Remove any files in `parent` whose names match the orphan-tmp pattern
 * produced by atomicWriteFile (i.e. `.name.tmp.xxxxxx`). Called on startup
 * to clean up leftovers from interrupted writes.
 */
export async function cleanupOrphanTempFiles(
  parent: FileSystemDirectoryHandle,
): Promise<void> {
  const tmpPattern = /^\..+\.tmp\.[a-z0-9]+$/;
  const toRemove: string[] = [];
  for await (const [name, handle] of asIterable(parent).entries()) {
    if (handle.kind === 'file' && tmpPattern.test(name)) {
      toRemove.push(name);
    }
  }
  for (const name of toRemove) {
    try {
      await parent.removeEntry(name);
    } catch (err) {
      if (!isNotFoundError(err)) {
        logWarning('fsAtomic', `Failed to clean up orphan tmp file "${name}"`, err);
      }
    }
  }
}

/** Read the full text of a file handle. */
export async function readTextFile(file: FileSystemFileHandle): Promise<string> {
  const f = await file.getFile();
  return f.text();
}

// ---------- session file helpers ----------

/**
 * Write a single session group to `sessions/<sessionId>.json` under `parent`,
 * creating the sessions/ directory if it does not yet exist.
 */
export async function writeSessionFile(
  parent: FileSystemDirectoryHandle,
  sessionId: string,
  group: Group,
): Promise<void> {
  const sessionsDir = await parent.getDirectoryHandle('sessions', { create: true });
  const json = serializeJson(group);
  await atomicWriteFile(sessionsDir, `${sessionId}.json`, json);
}

/**
 * Delete the session file for `sessionId` if it exists. Tolerates a missing
 * sessions/ directory (i.e. nothing was ever written).
 */
export async function deleteSessionFile(
  parent: FileSystemDirectoryHandle,
  sessionId: string,
): Promise<void> {
  let sessionsDir: FileSystemDirectoryHandle;
  try {
    sessionsDir = await parent.getDirectoryHandle('sessions');
  } catch (err) {
    if (isNotFoundError(err)) return;
    throw err;
  }
  await atomicDeleteFile(sessionsDir, `${sessionId}.json`);
}

/**
 * Read and parse a session file. Returns null if the file does not exist or
 * cannot be parsed (parse failures are logged as warnings rather than thrown).
 */
export async function readSessionFile(
  sessionsDir: FileSystemDirectoryHandle,
  sessionId: string,
): Promise<Group | null> {
  let handle: FileSystemFileHandle;
  try {
    handle = await sessionsDir.getFileHandle(`${sessionId}.json`);
  } catch (err) {
    if (isNotFoundError(err)) return null;
    throw err;
  }
  const text = await readTextFile(handle);
  try {
    return parseJsonFile<Group>(text, `${sessionId}.json`);
  } catch (err) {
    logWarning('fsAtomic', `Corrupt session file "${sessionId}.json"`, err);
    return null;
  }
}
