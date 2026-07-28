# TabBoard UI / UX Pro Max Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement every P0, P1, and P2 recommendation in `docs/reviews/2026-07-27-ui-ux-pro-max-review.md`, then repeat `ui-ux-pro-max` static and rendered review until no new unresolved finding remains.

**Architecture:** Preserve the existing model/store/background and typed DnD contracts. Correct interaction ownership first, then split the remaining large Manager components behind their existing public entrypoints, and only then apply visual-density and feedback changes. Every behavior change follows RED/GREEN TDD and receives browser geometry, keyboard, touch, theme, and accessibility verification.

**Tech Stack:** React 18, TypeScript, Mantine v7, Zustand, `@dnd-kit`, Vitest, Playwright, `agent-browser`, `ui-ux-pro-max`.

## Global Constraints

- Preserve the horizontal session board and full-DOM `content-visibility` strategy.
- Do not change persistent schema, storage protocol, mutation wire, or DropIntent product semantics.
- Do not restore session-to-session merge behavior.
- Do not add runtime dependencies.
- Keep Manager, Popup, and Options light/dark and reduced-motion behavior.
- Keep all existing destructive confirmation and URL-backed navigation contracts.
- Use Tabler icons and the existing Inter/system font stack.
- Keep generated artifacts, screenshots, and browser mocks out of git.
- Do not commit unless the user explicitly requests it.

---

### Task 1: Stable Sidebar Disclosure

**Files:**
- Modify: `src/manager/styles/sidebar.css`
- Modify: `tests/e2e/manager-boot.e2e.ts`

**Interfaces:**
- Consumes: `.manager-shell--sidebar-collapsed`, `.manager-sidebar__overlay`.
- Produces: collapsed disclosure that changes overlay width without changing `.manager-main` geometry.

- [x] Add a Playwright assertion that collapsed `main.left` remains unchanged before, during, and after sidebar hover.
- [x] Run the test and verify it fails with the current 54px to 300px reflow.
- [x] Remove the collapsed-hover grid-column expansion and keep expansion on the absolute overlay only.
- [x] Run the focused E2E test and verify it passes.

### Task 2: Separate Category Navigation and Reorder

**Files:**
- Modify: `src/manager/components/workspace/CategoryNav.tsx`
- Modify: `src/manager/styles/header.css`
- Modify: `src/manager/components/workspace/WorkspaceHeader.test.ts`
- Modify: `tests/e2e/manager-boot.e2e.ts`
- Modify: `tests/e2e/session-dnd.e2e.ts`

**Interfaces:**
- Produces: category label button with navigation only and a separate `@dnd-kit` activator handle.
- Preserves: category payload and reorder target contracts.

- [x] Add source/DOM tests requiring separate `data-category-trigger="label"` and `data-category-drag-handle`.
- [x] Add E2E: Enter on category label updates URL and does not show a drag overlay.
- [x] Add E2E: Space on category drag handle starts keyboard DnD.
- [x] Run focused tests and observe failures.
- [x] Attach `setNodeRef` to the category container and `setActivatorNodeRef` plus listeners/attributes to the handle.
- [x] Add fine-pointer and coarse-pointer visibility rules for the handle.
- [x] Run focused Vitest and E2E tests.

### Task 3: Restore Save Window and Clarify Open Tab Actions

**Files:**
- Create: `src/manager/components/sidebar/OpenTabsWindowBar.tsx`
- Create: `src/manager/components/sidebar/OpenTabRow.tsx`
- Modify: `src/manager/components/sidebar/OpenTabsPanel.tsx`
- Modify: `src/manager/components/sidebar/Sidebar.tsx`
- Modify: `src/manager/hooks/useOpenTabsRuntime.ts`
- Modify: `src/manager/core/open-tabs.ts`
- Modify: `src/manager/components/sidebar/OpenTabsPanel.test.ts`
- Modify: `src/manager/hooks/useOpenTabsRuntime.dom.test.ts`
- Modify: `tests/e2e/manager-boot.e2e.ts`

**Interfaces:**
- Adds: `OpenTabsWorkflowCommands.captureWindow(categorySnapshot, getCurrentCategorySnapshot)`.
- Preserves: `saveSelectedTabs` worker contract and authoritative capture completion.
- Produces: a primary Save Window action and single-click/Enter tab focus semantics.

- [x] Add tests requiring Save Window, eligible count, disabled explanation, and authoritative capture completion.
- [x] Add tests requiring a single click on an Open Tab row to call `focusTab`.
- [x] Add source ownership tests for window bar and row extraction.
- [x] Run focused tests and observe failures.
- [x] Extract the common capture operation from selection capture and add window capture using all eligible IDs from the selected window.
- [x] Render Save Window in the window bar and route completion through `Sidebar.onCaptureCompleted`.
- [x] Move info/pin/close to an explicit More action; remove double-click-only focusing.
- [x] Extract `OpenTabsWindowBar` and `OpenTabRow`, leaving `OpenTabsPanel` as workflow composition.
- [x] Run focused unit/DOM/E2E tests.

### Task 4: Action Density and Touch Contracts

**Files:**
- Modify: `src/shared/components/AccessibleIconAction.tsx`
- Modify: `src/shared/components/AccessibleIconAction.test.ts`
- Modify: `src/shared/styles/accessibility.css`
- Modify: `src/manager/styles/session.css`
- Modify: `src/manager/styles/sidebar.css`
- Modify: `src/manager/styles/header.css`
- Modify: `src/popup/popup.css`
- Modify: `src/manager/core/accessibilityMarkup.test.ts`

**Interfaces:**
- Adds: `density: 'compact' | 'touch'` to the shared icon action.
- Produces: visible resting controls, 32px fine-pointer actions, and 44px coarse-pointer actions.

- [x] Add tests for shared density classes and production use.
- [x] Add static contracts preventing `opacity: 0` on interactive action owners.
- [x] Run focused tests and observe failures.
- [x] Apply discoverable low-emphasis resting states for fine pointers.
- [x] Add `hover: none` / `pointer: coarse` rules with stable visible controls and 44px targets.
- [x] Use the shared action primitive for Manager and Popup icon-only commands touched by this refactor.
- [x] Run focused tests and browser touch geometry probes.

### Task 5: Remaining Manager Ownership Split

**Files:**
- Create: `src/manager/components/sessions/SessionCardHeader.tsx`
- Create: `src/manager/components/sessions/SessionCardMeta.tsx`
- Create: `src/manager/components/shell/managerDndGeometry.ts`
- Create: `src/manager/components/shell/ManagerDragOverlay.tsx`
- Modify: `src/manager/components/sessions/SessionCard.tsx`
- Modify: `src/manager/components/shell/ManagerDndCoordinator.tsx`
- Modify: `src/manager/core/uiOwnership.test.ts`
- Modify: related focused tests.

**Interfaces:**
- Preserves: public `SessionCard` and `ManagerDndCoordinator` props.
- Produces: pure DnD geometry module, dedicated overlay renderer, session header and metadata owners.

- [x] Add ownership tests requiring the new files and bounding responsibilities.
- [x] Run tests and observe failures.
- [x] Extract pure collision/marker/keyboard geometry without changing behavior.
- [x] Extract drag overlay rendering.
- [x] Extract Session header/action/menu and metadata rendering.
- [x] Keep transient drag state in refs and avoid new broad Zustand subscriptions.
- [x] Run Manager unit, DnD, ownership, and E2E suites.

### Task 6: Popup Result Prediction

**Files:**
- Modify: `src/popup/PopupApp.tsx`
- Modify: `src/popup/popup.css`
- Modify: `src/popup/PopupApp.dom.test.ts`

**Interfaces:**
- Produces: visible and accessible selected-tab result derived from `selectedTabs.length`.

- [x] Add tests for `Save 4 Tabs`, `4 of 7 tabs`, and zero-result explanation after filters.
- [x] Run tests and observe failures.
- [x] Implement shared visible/accessibility copy from one derived count.
- [x] Reserve stable action width.
- [x] Run Popup DOM tests and browser light/dark audits.

### Task 7: Options Copy, Save State, and Form Layout

**Files:**
- Create: `src/options/hooks/useSettingsDraft.ts`
- Create: `src/options/components/SettingsSection.tsx`
- Modify: `src/options/OptionsApp.tsx`
- Modify: `src/options/options.css`
- Modify: `src/options/OptionsApp.dom.test.ts`
- Modify: `src/manager/core/uiCopy.test.ts`

**Interfaces:**
- Produces: immediate saves for discrete controls, 500ms/blur save for text drafts, and stable page-level save status.
- Corrects: dedupe copy to source-capture scope and duplicate-tab closing side effect.

- [x] Add fake-timer tests proving long text produces one update after 500ms and flushes on blur.
- [x] Add tests for `Saving…`, `Saved`, and failure status.
- [x] Add copy test for exact dedupe scope and side effect.
- [x] Add source test requiring unframed Basic settings sections.
- [x] Run tests and observe failures.
- [x] Implement `useSettingsDraft`.
- [x] Replace Basic cards with `SettingsSection`; keep Data Storage as a card/tool in Advanced.
- [x] Replace transient fixed notifications with stable header status.
- [x] Run Options DOM tests and browser narrow/light/dark audits.

### Task 8: Navigation Orientation and Visual Density

**Files:**
- Modify: `src/manager/core/selectors.ts`
- Modify: `src/manager/components/workspace/CategoryNav.tsx`
- Modify: `src/manager/components/sidebar/OpenTabsWindowBar.tsx`
- Modify: `src/manager/components/sessions/SessionCardMeta.tsx`
- Modify: `src/manager/styles/header.css`
- Modify: `src/manager/styles/session.css`
- Modify: `src/manager/styles/sidebar.css`
- Modify: focused selector/component tests.

**Interfaces:**
- Adds: category session count to `CategoryStripItem`.
- Produces: category counts, expanded-sidebar window ordinal/count, 12px metadata floor.

- [x] Add selector tests for category counts and zero-display policy.
- [x] Add component tests for window ordinal plus count.
- [x] Add static test preventing functional text below 12px.
- [x] Run tests and observe failures.
- [x] Implement counts using existing category projection semantics.
- [x] Render compact tabular counts and expanded window labels.
- [x] Raise metadata to 12px/16px.
- [x] Run focused tests and responsive browser checks.

### Task 9: Scroll Ownership Cues

**Files:**
- Create: `src/manager/hooks/useOverflowCues.ts`
- Modify: `src/manager/components/workspace/WorkspaceContent.tsx`
- Modify: `src/manager/components/sessions/SessionCard.tsx`
- Modify: `src/manager/components/sidebar/OpenTabsPanel.tsx`
- Modify: `src/manager/styles/shell.css`
- Modify: `src/manager/styles/session.css`
- Modify: `src/manager/styles/sidebar.css`
- Add focused hook/DOM tests.

**Interfaces:**
- Produces: start/end overflow data attributes without intercepting wheel events.

- [x] Add hook tests for start/end overflow state.
- [x] Add DOM tests for conditional edge-cue attributes.
- [x] Run tests and observe failures.
- [x] Implement passive scroll/resize observation.
- [x] Add subtle semantic edge cues to board, session list, and Open Tabs list.
- [x] Keep vertical wheel behavior untouched.
- [x] Run focused tests and browser scroll-chain probes.

### Task 10: Documentation and Iterative UI/UX Pro Max Review

**Files:**
- Modify: `docs/reviews/2026-07-27-ui-ux-pro-max-review.md`
- Modify: `docs/feature-spec.md`
- Modify: `docs/technical-architecture.md`
- Modify: `docs/feature-evolution.md`
- Modify: `docs/product-decisions.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

**Interfaces:**
- Produces: current behavior docs, review matrix, and prompt-to-artifact evidence.

- [x] Update behavior and architecture docs after implementation.
- [x] Run `ui-ux-pro-max` design-system/product/UX/React searches against the current product.
- [x] Run static review across Manager, Popup, Options, shared styles, and all changed components.
- [x] Run rendered review at 390x844, 800x800, 1280x800, and 1440x900 in light/dark/reduced-motion/touch states.
- [x] Fix each new finding with RED/GREEN tests.
- [x] Repeat review until one complete pass yields zero unresolved findings.

### Task 11: Independent Completion Audit

**Files:**
- Modify: `docs/reviews/2026-07-27-ui-ux-pro-max-review.md`
- Modify: `findings.md`
- Modify: `progress.md`

- [x] Restate the objective as concrete deliverables.
- [x] Map all 12 recommendations, 3 stages, named files, commands, browser states, and constraints to evidence.
- [x] Run `npm run check`.
- [x] Run `npm test`.
- [x] Run `npm run test:e2e`.
- [x] Run `git diff --check`.
- [x] Re-run Manager, Popup, and Options axe audits for default/open states.
- [x] Re-run category/session/open-tab DnD keyboard and pointer gates.
- [x] Inspect dependency and generated-artifact diffs.
- [x] Keep the goal active if any checklist item is missing, weakly verified, or uncertain.
