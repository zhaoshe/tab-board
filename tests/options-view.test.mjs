import assert from "node:assert/strict";
import test from "node:test";
import { buildSettingsSections } from "../src/options-view.js";

test("places daily-use settings in the Basic section", () => {
  const sections = buildSettingsSections();
  assert.deepEqual(sections.basic.map((item) => item.key), [
    "actionClick",
    "closeTabsAfterSave",
    "openManagerAfterSave",
    "dedupeOnSave",
    "deleteRestoredTabs",
    "restoreGroupsInNewWindow",
    "restoreNextToCurrent",
    "focusRestoredTabs",
    "theme"
  ]);
});

test("keeps Advanced free of removed capture settings", () => {
  const sections = buildSettingsSections();

  assert.deepEqual(sections.advanced, []);
});

test("does not expose removed settings", () => {
  const keys = Object.values(buildSettingsSections()).flat().map((item) => item.key);

  assert.equal(keys.includes("showFavicons"), false);
  assert.equal(keys.includes("confirmDestructive"), false);
  assert.equal(keys.includes("sessionToolbar"), false);
});
