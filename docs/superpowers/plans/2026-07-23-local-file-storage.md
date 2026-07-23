# Local File Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users choose a local filesystem directory as TabBoard's primary data store (instead of `chrome.storage.local`), with per-session JSON files, atomic writes, automatic fallback on failure, bi-directional migration, and Options-page controls.

**Architecture:** Abstract all persistence behind a `StorageAdapter` interface (`getState`/`setState`/`ensureState`/`subscribeState`). Refactor the existing chrome.storage logic into `ChromeStorageAdapter`. Build `FileStorageAdapter` that reads/writes a directory of JSON files (meta + top-level entity files + `sessions/<id>.json`), using the File System Access API with handles persisted in IndexedDB. A small bootstrap key (`tabboardStorageConfig`) in chrome.storage selects the active backend on startup. Cross-context notifications reuse `chrome.storage.onChanged` via a tiny ping key. The service worker uses the same adapter and persists the FileSystemDirectoryHandle from IndexedDB.

**Tech Stack:** React 18, TypeScript, Zustand 4, Mantine 7, Chrome Extension MV3 APIs, File System Access API (`showDirectoryPicker`, `FileSystemDirectoryHandle`, `FileSystemFileHandle`), IndexedDB (raw API, no wrapper library), Vitest, happy-dom.

## Global Constraints

- Do not add new runtime dependencies (no `idb` wrapper; use raw IndexedDB).
- Do not add new manifest permissions; File System Access API needs none.
- No new npm packages (dev or runtime) without explicit justification; `fake-indexeddb` may be added as a devDependency if IndexedDB mocking becomes necessary — explore manual in-memory IDB mock first.
- All file writes use temp-file + rename (or equivalent atomic replace) for crash safety.
- `meta.json` is the commit point: written last, carrying the authoritative `mutationRevision`.
- Existing `chrome.storage.local` behavior for `chrome.storage` mode must be byte-for-byte unchanged (all existing tests must continue to pass without modification).
- Every production change starts with a failing focused test.
- Diagnostic logging for all file-storage operations uses the existing `logBreadcrumb`/`logWarning`/`logError` under scope `file-storage`.
- Session filenames are `<id>.json` using existing IDs; no titles or unsafe characters in filenames.
- Final verification per task: `npm run build`, `npm run check`, `npm test`.

---

## File Map

New files to create:
- `src/shared/store/storageAdapter.ts` — `StorageAdapter` interface + adapter types
- `src/shared/store/chromeStorageAdapter.ts` — ChromeStorageAdapter wrapping existing functions
- `src/shared/store/fileStorage.ts` — FileStorageAdapter implementation
- `src/shared/store/fileSerialization.ts` — split state into file parts / assemble state from file parts
- `src/shared/store/fsAtomic.ts` — atomic write helpers (temp + rename), tmp cleanup
- `src/shared/store/fsDirectory.ts` — IndexedDB persistence for FileSystemDirectoryHandle
- `src/shared/store/fsBootstrap.ts` — `tabboardStorageConfig` bootstrap key read/write
- `src/shared/store/activeAdapter.ts` — adapter factory: reads bootstrap, picks adapter, fallback
- `src/shared/store/mergeStates.ts` — merge two TabBoardStates (for migration merge)
- `src/shared/store/fileStorage.test.ts` — FileStorageAdapter contract tests
- `src/shared/store/fileSerialization.test.ts` — split/assemble round-trip tests
- `src/shared/store/fsAtomic.test.ts` — atomic write and recovery tests
- `src/shared/store/fsDirectory.test.ts` — IndexedDB handle persistence tests
- `src/shared/store/activeAdapter.test.ts` — factory + fallback tests
- `src/shared/store/mergeStates.test.ts` — merge logic tests
- `src/shared/testing/memoryFs.ts` — in-memory `FileSystemDirectoryHandle`/`FileSystemFileHandle` mock
- `src/options/components/DataStorageCard.tsx` — Options page card
- `src/options/components/FolderPickerDialog.tsx` — folder picker + migration flow modal
- `src/options/components/DisconnectDialog.tsx` — stop-using-file-storage modal

Files to modify:
- `src/shared/model/types.ts` — add storage fields to Settings
- `src/shared/model/constants.ts` — add `FILE_LAYOUT_VERSION`, bootstrap key constant, ping key constant
- `src/shared/model/schema.ts` — normalize new settings fields to defaults
- `src/shared/model/index.ts` — re-export new constants/types as needed
- `src/shared/store/chromeStorage.ts` — re-export ChromeStorageAdapter-compatible functions; add ping helpers; eventually becomes thin re-export over `chromeStorageAdapter.ts`
- `src/background/service-worker.ts` — replace direct `getState/setState/ensureState` imports with active adapter; react to adapter-fallback messages; set up file ping cross-context notifier
- `src/background/service-worker.test.ts` — add test coverage for adapter initialization and fallback
- `src/shared/store/useTabBoardStore.ts` — switch to active adapter instead of direct chromeStorage imports; handle file-ping subscription
- `src/shared/hooks/useStoreHydration.ts` — may need adjustment for new subscription model (likely none if adapter.subscribeState matches old subscribeState)
- `src/options/OptionsApp.tsx` — add DataStorageCard
- `docs/feature-evolution.md` — new entry
- `docs/product-decisions.md` — tradeoffs
- `docs/technical-architecture.md` — new Storage Adapter and File Store sections
- `docs/feature-spec.md` — user-facing storage settings description

---

## Task 1: Add Storage Settings Fields and Constants

**Files:**
- Modify: `src/shared/model/types.ts:4-19`
- Modify: `src/shared/model/constants.ts:1-2` (near existing exports)
- Modify: `src/shared/model/schema.ts` (normalizeSettings block — find where settings defaults are applied)
- Test: `src/shared/model/schema.test.ts`

**Interfaces:**
- Adds to `Settings`: `storageMode: 'browser' | 'file'`; `storageFolderName: string`
- Adds constants: `FILE_LAYOUT_VERSION = 1`, `BOOTSTRAP_KEY = 'tabboardStorageConfig'`, `FILE_PING_KEY = 'tabboardFilePing'`, `FILE_STORE_DB = 'tabboard-fs'`, `FILE_STORE_STORE = 'handlers'`, `FILE_STORE_HANDLE_KEY = 'root'`

- [ ] **Step 1: Read current schema test to see where settings normalization is tested.**
- [ ] **Step 2: Add failing test** asserting default settings include `storageMode: 'browser'` and `storageFolderName: ''`, and that normalizeState fills them in for states missing them.
- [ ] **Step 3: Run the test** — expect FAIL (fields not in Settings yet).
- [ ] **Step 4: Update types** — add the two fields to the Settings interface in types.ts.
- [ ] **Step 5: Update DEFAULT_SETTINGS** in constants.ts to include `storageMode: 'browser'`, `storageFolderName: ''`.
- [ ] **Step 6: Add constants** `FILE_LAYOUT_VERSION = 1`, `BOOTSTRAP_KEY = 'tabboardStorageConfig'`, `FILE_PING_KEY = 'tabboardFilePing'`, `FILE_STORE_DB = 'tabboard-fs'`, `FILE_STORE_STORE = 'handlers'`, `FILE_STORE_HANDLE_KEY = 'root'`.
- [ ] **Step 7: Verify normalizeState** already spreads DEFAULT_SETTINGS correctly (it should) so new defaults flow through. Add explicit normalize guard if not.
- [ ] **Step 8: Run schema tests** — expect PASS.
- [ ] **Step 9: Run full `npm test`** — expect PASS (no regression).
- [ ] **Step 10: Commit**

```bash
git add src/shared/model/types.ts src/shared/model/constants.ts src/shared/model/schema.ts src/shared/model/schema.test.ts
git commit -m "feat(model): add storageMode/storageFolderName settings and file-storage constants

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 2: Define StorageAdapter Interface

**Files:**
- Create: `src/shared/store/storageAdapter.ts`
- Test: embed interface check in chromeStorageAdapter tests in Task 4 (no standalone test needed for an interface file)

**Interfaces:**
- Produces `StorageAdapter` interface and `StorageAdapterFactory`/`StorageMode` types used by all later tasks.

- [ ] **Step 1: Create `src/shared/store/storageAdapter.ts`**

```ts
import type { TabBoardState } from '../model';

export type StorageMode = 'browser' | 'file';

export interface StorageAdapter {
  getState(): Promise<TabBoardState>;
  setState(state: TabBoardState): Promise<void>;
  ensureState(): Promise<TabBoardState>;
  subscribeState(callback: (state: TabBoardState) => void): () => void;
}

export interface AdapterInitError extends Error {
  code: 'ADAPTER_INIT_FAILED' | 'PERMISSION_DENIED' | 'FILE_CORRUPT' | 'NO_HANDLE';
}
```

- [ ] **Step 2: Run `npm run build`** — expect PASS (file is type-only; no runtime).
- [ ] **Step 3: Commit**

```bash
git add src/shared/store/storageAdapter.ts
git commit -m "feat(store): define StorageAdapter interface

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 3: Build In-Memory FileSystem Mock for Testing

**Files:**
- Create: `src/shared/testing/memoryFs.ts`
- Create: `src/shared/testing/memoryFs.test.ts`

**Interfaces:**
- Produces `createMemoryDirectory(name?: string): MemoryDirectoryHandle` where `MemoryDirectoryHandle` satisfies the File System Access API subset used by FileStorageAdapter (entries, getFileHandle, getDirectoryHandle, removeEntry, resolve, keys, values). `MemoryFileHandle` supports `getFile()`, `createWritable()`, `isSameEntry()`, `name`, `kind`. Writable streams accumulate content and commit on `close()`.

This is the test harness for Tasks 5–9, so we need enough fidelity:
- Directories map names → handles.
- Writable stream writes to a buffer; on close it atomically flips the file's content.
- `getFile()` returns a File/Blob-like with `text()` method.
- No actual filesystem; all in memory.

- [ ] **Step 1: Write failing test** that creates a directory, creates a file in it, writes to it via a WritableStream, closes the stream, reads the file back, and asserts the content matches. Also test subdirectory creation and file removal.
- [ ] **Step 2: Run the test** — expect FAIL.
- [ ] **Step 3: Implement `memoryFs.ts`** implementing just enough of the API surface. Use `WritableStream` from the global (happy-dom/node should have it or we can use a simple writer object).
- [ ] **Step 4: Run the memoryFs test** — expect PASS.
- [ ] **Step 5: Commit**

```bash
git add src/shared/testing/memoryFs.ts src/shared/testing/memoryFs.test.ts
git commit -m "test: add in-memory File System Access API mock

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 4: Refactor chromeStorage into ChromeStorageAdapter

**Files:**
- Create: `src/shared/store/chromeStorageAdapter.ts`
- Modify: `src/shared/store/chromeStorage.ts` (re-export the adapter instance; keep existing function exports as wrappers so call sites don't break yet)
- Test: `src/shared/store/chromeStorage.test.ts` (extend, don't break)

**Interfaces:**
- Produces `createChromeStorageAdapter(): StorageAdapter` in chromeStorageAdapter.ts.
- The existing function-style API (`getState`, `setState`, `ensureState`, `subscribeState`, `sendStateMutations`, etc.) remains exported from `chromeStorage.ts` unchanged; they will be re-pointed at the adapter in a later task.

- [ ] **Step 1: Read `chromeStorage.ts` in full** and identify which of the 11 exported functions map to StorageAdapter methods vs which are out-of-band (sendStateMutations, ensureStateForHydration, getSettings, updateState, StatePersistenceError).
- [ ] **Step 2: Write failing test** for `createChromeStorageAdapter()` asserting it returns an object with the four methods, and that `getState()`/`setState()`/`ensureState()`/`subscribeState()` behave identically to the current standalone functions.
- [ ] **Step 3: Create `chromeStorageAdapter.ts`** that implements StorageAdapter using the existing logic extracted from chromeStorage.ts. Internal helpers (`getState`, `setState` as local functions) read/write `chrome.storage.local[STATE_KEY]`, run normalizeState, and subscribe to chrome.storage.onChanged for STATE_KEY.
- [ ] **Step 4: Make `chromeStorage.ts` import from the adapter** but keep the same exported function signatures by delegating to a default-constructed adapter instance. Keep `sendStateMutations`, `ensureStateForHydration`, `getSettings`, `updateState`, `StatePersistenceError` with their current implementations (they may call adapter methods internally).
- [ ] **Step 5: Run all existing chromeStorage tests** — expect PASS.
- [ ] **Step 6: Run full `npm test`** — expect PASS.
- [ ] **Step 7: Run `npm run build`** — expect PASS.
- [ ] **Step 8: Commit**

```bash
git add src/shared/store/chromeStorageAdapter.ts src/shared/store/chromeStorage.ts src/shared/store/chromeStorage.test.ts
git commit -m "refactor(store): wrap chrome.storage in ChromeStorageAdapter

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 5: State Serialization — Split and Assemble

**Files:**
- Create: `src/shared/store/fileSerialization.ts`
- Create: `src/shared/store/fileSerialization.test.ts`

**Interfaces:**
- Produces:
  - `splitState(state: TabBoardState): FileParts` — splits a TabBoardState into named file contents for meta, settings, workspaces, folders, categoryOrder, bin, ledger, and a map of session id → JSON string.
  - `assembleState(parts: FileParts): TabBoardState` — reverse of splitState, runs normalizeState.
  - `FileParts` type with fields for each top-level file and a `sessions: Map<string, Group>`.
  - `serializeJson(obj: unknown): string` — consistent 2-space pretty JSON used by all file writes.
  - `parseJsonFile<T>(text: string, filename: string): T` — JSON.parse wrapped with a descriptive error.

- [ ] **Step 1: Write failing tests** for round-trip (split → assemble → deepEqual original), for all 7 top-level fields being correctly populated, for sessions being one per id, and for assembleState calling normalizeState (invalid sessions filtered).
- [ ] **Step 2: Run tests** — expect FAIL.
- [ ] **Step 3: Implement splitState/assembleState.**
  - meta.json: `{ version: SCHEMA_VERSION, mutationRevision, activeWorkspaceId, createdAt, updatedAt, fileLayoutVersion: FILE_LAYOUT_VERSION }` (writeInProgress/migrationInProgress added by caller, not by split).
  - settings.json: state.settings
  - workspaces.json: `{ workspaces: state.workspaces }`
  - folders.json: `{ folders: state.folders }`
  - categoryOrder.json: `{ categoryOrderByWorkspace: state.categoryOrderByWorkspace }`
  - bin.json: `{ bin: state.bin }`
  - ledger.json: `{ dropOperationLedger: state.dropOperationLedger }`
  - sessions: a Map<sessionId, Group> (each group serialized independently).
- [ ] **Step 4: Run tests** — expect PASS.
- [ ] **Step 5: Run full `npm test`** — expect PASS.
- [ ] **Step 6: Commit**

```bash
git add src/shared/store/fileSerialization.ts src/shared/store/fileSerialization.test.ts
git commit -m "feat(store): split and assemble state into file parts

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 6: Atomic File Write Helpers

**Files:**
- Create: `src/shared/store/fsAtomic.ts`
- Create: `src/shared/store/fsAtomic.test.ts`

**Interfaces:**
- Produces:
  - `atomicWriteFile(parent: FileSystemDirectoryHandle, filename: string, content: string): Promise<void>` — writes to a temp sibling, then replaces the target.
  - `atomicDeleteFile(parent: FileSystemDirectoryHandle, filename: string): Promise<void>` — removes the file if it exists; no-op if absent.
  - `cleanupOrphanTempFiles(parent: FileSystemDirectoryHandle): Promise<void>` — removes any files matching `.*\.tmp\.[a-z0-9]+`.
  - `readTextFile(file: FileSystemFileHandle): Promise<string>` — reads file.text().
  - `writeSessionFile(parent: FileSystemDirectoryHandle, sessionId: string, group: Group): Promise<void>` — writes to `sessions/<id>.json` (ensures sessions dir exists).
  - `deleteSessionFile(parent: FileSystemDirectoryHandle, sessionId: string): Promise<void>`
  - `readSessionFile(sessionsDir: FileSystemDirectoryHandle, sessionId: string): Promise<Group | null>` — parses or returns null if missing/invalid.

Atomic write algorithm:
1. Generate tmp name: `.${filename}.tmp.${random(6)}`.
2. Get a writable file handle via `parent.getFileHandle(tmpName, { create: true })`.
3. `const w = await handle.createWritable(); await w.write(content); await w.close();`
4. Try to remove the target (if exists). (Note: FSAA has no atomic rename; we approximate by removing target then re-creating. Since meta.json is the commit point written last, a crash between step 4 and step 5 leaves both old file and tmp; next recovery will discard tmp via cleanupOrphanTempFiles.)
5. Move tmp to target: if `move()` exists on the handle (Chrome 123+), use `await tmpHandle.move(parent, filename)`; otherwise read tmp content back and write to the target handle then remove tmp.
6. If anything throws, attempt to remove the tmp file to avoid litter.

- [ ] **Step 1: Write failing tests** for atomicWriteFile (write two versions, read back gets latest), cleanupOrphanTempFiles (creates an orphan tmp and verifies deletion), readSessionFile/writeSessionFile/deleteSessionFile happy-path and missing-file.
- [ ] **Step 2: Run tests** — expect FAIL (memoryFs will need to support getFileHandle/createWritable/file.remove? — extend memoryFs as needed to support these operations).
- [ ] **Step 3: Extend memoryFs** if needed to support `remove()` on FileSystemFileHandle and the shape expected by the atomic writer.
- [ ] **Step 4: Implement fsAtomic.ts.**
- [ ] **Step 5: Run tests** — expect PASS.
- [ ] **Step 6: Commit**

```bash
git add src/shared/store/fsAtomic.ts src/shared/store/fsAtomic.test.ts src/shared/testing/memoryFs.ts
git commit -m "feat(store): atomic file write helpers and tmp cleanup

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 7: FileSystemDirectoryHandle Persistence in IndexedDB

**Files:**
- Create: `src/shared/store/fsDirectory.ts`
- Create: `src/shared/store/fsDirectory.test.ts`

**Interfaces:**
- Produces:
  - `saveRootHandle(handle: FileSystemDirectoryHandle): Promise<void>` — opens IDB database `tabboard-fs`, store `handlers`, puts the handle at key `root`.
  - `loadRootHandle(): Promise<FileSystemDirectoryHandle | null>` — returns the handle or null.
  - `clearRootHandle(): Promise<void>` — deletes the key.
  - `IDB_UNAVAILABLE` sentinel error.

Use raw IndexedDB. Pattern:
```ts
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FILE_STORE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(FILE_STORE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
```

- [ ] **Step 1: Write failing tests** using a manual IDB mock (or fake-indexeddb if strictly needed — but write a tiny in-memory IDB stub since we only use get/put/delete on a single store). The mock needs to implement IDBDatabase, IDBTransaction, IDBObjectStore, IDBRequest with promise-like onsuccess/onerror. Store the handle in a Map keyed by store name → key → value.
- [ ] **Step 2: Run tests** — expect FAIL.
- [ ] **Step 3: Implement fsDirectory.ts** using raw IndexedDB.
- [ ] **Step 4: Inject a mock IDB factory** into the module (or structure the code so tests can provide a `indexedDB` impl) to make tests deterministic without fake-indexeddb. Simplest approach: accept an optional `idbFactory` param defaulting to `() => indexedDB`; tests pass a factory that returns the in-memory stub.
- [ ] **Step 5: Run tests** — expect PASS.
- [ ] **Step 6: Run `npm run build`** — expect PASS (the file uses `globalThis.indexedDB` fallback so SSR/Node tests don't crash).
- [ ] **Step 7: Commit**

```bash
git add src/shared/store/fsDirectory.ts src/shared/store/fsDirectory.test.ts
git commit -m "feat(store): persist FileSystemDirectoryHandle in IndexedDB

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 8: Bootstrap Key Management

**Files:**
- Create: `src/shared/store/fsBootstrap.ts`
- Test: test in activeAdapter.test.ts (Task 10)

**Interfaces:**
- Produces:
  - `readBootstrapMode(): Promise<StorageMode>` — reads chrome.storage.local[BOOTSTRAP_KEY]; returns `'browser'` if missing or invalid.
  - `writeBootstrapMode(mode: StorageMode): Promise<void>` — writes `{ mode }` to the key.

- [ ] **Step 1: Implement fsBootstrap.ts** (no standalone test needed; covered by Task 10 integration test).
- [ ] **Step 2: Run `npm run build`** — expect PASS.
- [ ] **Step 3: Commit**

```bash
git add src/shared/store/fsBootstrap.ts
git commit -m "feat(store): bootstrap key reader/writer for storage mode

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 9: Implement FileStorageAdapter

**Files:**
- Create: `src/shared/store/fileStorage.ts`
- Create: `src/shared/store/fileStorage.test.ts`
- Modify: `src/shared/testing/memoryFs.ts` (add anything missing)

**Interfaces:**
- Produces:
  - `createFileStorageAdapter(root: FileSystemDirectoryHandle, deps?: { locks?, now? }): Promise<StorageAdapter>`
  - `initFileStorageDirectory(root: FileSystemDirectoryHandle): Promise<FileStorageInitInfo>` — reads and validates directory; returns `{ state: TabBoardState | null, hasExistingData: boolean }`.
  - `FileStorageAdapter` internally holds the root handle, an in-memory `lastKnownState` (for setState base), a write queue promise, and per-file state.

Implementation details:
- Constructor/init:
  1. Verify permission via `queryPermission({ mode: 'readwrite' })`; if prompt, call `requestPermission`. If denied, throw error with code `PERMISSION_DENIED`.
  2. Call `cleanupOrphanTempFiles(root)` to remove stale temps.
  3. Try to read `meta.json`. If missing, state is null (uninitialized). If present parse it; if `writeInProgress` or `migrationInProgress` is true, log a warning and continue loading (last known good state). If JSON parse fails on critical files, throw with `FILE_CORRUPT`.
  4. Read top-level files in parallel (settings.json, workspaces.json, folders.json, categoryOrder.json, bin.json, ledger.json).
  5. List entries in `sessions/` subdirectory (create it if missing); read each `.json` file in parallel (concurrency 10); skip non-.json and files that fail to parse (logWarning per skip).
  6. Assemble state via `assembleState`; store as `cachedState`. Set `initialized = true`.

- getState(): return clone of cachedState. If not initialized, run init first.

- setState(nextState):
  1. Chain onto `writeQueue`.
  2. Compute diff vs cachedState: which session ids to write (new or updated groups), which to delete.
  3. Compute parts = splitState(nextState).
  4. Ensure sessions/ directory exists: `await root.getDirectoryHandle('sessions', { create: true })`.
  5. Write meta with `writeInProgress: true` and current revision.
  6. Write changed/added session files in parallel (concurrency 5) using `writeSessionFile`.
  7. Delete removed session files via `deleteSessionFile`.
  8. Write top-level files (settings, workspaces, folders, categoryOrder, bin, ledger) in parallel via atomicWriteFile.
  9. Write final meta.json WITHOUT writeInProgress, with new revision and updatedAt.
  10. Update cachedState = clone(nextState).
  11. Notify internal subscribers (EventTarget dispatch).
  12. Write ping key to chrome.storage.local[FILE_PING_KEY] = `{ mutationRevision: nextState.mutationRevision, updatedAt: nextState.updatedAt }` so other contexts reload.

- ensureState(): if initialized and cachedState exists, return it; otherwise run init and if no state exists write a default empty state via setState.

- subscribeState(callback): attach to internal EventTarget for same-context subscribers. Return unsubscribe. (Cross-context notifications are handled by the active adapter layer via the ping key, not here.)

- [ ] **Step 1: Write failing tests:**
  - Round-trip: create adapter on empty dir → ensureState seeds default → setState with a known state → new getState returns equivalent state.
  - Session files: after setState with 2 groups, `sessions/` dir has 2 files named `<id>.json` whose content parses to correct Group.
  - Recovery from writeInProgress: simulate crashed write by writing meta with writeInProgress:true and some tmp files; init should clean tmp files and load last good state.
  - Corrupt meta.json throws FILE_CORRUPT-adjacent error.
  - Corrupt session file is skipped (one group missing from loaded state; normalize handles it).
  - Concurrent setStates are serialized (write queue).
  - Subscribe fires on setState within same context.
- [ ] **Step 2: Run tests** — expect FAIL.
- [ ] **Step 3: Implement `fileStorage.ts`** using fileSerialization and fsAtomic helpers.
- [ ] **Step 4: Run tests** — expect PASS.
- [ ] **Step 5: Run full `npm test` and `npm run build`** — expect PASS.
- [ ] **Step 6: Commit**

```bash
git add src/shared/store/fileStorage.ts src/shared/store/fileStorage.test.ts src/shared/store/fsAtomic.ts src/shared/store/fileSerialization.ts src/shared/testing/memoryFs.ts
git commit -m "feat(store): implement FileStorageAdapter with atomic per-session writes

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 10: Merge Logic for Migration

**Files:**
- Create: `src/shared/store/mergeStates.ts`
- Create: `src/shared/store/mergeStates.test.ts`

**Interfaces:**
- Produces:
  - `mergeStates(browserState: TabBoardState, fileState: TabBoardState): TabBoardState` — merges two states using ID-based entity matching with updatedAt newness priority; runs normalizeState before return.

Merge rules:
- Workspaces: union by id; on conflict pick higher `updatedAt`.
- Folders: union by id; on conflict pick higher `updatedAt`.
- Groups: union by id; on conflict pick higher `updatedAt`; **tabs within that group are also merged** (union by tab id, higher updatedAt wins).
- categoryOrderByWorkspace: per workspace concatenate both arrays, deduplicate by id preserving order, with fileState order winning for ties.
- Settings: fileState.settings wins (user is migrating to file).
- dropOperationLedger: union by operationId, dedup.
- bin: union by entry id; higher deletedAt wins; truncate to BIN_LIMIT after merge.
- activeWorkspaceId: from whichever top-level state has higher `updatedAt`.
- version, mutationRevision, createdAt, updatedAt: take max revision; createdAt = min of both; updatedAt = max.

- [ ] **Step 1: Write failing tests** for each merge case: conflicting workspace (newer wins), conflicting group with conflicting tabs, union of non-conflicting, bin dedup+truncate, settings win from file, ledger dedup.
- [ ] **Step 2: Run tests** — expect FAIL.
- [ ] **Step 3: Implement mergeStates.**
- [ ] **Step 4: Run tests** — expect PASS.
- [ ] **Step 5: Commit**

```bash
git add src/shared/store/mergeStates.ts src/shared/store/mergeStates.test.ts
git commit -m "feat(store): merge two TabBoardStates for migration

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 11: Active Adapter Factory with Fallback

**Files:**
- Create: `src/shared/store/activeAdapter.ts`
- Create: `src/shared/store/activeAdapter.test.ts`
- Modify: `src/shared/store/chromeStorage.ts` (add ping helpers — see below)

**Interfaces:**
- Produces:
  - `getActiveAdapter(): Promise<StorageAdapter>` — returns a cached singleton; on first call reads bootstrap mode. If `file`, attempts to load handle via loadRootHandle and init FileStorageAdapter. On any failure, falls back to ChromeStorageAdapter and logs warning. Also sets up cross-context ping subscription (chrome.storage.onChanged for FILE_PING_KEY) that reloads file state when another context writes.
  - `resetActiveAdapterForTests(): void` — test-only.
  - `isFileModeActive(): Promise<boolean>` — convenience.
  - `onFallback(callback: (reason: string) => void): () => void` — subscribe to fallback events (for UI toast).
  - `switchToFileMode(root: FileSystemDirectoryHandle, initialState: TabBoardState): Promise<void>` — called by Options page after migration: persists handle in IDB, writes bootstrap key = file, performs initial setState to commit initialState to files, resets active adapter so next getActiveAdapter returns file adapter.
  - `switchToBrowserMode(copyFileData: boolean): Promise<void>` — clears IDB handle, writes bootstrap = browser, optionally copies file state to chrome storage first.

Internal cross-context subscription: when file adapter is active, listen to chrome.storage.onChanged for FILE_PING_KEY; when a ping arrives with newer revision than cached, call fileAdapter.getState() and push to subscribers.

- [ ] **Step 1: Add helpers in chromeStorage.ts:** `writePing(revision, updatedAt)`, `subscribePing(callback)` (listens for FILE_PING_KEY changes).
- [ ] **Step 2: Write failing tests** for:
  - Default bootstrap (no key) returns ChromeStorageAdapter.
  - Bootstrap=file + no handle in IDB → falls back to chrome, emits fallback event.
  - Bootstrap=file + valid handle → returns FileStorageAdapter (using memoryFs).
  - File adapter write triggers ping (chrome.storage.local.set called with FILE_PING_KEY).
  - Ping with newer revision triggers getState on the file adapter.
  - switchToFileMode persists handle, writes bootstrap, performs initial setState.
  - switchToBrowserMode(copyFileData:true) copies file data into chrome storage.
- [ ] **Step 3: Run tests** — expect FAIL.
- [ ] **Step 4: Implement activeAdapter.ts.** Use module-level singleton for the cached adapter; ensure concurrent first calls share one init promise.
- [ ] **Step 5: Run tests** — expect PASS.
- [ ] **Step 6: Run full `npm test` and `npm run build`** — expect PASS.
- [ ] **Step 7: Commit**

```bash
git add src/shared/store/activeAdapter.ts src/shared/store/activeAdapter.test.ts src/shared/store/chromeStorage.ts
git commit -m "feat(store): active adapter factory with file fallback and ping sync

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 12: Diagnostics Logging for File Storage

**Files:**
- Modify: `src/shared/store/fileStorage.ts`
- Modify: `src/shared/store/activeAdapter.ts`

Add breadcrumbs/warnings/errors via existing `logBreadcrumb`/`logWarning`/`logError` at key points:
- `file-storage: init` with permission query result and session count
- `file-storage: write` with revision, duration, sessions written/deleted counts
- `file-storage: read` with revision, session count, recovery actions
- `file-storage: fallback` with reason and error message
- `file-storage: migration` direction and mode

- [ ] **Step 1: Add log calls** at the identified points. (Diagnostics never throws; wrap each log call site with try/catch to be safe — existing diagnostics util already does this internally, confirm and rely on it.)
- [ ] **Step 2: Run `npm test`** — expect PASS (tests can assert logs are called by spying on diagnostics module; optional — add a single spy test that init writes a breadcrumb).
- [ ] **Step 3: Commit**

```bash
git add src/shared/store/fileStorage.ts src/shared/store/activeAdapter.ts src/shared/store/fileStorage.test.ts
git commit -m "feat(store): add file-storage diagnostics logging

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 13: Wire Service Worker to Active Adapter

**Files:**
- Modify: `src/background/service-worker.ts:1-45,339-383`
- Modify: `src/background/service-worker.test.ts`

The service worker currently imports `getState/setState/getSettings/ensureState` directly from chromeStorage and builds statePersistence synchronously at module top-level. We need to:

1. Replace top-level construction with lazy initialization: create statePersistence after `getActiveAdapter()` resolves on install/startup and on first message.
2. Add `enqueueRestore` to also await adapter initialization.
3. Add a `runtime.onMessage` handler (or extend existing) for new message types `tabboard-file-fallback` (broadcast by page; SW can update contextMenus etc). Actually the ping-based sync handles cross-page notification; no new message needed for normal operation.
4. The existing `chrome.storage.onChanged` listener for STATE_KEY must be updated: in file mode, state changes don't go to STATE_KEY, so the action-popup updater must also listen for FILE_PING_KEY (or pull settings from adapter after a ping). Simplest: keep `applyActionPopup()` based on reading settings via `adapter.getState().then(s => applyActionPopup(s.settings.actionClick))` on startup and on any ping/state change.
5. Update `onInstalled`/`onStartup` to initialize the adapter before calling `statePersistence.ensureState()`.
6. Add a `tabboard-switch-storage` message for Options page to request switch from the SW (the actual switch is done in Options page context since only pages have access to showDirectoryPicker, but the SW needs to refresh its adapter after switch). Options page will send a message after completing migration.

Implementation approach:
- Keep a `let persistence: StatePersistence | null = null;` and `async function getPersistence(): Promise<StatePersistence>` that lazily creates the persistence with getState/setState from the active adapter.
- Wrap existing handlers with `enqueueRestore` which awaits getPersistence() first.

- [ ] **Step 1: Read the existing service-worker tests** to understand how state is mocked.
- [ ] **Step 2: Add failing tests** that: (a) when bootstrap=browser, existing statePersistence behavior is unchanged; (b) when bootstrap=file with a valid handle, statePersistence reads/writes through the file adapter (use memoryFs); (c) on file fallback statePersistence falls back to chrome storage.
- [ ] **Step 3: Run the test file** — expect FAIL.
- [ ] **Step 4: Refactor service-worker.ts** to lazily initialize statePersistence via activeAdapter.getActiveAdapter().
- [ ] **Step 5: Update the chrome.storage.onChanged listener** to react to both STATE_KEY (in browser mode, current behavior) and FILE_PING_KEY (in file mode), updating action popup from current settings.
- [ ] **Step 6: Ensure SW can't crash** if adapter init fails — catch errors and fall back via getActiveAdapter (which already falls back).
- [ ] **Step 7: Run service-worker tests** — expect PASS.
- [ ] **Step 8: Run full `npm test` and `npm run build`** — expect PASS.
- [ ] **Step 9: Commit**

```bash
git add src/background/service-worker.ts src/background/service-worker.test.ts
git commit -m "feat(background): wire service worker to active storage adapter

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 14: Wire useTabBoardStore to Active Adapter

**Files:**
- Modify: `src/shared/store/useTabBoardStore.ts`
- Modify: `src/shared/store/useTabBoardStore.test.ts`

The store currently imports `ensureStateForHydration`, `getState`, `sendStateMutations`, `subscribeState` directly from `./chromeStorage`. We need to:

1. Instead of importing static functions, obtain the active adapter via `getActiveAdapter()` at store init (note: store module is imported on a page, so we must resolve the adapter lazily — cache a promise).
2. Replace `getState` calls with `adapter.getState()`; replace `subscribeState` with `adapter.subscribeState`.
3. The `sendStateMutations` function currently sends mutations to the service worker via `chrome.runtime.sendMessage({ type: 'tabboard-state-mutations', mutations })`. This must continue to work because mutation batching/retry/ledger reconciliation lives on the store side. However, `sendStateMutations` currently falls back to applying locally if messaging is unavailable — that local-apply path must use the active adapter's setState. Refactor so:
   - When `chrome.runtime.sendMessage` is available, send to SW (SW uses active adapter on its side).
   - When not available (test harness), apply locally using `activeAdapter.getState().then(state => applyStateMutations... adapter.setState(next))`.
4. `ensureStateForHydration` should similarly use active adapter for its local fallback path (the worker path still sends `tabboard-ensure-state`, which triggers SW.ensureState on the active adapter).
5. Add `file-fallback` event listener: when active adapter fires fallback, set `persistenceError` in the store and log.
6. The `persistedSnapshot` helper stays unchanged.

Approach: create a small module-level promise `const adapterPromise = getActiveAdapter();` and `async function withAdapter<T>(fn: (a: StorageAdapter) => Promise<T>): Promise<T>` wrapper used by the store's persistence layer.

- [ ] **Step 1: Write failing test** asserting that when a file adapter is active (via setBootstrap override in tests), an `applyDropIntent` commits through the file adapter (not chrome.storage.local.set). Add test for fallback setting persistenceError.
- [ ] **Step 2: Run test** — expect FAIL.
- [ ] **Step 3: Refactor useTabBoardStore.ts** to resolve adapter lazily. Update `sendStateMutations` in chromeStorage.ts (or its consumers) to use active adapter for local fallback.
- [ ] **Step 4: Run store tests** — expect PASS.
- [ ] **Step 5: Run full `npm test`, `npm run check`, `npm run build`** — expect PASS.
- [ ] **Step 6: Commit**

```bash
git add src/shared/store/useTabBoardStore.ts src/shared/store/chromeStorage.ts src/shared/store/useTabBoardStore.test.ts
git commit -m "feat(store): route Zustand store persistence through active adapter

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 15: Options Page Data Storage Card (UI Shell)

**Files:**
- Create: `src/options/components/DataStorageCard.tsx`
- Modify: `src/options/OptionsApp.tsx` (add card to Stack)

**Interfaces:**
- Produces `DataStorageCard` React component showing current storage state and Choose/Reconnect/Disconnect buttons. No dialogs yet — buttons invoke no-ops/callbacks for now.

- [ ] **Step 1: Create DataStorageCard as a Mantine Card** with:
  - Title "Data Storage" with a database/folder icon (use `IconDatabase` or `IconFolder` from @tabler/icons-react).
  - Subtitle "Choose where TabBoard stores your sessions and settings."
  - Row showing "Current storage: Browser storage" (or "File storage: <FolderName>").
  - Primary button "Choose folder…"
  - When in file mode: secondary "Reconnect folder" button, red-outline "Stop using file storage" button, and text showing "Last saved: <time>".
- [ ] **Step 2: Integrate into OptionsApp.tsx** between Restore and Appearance cards.
- [ ] **Step 3: Run `npm run build`** — expect PASS.
- [ ] **Step 4: Verify visually** by running `npm run dev` and opening options.html. (Skip if no browser at hand; rely on build + tests.)
- [ ] **Step 5: Commit**

```bash
git add src/options/components/DataStorageCard.tsx src/options/OptionsApp.tsx
git commit -m "feat(options): add Data Storage settings card shell

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 16: Folder Picker and Migration Dialog

**Files:**
- Create: `src/options/components/FolderPickerDialog.tsx`
- Modify: `src/options/components/DataStorageCard.tsx` (wire button to open dialog)
- Test: `src/options/components/FolderPickerDialog.test.tsx` (component test using React Testing Library which is already available via Mantine tests; if not, use @testing-library/react — confirm availability first)

**Interfaces:**
- Produces `FolderPickerDialog` component:
  - Props: `{ opened: boolean; onClose: () => void; onComplete: (mode: 'file', folderName: string) => void }`
  - Step 1: prompt user to click "Choose folder" which calls `window.showDirectoryPicker({ mode: 'readwrite' })`. This must be called in a user gesture (click handler).
  - After picking a folder, inspect the directory (call `initFileStorageDirectory` to determine if it has existing data).
  - If empty → show single option "Export current browser data to this folder" button (plus Cancel).
  - If existing data → show three choices as Mantine Radio/Radio.Group: "Use this folder's data", "Export current browser data to this folder (overwrite)", "Merge both (newer items win)".
  - On confirm, perform the migration (call fileStorage helper `migrateToFile(root, mode, browserState)`) that does the reads/writes according to spec, then invokes `switchToFileMode(root, initialState)`.
  - Shows progress (Mantine Progress/Loader) during migration; errors show Mantine Alert.
- Expose a pure `migrateToFile(root, mode, browserState): Promise<TabBoardState>` function that does the read/merge/write. This can live in fileStorage.ts (or a separate file) and be unit tested.

- [ ] **Step 1: Add a test for migrateToFile** (pure function, no DOM) covering three modes with memoryFs.
- [ ] **Step 2: Run test** — expect FAIL.
- [ ] **Step 3: Implement migrateToFile logic.**
- [ ] **Step 4: Run test** — expect PASS.
- [ ] **Step 5: Add a component test** rendering FolderPickerDialog with a mocked showDirectoryPicker; clicking Choose and then selecting a mode triggers onComplete.
- [ ] **Step 6: Implement FolderPickerDialog.tsx** using Mantine Modal, Stack, Button, Radio, Progress, Alert.
- [ ] **Step 7: Wire Choose button in DataStorageCard to open the dialog; wire onComplete to refresh UI state (read back new settings).**
- [ ] **Step 8: Run tests + `npm run build`** — expect PASS.
- [ ] **Step 9: Commit**

```bash
git add src/options/components/FolderPickerDialog.tsx src/options/components/FolderPickerDialog.test.tsx src/options/components/DataStorageCard.tsx src/shared/store/fileStorage.ts
git commit -m "feat(options): add folder picker and migration dialog

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 17: Disconnect Dialog

**Files:**
- Create: `src/options/components/DisconnectDialog.tsx`
- Modify: `src/options/components/DataStorageCard.tsx` (wire button)

**Interfaces:**
- Produces `DisconnectDialog` component:
  - Props: `{ opened: boolean; onClose: () => void }`
  - Two-option Radio.Group: "Copy file data into browser storage first" / "Keep file as backup; switch now".
  - On confirm, calls `switchToBrowserMode(copyData)` (from activeAdapter), then closes and triggers UI refresh.

- [ ] **Step 1: Implement DisconnectDialog.tsx** using Mantine Modal + Stack + Radio + Button.
- [ ] **Step 2: Wire "Stop using file storage" button** in DataStorageCard.
- [ ] **Step 3: Run `npm run build`** — expect PASS.
- [ ] **Step 4: Commit**

```bash
git add src/options/components/DisconnectDialog.tsx src/options/components/DataStorageCard.tsx
git commit -m "feat(options): add disconnect-file-storage dialog

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 18: Fallback Notification and Reconnect

**Files:**
- Modify: `src/options/components/DataStorageCard.tsx`
- Modify: `src/manager/ManagerApp.tsx` or wherever top-level error toasts are shown (if there is no toast system, use a simple alert/notification in data storage card + banner on manager page via existing notification infrastructure)

Check existing feedback patterns — search for `notifications` or `showToast` in the manager codebase.

- [ ] **Step 1: Check how success/error feedback is currently surfaced** (e.g. capture feedback uses a toast mechanism). If there is no global toast system, use Mantine `Notification` in DataStorageCard and a lightweight manager banner; do not add a notifications library.
- [ ] **Step 2: Subscribe to `onFallback` from activeAdapter.** When a fallback occurs:
  - Show a persistent warning Alert in DataStorageCard explaining the error and a "Reconnect folder" button.
  - In Manager page, show a dismissible notification toast "File storage unavailable — using browser storage for now. Open settings to reconnect."
- [ ] **Step 3: Reconnect flow:** "Reconnect folder" button calls `window.showDirectoryPicker({ mode: 'readwrite' })`, saves handle to IndexedDB (same as switchToFileMode but without overwrite/merge; if the picked folder has data it's used directly, and bootstrap is set back to file).
- [ ] **Step 4: Run `npm run build`** — expect PASS.
- [ ] **Step 5: Commit**

```bash
git add src/options/components/DataStorageCard.tsx src/manager/ManagerApp.tsx src/shared/store/activeAdapter.ts
git commit -m "feat(options): show fallback warning and enable folder reconnect

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 19: Remaining Call Sites and Tests

**Files:**
- Modify: `src/manager/hooks/useOpenTabsRuntime.ts:25` (imports `getState` directly; replace with adapter access via store or activeAdapter)
- Modify: `src/manager/core/release.test.ts:4` (test file that directly imports getState/setState; update to use the activeAdapter factory or mock adapter)
- Verify: `src/popup/` does not directly import chromeStorage (popup dispatches through the store or sendMessage already — verify).

- [ ] **Step 1:** Grep for direct imports and enumerate:
  - `src/manager/hooks/useOpenTabsRuntime.ts` imports `getState as getPersistedState` from chromeStorage (used for stale-capture detection). Route through `useTabBoardStore.getState()` or activeAdapter instead.
  - `src/manager/core/release.test.ts` imports getState/setState for a release-related test. Refactor test to use a mock adapter or the existing chromeStorage layer (which still works in browser mode).
- [ ] **Step 2:** Update call sites.
- [ ] **Step 3:** Run full `npm test`, `npm run build`, `npm run check` — expect PASS.
- [ ] **Step 4:** Commit

```bash
git add src/manager/hooks/useOpenTabsRuntime.ts src/manager/core/release.test.ts
git commit -m "refactor: route remaining storage call sites through active adapter

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 20: Documentation Updates

**Files:**
- Modify: `docs/feature-evolution.md` — add 2026-07-23 entry for local file storage
- Modify: `docs/product-decisions.md` — record tradeoffs
- Modify: `docs/technical-architecture.md` — add Storage Adapter and File Store sections; update persistence and settings sections
- Modify: `docs/feature-spec.md` — add user-facing behavior description (if file exists; if not create minimal section)

- [ ] **Step 1: Update feature-evolution.md** describing what was added, why, and current status.
- [ ] **Step 2: Update product-decisions.md** with decisions (FSAA over native host, per-session file layout, atomic meta commit, fallback policy, no IndexedDB wrapper).
- [ ] **Step 3: Update technical-architecture.md** Modules boundaries section to document `src/shared/store/storageAdapter.ts`, `fileStorage.ts`, and new persistence flow. Update State Schema's settings list.
- [ ] **Step 4: Update feature-spec.md** Settings section with new Data Storage section describing the feature, how to set it up, migration, disconnect, and recovery.
- [ ] **Step 5: Run `npm run check`** — expect PASS.
- [ ] **Step 6: Commit**

```bash
git add docs/feature-evolution.md docs/product-decisions.md docs/technical-architecture.md docs/feature-spec.md
git commit -m "docs: document local file storage feature

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

## Task 21: Final Verification

- [ ] **Step 1: Run `npm test`** — all 664+ tests PASS (expected test count to increase by ~50-80 new tests from this feature).
- [ ] **Step 2: Run `npm run build`** — no type errors, build succeeds.
- [ ] **Step 3: Run `npm run check`** — extension validation passes.
- [ ] **Step 4: Run `git diff --check`** — no whitespace errors.
- [ ] **Step 5: Manual verification** in an unpacked Chrome extension:
  - Install unpacked, create a couple sessions.
  - Open Options, click "Choose folder", select a test folder. Pick "Export current browser data".
  - Verify folder on disk has meta.json, settings.json, sessions/ directory with .json files.
  - Close Chrome, reopen — extension loads from file, sessions intact.
  - Add/modify/delete sessions — files appear/disappear on disk.
  - Close Chrome, manually corrupt a session file JSON (insert garbage) — restart, that session is dropped gracefully (or triggers fallback per spec).
  - Options: "Stop using file storage" → "Copy file data into browser storage". Switch back to browser mode; verify chrome.storage.local['tabboardState'] is populated.
  - Switch back to file mode, choose same folder, pick "Use this folder's data" — data reappears.
  - Simulate permission revocation (via chrome://settings/content/all or by removing the folder handle from IndexedDB in DevTools) → verify fallback fires, warning shown.
  - Drag+drop regression: drag a session between categories and verify it persists in file mode.
  - Capture via toolbar button: service worker path works in file mode (session saved to disk via SW).
- [ ] **Step 6: Fix any issues found; commit fixes.**
- [ ] **Step 7: Final commit (if any fixup commits) or sign-off.**
