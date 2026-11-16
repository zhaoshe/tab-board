# Title Refresh Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display a row-level spinner in the Delete slot for every active title refresh.

**Architecture:** Worker emits per-record start/finish lifecycle messages with operation IDs. Manager keeps a page-local keyed activity store and each Saved Tab row subscribes to its own key. The existing `AccessibleIconAction loading` state renders the spinner without geometry changes.

**Tech Stack:** TypeScript, React 18 `useSyncExternalStore`, Chrome MV3 runtime messages, Mantine ActionIcon, Vitest.

## Global Constraints

- No persistent state, schema, permission, or dependency change.
- Cover manual single, Session batch, and automatic restore synchronization.
- Queue-waiting Session items are not loading until their resolver starts.
- Overlap-safe operation IDs.
- Loading always clears in `finally`.
- Bookmark/read-only rows are excluded.

### Task 1: Page-Local Activity Store

**Files:**
- Create: `src/manager/core/titleRefreshActivity.ts`
- Create: `src/manager/core/titleRefreshActivity.test.ts`
- Create: `src/manager/hooks/useTitleRefreshActivity.ts`

- [ ] Add RED tests for keyed start/finish, overlap, duplicate events, and
  isolated subscriptions.
- [ ] Implement a `Map<recordKey, Set<operationId>>` store.
- [ ] Add one runtime-listener hook and one row subscription hook.
- [ ] Run focused tests.

### Task 2: Worker Lifecycle Protocol

**Files:**
- Modify: `src/background/service-worker.ts`
- Test: `src/background/service-worker.test.ts`

- [ ] Add RED tests for manual, Session batch, restore sync, failure, and
  deleted-record skip.
- [ ] Add `withTitleRefreshActivity(ref, operation)` that broadcasts start and
  finish in `finally`.
- [ ] Pass group/tab identity to manual refresh requests.
- [ ] Wrap only actual resolver execution, not batch queue waiting.
- [ ] Run worker tests.

### Task 3: Row Loading UI And Preview

**Files:**
- Modify: `src/manager/components/sessions/TabItemRow.tsx`
- Modify: `src/manager/components/shell/ManagerLayout.tsx`
- Modify: `src/manager/hooks/useManagerRuntime.ts`
- Modify: `src/dev/previewChrome.ts`
- Test: Manager DOM/static/runtime and preview tests.

- [ ] Add RED DOM tests requiring `Refreshing title` in the Delete slot.
- [ ] Render `AccessibleIconAction loading` for active persisted rows.
- [ ] Install the single listener in `ManagerLayout`.
- [ ] Mirror activity broadcasts in preview.
- [ ] Run focused tests and rendered verification.

### Task 4: Documentation And Gates

- [ ] Update feature, architecture, evolution, decision, findings, progress,
  and task plan.
- [ ] Run `npm test`, `npm run check`, `tsc --noEmit`, and `git diff --check`.
