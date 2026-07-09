import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpenWindowsModel,
  getGroupCardDropPlacement,
  getGroupDropIndicator,
  getGroupReorderTarget,
  getSessionActionLayout,
  isPointInMiddleHalfWithMargin,
  getSessionDropZone,
  shouldRefreshOpenTabsForChange
} from "../src/manager-view.js";

test("builds collapsed window models with one expanded window", () => {
  const model = buildOpenWindowsModel({
    windows: [{ id: 1, tabs: [{ id: 11 }] }, { id: 2, tabs: [{ id: 21 }, { id: 22 }] }],
    selectedWindowId: 2
  });

  assert.equal(model[0].expanded, false);
  assert.equal(model[1].expanded, true);
  assert.equal(model[1].tabCount, 2);
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


test("getSessionActionLayout keeps restore external and the rest in More", () => {
  assert.deepEqual(getSessionActionLayout(3), {
    external: ["restore"],
    menu: ["rename", "note", "lock", "copy", "delete"]
  });
});

test("shouldRefreshOpenTabsForChange only reacts to relevant tab updates", () => {
  assert.equal(shouldRefreshOpenTabsForChange({}), false);
  assert.equal(shouldRefreshOpenTabsForChange({ status: "complete" }), true);
  assert.equal(shouldRefreshOpenTabsForChange({ pendingUrl: "https://example.com" }), true);
});
