import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, DEFAULT_WORKSPACE_ID, normalizeState } from "../src/model.js";

let importCounter = 0;

function makeState(overrides = {}) {
  return normalizeState({
    workspaces: [{ id: DEFAULT_WORKSPACE_ID, name: "Personal" }],
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    groups: [],
    folders: [],
    categoryOrderByWorkspace: {},
    quickList: [],
    bin: [],
    settings: { ...DEFAULT_SETTINGS },
    ...overrides
  });
}

function makeLink(id, url, overrides = {}) {
  return {
    id,
    itemType: "link",
    title: id,
    url,
    favIconUrl: "",
    note: "",
    pinned: false,
    incognito: false,
    starred: false,
    taskStatus: "none",
    browserGroup: null,
    sourceWindowId: 1,
    sourceTabId: 10,
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
    ...overrides
  };
}

function makeTab(id, url, overrides = {}) {
  return {
    id,
    windowId: 1,
    index: id,
    title: `Tab ${id}`,
    url,
    favIconUrl: "",
    active: false,
    pinned: false,
    highlighted: false,
    ...overrides
  };
}

function defaultQueryTabs(query = {}) {
  if (query.active) {
    return [{ id: 1, windowId: 1, index: 0, url: "https://active.example" }];
  }
  if (Object.keys(query).length === 0) {
    return [];
  }
  return [{ id: 1, windowId: 1, index: 0, url: "https://active.example" }];
}

function makeChrome(initialState, hooks = {}) {
  let storedState = makeState(initialState);
  const listeners = {};
  const calls = {
    createdTabs: [],
    focusedWindows: [],
    removedTabs: [],
    updatedTabs: [],
    windowCreates: []
  };
  let nextTabId = 100;

  const addListener = (key) => (fn) => {
    listeners[key] = fn;
  };

  const chrome = {
    __calls: calls,
    __listeners: listeners,
    __getStoredState: () => storedState,
    __setStoredState: (nextState) => {
      storedState = makeState(nextState);
    },
    runtime: {
      getURL: (path = "") => `chrome-extension://ziptab/${path}`,
      onInstalled: { addListener: addListener("installed") },
      onStartup: { addListener: addListener("startup") },
      onMessage: { addListener: addListener("message") },
      openOptionsPage: async () => undefined
    },
    action: {
      onClicked: { addListener: addListener("action") },
      setPopup: async () => undefined,
      setTitle: async () => undefined
    },
    commands: { onCommand: { addListener: addListener("command") } },
    contextMenus: {
      onClicked: { addListener: addListener("contextMenu") },
      removeAll: (callback) => callback?.(),
      create: () => undefined
    },
    storage: {
      onChanged: { addListener: addListener("storage") },
      local: {
        get: async () => ({ ziptabState: structuredClone(storedState) }),
        set: async (value) => {
          storedState = makeState(value.ziptabState);
        }
      }
    },
    omnibox: {
      setDefaultSuggestion: () => undefined,
      onInputChanged: { addListener: addListener("omniboxChanged") },
      onInputEntered: { addListener: addListener("omniboxEntered") }
    },
    windows: {
      create: async (properties) => {
        calls.windowCreates.push(properties);
        return { id: 7, tabs: [{ id: nextTabId++, windowId: 7, index: 0 }] };
      },
      getAll: async () => hooks.openWindows || [],
      update: async (windowId, properties) => {
        calls.focusedWindows.push({ windowId, properties });
        return { id: windowId, ...properties };
      }
    },
    tabs: {
      query: async (query = {}) => hooks.queryTabs?.(query) || defaultQueryTabs(query),
      get: async (tabId) => ({ id: tabId, windowId: 1, index: 0, url: `https://tab-${tabId}.example` }),
      create: async (properties) => {
        hooks.beforeCreateTab?.(storedState, properties);
        if (hooks.failUrls?.has(properties.url)) {
          throw new Error(`Cannot restore ${properties.url}`);
        }
        const tab = { id: nextTabId++, windowId: properties.windowId || 1, index: properties.index || 0, url: properties.url };
        calls.createdTabs.push({ properties, tab });
        return tab;
      },
      remove: async (tabIds) => {
        calls.removedTabs.push(...(Array.isArray(tabIds) ? tabIds : [tabIds]));
      },
      update: async (tabId, properties) => {
        calls.updatedTabs.push({ tabId, properties });
        return { id: tabId, ...properties };
      },
      group: async () => 99
    },
    tabGroups: {
      get: async (groupId) => hooks.browserGroups?.get(groupId) || { title: "", color: "grey", collapsed: false },
      update: async () => undefined
    }
  };

  return chrome;
}

async function loadBackground(chrome) {
  globalThis.chrome = chrome;
  await import(`../src/background.js?background-test=${importCounter++}`);
  return chrome.__listeners.message;
}

function sendMessage(listener, message) {
  return new Promise((resolve) => {
    listener(message, {}, resolve);
  });
}

test("restore removes tabs from latest stored state without overwriting concurrent changes", async () => {
  const initialState = makeState({
    groups: [
      { id: "group_a", title: "A", tabs: [makeLink("tab_a", "https://a.example")], workspaceId: DEFAULT_WORKSPACE_ID }
    ]
  });
  const chrome = makeChrome(initialState, {
    beforeCreateTab(storedState) {
      chrome.__setStoredState({
        ...storedState,
        groups: [
          ...storedState.groups,
          { id: "group_b", title: "B", tabs: [makeLink("tab_b", "https://b.example")], workspaceId: DEFAULT_WORKSPACE_ID }
        ]
      });
    }
  });
  const listener = await loadBackground(chrome);

  const response = await sendMessage(listener, { type: "restore-tab", groupId: "group_a", tabId: "tab_a" });

  assert.equal(response.ok, true);
  assert.deepEqual(chrome.__getStoredState().groups.map((group) => group.id), ["group_b"]);
});

test("restore keeps failed tabs and removes only created tabs", async () => {
  const initialState = makeState({
    groups: [
      {
        id: "group_a",
        title: "A",
        tabs: [makeLink("tab_a", "https://a.example"), makeLink("tab_b", "chrome://settings")],
        workspaceId: DEFAULT_WORKSPACE_ID
      }
    ]
  });
  const chrome = makeChrome(initialState, { failUrls: new Set(["chrome://settings"]) });
  const listener = await loadBackground(chrome);

  const response = await sendMessage(listener, { type: "restore-group", groupId: "group_a" });

  assert.equal(response.ok, true);
  assert.equal(response.result.restoredTabs, 1);
  assert.deepEqual(chrome.__getStoredState().groups[0].tabs.map((tab) => tab.id), ["tab_b"]);
});

test("new window restore respects focusRestoredTabs false", async () => {
  const initialState = makeState({
    settings: { ...DEFAULT_SETTINGS, restoreGroupsInNewWindow: true, focusRestoredTabs: false },
    groups: [
      { id: "group_a", title: "A", tabs: [makeLink("tab_a", "https://a.example")], workspaceId: DEFAULT_WORKSPACE_ID }
    ]
  });
  const chrome = makeChrome(initialState);
  const listener = await loadBackground(chrome);

  const response = await sendMessage(listener, { type: "restore-group", groupId: "group_a" });

  assert.equal(response.ok, true);
  assert.equal(chrome.__calls.windowCreates[0].focused, false);
});

test("list open tabs includes browser group metadata", async () => {
  const chrome = makeChrome(makeState(), {
    openWindows: [
      {
        id: 1,
        focused: true,
        incognito: false,
        tabs: [
          { id: 11, windowId: 1, title: "Grouped", url: "https://grouped.example", groupId: 5, index: 0 }
        ]
      }
    ],
    browserGroups: new Map([[5, { title: "Research", color: "blue", collapsed: true }]])
  });
  const listener = await loadBackground(chrome);

  const response = await sendMessage(listener, { type: "list-open-tabs" });

  assert.equal(response.ok, true);
  assert.deepEqual(response.result.windows[0].tabs[0].browserGroup, {
    sourceGroupId: 5,
    title: "Research",
    color: "blue",
    collapsed: true
  });
});

test("list open tabs returns every tab and preserves raw tab count", async () => {
  const chrome = makeChrome(makeState(), {
    openWindows: [
      {
        id: 1,
        focused: true,
        incognito: false,
        tabs: [
          makeTab(11, "https://visible.example"),
          makeTab(12, "chrome://settings"),
          makeTab(13, "")
        ]
      }
    ]
  });
  const listener = await loadBackground(chrome);

  const response = await sendMessage(listener, { type: "list-open-tabs" });

  assert.equal(response.ok, true);
  assert.equal(response.result.windows[0].tabs.length, 3);
  assert.equal(response.result.windows[0].tabCount, 3);
  assert.deepEqual(response.result.windows[0].tabs.map((tab) => tab.storable), [true, true, false]);
});

test("list open tabs marks pinned and special URLs storable", async () => {
  const chrome = makeChrome(makeState(), {
    openWindows: [
      {
        id: 1,
        focused: true,
        incognito: false,
        tabs: [
          makeTab(11, "https://pinned.example", { pinned: true, index: 0 }),
          makeTab(12, "chrome://settings", { pinned: true, index: 1 }),
          makeTab(13, "file:///tmp/report.html", { pinned: true, index: 2 }),
          makeTab(14, "devtools://devtools", { pinned: true, index: 3 }),
          makeTab(15, "about:blank", { pinned: true, index: 4 }),
          makeTab(16, "chrome-extension://ziptab/manager.html", { pinned: true, index: 5 })
        ]
      }
    ]
  });
  const listener = await loadBackground(chrome);

  const response = await sendMessage(listener, { type: "list-open-tabs" });

  assert.equal(response.ok, true);
  assert.deepEqual(response.result.windows[0].tabs.map((tab) => tab.storable), [true, true, true, true, true, false]);
});

test("list open tabs gives pinned tabs stable fields without a usable URL", async () => {
  const chrome = makeChrome(makeState(), {
    openWindows: [
      {
        id: 1,
        focused: true,
        incognito: false,
        tabs: [{ id: 11, windowId: 1, index: 0, pinned: true, title: "Loading pinned" }]
      }
    ]
  });
  const listener = await loadBackground(chrome);

  const response = await sendMessage(listener, { type: "list-open-tabs" });

  assert.deepEqual(response.result.windows[0].tabs[0], {
    id: 11,
    windowId: 1,
    title: "Loading pinned",
    url: "",
    favIconUrl: "",
    active: false,
    pinned: true,
    index: 0,
    browserGroup: null,
    storable: false
  });
});

test("close open tab message removes the Chrome tab without changing saved state", async () => {
  const initialState = makeState({
    groups: [
      { id: "group_a", title: "Saved", tabs: [makeLink("tab_a", "https://saved.example")], workspaceId: DEFAULT_WORKSPACE_ID }
    ]
  });
  const chrome = makeChrome(initialState);
  const listener = await loadBackground(chrome);

  const response = await sendMessage(listener, { type: "close-open-tab", tabId: 42 });

  assert.equal(response.ok, true);
  assert.deepEqual(response.result, { tabId: 42 });
  assert.deepEqual(chrome.__calls.removedTabs, [42]);
  assert.deepEqual(chrome.__getStoredState().groups, initialState.groups);
});

test("create window message opens a focused normal Chrome window", async () => {
  const chrome = makeChrome(makeState());
  const listener = await loadBackground(chrome);

  const response = await sendMessage(listener, { type: "create-window" });

  assert.equal(response.ok, true);
  assert.equal(response.result.windowId, 7);
  assert.deepEqual(chrome.__calls.windowCreates[0], { focused: true, type: "normal" });
});

test("tab-id capture returns the created group id stored in state", async () => {
  const chrome = makeChrome(makeState());
  const listener = await loadBackground(chrome);

  const response = await sendMessage(listener, {
    type: "capture",
    mode: "tab-ids",
    tabIds: [11, 12],
    openAfter: false
  });

  assert.equal(response.ok, true);
  assert.equal(response.result.createdGroupIds.length, 1);
  assert.equal(response.result.createdGroupIds[0], chrome.__getStoredState().groups[0].id);
  assert.deepEqual(chrome.__getStoredState().groups[0].tabs.map((tab) => tab.sourceTabId), [11, 12]);
});

test("capture saves special URLs and dedupes source URLs without blank cleanup", async () => {
  const sourceTabs = [
    makeTab(11, "https://a.example", { active: true, index: 0 }),
    makeTab(12, "https://a.example", { index: 1 }),
    makeTab(13, "about:blank", { index: 2 }),
    makeTab(14, "chrome://extensions", { index: 3 }),
    makeTab(15, "file:///tmp/report.html", { index: 4 }),
    makeTab(16, "devtools://devtools", { index: 5 }),
    makeTab(17, "chrome-extension://ziptab/manager.html", { index: 6 })
  ];
  const chrome = makeChrome(makeState(), {
    queryTabs(query = {}) {
      if (query.active) {
        return [sourceTabs[0]];
      }
      if (query.windowId === 1) {
        return sourceTabs;
      }
      return [];
    }
  });
  const listener = await loadBackground(chrome);

  const response = await sendMessage(listener, { type: "capture", mode: "current-window" });

  assert.equal(response.ok, true);
  assert.equal(response.result.storedTabs, 5);
  assert.equal(response.result.cleanedDuplicates, 1);
  assert.equal(Object.hasOwn(response.result, "skippedByExclude"), false);
  assert.equal(Object.hasOwn(response.result, "closedBlankTabs"), false);
  assert.deepEqual(chrome.__getStoredState().groups[0].tabs.map((tab) => tab.url), [
    "https://a.example",
    "about:blank",
    "chrome://extensions",
    "file:///tmp/report.html",
    "devtools://devtools"
  ]);
  assert.deepEqual([...chrome.__calls.removedTabs].sort((a, b) => a - b), [11, 12, 13, 14, 15, 16]);
  assert.equal(chrome.__calls.removedTabs.includes(17), false);
});

test("capture dedupe never closes rejected ZipTab tabs", async () => {
  const sourceTabs = [
    makeTab(11, "chrome-extension://ziptab/manager.html", { active: true, index: 0 }),
    makeTab(12, "chrome-extension://ziptab/manager.html", { index: 1 }),
    makeTab(13, "https://save.example", { index: 2 })
  ];
  const chrome = makeChrome(makeState(), {
    queryTabs(query = {}) {
      if (query.active) {
        return [sourceTabs[0]];
      }
      if (query.windowId === 1) {
        return sourceTabs;
      }
      return [];
    }
  });
  const listener = await loadBackground(chrome);

  const response = await sendMessage(listener, {
    type: "capture",
    mode: "current-window",
    openAfter: false
  });

  assert.equal(response.ok, true);
  assert.equal(response.result.storedTabs, 1);
  assert.equal(response.result.cleanedDuplicates, 0);
  assert.deepEqual(chrome.__getStoredState().groups[0].tabs.map((tab) => tab.url), ["https://save.example"]);
  assert.deepEqual(chrome.__calls.removedTabs, [13]);
});

test("capture passes saved and duplicate feedback without blank fields", async () => {
  const sourceTabs = [
    makeTab(11, "https://a.example", { active: true, index: 0 }),
    makeTab(12, "https://a.example", { index: 1 }),
    makeTab(13, "about:blank", { index: 2 })
  ];
  const chrome = makeChrome(makeState(), {
    queryTabs(query = {}) {
      if (query.active) {
        return [sourceTabs[0]];
      }
      if (query.windowId === 1) {
        return sourceTabs;
      }
      return [];
    }
  });
  const listener = await loadBackground(chrome);

  const response = await sendMessage(listener, { type: "capture", mode: "current-window" });

  assert.equal(response.ok, true);
  const managerUrl = chrome.__calls.createdTabs[0].properties.url;
  assert.match(managerUrl, /targetGroupId=group_/);
  assert.match(managerUrl, /saved=2/);
  assert.match(managerUrl, /duplicates=1/);
  assert.doesNotMatch(managerUrl, /(?:blank|excluded|skipped)=/);
});

test("count window duplicates includes loading tabs with pending URLs", async () => {
  const sourceTabs = [
    makeTab(11, "https://a.example", { active: true, index: 0 }),
    makeTab(12, "", { index: 1, status: "loading", pendingUrl: "https://a.example" }),
    makeTab(13, "https://b.example", { index: 2 })
  ];
  const chrome = makeChrome(makeState(), {
    queryTabs(query = {}) {
      if (query.currentWindow) {
        return sourceTabs;
      }
      return defaultQueryTabs(query);
    }
  });
  const listener = await loadBackground(chrome);

  const response = await sendMessage(listener, { type: "count-window-duplicates" });

  assert.equal(response.ok, true);
  assert.equal(response.result.duplicateTabCount, 1);
});

test("dedupe window ignores loading tabs without usable URLs", async () => {
  const sourceTabs = [
    makeTab(11, "https://a.example", { active: true, index: 0 }),
    makeTab(12, "https://a.example", { index: 1 }),
    makeTab(13, "", { index: 2, status: "loading" })
  ];
  const chrome = makeChrome(makeState(), {
    queryTabs(query = {}) {
      if (query.currentWindow) {
        return sourceTabs;
      }
      return defaultQueryTabs(query);
    }
  });
  const listener = await loadBackground(chrome);

  const response = await sendMessage(listener, { type: "dedupe-window" });

  assert.equal(response.ok, true);
  assert.equal(response.result.removedTabs, 1);
  assert.deepEqual(chrome.__calls.removedTabs, [12]);
});

test("capture stores loading tabs from pending URLs", async () => {
  const sourceTabs = [
    makeTab(11, "", { active: true, index: 0, status: "loading", pendingUrl: "https://loading.example" }),
    makeTab(12, "https://ready.example", { index: 1 })
  ];
  const chrome = makeChrome(makeState(), {
    queryTabs(query = {}) {
      if (query.active) {
        return [sourceTabs[0]];
      }
      if (query.windowId === 1) {
        return sourceTabs;
      }
      return [];
    }
  });
  const listener = await loadBackground(chrome);

  const response = await sendMessage(listener, { type: "capture", mode: "current-window", openAfter: false });

  assert.equal(response.ok, true);
  assert.equal(response.result.storedTabs, 2);
  assert.deepEqual(chrome.__getStoredState().groups[0].tabs.map((tab) => tab.url), [
    "https://loading.example",
    "https://ready.example"
  ]);
});

test("open manager targets most recently active ZipTab tab", async () => {
  const managerBase = "chrome-extension://ziptab/manager.html";
  const chrome = makeChrome(makeState(), {
    queryTabs(query = {}) {
      if (Object.keys(query).length === 0) {
        return [
          { id: 21, windowId: 1, url: managerBase, active: false, lastAccessed: 10 },
          { id: 22, windowId: 2, url: managerBase, active: false, lastAccessed: 30 }
        ];
      }
      return defaultQueryTabs(query);
    }
  });
  const listener = await loadBackground(chrome);

  const response = await sendMessage(listener, { type: "open-manager" });

  assert.equal(response.ok, true);
  assert.equal(chrome.__calls.updatedTabs[0].tabId, 22);
});
