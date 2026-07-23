/**
 * FileStorageAdapter — StorageAdapter backed by a user-selected folder on disk.
 *
 * Layout (under the root FileSystemDirectoryHandle):
 *   meta.json            — version, revision, timestamps, writeInProgress flag
 *   settings.json
 *   workspaces.json
 *   folders.json
 *   categoryOrder.json   — map of workspaceId -> ordered group ids
 *   bin.json
 *   ledger.json          — drop operation ledger
 *   sessions/<id>.json   — one file per session group
 *
 * Writes are serialized through a promise chain and use a two-phase commit:
 *   1) meta.json is rewritten with writeInProgress:true
 *   2) changed session files and top-level files are written atomically
 *   3) meta.json is rewritten with writeInProgress:false, bumped revision + updatedAt
 * If the process crashes between steps 1 and 3, meta.json.writeInProgress is
 * left true; on next startup we log a warning, clean orphan tmp files, and
 * continue with the previous fully-committed state.
 *
 * Same-context subscribers are notified via an internal EventTarget;
 * cross-context notification is done by writing FILE_PING_KEY to
 * chrome.storage.local after each successful commit (the active adapter
 * layer listens for that ping elsewhere).
 */

import {
  FILE_LAYOUT_VERSION,
  FILE_PING_KEY,
  SCHEMA_VERSION,
} from '../model/constants';
import {
  clone,
  createEmptyState,
  normalizeState,
  nowIso,
  type TabBoardState,
} from '../model';
import type { Group } from '../model/types';
import { logBreadcrumb, logWarning } from '../utils/diagnostics';
import {
  atomicWriteFile,
  atomicDeleteFile,
  cleanupOrphanTempFiles,
  deleteSessionFile,
  readTextFile,
  writeSessionFile,
} from './fsAtomic';
import {
  assembleState,
  parseJsonFile,
  serializeJson,
  splitState,
  type FileParts,
} from './fileSerialization';
import type { AdapterInitError, StorageAdapter } from './storageAdapter';

// ---------- Types for DOM widenings ----------

// The TS DOM lib does not (as of 5.5) expose the async iterable, queryPermission
// or requestPermission methods on FileSystemDirectoryHandle, even though
// Chrome 86+ supports them. We widen locally.
interface PermissionableDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

function asPermissionable(dir: FileSystemDirectoryHandle): PermissionableDirectoryHandle {
  return dir as unknown as PermissionableDirectoryHandle;
}

// ---------- top-level filenames ----------

const META_FILE = 'meta.json';
const SETTINGS_FILE = 'settings.json';
const WORKSPACES_FILE = 'workspaces.json';
const FOLDERS_FILE = 'folders.json';
const CATEGORY_ORDER_FILE = 'categoryOrder.json';
const BIN_FILE = 'bin.json';
const LEDGER_FILE = 'ledger.json';
const SESSIONS_DIR = 'sessions';

interface StoredMeta {
  version: number;
  mutationRevision: number;
  activeWorkspaceId: string;
  createdAt: string;
  updatedAt: string;
  fileLayoutVersion: number;
  writeInProgress?: boolean;
  migrationInProgress?: boolean;
}

// ---------- error helpers ----------

function makeInitError(
  code: AdapterInitError['code'],
  message: string,
  cause?: unknown,
): AdapterInitError {
  const err = new Error(message) as AdapterInitError;
  err.code = code;
  if (cause !== undefined) {
    try {
      Object.defineProperty(err, 'cause', { value: cause, enumerable: false, writable: true, configurable: true });
    } catch {
      // non-fatal
    }
  }
  return err;
}

// ---------- concurrency helper ----------

async function pooledMap<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------- init: reading from disk ----------

export interface FileStorageInitInfo {
  state: TabBoardState | null;
  hasExistingData: boolean;
}

async function ensurePermission(root: FileSystemDirectoryHandle): Promise<void> {
  const h = asPermissionable(root);
  let status: PermissionState;
  try {
    status = await h.queryPermission({ mode: 'readwrite' });
  } catch (err) {
    // If queryPermission is unavailable (non-browser test environments),
    // treat as granted so callers with fake handles can proceed.
    if (err instanceof TypeError || (err as { name?: string })?.name === 'TypeError') {
      return;
    }
    throw makeInitError('PERMISSION_DENIED', `queryPermission failed: ${(err as Error).message}`, err);
  }
  if (status === 'prompt') {
    try {
      status = await h.requestPermission({ mode: 'readwrite' });
    } catch (err) {
      throw makeInitError(
        'PERMISSION_DENIED',
        `requestPermission failed: ${(err as Error).message}`,
        err,
      );
    }
  }
  if (status !== 'granted') {
    throw makeInitError('PERMISSION_DENIED', `File system permission not granted (status=${status})`);
  }
}

function isNotFoundError(err: unknown): boolean {
  return (
    !!err
    && typeof err === 'object'
    && 'name' in err
    && (err as { name: string }).name === 'NotFoundError'
  );
}

interface LoadedTopLevel {
  settings: unknown;
  workspaces: unknown;
  folders: unknown;
  categoryOrder: unknown;
  bin: unknown;
  ledger: unknown;
}

async function readJsonFile<T>(
  parent: FileSystemDirectoryHandle,
  filename: string,
): Promise<{ found: boolean; value: T | null }> {
  let handle: FileSystemFileHandle;
  try {
    handle = await parent.getFileHandle(filename);
  } catch (err) {
    if (isNotFoundError(err)) return { found: false, value: null };
    throw err;
  }
  const text = await readTextFile(handle);
  try {
    return { found: true, value: parseJsonFile<T>(text, filename) };
  } catch (err) {
    throw makeInitError(
      'FILE_CORRUPT',
      `Failed to parse critical file "${filename}": ${(err as Error).message}`,
      err,
    );
  }
}

async function readSessions(root: FileSystemDirectoryHandle): Promise<Map<string, Group>> {
  let sessionsDir: FileSystemDirectoryHandle;
  try {
    sessionsDir = await root.getDirectoryHandle(SESSIONS_DIR);
  } catch (err) {
    if (isNotFoundError(err)) {
      sessionsDir = await root.getDirectoryHandle(SESSIONS_DIR, { create: true });
      return new Map();
    }
    throw err;
  }

  // Collect names first so we can parallelize with bounded concurrency.
  const fileEntries: Array<{ name: string }> = [];
  for await (const [name, handle] of asPermissionable(sessionsDir).entries()) {
    if (handle.kind === 'file' && name.endsWith('.json')) {
      fileEntries.push({ name });
    }
  }

  const groups = new Map<string, Group>();
  if (fileEntries.length === 0) return groups;

  const loaded = await pooledMap(fileEntries, 10, async ({ name }) => {
    const sessionId = name.slice(0, -'.json'.length);
    const fh = await sessionsDir.getFileHandle(name);
    const text = await readTextFile(fh);
    try {
      return { sessionId, group: parseJsonFile<Group>(text, name) };
    } catch (err) {
      logWarning('fileStorage', `Corrupt session file "${name}" — skipping.`, err);
      return { sessionId, group: null as Group | null };
    }
  });
  for (const { sessionId, group } of loaded) {
    if (group) groups.set(sessionId, group);
  }
  return groups;
}

/**
 * Read and validate the root directory. Called both by the adapter during
 * construction and by the bootstrap code that needs to inspect a folder
 * before attaching an adapter.
 */
export async function initFileStorageDirectory(
  root: FileSystemDirectoryHandle,
): Promise<FileStorageInitInfo> {
  await ensurePermission(root);
  await cleanupOrphanTempFiles(root);

  // Clean orphan tmps under sessions/ too, if the directory exists.
  try {
    const sessionsDir = await root.getDirectoryHandle(SESSIONS_DIR);
    await cleanupOrphanTempFiles(sessionsDir);
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
  }

  const metaResult = await readJsonFile<StoredMeta>(root, META_FILE);
  if (!metaResult.found) {
    logBreadcrumb('file-storage: init', 'empty directory, no existing state');
    return { state: null, hasExistingData: false };
  }
  const meta = metaResult.value as StoredMeta;
  const recoveryActions: string[] = [];
  if (meta.writeInProgress || meta.migrationInProgress) {
    recoveryActions.push(`writeInProgress=${!!meta.writeInProgress}`);
    recoveryActions.push(`migrationInProgress=${!!meta.migrationInProgress}`);
    logWarning(
      'fileStorage',
      `Previous write did not complete cleanly (${recoveryActions.join(', ')}); loading last good state.`,
    );
  }

  // Validate file layout version; we only understand v1.
  if (typeof meta.fileLayoutVersion !== 'number' || meta.fileLayoutVersion > FILE_LAYOUT_VERSION) {
    throw makeInitError(
      'FILE_CORRUPT',
      `Unsupported fileLayoutVersion=${meta.fileLayoutVersion} (supported: <=${FILE_LAYOUT_VERSION})`,
    );
  }

  // Read top-level files in parallel.
  const [settings, workspaces, folders, categoryOrder, bin, ledger] = await Promise.all([
    readJsonFile<unknown>(root, SETTINGS_FILE),
    readJsonFile<unknown>(root, WORKSPACES_FILE),
    readJsonFile<unknown>(root, FOLDERS_FILE),
    readJsonFile<unknown>(root, CATEGORY_ORDER_FILE),
    readJsonFile<unknown>(root, BIN_FILE),
    readJsonFile<unknown>(root, LEDGER_FILE),
  ]);

  const sessions = await readSessions(root);

  const parts: FileParts = {
    meta: {
      version: typeof meta.version === 'number' ? meta.version : SCHEMA_VERSION,
      mutationRevision: typeof meta.mutationRevision === 'number' ? meta.mutationRevision : 0,
      activeWorkspaceId: meta.activeWorkspaceId || '',
      createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : nowIso(),
      updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : nowIso(),
      fileLayoutVersion: typeof meta.fileLayoutVersion === 'number'
        ? meta.fileLayoutVersion
        : FILE_LAYOUT_VERSION,
    },
    settings: (settings.found ? settings.value : {}) as FileParts['settings'],
    workspaces: (workspaces.found ? workspaces.value : []) as FileParts['workspaces'],
    folders: (folders.found ? folders.value : []) as FileParts['folders'],
    categoryOrderByWorkspace:
      (categoryOrder.found ? categoryOrder.value : {}) as FileParts['categoryOrderByWorkspace'],
    bin: (bin.found ? bin.value : []) as FileParts['bin'],
    dropOperationLedger:
      (ledger.found ? ledger.value : []) as FileParts['dropOperationLedger'],
    sessions,
  };

  const state = assembleState(parts);
  logBreadcrumb('file-storage: read', `revision=${state.mutationRevision} sessions=${sessions.size}${recoveryActions.length ? ` recovery=${recoveryActions.join(',')}` : ''}`);
  return { state, hasExistingData: true };
}

// ---------- adapter ----------

interface FileStorageAdapterDeps {
  /** Test seam: if provided, setState waits on this lock between write phases. */
  locks?: {
    beforeMetaWrite?: () => Promise<void> | void;
    beforeFinalMeta?: () => Promise<void> | void;
  };
}

const STATE_CHANGED_EVENT = 'state-changed';

class FileStorageAdapterImpl implements StorageAdapter {
  private root: FileSystemDirectoryHandle;
  private cachedState: TabBoardState | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private eventTarget = new EventTarget();
  private deps: FileStorageAdapterDeps;

  constructor(root: FileSystemDirectoryHandle, deps: FileStorageAdapterDeps = {}) {
    this.root = root;
    this.deps = deps;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }
    this.initPromise = (async () => {
      const info = await initFileStorageDirectory(this.root);
      this.cachedState = info.state ? clone(info.state) : null;
      this.initialized = true;
    })();
    await this.initPromise;
  }

  async getState(): Promise<TabBoardState> {
    await this.ensureInitialized();
    if (!this.cachedState) {
      // Shouldn't normally happen because ensureState seeds default first,
      // but fall back to an empty normalized state to stay safe.
      return normalizeState(null);
    }
    return clone(this.cachedState);
  }

  /**
   * Re-read all files from disk and update cache. Used by the active adapter
   * layer when a cross-context ping indicates another context wrote newer data.
   * Notifies same-context subscribers if the state actually changed.
   */
  async reloadFromDisk(): Promise<void> {
    // Wait for any in-flight write in THIS context to settle before reading
    // so we do not observe a writeInProgress=true meta from our own commit.
    await this.writeQueue.catch(() => undefined);
    // Bypass ensureInitialized's cached-state fast path by forcing a fresh read.
    const info = await initFileStorageDirectory(this.root);
    const next = info.state ? clone(info.state) : null;
    this.initialized = true;
    this.initPromise = null;
    const changed = !statesEqual(this.cachedState, next);
    this.cachedState = next;
    if (changed && next) {
      this.dispatchStateChanged(clone(next));
    }
  }

  async setState(nextState: TabBoardState): Promise<void> {
    await this.ensureInitialized();
    const done = this.writeQueue.then(async () => {
      await this.writeCommit(nextState);
    });
    // Chain rejections into the queue without stopping future writes from chaining.
    this.writeQueue = done.catch(() => undefined);
    await done;
  }

  private async writeCommit(nextState: TabBoardState): Promise<void> {
    const start = Date.now();
    const cached = this.cachedState;
    const parts = splitState(nextState);

    // Session diff: which sessions to write vs delete.
    const toWrite: Array<{ id: string; group: Group }> = [];
    const nextGroupIds = new Set<string>();
    for (const [id, group] of parts.sessions) {
      nextGroupIds.add(id);
      if (!cached || !cached.groups.some((g) => g.id === id && groupsEqual(g, group))) {
        toWrite.push({ id, group });
      }
    }
    const toDelete: string[] = [];
    if (cached) {
      for (const g of cached.groups) {
        if (!nextGroupIds.has(g.id)) toDelete.push(g.id);
      }
    }

    // Ensure sessions/ directory exists.
    await this.root.getDirectoryHandle(SESSIONS_DIR, { create: true });

    // Phase 1: write meta with writeInProgress:true.
    const inProgressMeta: StoredMeta = {
      version: parts.meta.version,
      mutationRevision: parts.meta.mutationRevision,
      activeWorkspaceId: parts.meta.activeWorkspaceId,
      createdAt: parts.meta.createdAt,
      updatedAt: parts.meta.updatedAt,
      fileLayoutVersion: parts.meta.fileLayoutVersion,
      writeInProgress: true,
    };
    await atomicWriteFile(this.root, META_FILE, serializeJson(inProgressMeta));

    if (this.deps.locks?.beforeMetaWrite) {
      await this.deps.locks.beforeMetaWrite();
    }

    // Phase 2: write changed sessions, delete removed ones, write top-level files.
    // Session writes with concurrency 5.
    await pooledMap(toWrite, 5, async ({ id, group }) => {
      await writeSessionFile(this.root, id, group);
    });
    // Deletes are independent and cheap.
    await Promise.all(
      toDelete.map(async (id) => deleteSessionFile(this.root, id)),
    );

    // Top-level files in parallel.
    await Promise.all([
      atomicWriteFile(this.root, SETTINGS_FILE, serializeJson(parts.settings)),
      atomicWriteFile(this.root, WORKSPACES_FILE, serializeJson(parts.workspaces)),
      atomicWriteFile(this.root, FOLDERS_FILE, serializeJson(parts.folders)),
      atomicWriteFile(this.root, CATEGORY_ORDER_FILE, serializeJson(parts.categoryOrderByWorkspace)),
      atomicWriteFile(this.root, BIN_FILE, serializeJson(parts.bin)),
      atomicWriteFile(this.root, LEDGER_FILE, serializeJson(parts.dropOperationLedger)),
    ]);

    if (this.deps.locks?.beforeFinalMeta) {
      await this.deps.locks.beforeFinalMeta();
    }

    // Phase 3: write final meta without writeInProgress. revision/updatedAt come
    // from nextState (the caller is responsible for bumping them before setState).
    const finalMeta: StoredMeta = {
      version: parts.meta.version,
      mutationRevision: nextState.mutationRevision,
      activeWorkspaceId: parts.meta.activeWorkspaceId,
      createdAt: parts.meta.createdAt,
      updatedAt: nextState.updatedAt,
      fileLayoutVersion: parts.meta.fileLayoutVersion,
      writeInProgress: false,
    };
    await atomicWriteFile(this.root, META_FILE, serializeJson(finalMeta));

    // Update cache.
    const committedState: TabBoardState = clone(nextState);
    this.cachedState = committedState;

    // Same-context notification.
    this.dispatchStateChanged(committedState);

    const duration = Date.now() - start;
    logBreadcrumb('file-storage: write', `revision=${nextState.mutationRevision} wrote=${toWrite.length} deleted=${toDelete.length} duration=${duration}ms`);

    // Cross-context ping.
    try {
      if (globalThis.chrome?.storage?.local?.set) {
        await globalThis.chrome.storage.local.set({
          [FILE_PING_KEY]: {
            mutationRevision: nextState.mutationRevision,
            updatedAt: nextState.updatedAt,
          },
        });
      }
    } catch (err) {
      // Ping failure should not fail the whole write — data is durably on disk.
      logWarning('fileStorage', 'Failed to write cross-context ping after commit', err);
    }
  }

  private dispatchStateChanged(state: TabBoardState): void {
    // We use a CustomEvent so subscribers get the state in event.detail.
    const ev = new CustomEvent<TabBoardState>(STATE_CHANGED_EVENT, { detail: state });
    this.eventTarget.dispatchEvent(ev);
  }

  async ensureState(): Promise<TabBoardState> {
    await this.ensureInitialized();
    if (this.cachedState) {
      return clone(this.cachedState);
    }
    // Seed default state if uninitialized.
    const seed = createEmptyState();
    await this.setState(seed);
    // setState sets cachedState; return a clone.
    const current = this.cachedState;
    if (!current) {
      // Defensive: setState just completed, cachedState should always be set.
      return normalizeState(null);
    }
    return clone(current);
  }

  subscribeState(callback: (state: TabBoardState) => void): () => void {
    const listener = (event: Event) => {
      const ce = event as CustomEvent<TabBoardState>;
      callback(clone(ce.detail));
    };
    this.eventTarget.addEventListener(STATE_CHANGED_EVENT, listener as EventListener);
    return () => {
      this.eventTarget.removeEventListener(STATE_CHANGED_EVENT, listener as EventListener);
    };
  }
}

/**
 * Create a FileStorageAdapter bound to `root`. The returned adapter has
 * already completed initial load; if the directory contains committed data
 * it will be loaded (recovering from any crashed writes), otherwise the
 * adapter starts with no state and ensureState() will seed defaults.
 */
export async function createFileStorageAdapter(
  root: FileSystemDirectoryHandle,
  deps?: FileStorageAdapterDeps,
): Promise<StorageAdapter> {
  const adapter = new FileStorageAdapterImpl(root, deps);
  await (adapter as unknown as { ensureInitialized(): Promise<void> }).ensureInitialized();
  return adapter;
}

// ---------- equality helper for session diff ----------

function groupsEqual(a: Group, b: Group): boolean {
  // Shallow-safe compare: use serialized JSON. The groups are plain data
  // (no functions/DOM nodes) so structural equality via JSON is acceptable
  // and avoids pulling in a deep-equal dependency.
  return JSON.stringify(a) === JSON.stringify(b);
}

function statesEqual(a: TabBoardState | null, b: TabBoardState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
