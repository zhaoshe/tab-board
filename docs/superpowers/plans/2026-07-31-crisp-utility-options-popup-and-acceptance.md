# TabBoard Crisp Utility Options, Popup, And Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Options and Popup behavior, migrate every production icon to Lucide, align A1/D1 tokens, update product documentation, and run the complete acceptance matrix.

**Architecture:** Keep Options Basic on its lightweight external store and lazy-load Advanced. Storage UI reads a persisted configured-target/active-backend projection instead of inferring status from one runtime callback. Popup stays a compact one-window action surface. Perform Lucide migration after Manager and page composition stabilize.

**Tech Stack:** React 18, TypeScript, Mantine v7, Lucide, Chrome MV3 APIs, file-storage adapter, Vitest, Playwright, agent-browser/axe.

## Global Constraints

- Foundation, Manager, and DnD plans are complete.
- Options content width is 680px.
- Popup remains 320px.
- Configured storage target and active backend are distinct.
- Pinned tabs are storable but never auto-closed by capture or dedupe.
- Use A1 Light and D1 Graphite tokens.
- Remove `@tabler/icons-react` only after all imports migrate.
- Run final browser and E2E commands serially.
- Do not commit unless explicitly requested.

---

### Task 1: Simplify Options Basic And Capture Copy

**Files:**
- Modify: `src/options/OptionsApp.tsx`
- Modify: `src/options/OptionsApp.dom.test.ts`
- Modify: `src/options/components/SettingsSection.tsx`
- Modify: `src/options/options.css`
- Modify: `src/shared/model/schema.ts`
- Modify: `src/shared/model/schema.test.ts`

**Interfaces:**
- Default `settings.actionClick` becomes `'popup'` for new/default state only.
- Existing persisted settings are preserved by normalization.

- [x] **Step 1: Write failing copy/default tests**

Assert:

```ts
expect(createDefaultSettings().actionClick).toBe('popup');
expect(normalizeSettings({ ...legacy, actionClick: 'store' }).actionClick).toBe('store');
```

Assert rendered Options has no `Configure how TabBoard works`, Capture switches align right, and label is `Exclude URL rules`.

- [x] **Step 2: Run focused RED**

```sh
npx vitest run src/shared/model/schema.test.ts src/options/OptionsApp.dom.test.ts
```

Expected: FAIL on old default/copy.

- [x] **Step 3: Implement Basic/Capture layout**

Keep save status and Retry authoritative. Add helper text that matching exclusion rules are hidden from Open Tabs and unavailable for selection, drag, or save. Use normal setting-row composition.

- [x] **Step 4: Run focused GREEN**

Run Step 2. Expected: PASS.

### Task 2: Persist Configured Storage Target And Fallback Status

**Files:**
- Modify: `src/shared/store/fsBootstrap.ts`
- Modify: `src/shared/store/activeAdapter.ts`
- Modify: `src/shared/store/activeAdapter.test.ts`
- Modify: `src/shared/store/settingsProjection.ts`
- Modify: `src/shared/store/settingsProjection.test.ts`
- Modify: `src/shared/store/fileSerialization.ts`
- Modify: `src/shared/store/fileSerialization.test.ts`
- Modify: `src/options/components/DataStorageCard.tsx`
- Modify: `src/options/OptionsApp.dom.test.ts`

**Interfaces:**
- Produces:

```ts
interface StorageStatusProjection {
  configuredTarget: 'browser' | 'file';
  activeBackend: 'browser' | 'file';
  folderName: string | null;
  fallbackReason: string | null;
  fileUpdatedAt: string | null;
}
```

- `fileUpdatedAt` comes from `meta.json.updatedAt`.

- [x] **Step 1: Write failing projection tests**

Cover Browser, Folder Ready, Permission Lost, Folder Missing, Reconnecting. Assert fallback keeps configured target `file`, active backend `browser`, folder identity, reason, and last file update.

- [x] **Step 2: Run focused RED**

```sh
npx vitest run src/shared/store/activeAdapter.test.ts src/shared/store/settingsProjection.test.ts src/shared/store/fileSerialization.test.ts src/options/OptionsApp.dom.test.ts
```

Expected: FAIL because status is inferred from active mode and in-memory callback.

- [x] **Step 3: Implement persisted status projection**

Persist bootstrap/fallback metadata in the existing storage config authority. Do not put `FileSystemDirectoryHandle` in chrome.storage. Keep handle in IndexedDB. Read file freshness from `meta.json`.

- [x] **Step 4: Rebuild DataStorageCard composition**

Render:

- `Storage location`
- `Choose where TabBoard saves session data.`
- `Local folder name: <name>`
- right-aligned `updated: HH:mm:ss`
- `Change folder`
- `Use browser storage`

Fallback keeps Local Folder primary and adds inline warning plus `Reconnect folder` / `Use browser storage`.

- [x] **Step 5: Run focused GREEN**

Run Step 2. Expected: PASS.

### Task 3: Flatten Options Advanced

**Files:**
- Modify: `src/options/components/AdvancedSettingsContent.tsx`
- Modify: `src/options/OptionsApp.tsx`
- Modify: `src/options/OptionsApp.dom.test.ts`
- Modify: `src/options/options.css`

**Interfaces:** Keeps lazy `AdvancedSettingsContent`.

- [x] **Step 1: Write failing hierarchy tests**

Assert Advanced contains direct rows for Storage location, Confirm before deleting saved items, Keyboard shortcuts, Reset settings, and no one-item Safety/Recovery wrappers.

- [x] **Step 2: Run focused RED**

```sh
npx vitest run src/options/OptionsApp.dom.test.ts
```

Expected: FAIL on nested hierarchy/current copy.

- [x] **Step 3: Implement A2 flat list**

Keep Advanced unmounted while closed. Use two storage semantic rows. Keep labels visible, controls right-aligned, and buttons without trailing literal `...`.

- [x] **Step 4: Run focused GREEN**

Run Step 2. Expected: PASS.

### Task 4: Rebuild Popup Compact Action Rows

**Files:**
- Modify: `src/popup/PopupApp.tsx`
- Modify: `src/popup/PopupApp.dom.test.ts`
- Modify: `src/popup/popup.css`
- Modify: `src/background/service-worker.ts`
- Modify: `src/background/service-worker.test.ts`

**Interfaces:**
- Popup helper:

```ts
function popupSaveHelper(closeTabsAfterSave: boolean): string {
  return closeTabsAfterSave
    ? 'Save and close tabs'
    : 'Save and keep tabs open';
}
```

- [x] **Step 1: Write failing composition tests**

Cover Mixed, Pinned Excluded, Keep All, No Pinned, Only Pinned Duplicates. Assert:

- no selected/total ratio;
- no Group control;
- `7 tabs` and duplicate copy share 13/18 typography;
- Save/Remove are 32x80;
- pinned checkbox only when pinned tabs exist;
- no reserved pinned gap.

- [x] **Step 2: Run focused RED**

```sh
npx vitest run src/popup/PopupApp.dom.test.ts src/background/service-worker.test.ts
```

Expected: FAIL on Group option, helper copy, and pinned close behavior.

- [x] **Step 3: Implement compact Popup**

Remove `includeGroups`, grouped counts, and duplicate header actions. Keep one Open Manager and Settings entry. Use dynamic helper based only on `closeTabsAfterSave`.

- [x] **Step 4: Guard pinned closure/dedupe**

Every capture/dedupe close sequence filters out pinned source tabs. Explicit Close remains unaffected.

- [x] **Step 5: Run focused GREEN**

Run Step 2. Expected: PASS.

### Task 5: Complete Lucide Migration

**Files:**
- Modify: every production file returned by:

```sh
rg -l \"@tabler/icons-react\" src
```

- Modify corresponding source-contract/component tests.
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes `TabBoardIcon` from Foundation.
- Confirmed primary mapping:
  - Search -> `Search`
  - More -> `Menu`
  - Settings -> `Settings2`
  - Trash/Bin -> `Trash`
  - Import -> `Download`
  - Export -> `Upload`
  - Save -> `Inbox`
  - Restore -> `SquareArrowOutUpRight`
  - Pin -> `Pin`
  - Open Manager -> `AppWindow`
  - Collapse/Expand -> `PanelLeftClose` / `PanelLeftOpen`
  - Folder -> `FolderOpen`
  - Keyboard -> `Keyboard`
  - Selection -> `SquareCheckBig`
  - Close -> `X`

- [x] **Step 1: Add failing architecture test**

Add a source scan asserting no production file imports `@tabler/icons-react` and every icon-only action uses the shared 1.75-stroke primitive or a documented CSS glyph.

- [x] **Step 2: Run RED**

```sh
npx vitest run src/manager/core/accessibilityMarkup.test.ts src/manager/core/uiOwnership.test.ts
```

Expected: FAIL with current Tabler imports.

- [x] **Step 3: Migrate by surface**

Order:

1. Shared/components and Manager shell.
2. Sidebar and Session rows.
3. Workspace/Category/import/export/bin.
4. Options.
5. Popup.

Use CSS glyphs for Window counts/focused dot and favicon property badges.

- [x] **Step 4: Remove Tabler dependency**

```sh
npm uninstall @tabler/icons-react
```

Keep `lucide-react`.

- [x] **Step 5: Run focused GREEN and build**

```sh
npx vitest run src/manager/core/accessibilityMarkup.test.ts src/manager/core/uiOwnership.test.ts
npm run build
```

Expected: PASS and `rg \"@tabler/icons-react\" src` returns no results.

### Task 6: Apply A1/D1 Tokens And Shared Geometry

**Files:**
- Modify: `src/shared/styles/theme.ts`
- Modify: `src/shared/styles/accessibility.css`
- Modify: `src/manager/styles/shell.css`
- Modify: `src/manager/styles/header.css`
- Modify: `src/manager/styles/sidebar.css`
- Modify: `src/manager/styles/session.css`
- Modify: `src/manager/styles/overlays.css`
- Modify: `src/manager/styles/responsive.css`
- Modify: `src/options/options.css`
- Modify: `src/popup/popup.css`
- Modify: `src/manager/core/layout.test.ts`
- Modify: `src/manager/core/accessibilityMarkup.test.ts`
- Modify: `src/options/OptionsApp.dom.test.ts`
- Modify: `src/popup/PopupApp.dom.test.ts`

**Interfaces:** CSS semantic tokens exactly match the bilingual spec.

- [x] **Step 1: Write failing token/geometry contracts**

Assert 32px desktop icon actions, 44px coarse actions, 6px controls, 7-8px panels, letter-spacing 0, light/dark token values, 29px menu rows, and no literal accent background on resting Save/Search.

- [x] **Step 2: Run focused RED**

```sh
npx vitest run src/manager/core/layout.test.ts src/manager/core/accessibilityMarkup.test.ts src/options/OptionsApp.dom.test.ts src/popup/PopupApp.dom.test.ts
```

Expected: FAIL on current Nord/Mantine values and geometry.

- [x] **Step 3: Implement semantic tokens**

Bridge Mantine variables to A1/D1. Keep dark graphite free from blue cast. Preserve contrast, focus, and reduced-motion rules. Do not animate width/height for DnD objects; use transform/opacity.

- [x] **Step 4: Run focused GREEN**

Run Step 2. Expected: PASS.

### Task 7: Update Current Product And Architecture Docs

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/project-overview.md`
- Modify: `docs/feature-spec.md`
- Modify: `docs/technical-architecture.md`
- Modify: `docs/feature-evolution.md`
- Modify: `docs/product-decisions.md`
- Modify: `docs/product-story.md`

**Interfaces:** Documentation must match production after Tasks 1-6.

- [x] **Step 1: Update product truth**

Document:

- Workspace emoji/order.
- B2 menus and row X actions.
- one selection scope and Session toolbar.
- explicit `new-session-insert`.
- fixed track and Gap Anchors.
- Empty Category exception.
- Progressive Edge and Plus pause.
- Hybrid Commands.
- `OpenTabInfo.active` removal.
- Popup/Options final copy.
- Lucide-only icon system.

- [x] **Step 2: Remove superseded truth**

Remove explicit Reorder Categories mode, drag handles, implicit Saved/Open `group-insert` creation, old storage/fallback copy, Popup Group control, and Tabler ownership.

- [x] **Step 3: Run doc/source checks**

```sh
npm run check:cycles
npm run check:architecture
git diff --check
```

Expected: PASS.

### Task 8: Full Automated Acceptance

**Files:** No planned production changes. Fix only failures caused by this implementation.

- [x] **Step 1: Run focused domain suites**

```sh
npx vitest run \
  src/shared/model/schema.test.ts \
  src/shared/openTabs.test.ts \
  src/shared/store/stateMutations.test.ts \
  src/manager/core/dnd.test.ts \
  src/manager/core/dndAutoScroll.test.ts \
  src/manager/components/shell/ManagerLayout.test.ts \
  src/manager/components/workspace/WorkspaceContent.test.ts \
  src/options/OptionsApp.dom.test.ts \
  src/popup/PopupApp.dom.test.ts
```

Expected: PASS.

- [x] **Step 2: Run full unit/build/check**

```sh
npm run build
npm run check
npm test
```

Expected: PASS.

- [x] **Step 3: Run serial E2E**

```sh
npx playwright test --workers=1
```

Expected: PASS.

- [x] **Step 4: Run startup benchmark**

```sh
npm run benchmark:startup
```

Expected: no regression beyond the repository threshold for Manager/Options representative state.

### Task 9: Rendered Visual And Accessibility Acceptance

**Files:** No planned production changes. Fix only implementation regressions.

- [x] **Step 1: Start production-equivalent preview**

```sh
npm run dev
```

- [x] **Step 2: Verify Manager matrix**

Use agent-browser at desktop and 390px:

- A1/D1.
- Sidebar collapsed/peek/pinned/drawer.
- selection 0/links/mixed/notes/locked/filtered.
- Workspace/Category create/edit/manage/delete.
- B2 menus and item tips.
- read-only tab tooltip.
- Gap Anchor start/between/end, Empty Category, All Source Tabs suppression.
- Progressive Edge and Plus pause.
- Hybrid picker cancel/commit/focus.

Run axe on each structural state. Expected: 0 violations / 0 incomplete after animations settle. Intentional translucent DnD ghost overlap may require manual contrast interpretation, but resting/target UI must pass 0/0.

- [x] **Step 3: Verify Popup matrix**

Test Mixed, Pinned Excluded, Keep All, No Pinned, Only Pinned Duplicates. Assert no horizontal overflow and correct helper/pinned composition.

- [x] **Step 4: Verify Options matrix**

Test Browser, Folder Ready, Permission Lost, Folder Missing, Reconnecting, Advanced closed/open, Reset, light/dark, and 680px geometry.

- [ ] **Step 5: Manual unpacked-extension smoke**

Verify real Chrome:

- capture/save with pinned tabs staying open;
- restore restrictions;
- file picker permission/fallback/reconnect;
- pointer/touch DnD and Board auto-scroll;
- Chrome sender/runtime integration;
- keyboard Hybrid Commands and focus restoration.

Automated real-extension coverage is complete through the startup benchmark,
service-worker suites, and serial browser matrix. Native
`showDirectoryPicker()` selection and OS permission prompts remain an explicit
manual-only gap because the headless extension runner cannot grant that UI.

- [x] **Step 6: Final diff audit**

```sh
git diff --check
git status --short
rg \"@tabler/icons-react\" src
rg \"\\bactive:\\s*(true|false)\" src/shared/openTabs.ts src/manager src/shared/model/drop-validation.ts
```

Expected: no whitespace errors, no Tabler production imports, and no TabBoard `OpenTabInfo.active` protocol field.
