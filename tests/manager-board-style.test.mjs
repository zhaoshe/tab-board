import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const managerStyles = styles.slice(styles.indexOf("/* Manager shell */"));

function ruleBody(selector, requiredDeclaration = "") {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...managerStyles.matchAll(new RegExp(`^${escapedSelector} \\{([^}]*)\\}`, "gm"))];
  return matches.find((match) => match[1].includes(requiredDeclaration))?.[1] || matches[0]?.[1] || "";
}

test("places session columns directly on the board canvas", () => {
  const board = ruleBody(".board-workspace");
  const category = ruleBody(".category-section", "padding:");
  const grid = ruleBody(".category-section-grid");

  assert.match(board, /padding: 12px/);
  assert.match(board, /background: var\(--zt-canvas\)/);
  assert.match(category, /padding: 0/);
  assert.match(category, /border: 0/);
  assert.match(category, /border-radius: 0/);
  assert.match(category, /background: transparent/);
  assert.match(grid, /grid-auto-columns: minmax\(320px, 360px\)/);
  assert.match(grid, /gap: 14px/);
  assert.match(grid, /padding: 0 0 8px/);
});

test("uses Nord surfaces for session cards and tab row states", () => {
  const card = ruleBody(".group-card");

  assert.match(card, /border: 1px solid var\(--zt-border-subtle\)/);
  assert.match(card, /border-radius: 12px/);
  assert.match(card, /background: var\(--zt-surface-raised\)/);
  assert.match(card, /box-shadow:[\s\S]*var\(--nord0\)/);
  assert.match(styles, /\.tab-row:hover[\s\S]*background: var\(--zt-surface-subtle\)/);
  assert.match(styles, /\.tab-row\.selected[\s\S]*background: var\(--zt-selection\)/);
  assert.match(styles, /\.group-insert-marker[\s\S]*var\(--zt-accent\)/);
});

test("keeps open and saved tab titles to one ellipsized line", () => {
  assert.match(styles, /\.active-tab-title[\s\S]*text-overflow: ellipsis[\s\S]*white-space: nowrap/);
  const savedTitleRule = styles.match(/\.tab-main a,\s*\.tab-title \{([^}]*)\}/)?.[1] || "";
  assert.match(savedTitleRule, /text-overflow: ellipsis/);
  assert.match(savedTitleRule, /white-space: nowrap/);
  assert.doesNotMatch(savedTitleRule, /-webkit-line-clamp: 2/);
});

test("aligns the selected window and its tab list to the same top edge", () => {
  assert.match(styles, /\.manager-board-shell \.active-tabs-panel \{[\s\S]*padding: 0 4px 10px 0/);
  assert.match(styles, /\.manager-board-shell \.active-window \{[\s\S]*align-content: start/);
  assert.match(styles, /\.manager-board-shell \.active-tab-list \{[\s\S]*padding-top: 0/);
});

test("makes the collapsed sidebar rail a vertically scrolling column", () => {
  const rail = ruleBody(".sidebar-collapsed .sidebar-rail");

  assert.match(rail, /flex-direction: column/);
  assert.match(rail, /overflow-x: hidden/);
  assert.match(rail, /overflow-y: auto/);
});

test("keeps session menus in viewport space without translating the action group", () => {
  assert.match(styles, /\.manager-board-shell \.action-menu-panel \{[\s\S]*?position: fixed/);
  assert.doesNotMatch(styles, /\.row-reveal-action,[\s\S]*?\.group-actions \{[^}]*transform:/);
  assert.doesNotMatch(styles, /\.group-actions \{[^}]*transform:/);
});

test("reveals session actions for hover, keyboard focus, action focus, and open menus", () => {
  assert.match(styles, /\.group-card:hover \.group-actions/);
  assert.match(styles, /\.group-card:focus-visible \.group-actions/);
  assert.match(styles, /\.group-header:has\(\.group-title-inline:focus-visible\) \.group-actions/);
  assert.match(styles, /\.group-actions:focus-within/);
  assert.match(styles, /\.group-actions:has\(\.action-menu\[open\]\)/);
  assert.doesNotMatch(styles, /\.group-card:focus-within \.group-actions/);
});

test("uses one compact size for session Restore and More controls", () => {
  const compact = styles.match(
    /\.group-actions > \.icon-button,[\s\S]*?\.group-actions > \.action-menu > summary\.icon-summary \{([^}]*)\}/
  )?.[1] || "";

  assert.match(compact, /width: var\(--icon-button-small-size\)/);
  assert.match(compact, /height: var\(--icon-button-small-size\)/);
  assert.match(compact, /min-height: var\(--icon-button-small-size\)/);
});

test("reserves category edit space without hiding the category count", () => {
  assert.match(
    styles,
    /\.category-row:has\(\.category-edit-action\) \.folder-button \{[^}]*padding-right: 42px/
  );
  assert.doesNotMatch(
    styles,
    /\.category-row:has\(\.category-edit-action\):hover \.category-count \{[^}]*visibility: hidden/
  );
  assert.doesNotMatch(
    styles,
    /\.category-row:has\(\.category-edit-action\) \.category-count \{[^}]*visibility: hidden/
  );
});
