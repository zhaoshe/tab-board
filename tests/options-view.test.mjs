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
