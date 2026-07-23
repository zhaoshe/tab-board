# Local File Storage Design

**Date:** 2026-07-23
**Status:** Draft
**Scope:** Allow users to select a local folder for TabBoard data persistence, so data survives extension reinstalls and can be synced via iCloud/Dropbox.

## Goal

Let users choose a local filesystem directory as TabBoard's primary data store instead of `chrome.storage.local`. Writes and reads happen against that directory. After uninstall/reinstall the user picks the same folder and regains all data. The folder can live inside iCloud Drive, Dropbox, or any other sync directory for cross-device sync.

## Non-Goals

- Cross-device real-time sync (conflict resolution across concurrent writers is out of scope; single-writer optimism is enough).
- Encryption at rest (the OS/filesystem owns that; TabBoard stores plain JSON).
- Native Messaging host or companion app.
- Replacing `chrome.storage.local` for non-state data (diagnostics and other auxiliary keys remain in chrome.storage).

## Approach Chosen

Use the **File System Access API** (`window.showDirectoryPicker`, `FileSystemDirectoryHandle`/`FileSystemFileHandle`). It requires no new manifest permissions, handles are persisted in IndexedDB, and `createWritable()` is available in Service Workers (Web Worker support confirmed by MDN / WHATWG FS spec). `showDirectoryPicker()` is called from the Options page (the only place with a `window`); the resulting handle is stored in IndexedDB and retrieved by both manager pages and the service worker.

Storage is abstracted behind a `StorageAdapter` interface so the rest of the codebase does not care which backend is active. Each session is its own JSON file under a `sessions/` subdirectory for fine-grained sync and minimal write amplification. Top-level entities (meta, settings, workspaces, folders, bin, category order, ledger) are separate files.

Writes are atomic per file via temp-file + rename. Cross-file consistency uses `meta.json` as the commit point: it is written last with the authoritative `mutationRevision`. If a write is interrupted mid-flight, the next read recovers by trusting `meta.json` and discarding orphan temp/partial files.

If any file operation fails (permission revoked, JSON corrupt, disk error), TabBoard automatically falls back to `chrome.storage.local` and surfaces a toast/settings warning so the user can reconnect.

## StorageAdapter Interface

```ts
// src/shared/store/storageAdapter.ts
export interface StorageAdapter {
  getState(): Promise<TabBoardState>;
  setState(state: TabBoardState): Promise<void>;
  ensureState(): Promise<TabBoardState>;
  subscribeState(callback: (state: TabBoardState) => void): () => void;
}
```

- `getState` reads and assembles the full `TabBoardState`.
- `setState` persists a complete normalized state.
- `ensureState` seeds default state if storage is empty, then returns the current state.
- `subscribeState` notifies subscribers of new committed states.

The existing `src/shared/store/chromeStorage.ts` functions are wrapped/rewritten as `ChromeStorageAdapter`. New `FileStorageAdapter` lives in `src/shared/store/fileStorage.ts`. The adapter factory (see below) picks the active backend based on settings; all call sites in `chromeStorage.ts`, service worker persistence queue, and hydration switch to using the adapter.

Adapter selection is decided at startup from the stored settings. If the active adapter fails to initialize (e.g. file handle missing or unreadable), the factory falls back to Chrome storage and records a warning.

## Directory Layout

The user picks one root folder. Inside it TabBoard manages exactly this structure:

```
<TabBoardDataFolder>/
├── meta.json
├── settings.json
├── workspaces.json
├── folders.json
├── categoryOrder.json
├── bin.json
├── ledger.json
└── sessions/
    ├── <sessionId>.json
    ├── <sessionId>.json
    └── ...
```

File formats:

- `meta.json`
  ```json
  {
    "version": 1,
    "mutationRevision": <number>,
    "activeWorkspaceId": "<id>",
    "createdAt": "<iso>",
    "updatedAt": "<iso>",
    "fileLayoutVersion": 1
  }
  ```
  During writes `writeInProgress: true` and during initial migration `migrationInProgress: true` may appear transiently.

## Bootstrap: Finding the Active Backend on Startup

There is a bootstrapping problem: on cold start we need to know which storage backend to read settings from, but settings live inside that very backend. We solve this with a tiny always-in-chrome-storage bootstrap key:

- `chrome.storage.local["tabboardStorageConfig"]` = `{ mode: 'browser' | 'file' }`. This is a tiny primitive key set during mode switch and read before any adapter is initialized.
- It does NOT contain user data or the directory handle — only the mode flag. The handle remains in IndexedDB (`tabboard-fs`).
- On install / first run the key is absent, which we treat as `mode: 'browser'`.

Startup sequence:
1. Read `tabboardStorageConfig` from chrome.storage.local (always possible; very small).
2. If `mode === 'browser'` or key absent → use ChromeStorageAdapter (existing behavior), read full state from chrome.storage.
3. If `mode === 'file'` → open IndexedDB, read root handle, attempt FileStorageAdapter init. On success use it. On failure fallback to ChromeStorageAdapter (see Fallback Behavior below) and surface the error.
4. If fallback fires, leave `tabboardStorageConfig.mode` at `'file'` so the next restart retries file storage (the failure may be transient, e.g. iCloud not yet mounted), but in-memory flag routes current session to chrome storage. User can use "Reconnect folder" or "Stop using file storage" to change the mode explicitly.
- `settings.json`: `TabBoardState["settings"]` object.
- `workspaces.json`: `{ "workspaces": Workspace[] }`.
- `folders.json`: `{ "folders": Folder[] }`.
- `categoryOrder.json`: `{ "categoryOrderByWorkspace": Record<WorkspaceId, CategoryId[]> }`.
- `bin.json`: `{ "bin": BinEntry[] }`.
- `ledger.json`: `{ "dropOperationLedger": DropOperationLedger }`.
- `sessions/<id>.json`: single serialized `Group` (session) object.

Each file is written as pretty-printed JSON (2-space indent) for readability and git/icoup-friendliness. The file name for a session is exactly its `id` (URL-safe base62/number string used by existing IDs) plus `.json`.

Filenames do not use user-visible session titles (titles change, may contain illegal path characters).

## Atomic Writes and Consistency

Per-file:
1. Write contents to a sibling temp file named `.<target>.tmp.<random>` (hidden, unique per attempt).
2. Await `writable.close()`.
3. `await fileHandle.remove()` if target exists, then rename temp → target (via `directoryHandle.getFileHandle(target, { create: true })` and copying the contents is the portable path; `move()` is used if available, otherwise read-temp + write-target + remove-temp).

Cross-file ordering per `setState` (run under the adapter's internal write mutex — see Serialization below):
1. Compute diff: which sessions are new/modified/deleted relative to current known state.
2. Write a transient commit marker: rewrite `meta.json` with `writeInProgress: true` and the previous revision. This lets a future reader detect a crashed partial write.
3. Write new/modified session files.
4. Delete removed session files.
5. Write `workspaces.json`, `folders.json`, `settings.json`, `bin.json`, `categoryOrder.json`, `ledger.json` (each atomically; any order is fine because meta still points to previous revision).
6. Write final `meta.json` with the new `mutationRevision`, `updatedAt`, and no `writeInProgress` flag.

Recovery on read:
- If `meta.json` is missing, treat the directory as uninitialized.
- If `meta.json` has `writeInProgress: true` (crashed mid-write) or `migrationInProgress: true` (crashed during initial migration), scan for any `.tmp` files and delete them; continue loading from whatever is on disk — meta still points to the last good revision so sessions referenced in the old meta that exist on disk are valid; new session files that have no corresponding meta reference are orphaned and cleaned up lazily.
- If a session file JSON-parses to invalid, skip it and log a warning; if this causes referenced sessions to be missing, normalizeState handles it (existing normalize drops invalid references).
- Any critical error parsing `meta.json`/`settings.json`/`workspaces.json` triggers fallback to chrome.storage.

Orphan `.tmp` files older than a write attempt are cleaned up lazily on `getState()`.

## Serialization

- The FileStorageAdapter maintains an internal write queue (Promise chain) so concurrent `setState` calls serialize.
- The existing service-worker `statePersistence.ts` queue stays as the cross-page serialization layer; FileStorageAdapter's queue acts as a second-level defense for the filesystem.
- Web Locks (`tabboard-state-write`) continues to be used where available to coordinate between the SW and any open manager/options page; when a manager page writes directly (e.g. during migration) it takes the same lock through the adapter.

## Cross-Context Change Notification

Filesystem has no native change observer across contexts. We reuse `chrome.storage.onChanged` as a cheap ping:

- On every successful `setState` (from any context: SW, manager, options), write a tiny key `tabboardFilePing` to `chrome.storage.local` with shape `{ mutationRevision, updatedAt }`.
- All pages that are in file mode subscribe to `chrome.storage.onChanged` for that key and, on change, reload state from disk via `getState()` and push it through Zustand.
- This reuses the existing `subscribeState`/hydration plumbing with minimal new code. The ping payload is tiny so it does not meaningfully increase chrome.storage usage.

Note: iCloud/Dropbox modifying the file from outside TabBoard is not automatically detected. The user can trigger a manual refresh (we may add a "Reload from disk" button in settings later — out of scope for v1). On restart we always read from disk so external changes will be picked up then.

## Permission Handle Persistence

- The chosen `FileSystemDirectoryHandle` is stored in IndexedDB under database `tabboard-fs`, store `handlers`, key `root`.
- Storage happens only from the Options page (the page that called `showDirectoryPicker`, where the handle is guaranteed to be fresh and permission is granted).
- Service worker and manager pages read the handle from IndexedDB on demand (they never call `showDirectoryPicker`).
- If IndexedDB does not contain a handle when file mode is requested (typical after uninstall/reinstall), fallback fires and the user is prompted to choose a folder again.
- The bootstrap key `chrome.storage.local["tabboardStorageConfig"]` stores only `{ mode }`, never the handle. The settings file in the user's folder stores `storageFolderName` for display purposes only.

### Permission Query

Before attempting reads/writes, the adapter calls `handle.queryPermission({ mode: 'readwrite' })`. If the result is not `'granted'`, it calls `requestPermission({ mode: 'readwrite' })`. If permission is denied (or NotAllowedError is thrown), adapter initialization fails and triggers fallback.

## Settings Additions

```ts
// added to DEFAULT_SETTINGS
storageMode: 'browser',           // 'browser' | 'file'
storageFolderName: '',            // display name only
storageAutoFallback: true,        // future-proof: always true in v1
```

Existing schema version bumps via `normalizeState`.

## Options Page UI

A new **Data Storage** card is added between Restore and Appearance (or at the bottom before Keyboard & Advanced, since it's an advanced concern). Contents:

1. Current storage mode label: "Browser storage" or "File storage: <FolderName>".
2. "Choose folder…" button — always visible; clicking it calls `window.showDirectoryPicker({ mode: 'readwrite' })`. On success opens the migration dialog.
3. In file mode only:
   - "Stop using file storage" button → opens disconnect dialog.
   - "Reconnect folder" button — same flow as Choose folder but pre-selects the merge/use logic (re-gains permission if revoked; the user can pick the same folder and data is preserved).
   - Last-updated timestamp shown (from the latest successful ping).
4. Error/warning banner shown when file storage is in fallback state (with reason: permission revoked / file corrupt / IO error).

### Migration Dialog (after picking a folder)

The dialog inspects the folder:

- If the folder has no `meta.json` (empty / not a TabBoard directory) → only option is **"Export current data to this folder"** (writes everything; switches to file mode). Cancel leaves the user in browser storage and the folder unchanged.
- If the folder already contains TabBoard data → three options:
  - **Use this folder's data** — load from disk, replace current chrome.storage state (file wins). chrome.storage data is left in place (not deleted) until the first successful file commit.
  - **Export current browser data to this folder (overwrite)** — chrome.storage wins; overwrite file contents.
  - **Merge** — read both sources, merge by ID with `updatedAt` newer-wins for all entities (workspaces, folders, sessions, tabs, notes, bin entries), write merged result to file and switch.
  - Cancel does nothing.

After migration the dialog closes, a toast confirms "Data stored in <FolderName>", and settings.storageMode is set to `'file'`.

### Disconnect Dialog (when switching back to browser storage)

Two options:

- **Keep file as backup; switch now** — settings become `storageMode: 'browser'` immediately. chrome.storage is not modified. The folder on disk is left intact. The IndexedDB handle is cleared (we release the permission hold).
- **Copy file data into browser storage first** — perform a full read from the folder, write the result to chrome.storage.local, then switch.
- Cancel does nothing.

Both options leave the files on disk; we never silently delete user data.

## Data Migration Details

### Chrome → File (export)

1. Set storageMode to `'file'` only after a successful full write.
2. Write `meta.json` with `migrationInProgress: true` and current `mutationRevision`.
3. Write all top-level metadata files (settings, workspaces, folders, categoryOrder, bin, ledger).
4. Write sessions in parallel batches (concurrency = 5) to avoid hammering the filesystem.
5. Write final `meta.json` (no `migrationInProgress` / `writeInProgress` flags).
6. Persist the directory handle to IndexedDB.
7. Commit the bootstrap switch: write `chrome.storage.local["tabboardStorageConfig"] = { mode: 'file' }`, and also update `settings.storageMode = 'file'` inside the file store. This is the mode-switch commit point — after this set, all future reads route to the file adapter.
8. chrome.storage's copy of full state is NOT deleted; it remains as a cold backup. After mode switch all new writes go through the File adapter; the chrome.storage state copy becomes stale and is never read while in file mode (except when fallback triggers, in which case we opportunistically copy fresh file state into chrome.storage before serving).

### File → Chrome (disconnect with copy)

1. `getState()` from file adapter.
2. `setState()` to chrome.storage adapter (bypass persistence queue atomic flags since we are outside normal mutations).
3. Clear IndexedDB root handle.
4. Write `chrome.storage.local["tabboardStorageConfig"] = { mode: 'browser' }`, and persist `settings.storageMode = 'browser'` in chrome.storage.

### File → Chrome (disconnect without copy)

1. Leave chrome.storage state as-is.
2. Clear IndexedDB root handle.
3. Write `chrome.storage.local["tabboardStorageConfig"] = { mode: 'browser' }`, and persist `settings.storageMode = 'browser'` in chrome.storage.

### Merge

1. Read state from chrome.storage (call it `browserState`).
2. Read state from file (call it `fileState`); if file is uninitialized treat as empty default.
3. Merge per entity type:
   - Workspaces: union by `id`; on conflict pick higher `updatedAt`.
   - Folders: same rule.
   - Groups (sessions): union by `id`; on conflict pick higher `updatedAt`; additionally union tabs within a session (by tab `id`, higher `updatedAt` wins).
   - Category order: per workspace, concatenate and deduplicate by category id; file order wins for ties.
   - Settings: file settings take precedence (user is actively switching to file, so file settings reflect the folder's owner preferences).
   - Bin: union by bin entry id; higher `updatedAt` wins; truncated to BIN_LIMIT after merge.
   - activeWorkspaceId: from the state with higher top-level `updatedAt`.
4. Run `normalizeState()` on the merged result.
5. Write merged state to file (full atomic write).
6. Persist handle, switch storageMode to file.

## Service Worker Considerations

- SW has no `window` and cannot call `showDirectoryPicker`; it only consumes the handle from IndexedDB.
- `createWritable()` is available in Web Workers / Service Workers (confirmed). We use promise-style writes (`await writable.write(json); await writable.close()`), not the OPFS-only synchronous access handle.
- SW termination mid-write: handled by atomic writes and meta commit point (see Atomic Writes). A terminated write leaves at most one `.tmp` file and `meta.json` may still point to the previous revision; recovery on next boot cleans up.
- SW cold start: `createFileStorageAdapter` is called lazily on first use; it reads the handle from IndexedDB and verifies permission before serving. If it fails, the SW falls back to chrome.storage for that event and emits a warning via diagnostics. The next page load will surface the error.
- `registerPeristenceQueue` in service-worker.ts is updated to pass the appropriate `getState`/`setState` from the active adapter. The queue itself is unchanged.

## Fallback Behavior

Any unrecoverable error during file operations (`NotAllowedError`, `NotFoundError`, JSON parse error on critical files, IO errors) triggers automatic fallback:

1. Log a `logError('file-storage', ...)` with the error code and path.
2. Set an internal in-memory flag `fileAdapterDegraded = true`.
3. Route subsequent reads/writes through the ChromeStorageAdapter for the remainder of the session (until restart or user reconnect).
4. Broadcast a notification to all TabBoard pages via chrome.runtime.sendMessage (`tabboard-fallback-changed`) so UI shows a banner/toast.
5. Options page shows the error reason and a "Reconnect folder" button.
6. chrome.storage state is used as the fallback source. Note: while in file mode chrome.storage state is NOT being updated by TabBoard (only the `tabboardFilePing` key is). Therefore fallback after a long file-mode session may serve stale chrome.storage data. To mitigate this, on fallback we also attempt to copy the in-memory/latest-read file state into chrome.storage before switching over (if we have a recent valid snapshot).
7. If fallback happens while the user is actively in the middle of a mutation (e.g. drag in progress), the mutation is rejected through the existing `InvalidDropMutationError` channel so the user can retry.

## Diagnostics

Add new diagnostics scopes:
- `file-storage: init` — adapter constructed, source of handle, permission query result
- `file-storage: write` — per-commit revision, duration, number of sessions written
- `file-storage: read` — per-read revision, session count, recovery actions (tmp cleanup)
- `file-storage: fallback` — reason, error
- `file-storage: migration` — direction, merge/export/import mode, session counts before/after

All operations wrapped in try/catch so diagnostics themselves never throw (same pattern as `src/shared/utils/diagnostics.ts`).

## Manifest

No new permissions needed. File System Access API is available to extension pages without manifest declarations (user gesture + picker grants consent implicitly). No new host permissions.

## Testing

### Unit tests (Vitest, happy-dom)
- StorageAdapter contract tests against Chrome adapter (existing behavior preserved).
- File adapter tests using a memory-backed `FileSystemDirectoryHandle` mock:
  - Round-trip write/read of minimal state.
  - Atomic write recovery (simulate crash mid-write: meta.json migrationInProgress, orphan tmp file).
  - Session file creation/deletion on group add/remove.
  - Corrupt session file skipped without crashing.
  - Corrupt meta.json triggers fallback.
  - Write queue serializes concurrent setState.
- Merge logic: unit tests for each entity type conflict resolution, BIN_LIMIT truncation.
- Migration dialog options: tested via React component tests (Mantine + user-event).

### Mocking strategy
Implement a small in-memory `MemoryFileSystem` (directories + files with create/getFile/remove entries, File/Blob-backed contents) for tests. `createFileStorageAdapter` accepts an injected directory handle so tests do not need a real filesystem.

### Manual verification
- Pick a folder in ~/Documents, create sessions, close Chrome, reopen — data persists.
- Move the folder to an iCloud Drive location, edit sessions, wait for sync, read on another machine's Chrome (manual; out of automated scope).
- Pick a folder, add data, uninstall extension (via chrome://extensions), load unpacked again, pick same folder — data restored.
- Revoke permission via the address-bar site controls, trigger a mutation — fallback fires, warning shown, chrome.storage state served.
- Start with populated chrome.storage, migrate to file, verify counts match, verify the folder contains correct files.
- Start with populated file folder, attach to fresh extension install via "Use file data" — verify sessions appear.
- Merge scenario: conflicting sessions/tabs with updatedAt timestamps — newer wins.
- Disconnect dialog: both options (keep / copy).
- Corrupt `meta.json` by hand (edit to invalid JSON) — fallback triggers.
- Drag+drop in file mode — same behavior as browser mode (no regressions).

### Existing tests
Existing `chromeStorage`-style tests (chromeStorage.test.ts, statePersistence.test.ts, useTabBoardStore.test.ts) continue to run with ChromeStorageAdapter. The adapter factory is injected in tests so file-mode tests do not affect chrome-mode tests.

## Verification Checklist (same as project standard)

After implementation:

```sh
npm run build
npm run check
npm test
```

Plus manual verification in Chrome (per Manual verification above), including a fresh unpacked install folder-picker flow and a simulated permission-revocation flow.

## Documentation Updates

- `docs/technical-architecture.md` — add Storage Adapter section, File Store section, update persistence and settings sections.
- `docs/feature-evolution.md` — new entry for 2026-07-23 local file storage.
- `docs/product-decisions.md` — record tradeoffs (FSAA vs native host, per-session file layout, atomic meta commit, fallback policy).
- `docs/feature-spec.md` — describe user-facing behavior: setting, migration dialogs, fallback notice, reinstall recovery.

## Out of Scope / Future Work

- Automatic reload on external file changes (iCloud sync from another device).
- End-to-end encryption with a user-supplied passphrase.
- File-system-level session import (user drops a single exported session file into the folder).
- Versioned snapshots / trash folder in the filesystem.
- Storage usage indicator (file count / folder size).
- Periodic integrity check / scrub.
