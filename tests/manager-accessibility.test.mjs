import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const managerHtml = readFileSync(new URL("../manager.html", import.meta.url), "utf8");
const managerSource = readFileSync(new URL("../src/manager.js", import.meta.url), "utf8");

test("labels the manager dialog and makes the skip-link target focusable", () => {
  assert.match(managerHtml, /<section id="groupsList"[^>]*tabindex="-1"/);
  assert.match(managerHtml, /<dialog id="modal"[^>]*aria-labelledby="modalTitle"/);
});

test("exposes the active category to assistive technology", () => {
  assert.match(
    managerSource,
    /"aria-current": activeFilter === model\.filter \? "page" : undefined/
  );
});

test("uses title and content as the info-popover keyboard triggers", () => {
  assert.match(
    managerSource,
    /const infoTriggerAttributes = \{[\s\S]*?"data-info-popover": "open"[\s\S]*?"aria-haspopup": "dialog"[\s\S]*?"aria-expanded": "false"/
  );
  assert.match(managerSource, /class: "active-tab-content", \.\.\.infoTriggerAttributes/);
  assert.match(
    managerSource,
    /"data-info-popover": "saved"[\s\S]*?"aria-haspopup": "dialog"[\s\S]*?"aria-expanded": "false"/
  );
  assert.match(managerSource, /h\("a", \{ href: tab\.url,[\s\S]*?\.\.\.infoTriggerAttributes \}/);
  assert.match(managerSource, /h\("span", \{ class: "tab-title", \.\.\.infoTriggerAttributes \}/);
  assert.doesNotMatch(managerSource, /class: "tab-main", \.\.\.infoTriggerAttributes/);
  const openRowSource = managerSource.match(/function renderOpenTabRow[\s\S]*?const infoTriggerAttributes/)?.[0] || "";
  const savedRowSource = managerSource.match(/function renderTabRow[\s\S]*?const infoTriggerAttributes/)?.[0] || "";
  assert.doesNotMatch(openRowSource, /data-info-popover|aria-expanded/);
  assert.doesNotMatch(savedRowSource, /data-info-popover|aria-expanded/);
  assert.doesNotMatch(managerSource, /action === "preview"/);
  assert.doesNotMatch(managerSource, /iconOnlyButton\("eye", `Preview/);
});

test("opens saved-tab actions from the keyboard and focuses the menu", () => {
  assert.match(managerSource, /tabindex: canOpen \? undefined : "0"/);
  assert.match(managerSource, /const savedTabRow = event\.target\.closest\("\[data-drag-kind='tab'\]"\)/);
  assert.match(
    managerSource,
    /const savedTabTrigger = event\.target\.closest\("a, input, \[tabindex\]"\) \|\| savedTabRow/
  );
  assert.match(managerSource, /openSavedTabContextMenu\([\s\S]*focusFirst: true,[\s\S]*trigger: savedTabTrigger/);
  assert.match(managerSource, /closeOpenTabContextMenu\(\{ restoreFocus: true \}\)/);
  assert.match(
    managerSource,
    /const savedTabFocusIntent = getSavedTabFocusIntent\(document\.activeElement\)/
  );
  assert.match(managerSource, /restoreSavedTabFocusIntent\(savedTabFocusIntent\)/);
});

test("keeps progressive disclosure actions keyboard and screen-reader reachable", () => {
  assert.match(managerSource, /"aria-haspopup": "menu"/);
  assert.match(managerSource, /"aria-haspopup": "dialog"/);
  assert.match(managerSource, /isContextMenuKey\(event\)[\s\S]*category-row/);
  assert.match(managerSource, /shouldRestoreSavedTabSelectionFocus/);
  assert.match(managerSource, /focusSavedTabRef/);
});

test("hides an action menu panel before measuring it in the animation frame", () => {
  assert.match(
    managerSource,
    /function handleActionMenuToggle\(event\) \{[\s\S]*?const panel = menu\.querySelector\("\.action-menu-panel"\);[\s\S]*?panel\.style\.visibility = "hidden";[\s\S]*?requestAnimationFrame\(\(\) => positionActionMenu\(menu\)\)/
  );
  assert.match(
    managerSource,
    /function positionActionMenu\(menu\) \{[\s\S]*?panel\.style\.visibility = "visible";[\s\S]*?\}/
  );
});

test("closes all floating menus when the viewport changes", () => {
  assert.match(managerSource, /window\.addEventListener\("resize", closeFloatingMenus\)/);
  assert.match(managerSource, /window\.addEventListener\("scroll", closeFloatingMenus, true\)/);
  assert.match(
    managerSource,
    /function closeFloatingMenus\(\) \{[\s\S]*?closeActionMenus\(\);[\s\S]*?closeOpenTabContextMenu\(\);[\s\S]*?\}/
  );
});

test("keeps the collapsed search field out of the tab order", () => {
  assert.match(managerSource, /els\.searchField\.hidden = !isSearchExpanded/);
  assert.match(managerSource, /els\.searchToggle\.setAttribute\("aria-expanded", String\(isSearchExpanded\)\)/);
  assert.match(managerSource, /els\.searchToggle\.setAttribute\("aria-label", label\)/);
  assert.match(managerSource, /els\.searchToggle\.dataset\.tooltip = label/);
  assert.match(managerSource, /function toggleSearch\(\)[\s\S]*?isSearchExpanded = !isSearchExpanded[\s\S]*?renderSearchControl\(\)/);
});

test("expands search before the slash shortcut focuses it", () => {
  assert.match(managerSource, /if \(event\.key === "\/"[\s\S]*?expandSearch\(\);[\s\S]*?els\.searchInput\.focus\(\)/);
  assert.match(managerSource, /function expandSearch\(\)[\s\S]*?isSearchExpanded = true;[\s\S]*?renderSearchControl\(\)/);
});

test("routes Ctrl/Cmd+K to the inline search field instead of a missing modal", () => {
  const keyboardSource = managerSource.match(/function handleKeyboard\([\s\S]*?\n\}\n\nfunction render\(/)?.[0] || "";
  const shortcutSource = keyboardSource.match(/if \(\(event\.metaKey \|\| event\.ctrlKey\)[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(shortcutSource, /event\.preventDefault\(\);[\s\S]*?expandSearch\(\);[\s\S]*?els\.searchInput\.focus\(\)/);
  assert.doesNotMatch(shortcutSource, /openSearchModal\(\)/);
});

test("announces the selected count while showing only a compact numeric badge", () => {
  assert.match(managerSource, /class: "window-selection-count", "aria-live": "polite"/);
  assert.match(managerSource, /class: "window-selection-badge", "aria-hidden": "true"/);
  assert.match(managerSource, /class: "visually-hidden"[\s\S]*`\$\{selectedOpenTabIds\.size\} selected`/);
});

test("guards selected capture requests and exposes pending button state", () => {
  const captureSource = managerSource.match(/async function captureSelectedOpenTabs\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(captureSource, /if \(isSelectedCapturePending\) \{[\s\S]*?return;/);
  assert.ok(
    captureSource.indexOf("if (isSelectedCapturePending)") < captureSource.indexOf("await sendRuntime("),
    "pending guard must run before the capture runtime request"
  );
  assert.match(captureSource, /isSelectedCapturePending = true;/);
  assert.match(captureSource, /isSelectedCapturePending = false;/);
  assert.match(captureSource, /let isCaptureCommitted = false;/);
  assert.match(captureSource, /let isCaptureReconciled = false;/);
  assert.match(captureSource, /isCaptureCommitted = true;/);
  assert.match(captureSource, /isCaptureReconciled = true;/);
  assert.match(captureSource, /finally \{[\s\S]*?isSelectedCapturePending = false;[\s\S]*?renderSelectedWindowActions\(\);/);
  assert.match(managerSource, /class: "small-button create-selected-button",[\s\S]*?disabled: isSelectedCapturePending,[\s\S]*?"aria-busy": isSelectedCapturePending \? "true" : undefined/);
});

test("selected capture only clears the selection snapshot it started with", () => {
  const captureSource = managerSource.match(/async function captureSelectedOpenTabs\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(captureSource, /const selectionSnapshot = captureOpenTabsSelectionSnapshot\(/);
  assert.match(captureSource, /const currentSelection = captureOpenTabsSelectionSnapshot\([\s\S]*?isSameOpenTabsSelectionSnapshot\(selectionSnapshot, currentSelection\)/);
  assert.match(captureSource, /isSelectionCurrent: isSameOpenTabsSelectionSnapshot\(selectionSnapshot, currentSelection\)/);
  assert.match(captureSource, /if \(captureOutcome\.shouldClearSelection\) \{[\s\S]*?clearOpenTabsSelection\(\);/);
  assert.match(captureSource, /if \(result && captureOutcome\.shouldShowSuccess\) \{[\s\S]*?toast\(formatCaptureFeedback\(result\)\);/);
  assert.ok(
    captureSource.indexOf("isCaptureCommitted = true;") > captureSource.indexOf("result = await sendRuntime(") &&
      captureSource.indexOf("isCaptureCommitted = true;") < captureSource.indexOf("const createdGroupId"),
    "only a successful runtime capture may be committed before reconciliation"
  );
  assert.ok(
    captureSource.indexOf("isCaptureCommitted = true;") < captureSource.indexOf("const currentSelection"),
    "committed captures must consume matching selection snapshots even when reconciliation fails"
  );
  assert.match(captureSource, /selectedTabIds: selectedOpenTabIds/);
  assert.match(captureSource, /selectedWindowId: selectedOpenWindowId/);
  assert.match(captureSource, /selectMode: openTabsSelectMode/);
  assert.match(captureSource, /workspaceId: activeWorkspaceId/);
});

test("selected capture does not reveal or switch Inbox after changing workspace", () => {
  const captureSource = managerSource.match(/async function captureSelectedOpenTabs\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(captureSource, /workspaceId: selectionSnapshot\.workspaceId/);
  assert.match(captureSource, /if \(createdGroupId && activeWorkspaceId === selectionSnapshot\.workspaceId\) \{[\s\S]*?setActiveCategory\("inbox"\);[\s\S]*?revealGroup\(createdGroupId\)/);
  assert.match(captureSource, /const nextState = normalizeState\(await getState\(\)\);[\s\S]*?if \(activeWorkspaceId === selectionSnapshot\.workspaceId\) \{[\s\S]*?state = nextState;/);
  assert.match(captureSource, /workspaceId: activeWorkspaceId/);
});

test("selected capture refreshes state before revealing the created Inbox session", () => {
  const captureSource = managerSource.match(/async function captureSelectedOpenTabs\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(captureSource, /const createdGroupId = result\.createdGroupIds\?\.\[0\];/);
  assert.match(
    captureSource,
    /if \(createdGroupId && activeWorkspaceId === selectionSnapshot\.workspaceId\) \{[\s\S]*?state = nextState;[\s\S]*?ensureActiveWorkspace\(\);[\s\S]*?setActiveCategory\("inbox"\);[\s\S]*?revealGroup\(createdGroupId\)/
  );
  assert.match(
    captureSource,
    /try \{[\s\S]*?if \(createdGroupId && activeWorkspaceId === selectionSnapshot\.workspaceId\)[\s\S]*?\} finally \{[\s\S]*?clearOpenTabsSelection\(\);[\s\S]*?toast\(formatCaptureFeedback\(result\)\);/
  );
  assert.match(
    managerSource,
    /action === "capture-selected-open-tabs"[\s\S]*?let captureError = null[\s\S]*?catch \(error\)[\s\S]*?captureError = error[\s\S]*?await loadOpenTabs\(\)[\s\S]*?catch \(refreshError\)[\s\S]*?AggregateError[\s\S]*?if \(captureError\)[\s\S]*?throw captureError/
  );
});

test("selected capture clears a hiding search before revealing the saved session", () => {
  const captureSource = managerSource.match(/async function captureSelectedOpenTabs\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(captureSource, /if \(searchQuery &&[\s\S]*?searchQuery = "";[\s\S]*?els\.searchInput\.value = searchQuery;[\s\S]*?render\(\);[\s\S]*?setActiveCategory\("inbox"\);/);
  assert.match(captureSource, /if \(!revealGroup\(createdGroupId\)\) \{[\s\S]*?throw new Error\("Saved session card was not found\."\);/);
  assert.match(managerSource, /function revealGroup\(groupId\) \{[\s\S]*?if \(!card\) \{[\s\S]*?return false;[\s\S]*?return true;/);
});

test("selected capture clears the open-tab filter before reveal reconciliation", () => {
  const captureSource = managerSource.match(/async function captureSelectedOpenTabs\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(captureSource, /if \(openTabFilter\) \{[\s\S]*?clearOpenTabFilter\(\);[\s\S]*?\}/);
  assert.ok(
    captureSource.indexOf("clearOpenTabFilter();") < captureSource.indexOf("revealGroup(createdGroupId)"),
    "open-tab filtering must be cleared before reveal"
  );
});

test("selected capture wraps committed reconciliation failures as saved-session errors", () => {
  const captureSource = managerSource.match(/async function captureSelectedOpenTabs\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(
    captureSource,
    /isCaptureCommitted = true;[\s\S]*?try \{[\s\S]*?const createdGroupId = result\.createdGroupIds\?\.\[0\];[\s\S]*?\} catch \(error\) \{[\s\S]*?throw createCaptureReconciliationError\(error\);/
  );
  const committedIndex = captureSource.indexOf("isCaptureCommitted = true;");
  const reconciliationTryIndex = captureSource.indexOf("try {", committedIndex);
  assert.ok(
    captureSource.indexOf("result = await sendRuntime(") < committedIndex && committedIndex < reconciliationTryIndex,
    "runtime failures must remain outside reconciliation error wrapping"
  );
});
