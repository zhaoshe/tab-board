# ZipTab Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix identified restore, drag/drop, settings, focus, group metadata, permission, and regression-test gaps with smallest safe diff.

**Architecture:** Keep Chrome API work in `src/background.js`, UI-only cleanup in `src/manager.js`, settings validation in `src/options.js`, and pure helpers in `src/model.js`/test stubs. Avoid new runtime dependencies and broad refactors.

**Tech Stack:** Native ES modules, Chrome MV3 APIs, native DOM APIs, `node:test`, `assert/strict`.

---

### Task 1: Background restore resilience

**Files:**
- Modify: `src/background.js`
- Test: `tests/background.test.mjs`

- [ ] Write failing tests for restore deletion using latest state, per-tab restore failure retention, `focusRestoredTabs: false` new-window behavior, and open-tab browserGroup listing.
- [ ] Run `node --test tests/background.test.mjs` and verify expected failures.
- [ ] Change restore paths to delete via `updateState` after tabs are created.
- [ ] Make `createChromeTabs()` catch individual tab create failures and return only created tabs.
- [ ] Use `focusFirst` for `chrome.windows.create({ focused })`.
- [ ] Include `browserGroup` in `listOpenTabs()` tab records.
- [ ] Run `node --test tests/background.test.mjs` and verify pass.

### Task 2: Manager drop and group metadata

**Files:**
- Modify: `src/manager.js`
- Test: covered by `npm test` and manual code path inspection; direct DOM drag test would be heavier than value here.

- [ ] Wrap drop payload `JSON.parse()` in `try/catch` and reuse cleanup path.
- [ ] Ensure `addOpenTabsToGroup()` and `addOpenTabsToNewGroup()` pass open tab `browserGroup` into `createTabRecord()`.
- [ ] Run `npm test`.

### Task 3: Options settings validation

**Files:**
- Modify: `src/options.js`
- Test: `tests/options.test.mjs`

- [ ] Write failing test that unknown `data-setting` key is ignored.
- [ ] Run `node --test tests/options.test.mjs` and verify expected failure.
- [ ] Add `isKnownSettingKey()` guard using `DEFAULT_SETTINGS`.
- [ ] Run `node --test tests/options.test.mjs` and verify pass.

### Task 4: Permission cleanup

**Files:**
- Modify: `manifest.json`

- [ ] Remove unused `clipboardRead` permission.
- [ ] Keep `clipboardWrite` only if needed by extension context.
- [ ] Run `npm run check`.

### Task 5: Full verification

**Files:**
- Verify all modified files.

- [ ] Run `npm test`.
- [ ] Run `npm run check`.
- [ ] Report changed files and skipped manual Chrome DnD/browser restore checks.
