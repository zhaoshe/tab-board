import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpenWindowsModel,
  getGroupDropIndicator,
  getSessionActionLayout,
  getSessionDropZone
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

test("returns no insert line when drag target is original group position", () => {
  const target = getGroupDropIndicator({ sourceGroupId: "g1", targetGroupId: "g1", edge: "before" });

  assert.equal(target.showInsertLine, false);
});

test("uses middle half as add-to-session zone", () => {
  assert.equal(getSessionDropZone(0.2), "insert-before");
  assert.equal(getSessionDropZone(0.5), "add-to-session");
  assert.equal(getSessionDropZone(0.8), "insert-after");
});

test("getSessionActionLayout keeps restore external and the rest in More", () => {
  assert.deepEqual(getSessionActionLayout(3), {
    external: ["restore"],
    menu: ["rename", "note", "lock", "copy", "delete"]
  });
});
