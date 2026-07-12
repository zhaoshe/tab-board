import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCategoryItemModel,
  buildFaviconSlotModel,
  buildOpenWindowsModel,
  buildRowActionModel,
  buildSessionCardView,
  buildSessionHeaderModel,
  buildSidebarRailModel,
  buildTabInfoPopoverModel,
  buildWorkspaceMenuModel,
  buildWorkspaceStatsPresentation,
  filterOpenTabs,
  filterStorableOpenTabIds,
  getBoardCategoryFilter,
  getFloatingMenuPosition,
  getGroupCardDropPlacement,
  getGroupDropIndicator,
  getGroupReorderTarget,
  getMenuItemNavigationIndex,
  getSessionActionLayout,
  getVisibleGroupTabs,
  isContextMenuKey,
  isPointInMiddleHalfWithMargin,
  isRenameActivationKey,
  isStorableOpenTab,
  getOpenTabStatusMessage,
  shouldRestoreKeyboardFocus,
  shouldRestoreOpenTabContextFocus,
  shouldRestoreOpenTabSelectionFocus,
  shouldRestoreSavedTabSelectionFocus,
  sortOpenTabs,
  getSessionDropZone,
  shouldRefreshOpenTabsForChange,
  buildOrderedCategoryIds,
  reorderCategoryIds,
  removeCategoryIdFromOrder
} from "../src/manager-view.js";

test("builds collapsed window models with one expanded window", () => {
  const model = buildOpenWindowsModel({
    windows: [{ id: 1, tabs: [{ id: 11 }] }, { id: 2, tabs: [{ id: 21 }, { id: 22 }] }],
    selectedWindowId: 2
  });

  assert.equal(model[0].expanded, false);
  assert.equal(model[0].selected, false);
  assert.equal(model[1].expanded, true);
  assert.equal(model[1].selected, true);
  assert.equal(model[1].tabCount, 2);
});

test("builds compact window labels without exposing Chrome window IDs", () => {
  const model = buildOpenWindowsModel({
    windows: [
      { id: 9142, focused: true, tabs: [{ id: 11 }], tabCount: 3 },
      { id: 2871, tabs: [{ id: 21 }] }
    ]
  });

  assert.deepEqual(
    model.map(({ label, accessibleLabel }) => ({ label, accessibleLabel })),
    [
      { label: "Window 1 · 3", accessibleLabel: "Window 1, 3 tabs, active browser window" },
      { label: "Window 2 · 1", accessibleLabel: "Window 2, 1 tab" }
    ]
  );
  assert.equal(model.some((windowInfo) => windowInfo.label.includes("9142")), false);
});

test("builds one workspace dropdown model with switch and management actions", () => {
  const model = buildWorkspaceMenuModel({
    workspaces: [
      { id: "work_a", name: "Personal" },
      { id: "work_b", name: "Research" }
    ],
    activeWorkspaceId: "work_b",
    savedTabCount: 12,
    groupCount: 4
  });

  assert.equal(model.label, "Research");
  assert.equal(model.stats, "12 saved tabs · 4 sessions");
  assert.deepEqual(model.options, [
    { id: "work_a", label: "Personal", selected: false },
    { id: "work_b", label: "Research", selected: true }
  ]);
  assert.deepEqual(model.actions, ["create-workspace", "rename-workspace"]);
});

test("uses reported total tab count when filtered tabs are hidden", () => {
  const model = buildOpenWindowsModel({
    windows: [
      { id: 1, tabs: [{ id: 11 }], tabCount: 3 },
      { id: 2, tabs: [{ id: 21 }, { id: 22 }], tabCount: "unknown" },
      { id: 3, tabs: [{ id: 31 }, { id: 32 }], tabCount: 1 }
    ]
  });

  assert.equal(model[0].tabCount, 3);
  assert.equal(model[1].tabCount, 2);
  assert.equal(model[2].tabCount, 2);
});

test("uses focused window as expanded fallback", () => {
  const model = buildOpenWindowsModel({
    windows: [{ id: 1, focused: false, tabs: [] }, { id: 2, focused: true, tabs: [] }]
  });

  assert.equal(model[1].expanded, true);
});

test("falls back when selected window no longer exists", () => {
  const model = buildOpenWindowsModel({
    windows: [{ id: 1, focused: false, tabs: [] }, { id: 2, focused: true, tabs: [] }],
    selectedWindowId: 9
  });

  assert.equal(model[0].expanded, false);
  assert.equal(model[1].expanded, true);
});

test("sortOpenTabs orders one list by Chrome tab index without mutating input", () => {
  const tabs = [
    { id: 1, pinned: false, index: 3 },
    { id: 2, pinned: true, index: 1 },
    { id: 3, pinned: true, index: 0 },
    { id: 4, pinned: false, index: 2 }
  ];

  const result = sortOpenTabs(tabs);

  assert.deepEqual(result.map((tab) => tab.id), [3, 2, 4, 1]);
  assert.deepEqual(tabs.map((tab) => tab.id), [1, 2, 3, 4]);
});

test("sortOpenTabs handles missing indexes after indexed tabs", () => {
  assert.deepEqual(
    sortOpenTabs([{ id: 1 }, { id: 2, index: 0 }, { id: 3, index: 2 }]).map((tab) => tab.id),
    [2, 3, 1]
  );
});

test("filterOpenTabs returns no rows when the query does not match", () => {
  const tabs = [{ id: 1, title: "Docs", url: "https://developer.example" }];

  assert.deepEqual(filterOpenTabs(tabs, "missing"), []);
});

test("filterOpenTabs matches titles and URLs case-insensitively", () => {
  const tabs = [
    { id: 1, title: "Claude Code", url: "https://claude.example" },
    { id: 2, title: "Docs", url: "https://developer.example/reference" }
  ];

  assert.deepEqual(filterOpenTabs(tabs, "CLAUDE").map((tab) => tab.id), [1]);
  assert.deepEqual(filterOpenTabs(tabs, "reference").map((tab) => tab.id), [2]);
  assert.deepEqual(filterOpenTabs(tabs, ""), tabs);
});

test("filters and sorts pinned and regular tabs in one list", () => {
  const tabs = [
    { id: 1, pinned: true, storable: false, title: "Keep match", url: "chrome://settings", index: 0 },
    { id: 2, pinned: false, storable: true, title: "Keep match", url: "https://regular.example", index: 1 },
    { id: 3, pinned: true, storable: false, title: "Hide", url: "file:///tmp/report.html", index: 2 }
  ];

  const result = sortOpenTabs(filterOpenTabs(tabs, "keep"));

  assert.deepEqual(result.map((tab) => tab.id), [1, 2]);
});

test("keeps only selected visible storable open tab IDs", () => {
  assert.deepEqual(
    filterStorableOpenTabIds(new Set(["11", "12", "13"]), [
      { id: 11, storable: true },
      { id: 12, storable: false },
      { id: 14, storable: true }
    ]),
    ["11"]
  );
});

test("uses one strict storable capability for open tab gates", () => {
  assert.equal(isStorableOpenTab({ storable: true }), true);
  assert.equal(isStorableOpenTab({ storable: false }), false);
  assert.equal(isStorableOpenTab({}), false);
});

test("explains why an open tab cannot be saved", () => {
  assert.equal(getOpenTabStatusMessage({ storable: true, url: "https://example.com" }), "");
  assert.equal(getOpenTabStatusMessage({ storable: false, url: "" }), "No usable URL");
  assert.equal(getOpenTabStatusMessage({ storable: false, url: "chrome-extension://ziptab/manager.html" }), "Cannot save this tab");
});

test("restores focus only for keyboard-opened open-tab menus with a trigger", () => {
  assert.equal(shouldRestoreOpenTabContextFocus({ openedByKeyboard: true, triggerId: "11" }), true);
  assert.equal(shouldRestoreOpenTabContextFocus({ openedByKeyboard: false, triggerId: "11" }), false);
  assert.equal(shouldRestoreOpenTabContextFocus({ openedByKeyboard: true, triggerId: "" }), false);
});

test("restores open-tab selection focus only for the focused user control", () => {
  assert.equal(
    shouldRestoreOpenTabSelectionFocus({ isUserAction: true, focusedTabId: "11", targetTabId: 11 }),
    true
  );
  assert.equal(
    shouldRestoreOpenTabSelectionFocus({ isUserAction: false, focusedTabId: "11", targetTabId: "11" }),
    false
  );
  assert.equal(
    shouldRestoreOpenTabSelectionFocus({ isUserAction: true, focusedTabId: "11", targetTabId: "12" }),
    false
  );
});

test("restores focus only for trusted keyboard activation", () => {
  assert.equal(shouldRestoreKeyboardFocus({ detail: 0, isTrusted: true }), true);
  assert.equal(shouldRestoreKeyboardFocus({ detail: 1, isTrusted: true }), false);
  assert.equal(shouldRestoreKeyboardFocus({ detail: 0, isTrusted: false }), false);
});

test("recognizes context menu keyboard commands", () => {
  assert.equal(isContextMenuKey({ key: "ContextMenu" }), true);
  assert.equal(isContextMenuKey({ key: "F10", shiftKey: true }), true);
  assert.equal(isContextMenuKey({ key: "F10", shiftKey: false }), false);
  assert.equal(isContextMenuKey({ key: "Enter", shiftKey: true }), false);
});

test("recognizes all session rename activation keys", () => {
  assert.equal(isRenameActivationKey("Enter"), true);
  assert.equal(isRenameActivationKey("F2"), true);
  assert.equal(isRenameActivationKey(" "), true);
  assert.equal(isRenameActivationKey("ArrowDown"), false);
});

test("wraps menu item navigation in both directions", () => {
  assert.equal(getMenuItemNavigationIndex(0, 2, "down"), 1);
  assert.equal(getMenuItemNavigationIndex(1, 2, "down"), 0);
  assert.equal(getMenuItemNavigationIndex(0, 2, "up"), 1);
  assert.equal(getMenuItemNavigationIndex(1, 2, "up"), 0);
  assert.equal(getMenuItemNavigationIndex(0, 0, "down"), -1);
});

test("returns no insert line when drag target is original group position", () => {
  const target = getGroupDropIndicator({ sourceGroupId: "g1", targetGroupId: "g1", edge: "before" });

  assert.equal(target.showInsertLine, false);
});

test("keeps insert line for empty category targets", () => {
  const target = getGroupDropIndicator({ edge: "end" });

  assert.equal(target.showInsertLine, true);
});

test("uses middle half as add-to-session zone", () => {
  assert.equal(getSessionDropZone(0.2), "insert-before");
  assert.equal(getSessionDropZone(0.5), "add-to-session");
  assert.equal(getSessionDropZone(0.8), "insert-after");
});

test("group reorder keeps source slot until pointer crosses next card midpoint", () => {
  const rects = [
    { left: 120, top: 20, width: 100, height: 80 },
    { left: 240, top: 20, width: 100, height: 80 }
  ];

  assert.deepEqual(getGroupReorderTarget(rects, { x: 150, y: 60 }), { targetIndex: 0, placement: "before" });
  assert.deepEqual(getGroupReorderTarget(rects, { x: 190, y: 60 }), { targetIndex: 1, placement: "before" });
  assert.deepEqual(getGroupReorderTarget(rects, { x: 310, y: 60 }), { targetIndex: 1, placement: "after" });
});

test("group card hover keeps edge quarters and uses target slot in middle half", () => {
  assert.equal(getGroupCardDropPlacement(1, 2, 0.1), "before");
  assert.equal(getGroupCardDropPlacement(1, 2, 0.5), "after");
  assert.equal(getGroupCardDropPlacement(2, 1, 0.5), "before");
  assert.equal(getGroupCardDropPlacement(2, 1, 0.9), "after");
  assert.equal(getGroupCardDropPlacement(-1, 1, 0.5), "before");
});

test("group reorder uses vertical midpoints in single-column layout", () => {
  const rects = [
    { left: 20, top: 20, width: 320, height: 80 },
    { left: 20, top: 120, width: 320, height: 80 }
  ];

  assert.deepEqual(getGroupReorderTarget(rects, { x: 60, y: 70 }, "y"), { targetIndex: 1, placement: "before" });
  assert.deepEqual(getGroupReorderTarget(rects, { x: 60, y: 180 }, "y"), { targetIndex: 1, placement: "after" });
});


test("middle-half hit testing keeps a release margin for locked drag targets", () => {
  const rect = { left: 100, right: 300 };

  assert.equal(isPointInMiddleHalfWithMargin(rect, 145, 0), false);
  assert.equal(isPointInMiddleHalfWithMargin(rect, 145, 10), true);
  assert.equal(isPointInMiddleHalfWithMargin(rect, 255, 10), true);
  assert.equal(isPointInMiddleHalfWithMargin(rect, 265, 10), false);
});


test("getFloatingMenuPosition clamps menus inside the viewport", () => {
  assert.deepEqual(
    getFloatingMenuPosition(
      { top: 40, right: 790, bottom: 70 },
      { width: 180, height: 220 },
      { width: 800, height: 600 }
    ),
    { top: 76, left: 608 }
  );
});

test("getFloatingMenuPosition flips above anchors near the viewport bottom", () => {
  assert.deepEqual(
    getFloatingMenuPosition(
      { top: 540, right: 420, bottom: 570 },
      { width: 180, height: 180 },
      { width: 800, height: 600 }
    ),
    { top: 354, left: 240 }
  );
});

test("getBoardCategoryFilter maps sessions to top category tabs", () => {
  assert.equal(getBoardCategoryFilter({}), "inbox");
  assert.equal(getBoardCategoryFilter({ folderId: "research" }), "folder:research");
  assert.equal(getBoardCategoryFilter({ folderId: "research", starred: true }), "starred");
});

test("buildSessionCardView prepares tabExtend-style card chrome", () => {
  const view = buildSessionCardView({
    locked: true,
    starred: true,
    tabs: [
      { itemType: "link", url: "https://a.example", favIconUrl: "a.png" },
      { itemType: "link", url: "https://b.example", favIconUrl: "b.png" },
      { itemType: "link", url: "https://c.example" },
      { itemType: "note" }
    ]
  });

  assert.equal(view.restorableCount, 3);
  assert.equal(view.noteCount, 1);
  assert.equal(view.faviconTabs.length, 2);
  assert.equal(view.overflowCount, 1);
  assert.deepEqual(view.statusLabels, ["Locked", "Starred"]);
  assert.equal(view.metaText, "3 links · 1 note");
});

test("getSessionActionLayout keeps restore external and board actions in More", () => {
  assert.deepEqual(getSessionActionLayout(3), {
    external: ["restore"],
    menu: ["add", "rename", "note", "lock", "copy", "delete"]
  });
});

test("returns all matching session tabs without preview slicing", () => {
  const tabs = Array.from({ length: 8 }, (_, index) => ({
    id: index,
    itemType: "link",
    title: `Tab ${index}`,
    url: `https://example.com/${index}`
  }));

  assert.equal(getVisibleGroupTabs({ title: "Session", tabs }, "").length, 8);
  assert.deepEqual(getVisibleGroupTabs({ title: "Session", tabs }, "Tab 7").map((tab) => tab.id), [7]);
});

test("shouldRefreshOpenTabsForChange only reacts to relevant tab updates", () => {
  assert.equal(shouldRefreshOpenTabsForChange({}), false);
  assert.equal(shouldRefreshOpenTabsForChange({ status: "complete" }), true);
  assert.equal(shouldRefreshOpenTabsForChange({ pendingUrl: "https://example.com" }), true);
});

test("buildFaviconSlotModel keeps one stable icon slot for every item", () => {
  assert.deepEqual(
    buildFaviconSlotModel({ itemType: "link", url: "https://example.com", favIconUrl: "icon.png" }),
    { kind: "image", src: "icon.png", fallbackIcon: "globe-alt" }
  );
  assert.deepEqual(
    buildFaviconSlotModel({ itemType: "link", url: "https://example.com", favIconUrl: "icon.png" }, { hasImageError: true }),
    { kind: "icon", icon: "globe-alt" }
  );
  assert.deepEqual(buildFaviconSlotModel({ itemType: "link", url: "https://example.com" }), {
    kind: "icon",
    icon: "globe-alt"
  });
  assert.deepEqual(buildFaviconSlotModel({ itemType: "link", url: "" }), {
    kind: "icon",
    icon: "file-text"
  });
  assert.deepEqual(buildFaviconSlotModel({ itemType: "note" }), {
    kind: "icon",
    icon: "sticky-note"
  });
});

test("buildCategoryItemModel exposes edit only for custom categories", () => {
  assert.deepEqual(buildCategoryItemModel({ id: "inbox", filter: "inbox", label: "Inbox", count: 3 }), {
    id: "inbox",
    filter: "inbox",
    label: "Inbox",
    count: 3,
    folderId: "",
    builtIn: true,
    editable: false
  });
  assert.deepEqual(
    buildCategoryItemModel({
      id: "category_research",
      filter: "folder:research",
      label: "Research",
      count: 4,
      folder: { id: "research" }
    }),
    {
      id: "category_research",
      filter: "folder:research",
      label: "Research",
      count: 4,
      folderId: "research",
      builtIn: false,
      editable: true
    }
  );
});

test("buildSidebarRailModel reuses the selected window and filtered open-tab order", () => {
  const model = buildSidebarRailModel({
    windows: [
      { id: 1, focused: true, tabs: [{ id: 11, index: 1, title: "Later", url: "https://later.example" }] },
      {
        id: 2,
        tabs: [
          { id: 22, index: 1, title: "Docs", url: "https://docs.example", favIconUrl: "docs.png", active: true },
          { id: 21, index: 0, title: "Search", url: "https://search.example", pinned: true }
        ]
      }
    ],
    selectedWindowId: 2,
    query: ""
  });

  assert.deepEqual(model.window, {
    id: 2,
    label: "Window 2 · 2",
    accessibleLabel: "Window 2, 2 tabs",
    tabCount: 2
  });
  assert.deepEqual(model.tabs.map(({ id, icon }) => ({ id, icon })), [
    { id: 21, icon: { kind: "icon", icon: "globe-alt" } },
    { id: 22, icon: { kind: "image", src: "docs.png", fallbackIcon: "globe-alt" } }
  ]);
  assert.equal(model.searchAction, "focus-open-tabs-filter");
});

test("buildSessionHeaderModel keeps one count and only necessary state", () => {
  assert.deepEqual(
    buildSessionHeaderModel({
      title: "Sprint",
      locked: true,
      starred: true,
      tabs: [
        { itemType: "link", url: "https://a.example" },
        { itemType: "link", url: "https://b.example" },
        { itemType: "note" }
      ]
    }),
    {
      title: "Sprint",
      metaText: "2 links · 1 note",
      itemCount: 3,
      statusLabels: ["Locked"]
    }
  );
});

test("buildTabInfoPopoverModel uses only local tab metadata", () => {
  assert.deepEqual(
    buildTabInfoPopoverModel(
      {
        id: "tab_a",
        itemType: "link",
        title: "Architecture",
        url: "https://docs.example/path?q=1",
        note: "Read later",
        createdAt: "2026-07-12T10:00:00.000Z",
        favIconUrl: "docs.png"
      },
      { context: "saved" }
    ),
    {
      id: "tab_a",
      context: "saved",
      title: "Architecture",
      url: "https://docs.example/path?q=1",
      domain: "docs.example",
      note: "Read later",
      savedAt: "2026-07-12T10:00:00.000Z",
      icon: { kind: "image", src: "docs.png", fallbackIcon: "globe-alt" }
    }
  );
});

test("buildWorkspaceStatsPresentation keeps stats out of permanent menu chrome", () => {
  assert.deepEqual(buildWorkspaceStatsPresentation({ savedTabCount: 12, groupCount: 4 }), {
    tooltip: "12 saved tabs · 4 sessions",
    secondaryText: "12 tabs · 4 sessions"
  });
});

test("buildRowActionModel keeps preview in title triggers and actions in trailing slots", () => {
  assert.deepEqual(buildRowActionModel({ kind: "open", selectionMode: false }), ["close"]);
  assert.deepEqual(buildRowActionModel({ kind: "open", selectionMode: true }), ["select"]);
  assert.deepEqual(buildRowActionModel({ kind: "saved", selectionMode: false }), ["more"]);
  assert.deepEqual(buildRowActionModel({ kind: "saved", selectionMode: true }), ["select"]);
});

test("restores saved-tab checkbox focus only after a matching user action", () => {
  assert.equal(
    shouldRestoreSavedTabSelectionFocus({
      isUserAction: true,
      focusedRef: "group:group_a:tab_a",
      targetRef: "group:group_a:tab_a"
    }),
    true
  );
  assert.equal(
    shouldRestoreSavedTabSelectionFocus({
      isUserAction: false,
      focusedRef: "group:group_a:tab_a",
      targetRef: "group:group_a:tab_a"
    }),
    false
  );
  assert.equal(
    shouldRestoreSavedTabSelectionFocus({
      isUserAction: true,
      focusedRef: "group:group_a:tab_a",
      targetRef: "group:group_a:tab_b"
    }),
    false
  );
});

test("builds category order from saved IDs without dropping current categories", () => {
  const categoryIds = ["inbox", "starred", "folder:a", "folder:b"];
  const savedOrder = ["folder:b", "missing", "folder:b", "starred"];

  assert.deepEqual(buildOrderedCategoryIds(categoryIds, savedOrder), [
    "folder:b",
    "starred",
    "inbox",
    "folder:a"
  ]);
  assert.deepEqual(savedOrder, ["folder:b", "missing", "folder:b", "starred"]);
});

test("reorders category IDs before or after target without mutating input", () => {
  const categoryIds = ["inbox", "starred", "folder:a", "folder:b"];

  assert.deepEqual(reorderCategoryIds(categoryIds, "folder:b", "folder:a", "before"), [
    "inbox",
    "starred",
    "folder:b",
    "folder:a"
  ]);
  assert.deepEqual(reorderCategoryIds(categoryIds, "folder:a", "inbox", "after"), [
    "inbox",
    "folder:a",
    "starred",
    "folder:b"
  ]);
  assert.deepEqual(reorderCategoryIds(categoryIds, "folder:a", "folder:a", "before"), categoryIds);
  assert.deepEqual(reorderCategoryIds(categoryIds, "", "inbox", "before"), categoryIds);
  assert.deepEqual(reorderCategoryIds(categoryIds, "missing", "inbox", "before"), categoryIds);
  assert.deepEqual(categoryIds, ["inbox", "starred", "folder:a", "folder:b"]);
});

test("removes deleted category ID from order immutably", () => {
  const categoryIds = ["inbox", "folder:a", "folder:b", "folder:a"];

  assert.deepEqual(removeCategoryIdFromOrder(categoryIds, "folder:a"), ["inbox", "folder:b"]);
  assert.deepEqual(categoryIds, ["inbox", "folder:a", "folder:b", "folder:a"]);
});
