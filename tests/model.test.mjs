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
  moveGroupTabs,
  normalizeState,
  parseImportText,
  parseOneTabText,
  tabsToText,
  validateFolderName
} from "../src/model.js";

test("normalizes empty state without removed capture settings", () => {
  const state = normalizeState();
  assert.equal(state.version, 1);
  assert.deepEqual(state.groups, []);
  assert.equal(state.settings.closeTabsAfterSave, true);
  assert.equal(state.settings.dedupeOnSave, true);
  assert.equal(Object.hasOwn(state.settings, "includePinnedTabs"), false);
  assert.equal(Object.hasOwn(state.settings, "excludeUrlPatterns"), false);
});

test("normalizes legacy capture settings away without bumping schema", () => {
  const state = normalizeState({
    settings: {
      theme: "dark",
      includePinnedTabs: true,
      excludeUrlPatterns: ["chrome://*"]
    }
  });

  assert.equal(state.version, 1);
  assert.equal(state.settings.theme, "dark");
  assert.equal(Object.hasOwn(state.settings, "includePinnedTabs"), false);
  assert.equal(Object.hasOwn(state.settings, "excludeUrlPatterns"), false);
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

test("rejects trimmed case-insensitive duplicate category names in one workspace", () => {
  const folders = [{ id: "folder_a", name: "  Work  ", workspaceId: "workspace_a" }];

  const result = validateFolderName(folders, "workspace_a", " work ");

  assert.equal(result.valid, false);
  assert.equal(result.reason, "duplicate");
  assert.equal(result.conflict.id, "folder_a");
});

test("rejects canonically equivalent Unicode category names", () => {
  const folders = [{ id: "folder_a", name: "Café", workspaceId: "workspace_a" }];

  const result = validateFolderName(folders, "workspace_a", "Café");

  assert.equal(result.valid, false);
  assert.equal(result.reason, "duplicate");
});

test("allows category names across workspaces and when renaming itself", () => {
  const folders = [
    { id: "folder_a", name: "Work", workspaceId: "workspace_a" },
    { id: "folder_b", name: "Research", workspaceId: "workspace_b" }
  ];

  assert.equal(validateFolderName(folders, "workspace_b", " work ").valid, true);
  assert.equal(validateFolderName(folders, "workspace_a", " WORK ", "folder_a").valid, true);
});

test("preserves existing duplicate categories during normalization", () => {
  const state = normalizeState({
    workspaces: [{ id: "workspace_a", name: "Personal" }],
    folders: [
      { id: "folder_a", name: "Work", workspaceId: "workspace_a" },
      { id: "folder_b", name: " work ", workspaceId: "workspace_a" }
    ]
  });

  assert.deepEqual(
    state.folders.map(({ id, name }) => ({ id, name })),
    [
      { id: "folder_a", name: "Work" },
      { id: "folder_b", name: " work " }
    ]
  );
});

test("rejects empty category names after trimming", () => {
  const result = validateFolderName([], "workspace_a", "   ");

  assert.equal(result.valid, false);
  assert.equal(result.reason, "empty");
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

test("moves the last saved tab within its session without deleting the session", () => {
  const groups = [
    {
      id: "group_a",
      title: "Saved",
      locked: false,
      note: "",
      updatedAt: "old",
      tabs: [{ id: "tab_a", title: "A", url: "https://a.example" }]
    }
  ];

  const result = moveGroupTabs(
    groups,
    [{ source: "group", groupId: "group_a", tabId: "tab_a" }],
    "group_a",
    "",
    "before",
    "new"
  );

  assert.equal(result.length, 1);
  assert.deepEqual(result[0].tabs.map((tab) => tab.id), ["tab_a"]);
  assert.equal(result[0].updatedAt, "new");
  assert.deepEqual(groups[0].tabs.map((tab) => tab.id), ["tab_a"]);
});

test("moves all selected saved tabs within one session atomically", () => {
  const groups = [
    {
      id: "group_a",
      title: "Saved",
      locked: false,
      note: "",
      updatedAt: "old",
      tabs: [
        { id: "tab_a", title: "A", url: "https://a.example" },
        { id: "tab_b", title: "B", url: "https://b.example" }
      ]
    }
  ];

  const result = moveGroupTabs(
    groups,
    [
      { source: "group", groupId: "group_a", tabId: "tab_a" },
      { source: "group", groupId: "group_a", tabId: "tab_b" }
    ],
    "group_a"
  );

  assert.equal(result.length, 1);
  assert.deepEqual(result[0].tabs.map((tab) => tab.id), ["tab_a", "tab_b"]);
});

test("keeps saved tabs unchanged when the target session no longer exists", () => {
  const groups = [
    {
      id: "group_a",
      title: "Saved",
      locked: false,
      note: "",
      tabs: [{ id: "tab_a", title: "A", url: "https://a.example" }]
    }
  ];

  const result = moveGroupTabs(
    groups,
    [{ source: "group", groupId: "group_a", tabId: "tab_a" }],
    "missing_group"
  );

  assert.equal(result, groups);
  assert.deepEqual(result[0].tabs.map((tab) => tab.id), ["tab_a"]);
});
