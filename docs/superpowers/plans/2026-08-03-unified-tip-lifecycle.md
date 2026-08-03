# Unified Tip Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce one active tip lifecycle across compact actions, menu descriptions, rich tab previews, and New Session drag hints.

**Architecture:** Add one module-level coordinator per page realm for pending timer and current owner. Existing components keep their approved render templates; they claim and release coordinator ownership. Menu triggers additionally track pointer versus keyboard opening so initial menu focus never shows a description.

**Tech Stack:** React 18, TypeScript, Mantine, Vitest, Playwright.

## Global Constraints

- Keep existing 1000/550/180/300ms delays.
- Keep existing tooltip visuals and copy.
- Keep one visible `role="tooltip"` per page.
- Do not change menu inventory, DnD semantics, or focus-return targets.
- Do not add dependencies.
- Do not commit without an explicit user request.

### Task 1: Shared lifecycle coordinator

**Files:**
- Create: `src/shared/components/tipLifecycle.ts`
- Create: `src/shared/components/tipLifecycle.test.ts`

- [ ] Add RED tests for delayed claim, immediate replacement, release, and stale timer cancellation.
- [ ] Implement the minimum singleton coordinator.
- [ ] Run the focused test.

### Task 2: Compact actions and menu descriptions

**Files:**
- Modify: `src/shared/components/TabBoardTooltip.tsx`
- Modify: `src/manager/hooks/useManagerOverlays.ts`
- Modify: `src/manager/components/workspace/managerMenuPolicy.ts`
- Modify: `src/manager/components/workspace/ManagerGlobalActions.tsx`
- Modify: `src/manager/components/workspace/WorkspaceMenu.tsx`
- Modify: `src/manager/components/workspace/CategoryManager.tsx`
- Modify tests beside these owners.

- [ ] Add REDs: pointer-open menu has no focused item/tip; keyboard-open first focus has no tip; first arrow shows one tip; pointer switch clears old tip.
- [ ] Route compact and menu owners through the coordinator.
- [ ] Track menu opening modality and arm keyboard descriptions only after arrow navigation.
- [ ] Run focused component and Chromium tests.

### Task 3: Rich preview and drag hint

**Files:**
- Modify: `src/manager/hooks/useManagerOverlays.ts`
- Modify: `src/manager/components/workspace/NewSessionGapTarget.tsx`
- Modify: corresponding DOM/component tests.

- [ ] Add REDs proving rich preview replaces compact/menu ownership and drag start/target replaces rich ownership.
- [ ] Route existing rich and drag timers through the coordinator without changing templates.
- [ ] Verify leave, activation, drop, cancel, Escape, blur, and visibility cleanup.

### Task 4: Project verification and docs

**Files:**
- Modify: `docs/feature-evolution.md`
- Modify: `docs/product-decisions.md`
- Modify: `docs/technical-architecture.md`

- [ ] Run focused tests.
- [ ] Run `npm test`.
- [ ] Run `npm run check`.
- [ ] Run serial Chromium E2E.
- [ ] Run `git diff --check`.
