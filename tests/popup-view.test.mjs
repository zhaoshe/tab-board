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
