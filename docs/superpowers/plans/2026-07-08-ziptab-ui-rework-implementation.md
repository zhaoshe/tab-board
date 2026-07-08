# ZipTab UI Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved ZipTab UI rework for Popup, Manager, Options, capture cleanup, DnD feedback, and shared icon/visual consistency.

**Architecture:** Keep the current MV3/no-build/native DOM architecture. Put pure settings/pattern/dedupe decisions in `src/model.js`, Chrome tab side effects in `src/background.js`, and UI view decisions in existing `*-view.js` helpers where possible. Avoid large rewrites; replace failed UI pieces with focused DOM/CSS changes.

**Tech Stack:** Chrome Manifest V3, native ES modules, native DOM APIs, `chrome.storage.local`, `node:test`, no bundler, no new runtime dependencies.

---

## Files

- Modify: `src/model.js` — settings defaults, URL exclude pattern helper, source-tab dedupe helper.
- Modify: `src/background.js` — capture cleanup counts, save all windows/current window/current window dedupe, recent manager targeting.
- Modify: `src/popup-view.js` — quick action and recent-session view model.
- Modify: `src/popup.js` — Save/Open/Dedupe/Settings/Delete actions; no popup success toast after Save.
- Modify: `popup.html` — quick action row structure.
- Modify: `src/popup.css` — unified compact popup controls and hover preview.
- Modify: `src/manager-view.js` — Board-first helper models, open window collapsed model, DnD zone decisions.
- Modify: `src/manager.js` — remove context strip/inspector render path, new workspace header, all-windows Open Tabs, select title overlay, save toast target highlight, DnD line behavior.
- Modify: `manager.html` — remove context strip/inspector containers if no longer used.
- Modify: `src/styles.css` — shared button/icon/board/open-tabs/toast styles.
- Modify: `src/options-view.js` — new settings sections.
- Modify: `src/options.js` — exclude URL list editor; remove deprecated setting controls.
- Modify: `src/options.css` — exclude list and unified setting controls.
- Modify: `src/icons.js` — add/standardize icons used by Popup/Manager/Options.
- Modify: `docs/feature-spec.md`, `docs/technical-architecture.md`, `docs/feature-evolution.md`, `docs/product-decisions.md` — document behavior changes.
- Test: `tests/model.test.mjs`, `tests/background.test.mjs`, `tests/popup-view.test.mjs`, `tests/manager-view.test.mjs`, `tests/options-view.test.mjs`, `tests/feedback-copy.test.mjs`.

---

## Task 1: Settings schema and URL pattern helpers

**Files:**
- Modify: `src/model.js`
- Modify: `tests/model.test.mjs`
- Modify: `tests/options.test.mjs`

- [ ] **Step 1: Write failing model tests**

Add tests:

```js
test("defaults capture dedupe on and excludes chrome/file URLs", () => {
  const state = normalizeState({});

  assert.equal(state.settings.dedupeOnSave, true);
  assert.deepEqual(state.settings.excludeUrlPatterns, ["chrome://*", "file://*"]);
});

test("matches simple exclude URL patterns", () => {
  assert.equal(matchesUrlPattern("chrome://extensions", "chrome://*"), true);
  assert.equal(matchesUrlPattern("file:///Users/me/a.txt", "file://*"), true);
  assert.equal(matchesUrlPattern("about:blank", "about:blank"), true);
  assert.equal(matchesUrlPattern("https://example.com/a", "https://example.com/*"), true);
  assert.equal(matchesUrlPattern("https://other.com/a", "https://example.com/*"), false);
});

test("normalizes exclude URL patterns", () => {
  const state = normalizeState({
    settings: {
      excludeUrlPatterns: [" chrome://* ", "", "file://*", 7, "chrome://*"]
    }
  });

  assert.deepEqual(state.settings.excludeUrlPatterns, ["chrome://*", "file://*"]);
});
```

Update options setting-key test:

```js
test("accepts only current DEFAULT_SETTINGS keys", () => {
  assert.equal(isKnownSettingKey("theme"), true);
  assert.equal(isKnownSettingKey("excludeUrlPatterns"), true);
  assert.equal(isKnownSettingKey("showFavicons"), false);
  assert.equal(isKnownSettingKey("confirmDestructive"), false);
  assert.equal(isKnownSettingKey("sessionExternalActions"), false);
  assert.equal(isKnownSettingKey("__proto__"), false);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```sh
node --test tests/model.test.mjs tests/options.test.mjs
```

Expected: FAIL because `matchesUrlPattern` is not exported and defaults still contain deprecated settings.

- [ ] **Step 3: Implement settings defaults and helpers**

In `src/model.js`:

```js
const DEFAULT_EXCLUDE_URL_PATTERNS = Object.freeze(["chrome://*", "file://*"]);

export const DEFAULT_SETTINGS = Object.freeze({
  actionClick: "store",
  closeTabsAfterSave: true,
  dedupeOnSave: true,
  deleteRestoredTabs: true,
  excludeUrlPatterns: [...DEFAULT_EXCLUDE_URL_PATTERNS],
  focusRestoredTabs: true,
  includePinnedTabs: false,
  openManagerAfterSave: true,
  restoreGroupsInNewWindow: false,
  restoreNextToCurrent: true,
  theme: "system"
});
```

Add helper functions:

```js
function normalizeUrlPatterns(value) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_EXCLUDE_URL_PATTERNS];
  }
  const patterns = [];
  for (const item of value) {
    const pattern = String(item || "").trim();
    if (pattern && !patterns.includes(pattern)) {
      patterns.push(pattern);
    }
  }
  return patterns.length ? patterns : [...DEFAULT_EXCLUDE_URL_PATTERNS];
}

export function matchesUrlPattern(url, pattern) {
  const text = String(url || "").trim();
  const rule = String(pattern || "").trim();
  if (!text || !rule) {
    return false;
  }
  if (rule.endsWith("*")) {
    return text.startsWith(rule.slice(0, -1));
  }
  return text === rule;
}

export function isUrlExcluded(url, settings = DEFAULT_SETTINGS) {
  const patterns = Array.isArray(settings.excludeUrlPatterns) ? settings.excludeUrlPatterns : DEFAULT_EXCLUDE_URL_PATTERNS;
  return patterns.some((pattern) => matchesUrlPattern(url, pattern));
}
```

Update `normalizeSettings(raw)` to normalize arrays:

```js
function normalizeSettings(raw) {
  const settings = { ...DEFAULT_SETTINGS, excludeUrlPatterns: [...DEFAULT_SETTINGS.excludeUrlPatterns] };
  if (!raw || typeof raw !== "object") {
    return settings;
  }
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (Object.hasOwn(raw, key)) {
      settings[key] = key === "excludeUrlPatterns" ? normalizeUrlPatterns(raw[key]) : raw[key];
    }
  }
  return settings;
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```sh
node --test tests/model.test.mjs tests/options.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add src/model.js tests/model.test.mjs tests/options.test.mjs
git commit -m "feat: add capture URL exclusion settings"
```

---

## Task 2: Capture cleanup and manager targeting

**Files:**
- Modify: `src/background.js`
- Modify: `tests/background.test.mjs`
- Modify: `src/feedback-copy.js`
- Modify: `tests/feedback-copy.test.mjs`

- [ ] **Step 1: Write failing background tests**

Add tests covering:

```js
test("capture closes blank tabs and dedupes source URLs before saving", async () => {
  // Arrange chrome.tabs.query/getAll mocks with two same https URLs, one about:blank, one chrome://extensions.
  // Arrange settings: dedupeOnSave true, closeTabsAfterSave true, excludeUrlPatterns ["chrome://*", "file://*"].
  // Act capture current-window.
  // Assert storedTabs === 1, cleanedDuplicates === 1, closedBlankTabs === 1, skippedByExclude === 1.
  // Assert removed tab ids include duplicate, blank, and saved storable source, but not single chrome:// tab.
  // Assert createdGroupIds has one id.
});

test("open manager targets most recently active ZipTab tab", async () => {
  // Arrange two existing manager tabs with lastAccessed metadata or active/focused window metadata.
  // Act open-manager.
  // Assert chrome.tabs.update called for recent manager tab, not rightmost unrelated tab.
});

test("capture passes target group and feedback counts to manager URL", async () => {
  // Arrange capture creates one group.
  // Act capture.
  // Assert manager URL includes targetGroupId, saved, duplicates, blank counts.
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```sh
node --test tests/background.test.mjs tests/feedback-copy.test.mjs
```

Expected: FAIL because counts/URL targeting do not exist yet.

- [ ] **Step 3: Implement capture classification**

In `src/background.js`, import `isUrlExcluded` from `model.js`.

Add helpers near capture functions:

```js
const BLANK_URL_PATTERN = /^about:blank$/i;

function isBlankTab(tab) {
  return BLANK_URL_PATTERN.test(tab?.url || "");
}

function dedupeSourceTabs(tabs, settings) {
  if (!settings.dedupeOnSave) {
    return { uniqueTabs: tabs, duplicateTabs: [] };
  }
  const seen = new Set();
  const uniqueTabs = [];
  const duplicateTabs = [];
  for (const tab of tabs) {
    const url = String(tab.url || "");
    if (!url) {
      uniqueTabs.push(tab);
      continue;
    }
    if (seen.has(url)) {
      duplicateTabs.push(tab);
      continue;
    }
    seen.add(url);
    uniqueTabs.push(tab);
  }
  return { uniqueTabs, duplicateTabs };
}
```

Update `canCaptureTab(tab, settings)`:

```js
function canCaptureTab(tab, settings) {
  if (!tab?.id || !tab.url) {
    return false;
  }
  if (!settings.includePinnedTabs && tab.pinned) {
    return false;
  }
  const ownBase = chrome.runtime.getURL("");
  if (tab.url.startsWith(ownBase)) {
    return false;
  }
  if (/^devtools:/i.test(tab.url)) {
    return false;
  }
  if (isBlankTab(tab)) {
    return false;
  }
  return !isUrlExcluded(tab.url, settings);
}
```

- [ ] **Step 4: Implement cleanup-aware capture result**

Inside `captureTabs`:

```js
const sourceTabs = sortCapturedTabs(await getTabsForMode(mode, anchorTab, options));
const blankTabs = sourceTabs.filter(isBlankTab);
const nonBlankTabs = sourceTabs.filter((tab) => !isBlankTab(tab));
const { uniqueTabs, duplicateTabs } = dedupeSourceTabs(nonBlankTabs, settings);
const storableTabs = uniqueTabs.filter((tab) => canCaptureTab(tab, settings));
const skippedByExclude = uniqueTabs.length - storableTabs.length;
```

Return shape:

```js
return {
  storedTabs,
  storedGroups: groups.length,
  skipped: skippedByExclude,
  skippedByExclude,
  cleanedDuplicates: duplicateTabs.length,
  closedBlankTabs: blankTabs.length,
  createdGroupIds: groups.map((group) => group.id)
};
```

Remove tabs after saving:

```js
const idsToClose = new Set([
  ...blankTabs.map((tab) => tab.id),
  ...duplicateTabs.map((tab) => tab.id)
]);
if (settings.closeTabsAfterSave) {
  for (const tab of storableTabs) {
    idsToClose.add(tab.id);
  }
}
if (managerTab?.id) {
  idsToClose.delete(managerTab.id);
}
await removeTabs([...idsToClose].filter(Number.isFinite));
```

- [ ] **Step 5: Implement manager URL targeting**

Change `openManager` signature:

```js
async function openManager({ windowId, query = "", targetGroupId = "", feedback } = {}) {
  const baseUrl = chrome.runtime.getURL(MANAGER_PAGE);
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (targetGroupId) params.set("targetGroupId", targetGroupId);
  if (feedback) {
    params.set("saved", String(feedback.storedTabs || 0));
    params.set("duplicates", String(feedback.cleanedDuplicates || 0));
    params.set("blank", String(feedback.closedBlankTabs || 0));
  }
  const targetUrl = params.toString() ? `${baseUrl}?${params}` : baseUrl;
  const tabs = await chrome.tabs.query({});
  const existing = chooseManagerTab(tabs, baseUrl, windowId);
  // existing update/create logic remains.
}
```

Add chooser:

```js
function chooseManagerTab(tabs, baseUrl, preferredWindowId) {
  const managers = tabs.filter((tab) => tab.url?.startsWith(baseUrl));
  return (
    managers.find((tab) => tab.active && tab.windowId === preferredWindowId) ||
    managers.find((tab) => tab.windowId === preferredWindowId) ||
    managers.find((tab) => tab.active) ||
    managers.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] ||
    null
  );
}
```

- [ ] **Step 6: Update feedback copy**

Add:

```js
export function formatCaptureFeedback({ storedTabs = 0, cleanedDuplicates = 0, closedBlankTabs = 0 } = {}) {
  const parts = [`Saved ${storedTabs} tab${storedTabs === 1 ? "" : "s"}`];
  if (cleanedDuplicates) parts.push(`cleaned ${cleanedDuplicates} duplicate${cleanedDuplicates === 1 ? "" : "s"}`);
  if (closedBlankTabs) parts.push(`closed ${closedBlankTabs} blank`);
  return parts.join(" · ");
}
```

- [ ] **Step 7: Run tests to verify GREEN**

Run:

```sh
node --test tests/background.test.mjs tests/feedback-copy.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```sh
git add src/background.js src/feedback-copy.js tests/background.test.mjs tests/feedback-copy.test.mjs
git commit -m "feat: clean tabs during capture"
```

---

## Task 3: Popup quick actions and recent session preview

**Files:**
- Modify: `popup.html`
- Modify: `src/popup.js`
- Modify: `src/popup-view.js`
- Modify: `src/popup.css`
- Modify: `tests/popup-view.test.mjs`

- [ ] **Step 1: Write failing popup view tests**

Add:

```js
test("builds three popup quick actions", () => {
  const model = buildPopupViewModel({ groups: [] });

  assert.deepEqual(model.quickActions.map((action) => action.id), ["save", "open", "dedupe"]);
});

test("includes restore and delete actions for recent sessions", () => {
  const model = buildPopupViewModel({
    groups: [{ id: "g1", title: "A", tabs: [{ itemType: "link", url: "https://a.test" }] }]
  });

  assert.deepEqual(model.groups[0].actions, ["restore", "delete"]);
});

test("builds full hover preview tabs", () => {
  const model = buildPopupViewModel({
    groups: [{ id: "g1", title: "A", tabs: [{ title: "One", url: "https://a.test" }] }]
  });

  assert.equal(model.groups[0].previewTabs.length, 1);
  assert.equal(model.groups[0].previewTabs[0].title, "One");
});
```

- [ ] **Step 2: Run popup tests to verify RED**

```sh
node --test tests/popup-view.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Update `buildPopupViewModel`**

Return:

```js
return {
  quickActions: [
    { id: "save", label: "Save", action: "capture-current-window", icon: "save" },
    { id: "open", label: "Open", action: "open-manager", icon: "external-link" },
    { id: "dedupe", label: "Dedupe", action: "dedupe-current-window", icon: "copy" }
  ],
  settingsAction: { action: "open-options", icon: "settings" },
  emptyMessage: trimmedQuery ? `No sessions match “${trimmedQuery}”` : "No saved sessions yet",
  groups: visibleGroups
};
```

Each group maps to:

```js
{
  id: group.id,
  title: group.title || "Untitled session",
  restorableCount,
  previewTabs: (group.tabs || []).map((tab) => ({ title: tab.title || tab.url || "Untitled", url: tab.url || "", favIconUrl: tab.favIconUrl || "" })),
  actions: restorableCount ? ["restore", "delete"] : ["delete"]
}
```

- [ ] **Step 4: Update popup markup/render**

`popup.html` keeps `#popupSessionList`, `#popupSearch`, and adds/uses `#popupActions` if missing.

`src/popup.js` render quick actions:

```js
quickActionsNode.replaceChildren(
  ...model.quickActions.map((action) =>
    h("button", { class: `popup-quick-action ${action.id === "save" ? "primary" : ""}`, "data-action": action.action }, action.label)
  )
);
```

Render recent rows with unified icons:

```js
iconOnlyButton("external-link", "Restore session", { "data-action": "restore-group", "data-group-id": group.id })
iconOnlyButton("trash-2", "Delete session", { class: "danger", "data-action": "delete-group", "data-group-id": group.id })
```

Preview markup:

```js
h("div", { class: "popup-preview", role: "tooltip" }, ...group.previewTabs.map(renderPreviewTab))
```

- [ ] **Step 5: Update popup click behavior**

In `handleClick`:

```js
if (button.dataset.action === "capture-current-window") {
  await sendRuntime({ type: "capture", mode: "current-window" });
  window.close();
}
if (button.dataset.action === "dedupe-current-window") {
  await sendRuntime({ type: "dedupe-window" });
  window.close();
}
if (button.dataset.action === "open-options") {
  await sendRuntime({ type: "open-options" });
  window.close();
}
if (button.dataset.action === "delete-group") {
  if (!confirm("Delete this session?")) return;
  await sendRuntime({ type: "delete-group", groupId: button.dataset.groupId });
}
```

- [ ] **Step 6: Run tests**

```sh
node --test tests/popup-view.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```sh
git add popup.html src/popup.js src/popup-view.js src/popup.css tests/popup-view.test.mjs
git commit -m "feat: rework popup quick actions"
```

---

## Task 4: Manager Board-first shell and save target feedback

**Files:**
- Modify: `manager.html`
- Modify: `src/manager.js`
- Modify: `src/manager-view.js`
- Modify: `src/styles.css`
- Modify: `tests/manager-view.test.mjs`

- [ ] **Step 1: Write failing manager-view tests**

Add pure tests:

```js
test("builds collapsed window models with one expanded window", () => {
  const model = buildOpenWindowsModel({
    windows: [{ id: 1, tabs: [{ id: 11 }] }, { id: 2, tabs: [{ id: 21 }, { id: 22 }] }],
    selectedWindowId: 2
  });

  assert.equal(model[0].expanded, false);
  assert.equal(model[1].expanded, true);
  assert.equal(model[1].tabCount, 2);
});

test("returns no insert line when drag target is original group position", () => {
  const target = getGroupDropIndicator({ sourceGroupId: "g1", targetGroupId: "g1", edge: "before" });

  assert.equal(target.showInsertLine, false);
});

test("uses middle half as add-to-session zone", () => {
  assert.equal(getSessionDropZone(0.2), "insert-before");
  assert.equal(getSessionDropZone(0.5), "add-to-session");
  assert.equal(getSessionDropZone(0.8), "insert-after");
});
```

- [ ] **Step 2: Run manager-view tests to verify RED**

```sh
node --test tests/manager-view.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Implement view helpers**

In `src/manager-view.js`:

```js
export function buildOpenWindowsModel({ windows = [], selectedWindowId } = {}) {
  const fallbackId = selectedWindowId || windows.find((window) => window.focused)?.id || windows[0]?.id || null;
  return windows.map((window) => ({
    id: window.id,
    focused: Boolean(window.focused),
    expanded: window.id === fallbackId,
    tabCount: Array.isArray(window.tabs) ? window.tabs.length : 0,
    tabs: Array.isArray(window.tabs) ? window.tabs : []
  }));
}

export function getSessionDropZone(ratio) {
  if (ratio < 0.25) return "insert-before";
  if (ratio > 0.75) return "insert-after";
  return "add-to-session";
}

export function getGroupDropIndicator({ sourceGroupId, targetGroupId, edge } = {}) {
  return {
    showInsertLine: Boolean(edge) && sourceGroupId !== targetGroupId,
    edge: edge || ""
  };
}
```

- [ ] **Step 4: Remove context strip and inspector path**

In `manager.html`, remove `#contextStrip` and `#inspectorPanel` containers or leave hidden only if needed during transition.

In `src/manager.js` render path becomes:

```js
function render() {
  renderWorkspaceSwitcher();
  renderStats();
  renderHeaderActions();
  renderActiveTabs();
  renderFolders();
  renderGroups();
  renderPendingFeedback();
}
```

Remove calls to `ensureFocusedGroup()`, `renderContextStrip()`, `renderInspector()` from main render path.

- [ ] **Step 5: Implement workspace/search header**

Header order:

```text
ZipTab | Workspace switcher | Workspace More | Search | Import | Export | Bin | Options
```

Workspace More actions:

```js
rename-workspace
create-workspace
delete-workspace
```

Delete workspace uses `confirm("Delete this workspace?")`.

- [ ] **Step 6: Implement save target params**

On manager startup, parse:

```js
const pageParams = new URLSearchParams(location.search);
const pendingTargetGroupId = pageParams.get("targetGroupId") || "";
const pendingFeedback = {
  storedTabs: Number(pageParams.get("saved") || 0),
  cleanedDuplicates: Number(pageParams.get("duplicates") || 0),
  closedBlankTabs: Number(pageParams.get("blank") || 0)
};
```

After state load/render:

```js
if (pendingTargetGroupId) {
  requestAnimationFrame(() => revealGroup(pendingTargetGroupId));
}
if (pendingFeedback.storedTabs) {
  toast(formatCaptureFeedback(pendingFeedback));
}
```

`toast` style must be floating and not affect layout.

- [ ] **Step 7: Run tests**

```sh
node --test tests/manager-view.test.mjs tests/feedback-copy.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```sh
git add manager.html src/manager.js src/manager-view.js src/styles.css tests/manager-view.test.mjs
git commit -m "feat: rework manager board shell"
```

---

## Task 5: Manager all-windows Open Tabs, select overlay, and DnD line behavior

**Files:**
- Modify: `src/manager.js`
- Modify: `src/styles.css`
- Modify: `src/manager-view.js`
- Modify: `tests/manager-view.test.mjs`

- [ ] **Step 1: Write failing tests for DnD zones**

Extend `tests/manager-view.test.mjs`:

```js
test("does not show original-position insert marker", () => {
  assert.deepEqual(
    getGroupDropIndicator({ sourceGroupId: "g1", targetGroupId: "g1", edge: "after" }),
    { showInsertLine: false, edge: "after" }
  );
});
```

- [ ] **Step 2: Run tests to verify RED if helper missing**

```sh
node --test tests/manager-view.test.mjs
```

Expected: PASS if Task 4 helper already covers it; otherwise FAIL then fix.

- [ ] **Step 3: Render all windows with one expanded**

Manager state adds:

```js
let selectedOpenWindowId = null;
```

When open tabs load:

```js
selectedOpenWindowId = selectedOpenWindowId || openWindows.find((window) => window.focused)?.id || openWindows[0]?.id || null;
```

`renderActiveTabs()` loops `buildOpenWindowsModel({ windows: openWindows, selectedWindowId: selectedOpenWindowId })`.

Collapsed window button:

```js
iconOnlyButton("chevron-down", "Expand window", {
  "data-action": "select-open-window",
  "data-window-id": window.id
})
```

Click handler:

```js
} else if (action === "select-open-window") {
  selectedOpenWindowId = Number(button.dataset.windowId);
  renderActiveTabs();
}
```

- [ ] **Step 4: Add save-all-windows and dedupe-window actions**

Manager click handler:

```js
} else if (action === "capture-all-windows") {
  await sendRuntime({ type: "capture", mode: "all-windows", workspaceId: activeWorkspaceId });
  await loadOpenTabs();
} else if (action === "dedupe-open-window") {
  await sendRuntime({ type: "dedupe-window", windowId: Number(button.dataset.windowId) });
  await loadOpenTabs();
}
```

- [ ] **Step 5: Select overlay covers only title row**

Render select overlay inside window header only:

```js
openTabsSelectMode
  ? h("div", { class: "open-window-selection-overlay" }, h("strong", {}, `${selectedOpenTabIds.size} selected`), ...actions)
  : null
```

Do not replace tab list and do not change window card height.

- [ ] **Step 6: DnD markers**

Use vertical line marker:

```js
function renderGroupInsertLine(position) {
  return h("div", { class: `group-insert-line ${position}` });
}
```

When target is original position, do not append marker.

- [ ] **Step 7: Run checks**

```sh
node --test tests/manager-view.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```sh
git add src/manager.js src/manager-view.js src/styles.css tests/manager-view.test.mjs
git commit -m "feat: improve manager open tabs and drag feedback"
```

---

## Task 6: Options rework and exclude URL list editor

**Files:**
- Modify: `src/options-view.js`
- Modify: `src/options.js`
- Modify: `src/options.css`
- Modify: `tests/options-view.test.mjs`

- [ ] **Step 1: Write failing options-view tests**

Add:

```js
test("groups capture dedupe and exclude URL patterns", () => {
  const sections = buildSettingsSections();

  assert.equal(sections.capture.some((item) => item.key === "dedupeOnSave"), true);
  assert.equal(sections.captureEdgeCases.some((item) => item.key === "excludeUrlPatterns"), true);
});

test("does not expose removed interface settings", () => {
  const keys = Object.values(buildSettingsSections()).flat().map((item) => item.key);

  assert.equal(keys.includes("showFavicons"), false);
  assert.equal(keys.includes("confirmDestructive"), false);
  assert.equal(keys.includes("sessionToolbar"), false);
});
```

- [ ] **Step 2: Run tests to verify RED**

```sh
node --test tests/options-view.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Update sections**

`src/options-view.js`:

```js
export function buildSettingsSections() {
  return {
    basic: [
      { key: "actionClick", card: "toolbar" },
      { key: "closeTabsAfterSave", card: "capture" },
      { key: "openManagerAfterSave", card: "capture" },
      { key: "dedupeOnSave", card: "capture" },
      { key: "deleteRestoredTabs", card: "restore" },
      { key: "restoreGroupsInNewWindow", card: "restore" },
      { key: "restoreNextToCurrent", card: "restore" },
      { key: "focusRestoredTabs", card: "restore" },
      { key: "theme", card: "interface" }
    ],
    advanced: [
      { key: "includePinnedTabs", card: "capture" },
      { key: "excludeUrlPatterns", card: "capture-edge-cases" }
    ],
    capture: [{ key: "dedupeOnSave", card: "capture" }],
    captureEdgeCases: [{ key: "excludeUrlPatterns", card: "capture-edge-cases" }]
  };
}
```

- [ ] **Step 4: Remove session toolbar editor UI**

Delete calls from render. Leave unused helper removal if no references remain.

Options render includes:

```js
{ key: "dedupeOnSave", control: checkbox("dedupeOnSave", settings.dedupeOnSave, "Deduplicate tabs during capture") }
{ key: "excludeUrlPatterns", control: excludeUrlListEditor(settings.excludeUrlPatterns) }
```

- [ ] **Step 5: Add exclude URL list editor**

Implementation:

```js
function excludeUrlListEditor(patterns = []) {
  return h(
    "div",
    { class: "exclude-url-list" },
    ...patterns.map((pattern, index) =>
      h("div", { class: "exclude-url-row" },
        h("input", { value: pattern, "data-exclude-url-pattern": index, "aria-label": "Exclude URL pattern" }),
        iconOnlyButton("trash-2", "Remove pattern", { "data-action": "remove-exclude-url-pattern", "data-pattern-index": index })
      )
    ),
    iconTextButton("plus", "Add URL pattern", { "data-action": "add-exclude-url-pattern" })
  );
}
```

Change handler:

```js
const patternInput = event.target.closest("[data-exclude-url-pattern]");
if (patternInput) {
  const index = Number(patternInput.dataset.excludeUrlPattern);
  await updateUrlPattern(index, patternInput.value);
  return;
}
```

Click actions:

```js
if (button.dataset.action === "add-exclude-url-pattern") {
  await updateState((draft) => {
    draft.settings.excludeUrlPatterns = [...(draft.settings.excludeUrlPatterns || []), ""];
    return draft;
  });
}
if (button.dataset.action === "remove-exclude-url-pattern") {
  const index = Number(button.dataset.patternIndex);
  await updateState((draft) => {
    draft.settings.excludeUrlPatterns = (draft.settings.excludeUrlPatterns || []).filter((_, itemIndex) => itemIndex !== index);
    return draft;
  });
}
```

- [ ] **Step 6: Run tests**

```sh
node --test tests/options-view.test.mjs tests/options.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```sh
git add src/options-view.js src/options.js src/options.css tests/options-view.test.mjs tests/options.test.mjs
git commit -m "feat: simplify options capture settings"
```

---

## Task 7: Unified icons and visual polish

**Files:**
- Modify: `src/icons.js`
- Modify: `src/styles.css`
- Modify: `src/popup.css`
- Modify: `src/options.css`
- Modify: `src/manager.js`
- Modify: `src/popup.js`
- Modify: `src/options.js`

- [ ] **Step 1: Audit icon names in code**

Run:

```sh
python3 - <<'PY'
from pathlib import Path
for path in [Path('src/manager.js'), Path('src/popup.js'), Path('src/options.js')]:
    text = path.read_text()
    print(path)
    for token in ['🗑', '⚙', '↗', '⧉']:
        if token in text:
            print(' emoji/symbol found:', token)
PY
```

Expected before fix: may print symbols if any were introduced. After fix: no output except file names.

- [ ] **Step 2: Add missing icons**

In `src/icons.js`, ensure registry includes or aliases:

```js
"settings"
"trash-2"
"external-link"
"copy"
"plus"
"x"
"chevron-down"
"download"
"upload"
"archive"
```

Reuse existing paths when possible; do not import an icon package.

- [ ] **Step 3: Replace emoji/symbol controls with icon helpers**

Use:

```js
iconOnlyButton("settings", "Open settings", attrs)
iconOnlyButton("trash-2", "Delete session", attrs)
iconOnlyButton("external-link", "Restore session", attrs)
iconOnlyButton("copy", "Deduplicate tabs", attrs)
```

- [ ] **Step 4: Normalize CSS control dimensions**

Add CSS tokens:

```css
:root {
  --control-height: 36px;
  --icon-button-size: 34px;
  --radius-control: 12px;
}
```

Apply consistently in Manager, Popup, Options.

- [ ] **Step 5: Run syntax and tests**

```sh
npm test
npm run check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```sh
git add src/icons.js src/styles.css src/popup.css src/options.css src/manager.js src/popup.js src/options.js
git commit -m "refactor: unify extension controls and icons"
```

---

## Task 8: Documentation and final verification

**Files:**
- Modify: `docs/feature-spec.md`
- Modify: `docs/technical-architecture.md`
- Modify: `docs/feature-evolution.md`
- Modify: `docs/product-decisions.md`
- Modify: `.remember/remember.md`

- [ ] **Step 1: Update product docs**

Document:

- Popup quick row actions.
- Manager Board-first layout.
- Open Tabs all windows behavior.
- Capture cleanup/URL exclusion behavior.
- Options removed settings and exclude URL list.
- DnD vertical-line target behavior.
- Unified icon rule.

- [ ] **Step 2: Run full verification**

```sh
npm test
npm run check
git status --short
```

Expected:

- Tests pass.
- Check passes.
- Only intentional files modified.
- `.claude/` remains untracked local skill symlink config.

- [ ] **Step 3: Manual Chrome checklist**

Ask user to verify in Chrome:

```text
1. Load unpacked extension.
2. Popup Save closes popup and opens/focuses manager.
3. Manager highlights just-saved session and shows floating toast without layout shift.
4. Popup Open focuses recent ZipTab tab.
5. Popup Dedupe removes duplicate current-window tabs.
6. Popup recent rows restore/delete; delete confirms.
7. Hover/focus preview shows all session tabs.
8. Manager Open Tabs shows all windows, one expanded.
9. Select mode covers only title row.
10. Save all windows button captures all windows.
11. DnD session drag keeps original card visible.
12. DnD insertion uses vertical line with no text.
13. Original position shows no insert line.
14. Options show dedupe-on-capture default on and exclude URL patterns.
15. Removed settings no longer appear.
```

- [ ] **Step 4: Commit docs**

```sh
git add docs/feature-spec.md docs/technical-architecture.md docs/feature-evolution.md docs/product-decisions.md .remember/remember.md
git commit -m "docs: document ZipTab UI rework"
```

---

## Self-review

Spec coverage:

- Popup: Task 3 + Task 7.
- Manager IA: Task 4 + Task 5.
- Capture cleanup: Task 1 + Task 2.
- Options: Task 6.
- DnD: Task 4 + Task 5.
- Unified icons/style: Task 7.
- Docs/manual verification: Task 8.

Placeholder scan: no TBD/TODO placeholders; all steps include files, commands, expected output, and concrete code snippets.

Type consistency:

- `excludeUrlPatterns`, `matchesUrlPattern`, `isUrlExcluded`, `formatCaptureFeedback`, `buildOpenWindowsModel`, `getSessionDropZone`, `getGroupDropIndicator` names are consistent across tasks.
- Runtime messages introduced: `dedupe-window`, `delete-group` from popup, capture mode `all-windows` already aligns with existing capture mode style.
