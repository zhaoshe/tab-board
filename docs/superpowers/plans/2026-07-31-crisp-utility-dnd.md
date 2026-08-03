# TabBoard Crisp Utility DnD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the confirmed fixed-track, explicit Gap Anchor, progressive auto-scroll, and pointer/touch DnD behavior while preserving typed DropIntent execution.

**Status:** Complete. Final evidence: focused DnD matrix 168/168, full Vitest
101 files / 1436 tests, `npm run check`, and serial Chromium 26/26.

**Architecture:** Keep persistent `DropIntent` result kinds in shared model. Change only Manager-local `DragPayload`/`DropTarget` compatibility and geometry. `ManagerDndCoordinator` owns lifecycle and Board auto-scroll; `WorkspaceContent` owns fixed slot/anchor rendering; `ManagerDragOverlay` owns immutable source geometry.

**Tech Stack:** React 18, TypeScript, `@dnd-kit/core`, `@dnd-kit/sortable`, Vitest, Playwright.

## Global Constraints

- Manager interaction plan is complete.
- Session columns are fixed at 340px desktop with 16px gaps and full Board height.
- Do not restore Session-card-to-Session-card merge.
- Saved Tabs may explicitly merge into Existing Sessions.
- New Session creation requires explicit `new-session-insert`.
- Fine-pointer plus hit box is exactly 20x20px.
- All Source Tabs suppresses New Session anchors but permits Existing merge.
- Pointer/touch DnD has no resting drag icon.
- Hybrid Commands own keyboard equivalence; do not preserve a hidden KeyboardSensor activator.
- Remove the legacy Manager-local `new-group` target when `new-session-insert` is introduced; the two target kinds must not coexist.
- Final DnD E2E runs serially.
- Do not commit unless explicitly requested.

---

### Task 1: Add Explicit `new-session-insert` Target

**Files:**
- Modify: `src/manager/core/dnd.ts`
- Modify: `src/manager/core/dnd.test.ts`
- Modify: `src/manager/components/shell/managerDndGeometry.ts`
- Modify: `src/manager/components/shell/ManagerLayout.test.ts`
- Modify: `src/shared/model/drop-intent.test.ts`

**Interfaces:**
- Produces:

```ts
type DropTarget =
  | ExistingDropTarget
  | {
      kind: 'new-session-insert';
      category: CategoryFilter;
      index: number;
      workspaceId: string;
    };
```

- Compatibility:
  - `group` -> `group-insert | category-column`.
  - `tab | tabs | open-tabs` -> `group-body | tab-before | new-session-insert`.
  - `category` -> `category-reorder`.

- [ ] **Step 1: Write failing compatibility tests**

Replace old acceptance expectations:

```ts
expect(resolveDrop({
  payload: payload('tabs'),
  target: target('group-insert'),
  state,
})).toBeNull();

expect(resolveDrop({
  payload: payload('tabs'),
  target: target('category-column'),
  state,
})).toBeNull();

expect(resolveDrop({
  payload: payload('tabs'),
  target: target('new-session-insert'),
  state,
})?.kind).toBe('create-session');
```

Repeat for `open-tabs`. Assert Session groups still resolve `group-insert` to `move-session`.

- [ ] **Step 2: Run focused RED**

```sh
npx vitest run src/manager/core/dnd.test.ts src/manager/components/shell/ManagerLayout.test.ts
```

Expected: FAIL because the target kind does not exist and implicit create remains.

- [ ] **Step 3: Implement target compatibility and resolver**

Remove the legacy `new-group` target and tabs/open-tabs handling for `group-insert` and `category-column`. Add `new-session-insert` handling to Saved/Open resolvers. Update `markerForTarget`; do not add persistent wire fields.

- [ ] **Step 4: Run focused GREEN**

Run Step 2. Expected: PASS.

### Task 2: Fixed Session Track And Gap Anchor Geometry

**Files:**
- Create: `src/manager/components/workspace/NewSessionGapTarget.tsx`
- Create: `src/manager/components/workspace/NewSessionGapTarget.test.ts`
- Modify: `src/manager/components/shell/ManagerLayout.tsx`
- Modify: `src/manager/components/workspace/WorkspaceContent.tsx`
- Modify: `src/manager/components/workspace/WorkspaceContent.test.ts`
- Modify: `src/manager/styles/shell.css`
- Modify: `src/manager/styles/responsive.css`
- Modify: `src/manager/core/layout.test.ts`
- Modify: `src/manager/core/session-rendering.test.ts`

**Interfaces:**
- Produces:

```ts
NewSessionGapTarget({
  category,
  index,
  workspaceId,
  enabled,
  active,
});
```

- `ManagerLayout` passes the active `DragPayload` into `WorkspaceContent`.
- Task 2 renders anchors for `tab | tabs | open-tabs` payloads only. Task 5
  adds the All Source Tabs suppression rule.

- Geometry:
  - Desktop column: 340px.
  - Gap: 16px.
  - Plus: 20x20px at gap center and slot 50% y.
  - Anchors: start, every-between, end.

- [ ] **Step 1: Write failing source/render tests**

Assert:

```ts
expect(cssBlock('.session-board')).toContain('grid-auto-columns: 340px');
expect(cssBlock('.session-board')).toContain('gap: 16px');
expect(cssBlock('.new-session-gap-target')).toContain('width: 20px');
expect(cssBlock('.new-session-gap-target')).toContain('height: 20px');
```

Render three Sessions and assert four `new-session-insert` targets with indices 0, 1, 2, 3.

- [ ] **Step 2: Run focused RED**

```sh
npx vitest run src/manager/components/workspace/WorkspaceContent.test.ts src/manager/core/layout.test.ts src/manager/core/session-rendering.test.ts
```

Expected: FAIL because insertion targets are full-height and columns are minmax.

- [ ] **Step 3: Implement fixed track**

Replace `minmax(320px, 360px)` with 340px desktop and responsive `min(340px, available)`. Preserve `SessionSlot` full height, activation, content visibility, and horizontal Board overflow.

- [ ] **Step 4: Implement fine-pointer anchors**

Render anchors only while a Saved/Open tab payload is active. Keep
`aria-hidden`; target semantics remain in dnd-kit data. Keep Session reorder
insertion geometry separate. All Source Tabs suppression is intentionally
added in Task 5 after the pure predicate exists.

- [ ] **Step 5: Run focused GREEN**

Run Step 2. Expected: PASS.

### Task 3: Empty Category First-slot Target

**Files:**
- Modify: `src/manager/components/workspace/WorkspaceContent.tsx`
- Modify: `src/manager/components/workspace/WorkspaceContent.test.ts`
- Modify: `src/manager/styles/shell.css`
- Modify: `src/manager/core/session-rendering.test.ts`
- Modify: `tests/e2e/dnd-acceptance.e2e.ts`

**Interfaces:**
- Empty Category target:

```ts
{
  kind: 'new-session-insert',
  category,
  index: 0,
  workspaceId,
}
```

- Entire first 340px full-height slot owns hit testing.
- The full-slot target is rendered only when the canonical Category is empty
  and no saved-search filter is active. A filtered-empty Category keeps its
  search empty state and does not masquerade as a canonical empty Category.

- [ ] **Step 1: Write failing empty-state tests**

Assert empty Board renders one full-slot target, centered plus affordance, and `No sessions here yet`. During target active state, assert full-slot class and `Release to create session`.

- [ ] **Step 2: Run focused RED**

```sh
npx vitest run src/manager/components/workspace/WorkspaceContent.test.ts src/manager/core/session-rendering.test.ts
```

Expected: FAIL because the empty target is an end-strip target.

- [ ] **Step 3: Implement full-slot empty target**

Keep ghost above plus. Highlight the full outline. Do not render a second plus tooltip. On commit, preserve index 0 so the Session expands in place.

- [ ] **Step 4: Run focused GREEN and E2E**

```sh
npx vitest run src/manager/components/workspace/WorkspaceContent.test.ts src/manager/core/session-rendering.test.ts
npx playwright test tests/e2e/dnd-acceptance.e2e.ts --workers=1
```

Expected: PASS.

### Task 4: Preserve Immutable Drag Ghost Geometry

**Files:**
- Modify: `src/manager/core/dnd.ts`
- Modify: `src/manager/core/dnd.test.ts`
- Modify: `src/manager/components/shell/ManagerDndCoordinator.tsx`
- Modify: `src/manager/components/shell/ManagerDragOverlay.tsx`
- Modify: `src/manager/components/shell/ManagerLayout.test.ts`
- Modify: `src/manager/styles/overlays.css`
- Modify: `src/manager/styles/session.css`
- Modify: `src/manager/core/overlays.test.ts`
- Modify: `tests/e2e/session-dnd.e2e.ts`

**Interfaces:**
- Consumes `DragUiState.sourceRect`.
- Produces:

```ts
interface DragPreviewItem {
  id: string;
  title: string;
  domain?: string;
  itemType: 'link' | 'note';
}

interface DragUiState {
  // existing fields
  previewItems: readonly DragPreviewItem[];
}
```

- `ManagerDndCoordinator` snapshots Saved refs from canonical state and Open
  records from active DnD data exactly once at drag start.
- `clearDragState()` clears `previewItems`; target changes never recompute the
  snapshot.
- Produces one Saved/Open multi-tab ghost template that does not change by
  target kind. Preview items are Manager-local UI state and never enter
  `DropIntent` or persistence.

- [ ] **Step 1: Write failing ghost tests**

Assert multi-tab ghost renders each selected row, retains source width/height at Pickup and Plus Active, has translucent surfaces, and uses `pointer-events: none`.

- [ ] **Step 2: Run focused RED**

```sh
npx vitest run src/manager/components/shell/ManagerLayout.test.ts src/manager/core/overlays.test.ts src/manager/core/session-rendering.test.ts
```

Expected: FAIL because the current overlay shows one row plus a count/silhouettes.

- [ ] **Step 3: Implement immutable ghost**

Snapshot selected records at drag start. Keep real title/domain rows. Ghost
sits above plus globally; release tip sits above ghost. Do not let ghost
participate in collision detection.

- [ ] **Step 4: Run focused GREEN and pointer smoke**

```sh
npx vitest run src/manager/components/shell/ManagerLayout.test.ts src/manager/core/overlays.test.ts
npx playwright test tests/e2e/session-dnd.e2e.ts --workers=1
```

Expected: PASS.

### Task 5: Plus Activation, Release, And All-source Suppression

**Files:**
- Modify: `src/manager/components/workspace/NewSessionGapTarget.tsx`
- Modify: `src/manager/components/workspace/NewSessionGapTarget.test.ts`
- Modify: `src/manager/components/shell/ManagerDndCoordinator.tsx`
- Modify: `src/manager/components/shell/managerDndGeometry.ts`
- Modify: `src/manager/components/shell/ManagerLayout.test.ts`
- Modify: `src/manager/core/dnd.ts`
- Modify: `src/manager/core/dnd.test.ts`
- Modify: `src/manager/components/shell/SessionTargetPicker.tsx`
- Modify: `src/manager/components/shell/SessionTargetPicker.test.ts`
- Modify: `src/manager/components/workspace/WorkspaceContent.tsx`
- Modify: `src/manager/components/workspace/WorkspaceContent.test.ts`
- Modify: `src/manager/styles/shell.css`
- Modify: `tests/e2e/dnd-acceptance.e2e.ts`

**Interfaces:**
- Produces:

```ts
function isAllSourceTabs(
  payload: Extract<DragPayload, { kind: 'tabs' }>,
  groups: readonly Group[],
): boolean;
```

- `SessionTargetPicker` reuses this predicate for New Session keyboard choices;
  do not retain a second private All Source implementation.
- Plus active does not insert a preview Session.
- Release on active plus resolves `create-session`.

- [ ] **Step 1: Write failing all-source tests**

Cover one source/all refs, one source/partial refs, multiple sources, and Open Tabs. Assert only one-source/all-tabs suppresses anchors.

- [ ] **Step 2: Write failing plus lifecycle tests**

Assert pointer enter activates filled plus and live message, no Session slot is inserted, pointer leave clears immediately, and drag end over active plus commits.

- [ ] **Step 3: Run focused RED**

```sh
npx vitest run src/manager/core/dnd.test.ts src/manager/components/workspace/NewSessionGapTarget.test.ts src/manager/components/shell/ManagerLayout.test.ts
```

Expected: FAIL because suppression/lifecycle do not exist.

- [ ] **Step 4: Implement exact non-sticky plus**

Do not pass `new-session-insert` through `lockDropTarget`. In collision
selection, a real pointer-inside plus candidate wins only while the pointer is
inside its 20x20 rect; otherwise ordinary Existing/Session targets continue
through the 12px hysteresis path. `getDragEndTarget()` must never prefer an old
locked target over an active exact plus. On active, announce `Release to create
session`; pointer tip appears after 300ms. Leave clears active target
immediately. Commit only on drag end while still over plus.

- [ ] **Step 5: Run focused GREEN and E2E**

```sh
npx vitest run src/manager/core/dnd.test.ts src/manager/components/workspace/NewSessionGapTarget.test.ts src/manager/components/shell/ManagerLayout.test.ts
npx playwright test tests/e2e/dnd-acceptance.e2e.ts --workers=1
```

Expected: PASS.

### Task 6: Board-owned Progressive Auto-scroll

**Files:**
- Create: `src/manager/core/dndAutoScroll.ts`
- Create: `src/manager/core/dndAutoScroll.test.ts`
- Create: `src/manager/hooks/useBoardDragAutoScroll.ts`
- Create: `src/manager/hooks/useBoardDragAutoScroll.test.ts`
- Modify: `src/manager/components/shell/ManagerDndCoordinator.tsx`
- Modify: `src/manager/components/shell/ManagerLayout.tsx`
- Modify: `src/manager/components/workspace/WorkspaceContent.tsx`
- Modify: `src/manager/components/shell/ManagerLayout.test.ts`
- Modify: `tests/e2e/dnd-acceptance.e2e.ts`

**Interfaces:**
- Produces:

```ts
function getHorizontalAutoScroll(input: {
  pointerX: number;
  viewportLeft: number;
  viewportRight: number;
  zoneWidth?: 48;
  minSpeed?: 3;
  maxSpeed?: 12;
}): { direction: -1 | 0 | 1; speed: number; depth: number };
```

- Produces `useBoardDragAutoScroll({ boardRef, active, pointer, pause })`.
- Extends `ManagerDndState` with `registerBoardElement(element)`; ManagerLayout
  passes it to `WorkspaceContent`, which continues to own the Board DOM ref.
- `ManagerDndCoordinator` captures the activator pointer at drag start and
  updates viewport coordinates from `onDragMove` delta for pointer and touch.

- [ ] **Step 1: Write failing speed tests**

Assert center is 0, 32px from right edge is 6, 8px is 10.5, outside/scroll-boundary is 0, and left mirrors right.

- [ ] **Step 2: Run focused RED**

```sh
npx vitest run src/manager/core/dndAutoScroll.test.ts src/manager/hooks/useBoardDragAutoScroll.test.ts
```

Expected: FAIL because the owner does not exist.

- [ ] **Step 3: Implement requestAnimationFrame scroll owner**

Scroll only `.manager-board`. Clamp to scroll bounds. Keep pointer/ghost
viewport coordinates stable. Configure dnd-kit droppable measurement for the
active scroll lifecycle so collision rects are refreshed after Board scroll.
Pause when exact plus is active; resume immediately on leave.

- [ ] **Step 4: Disable dnd-kit default auto-scroll**

Set `autoScroll={false}` on `DndContext` so one owner controls behavior.

- [ ] **Step 5: Run focused GREEN and E2E**

```sh
npx vitest run src/manager/core/dndAutoScroll.test.ts src/manager/hooks/useBoardDragAutoScroll.test.ts src/manager/components/shell/ManagerLayout.test.ts
npx playwright test tests/e2e/dnd-acceptance.e2e.ts --workers=1
```

Expected: PASS.

### Task 7: Add Whole-session Hybrid Commands

**Files:**
- Modify: `src/manager/components/shell/SessionTargetPicker.tsx`
- Modify: `src/manager/components/shell/SessionTargetPicker.test.ts`
- Modify: `src/manager/components/shell/ManagerLayout.tsx`
- Modify: `src/manager/components/sessions/SessionCard.tsx`
- Modify: `src/manager/core/session-rendering.test.ts`
- Modify: `src/manager/core/uiCopy.test.ts`
- Modify: `tests/e2e/session-dnd.e2e.ts`

**Interfaces:**
- Extends the picker input with:

```ts
type SessionTargetSource =
  | ExistingTabTargetSource
  | {
      kind: 'session';
      groupId: string;
    };

interface SessionTargetChoice {
  kind: 'existing-session' | 'new-session' | 'session-position';
  groupId?: string;
  category: CategoryFilter;
  index: number;
}
```

- `move-session-category` produces canonical named positions:
  - `Before <first Session> in <Category>` for index 0.
  - `After <previous Session> in <Category>` for later insertion boundaries.
  - `First in <Category>` for an empty Category.
- Commit produces the existing persistent `move-session` DropIntent.
- Choices are generated against the target Category after removing the source
  Session. The source's original insertion index is excluded as a semantic
  no-op.

- [ ] **Step 1: Write failing whole-session picker tests**

Cover same-category Before/After positions, cross-category positions, empty
Category first position, source-position no-op suppression, locked source,
keyboard preview/commit, Escape preservation, and trigger focus restoration.

- [ ] **Step 2: Run focused RED**

```sh
npx vitest run src/manager/components/shell/SessionTargetPicker.test.ts src/manager/core/session-rendering.test.ts src/manager/core/uiCopy.test.ts
```

Expected: FAIL because `move-session-category` is only a title-level type and
Session More still mutates Category directly.

- [ ] **Step 3: Implement named whole-session commands**

Replace the direct Session `Move to Category` submenu with `Move Session`.
Open the shared picker with a whole-session source. Generate every canonical
Before/After insertion point, excluding the semantic no-op. Reuse the existing
checked `applyDropIntent` path and existing `move-session` wire result.

- [ ] **Step 4: Run focused GREEN and keyboard browser smoke**

```sh
npx vitest run src/manager/components/shell/SessionTargetPicker.test.ts src/manager/core/session-rendering.test.ts src/manager/core/uiCopy.test.ts
npx playwright test tests/e2e/session-dnd.e2e.ts --workers=1
```

Expected: PASS with a keyboard-accessible whole-session reorder/move path
before drag handles are removed.

### Task 8: Remove Keyboard Drag Handles And Preserve Pointer Surfaces

**Files:**
- Modify: `src/manager/components/shell/useManagerDndSensors.ts`
- Modify: `src/manager/components/shell/managerDndGeometry.ts`
- Modify: `src/manager/components/shell/ManagerDndCoordinator.tsx`
- Modify: `src/manager/components/shell/ManagerLayout.test.ts`
- Modify: `src/manager/components/sessions/SessionCardHeader.tsx`
- Modify: `src/manager/components/sessions/SessionCardShell.tsx`
- Modify: `src/manager/components/sessions/SessionCard.tsx`
- Modify: `src/manager/components/sessions/SessionSlot.tsx`
- Modify: `src/manager/components/sessions/SessionSortableBindings.ts`
- Modify: `src/manager/components/sessions/TabItemRow.tsx`
- Modify: `src/manager/components/sidebar/OpenTabRow.tsx`
- Modify: `src/manager/components/sidebar/OpenTabsPanel.test.ts`
- Modify: `src/manager/components/workspace/CategoryNav.tsx`
- Modify: `src/manager/components/workspace/CategoryNav.test.ts`
- Modify: `src/manager/components/workspace/WorkspaceHeader.test.ts`
- Modify: `src/manager/components/workspace/CategoryManager.tsx`
- Modify: `src/manager/styles/session.css`
- Modify: `src/manager/styles/sidebar.css`
- Modify: `src/manager/styles/header.css`
- Modify: `src/shared/styles/accessibility.css`
- Modify: `src/manager/core/session-rendering.test.ts`
- Modify: `src/manager/core/accessibilityMarkup.test.ts`
- Modify: `src/manager/core/overlays.test.ts`
- Modify: `src/manager/core/uiOwnership.test.ts`
- Modify: `tests/e2e/session-dnd.e2e.ts`
- Modify: `tests/e2e/dnd-acceptance.e2e.ts`
- Modify: `tests/e2e/manager-boot.e2e.ts`
- Modify: `tests/e2e/README.md`

**Interfaces:**
- `useManagerDndSensors()` returns PointerSensor + TouchSensor only.
- Session header/non-interactive surface owns pointer listeners.
- `SessionSortableBindings` exposes pointer listeners and node refs without
  sortable keyboard attributes or an activator focus ref.
- Whole-session Hybrid Commands from Task 7 own Session keyboard results.
- Workspace/Category Manage commands and Saved/Open target pickers from the
  Manager plan own their respective keyboard results.

- [ ] **Step 1: Write failing no-handle tests**

Assert sources contain no `IconGripVertical`, `.session-card__drag-handle`, `.manager-open-tab-drag-handle`, `KeyboardSensor`, or `sortableKeyboardCoordinates`. Assert pointer listeners remain on approved non-interactive surfaces.

- [ ] **Step 2: Run focused RED**

```sh
npx vitest run src/manager/core/session-rendering.test.ts src/manager/core/accessibilityMarkup.test.ts src/manager/core/uiOwnership.test.ts src/manager/components/shell/ManagerLayout.test.ts src/manager/components/sidebar/OpenTabsPanel.test.ts src/manager/components/workspace/CategoryNav.test.ts
```

Expected: FAIL because current production depends on handle buttons.

- [ ] **Step 3: Remove handle UI and KeyboardSensor**

Remove `createManagerKeyboardCoordinates`, `getGroupKeyboardCoordinates`,
`sortableKeyboardCoordinates`, `groupKeyboardIndexRef`, and KeyboardSensor
exports/tests. Do not create visually hidden activators or spread sortable
`role/tabIndex/aria-roledescription` attributes onto the pointer surface. Keep
5px pointer activation and 200ms touch delay. Ensure buttons/inputs/links remain
excluded from drag start.

- [ ] **Step 4: Run focused GREEN and E2E**

```sh
npx vitest run src/manager/core/session-rendering.test.ts src/manager/core/accessibilityMarkup.test.ts src/manager/core/uiOwnership.test.ts src/manager/components/shell/ManagerLayout.test.ts src/manager/components/sidebar/OpenTabsPanel.test.ts src/manager/components/workspace/CategoryNav.test.ts
npx playwright test tests/e2e/session-dnd.e2e.ts tests/e2e/dnd-acceptance.e2e.ts --workers=1
```

Expected: PASS with updated command-based keyboard assertions.

### Task 9: DnD Acceptance Matrix

**Files:**
- Modify: `tests/e2e/dnd-acceptance.e2e.ts`
- Modify: `tests/e2e/session-dnd.e2e.ts`
- Modify: `docs/feature-spec.md`
- Modify: `docs/technical-architecture.md`
- Modify: `docs/feature-evolution.md`
- Modify: `docs/product-decisions.md`

**Interfaces:** None. This task closes the DnD plan.

- [ ] **Step 1: Add browser scenarios**

Cover:

- Workspace row reorder.
- Topbar and Manage Category reorder.
- Session same-category and cross-category.
- Saved Tab same Session, Existing Session, New Session, All Source Tabs suppression.
- Open Tabs Existing/New Session copy.
- Empty Category full first-slot target.
- Start/between/end anchors.
- Plus enter/leave/release.
- Progressive left/right auto-scroll and plus pause.
- Escape cancel and source replacement invalidation.
- Reduced motion.

- [ ] **Step 2: Run focused unit matrix**

```sh
npx vitest run src/manager/core/dnd.test.ts src/manager/core/dndAutoScroll.test.ts src/manager/components/shell/ManagerLayout.test.ts src/manager/components/workspace/WorkspaceContent.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run serial E2E**

```sh
npx playwright test tests/e2e/session-dnd.e2e.ts tests/e2e/dnd-acceptance.e2e.ts --workers=1
```

Expected: PASS.

- [ ] **Step 4: Update DnD docs**

Document exact target compatibility, fixed track, Gap Anchor, Empty Category exception, auto-scroll, Hybrid Commands, and the manual Chrome checklist.

