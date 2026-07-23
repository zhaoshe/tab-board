# Performance Optimization Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete every remaining optimization recorded in `docs/performance-optimization-review.md` while preserving current TabBoard behavior and passing the full automated verification suite.

**Architecture:** Keep hot-path improvements inside existing service-worker, store, manager hook, component, and CSS boundaries. Use request/event-local caching, one-pass derivation, semantic structural sharing, stable global listeners, split overlay contexts, marker-scoped props, deferred filtering, and CSS rendering containment rather than new dependencies or JavaScript virtualization.

**Tech Stack:** React 18, TypeScript, Zustand 4, Mantine 7, `@dnd-kit`, Chrome Manifest V3 APIs, Vitest, happy-dom, Playwright.

## Global Constraints

- Do not add runtime dependencies.
- Preserve all existing capture, restore, overlay, focus, selection, and DnD semantics.
- Do not introduce JavaScript virtualization.
- Every production change starts with a failing focused regression test.
- Final verification is `npm run build`, `npm run check`, `npm test`, `npm run test:e2e`, and `git diff --check`.

---

## Objective Checklist

| Review item | Artifact | Proof |
|---|---|---|
| P0 #1 collision scan | `ManagerLayout.tsx` | Existing geometry tests prove category, nearest, lock, and empty behavior. |
| P0 #2 browser-group reads | `service-worker.ts` | Existing tests prove deduplication, concurrency, no-group, and rejection fallback. |
| P0 #3 stable visible groups | `useFilteredGroups.ts` | Existing hook render test proves stable references. |
| P0 #4 Open Tabs selection derivation | `OpenTabsPanel.tsx` | Existing panel tests prove selection, pinned constraints, and drag payloads. |
| P1 #5 selector stability | manager selectors plus structural sharing | Cross-workspace authoritative update tests prove current entities retain references. |
| P1 #6 stable overlay listeners | `useManagerOverlays.ts` | DOM test proves listener add/remove counts do not change across menu/preview transitions. |
| P1 #7 action API suppression | `service-worker.ts` | Worker tests prove ordinary state writes do not call action APIs and `actionClick` changes do. |
| P1 #8 SessionCard derivation | `SessionCard.tsx` | Component/source test proves one memoized pass and canonical index map. |
| P2 #9 marker update scope | workspace/session components | Render tests prove only previous/current marker cards receive changed marker props. |
| P2 #10 overlay context fan-out | `useManagerOverlays.ts` | Render-count test proves command-only consumers do not rerender for overlay state. |
| P2 #11 long Open Tabs list | `OpenTabsPanel.tsx`, manager CSS | Tests prove deferred query use and row `content-visibility` without removing DnD rows. |

## Task 1: Suppress Redundant Chrome Action Updates

**Files:**
- Modify: `src/background/service-worker.ts`
- Modify: `src/background/service-worker.test.ts`

- [ ] Add tests that dispatch `storage.onChanged` with unchanged and changed `settings.actionClick`.
- [ ] Run the focused worker tests and confirm the unchanged-state test fails.
- [ ] Parse old/new action modes from the storage change and call `applyActionPopup()` only when the normalized mode changes.
- [ ] Run the focused worker tests and confirm they pass.

## Task 2: Consolidate SessionCard Tab Metadata

**Files:**
- Modify: `src/manager/components/sessions/SessionCard.tsx`
- Modify: `src/manager/core/session-rendering.test.ts`

- [ ] Add a contract test requiring one `useMemo` result with visible tabs, counts, selected refs, and canonical index lookup.
- [ ] Run the focused test and confirm it fails.
- [ ] Replace repeated `filter()` and per-row `findIndex()` calls with one linear memoized derivation.
- [ ] Run the focused test and confirm it passes.

## Task 3: Preserve Authoritative State References

**Files:**
- Create: `src/shared/store/stateStructuralSharing.ts`
- Create: `src/shared/store/stateStructuralSharing.test.ts`
- Modify: `src/shared/store/useTabBoardStore.ts`
- Modify: `src/shared/store/useTabBoardStore.test.ts`

- [ ] Add pure tests for unchanged entities, changed nested tabs, ordering changes, and settings changes.
- [ ] Add a store test proving an authoritative write in workspace B preserves workspace A group/folder references.
- [ ] Run focused tests and confirm they fail.
- [ ] Implement explicit semantic equality and collection sharing for state entities and nested tab records.
- [ ] Apply sharing before every authoritative state publication while leaving mutation semantics unchanged.
- [ ] Run focused store tests and confirm they pass.

## Task 4: Stabilize Overlay Listeners And Split Context

**Files:**
- Modify: `src/manager/hooks/useManagerOverlays.ts`
- Modify: `src/manager/hooks/useManagerOverlays.dom.test.ts`
- Modify: overlay consumers as required by the split API

- [ ] Add DOM tests for listener binding counts and command-only consumer render counts.
- [ ] Run focused overlay tests and confirm they fail.
- [ ] Move latest menu/preview reads to refs so the global listener effect has stable dependencies.
- [ ] Split overlay commands from observable menu/preview state; keep the public hooks narrow.
- [ ] Run focused overlay tests and confirm focus, Escape, outside-click, preview timing, and listener counts pass.

## Task 5: Scope Drag Marker Updates

**Files:**
- Modify: `src/manager/components/workspace/WorkspaceContent.tsx`
- Modify: `src/manager/components/sessions/SessionCard.tsx`
- Modify: `src/manager/components/sessions/TabItemRow.tsx` if needed
- Modify: relevant manager component tests

- [ ] Add render-count tests moving tab and group markers between cards.
- [ ] Run focused tests and confirm all cards currently receive changed marker props.
- [ ] Resolve each card's marker before passing it and memoize static card rendering so only previous/current targets update.
- [ ] Preserve group insertion and category marker behavior.
- [ ] Run focused DnD and component tests.

## Task 6: Optimize Long Open Tabs Lists

**Files:**
- Modify: `src/manager/components/sidebar/OpenTabsPanel.tsx`
- Modify: `src/manager/styles/manager.css`
- Modify: `src/manager/components/sidebar/OpenTabsPanel.test.ts`
- Modify: `src/manager/core/layout.test.ts`

- [ ] Add tests requiring deferred query/filter rendering and row rendering containment.
- [ ] Run focused tests and confirm they fail.
- [ ] Use `useDeferredValue` for the non-selection filter result and add `content-visibility` plus intrinsic size to rows.
- [ ] Keep every row mounted so DnD, focus restoration, preview anchors, and accessibility remain intact.
- [ ] Run focused panel and layout tests.

## Task 7: Documentation And Completion Audit

**Files:**
- Modify: `docs/performance-optimization-review.md`
- Modify: `docs/feature-evolution.md`
- Modify: `docs/product-decisions.md` only if a lasting architecture trade-off needs recording

- [ ] Update every numbered item with implementation and evidence status.
- [ ] Record structural sharing, stable overlay listeners/context, scoped markers, and non-virtualized long-list strategy.
- [ ] Run all focused tests, then `npm run build`, `npm run check`, `npm test`, `npm run test:e2e`, and `git diff --check`.
- [ ] Audit every objective checklist row against current source and fresh command output.
