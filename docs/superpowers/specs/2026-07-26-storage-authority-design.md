# Storage Authority Deepening Design

**Date:** 2026-07-26
**Status:** Implemented and verified
**Scope:** Deepen the storage authority module so backend selection, runtime fallback, migration commit, cross-context notification, and subscription ownership stay behind one interface.

## Problem

TabBoard has two real storage adapters, `ChromeStorageAdapter` and `FileStorageAdapter`, but the authority lifecycle is not contained by the adapter seam:

- `activeAdapter.ts` imports ping transport from `chromeStorage.ts`, while `chromeStorage.ts` imports `getActiveAdapter()`, creating a direct cycle.
- `useTabBoardStore.ts` caches its own adapter promise and owns lazy subscription coordination.
- `service-worker.ts` repeats adapter delegation.
- Options reaches into adapter selection, migration, IndexedDB handle state, and live backend reads.
- `FileStorageAdapter.setState()` and `reloadFromDisk()` can fail after initialization, but `activeAdapter` only falls back during initialization.
- The last point contradicts accepted D037, which requires any file read/write failure to degrade to browser storage and keep TabBoard usable.

## Decision

Keep `StorageAdapter` as the backend seam and deepen `activeAdapter.ts` into the storage authority module.

The module owns one stable authority object for the lifetime of an extension context. Callers may cache this object safely. Its internal backend can transition from File to Chrome without replacing the authority reference.

The authority owns:

- bootstrap-based backend selection;
- backend subscription rebinding;
- last known valid state;
- serialized writes;
- runtime fallback transition;
- cross-context file ping handling;
- cross-context fallback notification;
- explicit browser/file migration commit;
- reconnect validation;
- diagnostics and human-readable fallback reason mapping.

## Runtime Failure Semantics

### File write failure

1. The current File write rejects.
2. The authority copies its last known valid state to Chrome storage when available.
3. The authority swaps its internal backend to Chrome.
4. The authority notifies local and live cross-context listeners.
5. The original write still rejects.
6. Existing mutation retry logic retries against the same authority reference, now backed by Chrome.

The failed, uncommitted state is never copied to Chrome and is never reported as committed.

### File read or reload failure

1. The authority copies its last known valid state to Chrome when available.
2. It swaps to Chrome and notifies listeners.
3. A direct read continues from Chrome so the page remains usable.
4. A background ping reload has no caller to reject; it completes after the fallback transition.

### Chrome failure

Chrome adapter failures are not recursively “fallen back.” They propagate through the existing persistence error path because no third backend exists.

## Cross-Context Events

Create `src/shared/store/storageEvents.ts` as a transport module for:

- file commit pings;
- fallback events containing `eventId`, `reason`, and `occurredAt`.

`activeAdapter.ts` imports this transport. `chromeStorage.ts` may re-export the legacy ping names, but no longer supplies implementation to `activeAdapter.ts`; this removes the direct cycle.

When one live extension context degrades, other live contexts receiving the fallback event also swap their authority backend to Chrome. Event IDs suppress duplicate local delivery.

## Migration Commit Points

### Browser to File

1. Persist the directory handle.
2. Create and validate a File adapter.
3. Seed the complete normalized state into the folder.
4. Write bootstrap mode `file` last.
5. Install File as the authority backend.

If folder initialization or seeding fails, bootstrap remains `browser` and the prior authority stays active.

### File to Browser

1. Read File state if the user requested copy-back.
2. Write that state to Chrome.
3. Write bootstrap mode `browser`.
4. Clear the stored directory handle.
5. Install Chrome as the authority backend.

### Reconnect

Reconnect validates the selected folder and loads a File adapter before writing bootstrap mode `file`. The UI must not report success for an unreadable folder.

## Caller Shape

- `getActiveAdapter()` remains for compatibility and returns the stable authority.
- Add active-state convenience functions in `activeAdapter.ts` for read, write, ensure, and subscribe.
- `chromeStorage.ts`, `service-worker.ts`, and `useTabBoardStore.ts` delegate to those functions instead of coordinating backend lifecycles.
- Options migration functions remain exported from the authority module; Options does not inspect File-only methods.

## Testing

Focused behavior tests must prove:

- the authority reference survives runtime fallback;
- a failed File write seeds Chrome with the last committed state, rejects the current write, and lets the next write succeed in Chrome;
- a failed File read returns the last committed state from Chrome;
- a failed ping reload degrades without leaving File active;
- a remote fallback event degrades another live authority context once;
- failed File migration leaves bootstrap in browser mode;
- failed reconnect leaves bootstrap unchanged;
- existing migration, ping, and adapter contract tests remain green;
- the direct `activeAdapter.ts ↔ chromeStorage.ts` cycle is absent in the final dependency audit.

## Documentation

Update:

- `docs/feature-evolution.md` with the authority deepening and D037 completion;
- `docs/technical-architecture.md` with stable authority, runtime fallback, event transport, and migration commit ordering;
- `docs/product-decisions.md` D037/D039 implementation notes without changing the accepted decisions.

## Non-Goals

- No third storage backend.
- No dual-write steady state.
- No new runtime dependency.
- No redesign of file layout or merge policy.
- No suppression of the original failed mutation.
