# Open Tabs Workflow Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Open Tabs one workflow owner, one shared protocol, grouped interfaces, and explicit capture/drop completion.

**Architecture:** Move transport contracts to shared code, centralize state transitions in a pure reducer, keep Chrome wiring in a React adapter, lift workflow ownership to `ManagerLayout`, and replace global DOM events with direct commands/results.

**Tech Stack:** React 18, TypeScript, Chrome extension runtime APIs, Zustand, Vitest, happy-dom, `@dnd-kit`.

## Global Constraints

- Preserve every current Open Tabs product rule.
- Do not change DnD geometry or persistent Session move semantics.
- Keep preview harness and production service worker on the same protocol.
- No new runtime dependency.
- Every behavior change starts with a failing focused test.
- Every commit message ends with `Co-authored-by: TRAE CLI <noreply@bytedance.com>`.

---

### Task 1: Move Open Tabs protocol to shared ownership

**Files:**
- Create: `src/shared/openTabs.ts`
- Create: `src/shared/openTabs.test.ts`
- Modify: `src/manager/core/open-tabs.ts`
- Modify: `src/background/service-worker.ts`
- Modify: `src/dev/previewChrome.ts`
- Modify: `src/shared/store/mutationValidation.ts`
- Modify: `src/shared/store/stateMutations.ts`
- Modify: `src/shared/store/useTabBoardStore.ts`
- Modify: `src/manager/core/{dnd,commands}.ts`

**Interfaces:**
- Produces: `OpenTabInfo`, `OpenWindowInfo`, `OpenTabsListResult`, `OpenTabsCaptureResult`, `RuntimeResponse<T>`.
- Preserves: current field names and capture result semantics.

- [x] Write a failing protocol test that validates a complete list result and rejects malformed tab/window/capture responses.
- [x] Run `npx vitest run src/shared/openTabs.test.ts`; verify RED because the shared module is absent.
- [x] Implement types and parsers without DOM or Chrome dependencies.
- [x] Migrate all production type imports and remove worker-local duplicate interfaces.
- [x] Run shared protocol, mutation validation, worker, preview, DnD, and Open Tabs core tests.
- [x] Commit.

### Task 2: Centralize workflow state and selection projection

**Files:**
- Create: `src/manager/core/openTabsWorkflow.ts`
- Create: `src/manager/core/openTabsWorkflow.test.ts`
- Modify: `src/manager/core/open-tabs.ts`
- Modify: `src/manager/hooks/useOpenTabsRuntime.ts`

**Interfaces:**
- Produces: `OpenTabsWorkflowState`, `OpenTabsWorkflowAction`, `reduceOpenTabsWorkflow()`, `projectOpenTabsWorkflow()`.
- Projection owns selected records and selected record IDs.

- [x] Write failing reducer tests for refresh selection pruning, window switch clearing, complete-drop clearing, invalid toggle no-op, and projection-derived drag records.
- [x] Run focused tests and verify RED.
- [x] Implement the pure reducer and projection.
- [x] Convert the hook from scattered state to reducer state plus one state ref for async ownership checks.
- [x] Run workflow, hook DOM, Open Tabs core, and Panel tests.
- [x] Commit.

### Task 3: Group workflow interface and shrink Panel surface

**Files:**
- Modify: `src/manager/hooks/useOpenTabsRuntime.ts`
- Modify: `src/manager/components/sidebar/{Sidebar,OpenTabsPanel}.tsx`
- Modify: `src/manager/components/sidebar/OpenTabsPanel.test.ts`
- Modify: `src/manager/core/open-tabs.test.ts`

**Interfaces:**
- Produces: `OpenTabsWorkflow`, `OpenTabsWorkflowModel`, `OpenTabsWorkflowCommands`.
- `OpenTabsPanelProps` contains workflow plus six shell-specific values.

- [x] Add failing render tests that mount Panel with grouped workflow and verify selection/drag/action behavior.
- [x] Run Panel tests and verify RED.
- [x] Return grouped model/commands from the hook.
- [x] Pass grouped workflow through Sidebar and consume projection in Panel.
- [x] Remove Panel-side selected record derivation.
- [x] Run Panel, Sidebar, hook DOM, Open Tabs core, and Manager DOM tests.
- [x] Commit.

### Task 4: Replace global events with direct workflow ownership

**Files:**
- Modify: `src/manager/components/shell/ManagerLayout.tsx`
- Modify: `src/manager/components/sidebar/Sidebar.tsx`
- Modify: `src/manager/hooks/useOpenTabsRuntime.ts`
- Modify: `src/manager/components/shell/ManagerLayout.test.ts`
- Modify: `src/manager/hooks/useOpenTabsRuntime.dom.test.ts`
- Modify: `src/manager/core/capture.test.ts`

**Interfaces:**
- `ManagerLayout` owns one `OpenTabsWorkflow`.
- `captureSelection()` returns `CaptureCompletion`.
- `completeDrop()` is invoked directly after successful persistence.

- [x] Add failing tests showing successful direct drop completion clears selection, failed persistence does not, and capture returns completion evidence without dispatching a window event.
- [x] Run focused tests and verify RED.
- [x] Lift `useOpenTabsRuntime()` from Sidebar to ManagerLayout.
- [x] Replace capture/drop/tab-filter window events with direct model/commands/results.
- [x] Keep source-key invalidation callback for drag-source replacement.
- [x] Run ManagerLayout, hook DOM, capture, Sidebar, DnD, and Manager DOM tests.
- [x] Commit.

### Task 5: Document, gate, and verify

**Files:**
- Modify: `docs/feature-evolution.md`
- Modify: `docs/technical-architecture.md`
- Modify: `docs/product-decisions.md`
- Modify: `docs/superpowers/specs/2026-07-26-open-tabs-workflow-design.md`
- Modify: `docs/superpowers/plans/2026-07-26-open-tabs-workflow.md`

- [ ] Add current architecture documentation and a decision implementation note.
- [ ] Add source contract tests that forbid `tabboard-open-tabs-dropped`, `tabboard-capture-completed`, and `tabboard-tab-filter-change`.
- [ ] Run `npm run check`, `npm test`, and `git diff --check`.
- [ ] Review the full diff and resolve all Critical/Important findings.
- [ ] Record fresh verification evidence and commit.
