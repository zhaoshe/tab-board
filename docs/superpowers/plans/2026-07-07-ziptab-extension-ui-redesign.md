# ZipTab Extension UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild ZipTab into a manager-first Chrome extension workbench with a clearer new-tab manager, lighter popup, simpler options page, and unified feedback/accessibility behavior.

**Architecture:** Keep product data in the existing `model.js`/`store.js` flow and move the new UI decision logic into small pure helper modules so it can be tested with `node:test` before any DOM work lands. Manager remains the main workbench, popup becomes a single-purpose trigger surface, and options becomes a two-tier configuration page with Basic and Advanced sections.

**Tech Stack:** Native HTML, CSS, ES modules, Chrome MV3 APIs, `node:test`, `assert/strict`.

---

## Scope Check

This spec stays within one coherent subsystem: Chrome extension UI structure and interaction rules for manager, popup, and options. It does **not** need decomposition into separate specs because the same information architecture decision (`Popup = trigger`, `Manager = workbench`, `Options = configuration`) drives every file in scope.

## File Structure

**Create**
- `src/manager-view.js` — pure helper functions for manager context strip items, inspector model, and low-noise session action layout.
- `src/popup-view.js` — pure helper functions for popup CTA labels, recent-session list capping, and empty-state copy.
- `src/options-view.js` — pure helper functions that group settings into Basic and Advanced sections.
- `src/feedback-copy.js` — shared success/error/empty-state message builders used by manager, popup, and options.
- `tests/manager-view.test.mjs` — unit tests for manager view helpers.
- `tests/popup-view.test.mjs` — unit tests for popup view helpers.
- `tests/options-view.test.mjs` — unit tests for options section helpers.
- `tests/feedback-copy.test.mjs` — unit tests for shared feedback copy.

**Modify**
- `manager.html` — add command bar structure, context strip mount, and inspector mount.
- `src/manager.js` — wire focused session state, context strip rendering, inspector rendering, lower-noise card actions, and shared feedback copy.
- `src/styles.css` — add command bar, context strip, session board, inspector, focus-visible, and status-state styling.
- `popup.html` — rename CTA copy, add popup feedback node, and tighten recent-session layout.
- `src/popup.js` — use popup view helpers, shared feedback copy, and clearer empty-state behavior.
- `src/popup.css` — rebalance popup density around one primary action and a short recent list.
- `options.html` — add Basic/Advanced framing.
- `src/options.js` — render Basic/Advanced sections and use shared feedback copy.
- `src/options.css` — style section grouping and advanced affordances.
- `docs/feature-spec.md` — document popup/manager/options behavior changes.
- `docs/technical-architecture.md` — document helper modules and inspector/context-strip responsibilities.
- `docs/feature-evolution.md` — record the redesign decision and shipped behavior change.
- `docs/product-decisions.md` — record the tradeoff of manager-first redesign versus growing popup complexity.

---

### Task 1: Build manager view-model helpers and inspector shell

**Files:**
- Create: `src/manager-view.js`
- Create: `tests/manager-view.test.mjs`
- Modify: `manager.html`
- Modify: `src/manager.js`
- Modify: `src/styles.css`

- [ ] **Step 1: Write the failing test**

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContextStripItems,
  buildInspectorModel,
  getSessionActionLayout
} from "../src/manager-view.js";

test("builds context strip chips from active workspace state", () => {
  const items = buildContextStripItems({
    workspaceName: "Work",
    categoryLabel: "Starred",
    searchQuery: "oauth",
    openTabTitle: "Chrome Docs"
  });

  assert.deepEqual(items, [
    { kind: "workspace", label: "Work" },
    { kind: "category", label: "Starred" },
    { kind: "search", label: "Search: oauth" },
    { kind: "open-tab", label: "Filtered by tab: Chrome Docs" }
  ]);
});

test("returns empty inspector state before a session is focused", () => {
  assert.deepEqual(
    buildInspectorModel({ group: null, categoryLabel: "Inbox", restorableCount: 0 }),
    {
      state: "empty",
      title: "Pick a session",
      message: "Select a session to inspect, edit, and restore it."
    }
  );
});

test("keeps only restore visible outside the card chrome", () => {
  assert.deepEqual(getSessionActionLayout(3), {
    external: ["restore"],
    menu: ["rename", "note", "lock", "copy", "delete"]
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/manager-view.test.mjs`
Expected: FAIL with `Cannot find module '../src/manager-view.js'` or missing export errors.

- [ ] **Step 3: Write minimal implementation**

Create `src/manager-view.js`:

```javascript
export function buildContextStripItems({ workspaceName, categoryLabel, searchQuery, openTabTitle }) {
  const items = [];
  if (workspaceName) {
    items.push({ kind: "workspace", label: workspaceName });
  }
  if (categoryLabel) {
    items.push({ kind: "category", label: categoryLabel });
  }
  if (searchQuery) {
    items.push({ kind: "search", label: `Search: ${searchQuery}` });
  }
  if (openTabTitle) {
    items.push({ kind: "open-tab", label: `Filtered by tab: ${openTabTitle}` });
  }
  return items;
}

export function buildInspectorModel({ group, categoryLabel, restorableCount }) {
  if (!group) {
    return {
      state: "empty",
      title: "Pick a session",
      message: "Select a session to inspect, edit, and restore it."
    };
  }

  return {
    state: "ready",
    title: group.title,
    note: group.note || "",
    restorableCount,
    categoryLabel: categoryLabel || "Inbox",
    locked: Boolean(group.locked),
    groupId: group.id
  };
}

export function getSessionActionLayout(restorableCount) {
  return {
    external: restorableCount ? ["restore"] : [],
    menu: ["rename", "note", "lock", "copy", "delete"]
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/manager-view.test.mjs`
Expected: PASS

- [ ] **Step 5: Add manager shell structure**

Update `manager.html` so the workbench has a command bar, context strip, board, and inspector mount:

```html
<main class="workspace">
  <header class="workspace-command-bar">
    <div class="workspace-top-row">
      <div class="workspace-heading">
        <p class="eyebrow">Workspace</p>
        <div class="workspace-switcher">
          <select id="workspaceSelect" data-action="switch-workspace" aria-label="Switch workspace"></select>
          <button type="button" class="small-button" data-icon="plus" data-action="create-workspace" aria-label="New workspace"></button>
          <button type="button" class="small-button" data-icon="edit-3" data-action="rename-workspace" aria-label="Rename workspace"></button>
        </div>
      </div>
      <div id="headerActions" class="header-actions"></div>
    </div>

    <label class="search-box workspace-search">
      <span class="visually-hidden">Search sessions</span>
      <input id="searchInput" type="search" autocomplete="off" placeholder="Search sessions, notes, and links" />
    </label>

    <div id="contextStrip" class="context-strip" aria-live="polite"></div>
  </header>

  <section class="workspace-main-shell">
    <section id="groupsList" class="groups-list category-sections" data-drop="new-group" aria-label="Saved tab groups"></section>
    <aside id="inspectorPanel" class="inspector-panel" aria-labelledby="inspectorTitle"></aside>
  </section>
</main>
```

- [ ] **Step 6: Wire manager rendering to the new helper module**

Update `src/manager.js` with focused-group state, context-strip rendering, and inspector rendering:

```javascript
import {
  buildContextStripItems,
  buildInspectorModel,
  getSessionActionLayout
} from "./manager-view.js";

const els = {
  // existing nodes...
  contextStrip: document.querySelector("#contextStrip"),
  inspectorPanel: document.querySelector("#inspectorPanel")
};

let focusedGroupId = "";

function render() {
  ensureFocusedGroup();
  renderWorkspaceSwitcher();
  renderStats();
  renderHeaderActions();
  renderContextStrip();
  renderActiveTabs();
  renderFolders();
  renderGroups();
  renderInspector();
}

function renderContextStrip() {
  const activeCategory = orderedCategoryItems().find((item) => item.filter === activeFilter);
  const items = buildContextStripItems({
    workspaceName: state.workspaces.find((item) => item.id === activeWorkspaceId)?.name || "",
    categoryLabel: activeCategory?.label || "Inbox",
    searchQuery,
    openTabTitle: openTabFilter?.title || ""
  });

  els.contextStrip.replaceChildren(
    ...items.map((item) => h("span", { class: `context-chip context-chip-${item.kind}` }, item.label))
  );
}

function renderInspector() {
  const group = state.groups.find((item) => item.id === focusedGroupId) || null;
  const category = orderedCategoryItems().find((item) => item.filter === groupCategoryFilter(group || {}));
  const model = buildInspectorModel({
    group,
    categoryLabel: category?.label || "Inbox",
    restorableCount: group ? group.tabs.filter(isRestorableTab).length : 0
  });

  if (model.state === "empty") {
    els.inspectorPanel.replaceChildren(
      h("div", { class: "inspector-empty" },
        h("h2", { id: "inspectorTitle" }, model.title),
        h("p", { class: "muted" }, model.message)
      )
    );
    return;
  }

  els.inspectorPanel.replaceChildren(
    h("div", { class: "inspector-card" },
      h("h2", { id: "inspectorTitle" }, model.title),
      h("p", { class: "muted" }, `${model.restorableCount} restorable links · ${model.categoryLabel}`),
      h("div", { class: "inspector-actions" },
        iconTextButton("rotate-ccw", "Restore", { "data-action": "restore-group", "data-group-id": model.groupId }),
        iconTextButton("edit-3", "Rename", { "data-action": "rename-group", "data-group-id": model.groupId }),
        iconTextButton("sticky-note", "Edit note", { "data-action": "edit-group-note", "data-group-id": model.groupId })
      ),
      h("p", { class: "inspector-note muted" }, model.note || "No note yet")
    )
  );
}
```

- [ ] **Step 7: Update session cards and workbench styling**

Update `src/manager.js` and `src/styles.css` so cards expose fewer top-level actions and the layout becomes a 3-zone workbench:

```javascript
function renderSessionActions(group, restorableCount) {
  const layout = getSessionActionLayout(restorableCount);
  const actions = sessionActionNodes(group, restorableCount);
  const externalNodes = layout.external.flatMap((id) => [actions[id]?.external?.()].flat()).filter(Boolean);
  const menuNodes = layout.menu.flatMap((id) => [actions[id]?.menu?.()].flat()).filter(Boolean);
  return [
    ...externalNodes,
    actionMenu({ label: "More", icon: "more-horizontal", tooltip: "More session actions" }, ...menuNodes)
  ];
}
```

```css
.workspace-command-bar {
  display: grid;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}

.workspace-main-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 18px;
  align-items: start;
}

.context-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.context-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  font-size: 0.875rem;
}

.inspector-panel {
  position: sticky;
  top: 16px;
}

.icon-button:focus-visible,
button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 8: Run full tests and commit**

Run: `npm test && npm run check`
Expected: PASS

Commit:

```bash
git add manager.html src/manager.js src/styles.css src/manager-view.js tests/manager-view.test.mjs
git commit -m "feat: redesign manager workbench shell"
```

---

### Task 2: Streamline popup into a single-purpose trigger

**Files:**
- Create: `src/popup-view.js`
- Create: `tests/popup-view.test.mjs`
- Modify: `popup.html`
- Modify: `src/popup.js`
- Modify: `src/popup.css`

- [ ] **Step 1: Write the failing test**

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import { buildPopupViewModel } from "../src/popup-view.js";

test("caps recent popup sessions at five rows", () => {
  const groups = Array.from({ length: 8 }, (_, index) => ({
    id: `group_${index}`,
    title: `Group ${index}`,
    tabs: [{ itemType: "link", url: `https://example.com/${index}` }]
  }));

  const model = buildPopupViewModel({ groups, query: "" });

  assert.equal(model.groups.length, 5);
});

test("distinguishes empty library from empty search results", () => {
  assert.equal(buildPopupViewModel({ groups: [], query: "" }).emptyMessage, "No saved sessions yet");
  assert.equal(buildPopupViewModel({ groups: [], query: "oauth" }).emptyMessage, "No sessions match “oauth”");
});

test("uses explicit secondary CTA copy", () => {
  assert.equal(buildPopupViewModel({ groups: [], query: "" }).secondaryActionLabel, "Open workspace");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/popup-view.test.mjs`
Expected: FAIL with missing module/export errors.

- [ ] **Step 3: Write minimal implementation**

Create `src/popup-view.js`:

```javascript
import { groupMatchesQuery, isRestorableTab } from "./model.js";

export function buildPopupViewModel({ groups, query }) {
  const trimmedQuery = String(query || "").trim();
  const visibleGroups = groups
    .filter((group) => groupMatchesQuery(group, trimmedQuery))
    .slice(0, 5)
    .map((group) => ({
      id: group.id,
      title: group.title,
      restorableCount: group.tabs.filter(isRestorableTab).length
    }));

  return {
    primaryActionLabel: "Save window",
    secondaryActionLabel: "Open workspace",
    emptyMessage: trimmedQuery ? `No sessions match “${trimmedQuery}”` : "No saved sessions yet",
    groups: visibleGroups
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/popup-view.test.mjs`
Expected: PASS

- [ ] **Step 5: Update popup markup and feedback mount**

Update `popup.html`:

```html
<div class="popup-actions">
  <button type="button" class="primary" data-icon="archive" data-icon-text data-action="capture-current-window">Save window</button>
  <button type="button" data-icon="external-link" data-icon-text data-action="open-manager">Open workspace</button>
</div>
<label class="search-box popup-search">
  <span class="visually-hidden">Search recent sessions</span>
  <input id="popupSearch" type="search" autocomplete="off" placeholder="Search recent sessions" />
</label>
<div id="popupFeedback" class="popup-feedback" role="status" aria-live="polite"></div>
```

- [ ] **Step 6: Wire popup rendering to the new view model**

Update `src/popup.js`:

```javascript
import { buildPopupViewModel } from "./popup-view.js";
import { formatSaveFeedback, formatRestoreFeedback } from "./feedback-copy.js";

const feedbackNode = document.querySelector("#popupFeedback");

function render() {
  const model = buildPopupViewModel({ groups: state.groups, query });
  statsNode.textContent = `${collectStats(state).savedTabs} saved, ${collectStats(state).groups} sessions`;
  listNode.replaceChildren();

  if (!model.groups.length) {
    listNode.append(h("li", { class: "empty-row" }, model.emptyMessage));
    return;
  }

  for (const group of model.groups) {
    listNode.append(
      h(
        "li",
        { class: "popup-row" },
        h("span", { class: "popup-session-main" },
          h("strong", {}, group.title),
          h("small", {}, `${group.restorableCount} links`)
        ),
        group.restorableCount
          ? iconOnlyButton("rotate-ccw", "Restore session", {
              "data-action": "restore-group",
              "data-group-id": group.id
            })
          : h("span", { class: "muted" }, "No links")
      )
    );
  }
}
```

- [ ] **Step 7: Tighten popup styling and commit**

Update `src/popup.css`:

```css
.popup-shell {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.popup-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.popup-feedback {
  min-height: 20px;
  font-size: 0.875rem;
  color: var(--muted);
}
```

Run: `npm test && npm run check`
Expected: PASS

Commit:

```bash
git add popup.html src/popup.js src/popup.css src/popup-view.js tests/popup-view.test.mjs
git commit -m "feat: streamline popup quick actions"
```

---

### Task 3: Split options into Basic and Advanced sections

**Files:**
- Create: `src/options-view.js`
- Create: `tests/options-view.test.mjs`
- Modify: `options.html`
- Modify: `src/options.js`
- Modify: `src/options.css`

- [ ] **Step 1: Write the failing test**

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import { buildSettingsSections } from "../src/options-view.js";

test("places daily-use settings in the Basic section", () => {
  const sections = buildSettingsSections();
  assert.deepEqual(sections.basic.map((item) => item.key), [
    "actionClick",
    "closeTabsAfterSave",
    "openManagerAfterSave",
    "deleteRestoredTabs",
    "restoreGroupsInNewWindow",
    "restoreNextToCurrent",
    "focusRestoredTabs",
    "theme"
  ]);
});

test("keeps risky and rare settings in the Advanced section", () => {
  const sections = buildSettingsSections();
  assert.deepEqual(sections.advanced.map((item) => item.key), [
    "includePinnedTabs",
    "includeChromeUrls",
    "includeFileUrls",
    "dedupeOnSave",
    "confirmDestructive",
    "showFavicons",
    "sessionToolbar"
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/options-view.test.mjs`
Expected: FAIL with missing module/export errors.

- [ ] **Step 3: Write minimal implementation**

Create `src/options-view.js`:

```javascript
export function buildSettingsSections() {
  return {
    basic: [
      { key: "actionClick", card: "toolbar" },
      { key: "closeTabsAfterSave", card: "capture" },
      { key: "openManagerAfterSave", card: "capture" },
      { key: "deleteRestoredTabs", card: "restore" },
      { key: "restoreGroupsInNewWindow", card: "restore" },
      { key: "restoreNextToCurrent", card: "restore" },
      { key: "focusRestoredTabs", card: "restore" },
      { key: "theme", card: "interface" }
    ],
    advanced: [
      { key: "includePinnedTabs", card: "capture" },
      { key: "includeChromeUrls", card: "capture" },
      { key: "includeFileUrls", card: "capture" },
      { key: "dedupeOnSave", card: "capture" },
      { key: "confirmDestructive", card: "interface" },
      { key: "showFavicons", card: "interface" },
      { key: "sessionToolbar", card: "interface" }
    ]
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/options-view.test.mjs`
Expected: PASS

- [ ] **Step 5: Add Basic/Advanced framing to the options page**

Update `options.html`:

```html
<main class="options-shell">
  <header class="options-header">
    <div>
      <p class="eyebrow">Preferences</p>
      <h1>ZipTab Options</h1>
    </div>
    <button type="button" data-icon="external-link" data-icon-text data-action="open-manager">Open ZipTab</button>
  </header>

  <section class="options-section">
    <div class="options-section-heading">
      <h2>Basic</h2>
      <p class="muted">Daily capture, restore, and appearance settings.</p>
    </div>
    <div id="basicSettingsGrid" class="settings-grid"></div>
  </section>

  <section class="options-section options-section-advanced">
    <div class="options-section-heading">
      <h2>Advanced</h2>
      <p class="muted">Less common capture edge cases, confirmation, and toolbar tuning.</p>
    </div>
    <div id="advancedSettingsGrid" class="settings-grid"></div>
  </section>
</main>
```

- [ ] **Step 6: Render the two sections from one source of truth**

Update `src/options.js`:

```javascript
import { buildSettingsSections } from "./options-view.js";
import { formatSettingsSavedMessage } from "./feedback-copy.js";

const basicSettingsGrid = document.querySelector("#basicSettingsGrid");
const advancedSettingsGrid = document.querySelector("#advancedSettingsGrid");

function render() {
  const settings = { ...DEFAULT_SETTINGS, ...state.settings };
  const sections = buildSettingsSections();

  basicSettingsGrid.replaceChildren(
    buildToolbarCard(settings),
    buildRestoreCard(settings)
  );

  advancedSettingsGrid.replaceChildren(
    buildCaptureAdvancedCard(settings),
    buildInterfaceAdvancedCard(settings)
  );
}

function toastSaved() {
  toast(formatSettingsSavedMessage());
}
```

- [ ] **Step 7: Style the section split and commit**

Update `src/options.css`:

```css
.options-section {
  display: grid;
  gap: 12px;
  margin-bottom: 20px;
}

.options-section-heading {
  display: grid;
  gap: 4px;
}

.options-section-advanced {
  padding-top: 8px;
  border-top: 1px solid var(--line);
}
```

Run: `npm test && npm run check`
Expected: PASS

Commit:

```bash
git add options.html src/options.js src/options.css src/options-view.js tests/options-view.test.mjs
git commit -m "feat: split options into basic and advanced"
```

---

### Task 4: Unify feedback copy and accessibility rules across extension surfaces

**Files:**
- Create: `src/feedback-copy.js`
- Create: `tests/feedback-copy.test.mjs`
- Modify: `src/manager.js`
- Modify: `src/popup.js`
- Modify: `src/options.js`
- Modify: `src/styles.css`
- Modify: `src/popup.css`
- Modify: `src/options.css`

- [ ] **Step 1: Write the failing test**

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSaveFeedback,
  formatRestoreFeedback,
  formatSettingsSavedMessage
} from "../src/feedback-copy.js";

test("formats save feedback with pluralization", () => {
  assert.equal(formatSaveFeedback(1), "Saved 1 tab");
  assert.equal(formatSaveFeedback(4), "Saved 4 tabs");
});

test("formats partial restore feedback clearly", () => {
  assert.equal(
    formatRestoreFeedback({ restored: 3, failed: 1 }),
    "Restored 3 tabs · 1 failed and stayed saved"
  );
});

test("keeps settings success copy short", () => {
  assert.equal(formatSettingsSavedMessage(), "Settings saved");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/feedback-copy.test.mjs`
Expected: FAIL with missing module/export errors.

- [ ] **Step 3: Write minimal implementation**

Create `src/feedback-copy.js`:

```javascript
export function formatSaveFeedback(count) {
  return `Saved ${count} tab${count === 1 ? "" : "s"}`;
}

export function formatRestoreFeedback({ restored, failed = 0 }) {
  if (!failed) {
    return `Restored ${restored} tab${restored === 1 ? "" : "s"}`;
  }
  return `Restored ${restored} tabs · ${failed} failed and stayed saved`;
}

export function formatSettingsSavedMessage() {
  return "Settings saved";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/feedback-copy.test.mjs`
Expected: PASS

- [ ] **Step 5: Replace inline feedback strings with shared copy**

Update `src/manager.js`, `src/popup.js`, and `src/options.js`:

```javascript
import {
  formatRestoreFeedback,
  formatSaveFeedback,
  formatSettingsSavedMessage
} from "./feedback-copy.js";

// manager.js
const result = await sendRuntime({ type: "capture", mode: "current-window", workspaceId: activeWorkspaceId });
toast(formatSaveFeedback(result.storedTabs || 0));

// popup.js
const result = await chrome.runtime.sendMessage({ type: "restore-group", groupId: button.dataset.groupId });
feedbackNode.textContent = formatRestoreFeedback({ restored: result?.restoredTabs || 0, failed: 0 });

// options.js
toast(formatSettingsSavedMessage());
```

- [ ] **Step 6: Sweep accessibility and state styling**

Apply the following concrete changes:

```css
.context-chip:focus-visible,
.popup-row button:focus-visible,
.settings-card button:focus-visible,
.settings-card input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.inspector-empty,
.empty-row,
.active-tabs-empty {
  border: 1px dashed var(--line);
  border-radius: 10px;
  padding: 14px;
  background: var(--surface-2);
}
```

And add these semantics where missing:

```html
<div id="contextStrip" class="context-strip" aria-live="polite"></div>
<div id="popupFeedback" class="popup-feedback" role="status" aria-live="polite"></div>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
```

- [ ] **Step 7: Run full verification and commit**

Run: `npm test && npm run check`
Expected: PASS

Commit:

```bash
git add src/feedback-copy.js tests/feedback-copy.test.mjs src/manager.js src/popup.js src/options.js src/styles.css src/popup.css src/options.css
git commit -m "fix: unify extension feedback and focus states"
```

---

### Task 5: Update docs and manually verify the redesign in Chrome

**Files:**
- Modify: `docs/feature-spec.md`
- Modify: `docs/technical-architecture.md`
- Modify: `docs/feature-evolution.md`
- Modify: `docs/product-decisions.md`

- [ ] **Step 1: Update feature documentation**

Add exact behavior notes:

```md
## Popup
- Primary CTA is Save window.
- Secondary CTA is Open workspace.
- Popup shows at most 5 recent sessions.
- Popup does not expose management flows beyond restore.

## Manager / New Tab
- Manager header is a command bar with workspace controls, search, and a context strip.
- A right-side inspector shows the focused session's metadata and edit actions.
- Session cards expose Restore as the main direct action; secondary actions move into More or the inspector.

## Options
- Options are split into Basic and Advanced sections.
```

- [ ] **Step 2: Update architecture documentation**

Add helper-module notes:

```md
- `src/manager-view.js`: pure manager UI view-model helpers
- `src/popup-view.js`: popup view-model helpers
- `src/options-view.js`: options section helpers
- `src/feedback-copy.js`: shared feedback string builders
```

- [ ] **Step 3: Update decision history**

Record the tradeoff explicitly:

```md
Decision: keep popup as a trigger surface and move deep session management into manager/new tab.
Why: popup size and auto-close behavior punish complex task flows.
Tradeoff: popup becomes less powerful, but manager becomes clearer and more stable for repeated work.
```

- [ ] **Step 4: Run automated checks**

Run:

```bash
npm test
npm run check
```

Expected: both PASS

- [ ] **Step 5: Run manual Chrome verification**

Load the unpacked extension and verify this exact checklist:

```text
[ ] Popup opens with Save window as the clearest action
[ ] Popup shows Open workspace wording
[ ] Popup recent list never feels longer than 5 items
[ ] Manager header shows workspace controls + search + context strip
[ ] Clicking a session populates inspector
[ ] Restore works from inspector and/or card primary action
[ ] More menu still exposes rename / note / lock / delete
[ ] Open Tabs can still create sessions and drag into sessions
[ ] Keyboard focus ring is visible in popup, manager, options, menus, and modal
[ ] Options clearly separate Basic from Advanced
[ ] No broken drag-and-drop regressions in manager
```

- [ ] **Step 6: Commit docs and verification follow-up**

```bash
git add docs/feature-spec.md docs/technical-architecture.md docs/feature-evolution.md docs/product-decisions.md
git commit -m "docs: document manager-first extension UI redesign"
```

---

## Self-Review

### Spec coverage

Covered:
- manager/new tab information architecture and inspector — Task 1
- popup primary/secondary action cleanup — Task 2
- options Basic/Advanced split — Task 3
- unified feedback and accessibility sweep — Task 4
- docs and manual verification — Task 5

No spec gaps remain.

### Placeholder scan

Checked for `TODO`, `TBD`, `implement later`, and vague “write tests for the above” language. Removed placeholders; every task names exact files, test commands, and concrete code snippets.

### Type consistency

Helper names are consistent across tasks:
- `buildContextStripItems`
- `buildInspectorModel`
- `getSessionActionLayout`
- `buildPopupViewModel`
- `buildSettingsSections`
- `formatSaveFeedback`
- `formatRestoreFeedback`
- `formatSettingsSavedMessage`

No later task renames them.
