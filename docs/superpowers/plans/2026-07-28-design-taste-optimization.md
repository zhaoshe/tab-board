# TabBoard Design Taste Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement every finding in `docs/reviews/2026-07-28-design-taste-review.md`, then repeat rendered taste review and optimization until one full review pass produces no new recommendation.

**Architecture:** Keep the current React/Mantine owners and persistent contracts. Page-local navigation preference stays outside canonical state; Options save status moves into its external store; category reordering becomes an explicit UI mode while category-column drop targets remain mounted; visual refinements reuse the existing theme and introduce only one shared favicon primitive.

**Tech Stack:** React 18, TypeScript, Mantine v7, Zustand, `@dnd-kit`, Tabler icons, Vitest/happy-dom, Playwright, agent-browser.

## Global Constraints

- Do not add a runtime dependency.
- Do not change the persistent schema, mutation wire, DropIntent semantics, or file-storage protocol.
- Do not restore session-to-session merge.
- Keep the horizontal session board, stable session slots, insertion geometry, and near-viewport activation.
- Keep ordinary category-column droppables mounted so sessions can move across categories outside reorder mode.
- Keep Manager, Popup, and Options as compact productivity surfaces; do not introduce landing-page composition.
- Use TDD for every behavior or refactor: watch the focused test fail for the intended reason before editing production code.
- Preserve light/dark parity, reduced motion, keyboard access, touch targets, and current performance gates.

---

### Task 1: Authoritative Options Save Status

**Files:**
- Modify: `src/options/hooks/useOptionsSettings.ts`
- Modify: `src/options/hooks/useOptionsSettings.test.ts`
- Modify: `src/options/OptionsApp.tsx`
- Modify: `src/options/OptionsApp.dom.test.ts`
- Modify: `src/options/hooks/useSettingsDraft.ts`

**Interfaces:**
- Produces: `OptionsSaveStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'error'`.
- Produces: `useOptionsSettings().saveStatus`, `useOptionsSettings().retryLastFailedMutation()`.
- Changes: `updateSettings(updates)` remains callable without awaiting; queue state is observable through the external-store snapshot.

- [x] **Step 1: Write failing external-store tests**

Add tests that suspend `chrome.runtime.sendMessage`, call `updateSettings`, and assert:

```ts
expect(latest?.saveStatus).toBe('saving');
resolveMutation({ ok: true, result: authoritative });
await vi.waitFor(() => expect(latest?.saveStatus).toBe('saved'));
```

Add a rejection test that asserts `saveStatus === 'error'`, the optimistic value rolls back, and retry resends the exact failed update.

- [x] **Step 2: Run focused RED**

Run:

```sh
npx vitest run src/options/hooks/useOptionsSettings.test.ts src/options/OptionsApp.dom.test.ts
```

Expected: FAIL because `saveStatus` and retry do not exist, and Options still derives status from local `savePending`.

- [x] **Step 3: Implement one queue-owned status**

Extend `OptionsSettingsSnapshot` with status and last failed updates. Increment pending state before enqueuing, publish `saved` only after authoritative resolution, publish `error` on rejection, and retry from the stored updates. Remove local `savePending` from `OptionsApp`; `useSettingsDraft` owns only debounce and flush.

- [x] **Step 4: Run focused GREEN**

Run the focused command from Step 2. Expected: PASS.

### Task 2: Restore Strategy Form

**Files:**
- Create: `src/options/components/RestoreSettingsSection.tsx`
- Create: `src/options/components/RestoreSettingsSection.test.ts`
- Modify: `src/options/OptionsApp.tsx`
- Modify: `src/options/OptionsApp.dom.test.ts`

**Interfaces:**
- Consumes: `settings.restoreGroupsInNewWindow`, `settings.restoreNextToCurrent`, `settings.focusRestoredTabs`, `settings.deleteRestoredTabs`.
- Produces: `RestoreSettingsSection({ settings, onChange })`.
- Keeps persisted booleans unchanged.

- [x] **Step 1: Write failing component tests**

Render the real component and assert:

```ts
expect(destination.value).toBe('current');
expect(placement.disabled).toBe(false);
// Select new window:
expect(onChange).toHaveBeenCalledWith({ restoreGroupsInNewWindow: true });
expect(placement.disabled).toBe(true);
```

Also assert the disabled placement has visible explanatory copy.

- [x] **Step 2: Run focused RED**

```sh
npx vitest run src/options/components/RestoreSettingsSection.test.ts src/options/OptionsApp.dom.test.ts
```

Expected: FAIL because the component does not exist and the old independent switches remain.

- [x] **Step 3: Implement the strategy owner**

Use labelled Mantine `Radio.Group` or `SegmentedControl` for destination and placement. Disable placement for New window while preserving the stored `restoreNextToCurrent` value so switching back restores the preference. Keep delete-after-restore and focus as independent switches.

- [x] **Step 4: Run focused GREEN**

Run the focused command from Step 2. Expected: PASS.

### Task 3: Bare-URL Manager Category Preference

**Files:**
- Create: `src/manager/core/managerNavigationPreference.ts`
- Create: `src/manager/core/managerNavigationPreference.test.ts`
- Modify: `src/manager/core/managerPageState.ts`
- Modify: `src/manager/core/managerPageState.test.ts`
- Modify: `src/manager/hooks/useManagerPageState.ts`
- Modify: `src/manager/hooks/useManagerPageState.test.ts`
- Modify: `src/manager/components/shell/ManagerLayout.tsx`

**Interfaces:**
- Produces: `MANAGER_CATEGORY_PREFERENCE_KEY`.
- Produces: `chooseInitialCategory(state, workspaceId, storedCategory): CategoryFilter`.
- Produces: `readCategoryPreference(workspaceId)` and `writeCategoryPreference(workspaceId, category)` using versioned page-local storage.
- Changes: `useManagerPageState(validationState)` receives the groups/category-order data needed for bare-URL selection.

- [x] **Step 1: Write failing pure and hook tests**

Cover literal cases:

```ts
expect(chooseInitialCategory(stateWithSavedOnly, 'workspace-a', null)).toBe('saved');
expect(chooseInitialCategory(stateWithSavedOnly, 'workspace-a', 'archive')).toBe('archive');
expect(chooseInitialCategory(emptyState, 'workspace-a', null)).toBe('inbox');
```

Hook tests must prove an explicit `?category=inbox` is respected even when empty, a bare URL restores a valid per-workspace preference, and invalid stored values fall back to the first non-empty category.

- [x] **Step 2: Run focused RED**

```sh
npx vitest run src/manager/core/managerNavigationPreference.test.ts src/manager/core/managerPageState.test.ts src/manager/hooks/useManagerPageState.test.ts
```

Expected: FAIL because the preference owner does not exist and a bare URL always becomes Inbox.

- [x] **Step 3: Implement page-local selection**

Detect whether managed URL parameters are absent before parsing defaults. Use `categoryOrder()` plus one workspace group pass to choose the first non-empty category. Store only `{ version: 1, byWorkspace: Record<string, CategoryFilter> }` in localStorage. Explicit URL intent always wins.

- [x] **Step 4: Run focused GREEN**

Run the focused command from Step 2. Expected: PASS.

### Task 4: Visible Workspace Context

**Files:**
- Modify: `src/manager/components/workspace/WorkspaceMenu.tsx`
- Modify: `src/manager/components/workspace/WorkspaceHeader.test.ts`
- Modify: `src/manager/styles/header.css`
- Modify: `src/manager/styles/responsive.css`
- Modify: `tests/e2e/manager-boot.e2e.ts`

**Interfaces:**
- Keeps: existing `WorkspaceMenuProps`.
- Produces: visible `.manager-workspace-trigger__label` on desktop and icon-only compact state.

- [x] **Step 1: Write failing DOM/layout assertions**

Assert the trigger contains the current workspace text and that 760px compact CSS hides only the visual label while preserving the accessible name.

- [x] **Step 2: Run focused RED**

```sh
npx vitest run src/manager/components/workspace/WorkspaceHeader.test.ts src/manager/core/layout.test.ts
```

Expected: FAIL because the trigger has no visible workspace label.

- [x] **Step 3: Implement stable context width**

Add a truncated text span, use a bounded width such as `clamp(112px, 14vw, 184px)`, and revert to 48/44px icon-only geometry below the compact breakpoint.

- [x] **Step 4: Run focused GREEN**

Run the focused command from Step 2. Expected: PASS.

### Task 5: Explicit Category Reorder Mode

**Files:**
- Create: `src/manager/components/workspace/CategoryReorderMode.tsx`
- Modify: `src/manager/components/workspace/CategoryNav.tsx`
- Modify: `src/manager/components/workspace/CategoryManager.tsx`
- Modify: `src/manager/components/workspace/WorkspaceHeader.tsx`
- Modify: `src/manager/components/workspace/WorkspaceHeader.test.ts`
- Modify: `src/manager/styles/header.css`
- Modify: `tests/e2e/session-dnd.e2e.ts`
- Modify: `tests/e2e/dnd-acceptance.e2e.ts`

**Interfaces:**
- Produces: `CategoryNav({ ..., reorderMode })`.
- Produces: `CategoryManager({ ..., reorderMode, onReorderModeChange })`.
- Keeps: `category-column-${id}` droppable in both modes.
- Moves: category `useDraggable`, activator, and before/after reorder targets to `CategoryReorderMode`.

- [x] **Step 1: Write failing normal/reorder-mode tests**

Assert normal mode has one focusable label per category and no reorder buttons, while reorder mode exposes `Reorder <label>` controls. Assert source contracts keep `useDroppable({ id: category-column... })` outside the mode branch.

- [x] **Step 2: Run focused RED**

```sh
npx vitest run src/manager/components/workspace/WorkspaceHeader.test.ts src/manager/core/dnd.test.ts
```

Expected: FAIL because reorder controls are always mounted.

- [x] **Step 3: Implement mode ownership**

Add `Reorder Categories` to Category Options and a visible Done control while active. Normal mode renders category-column droppable wrappers plus label buttons. Reorder mode renders the same wrappers, typed category draggable activators, and before/after targets.

- [x] **Step 4: Run focused GREEN and DnD regression**

```sh
npx vitest run src/manager/components/workspace/WorkspaceHeader.test.ts src/manager/core/dnd.test.ts
npx playwright test tests/e2e/session-dnd.e2e.ts tests/e2e/dnd-acceptance.e2e.ts
```

Expected: PASS, including cross-category session movement in normal mode and category keyboard/pointer reorder in reorder mode.

### Task 6: Shared Favicon Primitive

**Files:**
- Create: `src/shared/components/Favicon.tsx`
- Create: `src/shared/components/Favicon.test.ts`
- Modify: `src/manager/components/sidebar/OpenTabRow.tsx`
- Modify: `src/manager/components/sessions/TabItemRow.tsx`
- Modify: `src/manager/hooks/useManagerOverlays.ts`
- Modify: `src/manager/styles/sidebar.css`
- Modify: `src/manager/styles/session.css`
- Modify: `src/manager/core/session-rendering.test.ts`
- Modify: `src/manager/components/sidebar/OpenTabsPanel.test.ts`

**Interfaces:**
- Produces: `Favicon({ src, size, className, fallback, loading = 'lazy' })`.
- Guarantees: explicit width/height, decorative alt, fixed box, fallback after error, no layout shift.

- [x] **Step 1: Write failing primitive and consumer tests**

Assert the real primitive renders a fixed-size image, switches to fallback after `error`, and saved link rows use the stored URL while notes retain `IconFileText`.

- [x] **Step 2: Run focused RED**

```sh
npx vitest run src/shared/components/Favicon.test.ts src/manager/core/session-rendering.test.ts src/manager/components/sidebar/OpenTabsPanel.test.ts
```

Expected: FAIL because the primitive does not exist and saved rows still use `IconLink`.

- [x] **Step 3: Implement and replace duplicate favicon owners**

Use local component state only for image failure. Reuse it in Open Tabs, saved rows, and info overlays. Do not add favicon work to inactive session shells.

- [x] **Step 4: Run focused GREEN**

Run the focused command from Step 2. Expected: PASS.

### Task 7: Options and Popup Visual Hierarchy

**Files:**
- Modify: `src/options/components/AdvancedSettingsContent.tsx`
- Modify: `src/options/components/DataStorageCard.tsx`
- Modify: `src/options/OptionsApp.dom.test.ts`
- Modify: `src/options/options.css`
- Modify: `src/popup/PopupApp.tsx`
- Modify: `src/popup/PopupApp.dom.test.ts`
- Modify: `src/popup/popup.css`

**Interfaces:**
- Keeps: Advanced lazy chunk and disclosure URL state.
- Produces: ordinary Advanced sections through `SettingsSection`; Data Storage remains the single framed tool.
- Produces: Popup header uses `/icons/icon-32.png`.
- Produces: `.popup-app__duplicate-row` with secondary Remove action.

- [x] **Step 1: Write failing hierarchy tests**

Assert Advanced contains no nested ordinary Mantine Cards beyond Data Storage, separate `Keyboard Shortcuts` and `Recovery` headings, Popup brand image dimensions, and a secondary duplicate row whose button text is `Remove`.

- [x] **Step 2: Run focused RED**

```sh
npx vitest run src/options/OptionsApp.dom.test.ts src/popup/PopupApp.dom.test.ts
```

Expected: FAIL against current card stack, Chrome icon, and Dedupe metric/action grid.

- [x] **Step 3: Implement visual hierarchy**

Reuse `SettingsSection`, keep Data Storage framed without decorative shadow, replace Chrome icon with extension image, and render duplicate cleanup as one compact warning row below the divider. Preserve confirmation behavior and focus return.

- [x] **Step 4: Run focused GREEN**

Run the focused command from Step 2. Expected: PASS.

### Task 8: Quieter Session Material

**Files:**
- Modify: `src/manager/styles/session.css`
- Modify: `src/manager/core/session-rendering.test.ts`
- Modify: `tests/e2e/manager-boot.e2e.ts`

**Interfaces:**
- Keeps all dimensions, overflow ownership, DnD markers, and card radius.
- Changes only resting/interaction border and shadow styling.

- [x] **Step 1: Write failing style contract**

Assert `.session-card` has no resting `box-shadow`, while `:hover`, `:focus-within`, `[data-highlighted]`, and drag placeholder states have visible semantic borders.

- [x] **Step 2: Run focused RED**

```sh
npx vitest run src/manager/core/session-rendering.test.ts
```

Expected: FAIL because resting cards still use `var(--mantine-shadow-sm)`.

- [x] **Step 3: Implement material cleanup**

Remove resting shadow and use semantic color-mix borders/background only on interaction states. Do not change card geometry.

- [x] **Step 4: Run focused GREEN**

Run the focused command from Step 2. Expected: PASS.

### Task 9: Product Documentation

**Files:**
- Modify: `docs/feature-spec.md`
- Modify: `docs/technical-architecture.md`
- Modify: `docs/feature-evolution.md`
- Modify: `docs/product-decisions.md`
- Modify: `docs/reviews/2026-07-28-design-taste-review.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

- [x] **Step 1: Update current behavior**

Document bare-entry category selection, authoritative Options status, Restore strategy dependency, visible workspace, category reorder mode, favicon behavior, Advanced section hierarchy, Popup brand/maintenance hierarchy, and session material.

- [x] **Step 2: Record tradeoffs**

Add one concise product decision covering last-category/first-nonempty bare entry and explicit category reorder mode without changing persistent state or cross-category drop targets.

- [x] **Step 3: Check docs**

```sh
git diff --check
rg -n 'TODO|TBD|PLACEHOLDER|待定|待确认' docs task_plan.md findings.md progress.md
```

Expected: no whitespace errors or unresolved placeholders.

### Task 10: Iterative Taste Review and Completion Audit

**Files:**
- Modify when needed: affected UI/test/doc owners from Tasks 1-9
- Modify: `docs/reviews/2026-07-28-design-taste-review.md`
- Modify: `findings.md`
- Modify: `progress.md`
- Modify: `task_plan.md`

- [x] **Step 1: Run complete correctness gates**

```sh
npm run check
npm test
npm run test:e2e
git diff --check
```

- [x] **Step 2: Run production startup and DnD gates**

```sh
npm run benchmark:startup -- --scenario large --runs 5
npx playwright test tests/e2e/dnd-acceptance.e2e.ts
```

Confirm stable slots, bounded full cards/rows, one Open Tabs startup request, and all five persisted-state DnD paths.

- [x] **Step 3: Run rendered browser matrix**

Review Manager default/populated/compact/dark/reduced-motion/reorder/menu/dialog states, Popup default/duplicates/dialog/light/dark, and Options Basic/Advanced/strategy/save-error/light/dark at 390, 800, 1280, and 1440px. Run axe on every representative open state and inspect geometry/overflow with rendered bounds.

- [x] **Step 4: Reapply taste review**

Re-read `design-taste-frontend`, compare the live result against design read `3 / 2 / 8`, and record every new evidence-backed recommendation. Do not count landing-page rules or subjective alternatives that conflict with the product domain.

- [x] **Step 5: Optimize any new finding with TDD**

For each new finding, add a focused RED test, implement the narrow owner-local fix, rerun focused and broad gates, then repeat Steps 3-4.

- [x] **Step 6: Stop only after a zero-new-finding pass**

The loop ends only when one complete static + rendered taste review produces no new P0/P1/P2 recommendation, all gates are fresh and green, and the prompt-to-artifact checklist maps every requested finding, implementation stage, test, browser state, performance gate, and document to concrete evidence.
