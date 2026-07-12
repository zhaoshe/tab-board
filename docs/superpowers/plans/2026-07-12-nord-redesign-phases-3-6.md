# ZipTab Nord Redesign Phases 3-6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining Nord redesign work by correcting the Phase 3 board regressions, migrating only the safe Phase 4 manager control families, applying the page-local Phase 5 theme contract, and closing Phase 6 documentation and verification gates without changing product behavior.

**Architecture:** Keep the existing native DOM architecture and delegated handlers. Migrate controls one family at a time, preserving IDs, data attributes, render functions, DnD hierarchy, focus behavior, and Chrome API flows. Use source-contract tests for vendored Web Awesome wiring and CSS tokens; use manual Chrome checks for Shadow DOM, keyboard, focus, theme, responsive, and DnD behavior that Node tests cannot observe.

**Tech Stack:** Native ES modules, native DOM APIs, Web Awesome 3.10.0 vendored under `vendor/webawesome`, Node `node:test`, Chrome Manifest V3, CSS custom properties.

---

## File map and boundaries

- Modify `/Users/zhaoshe/code/ZipTab/src/manager.js` only for Web Awesome imports/base-path setup, migrated control markup/rendering, and corresponding delegated event handling. Do not refactor unrelated manager code.
- Modify `/Users/zhaoshe/code/ZipTab/manager.html` for local Web Awesome stylesheet links and migrated manager control markup only.
- Modify `/Users/zhaoshe/code/ZipTab/src/styles.css` for Web Awesome token overrides and the two Phase 3 visual fixes. Keep local ZipTab styling authoritative.
- Create or extend `/Users/zhaoshe/code/ZipTab/tests/webawesome-phase4.test.mjs` for static dependency, event-contract, DnD-invariant, and path-containment assertions.
- Modify `/Users/zhaoshe/code/ZipTab/src/popup.css` and `/Users/zhaoshe/code/ZipTab/src/options.css` only for Phase 5 semantic token/radius/control-height changes.
- Create `/Users/zhaoshe/code/ZipTab/tests/popup-options-theme.test.mjs` for Phase 5 source-contract assertions.
- Extend `/Users/zhaoshe/code/ZipTab/docs/nord-ui-redesign.md`, `/Users/zhaoshe/code/ZipTab/docs/technical-architecture.md`, `/Users/zhaoshe/code/ZipTab/docs/project-overview.md`, `/Users/zhaoshe/code/ZipTab/README.md`, `/Users/zhaoshe/code/ZipTab/docs/feature-evolution.md`, and `/Users/zhaoshe/code/ZipTab/docs/product-decisions.md` only after production and test work is green.
- Do not modify `/Users/zhaoshe/code/ZipTab/src/icons.js`, popup structure, options structure, DnD object hierarchy, session-card semantics, or the vendor bundle unless a checksum/path test proves the vendored graph itself is broken.

---

## Phase 3: Correct the existing board/session surface

### Task 1: Lock the two reported Phase 3 regressions with failing tests

**Files:**
- Test: `/Users/zhaoshe/code/ZipTab/tests/manager-view.test.mjs` if existing source-level geometry helpers are exposed there; otherwise create `/Users/zhaoshe/code/ZipTab/tests/nord-phase3-regressions.test.mjs`.
- Read-only reference: `/Users/zhaoshe/code/ZipTab/src/manager.js`, `/Users/zhaoshe/code/ZipTab/src/styles.css`.

- [ ] **Step 1: Add a source-contract test for the drag-image dimensions.** Assert that the `setGroupDragImage` implementation reads the source rectangle and assigns both `clone.style.width` and `clone.style.height` from `rect.width` and `rect.height`, and resets any minimum height that could preserve `.group-card { height: 100% }`.

```js
assert.match(managerSource, /const rect = .*getBoundingClientRect\(\)/);
assert.match(managerSource, /clone\.style\.width\s*=\s*`\$\{rect\.width\}px`/);
assert.match(managerSource, /clone\.style\.height\s*=\s*`\$\{rect\.height\}px`/);
assert.match(managerSource, /clone\.style\.minHeight\s*=\s*['\"]0/);
```

- [ ] **Step 2: Add a CSS contract test for the transparent category-section override.** Assert that the later board override contains `box-shadow: none`, not merely border/background resets.

```js
const boardOverride = stylesSource.slice(stylesSource.lastIndexOf('.category-section'));
assert.match(boardOverride, /box-shadow\s*:\s*none/);
```

- [ ] **Step 3: Run only the new regression test and confirm it fails.**

Run: `node --test tests/nord-phase3-regressions.test.mjs`

Expected: FAIL because the current drag-image helper does not set clone height/min-height and the later category-section override does not clear the old shadow.

### Task 2: Apply the smallest Phase 3 production fixes

**Files:**
- Modify: `/Users/zhaoshe/code/ZipTab/src/manager.js` near `setGroupDragImage()`.
- Modify: `/Users/zhaoshe/code/ZipTab/src/styles.css` in the later transparent `.category-section` board override.

- [ ] **Step 1: Set the cloned group drag image to the source dimensions before `setDragImage()`.** Preserve the current clone, append, and cleanup flow. Add only:

```js
const rect = source.getBoundingClientRect();
clone.style.width = `${rect.width}px`;
clone.style.height = `${rect.height}px`;
clone.style.minHeight = '0';
```

Use the existing source element variable and existing `setDragImage` call; do not alter DnD attributes or the drag target hierarchy.

- [ ] **Step 2: Clear the stale category-section shadow in the later board override.** Add:

```css
box-shadow: none;
```

Do not change the earlier reusable category-section rule because the later override is the correct scope for the transparent board surface.

- [ ] **Step 3: Run the focused regression test and the existing manager tests.**

Run: `node --test tests/nord-phase3-regressions.test.mjs tests/manager-view.test.mjs`

Expected: PASS.

- [ ] **Step 4: Run `git diff --check`.**

Expected: no output and exit code 0.

- [ ] **Step 5: Commit this isolated fix if committing is requested.**

```bash
git add src/manager.js src/styles.css tests/nord-phase3-regressions.test.mjs
git commit -m "fix: correct Nord board drag preview sizing"
```

---

## Phase 4: Migrate manager controls in independent family slices

### Task 3: Add the local Web Awesome dependency baseline

**Files:**
- Test: extend `/Users/zhaoshe/code/ZipTab/tests/webawesome-phase0.test.mjs` or create `/Users/zhaoshe/code/ZipTab/tests/webawesome-phase4.test.mjs`.
- Modify: `/Users/zhaoshe/code/ZipTab/manager.html`.
- Modify: `/Users/zhaoshe/code/ZipTab/src/manager.js`.
- Modify: `/Users/zhaoshe/code/ZipTab/src/styles.css`.

- [ ] **Step 1: Write failing static-contract assertions before production edits.** Cover local styles, imports, base path, and no remote references:

```js
assert.match(managerHtml, /vendor\/webawesome\/dist\/styles\/webawesome\.css/);
assert.match(managerHtml, /vendor\/webawesome\/dist\/styles\/themes\/awesome\.css/);
assert.doesNotMatch(managerHtml, /https?:\/\//);
assert.match(managerSource, /setBasePath\(new URL\("\.\.\/vendor\/webawesome\/dist\/", import\.meta\.url\)\.href\)/);
assert.match(managerSource, /components\/input\/input\.js/);
assert.match(managerSource, /components\/select\/select\.js/);
assert.match(managerSource, /components\/option\/option\.js/);
assert.match(managerSource, /components\/dropdown\/dropdown\.js/);
assert.match(managerSource, /components\/dropdown-item\/dropdown-item\.js/);
```

Also retain assertions for vendored module/CSS graph containment and absence of `wa-card`.

- [ ] **Step 2: Run the focused test and confirm it fails.**

Run: `node --test tests/webawesome-phase4.test.mjs`

Expected: FAIL because the manager does not yet load the complete selected-slice dependency baseline.

- [ ] **Step 3: Add local styles before ZipTab styles.** In `/Users/zhaoshe/code/ZipTab/manager.html`, use this order:

```html
<link rel="stylesheet" href="vendor/webawesome/dist/styles/webawesome.css" />
<link rel="stylesheet" href="vendor/webawesome/dist/styles/themes/awesome.css" />
<link rel="stylesheet" href="src/styles.css" />
```

- [ ] **Step 4: Add only the selected-slice static imports and base path.** Near the existing manager imports, add:

```js
import { setBasePath } from "../vendor/webawesome/dist/webawesome.js";
import "../vendor/webawesome/dist/components/input/input.js";
import "../vendor/webawesome/dist/components/select/select.js";
import "../vendor/webawesome/dist/components/option/option.js";
import "../vendor/webawesome/dist/components/dropdown/dropdown.js";
import "../vendor/webawesome/dist/components/dropdown-item/dropdown-item.js";

setBasePath(new URL("../vendor/webawesome/dist/", import.meta.url).href);
```

Do not import `button/button.js`, `dialog/dialog.js`, or `tooltip/tooltip.js` in this baseline task; each belongs to its own later slice.

- [ ] **Step 5: Override Web Awesome tokens in the existing `--wa-*` section.** Map color, typography, focus, radius, and surface variables to existing `--zt-*` values while retaining the system UI font. Do not add a second adapter stylesheet.

- [ ] **Step 6: Run the focused Web Awesome test and full existing tests.**

Run: `node --test tests/webawesome-phase4.test.mjs && npm test && npm run check`

Expected: PASS.

### Task 4: Migrate manager search inputs only

**Files:**
- Test: `/Users/zhaoshe/code/ZipTab/tests/webawesome-phase4.test.mjs`.
- Modify: `/Users/zhaoshe/code/ZipTab/manager.html` and `/Users/zhaoshe/code/ZipTab/src/manager.js` only where `#searchInput` and `#openTabsFilterInput` are rendered/read.
- Modify: `/Users/zhaoshe/code/ZipTab/src/styles.css` for `wa-input` host sizing/focus styling if needed.

- [ ] **Step 1: Add failing assertions for both IDs and unchanged direct value reads.**

```js
assert.match(managerHtml, /<wa-input[^>]+id="searchInput"/);
assert.match(managerHtml, /<wa-input[^>]+id="openTabsFilterInput"/);
assert.match(managerSource, /getElementById\(['"]searchInput['"]\)/);
assert.match(managerSource, /getElementById\(['"]openTabsFilterInput['"]\)/);
assert.match(managerSource, /searchInput\.value/);
assert.match(managerSource, /openTabsFilterInput\.value/);
```

- [ ] **Step 2: Run the focused test and confirm it fails.**

Run: `node --test tests/webawesome-phase4.test.mjs`

Expected: FAIL because both controls are still native inputs.

- [ ] **Step 3: Replace only the two manager search controls with `wa-input`.** Preserve IDs, labels/accessible names, `value`, placeholders, and existing `input` listeners. Do not change any handler or search state shape.

```html
<wa-input id="searchInput" ...></wa-input>
<wa-input id="openTabsFilterInput" ...></wa-input>
```

- [ ] **Step 4: Add the minimum host CSS required for the existing dimensions and focus ring.** Keep the existing `--zt-*` token values and do not replace the centralized tooltip service.

- [ ] **Step 5: Run tests and the manager smoke check.**

Run: `node --test tests/webawesome-phase4.test.mjs tests/manager-view.test.mjs && npm run check`

Expected: PASS.

### Task 5: Migrate the window selector

**Files:**
- Test: `/Users/zhaoshe/code/ZipTab/tests/webawesome-phase4.test.mjs`.
- Modify: `/Users/zhaoshe/code/ZipTab/manager.html` or manager render source containing `#windowSelect`.
- Modify: `/Users/zhaoshe/code/ZipTab/src/manager.js` only for selector markup and delegated change handling.
- Modify: `/Users/zhaoshe/code/ZipTab/src/styles.css` only for select host styling.

- [ ] **Step 1: Add failing assertions for `wa-select`, `wa-option`, preserved ID/state, and custom-element value reads.**

```js
assert.match(managerSource, /<wa-select[^>]+id="windowSelect"/);
assert.match(managerSource, /<wa-option/);
assert.match(managerSource, /selectedOpenWindowId/);
assert.match(managerSource, /windowSelect\.value/);
assert.doesNotMatch(managerSource, /HTMLSelectElement/);
```

- [ ] **Step 2: Run the focused test and confirm it fails.**

Run: `node --test tests/webawesome-phase4.test.mjs`

Expected: FAIL while the native select remains.

- [ ] **Step 3: Replace the native select and options with `wa-select`/`wa-option`.** Preserve generated display labels, accessible label text, current value, and disabled state. Keep the same element ID.

- [ ] **Step 4: Update the delegated change handler to read the custom element target’s `.value`.** Continue consuming the composed native `change` event; do not assume `event.detail` for this control.

- [ ] **Step 5: Run manager tests and the full check.**

Run: `node --test tests/webawesome-phase4.test.mjs tests/manager-view.test.mjs && npm run check`

Expected: PASS.

### Task 6: Migrate the workspace dropdown

**Files:**
- Test: `/Users/zhaoshe/code/ZipTab/tests/webawesome-phase4.test.mjs`.
- Modify: `/Users/zhaoshe/code/ZipTab/manager.html` or workspace render source in `/Users/zhaoshe/code/ZipTab/src/manager.js`.
- Modify: `/Users/zhaoshe/code/ZipTab/src/manager.js` for workspace selection event handling and removal of details-specific logic only for this migrated menu.
- Modify: `/Users/zhaoshe/code/ZipTab/src/styles.css` for dropdown host/item appearance.

- [ ] **Step 1: Add failing assertions for `wa-dropdown`, `wa-dropdown-item`, event detail consumption, and no details-specific workspace menu.**

```js
assert.match(managerSource, /<wa-dropdown/);
assert.match(managerSource, /<wa-dropdown-item/);
assert.match(managerSource, /event\.detail\.item/);
assert.doesNotMatch(workspaceMenuSource, /HTMLDetailsElement/);
```

- [ ] **Step 2: Run the focused test and confirm it fails.**

Run: `node --test tests/webawesome-phase4.test.mjs`

Expected: FAIL because workspace actions still use `details`/`summary`.

- [ ] **Step 3: Replace the workspace menu wrapper/items with `wa-dropdown`/`wa-dropdown-item` while leaving its trigger as the existing native button.** Preserve workspace IDs, labels, disabled states, and action values.

- [ ] **Step 4: Consume the composed Web Awesome selection event through `event.detail.item`.** Route the selected item into the existing workspace action callback; do not create a second state machine.

- [ ] **Step 5: Remove only workspace-menu use of `open`, `handleActionMenuToggle`, positioning, and dismissal assumptions.** Do not remove shared details helpers until session/window menus have also migrated.

- [ ] **Step 6: Run tests and check.**

Run: `node --test tests/webawesome-phase4.test.mjs tests/manager-view.test.mjs && npm run check`

Expected: PASS.

### Task 7: Migrate session and window action menus

**Files:**
- Test: `/Users/zhaoshe/code/ZipTab/tests/webawesome-phase4.test.mjs`.
- Modify: `/Users/zhaoshe/code/ZipTab/src/manager.js` action-menu renderers and delegated selection handling.
- Modify: `/Users/zhaoshe/code/ZipTab/src/styles.css` action-menu styling.
- Do not modify DnD render structure beyond placing the dropdown inside existing action areas.

- [ ] **Step 1: Add failing assertions for all migrated action menus and absence of details-specific helpers after migration.**

```js
assert.match(managerSource, /<wa-dropdown/);
assert.match(managerSource, /<wa-dropdown-item/);
assert.match(managerSource, /event\.detail\.item/);
assert.doesNotMatch(managerSource, /handleActionMenuToggle/);
assert.doesNotMatch(managerSource, /positionActionMenu/);
assert.doesNotMatch(managerSource, /resetActionMenuPanel/);
assert.doesNotMatch(managerSource, /closeActionMenus/);
```

Retain a separate assertion that the custom open-tab context menu remains native.

- [ ] **Step 2: Run the focused test and confirm it fails.**

Run: `node --test tests/webawesome-phase4.test.mjs`

Expected: FAIL while session/window action menus still depend on `HTMLDetailsElement`.

- [ ] **Step 3: Replace session and window action menu markup with `wa-dropdown` and `wa-dropdown-item`.** Keep native trigger buttons, action IDs/values, disabled states, and action callbacks. Keep each dropdown inside the existing non-draggable action area so `.group-card`, `.tab-row`, `.active-tab-row`, category rows, and drop slots remain unchanged.

- [ ] **Step 4: Route `event.detail.item` to the existing action dispatcher.** Preserve menu close behavior supplied by Web Awesome; do not manually toggle `open` or reposition panels.

- [ ] **Step 5: Delete the now-unused details-specific helpers and listeners.** Delete only code proven unused after the workspace/session/window migration. Keep native open-tab context-menu code and any native dialog code until Task 8.

- [ ] **Step 6: Add source assertions for required DnD markers.** Ensure the migration did not remove or wrap the draggable objects:

```js
for (const marker of [
  'data-drag-kind="category"',
  'data-drop="category-column"',
  'data-drag-kind="group"',
  'data-drag-kind="tab"',
  'data-drag-kind="open-tab"'
]) assert.match(managerSource, new RegExp(marker));
```

- [ ] **Step 7: Run the complete Node test/check set.**

Run: `npm test && npm run check && git diff --check`

Expected: all tests/checks pass.

### Task 8: Migrate the shared modal as an isolated dialog slice

**Files:**
- Test: `/Users/zhaoshe/code/ZipTab/tests/webawesome-phase4.test.mjs`.
- Modify: `/Users/zhaoshe/code/ZipTab/manager.html` or modal render source.
- Modify: `/Users/zhaoshe/code/ZipTab/src/manager.js`.
- Modify: `/Users/zhaoshe/code/ZipTab/src/styles.css`.

- [ ] **Step 1: Add the dialog import and failing behavior-contract assertions.**

```js
assert.match(managerSource, /components\/dialog\/dialog\.js/);
assert.match(managerSource, /\.show\(\)/);
assert.match(managerSource, /\.hide\(\)/);
assert.doesNotMatch(managerSource, /\.showModal\(\)/);
assert.doesNotMatch(managerSource, /form[^\n]*method=["']dialog/);
```

Also assert the existing import/export/bin/search callbacks and Escape/focus-restoration paths remain referenced.

- [ ] **Step 2: Run the focused test and confirm it fails.**

Run: `node --test tests/webawesome-phase4.test.mjs`

Expected: FAIL while the shared modal is native `dialog`-based.

- [ ] **Step 3: Import the local dialog module.** Add only:

```js
import "../vendor/webawesome/dist/components/dialog/dialog.js";
```

- [ ] **Step 4: Replace the shared modal element with `wa-dialog`.** Preserve its stable ID, title/content slots, action button IDs, and form fields. Replace `form method="dialog"` behavior with explicit existing callbacks.

- [ ] **Step 5: Replace native open/close calls with `show()`/`hide()`.** Preserve Escape handling, close behavior, action callbacks, focus restoration, and all import/export/bin/search flows. Do not add a second modal abstraction.

- [ ] **Step 6: Run all tests/checks.**

Run: `npm test && npm run check && git diff --check`

Expected: PASS.

### Task 9: Phase 4 browser regression gate

**Files:**
- No production edits unless a failure is found.
- Optional test updates: `/Users/zhaoshe/code/ZipTab/tests/webawesome-phase4.test.mjs` only for a confirmed static regression.

- [ ] **Step 1: Load the unpacked extension in Chrome from a clean profile or existing test profile.** Do not repeatedly relaunch if the GUI attempt exceeds the five-second external-software limit; stop and request user assistance.

- [ ] **Step 2: Verify manager keyboard and focus behavior.** Check search inputs, window select, workspace/session/window menus, dialog open/close, Escape, disabled menu items, and focus returning to the trigger.

- [ ] **Step 3: Verify light, dark, and system themes.** Confirm Web Awesome defaults do not leak typography, colors, radius, focus, or surface styles over `--zt-*` tokens.

- [ ] **Step 4: Verify DnD flows manually.** Test session reorder within a category, session move across categories, one saved tab into a session, multiple selected open tabs into a session, and multiple selected tabs into a new-session insertion point. Confirm drag previews are source-sized and controls never become draggable objects.

- [ ] **Step 5: Record failures as production/test tasks before moving to Phase 5.** Do not proceed on a red gate.

---

## Phase 5: Apply page-local Popup and Options theme contract

### Task 10: Add failing Phase 5 CSS/source-contract tests

**Files:**
- Create: `/Users/zhaoshe/code/ZipTab/tests/popup-options-theme.test.mjs`.
- Read-only references: `/Users/zhaoshe/code/ZipTab/popup.html`, `/Users/zhaoshe/code/ZipTab/options.html`, `/Users/zhaoshe/code/ZipTab/src/popup.css`, `/Users/zhaoshe/code/ZipTab/src/options.css`.

- [ ] **Step 1: Assert Popup primary action and shared radius tokens.**

```js
assert.match(popupCss, /--zt-accent-solid/);
assert.match(popupCss, /--zt-on-accent/);
assert.match(popupCss, /--radius-control/);
assert.match(popupCss, /--zt-surface-raised|--zt-surface-subtle/);
assert.match(popupCss, /--zt-border-subtle/);
```

- [ ] **Step 2: Assert Options semantic tokens and control dimensions.**

```js
assert.match(optionsCss, /--zt-border-subtle|--zt-border-control/);
assert.match(optionsCss, /--zt-surface-raised/);
assert.match(optionsCss, /--zt-surface-subtle/);
assert.match(optionsCss, /--zt-accent-solid/);
assert.match(optionsCss, /--zt-on-accent/);
assert.match(optionsCss, /40px/);
assert.match(optionsCss, /--radius-control/);
```

- [ ] **Step 3: Assert information architecture and deliberate no-migration scope.**

```js
assert.match(popupHtml, /id="popupActions"/);
assert.match(popupHtml, /id="popupSearch"/);
assert.match(popupHtml, /id="popupSessionList"/);
assert.match(optionsHtml, /id="basicSettingsGrid"/);
assert.match(optionsHtml, /id="advancedSettingsGrid"/);
assert.doesNotMatch(popupHtml, /wa-card|https?:\/\//);
assert.doesNotMatch(optionsHtml, /wa-card|https?:\/\//);
```

- [ ] **Step 4: Run the new test and confirm it fails against legacy aliases/values.**

Run: `node --test tests/popup-options-theme.test.mjs`

Expected: FAIL until the page-local CSS is updated.

### Task 11: Update Popup CSS without changing structure or behavior

**Files:**
- Modify: `/Users/zhaoshe/code/ZipTab/src/popup.css`.

- [ ] **Step 1: Replace quick-action filled colors.** Change `var(--accent)` to `var(--zt-accent-solid)` and `white` to `var(--zt-on-accent)` only in the quick-action rule.

- [ ] **Step 2: Replace page-local surface/border aliases.** Use `--zt-surface-raised`, `--zt-surface-subtle`, and `--zt-border-subtle` in the popup surface, row, and control rules that are being touched.

- [ ] **Step 3: Normalize control radii.** Set the quick-action button and shared search control to `var(--radius-control)` instead of `12px` and `8px`.

- [ ] **Step 4: Preserve existing preview behavior and five-session limit.** Do not alter `/Users/zhaoshe/code/ZipTab/src/popup.js`, the popup IDs, row actions, or session slicing.

- [ ] **Step 5: Run the focused test.**

Run: `node --test tests/popup-options-theme.test.mjs`

Expected: PASS for Popup assertions.

### Task 12: Update Options CSS without changing settings behavior

**Files:**
- Modify: `/Users/zhaoshe/code/ZipTab/src/options.css`.

- [ ] **Step 1: Replace touched legacy aliases.** Map `--line` to `--zt-border-subtle` or `--zt-border-control`, `--surface` to `--zt-surface-raised`, `--surface-2` to `--zt-surface-subtle`, and `--accent` to `--zt-accent-solid`.

- [ ] **Step 2: Set settings card radius inside the 10–12px contract.** Prefer the existing shared radius token if available; otherwise use the smallest existing contract value, `10px`.

- [ ] **Step 3: Set checkbox rows and segmented controls to `40px` height.** Keep Basic/Advanced grouping and all setting keys unchanged.

- [ ] **Step 4: Set segmented controls to `var(--radius-control)` and active colors to `var(--zt-accent-solid)`/`var(--zt-on-accent)`.** Remove the 14% accent mix only from the active segmented option.

- [ ] **Step 5: Run all Phase 5 and existing tests/checks.**

Run: `node --test tests/popup-options-theme.test.mjs && npm test && npm run check && git diff --check`

Expected: PASS.

### Task 13: Phase 5 browser regression gate

**Files:**
- No production edits unless a browser failure is observed.

- [ ] **Step 1: Verify Popup behavior manually.** Confirm Save/Open/Dedupe, Settings, search, five recent sessions, Restore, Delete, disabled states, and preview behavior.

- [ ] **Step 2: Verify Options behavior manually.** Confirm Basic and Advanced sections, every current setting key, checkbox rows, segmented controls, keyboard focus, and persistence.

- [ ] **Step 3: Check Popup and Options in light/dark/system themes.** Confirm semantic surfaces, borders, active controls, and contrast remain consistent.

- [ ] **Step 4: Stop if the page needs shared button/tooltip migration.** Do not add `wa-button` or `wa-tooltip` here; defer that work until a separately scoped shared `src/icons.js` migration is approved.

---

## Phase 6: Documentation, status, and final verification closure

### Task 14: Reconcile redesign status and architecture documentation

**Files:**
- Modify: `/Users/zhaoshe/code/ZipTab/docs/nord-ui-redesign.md`.
- Modify: `/Users/zhaoshe/code/ZipTab/docs/technical-architecture.md`.
- Modify: `/Users/zhaoshe/code/ZipTab/docs/project-overview.md`.
- Modify: `/Users/zhaoshe/code/ZipTab/README.md`.
- Modify: `/Users/zhaoshe/code/ZipTab/docs/feature-evolution.md`.
- Modify: `/Users/zhaoshe/code/ZipTab/docs/product-decisions.md`.
- Reference: `/Users/zhaoshe/code/ZipTab/progress.md`, `/Users/zhaoshe/code/ZipTab/task_plan.md`.

- [ ] **Step 1: Update `docs/nord-ui-redesign.md` status from the actual completed gates.** Mark Phase 0 and Phases 1–3 accurately, add Phase 3 progress, record Phase 4 family slices and browser gate, record Phase 5 page-local CSS gate, and add Phase 6 verification results. Do not mark a phase complete if its manual gate is still unverified.

- [ ] **Step 2: Document local Web Awesome delivery in `docs/technical-architecture.md`.** State that Web Awesome 3.10.0 is vendored under `vendor/webawesome`, loaded through local static imports and local CSS, configured with `setBasePath`, and covered by path/checksum/dependency-graph checks. State which control families remain native and why.

- [ ] **Step 3: Correct the layout terminology in `docs/project-overview.md`.** Replace “session grid” with the current horizontal session track language without changing product claims.

- [ ] **Step 4: Expand the README verification commands.** Include:

```sh
npm test
npm run check
git diff --check
```

Keep the existing install/verification instructions intact.

- [ ] **Step 5: Add a concise feature-evolution entry for the completed Phase 3–5 decisions.** Cover the smallest-safe Web Awesome migration, preserved native DnD/menu boundaries, and page-local Popup/Options token alignment.

- [ ] **Step 6: Add a product decision for local-only Web Awesome self-hosting if this is final direction.** Record the tradeoff: CSP-safe/offline deterministic delivery and checksumability versus vendored update maintenance and bundle size. Do not add a decision if the product direction remains explicitly provisional; record it as an open decision instead.

- [ ] **Step 7: Run documentation checks.**

Run: `git diff --check && npm run check`

Expected: PASS.

### Task 15: Close the Phase 6 verification gates

**Files:**
- Optional test updates: `/Users/zhaoshe/code/ZipTab/tests/webawesome-phase4.test.mjs`, `/Users/zhaoshe/code/ZipTab/tests/popup-options-theme.test.mjs` only when a repeatable static regression is identified.
- Status updates: `/Users/zhaoshe/code/ZipTab/docs/nord-ui-redesign.md`.

- [ ] **Step 1: Run the complete automated suite.**

Run: `npm test && npm run check && git diff --check`

Expected: 100% pass for the repository’s current test/check commands; do not claim 80% coverage from source-contract tests alone unless a coverage tool exists and reports it.

- [ ] **Step 2: Perform the browser matrix once, without repeated relaunches.** Check light/dark/system themes, keyboard navigation, Escape, focus restoration, disabled states, screen-reader-visible names, DnD flows, responsive widths, 200% zoom, reduced motion, and special URL capture/restore behavior.

- [ ] **Step 3: Perform contrast and accessibility checks on rendered controls.** Use actual rendered colors, not only token presence. Record any contrast failure with selector and theme in the redesign status document.

- [ ] **Step 4: Explicitly assess keyboard category reordering.** If no keyboard move path exists, do not invent one during Phase 6. Record it as an accessibility follow-up with a separate scope; only mark Phase 6 complete if the acceptance criteria do not require it.

- [ ] **Step 5: Verify repository completeness before claiming done.** Review `git status --short` and `git diff --stat`; ensure intended vendor files, fixtures, tests, and planning documents are not accidentally omitted from the change set. Do not use reset/checkout to remove unrelated user changes.

### Task 16: Final review and handoff

**Files:**
- All changed production, test, and documentation files.

- [ ] **Step 1: Review the full diff against `main`, not only the latest commit.**

Run: `git diff main...HEAD` and `git status --short`

Check that no global button/tooltip migration, `wa-card`, remote asset, DnD wrapper, product behavior change, or new runtime dependency slipped in.

- [ ] **Step 2: Run a focused security/CSP review.** Confirm no remote Web Awesome imports/fonts/assets, no new unsafe HTML interpolation, no changed Chrome permission boundary, and no special-URL restriction regression.

- [ ] **Step 3: Run the final verification commands.**

```bash
npm test
npm run check
git diff --check
```

Expected: all pass.

- [ ] **Step 4: Update status only after all automated and manual gates are complete.** Mark each phase as `Complete`, `Partial`, or `Blocked` with a one-line reason and link/reference to the verification evidence.

- [ ] **Step 5: Commit by coherent slice if requested.** Recommended commit boundaries:

```bash
git commit -m "fix: correct Nord board drag preview sizing"
git commit -m "feat: migrate manager inputs and window selector"
git commit -m "feat: migrate manager action menus and dialog"
git commit -m "style: align popup and options with Nord tokens"
git commit -m "docs: close Nord redesign verification"
```

Do not commit unrelated pre-existing working-tree changes.

---

## Deliberate exclusions

- No global `wa-button` or `wa-tooltip` migration in Phases 3–6; shared `src/icons.js` affects Manager, Popup, and Options and needs its own TDD/browser scope.
- No `wa-checkbox`, `wa-radio`, `wa-switch`, `wa-badge`, `wa-callout`, `wa-spinner`, `wa-card`, or `wa-icon` migration.
- No replacement of the native open-tab context menu.
- No DnD hierarchy or data-attribute changes.
- No product-information-architecture changes in Popup or Options.
- No new browser harness or runtime dependency unless static contracts cannot verify a demonstrated regression.
