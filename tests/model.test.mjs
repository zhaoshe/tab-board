import assert from "node:assert/strict";
import test from "node:test";
import {
  ITEM_NOTE,
  compactBin,
  coerceUrl,
  createBinEntry,
  createGroupFromTabRecords,
  createNoteRecord,
  createTabRecord,
  isRestorableTab,
  normalizeState,
  parseImportText,
  parseOneTabText,
  tabsToText
} from "../src/model.js";

test("normalizes empty state", () => {
  const state = normalizeState();
  assert.equal(state.version, 1);
  assert.deepEqual(state.groups, []);
  assert.equal(state.settings.closeTabsAfterSave, true);
  assert.equal(state.settings.includeChromeUrls, false);
  assert.equal(state.settings.includeFileUrls, false);
  assert.deepEqual(state.settings.sessionExternalActions, ["collapse", "restore", "add"]);
});

test("creates groups from browser-like tab records", () => {
  const tab = createTabRecord({ title: "Example", url: "https://example.com", favIconUrl: "" });
  const group = createGroupFromTabRecords([tab], { title: "Saved" });
  assert.equal(group.title, "Saved");
  assert.equal(group.tabs[0].title, "Example");
});

test("imports common URL export formats", () => {
  const groups = parseImportText(`# Work
Example | https://example.com
https://openai.com | OpenAI

# Docs
developer.chrome.com/docs/extensions`);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].tabs.length, 2);
  assert.equal(groups[1].tabs[0].url, "https://developer.chrome.com/docs/extensions");
});

test("exports tab text", () => {
  const tab = createTabRecord({ title: "Example", url: "https://example.com" });
  assert.equal(tabsToText([tab]), "Example | https://example.com");
});

test("coerces hostnames to https URLs", () => {
  assert.equal(coerceUrl("example.com/path"), "https://example.com/path");
});

test("creates note records without restorable URLs", () => {
  const note = createNoteRecord("Read this later");
  assert.equal(note.itemType, ITEM_NOTE);
  assert.equal(isRestorableTab(note), false);
});

test("exports mixed link and note text", () => {
  const link = createTabRecord({ title: "Example", url: "https://example.com" });
  const note = createNoteRecord("A useful note");
  assert.equal(
    tabsToText([link, note]),
    "Example | https://example.com\nNOTE A useful note"
  );
});

test("normalizes legacy todo items as notes", () => {
  const state = normalizeState({
    groups: [
      {
        title: "Legacy",
        tabs: [{ id: "todo_1", itemType: "todo", title: "Follow up", note: "Follow up tomorrow" }]
      }
    ]
  });
  const tab = state.groups[0].tabs[0];
  assert.equal(tab.itemType, ITEM_NOTE);
  assert.equal(tab.title, "Follow up");
  assert.equal(tab.note, "Follow up tomorrow");
  assert.equal(isRestorableTab(tab), false);
});

test("normalizes legacy data into the default workspace", () => {
  const state = normalizeState({
    folders: [{ id: "folder_a", name: "Work" }],
    groups: [{ id: "group_a", title: "Saved", folderId: "folder_a", tabs: [] }]
  });
  assert.equal(state.workspaces.length, 1);
  assert.equal(state.folders[0].workspaceId, state.workspaces[0].id);
  assert.equal(state.groups[0].workspaceId, state.workspaces[0].id);
});

test("normalizes starred sessions as a single built-in category", () => {
  const state = normalizeState({
    folders: [{ id: "folder_a", name: "Work" }],
    groups: [{ id: "group_a", title: "Saved", folderId: "folder_a", starred: true, tabs: [] }]
  });
  assert.equal(state.groups[0].starred, true);
  assert.equal(state.groups[0].folderId, null);
});

test("normalizes session toolbar settings", () => {
  const state = normalizeState({
    settings: {
      sessionActionOrder: ["lock", "unknown", "restore", "lock"],
      sessionExternalActions: ["restore", "unknown", "lock"]
    }
  });
  assert.deepEqual(state.settings.sessionActionOrder.slice(0, 2), ["lock", "restore"]);
  assert.deepEqual(state.settings.sessionExternalActions, ["lock", "restore"]);
});

test("creates bounded bin entries", () => {
  const tab = createTabRecord({ title: "Example", url: "https://example.com" });
  const entry = createBinEntry("tab", tab, { groupTitle: "Saved" });
  assert.equal(entry.kind, "tab");
  assert.equal(entry.groupTitle, "Saved");
  assert.equal(compactBin(Array.from({ length: 90 }, () => entry)).length, 80);
});

test("imports OneTab export blocks as separate groups", () => {
  const groups = parseOneTabText(`Work links
https://example.com | Example
OpenAI | https://openai.com

[Docs](https://developer.chrome.com/docs/extensions)
https://one-tab.com OneTab`);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, "Work links");
  assert.equal(groups[0].tabs.length, 2);
  assert.equal(groups[1].tabs.length, 2);
  assert.equal(groups[1].tabs[0].title, "Docs");
});
