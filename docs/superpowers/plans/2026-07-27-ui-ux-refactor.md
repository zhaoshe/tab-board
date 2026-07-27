# TabBoard UI / UX Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved complete UI/UX audit recommendations and iterate Web Interface Guidelines review until shipped UI files have no findings.

**Architecture:** Preserve current model/store/background/DnD contracts while introducing shared accessibility primitives, focused Manager shell/header units, URL-backed page state, and explicit responsive compositions. Each task follows red-green-refactor and ends with focused verification before the next slice.

**Tech Stack:** React 18, TypeScript, Mantine v7, Zustand, `@dnd-kit`, Vitest/happy-dom, Playwright, agent-browser/axe.

## Global Constraints

- No new runtime dependencies.
- Do not change persistent data schema, storage backend protocols, mutation wire contracts, or DnD semantics.
- Keep all session/open-tab rows mounted; retain `content-visibility`.
- Preserve the horizontal board and desktop session width.
- Use semantic HTML before ARIA.
- Every behavior change starts with a failing automated test.
- Human-readable product documentation remains concise and traceable.
- Commit steps in this plan are checkpoints only; do not commit unless explicitly requested by the user.

## File Structure

- `src/shared/components/AccessibleIconAction.tsx`: icon-only action contract.
- `src/shared/components/ConfirmDialog.tsx`: reusable destructive confirmation.
- `src/shared/utils/formatters.ts`: locale-aware date/relative-time helpers.
- `src/shared/hooks/usePageTheme.ts`: native color-scheme and theme-color synchronization.
- `src/shared/styles/accessibility.css`: skip link, visually-hidden, focus, touch, modal, reduced-motion foundations.
- `src/manager/components/shell/ManagerFrame.tsx`: Manager landmarks and grid composition.
- `src/manager/components/shell/ManagerDndCoordinator.tsx`: DnD lifecycle extracted from `ManagerLayout`.
- `src/manager/hooks/useSidebarDisclosure.ts`: sidebar state/focus.
- `src/manager/hooks/useCaptureReveal.ts`: capture target reveal/highlight.
- `src/manager/components/workspace/WorkspaceMenu.tsx`: workspace control and validated dialogs.
- `src/manager/components/workspace/CategoryNav.tsx`: category nav/DnD.
- `src/manager/components/workspace/CategoryManager.tsx`: category CRUD/order.
- `src/manager/components/workspace/ManagerGlobalActions.tsx`: desktop and compact actions.
- `src/manager/core/managerPageState.ts`: validated URL state owner.
- `src/manager/styles/{shell,header,sidebar,session,overlays,responsive}.css`: single-owner styles.

---

### Task 1: Shared Accessibility, Theme, and Formatting Foundations

**Files:**
- Create: `src/shared/components/AccessibleIconAction.tsx`
- Create: `src/shared/components/AccessibleIconAction.test.tsx`
- Create: `src/shared/components/ConfirmDialog.tsx`
- Create: `src/shared/components/ConfirmDialog.test.tsx`
- Create: `src/shared/utils/formatters.ts`
- Create: `src/shared/utils/formatters.test.ts`
- Create: `src/shared/hooks/usePageTheme.ts`
- Create: `src/shared/hooks/usePageTheme.test.ts`
- Create: `src/shared/styles/accessibility.css`
- Modify: `src/shared/styles/theme.ts`
- Modify: `src/manager/main.tsx`
- Modify: `src/popup/main.tsx`
- Modify: `src/options/main.tsx`
- Modify: `manager.html`
- Modify: `popup.html`
- Modify: `options.html`

**Interfaces:**
- Produces: `AccessibleIconAction(props: ActionIconProps & { label: string; tooltip?: string })`.
- Produces: `ConfirmDialog({ opened, title, message, confirmLabel, loading, onCancel, onConfirm })`.
- Produces: `formatDate(value, locale?)`, `formatRelativeTime(value, now?, locale?)`.
- Produces: `usePageTheme(colorScheme)` that synchronizes native `color-scheme` and `meta[name=theme-color]`.

- [x] **Step 1: Write failing shared-foundation tests**

Assert:

```tsx
render(<AccessibleIconAction label="Restore"><IconRestore /></AccessibleIconAction>);
expect(screen.getByRole('button', { name: 'Restore' })).toBeVisible();
expect(screen.getByTestId('icon')).toHaveAttribute('aria-hidden', 'true');
```

```tsx
render(<ConfirmDialog opened title="Reset Settings" message="Reset all settings?" confirmLabel="Reset Settings" onCancel={cancel} onConfirm={confirm} />);
expect(screen.getByRole('dialog', { name: 'Reset Settings' })).toBeVisible();
expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
```

```ts
expect(formatRelativeTime('2026-07-27T09:59:00Z', new Date('2026-07-27T10:00:00Z'), 'en')).toBe('1 minute ago');
```

```ts
expect(document.documentElement.style.colorScheme).toBe('dark');
expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', DARK_BACKGROUND);
```

- [x] **Step 2: Run focused tests and verify RED**

Run:

```sh
npx vitest run src/shared/components/AccessibleIconAction.test.tsx src/shared/components/ConfirmDialog.test.tsx src/shared/utils/formatters.test.ts src/shared/hooks/usePageTheme.test.ts
```

Expected: FAIL because modules/contracts do not exist.

- [x] **Step 3: Implement minimal shared foundations**

Requirements:

- Icon child is decorative and action receives `aria-label`.
- Confirm dialog focuses Cancel first and exposes loading/disabled state only after confirmation starts.
- Formatters use `Intl.DateTimeFormat` and `Intl.RelativeTimeFormat`.
- Theme hook updates native color scheme and `theme-color`.
- Shared CSS defines `.skip-link`, `.visually-hidden`, `touch-action: manipulation`, intentional tap highlight, modal overscroll containment, focus-visible, and comprehensive reduced-motion overrides.
- HTML entries include default `theme-color`.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [x] **Step 5: Run type/build smoke**

Run:

```sh
npm run build
```

Expected: PASS.

### Task 2: Manager Semantics and Keyboard Contracts

**Files:**
- Modify: `src/manager/components/sessions/SessionCard.tsx`
- Modify: `src/manager/components/sessions/TabItemRow.tsx`
- Modify: `src/manager/components/sidebar/OpenTabsPanel.tsx`
- Modify: `src/manager/components/bin/BinView.tsx`
- Modify: `src/manager/components/import-export/ImportModal.tsx`
- Modify: `src/manager/components/search/SearchBar.tsx`
- Modify: `src/manager/hooks/useManagerOverlays.ts`
- Modify: `src/manager/hooks/useToast.tsx`
- Modify: `src/manager/ManagerApp.dom.test.ts`
- Modify: `src/manager/components/shell/ManagerLayout.test.ts`
- Modify: `src/manager/core/session-rendering.test.ts`
- Modify: `src/manager/core/overlays.test.ts`

**Interfaces:**
- Consumes shared foundations from Task 1.
- Produces keyboard-complete session rename/note/popover and semantic Manager landmarks.

- [x] **Step 1: Write failing Manager DOM/source contract tests**

Cover:

- skip link targets `#manager-main` and hidden H1 exists;
- Enter and F2 on session title enter edit mode;
- session note is a button;
- popover action focus cancels close timer and Escape restores trigger focus;
- Open Tabs row wrapper has no `onClick`;
- Bin icon is decorative and restore/delete have names;
- Import/Search inputs have labels, names, `autoComplete="off"`, and ellipsis placeholders;
- Manager toast container has `aria-live="polite"` and errors use `role="alert"`.

- [x] **Step 2: Run focused Manager tests and verify RED**

Run:

```sh
npx vitest run src/manager/ManagerApp.dom.test.ts src/manager/components/shell/ManagerLayout.test.ts src/manager/core/session-rendering.test.ts src/manager/core/overlays.test.ts
```

Expected: FAIL on missing contracts.

- [x] **Step 3: Implement semantic and keyboard fixes**

Requirements:

- no generic clickable row;
- no focusable decorative action;
- popover actions are reachable by Tab and retain open state while focused;
- all placeholders use `…`;
- images include explicit dimensions;
- interactive titles/notes have visible focus.

- [x] **Step 4: Run focused tests and verify GREEN**

Run Step 2 command. Expected: PASS.

- [x] **Step 5: Run browser keyboard smoke**

Use manager preview and verify:

- Tab → skip link → main;
- Saved → title Enter/F2 rename;
- saved/open detail trigger → Tab enters actions → Escape returns focus;
- Bin restore/delete names are present in accessibility tree.

### Task 3: Sidebar Disclosure and Responsive Header

**Files:**
- Create: `src/manager/hooks/useSidebarDisclosure.ts`
- Create: `src/manager/hooks/useSidebarDisclosure.test.ts`
- Create: `src/manager/components/workspace/ManagerGlobalActions.tsx`
- Create: `src/manager/components/workspace/ManagerGlobalActions.test.tsx`
- Modify: `src/manager/components/sidebar/Sidebar.tsx`
- Modify: `src/manager/components/sidebar/OpenTabsPanel.tsx`
- Modify: `src/manager/components/shell/ManagerLayout.tsx`
- Modify: `src/manager/components/workspace/WorkspaceHeader.tsx`
- Modify: `src/manager/styles/manager.css`
- Modify: `src/manager/components/shell/ManagerLayout.test.ts`
- Modify: `src/manager/components/workspace/WorkspaceHeader.test.ts`
- Modify: `tests/e2e/manager-boot.e2e.ts`

**Interfaces:**
- Produces `useSidebarDisclosure({ breakpoint, storageKey })`.
- Produces `ManagerGlobalActions` with identical commands for desktop buttons and compact menu.

- [x] **Step 1: Write failing responsive/focus tests**

Assert:

- collapse moves focus to visible compact toggle;
- category reorder targets do not increase nav height;
- compact action menu contains Import, Export, Trash, Options;
- expanded compact search replaces category/action lane;
- 390px session column max width does not exceed board width.

- [x] **Step 2: Run focused tests/E2E and verify RED**

Run:

```sh
npx vitest run src/manager/hooks/useSidebarDisclosure.test.ts src/manager/components/workspace/ManagerGlobalActions.test.tsx src/manager/components/shell/ManagerLayout.test.ts src/manager/components/workspace/WorkspaceHeader.test.ts
npx playwright test tests/e2e/manager-boot.e2e.ts
```

Expected: FAIL on missing hook/menu and existing geometry.

- [x] **Step 3: Implement disclosure and compact header**

Requirements:

- remove dead `SidebarRail` implementation or make it the mounted compact owner;
- category before/after targets are absolute within a 48px item;
- no duplicated `.manager-search-slot` rules;
- no capability hidden at compact widths;
- compact search is exclusive;
- reduced motion disables shell/header transitions and smooth scrolling.

- [x] **Step 4: Run focused tests/E2E and verify GREEN**

Run Step 2 commands. Expected: PASS.

- [x] **Step 5: Measure browser geometry**

At 390×844, 800×800, 1280×800, 1440×900 assert:

```js
categoryNavRect.top >= topbarRect.top
categoryNavRect.bottom <= topbarRect.bottom
document.documentElement.scrollWidth === innerWidth
allCriticalActionsReachable === true
```

### Task 4: Popup and Options Compliance

**Files:**
- Modify: `src/popup/PopupApp.tsx`
- Modify: `src/popup/popup.css`
- Modify: `src/popup/PopupApp.dom.test.ts`
- Modify: `src/options/OptionsApp.tsx`
- Create: `src/options/options.css`
- Create: `src/options/OptionsApp.dom.test.tsx`
- Modify: `src/options/components/DataStorageCard.tsx`
- Modify: `src/options/components/FolderPickerDialog.tsx`
- Modify: `src/options/components/DisconnectDialog.tsx`
- Modify: `src/options/components/FolderPickerDialog.test.ts`

**Interfaces:**
- Consumes `ConfirmDialog`, formatters, semantic tokens, and theme hook.
- Produces compliant Popup/Options surfaces.

- [x] **Step 1: Write failing Popup/Options tests**

Cover:

- Popup has `main`, hidden H1, hydration progress, and dedupe confirmation.
- Popup primary text contrast uses configured contrast-safe shade.
- Options follows system/dark/light.
- Options has `main`; radio groups have labels.
- Usage-stat cards are absent.
- Advanced controls are inside a disclosure section.
- reset requires confirmation.
- folder merge copy says folder data wins same-ID conflicts.
- narrow layout stacks header/actions.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```sh
npx vitest run src/popup/PopupApp.dom.test.ts src/options/OptionsApp.dom.test.tsx src/options/components/FolderPickerDialog.test.ts
```

Expected: FAIL on existing behavior.

- [x] **Step 3: Implement Popup/Options changes**

Requirements:

- keep popup quick-action scope;
- preserve all settings and storage behaviors;
- use semantic muted/action colors that pass 4.5:1 for normal text;
- no blank hydration surface;
- no immediate destructive reset/dedupe.

- [x] **Step 4: Run focused tests and verify GREEN**

Run Step 2 command. Expected: PASS.

- [x] **Step 5: Run light/dark browser axe**

Run `agent-browser a11y` on Popup and Options in light and dark. Expected: 0 serious/critical violations and no landmark/name violations.

### Task 5: URL-Backed Manager Context and Validated Workspace Dialogs

**Files:**
- Create: `src/manager/core/managerPageState.ts`
- Create: `src/manager/core/managerPageState.test.ts`
- Create: `src/manager/hooks/useManagerPageState.ts`
- Create: `src/manager/hooks/useManagerPageState.test.ts`
- Create: `src/manager/components/workspace/WorkspaceMenu.tsx`
- Create: `src/manager/components/workspace/WorkspaceMenu.test.tsx`
- Modify: `src/manager/components/shell/ManagerLayout.tsx`
- Modify: `src/manager/components/workspace/WorkspaceHeader.tsx`
- Modify: `src/manager/hooks/useSearchQuery.ts`
- Modify: `docs/feature-spec.md`
- Modify: `docs/technical-architecture.md`
- Modify: `docs/feature-evolution.md`
- Modify: `docs/product-decisions.md`

**Interfaces:**
- Produces `ManagerPageState = { workspaceId: string; category: CategoryFilter; view: 'board' | 'bin'; query: string }`.
- Produces parse/serialize/validate functions and a React adapter.

- [x] **Step 1: Write failing URL-state and workspace-dialog tests**

Cover:

- valid URL restores workspace/category/Bin/query;
- invalid workspace/folder falls back to active workspace/Inbox;
- navigation pushes history; search replaces history;
- popstate restores UI;
- workspace create/rename uses validated modal, not `window.prompt`;
- unsaved inline edit blocks view replacement.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```sh
npx vitest run src/manager/core/managerPageState.test.ts src/manager/hooks/useManagerPageState.test.ts src/manager/components/workspace/WorkspaceMenu.test.tsx
```

Expected: FAIL because owner/components do not exist.

- [x] **Step 3: Implement URL owner and dialogs**

Requirements:

- no persistent schema changes;
- no new event bus;
- page owner remains framework-neutral;
- URL uses exact parameters from the design;
- workspace names are trimmed, non-empty, and errors shown inline.

- [x] **Step 4: Run focused tests and verify GREEN**

Run Step 2 command. Expected: PASS.

- [x] **Step 5: Update current-behavior documentation**

Document URL state, validated dialogs, and responsive action model in the 4 listed docs.

### Task 6: Manager Component and Style Ownership Refactor

**Files:**
- Create: `src/manager/components/shell/ManagerFrame.tsx`
- Create: `src/manager/components/shell/ManagerDndCoordinator.tsx`
- Create: `src/manager/hooks/useCaptureReveal.ts`
- Create: `src/manager/components/workspace/CategoryNav.tsx`
- Create: `src/manager/components/workspace/CategoryManager.tsx`
- Create: `src/manager/components/workspace/ManagerSearchCommand.tsx`
- Modify: `src/manager/components/shell/ManagerLayout.tsx`
- Modify: `src/manager/components/workspace/WorkspaceHeader.tsx`
- Create: `src/manager/styles/shell.css`
- Create: `src/manager/styles/header.css`
- Create: `src/manager/styles/sidebar.css`
- Create: `src/manager/styles/session.css`
- Create: `src/manager/styles/overlays.css`
- Create: `src/manager/styles/responsive.css`
- Modify: `src/manager/styles/manager.css`
- Modify: related Manager tests

**Interfaces:**
- Preserve `ManagerLayout()` and `WorkspaceHeader(props)` public APIs.
- Move behavior without changing typed DnD/domain contracts.

- [x] **Step 1: Add failing architecture/source-ownership tests**

Assert:

- `ManagerLayout.tsx` imports coordinator/frame/hooks and contains no collision algorithm or capture-reveal URL parsing;
- `WorkspaceHeader.tsx` composes focused units and contains no CRUD modal bodies;
- `manager.css` contains imports only;
- no duplicated state selector across style files.

- [x] **Step 2: Run architecture tests and verify RED**

Run:

```sh
npm run check:architecture
npx vitest run src/manager/components/shell/ManagerLayout.test.ts src/manager/components/workspace/WorkspaceHeader.test.ts
```

Expected: FAIL on ownership assertions.

- [x] **Step 3: Extract units without behavior changes**

Move code in small green steps. Keep existing function exports needed by tests in their owning focused modules and update imports.

- [x] **Step 4: Run focused and broad tests**

Run:

```sh
npm test
npm run check
```

Expected: PASS.

- [x] **Step 5: Run full E2E and manual DnD gates**

Run:

```sh
npm run test:e2e
```

Then manually verify the 5 AGENTS.md DnD scenarios.

### Task 7: Iterative Web Guidelines Review and Closure Audit

**Files:**
- Modify: any shipped UI file identified by review
- Update: `findings.md`
- Update: `progress.md`
- Update: `task_plan.md`

**Interfaces:**
- Produces a zero-finding review and objective-to-evidence completion matrix.

- [x] **Step 1: Fetch latest guidelines and review all shipped UI**

Review patterns:

```text
manager.html popup.html options.html
src/manager/**/*.tsx src/manager/**/*.css
src/popup/**/*.tsx src/popup/**/*.css
src/options/**/*.tsx src/options/**/*.css
src/shared/components/**/*.tsx src/shared/styles/**/*.css
```

Record every finding in `file:line` format.

- [x] **Step 2: For each finding, write a failing regression test**

Group only tightly coupled findings. Verify each test fails for the expected missing behavior.

- [x] **Step 3: Fix findings and rerun focused tests**

Repeat Steps 1–3 until the static guidelines review reports no findings.

- [x] **Step 4: Run fresh browser audits**

Manager, Popup, Options; light/dark; desktop/narrow; reduced motion; keyboard paths. Require:

- 0 axe serious/critical violations;
- 0 unresolved incomplete checks that indicate a real product defect;
- no overlaps, unreachable actions, focus loss, or body overflow.

- [x] **Step 5: Run full verification**

Run:

```sh
npm run build
npm run check
npm test
npm run test:e2e
git diff --check
```

Expected: all exit 0.

- [x] **Step 6: Completion audit**

Create a prompt-to-artifact checklist mapping:

- every P0/P1/P2 recommendation in `findings.md`;
- every design completion requirement;
- every changed file;
- every command and browser gate;
- final static review and axe results.

Treat any missing evidence as incomplete and continue the loop.
