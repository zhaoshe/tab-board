import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContextStripItems,
  buildInspectorModel,
  getSessionActionLayout
} from "../src/manager-view.js";

test("buildContextStripItems builds the manager context strip", () => {
  assert.deepEqual(
    buildContextStripItems({
      workspaceName: "Work",
      categoryLabel: "Starred",
      searchQuery: "oauth",
      openTabTitle: "Chrome Docs"
    }),
    [
      { kind: "workspace", label: "Work" },
      { kind: "category", label: "Starred" },
      { kind: "search", label: "Search: oauth" },
      { kind: "open-tab", label: "Filtered by tab: Chrome Docs" }
    ]
  );
});

test("buildInspectorModel returns the empty state when no group is focused", () => {
  assert.deepEqual(
    buildInspectorModel({ group: null, categoryLabel: "Inbox", restorableCount: 0 }),
    {
      state: "empty",
      title: "Pick a session",
      message: "Select a session to inspect, edit, and restore it."
    }
  );
});

test("getSessionActionLayout keeps restore external and the rest in More", () => {
  assert.deepEqual(getSessionActionLayout(3), {
    external: ["restore"],
    menu: ["rename", "note", "lock", "copy", "delete"]
  });
});
