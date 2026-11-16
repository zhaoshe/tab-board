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
 * left true; readers use the complete recovery snapshot. The next commit
 * repairs every data file before publishing a new revision.
 *
 * Same-context subscribers are notified via an internal EventTarget;
 * cross-context notification is done by writing FILE_PING_KEY to
 * chrome.storage.local after each successful commit (the active adapter
 * layer listens for that ping elsewhere).
 */

import {
  BOOTSTRAP_KEY,
  FILE_LAYOUT_VERSION,
  FILE_PING_KEY,
  SETTINGS_PROJECTION_KEY,
  SCHEMA_VERSION,
} from '../model/constants';
import {
  clone,
  createEmptyState,
  createId,
  normalizeState,
  nowIso,
  type TabBoardState,
} from '../model';
import { sameOrigin, type OriginScope, newOrigin, readRestoreMetadata, restoreError, type BoundSnapshot, type RestoreMetadata } from './restoreCommit';
import type { Group } from '../model/types';
import { logBreadcrumb, logWarning } from '../utils/diagnostics';
import {
  atomicWriteFile,
  atomicDeleteFile,
  cleanupOrphanTempFiles,
  deleteSessionFile,
  readTextFile,
  readSessionFile,
  writeSessionFile,
} from './fsAtomic';
import {
  assembleState,
  parseJsonFile,
  serializeJson,
  splitState,
  type FileParts,
} from './fileSerialization';
import type {
  AdapterInitError,
  FileStorageAdapter,
  StateWriteOptions,
  StorageObservation,
} from './storageAdapter';
import { fileStorageStatus, projectionFromState } from './settingsProjection';
import { readStorageStatusProjection, writeStorageStatusProjection } from './fsBootstrap';

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
const RECOVERY_FILE = '.tabboard-recovery.json';

interface StoredMeta {
  restoreMetadata?: RestoreMetadata;
  version: number;
  mutationRevision: number;
  activeWorkspaceId: string;
  createdAt: string;
  updatedAt: string;
  fileLayoutVersion: number;
  sessionOrder?: string[];
  writeInProgress?: boolean;
  migrationInProgress?: boolean;
  pendingRevision?: number;
  commitId?: string;
  recoveryFile?: string;
}

interface RecoverySnapshot {
  restoreMetadata?: RestoreMetadata;
  commitId: string;
  state: TabBoardState | null;
  unreadSessionFiles?: string[];
}

function isRecoveryFileName(value: unknown): value is string {
  return typeof value === 'string'
    && (value === RECOVERY_FILE || /^\.tabboard-recovery-[a-z0-9_-]+\.json$/i.test(value));
}

async function cleanupPreviousRecoveryFiles(root: FileSystemDirectoryHandle, keep: string): Promise<void> {
  const obsolete: string[] = [];
  for await (const [name, handle] of asPermissionable(root).entries()) {
    if (handle.kind === 'file' && name !== keep && isRecoveryFileName(name)) obsolete.push(name);
  }
  for (const name of obsolete) await atomicDeleteFile(root, name);
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

async function settleOperations(operations: readonly Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(operations);
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason;
  }
}

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
  await settleOperations(workers);
  return results;
}

// ---------- init: reading from disk ----------

export interface FileStorageInitInfo {
  restoreMetadata?: RestoreMetadata;
  state: TabBoardState | null;
  hasExistingData: boolean;
  fileUpdatedAt: string | null;
  requiresRepair?: boolean;
  unreadSessionFiles?: string[];
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

async function readSessions(root: FileSystemDirectoryHandle): Promise<{ sessions: Map<string, Group>; unreadSessionFiles: string[] }> {
  let sessionsDir: FileSystemDirectoryHandle;
  try {
    sessionsDir = await root.getDirectoryHandle(SESSIONS_DIR);
  } catch (err) {
    if (isNotFoundError(err)) {
      sessionsDir = await root.getDirectoryHandle(SESSIONS_DIR, { create: true });
      return { sessions: new Map(), unreadSessionFiles: [] };
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
  const unreadSessionFiles: string[] = [];
  if (fileEntries.length === 0) return { sessions: groups, unreadSessionFiles };

  const loaded = await pooledMap(fileEntries, 10, async ({ name }) => {
    const sessionId = name.slice(0, -'.json'.length);
    const fh = await sessionsDir.getFileHandle(name);
    const text = await readTextFile(fh);
    try {
      const group = parseJsonFile<Group>(text, name);
      if (!group || group.id !== sessionId || !Array.isArray(group.tabs)) throw new Error('Invalid session identity or tab list.');
      return { sessionId, group };
    } catch (err) {
      logWarning('fileStorage', `Corrupt session file "${name}" — skipping.`, err);
      return { sessionId, group: null as Group | null };
    }
  });
  for (const { sessionId, group } of loaded) {
    if (group) groups.set(sessionId, group);
    else unreadSessionFiles.push(`${sessionId}.json`);
  }
  return { sessions: groups, unreadSessionFiles };
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

  return readCommittedDirectory(root);
}

export async function saveReconnectCopies(
  root: FileSystemDirectoryHandle,
  browserState: TabBoardState,
  fileState: TabBoardState,
): Promise<void> {
  await settleOperations([
    atomicWriteFile(root, '.tabboard-reconnect-browser.json', serializeJson(normalizeState(browserState))),
    atomicWriteFile(root, '.tabboard-reconnect-file.json', serializeJson(normalizeState(fileState))),
  ]);
}

async function readCommittedDirectory(
  root: FileSystemDirectoryHandle,
  attempt = 0,
): Promise<FileStorageInitInfo> {
  if (attempt >= 4) {
    throw makeInitError('ADAPTER_INIT_FAILED', 'The file store changed repeatedly while reading. Try again.');
  }

  const metaResult = await readJsonFile<StoredMeta>(root, META_FILE);
  if (!metaResult.found) {
    logBreadcrumb('file-storage: init', 'empty directory, no existing state');
    return { state: null, hasExistingData: false, fileUpdatedAt: null };
  }
  const meta = metaResult.value as StoredMeta;
  if (!meta || typeof meta.fileLayoutVersion !== 'number' || meta.fileLayoutVersion > FILE_LAYOUT_VERSION) {
    throw makeInitError('FILE_CORRUPT', `Unsupported file layout (supported: <=${FILE_LAYOUT_VERSION}).`);
  }
  const metaChanged = async () => serializeJson(meta)
    !== serializeJson((await readJsonFile<StoredMeta>(root, META_FILE)).value);
  const recoveryActions: string[] = [];
  if (meta.writeInProgress || meta.migrationInProgress) {
    recoveryActions.push(`writeInProgress=${!!meta.writeInProgress}`);
    recoveryActions.push(`migrationInProgress=${!!meta.migrationInProgress}`);
    logWarning(
      'fileStorage',
      `Previous write did not complete cleanly (${recoveryActions.join(', ')}).`,
    );
  }

  if (meta.writeInProgress && meta.pendingRevision !== undefined) {
    const recoveryFile = meta.recoveryFile ?? RECOVERY_FILE;
    if (!isRecoveryFileName(recoveryFile)) throw makeInitError('FILE_CORRUPT', 'Invalid recovery snapshot filename.');
    let saved: Awaited<ReturnType<typeof readJsonFile<RecoverySnapshot>>>;
    try {
      saved = await readJsonFile<RecoverySnapshot>(root, recoveryFile);
    } catch (error) {
      if (await metaChanged()) return readCommittedDirectory(root, attempt + 1);
      throw error;
    }
    if (await metaChanged()) return readCommittedDirectory(root, attempt + 1);
    const snapshot = saved.value;
    if (!snapshot || snapshot.commitId !== meta.commitId
      || (snapshot.state !== null && (!Array.isArray(snapshot.state?.groups)
        || !Array.isArray(snapshot.state?.workspaces)
        || snapshot.state.mutationRevision !== meta.mutationRevision))) {
      throw makeInitError('FILE_CORRUPT', 'The interrupted file transaction has no valid recovery snapshot.');
    }
    const state = snapshot.state === null ? null : normalizeState(snapshot.state);
    logBreadcrumb('file-storage: recovery', `restored complete revision=${state?.mutationRevision ?? 'empty'}`);
    return {
      state,
      restoreMetadata: readRestoreMetadata(snapshot.restoreMetadata, 'file'),
      hasExistingData: state !== null,
      fileUpdatedAt: state?.updatedAt ?? null,
      requiresRepair: true,
      ...(snapshot.unreadSessionFiles?.length ? { unreadSessionFiles: snapshot.unreadSessionFiles } : {}),
    };
  }

  // Read top-level files in parallel.
  const readFiles = async () => {
    const [settings, workspaces, folders, categoryOrder, bin, ledger] = await Promise.all([
      readJsonFile<unknown>(root, SETTINGS_FILE),
      readJsonFile<unknown>(root, WORKSPACES_FILE),
      readJsonFile<unknown>(root, FOLDERS_FILE),
      readJsonFile<unknown>(root, CATEGORY_ORDER_FILE),
      readJsonFile<unknown>(root, BIN_FILE),
      readJsonFile<unknown>(root, LEDGER_FILE),
    ]);
    return { settings, workspaces, folders, categoryOrder, bin, ledger, ...await readSessions(root) };
  };
  let files: Awaited<ReturnType<typeof readFiles>>;
  try {
    files = await readFiles();
  } catch (error) {
    if (await metaChanged()) return readCommittedDirectory(root, attempt + 1);
    throw error;
  }
  if (await metaChanged()) return readCommittedDirectory(root, attempt + 1);
  const { settings, workspaces, folders, categoryOrder, bin, ledger, sessions, unreadSessionFiles } = files;

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
      sessionOrder: Array.isArray(meta.sessionOrder)
        ? meta.sessionOrder.filter((id): id is string => typeof id === 'string')
        : [...sessions.keys()],
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
  return {
    state,
    restoreMetadata: readRestoreMetadata(meta.restoreMetadata, 'file'),
    hasExistingData: true,
    fileUpdatedAt: parts.meta.updatedAt,
    ...(unreadSessionFiles.length ? { unreadSessionFiles } : {}),
    ...(meta.writeInProgress || meta.migrationInProgress ? { requiresRepair: true } : {}),
  };
}

// ---------- adapter ----------

interface FileStorageAdapterDeps {
  /** Test seam: if provided, setState waits on this lock between write phases. */
  locks?: {
    beforeMetaWrite?: () => Promise<void> | void;
    beforeFinalMeta?: () => Promise<void> | void;
  };
  shouldPublishPing?: () => boolean;
}

const STATE_CHANGED_EVENT = 'state-changed';

class FileStorageAdapterImpl implements FileStorageAdapter {
  private restoreMetadata?: RestoreMetadata;
  private root: FileSystemDirectoryHandle;
  private cachedState: TabBoardState | null = null;
  private fileUpdatedAt: string | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private eventTarget = new EventTarget();
  private deps: FileStorageAdapterDeps;
  private requiresFullWrite = false;
  private unreadSessionFiles: string[] = [];

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
      this.restoreMetadata = info.restoreMetadata;
      this.cachedState = info.state ? clone(info.state) : null;
      this.fileUpdatedAt = info.fileUpdatedAt;
      this.requiresFullWrite = !!info.requiresRepair;
      this.unreadSessionFiles = info.unreadSessionFiles ?? [];
      this.initialized = true;
    })();
    await this.initPromise;
  }

  async getBoundState(expectedOrigin?: OriginScope, initializeLegacy = true): Promise<BoundSnapshot> {
    await this.writeQueue.catch(() => undefined);
    const info = await initFileStorageDirectory(this.root);
    this.cachedState = info.state ? clone(info.state) : null;
    this.restoreMetadata = info.restoreMetadata;
    this.fileUpdatedAt = info.fileUpdatedAt;
    this.requiresFullWrite = !!info.requiresRepair;
    this.unreadSessionFiles = info.unreadSessionFiles ?? [];
    this.initialized = true;
    if (expectedOrigin && !sameOrigin(expectedOrigin, this.restoreMetadata?.origin)) throw restoreError('RESTORE_ORIGIN_CHANGED', 'Folder storage origin does not match its binding.');
    if (!this.restoreMetadata) {
      if (!initializeLegacy) throw restoreError('RESTORE_ORIGIN_UNAVAILABLE', 'The folder has no registered restore origin.');
      if (info.requiresRepair) throw restoreError('RESTORE_ORIGIN_UNAVAILABLE', 'The interrupted folder has no committed restore origin. Reconnect it first.');
      await this.setRestoreMetadata({ origin: newOrigin('file'), receipts: [] });
    }
    return { state: normalizeState(this.cachedState), metadata: clone(this.restoreMetadata!) };
  }

  async setRestoreMetadata(metadata: RestoreMetadata | undefined): Promise<void> {
    await this.writeQueue.catch(() => undefined);
    const meta = (await readJsonFile<StoredMeta>(this.root, META_FILE)).value;
    if (!meta || meta.writeInProgress || meta.migrationInProgress) throw restoreError('RESTORE_ORIGIN_UNAVAILABLE', 'Reconnect the folder after its interrupted write has been repaired.');
    await atomicWriteFile(this.root, META_FILE, serializeJson({ ...meta, restoreMetadata: metadata }));
    this.restoreMetadata = metadata ? clone(metadata) : undefined;
  }

  getStateOrigin(): OriginScope | undefined {
    return this.restoreMetadata ? { ...this.restoreMetadata.origin } : undefined;
  }

  async getState(): Promise<TabBoardState> {
    await this.ensureInitialized();
    await this.refreshCommittedSnapshot();
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
  async reloadFromDisk(observation?: StorageObservation): Promise<void> {
    // Wait for any in-flight write in THIS context to settle before reading
    // so we do not observe a writeInProgress=true meta from our own commit.
    await this.writeQueue.catch(() => undefined);
    // Bypass ensureInitialized's cached-state fast path by forcing a fresh read.
    const info = await initFileStorageDirectory(this.root);
    this.restoreMetadata = info.restoreMetadata;
    const next = info.state ? clone(info.state) : null;
    this.fileUpdatedAt = info.fileUpdatedAt;
    this.requiresFullWrite = !!info.requiresRepair;
    this.unreadSessionFiles = info.unreadSessionFiles ?? [];
    this.initialized = true;
    this.initPromise = null;
    const changed = !statesEqual(this.cachedState, next);
    this.cachedState = next;
    if ((changed || observation?.kind === 'explicit-reread') && next) {
      this.dispatchStateChanged(clone(next), observation);
    }
    if (this.deps.shouldPublishPing?.() !== false) {
      const status = await readStorageStatusProjection();
      if (this.deps.shouldPublishPing?.() !== false
        && status.activeBackend === 'file' && status.folderName === this.root.name) {
        await writeStorageStatusProjection(fileStorageStatus({
          folderName: this.root.name, fileUpdatedAt: this.fileUpdatedAt,
          unreadSessionCount: this.unreadSessionFiles.length,
          activeOrigin: this.restoreMetadata?.origin,
        }));
      }
    }
  }

  async setState(nextState: TabBoardState, options?: StateWriteOptions): Promise<void> {
    await this.ensureInitialized();
    const done = this.writeQueue.then(async () => {
      try {
        await this.writeCommit(normalizeState(nextState), options);
      } catch (error) {
        this.requiresFullWrite = true;
        throw error;
      }
    });
    // Chain rejections into the queue without stopping future writes from chaining.
    this.writeQueue = done.catch(() => undefined);
    await done;
  }

  private async refreshCommittedSnapshot(): Promise<void> {
    // A peer can publish auxiliary receipts even when canonical clocks tie.
    // Read the commit point on every write; reload data only if it advanced or
    // requires recovery, retaining the ordinary equal-file write optimization.
    const publishedMeta = (await readJsonFile<StoredMeta>(this.root, META_FILE)).value;
    const publishedMetadata = readRestoreMetadata(publishedMeta?.restoreMetadata, 'file');
    const originChanged = (!!this.restoreMetadata || !!publishedMetadata) && !sameOrigin(this.restoreMetadata?.origin, publishedMetadata?.origin);
    if (publishedMeta && (originChanged || publishedMeta.writeInProgress || publishedMeta.migrationInProgress
      || publishedMeta.mutationRevision !== this.cachedState?.mutationRevision
      || publishedMeta.updatedAt !== this.cachedState?.updatedAt)) {
      const info = await readCommittedDirectory(this.root);
      this.cachedState = info.state ? clone(info.state) : null;
      this.restoreMetadata = info.restoreMetadata;
      this.requiresFullWrite = !!info.requiresRepair;
      this.unreadSessionFiles = info.unreadSessionFiles ?? [];
    } else {
      this.restoreMetadata = publishedMetadata;
    }
  }

  private async writeCommit(nextState: TabBoardState, options?: StateWriteOptions): Promise<void> {
    const start = Date.now();
    await this.refreshCommittedSnapshot();
    const cached = this.cachedState;
    const parts = splitState(nextState);
    const previousParts = cached ? splitState(cached) : null;
    const fullWrite = !!options?.backupBeforeRestore || this.requiresFullWrite || !previousParts;

    // Session diff: which sessions to write vs delete.
    const toWrite: Array<{ id: string; group: Group }> = [];
    const nextGroupIds = new Set<string>();
    for (const [id, group] of parts.sessions) {
      nextGroupIds.add(id);
      const previousGroup = previousParts?.sessions.get(id);
      if (fullWrite || !previousGroup || !groupsEqual(previousGroup, group)) {
        toWrite.push({ id, group });
      }
    }
    const toDelete: string[] = [];
    if (options?.backupBeforeRestore || this.requiresFullWrite) {
      const sessionsDir = await this.root.getDirectoryHandle(SESSIONS_DIR, { create: true });
      for await (const [name, handle] of asPermissionable(sessionsDir).entries()) {
        if (handle.kind !== 'file' || !name.endsWith('.json') || nextGroupIds.has(name.slice(0, -5))) continue;
        if (this.unreadSessionFiles.includes(name)) continue;
        const group = await readSessionFile(sessionsDir, name.slice(0, -5));
        if (group && group.id === name.slice(0, -5) && Array.isArray(group.tabs)) toDelete.push(name.slice(0, -5));
        else this.unreadSessionFiles.push(name);
      }
    } else if (cached) {
      for (const g of cached.groups) {
        if (!nextGroupIds.has(g.id)) toDelete.push(g.id);
      }
    }

    // Ensure sessions/ directory exists.
    await this.root.getDirectoryHandle(SESSIONS_DIR, { create: true });

    if (options?.backupBeforeRestore) {
      await atomicWriteFile(this.root, '.tabboard-before-restore.json', serializeJson(normalizeState(options.backupBeforeRestore)));
    }
    // Preserve unread bytes before any same-ID replacement, including reconnect.
    const unreadToPreserve = options?.backupBeforeRestore
      ? this.unreadSessionFiles
      : this.unreadSessionFiles.filter(name => toWrite.some(({ id }) => name === `${id}.json`));
    if (unreadToPreserve.length) {
      const preserved = await this.root.getDirectoryHandle('.tabboard-unread-before-restore', { create: true });
      const sessions = await this.root.getDirectoryHandle(SESSIONS_DIR);
      for (const name of unreadToPreserve) {
        let backupName = name;
        while (true) {
          try {
            await preserved.getFileHandle(backupName);
            backupName = `${createId('unread')}-${name}`;
          } catch (error) {
            if (!isNotFoundError(error)) throw error;
            break;
          }
        }
        const original = await (await sessions.getFileHandle(name)).getFile();
        await atomicWriteFile(preserved, backupName, await original.arrayBuffer());
      }
    }

    // Persist the previous snapshot before any file can be replaced or removed.
    const commitId = createId('file-commit');
    const recoveryFile = `.tabboard-recovery-${commitId}.json`;
    await atomicWriteFile(this.root, recoveryFile, serializeJson({ commitId, state: cached, restoreMetadata: this.restoreMetadata, unreadSessionFiles: this.unreadSessionFiles }));
    const previous = splitState(cached ?? createEmptyState()).meta;

    // Phase 1 keeps the committed revision; pendingRevision names the candidate.
    const inProgressMeta: StoredMeta = {
      ...previous,
      restoreMetadata: this.restoreMetadata,
      writeInProgress: true,
      pendingRevision: parts.meta.mutationRevision,
      commitId,
      recoveryFile,
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
    await settleOperations(
      toDelete.map(async (id) => deleteSessionFile(this.root, id)),
    );

    // Ordinary commits skip equal files; recovery and restore replace every file.
    const topLevelFiles = [
      [SETTINGS_FILE, 'settings'],
      [WORKSPACES_FILE, 'workspaces'],
      [FOLDERS_FILE, 'folders'],
      [CATEGORY_ORDER_FILE, 'categoryOrderByWorkspace'],
      [BIN_FILE, 'bin'],
      [LEDGER_FILE, 'dropOperationLedger'],
    ] as const;
    await settleOperations(topLevelFiles
      .filter(([, key]) => fullWrite || JSON.stringify(parts[key]) !== JSON.stringify(previousParts![key]))
      .map(([filename, key]) => atomicWriteFile(this.root, filename, serializeJson(parts[key]))));

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
      sessionOrder: parts.meta.sessionOrder,
      writeInProgress: false,
      restoreMetadata: options?.restoreMetadata ?? this.restoreMetadata,
      commitId,
      recoveryFile,
    };
    await atomicWriteFile(this.root, META_FILE, serializeJson(finalMeta));

    // Update cache.
    const committedState: TabBoardState = clone(nextState);
    this.cachedState = committedState;
    this.restoreMetadata = finalMeta.restoreMetadata;
    this.fileUpdatedAt = nextState.updatedAt;
    this.requiresFullWrite = false;
    this.unreadSessionFiles = this.unreadSessionFiles.filter(name => !nextGroupIds.has(name.slice(0, -5)));

    // Same-context notification.
    this.dispatchStateChanged(committedState);

    const duration = Date.now() - start;
    logBreadcrumb('file-storage: write', `revision=${nextState.mutationRevision} wrote=${toWrite.length} deleted=${toDelete.length} duration=${duration}ms`);

    // Cross-context ping.
    try {
      if (this.deps.shouldPublishPing?.() !== false && globalThis.chrome?.storage?.local?.set) {
        await globalThis.chrome.storage.local.set({
          [BOOTSTRAP_KEY]: fileStorageStatus({
            folderName: this.root.name || null,
            fileUpdatedAt: nextState.updatedAt,
            unreadSessionCount: this.unreadSessionFiles.length,
            activeOrigin: this.restoreMetadata?.origin,
          }),
          [SETTINGS_PROJECTION_KEY]: projectionFromState(nextState),
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
    try {
      await cleanupPreviousRecoveryFiles(this.root, recoveryFile);
    } catch (error) {
      logWarning('fileStorage', 'Committed file data, but could not clean older recovery snapshots', error);
    }
  }

  getFileUpdatedAt(): string | null {
    return this.fileUpdatedAt;
  }

  getUnreadSessionCount(): number {
    return this.unreadSessionFiles.length;
  }

  private dispatchStateChanged(state: TabBoardState, observation?: StorageObservation): void {
    // We use a CustomEvent so subscribers get the state in event.detail.
    const ev = new CustomEvent<{ state: TabBoardState; observation?: StorageObservation }>(
      STATE_CHANGED_EVENT,
      { detail: { state, observation: { ...observation, ...(this.restoreMetadata ? { origin: this.restoreMetadata.origin } : {}) } } },
    );
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

  subscribeState(callback: (state: TabBoardState, observation?: StorageObservation) => void): () => void {
    const listener = (event: Event) => {
      const ce = event as CustomEvent<{ state: TabBoardState; observation?: StorageObservation }>;
      callback(clone(ce.detail.state), ce.detail.observation);
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
): Promise<FileStorageAdapter> {
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
