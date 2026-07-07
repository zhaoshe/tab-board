import {
  DEFAULT_SESSION_EXTERNAL_ACTIONS,
  DEFAULT_WORKSPACE_ID,
  ITEM_LINK,
  ITEM_NOTE,
  SESSION_ACTION_IDS,
  collectStats,
  compactBin,
  coerceUrl,
  createBinEntry,
  createFolder,
  createGroupFromTabRecords,
  createNoteRecord,
  createTabRecord,
  createWorkspace,
  groupMatchesQuery,
  groupsToText,
  isRestorableTab,
  itemTypeLabel,
  normalizeState,
  nowIso,
  parseOneTabText,
  tabMatchesQuery,
  tabsToText
} from "./model.js";
import {
  buildContextStripItems,
  buildInspectorModel,
  getSessionActionLayout
} from "./manager-view.js";
import { formatRestoreFeedback, formatSaveFeedback } from "./feedback-copy.js";
import { hydrateIconButtons, iconOnlyButton, iconSummary, iconTextButton } from "./icons.js";
import { getState, updateState } from "./store.js";

const els = {
  activeTabsPanel: document.querySelector("#activeTabsPanel"),
  appShell: document.querySelector(".app-shell"),
  contextStrip: document.querySelector("#contextStrip"),
  folderList: document.querySelector("#folderList"),
  groupsList: document.querySelector("#groupsList"),
  headerActions: document.querySelector("#headerActions"),
  inspectorPanel: document.querySelector("#inspectorPanel"),
  modal: document.querySelector("#modal"),
  modalActions: document.querySelector("#modalActions"),
  modalBody: document.querySelector("#modalBody"),
  modalTitle: document.querySelector("#modalTitle"),
  openTabsToolbar: document.querySelector("#openTabsToolbar"),
  searchInput: document.querySelector("#searchInput"),
  statsLine: document.querySelector("#statsLine"),
  toast: document.querySelector("#toast"),
  workspaceSelect: document.querySelector("#workspaceSelect")
};

const CATEGORY_INBOX = "inbox";
const CATEGORY_STARRED = "starred";
const TAB_PREVIEW_LIMIT = 6;
const SESSION_ACTION_META = {
  add: { icon: "plus", label: "Add item" },
  collapse: { icon: "chevrons-up", label: "Collapse / expand" },
  copy: { icon: "copy", label: "Copy" },
  delete: { icon: "trash-2", label: "Delete" },
  lock: { icon: "lock", label: "Lock" },
  note: { icon: "sticky-note", label: "Note" },
  rename: { icon: "edit-3", label: "Rename" },
  restore: { icon: "rotate-ccw", label: "Restore" }
};

let state = normalizeState(await getState());
let activeFilter = normalizeCategoryFilter(localStorage.getItem("ziptab.activeFilter") || CATEGORY_INBOX);
let activeWorkspaceId = localStorage.getItem("ziptab.activeWorkspaceId") || state.activeWorkspaceId || DEFAULT_WORKSPACE_ID;
let searchQuery = new URLSearchParams(location.search).get("q") || "";
let openWindows = [];
let openTabsLoading = false;
const selected = new Set();
const selectedOpenTabIds = new Set();
let selectionGroupId = "";
let openTabFilter = null;
let openTabsSelectMode = false;
let activeDragKind = "";
let groupInsertMarker = null;
let focusedGroupId = "";
const expandedGroupIds = new Set();

ensureActiveWorkspace();
await migrateLegacyQuickList();
els.searchInput.value = searchQuery;
applyTheme();
hydrateIconButtons();
bindEvents();
render();
loadOpenTabs();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.ziptabState) {
    state = normalizeState(changes.ziptabState.newValue);
    ensureActiveWorkspace();
    clearMissingSelections();
    applyTheme();
    render();
  }
});

function bindEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("click", handleMenuDismiss);
  document.addEventListener("change", handleChange);
  document.addEventListener("contextmenu", handleContextMenu);
  document.addEventListener("dblclick", handleDoubleClick);
  document.addEventListener("dragstart", handleDragStart);
  document.addEventListener("dragover", handleDragOver);
  document.addEventListener("dragleave", handleDragLeave);
  document.addEventListener("drop", handleDrop);
  document.addEventListener("dragend", handleDragEnd);
  document.addEventListener("keydown", handleKeyboard);
  els.searchInput.addEventListener("input", () => {
    searchQuery = els.searchInput.value.trim();
    render();
  });
}

function handleMenuDismiss(event) {
  if (!event.target.closest(".open-tab-context-menu")) {
    closeOpenTabContextMenu();
  }
  const menu = event.target.closest(".action-menu");
  if (!menu) {
    closeActionMenus();
    return;
  }
  if (event.target.closest("summary")) {
    closeActionMenus(menu);
  }
}

async function handleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  const actionMenu = button.closest(".action-menu");
  const contextMenu = button.closest(".open-tab-context-menu");
  const action = button.dataset.action;
  const groupId = button.dataset.groupId || "";
  const tabId = button.dataset.tabId || "";
  const source = button.dataset.source || "group";

  try {
    if (action === "capture-current-window") {
      const result = await sendRuntime({ type: "capture", mode: "current-window", workspaceId: activeWorkspaceId });
      toast(formatSaveFeedback(result.storedTabs || 0));
      await loadOpenTabs();
    } else if (action === "capture-selected-open-tabs") {
      await captureSelectedOpenTabs();
      await loadOpenTabs();
    } else if (action === "toggle-open-tabs-select-mode") {
      toggleOpenTabsSelectMode();
    } else if (action === "toggle-open-tab") {
      toggleOpenTabSelection(button.dataset.openTabId);
    } else if (action === "clear-open-tabs") {
      selectedOpenTabIds.clear();
      renderOpenTabsToolbar();
      renderActiveTabs();
    } else if (action === "filter-open-tab") {
      applyOpenTabFilter(button.dataset.openTabId);
    } else if (action === "clear-open-tab-filter") {
      clearOpenTabFilter();
    } else if (action === "refresh-open-tabs") {
      await loadOpenTabs();
    } else if (action === "open-search") {
      openSearchModal();
    } else if (action === "open-bin") {
      openBinModal();
    } else if (action === "open-options") {
      await sendRuntime({ type: "open-options" });
    } else if (action === "restore-all") {
      await sendRuntime({ type: "restore-all" });
      selected.clear();
    } else if (action === "restore-group") {
      await sendRuntime({ type: "restore-group", groupId });
    } else if (action === "restore-tab") {
      await sendRuntime({ type: "restore-tab", source, groupId, tabId });
      selected.delete(keyFor(source, groupId, tabId));
    } else if (action === "delete-group") {
      await deleteGroup(groupId);
    } else if (action === "delete-tab") {
      await deleteTab({ source, groupId, tabId });
    } else if (action === "rename-group") {
      await renameGroup(groupId);
    } else if (action === "toggle-group-lock") {
      await patchGroup(groupId, (group) => {
        group.locked = !group.locked;
      });
    } else if (action === "toggle-group-collapse") {
      await patchGroup(groupId, (group) => {
        group.collapsed = !group.collapsed;
      });
    } else if (action === "toggle-group-preview") {
      toggleGroupPreview(groupId);
    } else if (action === "edit-group-note") {
      await editGroupNote(groupId);
    } else if (action === "add-link") {
      await addLinkToGroup(groupId);
    } else if (action === "add-note") {
      await addNoteToGroup(groupId);
    } else if (action === "edit-tab-note") {
      await editTabNote({ source, groupId, tabId });
    } else if (action === "copy-group") {
      const group = state.groups.find((item) => item.id === groupId);
      await copyText(tabsToText(group?.tabs || []));
      toast("Copied");
    } else if (action === "copy-tab") {
      const found = findTabRef(state, { source, groupId, tabId });
      await copyText(tabClipboardText(found?.tab));
      toast("Copied");
    } else if (action === "export-all") {
      openExportModal(state.groups);
    } else if (action === "import") {
      openImportModal();
    } else if (action === "create-workspace") {
      await createNewWorkspace();
    } else if (action === "rename-workspace") {
      await renameWorkspace();
    } else if (action === "create-folder") {
      await createNewFolder();
    } else if (action === "filter") {
      setActiveCategory(button.dataset.filter || "all", { scroll: true });
    } else if (action === "rename-folder") {
      await renameFolder(button.dataset.folderId);
    } else if (action === "delete-folder") {
      await deleteFolder(button.dataset.folderId);
    } else if (action === "start-selection") {
      startSessionSelection(source, groupId, tabId);
    } else if (action === "toggle-select") {
      toggleSelection(source, groupId, tabId);
    } else if (action === "selection-clear") {
      closeSessionSelection();
      renderGroups();
    } else if (action === "selection-restore") {
      await restoreSelected();
    } else if (action === "selection-copy") {
      await copySelected();
    } else if (action === "selection-delete") {
      await deleteSelected();
    } else if (action === "toggle-all-collapse") {
      await toggleAllCollapsed();
    } else if (action === "toggle-category-collapse") {
      await toggleCategoryCollapsed(button.dataset.categoryFilter || CATEGORY_INBOX);
    } else if (action === "reveal-tab") {
      revealTab({ source, groupId, tabId });
    } else if (action === "restore-bin-item") {
      await restoreBinItem(button.dataset.binId);
    } else if (action === "discard-bin-item") {
      await discardBinItem(button.dataset.binId);
    } else if (action === "clear-bin") {
      await clearBin();
    }
  } catch (error) {
    toast(error?.message || String(error), true);
  } finally {
    actionMenu?.removeAttribute("open");
    contextMenu?.remove();
  }
}

async function handleChange(event) {
  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }
  if (target.dataset.action === "switch-workspace") {
    activeWorkspaceId = target.value || DEFAULT_WORKSPACE_ID;
    localStorage.setItem("ziptab.activeWorkspaceId", activeWorkspaceId);
    await updateState((draft) => {
      draft.activeWorkspaceId = activeWorkspaceId;
      return draft;
    });
    activeFilter = CATEGORY_INBOX;
    localStorage.setItem("ziptab.activeFilter", activeFilter);
    selected.clear();
    selectionGroupId = "";
    render();
  }
}

function handleContextMenu(event) {
  const activeTabRow = event.target.closest("[data-drag-kind='open-tab']");
  if (activeTabRow) {
    event.preventDefault();
    openOpenTabContextMenu(activeTabRow.dataset.openTabId, event.clientX, event.clientY);
    return;
  }

  const savedTabRow = event.target.closest("[data-drag-kind='tab']");
  if (savedTabRow) {
    event.preventDefault();
    openSavedTabContextMenu(
      {
        source: savedTabRow.dataset.source,
        groupId: savedTabRow.dataset.groupId,
        tabId: savedTabRow.dataset.tabId
      },
      event.clientX,
      event.clientY
    );
    return;
  }

  const categoryRow = event.target.closest(".category-row");
  if (categoryRow?.dataset.folderId) {
    event.preventDefault();
    openCategoryContextMenu(categoryRow.dataset.folderId, event.clientX, event.clientY);
    return;
  }

  closeOpenTabContextMenu();
}

function handleDoubleClick(event) {
  const titleNode = event.target.closest("[data-rename-group-id]");
  if (!titleNode) {
    return;
  }
  event.preventDefault();
  startInlineGroupRename(titleNode);
}

function handleDragStart(event) {
  const draggable = event.target.closest("[data-drag-kind]");
  if (!draggable) {
    return;
  }
  const dragKind = draggable.dataset.dragKind;
  const startedFromCategoryButton = dragKind === "category" && event.target.closest(".folder-button");
  const startedFromOpenTabCheckbox = dragKind === "open-tab" && event.target.closest(".open-tab-checkbox");
  if (
    event.target.closest("button, input, textarea, select, summary, details") &&
    !startedFromCategoryButton &&
    !startedFromOpenTabCheckbox
  ) {
    event.preventDefault();
    return;
  }
  let payload;
  if (dragKind === "group") {
    payload = { kind: "group", groupId: draggable.dataset.groupId };
  } else if (dragKind === "category") {
    payload = { kind: "category", categoryId: draggable.dataset.categoryId };
  } else if (dragKind === "open-tab") {
    const tabId = draggable.dataset.openTabId;
    const selectedTabs = selectedOpenTabRecords();
    const selectedIds = selectedTabs.map((tab) => String(tab.id));
    payload =
      selectedIds.includes(String(tabId)) && selectedIds.length > 1
        ? { kind: "open-tabs", tabIds: selectedIds }
        : { kind: "open-tabs", tabIds: [tabId] };
  } else {
    const source = draggable.dataset.source;
    const groupId = draggable.dataset.groupId || "";
    const tabId = draggable.dataset.tabId;
    const key = keyFor(source, groupId, tabId);
    const selectedRefs = selectedRefsForGroup(groupId);
    payload =
      selected.has(key) && selectedRefs.length > 1
        ? { kind: "tabs", refs: selectedRefs }
        : { kind: "tab", source, groupId, tabId };
  }
  activeDragKind = payload.kind;
  updateDragUi();
  event.dataTransfer.effectAllowed = payload.kind === "open-tabs" ? "copy" : "move";
  event.dataTransfer.setData("application/json", JSON.stringify(payload));
  markDragSources(payload, draggable, event);
}

function handleDragOver(event) {
  const dropTarget = closestSupportedDropTarget(event.target);
  if (!dropTarget) {
    return;
  }
  const drop = dropTarget.dataset.drop;
  event.preventDefault();
  if (!(activeDragKind === "group" && drop === "group-body")) {
    dropTarget.classList.add("drag-over");
  }
  if (drop === "tab-before") {
    updateTabDropLine(event, dropTarget);
    removeGroupInsertMarker();
  } else if (drop === "category-reorder") {
    const rect = dropTarget.getBoundingClientRect();
    dropTarget.classList.toggle("category-drop-after", event.clientY > rect.top + rect.height / 2);
  } else if (shouldShowGroupInsertMarker(drop)) {
    updateGroupInsertMarker(event, dropTarget);
  } else {
    removeGroupInsertMarker();
  }
}

function handleDragLeave(event) {
  const dropTarget = event.target.closest("[data-drop]");
  dropTarget?.classList.remove("drag-over", "category-drop-after", "tab-drop-before", "tab-drop-after");
}

async function handleDrop(event) {
  const dropTarget = closestSupportedDropTarget(event.target);
  if (!dropTarget) {
    return;
  }
  event.preventDefault();
  const raw = event.dataTransfer.getData("application/json");
  if (!raw) {
    handleDragEnd();
    return;
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    handleDragEnd();
    return;
  }
  const drop = dropTarget.dataset.drop;
  const insertPosition = groupInsertPosition(event, dropTarget);
  const tabPlacement = drop === "tab-before" ? tabPlacementFromEvent(dropTarget, event) : "before";
  const hadGroupInsertMarker =
    Boolean(groupInsertMarker?.isConnected) || Boolean(dropTarget.closest(".group-insert-marker"));

  document.querySelectorAll(".drag-over, .dragging, .drag-origin, .category-drop-after, .tab-drop-before, .tab-drop-after").forEach((node) => {
    node.classList.remove("drag-over", "dragging", "drag-origin", "category-drop-after", "tab-drop-before", "tab-drop-after");
  });
  removeGroupInsertMarker();

  if (payload.kind === "tab" && drop === "new-group") {
    await moveTabToNewGroup(payload);
  } else if (payload.kind === "tab" && drop === "group-insert") {
    await moveTabToNewGroup(payload, insertPosition?.categoryFilter || CATEGORY_INBOX, insertPosition);
  } else if (payload.kind === "tabs" && drop === "group-insert") {
    await moveTabsToNewGroup(payload.refs, insertPosition?.categoryFilter || CATEGORY_INBOX, insertPosition);
  } else if (payload.kind === "tabs" && drop === "new-group") {
    await moveTabsToNewGroup(payload.refs);
  } else if (payload.kind === "open-tabs" && drop === "new-group") {
    await addOpenTabsToNewGroup(payload.tabIds);
  } else if (payload.kind === "tab" && drop === "group-body") {
    await moveTabToGroup(payload, dropTarget.dataset.groupId);
  } else if (payload.kind === "tabs" && drop === "group-body") {
    await moveTabsToGroup(payload.refs, dropTarget.dataset.groupId);
  } else if (payload.kind === "tab" && drop === "tab-before") {
    await moveTabToGroup(payload, dropTarget.dataset.groupId, dropTarget.dataset.tabId, tabPlacement);
  } else if (payload.kind === "tabs" && drop === "tab-before") {
    await moveTabsToGroup(payload.refs, dropTarget.dataset.groupId, dropTarget.dataset.tabId, tabPlacement);
  } else if (payload.kind === "tab" && drop === "category-column") {
    await moveTabToNewGroup(payload, dropTarget.dataset.categoryFilter || CATEGORY_INBOX, insertPosition);
  } else if (payload.kind === "tabs" && drop === "category-column") {
    await moveTabsToNewGroup(payload.refs, dropTarget.dataset.categoryFilter || CATEGORY_INBOX, insertPosition);
  } else if (payload.kind === "open-tabs" && drop === "group-insert") {
    await addOpenTabsToNewGroup(payload.tabIds, insertPosition?.categoryFilter || CATEGORY_INBOX, insertPosition);
  } else if (payload.kind === "open-tabs" && drop === "group-body") {
    await addOpenTabsToGroup(payload.tabIds, dropTarget.dataset.groupId);
  } else if (payload.kind === "open-tabs" && drop === "tab-before") {
    await addOpenTabsToGroup(payload.tabIds, dropTarget.dataset.groupId, dropTarget.dataset.tabId, tabPlacement);
  } else if (payload.kind === "group" && drop === "group-before") {
    await moveGroupBefore(payload.groupId, dropTarget.dataset.groupId);
  } else if (payload.kind === "group" && (drop === "group-insert" || (drop === "group-body" && hadGroupInsertMarker))) {
    await moveGroupToCategory(payload.groupId, insertPosition?.categoryFilter || CATEGORY_INBOX, insertPosition);
  } else if (payload.kind === "group" && drop === "category-column") {
    await moveGroupToCategory(payload.groupId, dropTarget.dataset.categoryFilter || CATEGORY_INBOX, insertPosition);
  } else if (payload.kind === "category" && drop === "category-reorder") {
    const rect = dropTarget.getBoundingClientRect();
    const placement = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
    await moveCategory(payload.categoryId, dropTarget.dataset.categoryId, placement);
  }
  activeDragKind = "";
  updateDragUi();
}

function handleDragEnd() {
  activeDragKind = "";
  updateDragUi();
  removeGroupInsertMarker();
  document.querySelectorAll(".drag-over, .dragging, .drag-origin, .category-drop-after, .tab-drop-before, .tab-drop-after").forEach((node) => {
    node.classList.remove("drag-over", "dragging", "drag-origin", "category-drop-after", "tab-drop-before", "tab-drop-after");
  });
}

function updateTabDropLine(event, dropTarget) {
  document.querySelectorAll(".tab-drop-before, .tab-drop-after").forEach((node) => {
    if (node !== dropTarget) {
      node.classList.remove("tab-drop-before", "tab-drop-after");
    }
  });
  const placement = tabPlacementFromEvent(dropTarget, event);
  dropTarget.classList.toggle("tab-drop-before", placement === "before");
  dropTarget.classList.toggle("tab-drop-after", placement === "after");
}

function tabPlacementFromEvent(tabRow, event) {
  const rect = tabRow.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function markDragSources(payload, fallbackNode, event) {
  if (payload.kind === "open-tabs" && payload.tabIds?.length > 1) {
    const ids = new Set(payload.tabIds.map(String));
    document.querySelectorAll(".active-tab-row[data-open-tab-id]").forEach((row) => {
      if (ids.has(String(row.dataset.openTabId))) {
        row.classList.add("dragging");
      }
    });
    return;
  }
  if (payload.kind === "group") {
    fallbackNode.classList.add("drag-origin");
    setGroupDragImage(event, fallbackNode);
    seedGroupDragMarker(fallbackNode);
    requestAnimationFrame(() => fallbackNode.classList.add("dragging"));
    return;
  }
  fallbackNode.classList.add("dragging");
}

function closestSupportedDropTarget(target) {
  let node = target;
  if (node && !node.closest) {
    node = node.parentElement || node.parentNode;
  }
  let dropTarget = node?.closest?.("[data-drop]") || null;
  while (dropTarget && !canDropActivePayload(dropTarget.dataset.drop)) {
    dropTarget = dropTarget.parentElement?.closest("[data-drop]") || null;
  }
  return dropTarget;
}

function setGroupDragImage(event, sourceCard) {
  if (!event?.dataTransfer?.setDragImage) {
    return;
  }
  const rect = sourceCard.getBoundingClientRect();
  const ghost = sourceCard.cloneNode(true);
  ghost.style.width = `${rect.width}px`;
  ghost.style.position = "fixed";
  ghost.style.top = `${Math.max(0, Math.min(rect.top, window.innerHeight - rect.height))}px`;
  ghost.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - rect.width))}px`;
  ghost.style.zIndex = "1000";
  ghost.style.pointerEvents = "none";
  ghost.style.opacity = "0.92";
  ghost.style.transform = "none";
  document.body.append(ghost);
  event.dataTransfer.setDragImage(
    ghost,
    Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
    Math.max(0, Math.min(rect.height, event.clientY - rect.top))
  );
  requestAnimationFrame(() => requestAnimationFrame(() => ghost.remove()));
}

function canDropActivePayload(drop) {
  if (!activeDragKind) {
    return false;
  }
  if (activeDragKind === "category") {
    return drop === "category-reorder";
  }
  if (activeDragKind === "tab" || activeDragKind === "tabs" || activeDragKind === "open-tabs") {
    return ["group-body", "tab-before", "new-group", "category-column", "group-insert"].includes(drop);
  }
  if (activeDragKind === "group") {
    return ["group-body", "category-column", "group-insert"].includes(drop);
  }
  return false;
}

function updateDragUi() {
  document.body.classList.toggle(
    "dragging-tab-items",
    activeDragKind === "tab" || activeDragKind === "tabs" || activeDragKind === "open-tabs"
  );
}

function shouldShowGroupInsertMarker(drop) {
  if (activeDragKind === "group") {
    return ["group-body", "category-column", "group-insert"].includes(drop);
  }
  if (activeDragKind === "tab" || activeDragKind === "tabs" || activeDragKind === "open-tabs") {
    return ["category-column", "group-insert"].includes(drop);
  }
  return false;
}

function seedGroupDragMarker(sourceCard) {
  const section = sourceCard.closest(".category-section");
  const grid = sourceCard.closest(".category-section-grid");
  if (!section || !grid) {
    return;
  }
  const marker = ensureGroupInsertMarker();
  marker.dataset.categoryFilter = section.dataset.categoryFilter || CATEGORY_INBOX;
  marker.dataset.targetGroupId = sourceCard.dataset.groupId || "";
  marker.dataset.placement = "before";
  marker.querySelector("strong").textContent = "Move here";
  grid.insertBefore(marker, sourceCard);
}

function updateGroupInsertMarker(event, dropTarget) {
  if (dropTarget === groupInsertMarker) {
    return;
  }
  if (activeDragKind === "group" && dropTarget.closest(".drag-origin")) {
    return;
  }
  const section = dropTarget.closest(".category-section");
  const grid = section?.querySelector(".category-section-grid");
  if (!section || !grid) {
    removeGroupInsertMarker();
    return;
  }
  const categoryFilter = section.dataset.categoryFilter || CATEGORY_INBOX;
  const cards = [...grid.querySelectorAll(".group-card:not(.dragging):not(.drag-origin)")];
  let targetCard = dropTarget.closest(".group-card");
  if (targetCard?.classList.contains("dragging") || targetCard?.classList.contains("drag-origin")) {
    targetCard = null;
  }

  let placement = "end";
  if (targetCard) {
    placement = groupPlacementFromEvent(targetCard, event);
  } else if (cards.length) {
    targetCard = nearestGroupCard(event, cards);
    placement = groupPlacementFromEvent(targetCard, event);
  }

  const marker = ensureGroupInsertMarker();
  marker.dataset.categoryFilter = categoryFilter;
  marker.dataset.targetGroupId = targetCard?.dataset.groupId || "";
  marker.dataset.placement = targetCard ? placement : "end";
  marker.querySelector("strong").textContent = activeDragKind === "group" ? "Move here" : "New session here";

  if (targetCard && placement === "before") {
    grid.insertBefore(marker, targetCard);
  } else if (targetCard) {
    const reference = targetCard.nextSibling === marker ? marker.nextSibling : targetCard.nextSibling;
    grid.insertBefore(marker, reference);
  } else {
    grid.append(marker);
  }
}

function ensureGroupInsertMarker() {
  if (!groupInsertMarker) {
    groupInsertMarker = h(
      "div",
      { class: "group-insert-marker", "data-drop": "group-insert" },
      h("span", { class: "group-insert-icon", "aria-hidden": "true" }, "+"),
      h("strong", {}, "Move here")
    );
  }
  return groupInsertMarker;
}

function removeGroupInsertMarker() {
  groupInsertMarker?.remove();
}

function groupInsertPosition(event, dropTarget) {
  const marker = groupInsertMarker?.isConnected ? groupInsertMarker : dropTarget.closest(".group-insert-marker");
  if (marker) {
    return {
      categoryFilter: marker.dataset.categoryFilter || CATEGORY_INBOX,
      targetGroupId: marker.dataset.targetGroupId || "",
      placement: marker.dataset.placement || "end"
    };
  }
  const card = dropTarget.closest(".group-card");
  const section = dropTarget.closest(".category-section");
  if (card && section) {
    return {
      categoryFilter: section.dataset.categoryFilter || CATEGORY_INBOX,
      targetGroupId: card.dataset.groupId || "",
      placement: groupPlacementFromEvent(card, event)
    };
  }
  if (section) {
    return {
      categoryFilter: section.dataset.categoryFilter || CATEGORY_INBOX,
      targetGroupId: "",
      placement: "end"
    };
  }
  return null;
}

function groupPlacementFromEvent(card, event) {
  const rect = card.getBoundingClientRect();
  return event.clientX < rect.left + rect.width / 2 ? "before" : "after";
}

function nearestGroupCard(event, cards) {
  let nearest = cards[0] || null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = (event.clientX - centerX) ** 2 + (event.clientY - centerY) ** 2;
    if (distance < nearestDistance) {
      nearest = card;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function handleKeyboard(event) {
  const renameTitle = event.target.closest("[data-rename-group-id]");
  if (renameTitle && (event.key === "Enter" || event.key === "F2")) {
    event.preventDefault();
    startInlineGroupRename(renameTitle);
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openSearchModal();
    return;
  }
  if (event.key === "/" && !event.target.closest("input, textarea")) {
    event.preventDefault();
    els.searchInput.focus();
  }
  if (event.key === "Escape") {
    closeOpenTabContextMenu();
    closeSessionSelection();
    render();
  }
}

function render() {
  ensureFocusedGroup();
  renderWorkspaceSwitcher();
  renderStats();
  renderHeaderActions();
  renderContextStrip();
  renderActiveTabs();
  renderFolders();
  renderGroups();
  renderInspector();
}

function renderStats() {
  const stats = collectStats({ ...state, groups: workspaceGroups() });
  els.statsLine.textContent = `${stats.savedTabs} saved tabs, ${workspaceGroups().length} groups`;
}

function renderHeaderActions() {
  els.headerActions.replaceChildren(
    collapseToggleButton(workspaceGroups(), {
      "data-action": "toggle-all-collapse"
    }, "all sessions")
  );
}

function renderWorkspaceSwitcher() {
  els.workspaceSelect.replaceChildren();
  for (const workspace of state.workspaces) {
    els.workspaceSelect.append(
      h("option", { value: workspace.id, selected: workspace.id === activeWorkspaceId }, workspace.name)
    );
  }
}

function renderContextStrip() {
  if (!els.contextStrip) {
    return;
  }
  const items = buildContextStripItems({
    workspaceName: activeWorkspaceName(),
    categoryLabel: activeCategoryLabel(),
    searchQuery,
    openTabTitle: openTabFilter?.title || ""
  });
  els.contextStrip.replaceChildren(
    ...items.map((item) => h("span", { class: `context-chip context-chip-${item.kind}` }, item.label))
  );
}

function renderActiveTabs() {
  if (!els.activeTabsPanel) {
    return;
  }
  renderOpenTabsToolbar();
  els.activeTabsPanel.replaceChildren();
  if (openTabsLoading) {
    els.activeTabsPanel.append(h("div", { class: "active-tabs-empty" }, "Loading open tabs"));
    return;
  }
  if (!openWindows.length) {
    els.activeTabsPanel.append(h("div", { class: "active-tabs-empty" }, "No open tabs"));
    return;
  }

  const windowInfo = openWindows.find((item) => item.focused) || openWindows[0];
  const section = h("section", { class: "active-window" });
  section.append(
    h(
      "header",
      { class: "active-window-header" },
      h("strong", {}, "Current window"),
      h(
        "div",
        { class: "active-window-actions" },
        iconOnlyButton("square-check", openTabsSelectMode ? "Exit select mode" : "Select tabs", {
          class: `small-button open-tabs-select-toggle${openTabsSelectMode ? " active" : ""}`,
          "data-action": "toggle-open-tabs-select-mode",
          "aria-pressed": openTabsSelectMode
        }),
        iconOnlyButton(
          "archive",
          "Save current window",
          {
            class: "small-button",
            "data-action": "capture-current-window"
          }
        )
      )
    )
  );

  const visibleTabs = (windowInfo.tabs || []).filter((tab) => tab.storable);
  const list = h("ul", { class: "active-tab-list" });
  for (const tab of visibleTabs) {
    const tabId = String(tab.id);
    const checked = selectedOpenTabIds.has(tabId);
    const filtered = openTabFilter?.url && openTabFilter.url === tab.url;
    const favicon =
      state.settings.showFavicons && tab.favIconUrl
        ? h("img", { class: "favicon", src: tab.favIconUrl, alt: "" })
        : "";
    list.append(
      h(
        "li",
        {
          class: `active-tab-row${tab.active ? " active" : ""}${checked ? " selected" : ""}${filtered ? " filtered" : ""}`,
          draggable: "true",
          "data-drag-kind": "open-tab",
          "data-open-tab-id": tabId
        },
        h(
          "div",
          { class: "active-tab-leading" },
          openTabsSelectMode
            ? h("input", {
                type: "checkbox",
                class: "open-tab-checkbox",
                "data-action": "toggle-open-tab",
                "data-open-tab-id": tabId,
                checked,
                "aria-label": `Select ${tab.title}`
              })
            : null,
          favicon
        ),
        h("span", { class: "active-tab-title", title: tab.url }, tab.title)
      )
    );
  }
  if (!visibleTabs.length) {
    list.append(h("li", { class: "active-tabs-empty" }, "No savable tabs"));
  }
  section.append(list);
  els.activeTabsPanel.append(section);
}

function renderOpenTabsToolbar() {
  if (!els.openTabsToolbar) {
    return;
  }
  const selectedTabs = selectedOpenTabRecords();
  const nodes = [];
  if (selectedTabs.length) {
    nodes.push(
      h(
        "div",
        { class: "active-tab-toolbar-row" },
        h("strong", {}, `${selectedTabs.length} selected`),
        h("span", { class: "muted" }, "Create a session or drag selected tabs into a session"),
        iconOnlyButton("list-plus", "Create session from selected tabs", {
          class: "small-button",
          "data-action": "capture-selected-open-tabs"
        }),
        iconOnlyButton("x", "Clear selected tabs", { class: "small-button", "data-action": "clear-open-tabs" })
      )
    );
  }
  if (openTabFilter) {
    nodes.push(
      h(
        "div",
        { class: "active-tab-toolbar-row filter-row" },
        h("strong", {}, "Filtered"),
        h("span", { class: "muted", title: openTabFilter.url }, openTabFilter.title || openTabFilter.url),
        iconOnlyButton("x", "Clear tab filter", { class: "small-button", "data-action": "clear-open-tab-filter" })
      )
    );
  }
  els.openTabsToolbar.hidden = nodes.length === 0;
  els.openTabsToolbar.replaceChildren(...nodes);
}

function allOpenTabs() {
  return openWindows.flatMap((windowInfo) => windowInfo.tabs || []);
}

function findOpenTabById(tabId) {
  const key = String(tabId);
  return allOpenTabs().find((tab) => String(tab.id) === key) || null;
}

function currentWindowOpenTabs() {
  const windowInfo = openWindows.find((item) => item.focused) || openWindows[0];
  return windowInfo?.tabs || [];
}

function selectedOpenTabRecords() {
  return currentWindowOpenTabs().filter((tab) => selectedOpenTabIds.has(String(tab.id)) && tab.storable);
}

function toggleOpenTabSelection(tabId) {
  if (!tabId) {
    return;
  }
  openTabsSelectMode = true;
  const key = String(tabId);
  if (selectedOpenTabIds.has(key)) {
    selectedOpenTabIds.delete(key);
  } else {
    selectedOpenTabIds.add(key);
  }
  renderOpenTabsToolbar();
  renderActiveTabs();
}

function toggleOpenTabsSelectMode() {
  openTabsSelectMode = !openTabsSelectMode;
  if (!openTabsSelectMode) {
    selectedOpenTabIds.clear();
  }
  renderOpenTabsToolbar();
  renderActiveTabs();
}

function applyOpenTabFilter(tabId) {
  const tab = findOpenTabById(tabId);
  if (!tab?.url) {
    return;
  }
  openTabFilter = {
    url: tab.url,
    title: tab.title || tab.url
  };
  closeOpenTabContextMenu();
  renderOpenTabsToolbar();
  renderActiveTabs();
  renderStats();
  renderGroups();
}

function clearOpenTabFilter() {
  if (!openTabFilter) {
    return;
  }
  openTabFilter = null;
  closeOpenTabContextMenu();
  renderOpenTabsToolbar();
  renderActiveTabs();
  renderStats();
  renderGroups();
}

function trimMissingOpenTabSelections() {
  const ids = new Set(currentWindowOpenTabs().map((tab) => String(tab.id)));
  for (const tabId of selectedOpenTabIds) {
    if (!ids.has(tabId)) {
      selectedOpenTabIds.delete(tabId);
    }
  }
  if (openTabFilter && !currentWindowOpenTabs().some((tab) => tab.url === openTabFilter.url)) {
    openTabFilter = null;
  }
}

function renderFolders() {
  els.folderList.replaceChildren();
  for (const category of orderedCategoryItems()) {
    els.folderList.append(renderCategoryRow(category));
  }
}

function filterButton(filter, label, count) {
  return h(
    "button",
    {
      type: "button",
      class: activeFilter === filter ? "folder-button active" : "folder-button",
      "data-action": "filter",
      "data-filter": filter
    },
    h("span", {}, label),
    h("strong", {}, count)
  );
}

function renderCategoryRow(category) {
  const row = h("div", {
    class: `folder-row category-row${category.folder ? ` color-${category.folder.color}` : ""}`,
    draggable: "true",
    "data-drag-kind": "category",
    "data-category-id": category.id,
    "data-folder-id": category.folder?.id || "",
    "data-drop": "category-reorder",
    "aria-label": `Reorder ${category.label}`
  });
  row.append(filterButton(category.filter, category.label, category.count));
  return row;
}

function orderedCategoryItems() {
  const categories = categoryItems();
  const byId = new Map(categories.map((category) => [category.id, category]));
  const order = categoryOrderForCurrentWorkspace();
  return [
    ...order.map((id) => byId.get(id)).filter(Boolean),
    ...categories.filter((category) => !order.includes(category.id))
  ];
}

function categoryItems() {
  const groups = workspaceGroups();
  const folders = workspaceFolders();
  return [
    {
      id: CATEGORY_INBOX,
      filter: CATEGORY_INBOX,
      label: "Inbox",
      count: String(groups.filter((group) => groupCategoryFilter(group) === CATEGORY_INBOX).length)
    },
    {
      id: CATEGORY_STARRED,
      filter: CATEGORY_STARRED,
      label: "Starred",
      count: String(groups.filter((group) => groupCategoryFilter(group) === CATEGORY_STARRED).length)
    },
    ...folders.map((folder) => ({
      id: `folder:${folder.id}`,
      filter: `folder:${folder.id}`,
      label: folder.name,
      count: String(groups.filter((group) => groupCategoryFilter(group) === `folder:${folder.id}`).length),
      folder
    }))
  ];
}

function categoryOrderForCurrentWorkspace() {
  const order = state.categoryOrderByWorkspace?.[activeWorkspaceId] || [];
  const normalized = [];
  for (const id of order) {
    const nextId = id === "all" ? "" : id === "unfiled" ? CATEGORY_INBOX : id;
    if (nextId && !normalized.includes(nextId)) {
      normalized.push(nextId);
    }
  }
  return normalized;
}

function renderSessionSelectionToolbar(group) {
  const refs = selectedRefsForGroup(group.id);
  const disabled = refs.length === 0;
  return h(
    "div",
    { class: "session-selection-toolbar" },
    h("strong", {}, `${refs.length} selected`),
    iconOnlyButton("rotate-ccw", "Restore selected tabs", {
      "data-action": "selection-restore",
      "data-group-id": group.id,
      disabled
    }),
    iconOnlyButton("copy", "Copy selected URLs", {
      "data-action": "selection-copy",
      "data-group-id": group.id,
      disabled
    }),
    iconOnlyButton("trash-2", "Delete selected tabs", {
      class: "danger",
      "data-action": "selection-delete",
      "data-group-id": group.id,
      disabled
    }),
    iconOnlyButton("x", "Close selection mode", { "data-action": "selection-clear", "data-group-id": group.id })
  );
}

function renderGroups() {
  els.groupsList.replaceChildren();
  els.groupsList.className = "groups-list category-sections";
  const groups = visibleGroups();

  for (const category of orderedCategoryItems()) {
    els.groupsList.append(renderCategorySection(category, groups));
  }
}

function renderInspector() {
  if (!els.inspectorPanel) {
    return;
  }
  const group = focusedGroup();
  const model = buildInspectorModel({
    group,
    categoryLabel: activeCategoryLabel(),
    restorableCount: group ? group.tabs.filter(isRestorableTab).length : 0
  });
  els.inspectorPanel.replaceChildren();
  els.inspectorPanel.dataset.state = model.state;

  if (model.state === "empty") {
    els.inspectorPanel.append(
      h(
        "div",
        { class: "inspector-empty" },
        h("h2", { id: "inspectorTitle" }, model.title),
        h("p", { class: "muted" }, model.message)
      )
    );
    return;
  }

  els.inspectorPanel.append(
    h(
      "div",
      { class: "inspector-card" },
      h(
        "header",
        { class: "inspector-header" },
        h("h2", { id: "inspectorTitle" }, model.title),
        h("p", { class: "muted" }, model.meta)
      ),
      h(
        "div",
        { class: "inspector-actions" },
        renderInspectorAction("restore", group),
        renderInspectorMenuAction("rename", group),
        renderInspectorMenuAction("note", group),
        renderInspectorMenuAction("lock", group),
        renderInspectorMenuAction("copy", group),
        renderInspectorMenuAction("delete", group)
      ),
      model.note ? h("p", { class: "inspector-note" }, model.note) : ""
    )
  );
}

function renderInspectorAction(actionId, group) {
  if (actionId !== "restore") {
    return null;
  }
  return iconOnlyButton("rotate-ccw", "Restore session", {
    class: "primary",
    "data-action": "restore-group",
    "data-group-id": group.id
  });
}

function renderInspectorMenuAction(actionId, group) {
  if (actionId === "rename") {
    return iconTextButton("edit-3", "Rename", { "data-action": "rename-group", "data-group-id": group.id });
  }
  if (actionId === "note") {
    return iconTextButton("sticky-note", "Edit note", { "data-action": "edit-group-note", "data-group-id": group.id });
  }
  if (actionId === "lock") {
    return iconTextButton(group.locked ? "unlock" : "lock", group.locked ? "Unlock" : "Lock", {
      "data-action": "toggle-group-lock",
      "data-group-id": group.id
    });
  }
  if (actionId === "copy") {
    return iconTextButton("copy", "Copy", { "data-action": "copy-group", "data-group-id": group.id });
  }
  if (actionId === "delete") {
    return iconTextButton("trash-2", "Delete", { class: "danger", "data-action": "delete-group", "data-group-id": group.id });
  }
  return null;
}

function renderCategorySection(category, groups) {
  const sectionGroups = groupsForCategory(category, groups);
  const categoryGroups = groupsForCategory(category, workspaceGroups());
  const restorableCount = sectionGroups.reduce(
    (total, group) => total + group.tabs.filter(isRestorableTab).length,
    0
  );
  const attrs = {
    class: `category-section${activeFilter === category.filter ? " active" : ""}`,
    id: categorySectionId(category.id),
    "data-category-id": category.id,
    "data-category-filter": category.filter
  };
  if (categoryAcceptsDrop(category)) {
    attrs["data-drop"] = "category-column";
    attrs["data-folder-id"] = category.folder?.id || "";
  }

  const body = h("div", { class: "category-section-grid" });
  if (sectionGroups.length) {
    for (const group of sectionGroups) {
      body.append(renderGroup(group, category.id));
    }
  } else if (!categoryAcceptsDrop(category)) {
    body.append(h("div", { class: "category-section-empty" }, categoryEmptyText(category)));
  }
  return h(
    "section",
    attrs,
    h(
      "header",
      { class: "category-section-header" },
      h(
        "div",
        { class: "category-section-title-row" },
        collapseToggleButton(categoryGroups, {
          class: "small-button",
          "data-action": "toggle-category-collapse",
          "data-category-filter": category.filter
        }, `${category.label} sessions`),
        h(
          "div",
          { class: "category-section-title" },
          h("h3", {}, category.label),
          h("p", { class: "muted" }, `${sectionGroups.length} sessions - ${restorableCount} links`)
        )
      )
    ),
    body
  );
}

function groupsForCategory(category, groups) {
  return groups.filter((group) => groupCategoryFilter(group) === category.filter);
}

function categoryAcceptsDrop(category) {
  return category.filter === CATEGORY_INBOX || category.filter === CATEGORY_STARRED || Boolean(category.folder);
}

function categoryEmptyText(category) {
  if (category.filter === CATEGORY_INBOX) {
    return "No sessions in Inbox";
  }
  if (category.filter === CATEGORY_STARRED) {
    return "No starred sessions";
  }
  if (categoryAcceptsDrop(category)) {
    return "Drop sessions here";
  }
  return "No sessions";
}

function categorySectionId(categoryId) {
  return `category-section-${safeDomId(categoryId)}`;
}

function safeDomId(value) {
  return String(value).replace(/[^a-z0-9_-]/gi, "_");
}

function normalizeCategoryFilter(filter) {
  const value = String(filter || "").trim();
  if (!value || value === "all" || value === "unfiled") {
    return CATEGORY_INBOX;
  }
  if (value === CATEGORY_INBOX || value === CATEGORY_STARRED || value.startsWith("folder:")) {
    return value;
  }
  return CATEGORY_INBOX;
}

function groupCategoryFilter(group) {
  if (group.starred) {
    return CATEGORY_STARRED;
  }
  if (group.folderId) {
    return `folder:${group.folderId}`;
  }
  return CATEGORY_INBOX;
}

function assignGroupCategory(group, categoryFilter, folders = state.folders) {
  const filter = normalizeCategoryFilter(categoryFilter);
  if (filter === CATEGORY_STARRED) {
    group.starred = true;
    group.folderId = null;
    group.workspaceId = activeWorkspaceId;
    return;
  }
  group.starred = false;
  if (filter.startsWith("folder:")) {
    const folderId = filter.slice("folder:".length);
    const folder = folders.find((item) => item.id === folderId);
    group.folderId = folder?.id || null;
    group.workspaceId = folder?.workspaceId || activeWorkspaceId;
    return;
  }
  group.folderId = null;
  group.workspaceId = activeWorkspaceId;
}

function collapseToggleButton(groups, attrs = {}, label = "sessions") {
  const intent = collapseIntent(groups, label);
  return iconOnlyButton(intent.icon, intent.label, {
    ...attrs,
    class: `collapse-toggle ${attrs.class || ""}`.trim(),
    disabled: intent.disabled,
    "aria-expanded": intent.willExpand ? "false" : "true",
    "data-collapse-action": intent.willExpand ? "expand" : "collapse"
  });
}

function collapseToggleTextButton(groups, attrs = {}, label = "sessions") {
  const intent = collapseIntent(groups, label);
  return iconTextButton(intent.icon, intent.label, {
    ...attrs,
    class: `collapse-toggle ${attrs.class || ""}`.trim(),
    disabled: intent.disabled,
    "aria-expanded": intent.willExpand ? "false" : "true",
    "data-collapse-action": intent.willExpand ? "expand" : "collapse"
  });
}

function collapseIntent(groups, label) {
  const hasGroups = groups.length > 0;
  const willExpand = hasGroups && groups.every((group) => group.collapsed);
  return {
    disabled: hasGroups ? false : true,
    icon: willExpand ? "chevrons-down" : "chevrons-up",
    label: willExpand ? `Expand ${label}` : `Collapse ${label}`,
    willExpand
  };
}

function sessionActionOrder() {
  const configured = Array.isArray(state.settings.sessionActionOrder)
    ? state.settings.sessionActionOrder.map((item) => String(item))
    : [];
  return [
    ...new Set(configured.filter((item) => SESSION_ACTION_IDS.includes(item))),
    ...SESSION_ACTION_IDS.filter((item) => !configured.includes(item))
  ];
}

function sessionExternalActionIds() {
  const configured = Array.isArray(state.settings.sessionExternalActions)
    ? state.settings.sessionExternalActions.map((item) => String(item))
    : [...DEFAULT_SESSION_EXTERNAL_ACTIONS];
  const visible = new Set(configured.filter((item) => SESSION_ACTION_IDS.includes(item)));
  return sessionActionOrder().filter((item) => visible.has(item));
}

function ensureFocusedGroup() {
  const groups = visibleGroups();
  const visibleIds = new Set(groups.map((group) => group.id));
  if (focusedGroupId && visibleIds.has(focusedGroupId)) {
    return;
  }
  focusedGroupId = groups[0]?.id || "";
}

function focusedGroup() {
  const groups = visibleGroups();
  if (!focusedGroupId) {
    return groups[0] || null;
  }
  return groups.find((group) => group.id === focusedGroupId) || groups[0] || null;
}

function focusGroup(groupId) {
  focusedGroupId = String(groupId || "");
  renderInspector();
}

function activeWorkspace() {
  return state.workspaces.find((workspace) => workspace.id === activeWorkspaceId) || state.workspaces[0] || null;
}

function activeWorkspaceName() {
  return activeWorkspace()?.name || "";
}

function activeCategoryLabel() {
  if (activeFilter === CATEGORY_STARRED) {
    return "Starred";
  }
  if (activeFilter.startsWith("folder:")) {
    const folderId = activeFilter.slice("folder:".length);
    return state.folders.find((folder) => folder.id === folderId)?.name || "Folder";
  }
  return "Inbox";
}

function sessionActionNodes(group, restorableCount) {
  const baseAttrs = { "data-group-id": group.id };
  return {
    add: {
      external: () => actionMenu(
        { label: "Add", icon: "plus", tooltip: "Add item" },
        iconTextButton("link", "Link", { "data-action": "add-link", "data-group-id": group.id }),
        iconTextButton("sticky-note", "Note", { "data-action": "add-note", "data-group-id": group.id })
      ),
      menu: () => [
        iconTextButton("link", "Add link", { "data-action": "add-link", "data-group-id": group.id }),
        iconTextButton("sticky-note", "Add note", { "data-action": "add-note", "data-group-id": group.id })
      ]
    },
    collapse: {
      external: () => collapseToggleButton([group], { "data-action": "toggle-group-collapse", ...baseAttrs }, "this session"),
      menu: () => collapseToggleTextButton([group], { "data-action": "toggle-group-collapse", ...baseAttrs }, "this session")
    },
    copy: {
      external: () => iconOnlyButton("copy", "Copy session", { "data-action": "copy-group", ...baseAttrs }),
      menu: () => iconTextButton("copy", "Copy", { "data-action": "copy-group", ...baseAttrs })
    },
    delete: {
      external: () => iconOnlyButton("trash-2", "Delete session", { class: "danger", "data-action": "delete-group", ...baseAttrs }),
      menu: () => iconTextButton("trash-2", "Delete", { class: "danger", "data-action": "delete-group", ...baseAttrs })
    },
    lock: {
      external: () => iconOnlyButton(group.locked ? "unlock" : "lock", group.locked ? "Unlock session" : "Lock session", {
        "data-action": "toggle-group-lock",
        ...baseAttrs
      }),
      menu: () => iconTextButton(group.locked ? "unlock" : "lock", group.locked ? "Unlock" : "Lock", {
        "data-action": "toggle-group-lock",
        ...baseAttrs
      })
    },
    note: {
      external: () => iconOnlyButton("sticky-note", "Edit session note", { "data-action": "edit-group-note", ...baseAttrs }),
      menu: () => iconTextButton("sticky-note", "Note", { "data-action": "edit-group-note", ...baseAttrs })
    },
    rename: {
      external: () => iconOnlyButton("edit-3", "Rename session", { "data-action": "rename-group", ...baseAttrs }),
      menu: () => iconTextButton("edit-3", "Rename", { "data-action": "rename-group", ...baseAttrs })
    },
    restore: {
      external: () => restorableCount
        ? iconOnlyButton("rotate-ccw", "Restore session", { "data-action": "restore-group", ...baseAttrs })
        : null,
      menu: () => restorableCount
        ? iconTextButton("rotate-ccw", "Restore", { "data-action": "restore-group", ...baseAttrs })
        : null
    },
  };
}

function renderSessionActions(group, restorableCount) {
  const actions = sessionActionNodes(group, restorableCount);
  const layout = getSessionActionLayout(restorableCount);
  const externalNodes = layout.external
    .flatMap((id) => [actions[id]?.external?.()].flat())
    .filter(Boolean);
  const menuNodes = layout.menu
    .flatMap((id) => [actions[id]?.menu?.()].flat(2))
    .filter(Boolean);
  return [
    ...externalNodes,
    menuNodes.length
      ? actionMenu({ label: "More", icon: "more-horizontal", tooltip: "More session actions" }, ...menuNodes)
      : ""
  ];
}

function setActiveCategory(filter, options = {}) {
  activeFilter = normalizeCategoryFilter(filter);
  localStorage.setItem("ziptab.activeFilter", activeFilter);
  renderStats();
  renderFolders();
  renderGroups();
  if (options.scroll) {
    requestAnimationFrame(() => scrollToCategory(filter));
  }
}

function scrollToCategory(categoryId, behavior = "smooth") {
  document
    .getElementById(categorySectionId(categoryId))
    ?.scrollIntoView({ block: "start", behavior });
}

function renderGroup(group, contextId = "") {
  const matchingTabs = visibleTabsForGroup(group);
  const restorableCount = group.tabs.filter(isRestorableTab).length;
  const noteCount = group.tabs.filter((tab) => tab.itemType === ITEM_NOTE).length;
  const card = h("article", {
    class: `group-card${group.starred ? " starred" : ""}${group.locked ? " locked" : ""}`,
    id: contextId ? `group-${group.id}-${safeDomId(contextId)}` : `group-${group.id}`,
    draggable: "true",
    tabindex: "0",
    "data-drag-kind": "group",
    "data-group-id": group.id,
    "data-drop": "group-body"
  });

  const title = h(
    "div",
    { class: "group-title-block" },
    h(
      "h3",
      {
        class: "group-title-inline",
        title: group.title,
        role: "button",
        tabindex: "0",
        "data-rename-group-id": group.id,
        "aria-label": `Rename session ${group.title}`
      },
      group.title
    )
  );
  const metaBits = [
    `${restorableCount} links`,
    noteCount ? `${noteCount} notes` : "",
    group.locked ? "locked" : "",
    group.starred ? "starred" : ""
  ].filter(Boolean);
  const metaText = metaBits.join(" - ");
  title.append(h("p", { class: "muted" }, metaText));

  const header =
    selectionGroupId === group.id
      ? h("header", { class: "group-header selection-mode" }, renderSessionSelectionToolbar(group))
      : h(
          "header",
          { class: "group-header" },
          title,
          h("div", { class: "group-actions" }, ...renderSessionActions(group, restorableCount))
        );
  card.addEventListener("click", () => focusGroup(group.id));
  card.addEventListener("focusin", () => focusGroup(group.id));
  card.append(header);

  if (group.note) {
    card.append(h("p", { class: "group-note" }, group.note));
  }

  if (!group.collapsed) {
    const list = h("ul", { class: "tab-list" });
    const previewLimit = searchQuery ? TAB_PREVIEW_LIMIT + 2 : TAB_PREVIEW_LIMIT;
    const isPreviewExpanded = expandedGroupIds.has(group.id);
    const visibleTabs = isPreviewExpanded ? matchingTabs : matchingTabs.slice(0, previewLimit);
    const hiddenTabCount = matchingTabs.length - visibleTabs.length;
    for (const tab of visibleTabs) {
      list.append(renderTabRow(tab, { source: "group", groupId: group.id }));
    }
    if (!matchingTabs.length) {
      list.append(h("li", { class: "empty-row", "data-drop": "group-body", "data-group-id": group.id }, "No matches"));
    } else if (hiddenTabCount > 0 || isPreviewExpanded) {
      list.append(
        h(
          "li",
          { class: "tab-overflow-row" },
          h(
            "button",
            {
              type: "button",
              class: "text-button",
              "data-action": "toggle-group-preview",
              "data-group-id": group.id
            },
            isPreviewExpanded ? "Show fewer" : `Show ${hiddenTabCount} more`
          )
        )
      );
    }
    card.append(list);
  }

  return card;
}

function renderTabRow(tab, { source, groupId }) {
  const selectedKey = keyFor(source, groupId, tab.id);
  const selectionMode = selectionGroupId === groupId;
  const canOpen = isRestorableTab(tab);
  const isTextItem = tab.itemType === ITEM_NOTE;
  const ref = { source, groupId, tabId: tab.id };
  const row = h("li", {
    class: `tab-row item-${tab.itemType || ITEM_LINK}${selectionMode ? " selecting" : ""}${selected.has(selectedKey) ? " selected" : ""}`,
    draggable: "true",
    "data-drag-kind": "tab",
    "data-drop": "tab-before",
    "data-source": source,
    "data-group-id": groupId,
    "data-tab-id": tab.id
  });

  const favicon =
    isTextItem
      ? h("span", { class: "favicon item-badge", "aria-hidden": "true" }, "N")
      : state.settings.showFavicons && tab.favIconUrl
      ? h("img", { class: "favicon", src: tab.favIconUrl, alt: "" })
      : "";
  const titleNode = canOpen
    ? h("a", { href: tab.url, target: "_blank", rel: "noreferrer", title: tab.title }, tab.title)
    : h("span", { class: "tab-title", title: tab.note || tab.title }, tab.note || tab.title);
  const subline = canOpen
    ? tab.url
    : itemTypeLabel(tab.itemType);

  row.append(
    h(
      "div",
      { class: "tab-leading" },
      selectionMode
        ? h("input", {
            type: "checkbox",
            class: "tab-select-checkbox",
            "data-action": "toggle-select",
            "data-source": source,
            "data-group-id": groupId,
            "data-tab-id": tab.id,
            checked: selected.has(selectedKey),
            "aria-label": `Select ${tab.title}`
          })
        : "",
      favicon
    ),
    h(
      "div",
      { class: "tab-main" },
      titleNode,
      h("span", { class: "url-line", title: subline }, subline),
      tab.note && canOpen ? h("p", { class: "tab-note" }, tab.note) : ""
    )
  );
  return row;
}

function tabActionItems(tab, ref) {
  const canOpen = isRestorableTab(tab);
  const selectionMode = selectionGroupId === ref.groupId;
  const copyLabel = canOpen ? "Copy URL" : "Copy text";
  const attrs = {
    "data-source": ref.source,
    "data-group-id": ref.groupId,
    "data-tab-id": ref.tabId
  };
  return [
    selectionMode
      ? null
      : iconTextButton("square-check", "Select", {
          "data-action": "start-selection",
          ...attrs
        }),
    iconTextButton(canOpen ? "sticky-note" : "edit-3", canOpen ? "Note" : "Edit", {
      "data-action": "edit-tab-note",
      ...attrs
    }),
    iconTextButton("copy", copyLabel, {
      "data-action": "copy-tab",
      ...attrs
    }),
    iconTextButton("trash-2", "Delete", {
      class: "danger",
      "data-action": "delete-tab",
      ...attrs
    })
  ].filter(Boolean);
}

function actionMenu(label, ...items) {
  const config =
    typeof label === "object"
      ? label
      : {
          label,
          icon: label === "Add" ? "plus" : "more-horizontal",
          tooltip: `${label} actions`
        };
  return h(
    "details",
    { class: "action-menu" },
    iconSummary(config.icon || "more-horizontal", config.label, {
      "aria-label": `${config.label} actions`,
      "data-tooltip": config.tooltip || `${config.label} actions`
    }),
    h("div", { class: "action-menu-panel" }, ...items)
  );
}

function closeActionMenus(except = null) {
  for (const menu of document.querySelectorAll(".action-menu[open]")) {
    if (menu !== except) {
      menu.removeAttribute("open");
    }
  }
}

function openOpenTabContextMenu(tabId, clientX, clientY) {
  const tab = findOpenTabById(tabId);
  if (!tab?.storable) {
    return;
  }
  closeOpenTabContextMenu();
  const menu = h(
    "div",
    {
      class: "open-tab-context-menu",
      role: "menu",
      style: `left:${clientX}px;top:${clientY}px`
    },
    iconTextButton(
      "filter",
      "Filter sessions by this tab",
      {
        role: "menuitem",
        "data-action": "filter-open-tab",
        "data-open-tab-id": String(tab.id)
      }
    ),
    openTabFilter
      ? iconTextButton(
          "x",
          "Clear tab filter",
          {
            role: "menuitem",
            "data-action": "clear-open-tab-filter"
          }
        )
      : null
  );
  placeContextMenu(menu, clientX, clientY);
}

function openSavedTabContextMenu(ref, clientX, clientY) {
  const found = findTabRef(state, ref);
  if (!found?.tab) {
    return;
  }
  closeOpenTabContextMenu();
  const menu = h(
    "div",
    {
      class: "open-tab-context-menu",
      role: "menu",
      style: `left:${clientX}px;top:${clientY}px`
    },
    ...tabActionItems(found.tab, {
      source: ref.source || "group",
      groupId: ref.groupId,
      tabId: ref.tabId
    })
  );
  placeContextMenu(menu, clientX, clientY);
}

function openCategoryContextMenu(folderId, clientX, clientY) {
  const folder = state.folders.find((item) => item.id === folderId);
  if (!folder) {
    return;
  }
  closeOpenTabContextMenu();
  const menu = h(
    "div",
    {
      class: "open-tab-context-menu category-context-menu",
      role: "menu",
      style: `left:${clientX}px;top:${clientY}px`
    },
    iconTextButton("edit-3", "Rename category", {
      role: "menuitem",
      "data-action": "rename-folder",
      "data-folder-id": folder.id
    }),
    iconTextButton("trash-2", "Delete category", {
      class: "danger",
      role: "menuitem",
      "data-action": "delete-folder",
      "data-folder-id": folder.id
    })
  );
  placeContextMenu(menu, clientX, clientY);
}

function placeContextMenu(menu, clientX, clientY) {
  document.body.append(menu);
  const rect = menu.getBoundingClientRect();
  const left = Math.min(clientX, window.innerWidth - rect.width - 8);
  const top = Math.min(clientY, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
}

function closeOpenTabContextMenu() {
  document.querySelector(".open-tab-context-menu")?.remove();
}

function visibleGroups() {
  return workspaceGroups().filter(
    (group) => groupMatchesQuery(group, searchQuery) && groupMatchesOpenTabFilter(group)
  );
}

function visibleTabsForGroup(group) {
  if (!searchQuery || group.title.toLowerCase().includes(searchQuery.toLowerCase())) {
    return group.tabs;
  }
  return group.tabs.filter((tab) => tabMatchesQuery(tab, searchQuery));
}

function groupMatchesOpenTabFilter(group) {
  if (!openTabFilter?.url) {
    return true;
  }
  return group.tabs.some((tab) => tab.url === openTabFilter.url);
}

function ensureActiveWorkspace() {
  const ids = new Set(state.workspaces.map((workspace) => workspace.id));
  if (!ids.has(activeWorkspaceId)) {
    activeWorkspaceId = state.activeWorkspaceId && ids.has(state.activeWorkspaceId)
      ? state.activeWorkspaceId
      : state.workspaces[0]?.id || DEFAULT_WORKSPACE_ID;
    localStorage.setItem("ziptab.activeWorkspaceId", activeWorkspaceId);
  }
  const normalizedFilter = normalizeCategoryFilter(activeFilter);
  if (normalizedFilter !== activeFilter) {
    activeFilter = normalizedFilter;
    localStorage.setItem("ziptab.activeFilter", activeFilter);
  }
  if (activeFilter.startsWith("folder:")) {
    const folderId = activeFilter.slice("folder:".length);
    const folder = state.folders.find((item) => item.id === folderId);
    if (!folder || folder.workspaceId !== activeWorkspaceId) {
      activeFilter = CATEGORY_INBOX;
      localStorage.setItem("ziptab.activeFilter", activeFilter);
    }
  }
}

async function migrateLegacyQuickList() {
  if (!state.quickList?.length) {
    return;
  }
  const nextState = await updateState((draft) => {
    if (!draft.quickList?.length) {
      return draft;
    }
    const workspaceId = draft.activeWorkspaceId || activeWorkspaceId || DEFAULT_WORKSPACE_ID;
    draft.groups.unshift(
      createGroupFromTabRecords(draft.quickList, {
        title: "Former Quick list",
        workspaceId
      })
    );
    draft.quickList = [];
    return draft;
  });
  state = normalizeState(nextState);
  ensureActiveWorkspace();
}

function currentWorkspace() {
  return state.workspaces.find((workspace) => workspace.id === activeWorkspaceId) || state.workspaces[0] || {
    id: DEFAULT_WORKSPACE_ID,
    name: "Personal"
  };
}

function workspaceGroups() {
  return state.groups.filter((group) => group.workspaceId === activeWorkspaceId);
}

function workspaceFolders() {
  return state.folders.filter((folder) => folder.workspaceId === activeWorkspaceId);
}

async function loadOpenTabs() {
  openTabsLoading = true;
  renderActiveTabs();
  try {
    const result = await sendRuntime({ type: "list-open-tabs" });
    openWindows = result.windows || [];
  } catch (error) {
    toast(error?.message || String(error), true);
    openWindows = [];
  } finally {
    openTabsLoading = false;
    trimMissingOpenTabSelections();
    renderActiveTabs();
    renderStats();
    renderGroups();
  }
}

async function sendRuntime(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "Chrome runtime call failed");
  }
  return response.result;
}

async function deleteGroup(groupId) {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) {
    return;
  }
  if (state.settings.confirmDestructive && !confirm(`Delete "${group.title}"?`)) {
    return;
  }
  await updateState((draft) => {
    pushBinEntry(draft, createBinEntry("group", group, { label: group.title }));
    draft.groups = draft.groups.filter((item) => item.id !== groupId);
    return draft;
  });
}

async function deleteTab(ref) {
  if (state.settings.confirmDestructive && !confirm("Delete this saved tab?")) {
    return;
  }
  await updateState((draft) => {
    const found = findTabRef(draft, ref);
    const tab = removeTabFromDraft(draft, ref);
    if (tab) {
      pushBinEntry(
        draft,
        createBinEntry("tab", tab, {
          groupId: ref.groupId,
          groupTitle: found?.group?.title || "",
          label: tab.title,
          source: ref.source
        })
      );
    }
    return draft;
  });
  selected.delete(keyFor(ref.source, ref.groupId, ref.tabId));
}

async function renameGroup(groupId) {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) {
    return;
  }
  const next = prompt("Group name", group.title);
  if (next === null) {
    return;
  }
  const changed = await saveGroupTitle(groupId, next);
  if (changed) {
    toast("Renamed");
  }
}

function startInlineGroupRename(titleNode) {
  const groupId = titleNode.dataset.renameGroupId;
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) {
    return;
  }

  const activeInput = document.querySelector(".group-title-input");
  if (activeInput) {
    activeInput.blur();
    return;
  }

  const input = h("input", {
    class: "group-title-input",
    type: "text",
    value: group.title,
    maxlength: "160",
    "aria-label": "Session title"
  });
  input.value = group.title;

  let finished = false;
  const finish = async (commit) => {
    if (finished) {
      return;
    }
    finished = true;
    const next = input.value.trim();
    if (commit && next && next !== group.title) {
      const changed = await saveGroupTitle(groupId, next);
      if (changed) {
        toast("Renamed");
      }
      return;
    }
    renderGroups();
  };

  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.isComposing) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      void finish(false);
    }
  });
  input.addEventListener("blur", () => {
    void finish(true);
  });

  titleNode.replaceWith(input);
  input.focus();
  input.select();
}

async function saveGroupTitle(groupId, title) {
  const nextTitle = String(title || "").trim();
  const group = state.groups.find((item) => item.id === groupId);
  if (!group || !nextTitle || group.title === nextTitle) {
    return false;
  }
  const nextState = await updateState((draft) => {
    const draftGroup = draft.groups.find((item) => item.id === groupId);
    if (draftGroup) {
      draftGroup.title = nextTitle;
      draftGroup.updatedAt = nowIso();
    }
    return draft;
  });
  state = normalizeState(nextState);
  ensureActiveWorkspace();
  render();
  return true;
}

async function editGroupNote(groupId) {
  const group = state.groups.find((item) => item.id === groupId);
  const next = prompt("Group note", group?.note || "");
  if (next === null) {
    return;
  }
  await patchGroup(groupId, (draftGroup) => {
    draftGroup.note = next.trim();
  });
}

async function addLinkToGroup(groupId) {
  const rawUrl = prompt("Link URL");
  const url = coerceUrl(rawUrl);
  if (!url) {
    if (rawUrl !== null) {
      toast("Enter a valid URL", true);
    }
    return;
  }
  const title = prompt("Link title", url);
  if (title === null) {
    return;
  }
  const record = createTabRecord({ title: title.trim() || url, url });
  await patchGroup(groupId, (group) => {
    group.tabs.unshift(record);
  });
}

async function addNoteToGroup(groupId) {
  const text = prompt("Note text");
  if (!text) {
    return;
  }
  const record = createNoteRecord(text.trim());
  await patchGroup(groupId, (group) => {
    group.tabs.unshift(record);
  });
}

async function editTabNote(ref) {
  const found = findTabRef(state, ref);
  const isTextItem = found?.tab?.itemType === ITEM_NOTE;
  const next = prompt(isTextItem ? "Item text" : "Tab note", found?.tab.note || "");
  if (next === null) {
    return;
  }
  await patchTab(ref, (tab) => {
    tab.note = next.trim();
    if (isTextItem) {
      tab.title = next.trim().split(/\s+/).slice(0, 8).join(" ") || itemTypeLabel(tab.itemType);
    }
  });
}

async function patchGroup(groupId, patcher) {
  await updateState((draft) => {
    const group = draft.groups.find((item) => item.id === groupId);
    if (group) {
      patcher(group);
      group.updatedAt = nowIso();
    }
    return draft;
  });
}

async function patchTab(ref, patcher) {
  await updateState((draft) => {
    const found = findTabRef(draft, ref);
    if (found) {
      patcher(found.tab);
      found.tab.updatedAt = nowIso();
    }
    return draft;
  });
}

async function createNewWorkspace() {
  const name = prompt("Workspace name");
  if (!name) {
    return;
  }
  const workspace = createWorkspace(name.trim());
  await updateState((draft) => {
    draft.workspaces.push(workspace);
    draft.activeWorkspaceId = workspace.id;
    return draft;
  });
  activeWorkspaceId = workspace.id;
  activeFilter = CATEGORY_INBOX;
  localStorage.setItem("ziptab.activeWorkspaceId", activeWorkspaceId);
  localStorage.setItem("ziptab.activeFilter", activeFilter);
}

async function renameWorkspace() {
  const workspace = currentWorkspace();
  const name = prompt("Workspace name", workspace.name);
  if (!name) {
    return;
  }
  await updateState((draft) => {
    const target = draft.workspaces.find((item) => item.id === workspace.id);
    if (target) {
      target.name = name.trim();
      target.updatedAt = nowIso();
    }
    return draft;
  });
}

async function createNewFolder() {
  const name = prompt("Category name");
  if (!name) {
    return;
  }
  await updateState((draft) => {
    draft.folders.push(createFolder(name.trim(), "slate", activeWorkspaceId));
    return draft;
  });
}

async function renameFolder(folderId) {
  const folder = state.folders.find((item) => item.id === folderId);
  if (!folder) {
    return;
  }
  const name = prompt("Category name", folder.name);
  if (!name) {
    return;
  }
  await updateState((draft) => {
    const target = draft.folders.find((item) => item.id === folderId);
    if (target) {
      target.name = name.trim();
      target.updatedAt = nowIso();
    }
    return draft;
  });
}

async function deleteFolder(folderId) {
  const folder = state.folders.find((item) => item.id === folderId);
  if (!folder) {
    return;
  }
  if (state.settings.confirmDestructive && !confirm(`Delete category "${folder.name}"?`)) {
    return;
  }
  await updateState((draft) => {
    draft.folders = draft.folders.filter((item) => item.id !== folderId);
    for (const group of draft.groups) {
      if (group.folderId === folderId) {
        group.folderId = null;
      }
    }
    return draft;
  });
  if (activeFilter === `folder:${folderId}`) {
    activeFilter = CATEGORY_INBOX;
    localStorage.setItem("ziptab.activeFilter", activeFilter);
  }
}

function startSessionSelection(source, groupId, tabId) {
  if (!groupId || !tabId) {
    return;
  }
  if (selectionGroupId !== groupId) {
    selected.clear();
  }
  selectionGroupId = groupId;
  selected.add(keyFor(source, groupId, tabId));
  renderGroups();
}

function closeSessionSelection() {
  selected.clear();
  selectionGroupId = "";
}

function toggleSelection(source, groupId, tabId) {
  if (selectionGroupId !== groupId) {
    startSessionSelection(source, groupId, tabId);
    return;
  }
  const key = keyFor(source, groupId, tabId);
  if (selected.has(key)) {
    selected.delete(key);
  } else {
    selected.add(key);
  }
  renderGroups();
}

function toggleGroupPreview(groupId) {
  if (!groupId) {
    return;
  }
  if (expandedGroupIds.has(groupId)) {
    expandedGroupIds.delete(groupId);
  } else {
    expandedGroupIds.add(groupId);
  }
  renderGroups();
}

async function restoreSelected() {
  const refs = selectedRefs();
  if (!refs.length) {
    return;
  }
  const result = await sendRuntime({ type: "restore-refs", refs });
  closeSessionSelection();
  toast(formatRestoreFeedback({ restored: result.restoredTabs || 0 }));
}

async function copySelected() {
  const tabs = selectedRefs()
    .map((ref) => findTabRef(state, ref)?.tab)
    .filter(Boolean);
  if (!tabs.length) {
    return;
  }
  await copyText(tabs.map(tabClipboardText).filter(Boolean).join("\n"));
  toast("Copied");
}

async function deleteSelected() {
  const refs = selectedRefs();
  if (!refs.length) {
    return;
  }
  if (state.settings.confirmDestructive && !confirm(`Delete ${refs.length} saved tabs?`)) {
    return;
  }
  await updateState((draft) => {
    for (const ref of refs) {
      const found = findTabRef(draft, ref);
      removeTabFromDraft(draft, ref);
      if (found?.tab) {
        pushBinEntry(
          draft,
          createBinEntry("tab", found.tab, {
            groupId: ref.groupId,
            groupTitle: found.group?.title || "",
            label: found.tab.title,
            source: ref.source
          })
        );
      }
    }
    return draft;
  });
  closeSessionSelection();
}

async function captureSelectedOpenTabs() {
  const tabIds = selectedOpenTabRecords().map((tab) => Number(tab.id)).filter(Number.isFinite);
  if (!tabIds.length) {
    toast("Select tabs first", true);
    return;
  }
  const result = await sendRuntime({
    type: "capture",
    mode: "tab-ids",
    tabIds,
    workspaceId: activeWorkspaceId,
    openAfter: false
  });
  selectedOpenTabIds.clear();
  openTabsSelectMode = false;
  toast(formatSaveFeedback(result.storedTabs || 0));
}

async function moveTabToNewGroup(ref, categoryFilter = activeFilter, position = null) {
  await updateState((draft) => {
    const tab = removeTabFromDraft(draft, ref);
    if (tab) {
      insertGroupAtCategoryPosition(
        draft,
        createGroupFromTabRecords([tab], {
          workspaceId: activeWorkspaceId
        }),
        categoryFilter,
        position
      );
    }
    return draft;
  });
  if (selectionGroupId === ref.groupId) {
    closeSessionSelection();
  }
}

async function moveTabsToNewGroup(refs, categoryFilter = activeFilter, position = null) {
  const normalizedRefs = (refs || []).filter((ref) => ref?.source === "group" && ref.groupId && ref.tabId);
  if (!normalizedRefs.length) {
    return;
  }
  await updateState((draft) => {
    const tabs = takeTabsFromDraft(draft, normalizedRefs);
    if (tabs.length) {
      insertGroupAtCategoryPosition(
        draft,
        createGroupFromTabRecords(tabs, {
          workspaceId: activeWorkspaceId
        }),
        categoryFilter,
        position
      );
    }
    return draft;
  });
  closeSessionSelection();
}

async function moveTabToGroup(ref, targetGroupId, targetTabId = "", placement = "before") {
  if (!targetGroupId) {
    return;
  }
  if (ref.source === "group" && ref.groupId === targetGroupId && ref.tabId === targetTabId) {
    return;
  }
  await updateState((draft) => {
    const tab = removeTabFromDraft(draft, ref);
    const target = draft.groups.find((group) => group.id === targetGroupId);
    if (tab && target) {
      const index = targetTabId ? target.tabs.findIndex((item) => item.id === targetTabId) : -1;
      if (index >= 0) {
        target.tabs.splice(placement === "after" ? index + 1 : index, 0, tab);
      } else {
        target.tabs.push(tab);
      }
    }
    return draft;
  });
}

async function moveTabsToGroup(refs, targetGroupId, targetTabId = "", placement = "before") {
  const normalizedRefs = (refs || []).filter((ref) => ref?.source === "group" && ref.groupId && ref.tabId);
  if (!targetGroupId || !normalizedRefs.length) {
    return;
  }
  await updateState((draft) => {
    const tabs = takeTabsFromDraft(draft, normalizedRefs);
    const target = draft.groups.find((group) => group.id === targetGroupId);
    if (tabs.length && target) {
      const index = targetTabId ? target.tabs.findIndex((item) => item.id === targetTabId) : -1;
      if (index >= 0) {
        target.tabs.splice(placement === "after" ? index + 1 : index, 0, ...tabs);
      } else {
        target.tabs.push(...tabs);
      }
      target.updatedAt = nowIso();
    }
    return draft;
  });
  closeSessionSelection();
}

function takeTabsFromDraft(draft, refs) {
  const tabs = [];
  const refsByGroup = new Map();
  for (const ref of refs) {
    if (!refsByGroup.has(ref.groupId)) {
      refsByGroup.set(ref.groupId, new Set());
    }
    refsByGroup.get(ref.groupId).add(ref.tabId);
  }
  for (const [groupId, tabIds] of refsByGroup.entries()) {
    const group = draft.groups.find((item) => item.id === groupId);
    for (const tab of [...(group?.tabs || [])]) {
      if (tabIds.has(tab.id)) {
        const moved = removeTabFromDraft(draft, { source: "group", groupId, tabId: tab.id });
        if (moved) {
          tabs.push(moved);
        }
      }
    }
  }
  return tabs;
}

async function addOpenTabsToNewGroup(tabIds, categoryFilter = activeFilter, position = null) {
  const tabs = [...new Set(tabIds || [])]
    .map((tabId) => findOpenTabById(tabId))
    .filter((tab) => tab?.storable);
  if (!tabs.length) {
    return;
  }
  await updateState((draft) => {
    insertGroupAtCategoryPosition(
      draft,
      createGroupFromTabRecords(tabs.map((tab) => createTabRecord(tab, { browserGroup: tab.browserGroup })), {
        workspaceId: activeWorkspaceId
      }),
      categoryFilter,
      position
    );
    return draft;
  });
  selectedOpenTabIds.clear();
  openTabsSelectMode = false;
  renderOpenTabsToolbar();
  renderActiveTabs();
  toast(`Created session with ${tabs.length} tab${tabs.length === 1 ? "" : "s"}`);
}

async function addOpenTabsToGroup(tabIds, targetGroupId, targetTabId = "", placement = "before") {
  const tabs = [...new Set(tabIds || [])]
    .map((tabId) => findOpenTabById(tabId))
    .filter((tab) => tab?.storable);
  if (!tabs.length || !targetGroupId) {
    return;
  }
  await updateState((draft) => {
    const target = draft.groups.find((group) => group.id === targetGroupId);
    if (!target) {
      return draft;
    }
    const records = tabs.map((tab) => createTabRecord(tab, { browserGroup: tab.browserGroup }));
    const index = targetTabId ? target.tabs.findIndex((item) => item.id === targetTabId) : -1;
    if (index >= 0) {
      target.tabs.splice(placement === "after" ? index + 1 : index, 0, ...records);
    } else {
      target.tabs.push(...records);
    }
    target.updatedAt = nowIso();
    return draft;
  });
  selectedOpenTabIds.clear();
  openTabsSelectMode = false;
  renderOpenTabsToolbar();
  renderActiveTabs();
  toast(`Added ${tabs.length} tab${tabs.length === 1 ? "" : "s"} to session`);
}

async function moveCategory(sourceCategoryId, targetCategoryId, placement = "before") {
  if (!sourceCategoryId || !targetCategoryId) {
    return;
  }
  const categoryIds = orderedCategoryItems().map((category) => category.id);
  if (!categoryIds.includes(sourceCategoryId) || !categoryIds.includes(targetCategoryId)) {
    return;
  }
  const nextOrder = categoryIds.filter((id) => id !== sourceCategoryId);
  const targetIndex = nextOrder.indexOf(targetCategoryId);
  if (targetIndex < 0) {
    return;
  }
  nextOrder.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, sourceCategoryId);
  if (nextOrder.join("|") === categoryIds.join("|")) {
    return;
  }
  const nextState = await updateState((draft) => {
    draft.categoryOrderByWorkspace = draft.categoryOrderByWorkspace || {};
    draft.categoryOrderByWorkspace[activeWorkspaceId] = nextOrder;
    return draft;
  });
  state = normalizeState(nextState);
  renderFolders();
  renderGroups();
  requestAnimationFrame(() => scrollToCategory(sourceCategoryId));
}

async function moveGroupBefore(sourceGroupId, targetGroupId) {
  if (!sourceGroupId || !targetGroupId || sourceGroupId === targetGroupId) {
    return;
  }
  await updateState((draft) => {
    const sourceIndex = draft.groups.findIndex((group) => group.id === sourceGroupId);
    const targetIndex = draft.groups.findIndex((group) => group.id === targetGroupId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return draft;
    }
    const target = draft.groups[targetIndex];
    const [source] = draft.groups.splice(sourceIndex, 1);
    source.starred = Boolean(target.starred);
    source.folderId = target.starred ? null : target.folderId || null;
    source.workspaceId = target.workspaceId || activeWorkspaceId;
    const nextTargetIndex = draft.groups.findIndex((group) => group.id === targetGroupId);
    draft.groups.splice(nextTargetIndex, 0, source);
    return draft;
  });
}

async function moveGroupToCategory(groupId, categoryFilter, position = null) {
  await updateState((draft) => {
    const group = draft.groups.find((item) => item.id === groupId);
    if (group) {
      if (position?.targetGroupId === groupId) {
        return draft;
      }
      insertGroupAtCategoryPosition(draft, group, categoryFilter, position);
      group.updatedAt = nowIso();
    }
    return draft;
  });
}

function insertGroupAtCategoryPosition(draft, group, categoryFilter, position = null) {
  const existingIndex = draft.groups.findIndex((item) => item.id === group.id);
  if (existingIndex >= 0) {
    draft.groups.splice(existingIndex, 1);
  }
  assignGroupCategory(group, categoryFilter, draft.folders);
  const insertIndex = categoryPositionInsertIndex(
    draft.groups,
    groupCategoryFilter(group),
    group.workspaceId,
    position
  );
  draft.groups.splice(insertIndex, 0, group);
  return group;
}

function categoryPositionInsertIndex(groups, categoryFilter, workspaceId = activeWorkspaceId, position = null) {
  if (position?.targetGroupId) {
    const targetIndex = groups.findIndex((group) => group.id === position.targetGroupId);
    if (targetIndex >= 0) {
      return position.placement === "after" ? targetIndex + 1 : targetIndex;
    }
  }
  const filter = normalizeCategoryFilter(categoryFilter);
  let lastCategoryIndex = -1;
  let lastWorkspaceIndex = -1;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const groupWorkspaceId = group.workspaceId || DEFAULT_WORKSPACE_ID;
    if (groupWorkspaceId === workspaceId) {
      lastWorkspaceIndex = index;
      if (groupCategoryFilter(group) === filter) {
        lastCategoryIndex = index;
      }
    }
  }
  if (lastCategoryIndex >= 0) {
    return lastCategoryIndex + 1;
  }
  return lastWorkspaceIndex >= 0 ? lastWorkspaceIndex + 1 : groups.length;
}

async function toggleAllCollapsed() {
  const groups = workspaceGroups();
  await setGroupsCollapsed(
    groups.map((group) => group.id),
    !groups.every((group) => group.collapsed)
  );
}

async function toggleCategoryCollapsed(categoryFilter) {
  const groups = groupsForCategory({ filter: normalizeCategoryFilter(categoryFilter) }, workspaceGroups());
  await setGroupsCollapsed(
    groups.map((group) => group.id),
    !groups.every((group) => group.collapsed)
  );
}

async function setGroupsCollapsed(groupIds, collapsed) {
  const ids = new Set(groupIds);
  if (!ids.size) {
    return;
  }
  await updateState((draft) => {
    for (const group of draft.groups) {
      if (group.workspaceId !== activeWorkspaceId || !ids.has(group.id)) {
        continue;
      }
      group.collapsed = collapsed;
    }
    return draft;
  });
}

async function restoreBinItem(binId) {
  const entry = state.bin.find((item) => item.id === binId);
  if (!entry) {
    return;
  }
  await updateState((draft) => {
    const index = draft.bin.findIndex((item) => item.id === binId);
    if (index < 0) {
      return draft;
    }
    const [removed] = draft.bin.splice(index, 1);
    if (removed.kind === "group") {
      draft.groups.unshift(removed.item);
      draft.activeWorkspaceId = removed.item.workspaceId || activeWorkspaceId;
    } else {
      const existingGroup = removed.groupId
        ? draft.groups.find((group) => group.id === removed.groupId)
        : null;
      if (existingGroup) {
        existingGroup.tabs.unshift(removed.item);
      } else {
        draft.groups.unshift(
          createGroupFromTabRecords([removed.item], {
            title: removed.groupTitle || "Restored items",
            workspaceId: activeWorkspaceId
          })
        );
      }
    }
    return draft;
  });
  els.modal.close();
  toast("Restored from bin");
}

async function discardBinItem(binId) {
  if (state.settings.confirmDestructive && !confirm("Permanently remove this bin item?")) {
    return;
  }
  const nextState = await updateState((draft) => {
    draft.bin = draft.bin.filter((item) => item.id !== binId);
    return draft;
  });
  state = normalizeState(nextState);
  render();
  openBinModal();
}

async function clearBin() {
  if (!state.bin.length) {
    return;
  }
  if (state.settings.confirmDestructive && !confirm(`Permanently clear ${state.bin.length} bin items?`)) {
    return;
  }
  await updateState((draft) => {
    draft.bin = [];
    return draft;
  });
  els.modal.close();
  toast("Bin cleared");
}

function pushBinEntry(draft, entry) {
  if (!entry) {
    return;
  }
  draft.bin = compactBin([entry, ...(draft.bin || [])]);
}

function findTabRef(targetState, ref) {
  const group = targetState.groups.find((item) => item.id === ref.groupId);
  const tab = group?.tabs.find((item) => item.id === ref.tabId);
  return group && tab ? { source: "group", group, tab } : null;
}

function removeTabFromDraft(draft, ref) {
  const group = draft.groups.find((item) => item.id === ref.groupId);
  const index = group?.tabs.findIndex((tab) => tab.id === ref.tabId) ?? -1;
  if (!group || index < 0) {
    return null;
  }
  const [tab] = group.tabs.splice(index, 1);
  draft.groups = draft.groups.filter((item) => item.tabs.length || item.locked || item.note);
  return tab;
}

function selectedRefs() {
  return selectionGroupId ? selectedRefsForGroup(selectionGroupId) : [];
}

function selectedRefsForGroup(groupId) {
  return [...selected]
    .map(parseKey)
    .filter((ref) => ref && ref.source === "group" && ref.groupId === groupId);
}

function clearMissingSelections() {
  if (selectionGroupId && !state.groups.some((group) => group.id === selectionGroupId)) {
    closeSessionSelection();
    return;
  }
  for (const key of [...selected]) {
    if (!findTabRef(state, parseKey(key))) {
      selected.delete(key);
    }
  }
}

function keyFor(source, groupId, tabId) {
  return `${source}:${groupId || ""}:${tabId}`;
}

function parseKey(key) {
  const [source, groupId, tabId] = key.split(":");
  return tabId ? { source, groupId, tabId } : null;
}

function openSearchModal() {
  const input = h("input", {
    type: "search",
    class: "modal-search",
    placeholder: "Search links and notes",
    value: searchQuery
  });
  const results = h("div", { class: "search-results" });
  const renderResults = () => {
    const hits = searchHits(input.value).slice(0, 40);
    results.replaceChildren();
    if (!hits.length) {
      results.append(h("div", { class: "empty-row" }, "No matches"));
      return;
    }
    for (const hit of hits) {
      const tab = hit.tab;
      const canOpen = isRestorableTab(tab);
      results.append(
        h(
          "div",
          { class: `search-result item-${tab.itemType || ITEM_LINK}` },
          h(
            "div",
            { class: "search-result-main" },
            h("strong", {}, tab.title),
            h("span", {}, canOpen ? tab.url : tab.note || itemTypeLabel(tab.itemType)),
            h("small", {}, hit.groupTitle)
          ),
          h(
            "div",
            { class: "search-result-actions" },
            canOpen
              ? iconOnlyButton("external-link", "Open tab", {
                  "data-action": "restore-tab",
                  "data-source": hit.source,
                  "data-group-id": hit.groupId,
                  "data-tab-id": tab.id
                })
              : "",
            iconOnlyButton("eye", "Reveal in sessions", {
              "data-action": "reveal-tab",
              "data-source": hit.source,
              "data-group-id": hit.groupId,
              "data-tab-id": tab.id
            })
          )
        )
      );
    }
  };

  input.addEventListener("input", renderResults);
  openModal("Search", [input, results], []);
  renderResults();
  requestAnimationFrame(() => input.focus());
}

function searchHits(query) {
  const normalized = String(query || "").trim().toLowerCase();
  const hits = [];
  for (const group of workspaceGroups()) {
    const groupMatches = normalized && group.title.toLowerCase().includes(normalized);
    for (const tab of group.tabs) {
      if (!normalized || groupMatches || tabMatchesQuery(tab, normalized)) {
        hits.push({ source: "group", groupId: group.id, groupTitle: group.title, tab });
      }
    }
  }
  return hits;
}

function openBinModal() {
  const list = h("div", { class: "bin-list" });
  if (!state.bin.length) {
    list.append(h("div", { class: "empty-row" }, "Bin is empty"));
  }
  for (const entry of state.bin) {
    const label =
      entry.kind === "group"
        ? `${entry.item.tabs.length} items`
        : itemTypeLabel(entry.item.itemType);
    list.append(
      h(
        "div",
        { class: "bin-row" },
        h(
          "div",
          { class: "bin-main" },
          h("strong", {}, entry.label),
          h("span", {}, `${entry.kind} - ${label}`),
          h("small", {}, new Date(entry.deletedAt).toLocaleString())
        ),
        h(
          "div",
          { class: "bin-actions" },
          iconOnlyButton("archive-restore", "Restore item", {
            "data-action": "restore-bin-item",
            "data-bin-id": entry.id
          }),
          iconOnlyButton("trash-2", "Discard item", {
            class: "danger",
            "data-action": "discard-bin-item",
            "data-bin-id": entry.id
          })
        )
      )
    );
  }
  openModal(
    "Bin",
    [list],
    state.bin.length ? [iconTextButton("trash-2", "Clear bin", { class: "danger", "data-action": "clear-bin" })] : []
  );
}

function revealTab(ref) {
  const found = findTabRef(state, ref);
  if (!found) {
    return;
  }
  if (found.group?.workspaceId) {
    activeWorkspaceId = found.group.workspaceId;
    localStorage.setItem("ziptab.activeWorkspaceId", activeWorkspaceId);
    activeFilter = groupCategoryFilter(found.group);
    localStorage.setItem("ziptab.activeFilter", activeFilter);
  }
  if (els.modal.open) {
    els.modal.close();
  }
  render();
  requestAnimationFrame(() => {
    document
      .querySelector(`[data-tab-id="${CSS.escape(ref.tabId)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

function tabClipboardText(tab) {
  if (!tab) {
    return "";
  }
  if (isRestorableTab(tab)) {
    return tab.url;
  }
  return tab.note || tab.title;
}

function openExportModal(groups) {
  const normalizedGroups = groups.length ? groups : state.groups;
  const text = groupsToText(normalizedGroups);
  const json = JSON.stringify({ exportedAt: nowIso(), groups: normalizedGroups }, null, 2);
  openModal("Export", [
    h("textarea", { rows: "14", readonly: "true" }, text),
    h("p", { class: "muted" }, `${normalizedGroups.length} groups`)
  ], [
    iconTextButton("copy", "Copy text", { "data-modal-action": "copy-text" }),
    iconTextButton("download", "Download text", { "data-modal-action": "download-text" }),
    iconTextButton("download", "Download JSON", { "data-modal-action": "download-json" })
  ]);

  els.modalActions.querySelector("[data-modal-action='copy-text']").addEventListener("click", () => copyText(text));
  els.modalActions.querySelector("[data-modal-action='download-text']").addEventListener("click", () => {
    downloadFile("ziptab-export.txt", text, "text/plain");
  });
  els.modalActions.querySelector("[data-modal-action='download-json']").addEventListener("click", () => {
    downloadFile("ziptab-export.json", json, "application/json");
  });
}

function openImportModal() {
  const textarea = h("textarea", {
    rows: "14",
    placeholder: "Paste ZipTab, OneTab, or URL list export text here."
  });
  const help = h(
    "p",
    { class: "muted" },
    "Supports ZipTab exports, OneTab export text, and simple URL lists."
  );
  openModal("Import", [help, textarea], [iconTextButton("download", "Import", { class: "primary" })]);
  els.modalActions.querySelector("button").addEventListener("click", async () => {
    const groups = parseImportPayload(textarea.value);
    if (!groups.length) {
      toast("No valid tabs found", true);
      return;
    }
    await updateState((draft) => {
      draft.groups.unshift(...groups.map((group) => ({ ...group, workspaceId: activeWorkspaceId })));
      return draft;
    });
    els.modal.close();
    toast(`Imported ${groups.reduce((total, group) => total + group.tabs.length, 0)} tabs`);
  });
}

function parseImportPayload(value) {
  const text = String(value || "").trim();
  if (!text) {
    return [];
  }
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.groups)) {
      return normalizeState({ groups: parsed.groups }).groups;
    }
    if (Array.isArray(parsed)) {
      return normalizeState({ groups: parsed }).groups;
    }
  } catch {
    // Fall back to line based import.
  }
  return parseOneTabText(text);
}

function openModal(title, bodyNodes, actionNodes) {
  els.modalTitle.textContent = title;
  els.modalBody.replaceChildren(...bodyNodes);
  els.modalActions.replaceChildren(...actionNodes, iconTextButton("x", "Close", { type: "submit" }));
  els.modal.showModal();
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

function downloadFile(filename, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = h("a", { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function applyTheme() {
  document.documentElement.dataset.theme =
    state.settings.theme === "system" ? "" : state.settings.theme;
}

function toast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle("error", isError);
  els.toast.classList.add("visible");
  setTimeout(() => els.toast.classList.remove("visible"), 2200);
}

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) {
      continue;
    }
    if (key === "class") {
      node.className = value;
    } else if (key === "dataset") {
      Object.assign(node.dataset, value);
    } else if (key === "selected") {
      node.selected = Boolean(value);
    } else if (key === "readonly") {
      node.readOnly = Boolean(value);
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
