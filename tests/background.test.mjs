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

test("capture closes blank tabs and dedupes source URLs before saving", async () => {
  const sourceTabs = [
    makeTab(11, "https://a.example", { active: true, index: 0 }),
    makeTab(12, "https://a.example", { index: 1 }),
    makeTab(13, "about:blank", { index: 2 }),
    makeTab(14, "chrome://extensions", { index: 3 })
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
  assert.equal(response.result.storedTabs, 1);
  assert.equal(response.result.cleanedDuplicates, 1);
  assert.equal(response.result.closedBlankTabs, 1);
  assert.equal(response.result.skippedByExclude, 1);
  assert.equal(response.result.createdGroupIds.length, 1);
  assert.deepEqual([...chrome.__calls.removedTabs].sort((a, b) => a - b), [11, 12, 13]);
  assert.equal(chrome.__calls.removedTabs.includes(14), false);
});

test("capture passes target group and feedback counts to manager URL", async () => {
  const sourceTabs = [makeTab(11, "https://a.example", { active: true, index: 0 }), makeTab(12, "about:blank", { index: 1 })];
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
  assert.match(managerUrl, /saved=1/);
  assert.match(managerUrl, /blank=1/);
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
