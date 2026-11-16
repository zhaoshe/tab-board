# Session Refresh All Titles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh every saved Link title in one Session with stable-title waiting, bounded concurrency, and one canonical write.

**Architecture:** Add one worker runtime action that reuses the existing single-URL resolver under a three-worker queue. Re-read canonical state and commit successful title-only updates in one batch. Expose the action through `ManagerRuntime` and a Session menu item.

**Tech Stack:** TypeScript, Chrome MV3 APIs, React 18, Vitest.

## Global Constraints

- No schema, permission, or dependency change.
- Locked Sessions are supported.
- Bookmark/read-only Sessions do not expose the action.
- Maximum resolver concurrency is exactly 3.
- Loading, URL-placeholder, empty, oversized, failed, and stale titles never overwrite saved records.
- Successful updates use one mutation batch.

---

### Task 1: Worker Batch Refresh

**Files:**
- Modify: `src/background/service-worker.ts`
- Test: `src/background/service-worker.test.ts`

**Interfaces:**
- Produces: runtime action `refresh-saved-group-titles`.
- Returns: `{ refreshed: number; failed: number }`.

- [ ] Add failing tests for success, partial failure, Notes skipped, Locked
  Session, URL race, one mutation batch, and concurrency ceiling 3.
- [ ] Run `npx vitest run src/background/service-worker.test.ts -t "refresh saved group titles"` and verify RED.
- [ ] Implement a fixed three-worker queue around existing
  `refreshSavedTabTitle(url)`.
- [ ] Re-read canonical state and apply one title-only mutation batch.
- [ ] Run focused and full worker tests.

### Task 2: Manager Menu And Feedback

**Files:**
- Modify: `src/manager/hooks/useManagerRuntime.ts`
- Modify: `src/manager/components/sessions/SessionCard.tsx`
- Test: `src/manager/hooks/useManagerRuntime.test.ts`
- Test: `src/manager/core/session-rendering.test.ts`
- Test: mounted Session menu tests

**Interfaces:**
- Produces: `ManagerRuntime.refreshSavedGroupTitles(groupId)`.
- Menu label: `Refresh All Titles`.

- [ ] Add failing runtime and mounted menu tests.
- [ ] Add menu item for persisted Sessions, including Locked Sessions; exclude
  read-only Sessions.
- [ ] Show `Titles refreshed` for zero failures, otherwise
  `<N> titles refreshed, <M> failed`.
- [ ] Run focused Manager tests.

### Task 3: Preview And Documentation

**Files:**
- Modify: `src/dev/previewChrome.ts`
- Test: `src/dev/previewChrome.test.ts`
- Modify: current behavior/architecture/evolution/decision docs and planning logs.

- [ ] Add failing preview runtime test.
- [ ] Mirror batch refresh and result shape.
- [ ] Update docs.
- [ ] Run focused owners, `npm test`, `npm run check`, and rendered menu
  verification.
