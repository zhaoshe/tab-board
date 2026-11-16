/**
 * Atomic file-write helpers used by FileStorageAdapter.
 *
 * FileSystemWritableFileStream stages writes and publishes them on close.
 * Never remove an existing target before that publication succeeds.
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

// ---------- core primitives ----------

/**
 * Publish content by closing the platform's staged writable stream.
 * This also works for user-picked folders that cannot move file handles.
 */
export async function atomicWriteFile(
  parent: FileSystemDirectoryHandle,
  filename: string,
  content: string | BufferSource,
): Promise<void> {
  let created = false;
  let writable: FileSystemWritableFileStream | undefined;
  try {
    let target: FileSystemFileHandle;
    try {
      target = await parent.getFileHandle(filename);
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
      target = await parent.getFileHandle(filename, { create: true });
      created = true;
    }
    writable = await target.createWritable();
    await writable.write(content);
    await writable.close();
  } catch (err) {
    try {
      await writable?.abort();
    } catch {
      // Preserve the original failure even if abort also fails.
    }
    if (created) {
      try {
        await parent.removeEntry(filename);
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
 * produced by older atomicWriteFile versions (i.e. `.name.tmp.xxxxxx`).
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
 * produced by older atomicWriteFile versions (i.e. `.name.tmp.xxxxxx`).
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
