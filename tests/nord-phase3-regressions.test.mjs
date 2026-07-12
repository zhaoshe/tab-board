import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const managerSource = readFileSync(new URL("../src/manager.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("sizes the session drag image from the rendered source card", () => {
  const helperStart = managerSource.indexOf("function setGroupDragImage");
  const helperEnd = managerSource.indexOf("\nfunction ", helperStart + 1);
  const helperSource = managerSource.slice(helperStart, helperEnd);

  assert.match(helperSource, /const rect = sourceCard\.getBoundingClientRect\(\)/);
  assert.match(helperSource, /ghost\.style\.width = `\$\{rect\.width\}px`/);
  assert.match(helperSource, /ghost\.style\.height = `\$\{rect\.height\}px`/);
  assert.match(helperSource, /ghost\.style\.minHeight = "0"/);
});

test("clears legacy category elevation from the transparent board surface", () => {
  const managerStyles = stylesSource.slice(stylesSource.indexOf("/* Manager shell */"));
  const categoryRules = [...managerStyles.matchAll(/^\.category-section \{([^}]*)\}/gm)];
  const transparentRule = categoryRules.find((match) => match[1].includes("background: transparent"));

  assert.ok(transparentRule, "Missing transparent category-section board rule");
  assert.match(transparentRule[1], /box-shadow: none/);
});

test("honors the new-session marker when tabs drop on a session edge", () => {
  const dropStart = managerSource.indexOf("async function handleDrop");
  const dropEnd = managerSource.indexOf("\nfunction ", dropStart + 1);
  const dropSource = managerSource.slice(dropStart, dropEnd);

  for (const [kind, action] of [
    ["tab", "moveTabToNewGroup"],
    ["tabs", "moveTabsToNewGroup"],
    ["open-tabs", "addOpenTabsToNewGroup"]
  ]) {
    const edgeBranch = new RegExp(
      `payload\\.kind === "${kind}" && drop === "group-body" && hadGroupInsertMarker[\\s\\S]*?await ${action}\\(`
    );
    assert.match(dropSource, edgeBranch);
  }

  assert.match(
    dropSource,
    /payload\.kind === "open-tabs" && drop === "category-column"[\s\S]*?await addOpenTabsToNewGroup\(/
  );
});
