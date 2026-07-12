import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const managerHtml = readFileSync(new URL("../manager.html", import.meta.url), "utf8");
const managerSource = readFileSync(new URL("../src/manager.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("uses compact window and workspace dropdown surfaces", () => {
  assert.match(managerHtml, /<wa-select[\s\S]*?id="windowSelect"[\s\S]*?data-action="switch-open-window"/);
  assert.match(managerHtml, /<wa-dropdown id="workspaceMenu" class="workspace-menu"/);
  assert.doesNotMatch(managerHtml, /id="windowChips"|id="workspaceSelect"|id="statsLine"/);
  assert.doesNotMatch(managerSource, /Current window|Window \$\{windowInfo\.id\}/);
});

test("keeps both header rails and their controls on one shared sizing contract", () => {
  assert.match(styles, /--manager-header-height: 64px/);
  assert.match(styles, /--manager-control-height: 40px/);
  assert.match(styles, /--manager-sidebar-control-height: 32px/);
  assert.match(styles, /\.manager-sidebar-header \{[\s\S]*height: var\(--manager-header-height\)/);
  assert.match(styles, /\.manager-topbar \{[\s\S]*height: var\(--manager-header-height\)/);
  assert.match(styles, /\.manager-topbar[\s\S]*min-height: var\(--manager-control-height\)/);
});

test("uses a stable icon rail and expands the full sidebar without board reflow", () => {
  assert.match(managerHtml, /id="sidebarRail"/);
  assert.match(styles, /--manager-sidebar-rail-width: 62px/);
  assert.match(styles, /\.manager-board-shell\.sidebar-collapsed[\s\S]*grid-template-columns: var\(--manager-sidebar-rail-width\) minmax\(0, 1fr\)/);
  assert.match(styles, /\.sidebar-collapsed \.manager-sidebar-content[\s\S]*position: absolute/);
  assert.match(styles, /\.sidebar-collapsed \.manager-sidebar:hover \.manager-sidebar-content/);
  assert.match(styles, /\.sidebar-collapsed \.manager-sidebar:focus-within \.manager-sidebar-content/);
  assert.match(styles, /body\.manager-dragging \.sidebar-collapsed \.manager-sidebar-content\s*{[^}]*visibility: hidden[^}]*pointer-events: none/);
  assert.match(styles, /body\.manager-dragging \.sidebar-collapsed \.manager-sidebar-header\s*{[^}]*pointer-events: none/);
  assert.match(managerSource, /document\.body\.classList\.toggle\("manager-dragging", Boolean\(activeDragKind\)\)/);
  assert.doesNotMatch(styles, /\.sidebar-collapsed \.window-selector,\s*\.sidebar-collapsed \.window-actions\s*{[^}]*display: none/);
});

test("keeps window selector semantics while using a local start-slot icon", () => {
  assert.match(managerHtml, /<wa-select[^>]*id="windowSelect"[^>]*class="[^"]*wa-visually-hidden-label[^"]*"/);
  assert.match(managerSource, /slot: "start"/);
  assert.match(managerSource, /class: "window-selector-icon"/);
  assert.match(managerSource, /createIcon\("window"\)/);
  assert.match(managerSource, /value: windowInfo\.id/);
  assert.match(managerSource, /"aria-label": windowInfo\.accessibleLabel/);
  assert.match(managerSource, /\},\s*windowInfo\.label/);
  assert.match(managerSource, /windowSelect\.value/);
  assert.match(managerSource, /setAttribute\("label", selectedWindow\?\.accessibleLabel \|\| "Open window"\)/);
  assert.match(managerSource, /getOpenWindowSelection\(event, els\.windowSelect\)/);
  assert.doesNotMatch(managerSource, /class: "window-option-icon"/);
  assert.match(styles, /\.window-selector::part\(display-input\)[\s\S]*font-size: 0/);
});

test("keeps the selected-tab create action separated from its count badge", () => {
  assert.match(managerSource, /class: "small-button create-selected-button"/);
  assert.match(styles, /\.window-actions \.create-selected-button[\s\S]*margin-inline-start: 4px/);
});

test("adds a local search toggle while retaining the Web Awesome search input", () => {
  assert.match(
    managerHtml,
    /<button[^>]*id="searchToggle"[^>]*data-action="toggle-search"[^>]*aria-controls="searchInput"[^>]*aria-expanded="false"/
  );
  assert.match(managerHtml, /<wa-input[^>]*id="searchInput"[^>]*type="search"/);
  assert.match(managerHtml, /<label[^>]*id="searchField"[^>]*hidden/);
  assert.match(managerSource, /let isSearchExpanded = Boolean\(searchQuery\);/);
  assert.match(managerSource, /function renderSearchControl\(\)[\s\S]*?els\.searchField\.hidden = !isSearchExpanded/);
  assert.match(managerSource, /action === "toggle-search"/);
  assert.match(styles, /\.manager-topbar\.search-collapsed[\s\S]*grid-template-columns:[^;]*auto auto/);
});

test("keeps search filtering active when its field is collapsed", () => {
  assert.match(managerSource, /const label = isSearchExpanded \? "Close search" : searchQuery \? "Search \(active\)" : "Search"/);
  assert.match(managerSource, /els\.searchToggle\.dataset\.queryActive = searchQuery \? "true" : "false"/);
  assert.match(managerSource, /isSearchExpanded = !isSearchExpanded/);
  assert.match(managerSource, /searchQuery = els\.searchInput\.value\.trim\(\);/);
});

test("keeps the search toggle visible in the narrow mobile topbar", () => {
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.manager-topbar,\s*\.manager-topbar\.search-collapsed \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.manager-topbar,\s*\.manager-topbar\.search-collapsed \{[\s\S]*?overflow-x: visible/);
  assert.match(styles, /\.manager-topbar \.workspace-search \{[\s\S]*?grid-column: 2[\s\S]*?grid-row: 1/);
});

test("validates category names inside locked latest-state mutations", () => {
  const createSource = managerSource.match(/async function createNewFolder\(\)[\s\S]*?\n\}/)?.[0] || "";
  const renameSource = managerSource.match(/async function renameFolder\(folderId\)[\s\S]*?\n\}/)?.[0] || "";

  assert.match(managerSource, /function withCategoryMutationLock\([\s\S]*?globalThis\.navigator\?\.locks[\s\S]*?request\([\s\S]*?ziptab-category-mutation/);
  assert.match(managerSource, /function withCategoryMutationLock\([\s\S]*?mutation\(\);/);
  assert.match(createSource, /if \(name === null\)/);
  assert.doesNotMatch(createSource, /if \(!name\)/);
  assert.match(createSource, /updateState\(\(draft\) => \{[\s\S]*?validateFolderName\(draft\.folders, activeWorkspaceId, name\)/);
  assert.match(renameSource, /if \(name === null\)/);
  assert.doesNotMatch(renameSource, /if \(!name\)/);
  assert.match(renameSource, /updateState\(\(draft\) => \{[\s\S]*?validateFolderName\(draft\.folders, target\.workspaceId, name, folderId\)/);
  assert.match(managerSource, /A category with that name already exists in this workspace/);
  assert.match(managerSource, /Category name cannot be empty\./);
  assert.doesNotMatch(createSource, /toast\(/);
  assert.doesNotMatch(renameSource, /toast\(/);
});

test("preserves capture failures when open-tab refresh also fails", () => {
  const captureSource = managerSource.match(
    /else if \(action === "capture-selected-open-tabs"\)[\s\S]*?else if \(action === "close-open-tab"\)/
  )?.[0] || "";

  assert.match(captureSource, /let captureError = null/);
  assert.match(captureSource, /catch \(error\)[\s\S]*?captureError = error/);
  assert.match(captureSource, /catch \(refreshError\)[\s\S]*?AggregateError/);
  assert.match(captureSource, /if \(captureError\)[\s\S]*?throw captureError/);
});

test("keeps category deletion and reordering inside latest-state exclusive mutations", () => {
  const deleteSource = managerSource.match(/async function deleteFolder\(folderId\)[\s\S]*?\n\}/)?.[0] || "";
  const moveSource = managerSource.match(/async function moveCategory\(sourceCategoryId, targetCategoryId, placement = "before"\)[\s\S]*?\n\}/)?.[0] || "";

  assert.match(deleteSource, /withCategoryMutationLock\(\(\) =>[\s\S]*?updateState\(\(draft\) =>/);
  assert.match(deleteSource, /draft\.folders\.find\(\(item\) => item\.id === folderId\)/);
  assert.match(deleteSource, /groups: draft\.groups\.map/);
  assert.match(moveSource, /const workspaceId = activeWorkspaceId/);
  assert.match(moveSource, /withCategoryMutationLock\(\(\) =>[\s\S]*?updateState\(\(draft\) =>/);
  assert.match(moveSource, /draft\.folders[\s\S]*?filter\(\(folder\) => folder\.workspaceId === workspaceId\)/);
  assert.match(moveSource, /reorderCategoryIds\(/);
  assert.match(moveSource, /categoryOrderByWorkspace:/);
  assert.doesNotMatch(moveSource, /const categoryIds = orderedCategoryItems\(\)\.map/);
});
