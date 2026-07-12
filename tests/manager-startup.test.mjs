import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  captureOpenTabsSelectionSnapshot,
  createCaptureReconciliationError,
  getCaptureOutcome,
  getOpenWindowSelection,
  isSameOpenTabsSelectionSnapshot,
  startManager
} from "../src/manager-startup.js";

const managerHtml = readFileSync(new URL("../manager.html", import.meta.url), "utf8");
const managerSource = readFileSync(new URL("../src/manager.js", import.meta.url), "utf8");

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

test("prepares and renders the default manager state before persisted state resolves", async () => {
  const stateLoad = createDeferred();
  const openTabsLoad = createDeferred();
  const startupFinished = createDeferred();
  const events = [];
  const startup = startManager({
    initialState: { workspaces: ["default"] },
    prepareShell: () => events.push("prepare"),
    render: (state) => events.push(`render:${state?.workspaces?.[0] || "current"}`),
    loadOpenTabs: () => {
      events.push("open-tabs");
      return openTabsLoad.promise;
    },
    loadState: () => stateLoad.promise,
    applyState: (state) => events.push(`apply:${state.workspaces[0]}`),
    migrate: async () => events.push("migrate"),
    initializePopover: () => events.push("popover"),
    onLoaded: () => {
      events.push("feedback");
      startupFinished.resolve();
    },
    onStartupError: () => events.push("error")
  });

  assert.deepEqual(events, ["prepare", "render:default", "open-tabs", "popover"]);

  stateLoad.resolve({ workspaces: ["persisted"] });
  await startupFinished.promise;

  assert.deepEqual(events, [
    "prepare",
    "render:default",
    "open-tabs",
    "popover",
    "apply:persisted",
    "migrate",
    "render:current",
    "feedback"
  ]);

  openTabsLoad.resolve();
  await openTabsLoad.promise;
});

test("does not apply a stale loaded state after storage changes during load", async () => {
  const stateLoad = createDeferred();
  const events = [];
  let revision = 0;
  const startup = startManager({
    initialState: { workspaces: ["default"] },
    render: (state) => events.push(`render:${state?.workspaces?.[0] || "current"}`),
    loadOpenTabs: async () => {},
    loadState: () => stateLoad.promise,
    getStateRevision: () => revision,
    applyState: () => events.push("apply:stale"),
    migrate: async () => events.push("migrate:stale"),
    initializePopover: () => {},
    onLoaded: () => events.push("feedback"),
    onStartupError: (stage) => events.push(`error:${stage}`)
  });

  stateLoad.resolve({ workspaces: ["stale"] });
  revision = 1;
  await startup;

  assert.deepEqual(events, ["render:default", "render:current", "feedback"]);
});

test("reports shell startup failures without rejecting", async () => {
  const events = [];
  await startManager({
    initialState: { workspaces: ["default"] },
    prepareShell: () => {
      throw new Error("shell unavailable");
    },
    render: () => events.push("render"),
    loadOpenTabs: async () => events.push("open-tabs"),
    loadState: async () => ({ workspaces: ["persisted"] }),
    applyState: () => events.push("apply"),
    migrate: async () => events.push("migrate"),
    initializePopover: () => events.push("popover"),
    onLoaded: () => events.push("feedback"),
    onStartupError: (stage, error) => events.push(`error:${stage}:${error.message}`)
  });

  assert.deepEqual(events, ["error:shell:shell unavailable"]);
});

test("keeps default manager state rendered when storage or popover startup fails", async () => {
  const events = [];
  await startManager({
    initialState: { workspaces: ["default"] },
    prepareShell: () => events.push("prepare"),
    render: (state) => events.push(`render:${state?.workspaces?.[0] || "current"}`),
    loadOpenTabs: async () => events.push("open-tabs"),
    loadState: async () => {
      throw new Error("storage unavailable");
    },
    applyState: () => events.push("apply"),
    migrate: async () => events.push("migrate"),
    initializePopover: () => {
      throw new Error("popover unavailable");
    },
    onStartupError: (stage, error) => events.push(`error:${stage}:${error.message}`)
  });

  assert.deepEqual(events, [
    "prepare",
    "render:default",
    "open-tabs",
    "error:popover:popover unavailable",
    "error:state:storage unavailable"
  ]);
});

test("finishes with loaded state and initial feedback after popover failure", async () => {
  const events = [];
  await startManager({
    initialState: { workspaces: ["default"] },
    prepareShell: () => events.push("prepare"),
    render: (state) => events.push(`render:${state?.workspaces?.[0] || "current"}`),
    loadOpenTabs: async () => events.push("open-tabs"),
    loadState: async () => ({ workspaces: ["persisted"] }),
    applyState: (state) => events.push(`apply:${state.workspaces[0]}`),
    migrate: async () => events.push("migrate"),
    initializePopover: () => {
      throw new Error("popover unavailable");
    },
    onLoaded: () => events.push("feedback"),
    onStartupError: (stage) => events.push(`error:${stage}`)
  });

  assert.deepEqual(events, [
    "prepare",
    "render:default",
    "open-tabs",
    "error:popover",
    "apply:persisted",
    "migrate",
    "render:current",
    "feedback"
  ]);
});

test("reports migration failure without blocking final render or initial feedback", async () => {
  const events = [];
  await startManager({
    initialState: { workspaces: ["default"] },
    render: (state) => events.push(`render:${state?.workspaces?.[0] || "current"}`),
    loadOpenTabs: async () => {},
    loadState: async () => ({ workspaces: ["persisted"] }),
    applyState: () => events.push("apply"),
    migrate: async () => {
      throw new Error("migration unavailable");
    },
    initializePopover: () => {},
    onLoaded: () => events.push("feedback"),
    onStartupError: (stage, error) => events.push(`error:${stage}:${error.message}`)
  });

  assert.deepEqual(events, [
    "render:default",
    "apply",
    "error:migration:migration unavailable",
    "render:current",
    "feedback"
  ]);
});

test("tests Web Awesome window selection value precedence and routing", () => {
  const windowSelect = { value: "99" };
  const targetValueWindow = { value: "7" };
  const emptyWindow = { value: "" };

  assert.deepEqual(
    getOpenWindowSelection({ target: windowSelect, detail: { item: { value: "42" } } }, windowSelect),
    { selectedOpenWindowId: 42, clearSelection: true, render: true }
  );
  assert.deepEqual(getOpenWindowSelection({ target: targetValueWindow }, targetValueWindow), {
    selectedOpenWindowId: 7,
    clearSelection: true,
    render: true
  });
  assert.deepEqual(getOpenWindowSelection({ target: emptyWindow, detail: {} }, emptyWindow), {
    selectedOpenWindowId: null,
    clearSelection: true,
    render: true
  });
  assert.deepEqual(getOpenWindowSelection({ target: windowSelect, value: "9" }, windowSelect), {
    selectedOpenWindowId: 99,
    clearSelection: true,
    render: true
  });
  assert.equal(getOpenWindowSelection({ target: { value: "9" } }, windowSelect), null);
});

test("compares selected capture snapshots independent of Set insertion order", () => {
  const initial = captureOpenTabsSelectionSnapshot({
    selectedTabIds: new Set(["12", "7"]),
    selectedWindowId: 3,
    selectMode: true,
    workspaceId: "work-a"
  });
  const sameSelection = captureOpenTabsSelectionSnapshot({
    selectedTabIds: new Set(["7", "12"]),
    selectedWindowId: 3,
    selectMode: true,
    workspaceId: "work-a"
  });
  const differentTabs = captureOpenTabsSelectionSnapshot({
    selectedTabIds: new Set(["7", "13"]),
    selectedWindowId: 3,
    selectMode: true
  });
  const differentWindow = captureOpenTabsSelectionSnapshot({
    selectedTabIds: new Set(["7", "12"]),
    selectedWindowId: 4,
    selectMode: true
  });
  const differentMode = captureOpenTabsSelectionSnapshot({
    selectedTabIds: new Set(["7", "12"]),
    selectedWindowId: 3,
    selectMode: false,
    workspaceId: "work-a"
  });
  const differentWorkspace = captureOpenTabsSelectionSnapshot({
    selectedTabIds: new Set(["7", "12"]),
    selectedWindowId: 3,
    selectMode: true,
    workspaceId: "work-b"
  });

  assert.equal(isSameOpenTabsSelectionSnapshot(initial, sameSelection), true);
  assert.equal(isSameOpenTabsSelectionSnapshot(initial, differentTabs), false);
  assert.equal(isSameOpenTabsSelectionSnapshot(initial, differentWindow), false);
  assert.equal(isSameOpenTabsSelectionSnapshot(initial, differentMode), false);
  assert.equal(isSameOpenTabsSelectionSnapshot(initial, differentWorkspace), false);
});

test("treats an unchanged empty selected-tab state as equivalent", () => {
  const snapshot = captureOpenTabsSelectionSnapshot({ selectedTabIds: new Set(), selectedWindowId: null, selectMode: false });

  assert.equal(
    isSameOpenTabsSelectionSnapshot(snapshot, {
      selectedTabIds: [],
      selectedWindowId: null,
      selectMode: false
    }),
    true
  );
});

test("does not consume selection when runtime capture rejects", () => {
  assert.deepEqual(
    getCaptureOutcome({ isCaptureCommitted: false, isCaptureReconciled: false, isSelectionCurrent: true }),
    { isSaved: false, shouldClearSelection: false, shouldShowSuccess: false }
  );
});

test("consumes an unchanged selection after a committed capture", () => {
  assert.deepEqual(
    getCaptureOutcome({ isCaptureCommitted: true, isCaptureReconciled: true, isSelectionCurrent: true }),
    { isSaved: true, shouldClearSelection: true, shouldShowSuccess: true }
  );
});

test("does not consume a changed selection after a committed capture", () => {
  assert.deepEqual(
    getCaptureOutcome({ isCaptureCommitted: true, isCaptureReconciled: true, isSelectionCurrent: false }),
    { isSaved: true, shouldClearSelection: false, shouldShowSuccess: true }
  );
});

test("marks a committed capture saved without success feedback when reconciliation fails", () => {
  assert.deepEqual(
    getCaptureOutcome({ isCaptureCommitted: true, isCaptureReconciled: false, isSelectionCurrent: true }),
    { isSaved: true, shouldClearSelection: true, shouldShowSuccess: false }
  );
});

test("wraps reconciliation failures with saved-session context and preserves the cause", () => {
  const cause = new Error("storage unavailable");
  const wrapped = createCaptureReconciliationError(cause);

  assert.equal(wrapped.message, "Session was saved, but ZipTab could not locate it.");
  assert.equal(wrapped.cause, cause);
});

test("loads Web Awesome controls independently before the manager module", () => {
  assert.match(
    managerHtml,
    /<script type="module" src="src\/webawesome-controls\.js"><\/script>\s*<script type="module" src="src\/manager\.js"><\/script>/
  );
  assert.doesNotMatch(managerSource, /import "\.\/webawesome-controls\.js";/);
});

test("handles the Web Awesome window select before workspace actions", () => {
  assert.match(managerSource, /getOpenWindowSelection\(event, els\.windowSelect\)/);
  assert.match(
    managerSource,
    /if \(windowSelection\) \{[\s\S]*?selectedOpenWindowId = windowSelection\.selectedOpenWindowId;[\s\S]*?clearOpenTabsSelection\(\);[\s\S]*?renderActiveTabs\(\);[\s\S]*?return;/
  );
  assert.match(managerSource, /const value = String\(event\.detail\?\.item\?\.value \?\? event\.target\?\.value \?\? ""\);/);
});

test("starts the shell before storage and tolerates a missing info popover", () => {
  assert.match(managerSource, /startManager\(\{[\s\S]*?prepareShell\(\)/);
  assert.match(managerSource, /loadState: getState/);
  assert.match(managerSource, /state = normalizeState\(loadedState\)/);
  assert.match(managerSource, /ensureActiveWorkspace\(\);[\s\S]*?migrate: migrateLegacyQuickList/);
  assert.match(managerSource, /onLoaded: handleInitialTargetFeedback/);
  assert.match(managerSource, /getStateRevision: \(\) => stateRevision/);
  assert.match(managerSource, /stateRevision \+= 1/);
  assert.match(managerSource, /managerInfoPopover\?\.hide\(\)/);
});

test("uses accurate user-visible messages for startup error stages", () => {
  assert.match(
    managerSource,
    /stage === "migration"[\s\S]*?Unable to migrate legacy saved tabs\. Your saved tabs are still available\./
  );
  assert.match(managerSource, /stage === "open-tabs"[\s\S]*?Unable to load open tabs:/);
  assert.match(managerSource, /stage === "loaded"[\s\S]*?Unable to finish loading saved tabs\./);
  assert.match(managerSource, /stage === "shell"[\s\S]*?Unable to start the manager interface\./);
});
