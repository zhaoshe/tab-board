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

test("keeps rare capture settings in the Advanced section", () => {
  const sections = buildSettingsSections();
  assert.deepEqual(sections.advanced.map((item) => item.key), [
    "includePinnedTabs",
    "excludeUrlPatterns"
  ]);
});

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
