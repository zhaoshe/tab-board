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

test("builds three popup quick actions", () => {
  const model = buildPopupViewModel({ groups: [] });

  assert.deepEqual(model.quickActions.map((action) => action.id), ["save", "open", "dedupe"]);
});

test("shows duplicate count on popup dedupe action", () => {
  const model = buildPopupViewModel({ groups: [], duplicateTabCount: 2, dedupeReady: true });
  const dedupeAction = model.quickActions.find((action) => action.id === "dedupe");

  assert.equal(dedupeAction.label, "Dedupe (2)");
  assert.equal(dedupeAction.disabled, false);
});

test("disables popup dedupe action when no duplicates exist", () => {
  const model = buildPopupViewModel({ groups: [], duplicateTabCount: 0, dedupeReady: true });
  const dedupeAction = model.quickActions.find((action) => action.id === "dedupe");

  assert.equal(dedupeAction.label, "Dedupe (0)");
  assert.equal(dedupeAction.disabled, true);
});

test("includes restore and delete actions for recent sessions", () => {
  const model = buildPopupViewModel({
    groups: [{ id: "g1", title: "A", tabs: [{ itemType: "link", url: "https://a.test" }] }]
  });

  assert.deepEqual(model.groups[0].actions, ["restore", "delete"]);
});

test("builds full hover preview tabs", () => {
  const model = buildPopupViewModel({
    groups: [{ id: "g1", title: "A", tabs: [{ title: "One", itemType: "link", url: "https://a.test" }] }]
  });

  assert.equal(model.groups[0].previewTabs.length, 1);
  assert.equal(model.groups[0].previewTabs[0].title, "One");
});
