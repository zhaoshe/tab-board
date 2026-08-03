# TabBoard Crisp Utility Manager Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the confirmed Manager information architecture, menus, row actions, Workspace/Category management, selection toolbars, and Hybrid target pickers without changing DnD collision geometry.

**Architecture:** Keep `ManagerLayout` as composition owner, `WorkspaceHeader` as context/navigation owner, `SessionCard` as Session-local command owner, and Open Tabs workflow as one reducer-driven owner. Build named target pickers over existing typed store commands; DnD pointer geometry remains owned by the separate DnD plan.

**Tech Stack:** React 18, TypeScript, Mantine v7, Zustand, shared Lucide primitive, Vitest/happy-dom, Playwright, agent-browser.

## Global Constraints

- Foundation plan is complete.
- Use B2 menus: 29px fine-pointer rows, 16px icons, 44px coarse-pointer rows.
- No resting drag icon or hidden drag-handle focus stop.
- Open Tab has no application menu.
- Saved Tab menu is keyboard/context accessible and contains Note, Copy, Delete only.
- One active selection scope across Manager.
- `selectionMode` is not derived from selection count.
- Do not change DnD `DropTarget` or collision code in this plan.
- Do not commit unless explicitly requested.

---

### Task 1: Implement B2 Menu Policy And Global Command Ownership

**Files:**
- Modify: `src/manager/components/workspace/managerMenuPolicy.ts`
- Modify: `src/manager/components/workspace/ManagerGlobalActions.tsx`
- Modify: `src/manager/components/workspace/ManagerGlobalActions.test.ts`
- Modify: `src/manager/hooks/useManagerOverlays.ts`
- Modify: `src/manager/hooks/useManagerOverlays.dom.test.ts`
- Modify: `src/manager/styles/overlays.css`
- Modify: `src/manager/styles/header.css`
- Modify: `src/manager/core/overlays.test.ts`
- Modify: `src/manager/core/layout.test.ts`

**Interfaces:**
- Produces `MANAGER_DENSE_MENU_PROPS`.
- Produces `ManagerMenuItem({ icon, label, description, danger, ... })`.
- Keeps Global More content: Import, Export, Options. Bin remains direct.

- [ ] **Step 1: Write failing B2 policy tests**

Assert:

```ts
expect(MANAGER_DENSE_MENU_PROPS).toMatchObject({
  width: 190,
});
expect(menuCss).toContain('min-height: 29px');
expect(menuCss).toContain('@media (hover: none), (pointer: coarse)');
expect(menuCss).toContain('min-height: 44px');
```

Assert desktop and compact both use one More command model containing Import, Export, Options and excluding Bin.

- [ ] **Step 2: Run focused RED**

```sh
npx vitest run src/manager/components/workspace/ManagerGlobalActions.test.ts src/manager/hooks/useManagerOverlays.dom.test.ts src/manager/core/overlays.test.ts src/manager/core/layout.test.ts
```

Expected: FAIL on old desktop direct actions and menu geometry.

- [ ] **Step 3: Implement unified dense menus**

Render 16px Lucide leading icons. Show item descriptions after 550ms pointer dwell using a pointer-transparent tooltip and immediately on keyboard focus. Keep danger final/separated. Remove desktop Import/Export/Options direct actions.

- [ ] **Step 4: Run focused GREEN**

Run Step 2. Expected: PASS.

### Task 2: Replace Open/Saved Row Actions And Read-only Tooltip

**Files:**
- Modify: `src/manager/components/sidebar/OpenTabRow.tsx`
- Modify: `src/manager/components/sidebar/OpenTabsPanel.test.ts`
- Modify: `src/manager/components/sessions/TabItemRow.tsx`
- Modify: `src/manager/components/sessions/SessionTabList.tsx`
- Modify: `src/manager/hooks/useManagerOverlays.ts`
- Modify: `src/manager/hooks/useManagerOverlays.dom.test.ts`
- Modify: `src/manager/styles/sidebar.css`
- Modify: `src/manager/styles/session.css`
- Modify: `src/manager/styles/overlays.css`
- Modify: `src/manager/core/session-rendering.test.ts`
- Modify: `src/manager/core/accessibilityMarkup.test.ts`

**Interfaces:**
- Open row produces: checkbox-over-favicon, title Focus action, trailing Close X.
- Saved row produces: checkbox-over-favicon, title action, trailing Delete X, `Saved Tab Actions` context menu.
- Tooltip model:

```ts
interface TabHoverTooltipModel {
  title: string;
  domain: string;
  link: string;
  savedAt?: string;
}
```

- [ ] **Step 1: Write failing row-contract tests**

Assert Open Tab source has no `IconDots`, menu trigger, Pin, or filter action. Assert Saved Tab context menu labels are Add/Edit Note, Copy URL/Text, Delete only. Assert checkbox and favicon share one 20px leading slot and 16px visual box.

Assert Tooltip has:

```ts
expect(model.titleLines).toBe(2);
expect(model.linkLines).toBe(4);
expect(model.pointerEvents).toBe('none');
```

- [ ] **Step 2: Run focused RED**

```sh
npx vitest run src/manager/components/sidebar/OpenTabsPanel.test.ts src/manager/hooks/useManagerOverlays.dom.test.ts src/manager/core/session-rendering.test.ts src/manager/core/accessibilityMarkup.test.ts
```

Expected: FAIL because More/actions remain in interactive previews.

- [ ] **Step 3: Implement row composition**

Clear native button padding on checkbox owner. Hide X/checkbox outside hover/focus unless selection mode is active. Keep title/meta in block rows. Use Shift+F10/ContextMenu key for Saved Tab actions and restore trigger focus on Escape.

- [ ] **Step 4: Implement one read-only tooltip instance**

Remove favicon/actions from tooltip. Clamp title to two lines, link to four, timestamp to one. Draw the domain separator in CSS. Place 6px above and flip below when necessary.

- [ ] **Step 5: Run focused GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 6: Browser row smoke**

Verify Open/Saved hover, keyboard focus, vertical pointer movement, tooltip flip, context menu keyboard open, and Escape return.

### Task 3: Rebuild Workspace Creation And Management

**Files:**
- Create: `src/manager/components/workspace/WorkspaceEditorModal.tsx`
- Create: `src/manager/components/workspace/WorkspaceEditorModal.test.ts`
- Create: `src/manager/components/workspace/WorkspaceManagerModal.tsx`
- Create: `src/manager/components/workspace/WorkspaceManagerModal.test.ts`
- Modify: `src/manager/components/workspace/WorkspaceMenu.tsx`
- Modify: `src/manager/components/workspace/WorkspaceMenu.test.ts`
- Modify: `src/manager/components/workspace/WorkspaceHeader.tsx`
- Modify: `src/manager/components/workspace/WorkspaceHeader.test.ts`
- Modify: `src/manager/styles/header.css`
- Modify: `src/manager/styles/overlays.css`

**Interfaces:**
- Consumes Foundation:

```ts
updateWorkspace(id, { name, emoji });
updateWorkspaceOrder(orderedWorkspaceIds);
```

- Produces:

```ts
WorkspaceEditorModal({
  mode: 'create' | 'edit',
  workspace?,
  workspaces,
  onSubmit,
});
```

- [ ] **Step 1: Write failing editor tests**

Cover 16 favorite emoji, arrow/Home/End movement, Custom ZWJ acceptance, normal-text rejection, empty/duplicate names, edit prefill, and atomic `{ name, emoji }` submit.

- [ ] **Step 2: Run focused RED**

```sh
npx vitest run src/manager/components/workspace/WorkspaceEditorModal.test.ts src/manager/components/workspace/WorkspaceMenu.test.ts
```

Expected: FAIL because the modal does not exist and Workspace has no emoji UI.

- [ ] **Step 3: Implement shared create/edit modal**

Use `Intl.Segmenter`; do not add dependencies. Escape/Cancel returns focus to its trigger. Existing custom emoji outside favorites opens Custom mode.

- [ ] **Step 4: Write failing management tests**

Assert Dense Rows has no visible handle, pointer row drag data, Move Up/Down, Edit, Delete, locked/only-workspace disabled delete, and counts in confirmation.

- [ ] **Step 5: Implement Workspace manager**

Use whole-row pointer drag only. Keyboard ordering calls `updateWorkspaceOrder`. Edit reuses `WorkspaceEditorModal`. Delete is confirmed and never immediate.

- [ ] **Step 6: Run focused GREEN**

```sh
npx vitest run src/manager/components/workspace/WorkspaceEditorModal.test.ts src/manager/components/workspace/WorkspaceManagerModal.test.ts src/manager/components/workspace/WorkspaceMenu.test.ts src/manager/components/workspace/WorkspaceHeader.test.ts
```

Expected: PASS.

### Task 4: Rebuild Category Navigation And Management

**Files:**
- Remove: `src/manager/components/workspace/CategoryReorderMode.tsx`
- Modify: `src/manager/components/workspace/CategoryNav.tsx`
- Modify: `src/manager/components/workspace/CategoryNav.test.ts`
- Modify: `src/manager/components/workspace/CategoryManager.tsx`
- Modify: `src/manager/components/workspace/WorkspaceHeader.tsx`
- Modify: `src/manager/components/workspace/WorkspaceHeader.test.ts`
- Modify: `src/manager/styles/header.css`
- Modify: `src/manager/styles/responsive.css`
- Modify: `tests/e2e/session-dnd.e2e.ts`

**Interfaces:**
- `CategoryNav` exposes direct pointer draggable tabs after 5px.
- `CategoryManager` exposes unified Dense Rows and `onUpdateOrder(order)`.
- Built-in permissions:

```ts
const capabilities = {
  inbox: { reorder: true, edit: false, delete: false },
  saved: { reorder: true, edit: false, delete: false },
  archive: { reorder: true, edit: false, delete: false },
};
```

- [ ] **Step 1: Write failing direct-drag tests**

Assert normal topbar has no handle, 3px movement still invokes navigation, and 7px starts typed category drag. Remove Reorder Categories command/mode.

- [ ] **Step 2: Write failing manager tests**

Assert one canonical list, order actions for all rows, Edit/Delete for custom rows only, shared create/edit modal, and locked-delete confirmation.

- [ ] **Step 3: Run focused RED**

```sh
npx vitest run src/manager/components/workspace/CategoryNav.test.ts src/manager/components/workspace/WorkspaceHeader.test.ts src/manager/core/dnd.test.ts
```

Expected: FAIL because explicit reorder mode still owns draggable activation.

- [ ] **Step 4: Implement direct pointer drag and unified manager**

Keep category navigation click behavior below the threshold. Manage Move Up/Down and pointer drag publish the same category-order mutation. Do not add reorder handle.

- [ ] **Step 5: Run focused GREEN and E2E**

```sh
npx vitest run src/manager/components/workspace/CategoryNav.test.ts src/manager/components/workspace/WorkspaceHeader.test.ts src/manager/core/dnd.test.ts
npx playwright test tests/e2e/session-dnd.e2e.ts --workers=1
```

Expected: PASS.

### Task 5: Introduce Explicit Selection Scope Ownership

**Files:**
- Create: `src/manager/core/selectionScope.ts`
- Create: `src/manager/core/selectionScope.test.ts`
- Create: `src/manager/hooks/useManagerSelectionScope.ts`
- Create: `src/manager/hooks/useManagerSelectionScope.test.ts`
- Modify: `src/manager/components/shell/ManagerLayout.tsx`
- Modify: `src/manager/components/sidebar/OpenTabsPanel.tsx`
- Modify: `src/manager/components/sidebar/OpenTabsSelectionBar.tsx`
- Modify: `src/manager/components/sidebar/OpenTabsPanel.test.ts`
- Modify: `src/manager/components/sessions/SessionCard.tsx`
- Modify: `src/manager/components/sessions/SessionTabList.tsx`
- Modify: `src/manager/core/session-rendering.test.ts`

**Interfaces:**
- Produces:

```ts
type SelectionScope =
  | { kind: 'open-tabs'; windowId: number }
  | { kind: 'saved-tabs'; groupId: string }
  | null;

interface SelectionScopeCommands {
  enterOpenTabs(windowId: number): void;
  enterSavedTabs(groupId: string): void;
  exit(): void;
}
```

- [ ] **Step 1: Write failing reducer tests**

Assert entering another scope clears the old scope's IDs, clearing the last ID preserves active mode, and collapse/Exit clears mode plus IDs.

- [ ] **Step 2: Run focused RED**

```sh
npx vitest run src/manager/core/selectionScope.test.ts src/manager/hooks/useManagerSelectionScope.test.ts src/manager/components/sidebar/OpenTabsPanel.test.ts src/manager/core/session-rendering.test.ts
```

Expected: FAIL because mode is derived locally from selected counts.

- [ ] **Step 3: Implement one Manager selection owner**

Keep IDs in their owning Open Tabs workflow / Session component, but route entry/exit through one scope coordinator. Do not store UI selection in persistent state.

- [ ] **Step 4: Run focused GREEN**

Run Step 2. Expected: PASS.

### Task 6: Add Session Selection Toolbar And Hybrid Target Pickers

**Files:**
- Create: `src/manager/components/sessions/SessionSelectionToolbar.tsx`
- Create: `src/manager/components/sessions/SessionSelectionToolbar.test.ts`
- Create: `src/manager/components/shell/SessionTargetPicker.tsx`
- Create: `src/manager/components/shell/SessionTargetPicker.test.ts`
- Modify: `src/manager/components/sessions/SessionCard.tsx`
- Modify: `src/manager/components/sessions/SessionCardHeader.tsx`
- Modify: `src/manager/components/sessions/SessionTabList.tsx`
- Modify: `src/manager/components/sidebar/OpenTabsSelectionBar.tsx`
- Modify: `src/manager/components/sidebar/OpenTabsPanel.tsx`
- Modify: `src/manager/hooks/useManagerRuntime.ts`
- Modify: `src/manager/core/session-rendering.test.ts`
- Modify: `src/manager/core/uiCopy.test.ts`

**Interfaces:**
- Produces:

```ts
interface SessionTargetChoice {
  kind: 'existing-session' | 'new-session';
  groupId?: string;
  category: CategoryFilter;
  index: number;
}

SessionTargetPicker({
  opened,
  mode: 'move-saved-tabs' | 'save-open-tabs' | 'move-session-category',
  choices,
  onPreview,
  onCancel,
  onCommit,
});
```

- [ ] **Step 1: Write failing Session toolbar tests**

Cover Empty, Links, Notes, Mixed, Locked, Filtered. Assert five/six action availability, visible-only select all, and action lifecycles.

- [ ] **Step 2: Write failing target-picker tests**

Assert Arrow keys change preview, Enter commits, Escape preserves selection/data, New Session choices disappear for All Source Tabs, and focus returns to the trigger/fallback.

- [ ] **Step 3: Run focused RED**

```sh
npx vitest run src/manager/components/sessions/SessionSelectionToolbar.test.ts src/manager/components/shell/SessionTargetPicker.test.ts src/manager/core/session-rendering.test.ts src/manager/components/sidebar/OpenTabsPanel.test.ts
```

Expected: FAIL because toolbar and picker do not exist.

- [ ] **Step 4: Implement Session toolbar**

Keep `selectionMode` independent. Restore/Delete clear IDs but preserve mode; Copy preserves IDs. Add Move to open picker. Session More gains Select Tabs and removes duplicate direct commands covered by the toolbar.

- [ ] **Step 5: Implement Open Tabs Save to**

Keep Create Session as the direct New Session action. Add Save to target picker for Existing/New. Do not add Open Tab row menus.

- [ ] **Step 6: Run focused GREEN**

Run Step 3. Expected: PASS.

- [ ] **Step 7: Browser selection smoke**

Verify one global scope, filtered hidden selection, 0-selected mode, picker preview, Escape/commit focus restoration, and locked action states.

### Task 7: Align Sidebar, Header, And Manager Material

**Files:**
- Modify: `src/manager/components/sidebar/OpenTabsWindowBar.tsx`
- Modify: `src/manager/components/sidebar/OpenTabsFilterFooter.tsx`
- Modify: `src/manager/components/sidebar/Sidebar.tsx`
- Modify: `src/manager/components/workspace/WorkspaceHeader.tsx`
- Modify: `src/manager/components/workspace/ManagerGlobalActions.tsx`
- Modify: `src/manager/styles/shell.css`
- Modify: `src/manager/styles/header.css`
- Modify: `src/manager/styles/sidebar.css`
- Modify: `src/manager/styles/session.css`
- Modify: `src/manager/styles/responsive.css`
- Modify: `src/manager/core/layout.test.ts`
- Modify: `tests/e2e/manager-boot.e2e.ts`

**Interfaces:**
- Keeps sidebar state model: collapsed / peek / pinned / drawer.
- Keeps rail width 52px.
- Global header commands: Workspace, Categories, Search, Bin, More.

- [ ] **Step 1: Write failing layout/copy tests**

Assert no Window N text, focused dot badge, no Refresh, neutral Save/Collapse, Search neutral, Bin direct, More containing Import/Export/Options, and no visual Active Tab.

- [ ] **Step 2: Run focused RED**

```sh
npx vitest run src/manager/core/layout.test.ts src/manager/components/workspace/WorkspaceHeader.test.ts src/manager/components/sidebar/OpenTabsPanel.test.ts
```

Expected: FAIL on current labels/actions/styles.

- [ ] **Step 3: Implement stable geometry and Crisp tokens**

Keep 52px alignment. Preserve temporary peek/pin behavior and fix collapsed selection exit. Use A1/D1 tokens, 7-8px panels, 6px controls, 32px desktop icon actions, no resting colored Save.

- [ ] **Step 4: Run focused GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 5: Browser shell matrix**

Verify desktop collapsed/peek/pinned, compact drawer, light/dark, reduced motion, Search exclusive expansion, no hidden focusables, and axe 0/0.
