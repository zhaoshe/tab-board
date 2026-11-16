# Restore Title Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize final page titles back to every still-persisted Saved Tab after restore/open.

**Architecture:** Keep the behavior in the background restore pipeline. Reuse the existing stable-title waiter for newly created Chrome tab IDs, then apply one best-effort title-only mutation batch to still-live records. Extend locked mutation policy only for title-only tab updates.

**Tech Stack:** TypeScript, Chrome MV3 APIs, React 18, Zustand mutation facade, Vitest.

## Global Constraints

- No new runtime dependency, manifest permission, schema field, or long-lived tab mapping.
- Never write loading, URL-placeholder, empty, or oversized titles.
- Do not fail restore when title synchronization fails.
- Skip records deleted by `deleteRestoredTabs`.
- Locked Sessions allow title-only refresh but retain all other lock protections.
- Preview and production runtime behavior must stay aligned.

---

### Task 1: Locked Title-Only Mutation

**Files:**
- Modify: `src/shared/store/stateMutations.ts`
- Test: `src/shared/store/stateMutations.test.ts`

**Interfaces:**
- Consumes: existing `update-tab` mutation.
- Produces: locked groups accept exactly `{ title: string }` tab patches.

- [ ] **Step 1: Add failing locked mutation tests**

Add cases proving a locked group's `update-tab` accepts a title-only patch but
still rejects note, URL, favicon, mixed, and structural patches.

- [ ] **Step 2: Run the focused test**

Run: `npx vitest run src/shared/store/stateMutations.test.ts -t "locked title"`

Expected: FAIL because every locked `update-tab` currently throws `GROUP_LOCKED`.

- [ ] **Step 3: Implement the narrow exception**

At the semantic lock boundary, detect an `update-tab` patch whose only own key
is `title`; validate the merged tab as usual and skip only the group-lock
rejection for that patch.

- [ ] **Step 4: Run the focused and full mutation tests**

Run:

```sh
npx vitest run src/shared/store/stateMutations.test.ts -t "locked title"
npx vitest run src/shared/store/stateMutations.test.ts
```

Expected: PASS.

---

### Task 2: Worker Restore Title Synchronization

**Files:**
- Modify: `src/background/service-worker.ts`
- Test: `src/background/service-worker.test.ts`

**Interfaces:**
- Consumes: `CreatedTab`, `waitForStableTabTitle()`, `getPersistence().applyMutations()`.
- Produces: best-effort `syncRestoredTabTitles(created)` invoked by restore paths.

- [ ] **Step 1: Add failing worker tests**

Cover:

- single Saved Tab uses the final event title, not the create-time title;
- Session and selected restore synchronize sibling titles concurrently;
- deleted unlocked records are not recreated or updated;
- retained unlocked and Locked records receive title-only updates;
- one timeout/error does not fail restore or block successful siblings;
- unchanged, missing, or URL-changed records produce no mutation.

- [ ] **Step 2: Run focused worker tests**

Run: `npx vitest run src/background/service-worker.test.ts -t "restore title"`

Expected: FAIL because restore currently returns immediately after tab creation/removal.

- [ ] **Step 3: Add the best-effort synchronizer**

Use `Promise.allSettled(created.map(({ tab, record }) => ...))`, re-read state,
construct `update-tab` mutations only for live exact records, and submit one
mutation batch. Swallow resolver or persistence failure after cleanup so the
restore result remains successful.

- [ ] **Step 4: Call it from every canonical restore path**

Invoke after optional removal in `restoreTabInternal`, `restoreGroupInternal`,
`restoreRefsInternal`, and `restoreAllInternal`. Do not add Manager listeners.

- [ ] **Step 5: Run worker tests**

Run:

```sh
npx vitest run src/background/service-worker.test.ts -t "restore title"
npx vitest run src/background/service-worker.test.ts
```

Expected: PASS.

---

### Task 3: Locked Manual Refresh And Preview Parity

**Files:**
- Modify: `src/manager/components/sessions/TabItemRow.tsx`
- Modify: `src/dev/previewChrome.ts`
- Test: `src/manager/hooks/useManagerOverlays.dom.test.ts`
- Test: `src/dev/previewChrome.test.ts`

**Interfaces:**
- Consumes: `ManagerRuntime.refreshSavedTabTitle`, preview restore handlers.
- Produces: Locked Session Refresh Title action remains enabled; preview restore updates retained records from final simulated titles.

- [ ] **Step 1: Add failing UI and preview tests**

Change the Locked Session DOM expectation from disabled to enabled and assert a
title-only update. Add preview restore tests matching retained/deleted behavior.

- [ ] **Step 2: Run focused tests**

Run:

```sh
npx vitest run src/manager/hooks/useManagerOverlays.dom.test.ts -t "Refresh Title"
npx vitest run src/dev/previewChrome.test.ts -t "restore title"
```

Expected: FAIL because locked refresh is disabled and preview restore lacks title sync.

- [ ] **Step 3: Remove the UI lock guard**

Keep read-only Bookmark rows without Refresh Title, but allow persisted locked
links to invoke the existing runtime method and title-only mutation.

- [ ] **Step 4: Mirror restore title synchronization in preview**

Use preview tab update events/final titles and existing state mutations; skip
records removed by delete-on-restore.

- [ ] **Step 5: Run focused files**

Run:

```sh
npx vitest run src/manager/hooks/useManagerOverlays.dom.test.ts
npx vitest run src/dev/previewChrome.test.ts
```

Expected: PASS.

---

### Task 4: Documentation And Verification

**Files:**
- Modify: `docs/feature-spec.md`
- Modify: `docs/technical-architecture.md`
- Modify: `docs/feature-evolution.md`
- Modify: `docs/product-decisions.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

**Interfaces:**
- Consumes: completed behavior and test evidence.
- Produces: current product/architecture record and clean verification status.

- [ ] **Step 1: Update current behavior docs**

Document automatic final-title synchronization, delete-on-restore skip,
Locked Session title-only exception, and best-effort failure semantics.

- [ ] **Step 2: Run focused verification**

Run:

```sh
npx vitest run src/shared/store/stateMutations.test.ts src/background/service-worker.test.ts src/dev/previewChrome.test.ts src/manager/hooks/useManagerOverlays.dom.test.ts
npx tsc --noEmit
git diff --check
```

- [ ] **Step 3: Run repository gates**

Run:

```sh
npm test
npm run check
```

Expected: all tests and checks pass.
