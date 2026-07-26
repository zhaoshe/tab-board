# Storage Authority Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one stable storage authority own backend selection, runtime fallback, migration commit ordering, cross-context notification, and subscriptions.

**Architecture:** Keep Chrome and File as the two `StorageAdapter` implementations. Deepen `activeAdapter.ts` into a stable authority that can replace its internal backend without invalidating callers; move file ping and fallback transport into `storageEvents.ts` to remove the `activeAdapter ↔ chromeStorage` cycle.

**Tech Stack:** TypeScript, Chrome Manifest V3 storage/runtime APIs, File System Access API, IndexedDB, Vitest.

## Global Constraints

- Preserve D034–D040: File System Access API, per-session files, two-phase commit, automatic runtime fallback, raw IndexedDB, substitute mode, and three migration choices.
- No new runtime dependency.
- Do not dual-write during normal operation.
- A failed File write must reject; only a later retry may commit to Chrome.
- Keep existing exported compatibility functions unless all callers are migrated in the same task.
- All production behavior changes start with a focused failing test.
- Every commit message ends with `Co-authored-by: TRAE CLI <noreply@bytedance.com>`.

---

### Task 1: Extract storage event transport

**Files:**
- Create: `src/shared/store/storageEvents.ts`
- Create: `src/shared/store/storageEvents.test.ts`
- Modify: `src/shared/model/constants.ts`
- Modify: `src/shared/store/chromeStorage.ts`
- Modify: `src/shared/store/activeAdapter.ts`

**Interfaces:**
- Produces: `FilePing`, `StorageFallbackEvent`, `writeFilePing()`, `subscribeFilePing()`, `writeStorageFallback()`, `subscribeStorageFallback()`.
- Preserves: `chromeStorage.writePing` and `chromeStorage.subscribePing` as compatibility aliases until callers are migrated.

- [x] **Step 1: Write failing transport tests**

Add tests that use a real in-memory `chrome.storage.local` event fake and assert:

```ts
await writeFilePing(7, '2026-07-26T10:00:00.000Z');
expect(receivedPing).toEqual({
  mutationRevision: 7,
  updatedAt: '2026-07-26T10:00:00.000Z',
});

await writeStorageFallback({
  eventId: 'fallback-1',
  reason: 'Folder unavailable',
  occurredAt: '2026-07-26T10:01:00.000Z',
});
expect(receivedFallback?.reason).toBe('Folder unavailable');
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/shared/store/storageEvents.test.ts`  
Expected: FAIL because `storageEvents.ts` does not exist.

- [x] **Step 3: Implement the transport module**

The module reads/writes only `FILE_PING_KEY` and a new `STORAGE_FALLBACK_KEY`, validates event shapes, and returns synchronous unsubscribe functions.

- [x] **Step 4: Migrate ping imports and keep compatibility aliases**

`activeAdapter.ts` imports `subscribeFilePing` from `storageEvents.ts`. `chromeStorage.ts` re-exports:

```ts
export {
  writeFilePing as writePing,
  subscribeFilePing as subscribePing,
  type FilePing,
} from './storageEvents';
```

- [x] **Step 5: Run focused and existing adapter tests**

Run:

```bash
npx vitest run src/shared/store/storageEvents.test.ts src/shared/store/activeAdapter.test.ts src/shared/store/chromeStorage.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/shared/store/storageEvents.ts src/shared/store/storageEvents.test.ts src/shared/store/chromeStorage.ts src/shared/store/activeAdapter.ts src/shared/model/constants.ts
git commit -m "refactor(store): isolate storage event transport

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

### Task 2: Add a stable storage authority with runtime fallback

**Files:**
- Modify: `src/shared/store/activeAdapter.ts`
- Modify: `src/shared/store/activeAdapter.test.ts`
- Modify: `src/shared/store/storageAdapter.ts`

**Interfaces:**
- Produces: stable authority returned by `getActiveAdapter()`.
- Produces: `getActiveState()`, `setActiveState()`, `ensureActiveState()`, `subscribeActiveState()`.
- Consumes: storage event transport from Task 1.

- [x] **Step 1: Add a failing write-fallback test**

Use an injected File adapter whose first `setState()` rejects after one committed state exists. Assert:

```ts
const authority = await getActiveAdapter();
await expect(authority.setState(uncommitted)).rejects.toThrow('disk offline');
expect(await isFileModeActive()).toBe(false);
expect(await authority.getState()).toEqual(lastCommitted);
await authority.setState(retried);
expect(chromeState()).toEqual(retried);
expect(await getActiveAdapter()).toBe(authority);
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/shared/store/activeAdapter.test.ts -t "runtime file write failure"`  
Expected: FAIL because File remains active and Chrome is not seeded.

- [x] **Step 3: Add failing read and ping-reload fallback tests**

Assert a File `getState()` failure returns the last committed state through Chrome, and a newer ping whose `reloadFromDisk()` rejects transitions the authority to Chrome and emits one fallback event.

- [x] **Step 4: Implement the stable authority**

The authority stores:

```ts
type AuthorityBackend = {
  mode: StorageMode;
  adapter: StorageAdapter;
};
```

It owns:

- one stable public `StorageAdapter`;
- backend subscription rebinding;
- `lastKnownState`;
- serialized write/fallback transition;
- local event de-duplication;
- runtime File-to-Chrome transition.

The first failed File write rejects after transition. Reads continue from Chrome.

- [x] **Step 5: Add active-state convenience functions**

Delegate through the stable authority and preserve synchronous unsubscribe semantics.

- [x] **Step 6: Run focused authority tests**

Run: `npx vitest run src/shared/store/activeAdapter.test.ts`  
Expected: PASS.

- [x] **Step 7: Run store and worker regression tests**

Run:

```bash
npx vitest run src/shared/store/useTabBoardStore.test.ts src/background/service-worker.test.ts
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add src/shared/store/activeAdapter.ts src/shared/store/activeAdapter.test.ts src/shared/store/storageAdapter.ts
git commit -m "fix(store): degrade runtime file failures through stable authority

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

### Task 3: Make migration and reconnect transactional

**Files:**
- Modify: `src/shared/store/activeAdapter.ts`
- Modify: `src/shared/store/activeAdapter.test.ts`
- Modify: `src/options/components/FolderPickerDialog.tsx`
- Modify: `src/options/components/DataStorageCard.tsx`

**Interfaces:**
- Preserves: `switchToFileMode(root, initialState)`, `switchToBrowserMode(copyFileData)`, `reconnectFolder(root)`.
- Guarantees: bootstrap mode changes only after target backend validation and required data write.

- [x] **Step 1: Add a failing migration commit-order test**

Make File seeding fail and assert:

```ts
await expect(switchToFileMode(root, state)).rejects.toThrow();
expect(readBootstrap()).toBe('browser');
expect(await isFileModeActive()).toBe(false);
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/shared/store/activeAdapter.test.ts -t "failed file migration"`  
Expected: FAIL because bootstrap currently changes before File seeding.

- [x] **Step 3: Add a failing reconnect validation test**

Use a denied or corrupt folder and assert bootstrap and active mode remain unchanged.

- [x] **Step 4: Implement transactional ordering**

Construct and seed/validate the target adapter before committing bootstrap and installing it in the authority. Restore the previous handle/bootstrap when a pre-commit operation fails.

- [x] **Step 5: Update Options callers**

Options continues showing existing success/error states, but only reloads after the authority transition succeeds. It must not directly detect File-specific capabilities.

- [x] **Step 6: Run migration and Options tests**

Run:

```bash
npx vitest run src/shared/store/activeAdapter.test.ts src/options/components/FolderPickerDialog.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/shared/store/activeAdapter.ts src/shared/store/activeAdapter.test.ts src/options/components/FolderPickerDialog.tsx src/options/components/DataStorageCard.tsx
git commit -m "fix(store): commit storage switches after validation

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

### Task 4: Collapse caller coordination into the authority

**Files:**
- Modify: `src/shared/store/chromeStorage.ts`
- Modify: `src/shared/store/useTabBoardStore.ts`
- Modify: `src/background/service-worker.ts`
- Modify: `src/options/components/DataStorageCard.tsx`
- Test: existing store, worker, and adapter tests

**Interfaces:**
- Consumes: `getActiveState`, `setActiveState`, `ensureActiveState`, `subscribeActiveState`.
- Removes: caller-owned adapter promise and duplicate adapter delegates.

- [x] **Step 1: Add a failing stable-subscription integration test**

Hydrate the real Zustand store, trigger File runtime fallback, then publish a Chrome storage update. Assert the original store subscription receives the Chrome state without rehydrating.

- [x] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/shared/store/useTabBoardStore.test.ts -t "keeps the active subscription"`  
Expected: FAIL because the cached subscription remains attached to the failed File adapter.

- [x] **Step 3: Migrate callers**

- `chromeStorage.ts` delegates state operations to active-state functions.
- `useTabBoardStore.ts` removes its local adapter promise and subscription coordinator.
- `service-worker.ts` passes authority functions to `StatePersistence`.
- `DataStorageCard.tsx` reads status through authority helpers.

- [x] **Step 4: Run focused integration tests**

Run:

```bash
npx vitest run src/shared/store/useTabBoardStore.test.ts src/background/service-worker.test.ts src/shared/store/chromeStorage.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/shared/store/chromeStorage.ts src/shared/store/useTabBoardStore.ts src/background/service-worker.ts src/options/components/DataStorageCard.tsx
git commit -m "refactor(store): route callers through storage authority

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

### Task 5: Add the storage-cycle gate, document, and verify the deepened module

**Files:**
- Create: `scripts/check-import-cycles.mjs`
- Modify: `package.json`
- Modify: `docs/feature-evolution.md`
- Modify: `docs/technical-architecture.md`
- Modify: `docs/product-decisions.md`
- Modify: `docs/superpowers/specs/2026-07-26-storage-authority-design.md`

**Interfaces:**
- Produces: `npm run check:cycles:storage`, a targeted source import cycle verifier.
- Documents: current storage authority and D037 implementation status.

- [ ] **Step 1: Add the import-cycle verifier**

The script resolves relative `.ts`/`.tsx` imports under `src/`, computes strongly connected components, and prints every cycle. With `--deny-together <path-a>,<path-b>` it exits non-zero only when the named modules occur in the same cycle. Running without a filter exits non-zero for any cycle; that stricter mode becomes the gate after the later Session move ownership round removes the remaining Manager/shared cycle.

- [ ] **Step 2: Verify the script catches the pre-refactor cycle**

Run it against a temporary fixture graph containing `a -> b -> a`; expected exit code is non-zero with the cycle listed. Also run the targeted command against the current source before caller migration and verify it lists `activeAdapter.ts` with `chromeStorage.ts`.

- [ ] **Step 3: Add `check:cycles` to package scripts**

Add:

```json
"check:cycles:storage": "node scripts/check-import-cycles.mjs --deny-together src/shared/store/activeAdapter.ts,src/shared/store/chromeStorage.ts"
```

`npm run check` must include this targeted storage cycle verifier after the build sanity check. Do not yet make all source cycles fatal; the remaining Manager/shared cycle belongs to the later Session move ownership round.

- [ ] **Step 4: Update architecture documentation**

Record stable authority ownership, runtime fallback sequence, storage event transport, transactional migration ordering, and the removal of the storage cycle.

- [ ] **Step 5: Run final verification**

Run sequentially:

```bash
npm run check:cycles:storage
npm run check
npm test
git diff --check
```

Expected: the storage authority pair is not in one cycle, extension check passed, 0 failed tests, clean diff formatting.

- [ ] **Step 6: Request code review and resolve Critical/Important findings**

Review the complete diff against this plan and D034–D040.

- [ ] **Step 7: Commit**

```bash
git add scripts/check-import-cycles.mjs package.json docs/feature-evolution.md docs/technical-architecture.md docs/product-decisions.md docs/superpowers/specs/2026-07-26-storage-authority-design.md
git commit -m "docs(store): record deep storage authority

Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```
