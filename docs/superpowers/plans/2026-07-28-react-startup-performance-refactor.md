# React Startup Performance Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Manager and Options startup bounded by the UI they initially render instead of total persisted tab count.

**Architecture:** Authoritative Publication hydrates from one Storage Authority read. Options uses a disposable settings projection and lazily loads storage controls. The Manager retains every session slot and insertion target but activates expensive card/tab interaction trees only near the horizontal viewport. Startup event and diagnostics work is coalesced after those ownership fixes.

**Tech Stack:** React 18, TypeScript, Vite, Zustand, Mantine v7, `@dnd-kit`, Chrome MV3 APIs, Vitest, Playwright.

## Global Constraints

- Keep the canonical `TabBoardState` schema unchanged.
- Keep the existing mutation wire and DropIntent semantics unchanged.
- Keep Authoritative Publication and structural sharing as Manager reconciliation owners.
- Keep every session's horizontal slot and group insertion geometry mounted.
- Do not restore session-to-session merge.
- Do not add a runtime dependency.
- Preserve browser/file storage, migration, fallback, and cross-context publication.
- Preserve all five manual DnD paths required by `AGENTS.md`.
- Every production change follows RED, verified RED, minimal GREEN, verified GREEN.
- Run Vite/Vitest and Playwright sequentially because this repository fixes HMR to port 5173.

---

### Task 1: Production Startup Benchmark

**Files:**
- Create: `scripts/startup-benchmark-core.mjs`
- Create: `scripts/startup-benchmark-core.test.mjs`
- Create: `scripts/benchmark-startup.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `createBenchmarkState({ groupCount, tabsPerGroup, folderCount, archiveAll })`
- Produces: `median(numbers)`
- Produces: `summarizeRuns(runs)`
- Produces CLI: `npm run benchmark:startup -- --runs 5`

- [x] **Step 1: Write failing pure benchmark tests**

Test literal state sizes/counts, median behavior for odd/even input, and summary fields including useful UI, state-read end, row/card count, and Open Tabs request count.

- [x] **Step 2: Verify RED**

Run:

```sh
node --test scripts/startup-benchmark-core.test.mjs
```

Expected: FAIL because `startup-benchmark-core.mjs` does not exist.

- [x] **Step 3: Implement pure benchmark helpers**

Keep fixtures deterministic and JSON serializable. Do not import application source into the Node benchmark.

- [x] **Step 4: Verify GREEN**

Run the same Node test; expected PASS.

- [x] **Step 5: Implement production extension runner**

Use Playwright `chromium.launchPersistentContext` with unpacked `dist`. Discover the extension ID from `context.serviceWorkers()`, using an extension-page activation fallback that tolerates `ERR_ABORTED` after commit. Seed state in the worker context, add the startup probe before page navigation, run each scenario in a fresh profile, and print JSON plus a compact table.

- [x] **Step 6: Add explicit package command and smoke the runner**

Add:

```json
"benchmark:startup": "npm run build && node scripts/benchmark-startup.mjs"
```

Run one empty-state iteration:

```sh
npm run benchmark:startup -- --runs 1 --scenario empty
```

Expected: Manager and Options JSON results with positive useful UI timings.

- [ ] **Step 7: Commit**

```sh
git add package.json scripts/startup-benchmark-core.mjs scripts/startup-benchmark-core.test.mjs scripts/benchmark-startup.mjs
git commit -m "test(performance): add startup benchmark"
```

Append the required co-author trailer.

---

### Task 2: Single-Read Authoritative Hydration

**Files:**
- Modify: `src/shared/store/authoritativePublication.ts`
- Modify: `src/shared/store/authoritativePublication.test.ts`
- Modify: `src/shared/store/useTabBoardStore.ts`
- Modify: `src/shared/store/useTabBoardStore.test.ts`
- Modify: `src/shared/store/chromeStorage.ts`

**Interfaces:**
- Replaces dependencies `ensureState()` and `readAuthoritativeState()`
- Produces dependency `initializeAuthoritativeState(): Promise<TabBoardState>`
- Uses existing `subscribeAuthoritativeState(callback)`

- [x] **Step 1: Write failing hydration tests**

Add tests that assert:

- hydration calls one initializer exactly once;
- subscription is installed before initializer resolution;
- a newer buffered remote state wins over the initializer result;
- repeated calls share one in-flight initializer;
- release during initialization prevents stale publication.

- [x] **Step 2: Verify RED**

```sh
npx vitest run src/shared/store/authoritativePublication.test.ts src/shared/store/useTabBoardStore.test.ts
```

Expected: compile/test failure because the new dependency does not exist.

- [x] **Step 3: Implement one-read hydration**

Subscribe first, call `initializeAuthoritativeState()` once, reconcile against the buffered newest state, structurally share, and publish hydrated state. Keep generation/dispose guards.

- [x] **Step 4: Wire the store directly to `ensureActiveState()`**

Remove the page hydration dependency on `ensureStateForHydration()`. Keep worker-based functions for callers that explicitly need worker persistence.

- [x] **Step 5: Verify GREEN and focused regressions**

Run the focused tests plus:

```sh
npx vitest run src/shared/hooks/useStoreHydration.test.ts src/shared/store/activeAdapter.test.ts
```

- [x] **Step 6: Run startup benchmark checkpoint**

Run empty and medium scenarios. Record before/after timings in the review; do not claim the final target yet.

- [ ] **Step 7: Commit**

Commit only hydration files and review evidence with message `perf(storage): hydrate from one authority read`, ending in the required trailer.

---

### Task 3: Options Settings Projection

**Files:**
- Create: `src/shared/store/settingsProjection.ts`
- Create: `src/shared/store/settingsProjection.test.ts`
- Modify: `src/shared/model/constants.ts`
- Modify: `src/shared/store/chromeStorageAdapter.ts`
- Modify: `src/shared/store/chromeStorageAdapter.test.ts`
- Modify: `src/shared/store/fileStorage.ts`
- Modify: `src/shared/store/fileStorage.test.ts`
- Create: `src/options/hooks/useOptionsSettings.ts`
- Create: `src/options/hooks/useOptionsSettings.test.ts`
- Modify: `src/options/OptionsApp.tsx`
- Modify: `src/options/OptionsApp.dom.test.ts`

**Interfaces:**
- Produces `SETTINGS_PROJECTION_KEY = 'tabboardSettingsProjection'`
- Produces `SettingsProjection`
- Produces `projectionFromState(state)`
- Produces `readSettingsProjection(): Promise<SettingsProjection>`
- Produces `writeSettingsProjection(state): Promise<void>`
- Produces `useOptionsSettings()` returning `{ hydrated, settings, persistenceError, updateSettings }`

- [x] **Step 1: Write failing projection contract tests**

Cover valid normalization, malformed/missing fallback to one canonical state read, stale projection repair, and projection never overriding canonical mutation results.

- [x] **Step 2: Verify RED**

Run the new projection test; expected missing-module failure.

- [x] **Step 3: Implement projection core**

Keep it framework-neutral. A projection is valid only when settings shape, non-negative revision, and timestamp are valid.

- [x] **Step 4: Write failing adapter atomic-write tests**

Expect Chrome adapter `setState()` to write state and projection in one call. Expect file adapter to publish projection only after final file commit; projection failure logs a warning but does not roll back committed file data.

- [x] **Step 5: Verify RED, then implement adapter writes**

Use one `chrome.storage.local.set` in Chrome mode. Add a file post-commit sidecar write.

- [x] **Step 6: Write failing Options hook/DOM tests**

Assert Basic settings render without `useStoreHydration`, large unrelated groups are never selected/read, mutations use the existing worker mutation message, and authoritative response updates displayed settings.

- [x] **Step 7: Implement `useOptionsSettings` and migrate Options**

The hook reads projection, repairs from canonical state only when necessary, subscribes to projection changes, and sends an `update-settings` mutation. Options no longer imports the Zustand application store for Basic settings.

- [x] **Step 8: Verify GREEN**

Run projection, adapter, hook, Options DOM, service-worker, state persistence, and storage mode suites.

- [x] **Step 9: Benchmark Options**

Run five empty and large-state Options iterations. Required gate: median difference at most 100ms and cold median at most 500ms, or document the remaining measured blocker before proceeding.

- [ ] **Step 10: Commit**

Commit as `perf(options): hydrate a settings projection`, ending in the required trailer.

---

### Task 4: Extract Stable Session Sortable Slot

**Files:**
- Create: `src/manager/components/sessions/SessionSlot.tsx`
- Create: `src/manager/components/sessions/SessionSlot.test.ts`
- Modify: `src/manager/components/sessions/SessionCard.tsx`
- Modify: `src/manager/components/sessions/SessionCardHeader.tsx`
- Modify: `src/manager/components/workspace/WorkspaceContent.tsx`
- Modify: `src/manager/core/session-rendering.test.ts`
- Modify: `src/manager/core/uiOwnership.test.ts`
- Modify: `tests/e2e/session-dnd.e2e.ts`

**Interfaces:**
- Produces `SessionSortableBindings`
- Produces `SessionSlot` as the only ordinary group `useSortable` owner
- `SessionCard` consumes `sortable: SessionSortableBindings`
- Drag-overlay `SessionCard` receives disabled overlay bindings

- [x] **Step 1: Write failing ownership and DOM tests**

Assert exactly one group sortable owner, the slot keeps `data-group-id`, full cards retain IDs/handles, and drag overlay remains disabled.

- [x] **Step 2: Verify RED**

Run focused session/ownership tests; expected missing `SessionSlot`.

- [x] **Step 3: Extract sortable ownership without activation**

Render every full `SessionCard` exactly as before. Move only `useSortable`, node ref, transform, transition, placeholder, and drag-handle ports into `SessionSlot`.

- [x] **Step 4: Verify GREEN**

Run focused unit tests and complete `session-dnd.e2e.ts`. No performance behavior changes yet.

- [ ] **Step 5: Commit**

Commit as `refactor(dnd): own group sorting in session slots`, ending in the required trailer.

---

### Task 5: Near-Viewport Session Activation

**Files:**
- Create: `src/manager/hooks/useSessionActivation.ts`
- Create: `src/manager/hooks/useSessionActivation.test.ts`
- Create: `src/manager/components/sessions/SessionCardShell.tsx`
- Modify: `src/manager/components/sessions/SessionSlot.tsx`
- Modify: `src/manager/components/workspace/WorkspaceContent.tsx`
- Modify: `src/manager/styles/session.css`
- Modify: `src/manager/styles/shell.css`
- Modify: `tests/e2e/large-board.e2e.ts`
- Modify: `tests/e2e/session-dnd.e2e.ts`

**Interfaces:**
- Produces `useSessionActivation({ contextKey, groupIds, forcedIds, overscan })`
- Returns `{ activeIds, registerSlot, activate }`
- `SessionCardShell` consumes group summary plus sortable bindings

- [ ] **Step 1: Write failing pure/hook tests**

Cover initial bounded activation, monotonic activation, context reset, forced activation, IntersectionObserver absence fallback, and observer overscan root margin.

- [ ] **Step 2: Verify RED**

Run the new hook tests; expected missing-module failure.

- [ ] **Step 3: Implement activation hook and lightweight shell**

Use board-root IntersectionObserver with inline overscan. Keep activated IDs monotonic per context. Shell exposes session title/count/lock state and the same accessible group drag handle.

- [ ] **Step 4: Integrate slots**

All slots and group insertion targets stay mounted. Active slots render full cards; inactive slots render shells. Highlight/search reveal and drag source/target force activation.

- [ ] **Step 5: Rewrite large-board E2E contract**

Assert 60 session slots remain attached, initial full cards are bounded, a far shell scrolls into view and upgrades to a full card, then its tab interactions work.

- [ ] **Step 6: Verify GREEN and DnD**

Run hook/session/layout tests, large-board E2E, session DnD E2E, and category handle isolation.

- [ ] **Step 7: Benchmark Manager**

Run five heavy iterations. Required gate: median useful UI at most 1,000ms and first useful UI has only viewport + overscan tab rows.

- [ ] **Step 8: Commit**

Commit as `perf(manager): activate session content near the viewport`, ending in the required trailer.

---

### Task 6: Open Tabs Refresh Coalescing

**Files:**
- Create: `src/manager/core/refreshCoalescer.ts`
- Create: `src/manager/core/refreshCoalescer.test.ts`
- Modify: `src/manager/hooks/useOpenTabsRuntime.ts`
- Modify: `src/manager/hooks/useOpenTabsRuntime.dom.test.ts`

**Interfaces:**
- Produces `createRefreshCoalescer(run, { delay: 75 })`
- Methods: `request()`, `dispose()`
- Contract: one active run and at most one trailing run while dirty

- [ ] **Step 1: Write failing coalescer tests**

Use fake timers to assert event bursts collapse, in-flight requests create one trailing run, and disposal cancels pending work.

- [ ] **Step 2: Verify RED**

Run new test; expected missing module.

- [ ] **Step 3: Implement and integrate**

Route startup/focus/visibility/tab/window events through the coalescer. Keep explicit user Refresh immediate. Ignore created/updated extension-page URLs.

- [ ] **Step 4: Verify GREEN**

Run coalescer and Open Tabs hook suites. Add a DOM test that emits startup events and observes at most two real list requests.

- [ ] **Step 5: Benchmark request count**

Startup benchmark must report no more than one initial plus one trailing call.

- [ ] **Step 6: Commit**

Commit as `perf(open-tabs): coalesce startup refresh events`, ending in the required trailer.

---

### Task 7: Reduce Row And Derived-State Fan-Out

**Files:**
- Modify: `src/manager/components/sessions/SessionCard.tsx`
- Modify: `src/manager/components/sessions/SessionTabList.tsx`
- Modify: `src/manager/components/sessions/TabItemRow.tsx`
- Modify: `src/manager/components/workspace/WorkspaceContent.tsx`
- Modify: `src/manager/components/workspace/WorkspaceHeader.tsx`
- Modify: `src/manager/core/selectors.ts`
- Modify: `src/manager/core/selectors.test.ts`
- Modify: `src/manager/components/shell/ManagerLayout.tsx`
- Modify: `src/manager/components/shell/ManagerDndCoordinator.tsx`
- Modify: `src/manager/components/shell/ManagerLayout.test.ts`

**Interfaces:**
- SessionCard owns `SessionTabCommands`
- Tab rows receive command ports and confirmation boolean
- Produces `getCanonicalGroupIndexById(groups)`
- Category strip counts use one workspace-group pass
- DnD replacement snapshot consumes revision/source identity rather than joined tab IDs

- [ ] **Step 1: Write failing selector and row contract tests**

Assert literal category counts, canonical indexes, row commands without store subscriptions, and replacement invalidation on relevant revisions.

- [ ] **Step 2: Verify RED**

Run focused tests; expected new-contract failures.

- [ ] **Step 3: Implement command ports and single-pass derivations**

Read event-only actions at SessionCard ownership. Build maps/counts once. Remove joined all-tab strings from render-time keys.

- [ ] **Step 4: Verify GREEN**

Run selector, session rendering, overlay, DnD, ManagerLayout, and UI ownership suites.

- [ ] **Step 5: Commit**

Commit as `perf(manager): reduce session render fan-out`, ending in the required trailer.

---

### Task 8: Batch Diagnostics And Lazy Optional Modules

**Files:**
- Modify: `src/shared/utils/diagnostics.ts`
- Modify: `src/shared/utils/diagnostics.test.ts`
- Modify: `src/options/OptionsApp.tsx`
- Modify: `src/options/OptionsApp.dom.test.ts`
- Modify: `src/options/components/DataStorageCard.tsx`
- Modify: `src/options/components/FolderPickerDialog.tsx`
- Modify: `src/shared/store/activeAdapter.ts`
- Modify: `src/shared/store/activeAdapter.test.ts`

**Interfaces:**
- Info diagnostics flush after 250ms/idle as one read+write
- Warn/error request an immediate batch flush
- Options Advanced uses `lazy(() => import('./components/DataStorageCard'))`
- Storage Authority literal-loads file modules only for file-mode operations

- [ ] **Step 1: Write failing diagnostics batching tests**

Assert 25 breadcrumbs cause one storage get/set after the timer, warn/error flush immediately, and the bounded ring remains correct.

- [ ] **Step 2: Verify RED, implement batching, verify GREEN**

Use fake timers and an injectable scheduler only if browser globals make direct testing impossible.

- [ ] **Step 3: Write failing lazy-loading contracts**

Options DOM should render Basic without Data Storage mounted; opening Advanced mounts it after Suspense. ActiveAdapter browser initialization must not invoke a file-module loader.

- [ ] **Step 4: Implement literal dynamic imports**

Add an actionable Advanced-load fallback. Keep all file migration behavior unchanged.

- [ ] **Step 5: Verify GREEN and build chunks**

Run diagnostics, Options, file storage, active adapter, and production entry tests. Inspect the production HTML/chunks to confirm closed Advanced and browser mode no longer require file UI/backend modules.

- [ ] **Step 6: Benchmark empty state**

If empty Manager/Options still miss targets, document bundle evidence before considering selective Mantine CSS. Do not add unmeasured icon/CSS rewrites.

- [ ] **Step 7: Commit**

Commit as `perf(startup): defer diagnostics and optional modules`, ending in the required trailer.

---

### Task 9: Product Documentation And Final Review

**Files:**
- Modify: `docs/feature-spec.md`
- Modify: `docs/technical-architecture.md`
- Modify: `docs/feature-evolution.md`
- Modify: `docs/product-decisions.md`
- Modify: `docs/reviews/2026-07-28-react-startup-performance-review.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

**Interfaces:**
- D033 becomes partially superseded by the stable-slot activation decision
- Review gains after-measurement table and completion matrix

- [ ] **Step 1: Update current behavior and decision history**

Document projection ownership, one-read hydration, stable slot activation,
Ctrl+F tradeoff, Open Tabs coalescing, and benchmark command.

- [ ] **Step 2: Run plan/spec coverage audit**

Map every P0/P1/P2 recommendation to code, test, and measurement evidence.
Scan for placeholders and stale full-DOM statements.

- [ ] **Step 3: Run Vercel React practices re-review**

Re-check bundle waterfalls, conditional imports, state subscriptions, initial
render scale, content visibility, and transient values. Fix any new issue with
its own RED/GREEN cycle.

- [ ] **Step 4: Commit docs**

Commit as `docs(performance): record startup optimization results`, ending in
the required trailer.

---

### Task 10: Full Verification And Production Acceptance

**Files:**
- Modify only files needed for failures proven during this task

- [ ] **Step 1: Run static/build gates**

```sh
npm run check
git diff --check
```

- [ ] **Step 2: Run complete unit suite**

```sh
npm test
```

- [ ] **Step 3: Run E2E sequentially**

```sh
npm run test:e2e
```

- [ ] **Step 4: Run production benchmark**

```sh
npm run benchmark:startup -- --runs 5
```

Record medians and compare every target.

- [ ] **Step 5: Run production browser and accessibility matrix**

Audit Manager and Options default/open, light/dark, desktop/compact, reduced
motion, and storage Advanced states. Require axe zero violations/incomplete.

- [ ] **Step 6: Run DnD acceptance**

Verify all five AGENTS.md paths plus repeated keyboard reorder and category
handle isolation. Check canonical persisted state after every drop.

- [ ] **Step 7: Request review**

Use `superpowers:requesting-code-review`. Since no subagents were requested,
perform the same requirements/diff review locally and fix every Critical or
Important finding with TDD.

- [ ] **Step 8: Final commit if verification produced fixes**

Use an accurate message and ensure exactly one required co-author trailer.
