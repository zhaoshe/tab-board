import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const overlayUrl = new URL("../src/manager-overlays.js", import.meta.url);

test("uses one document-level Web Awesome info popover", () => {
  assert.equal(existsSync(overlayUrl), true);
  const source = readFileSync(overlayUrl, "utf8");
  assert.match(source, /export function installManagerInfoPopover/);
  assert.match(source, /createElement\("wa-popover"\)/);
  assert.match(source, /OPEN_DELAY_MS = 180/);
  assert.match(source, /CLOSE_DELAY_MS = 120/);
  assert.match(source, /data-info-popover/);
  assert.match(source, /dragstart/);
  assert.match(source, /Escape/);
  assert.match(source, /restoreFocus/);
  assert.doesNotMatch(source, /https?:\/\//);
});

test("keeps hover and keyboard focus on the same info-popover trigger path", () => {
  const source = readFileSync(overlayUrl, "utf8");
  assert.match(source, /const infoTrigger = \(target\) => target\?\.closest\?\.\("\[data-info-popover\]"\)/);
  assert.match(source, /const handleMouseOver = \(event\) => \{[\s\S]*?scheduleShow\(trigger\)/);
  assert.match(source, /const handleFocusIn = \(event\) => \{[\s\S]*?scheduleShow\(trigger, 0\)/);
  assert.match(source, /trigger\.id = `ziptab-info-trigger-\$\{triggerCounter\}`/);
  assert.match(source, /trigger\.setAttribute\("aria-haspopup", "dialog"\)/);
  assert.match(source, /trigger\.setAttribute\("aria-expanded", "true"\)/);
});

test("closes the info popover before replacing either tab list", () => {
  const managerSource = readFileSync(new URL("../src/manager.js", import.meta.url), "utf8");
  assert.match(
    managerSource,
    /function renderActiveTabs\(\) \{[\s\S]*?void managerInfoPopover\?\.hide\(\);[\s\S]*?els\.activeTabsPanel\.replaceChildren\(\)/
  );
  assert.match(
    managerSource,
    /function renderGroups\(\) \{[\s\S]*?void managerInfoPopover\?\.hide\(\);[\s\S]*?els\.groupsList\.replaceChildren\(\)/
  );
});

test("closes the interactive info popover before dispatching one of its actions", () => {
  const managerSource = readFileSync(new URL("../src/manager.js", import.meta.url), "utf8");
  assert.match(
    managerSource,
    /const isInfoPopoverAction = Boolean\(button\.closest\("\.manager-info-popover"\)\);[\s\S]*?if \(isInfoPopoverAction\) \{[\s\S]*?await managerInfoPopover\?\.hide\(\);[\s\S]*?\}[\s\S]*?if \(action === "capture-current-window"\)/
  );
  assert.match(
    managerSource,
    /requestAnimationFrame\(\(\) => restoreInfoPopoverActionFocus\(infoPopoverFocusIntent\)\)/
  );
});

test("closes the info popover at shared context-menu entry points", () => {
  const managerSource = readFileSync(new URL("../src/manager.js", import.meta.url), "utf8");
  const openContextMenu = managerSource.match(
    /function openOpenTabContextMenu\([\s\S]*?\n\}/
  )?.[0] || "";
  const savedContextMenu = managerSource.match(
    /function openSavedTabContextMenu\([\s\S]*?\n\}/
  )?.[0] || "";

  assert.match(openContextMenu, /void managerInfoPopover\?\.hide\(\);/);
  assert.match(savedContextMenu, /void managerInfoPopover\?\.hide\(\);/);
  assert.match(managerSource, /handleContextMenu[\s\S]*?openOpenTabContextMenu\(/);
  assert.match(managerSource, /handleContextMenu[\s\S]*?openSavedTabContextMenu\(/);
  assert.match(managerSource, /handleKeyboard[\s\S]*?openOpenTabContextMenu\(/);
  assert.match(managerSource, /handleKeyboard[\s\S]*?openSavedTabContextMenu\(/);
});
