import { installManagerInfoPopover } from "./manager-overlays.js";
import {
  captureOpenTabsSelectionSnapshot,
  createCaptureReconciliationError,
  getCaptureOutcome,
  getOpenWindowSelection,
  isSameOpenTabsSelectionSnapshot,
  startManager
} from "./manager-startup.js";
import {
  DEFAULT_WORKSPACE_ID,
  ITEM_LINK,
  ITEM_NOTE,
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
  moveGroupTabs,
  normalizeState,
  nowIso,
  parseOneTabText,
  tabMatchesQuery,
  tabsToText,
  validateFolderName
} from "./model.js";
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
  getOpenTabStatusMessage,
  getVisibleGroupTabs,
  shouldRestoreKeyboardFocus,
  shouldRestoreOpenTabContextFocus,
  shouldRestoreOpenTabSelectionFocus,
  shouldRestoreSavedTabSelectionFocus,
  isContextMenuKey,
  isPointInMiddleHalfWithMargin,
  isRenameActivationKey,
  isStorableOpenTab,
  getSessionDropZone,
  sortOpenTabs,
  shouldRefreshOpenTabsForChange,
  buildOrderedCategoryIds,
  reorderCategoryIds,
  removeCategoryIdFromOrder
} from "./manager-view.js";
import { formatCaptureFeedback, formatRestoreFeedback, hasCaptureFeedback } from "./feedback-copy.js";
import { createIcon, hydrateIconButtons, iconOnlyButton, iconSummary, iconTextButton } from "./icons.js";
import { getState, updateState } from "./store.js";

const els = {
  activeTabsPanel: document.querySelector("#activeTabsPanel"),
  appShell: document.querySelector(".app-shell"),
  folderList: document.querySelector("#folderList"),
  groupsList: document.querySelector("#groupsList"),
  headerActions: document.querySelector("#headerActions"),
  managerTopbar: document.querySelector(".manager-topbar"),
  modal: document.querySelector("#modal"),
  modalActions: document.querySelector("#modalActions"),
  modalBody: document.querySelector("#modalBody"),
  modalTitle: document.querySelector("#modalTitle"),
  openTabsFilterInput: document.querySelector("#openTabsFilterInput"),
  openTabsToolbar: document.querySelector("#openTabsToolbar"),
  searchField: document.querySelector("#searchField"),
  searchInput: document.querySelector("#searchInput"),
  searchToggle: document.querySelector("#searchToggle"),
  windowActions: document.querySelector("#windowActions"),
  windowSelect: document.querySelector("#windowSelect"),
  sidebarContent: document.querySelector("#sidebarContent"),
  sidebarRail: document.querySelector("#sidebarRail"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  toast: document.querySelector("#toast"),
  workspaceMenu: document.querySelector("#workspaceMenu")
};

const CATEGORY_INBOX = "inbox";
const CATEGORY_STARRED = "starred";
const GROUP_TARGET_LOCK_RELEASE_MARGIN_PX = 24;
const OPEN_TABS_REFRESH_DELAY_MS = 120;
const SIDEBAR_COLLAPSED_STORAGE_KEY = "ziptab.sidebarCollapsed";

let state = normalizeState();
let stateRevision = 0;
let managerInfoPopover = null;
let activeFilter = normalizeCategoryFilter(localStorage.getItem("ziptab.activeFilter") || CATEGORY_INBOX);
let activeWorkspaceId = localStorage.getItem("ziptab.activeWorkspaceId") || state.activeWorkspaceId || DEFAULT_WORKSPACE_ID;
let isSidebarCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
const pageParams = new URLSearchParams(location.search);
let searchQuery = pageParams.get("q") || "";
let isSearchExpanded = Boolean(searchQuery);
const initialTargetGroupId = pageParams.get("targetGroupId") || "";
const initialCaptureFeedback = {
  storedTabs: Number(pageParams.get("saved") || 0),
  cleanedDuplicates: Number(pageParams.get("duplicates") || 0)
};
let openWindows = [];
let openTabsLoading = false;
let isSelectedCapturePending = false;
let openTabsRefreshTimer = 0;
let openTabsRefreshQueued = false;
const selected = new Set();
const selectedOpenTabIds = new Set();
let selectionGroupId = "";
let openTabFilter = null;
let openTabsQuery = "";
let openTabsSelectMode = false;
let selectedOpenWindowId = null;
let openTabContextMenuTriggerId = "";
let openTabContextMenuOpenedByKeyboard = false;
let pendingOpenTabContextFocus = null;
let savedTabContextMenuTrigger = null;
let savedTabContextMenuRef = null;
let savedTabContextMenuFocusSelector = "";
let activeDragKind = "";
let activeDragPayload = null;
let groupInsertMarker = null;
let groupDragSourceRect = null;
let groupDragSourceCategoryFilter = "";
let groupDragSourceId = "";
let groupDragTargetRect = null;
let groupDragTargetId = "";
let focusedGroupId = "";

void startManager({
  initialState: state,
  prepareShell() {
    ensureActiveWorkspace();
    els.searchInput.value = searchQuery;
    applyTheme();
    hydrateIconButtons();
    renderSearchControl();
    bindEvents();
  },
  render(nextState) {
    if (nextState) {
      state = normalizeState(nextState);
    }
    ensureActiveWorkspace();
    render();
  },
  loadOpenTabs,
  loadState: getState,
  applyState(loadedState) {
    state = normalizeState(loadedState);
    ensureActiveWorkspace();
    applyTheme();
  },
  migrate: migrateLegacyQuickList,
  getStateRevision: () => stateRevision,
  initializePopover() {
    managerInfoPopover = installManagerInfoPopover({ renderContent: renderManagerInfoPopoverContent });
  },
  onLoaded: handleInitialTargetFeedback,
  onStartupError: handleStartupError
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.ziptabState) {
    stateRevision += 1;
    const savedTabFocusIntent = getSavedTabFocusIntent(document.activeElement) || getSavedTabContextFocusIntent();
    state = normalizeState(changes.ziptabState.newValue);
    ensureActiveWorkspace();
    clearMissingSelections();
    applyTheme();
    render();
    restoreSavedTabFocusIntent(savedTabFocusIntent);
  }
});

function bindEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("click", handleMenuDismiss);
  document.addEventListener("change", handleChange);
  document.addEventListener("wa-select", handleWebAwesomeSelect);
  document.addEventListener("contextmenu", handleContextMenu);
  document.addEventListener("dblclick", handleDoubleClick);
  document.addEventListener("dragstart", handleDragStart);
  document.addEventListener("dragover", handleDragOver);
  document.addEventListener("dragleave", handleDragLeave);
  document.addEventListener("drop", handleDrop);
  document.addEventListener("dragend", handleDragEnd);
  document.addEventListener("keydown", handleKeyboard);
  document.addEventListener("toggle", handleActionMenuToggle, true);
  window.addEventListener("resize", closeFloatingMenus);
  window.addEventListener("scroll", closeFloatingMenus, true);
  bindOpenTabsRefreshEvents();
  els.searchInput.addEventListener("input", () => {
    searchQuery = els.searchInput.value.trim();
    render();
  });
  els.openTabsFilterInput?.addEventListener("input", () => {
    openTabsQuery = els.openTabsFilterInput.value.trim();
    renderActiveTabs();
  });
}

function bindOpenTabsRefreshEvents() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleOpenTabsRefresh();
    }
  });
  window.addEventListener("focus", scheduleOpenTabsRefresh);
  chrome.tabs?.onActivated?.addListener?.(scheduleOpenTabsRefresh);
  chrome.tabs?.onCreated?.addListener?.(scheduleOpenTabsRefresh);
  chrome.tabs?.onRemoved?.addListener?.(scheduleOpenTabsRefresh);
  chrome.tabs?.onMoved?.addListener?.(scheduleOpenTabsRefresh);
  chrome.tabs?.onAttached?.addListener?.(scheduleOpenTabsRefresh);
  chrome.tabs?.onDetached?.addListener?.(scheduleOpenTabsRefresh);
  chrome.tabs?.onUpdated?.addListener?.((tabId, changeInfo) => {
    if (shouldRefreshOpenTabsForChange(changeInfo)) {
      scheduleOpenTabsRefresh();
    }
  });
  chrome.windows?.onFocusChanged?.addListener?.(scheduleOpenTabsRefresh);
}

function handleActionMenuToggle(event) {
  const menu = event.target;
  if (!(menu instanceof HTMLDetailsElement) || !menu.classList.contains("action-menu")) {
    return;
  }
  if (!menu.open) {
    resetActionMenuPanel(menu);
    return;
  }
  closeActionMenus(menu);
  const panel = menu.querySelector(".action-menu-panel");
  if (panel) {
    panel.style.visibility = "hidden";
  }
  requestAnimationFrame(() => positionActionMenu(menu));
}

function positionActionMenu(menu) {
  const summary = menu.querySelector("summary");
  const panel = menu.querySelector(".action-menu-panel");
  if (!summary || !panel || !menu.open) {
    return;
  }
  panel.style.visibility = "hidden";
  const anchorRect = summary.getBoundingClientRect();
  const menuRect = panel.getBoundingClientRect();
  const position = getFloatingMenuPosition(anchorRect, menuRect, {
    width: window.innerWidth,
    height: window.innerHeight
  });
  panel.style.top = `${position.top}px`;
  panel.style.left = `${position.left}px`;
  panel.style.right = "auto";
  panel.style.visibility = "visible";
}

function resetActionMenuPanel(menu) {
  const panel = menu.querySelector(".action-menu-panel");
  if (!panel) {
    return;
  }
  panel.style.removeProperty("top");
  panel.style.removeProperty("left");
  panel.style.removeProperty("right");
  panel.style.removeProperty("visibility");
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
  const isInfoPopoverAction = Boolean(button.closest(".manager-info-popover"));
  const infoPopoverFocusIntent = isInfoPopoverAction
    ? {
        action,
        openTabId: button.dataset.openTabId || "",
        source,
        groupId,
        tabId
      }
    : null;

  try {
    if (isInfoPopoverAction) {
      await managerInfoPopover?.hide();
    }
    if (action === "capture-current-window") {
      const result = await sendRuntime({ type: "capture", mode: "current-window", workspaceId: activeWorkspaceId });
      toast(formatCaptureFeedback(result));
      await loadOpenTabs();
    } else if (action === "capture-all-windows") {
      const result = await sendRuntime({ type: "capture", mode: "all-windows", workspaceId: activeWorkspaceId });
      toast(formatCaptureFeedback(result));
      await loadOpenTabs();
    } else if (action === "capture-open-window") {
      const result = await sendRuntime({
        type: "capture",
        mode: "window-id",
        windowId: Number(button.dataset.windowId),
        workspaceId: activeWorkspaceId
      });
      toast(formatCaptureFeedback(result));
      await loadOpenTabs();
    } else if (action === "capture-selected-open-tabs") {
      let captureError = null;
      try {
        await captureSelectedOpenTabs();
      } catch (error) {
        captureError = error;
      }
      try {
        await loadOpenTabs();
      } catch (refreshError) {
        if (!captureError) {
          throw refreshError;
        }
        throw new AggregateError([captureError, refreshError], captureError?.message || String(captureError));
      }
      if (captureError) {
        throw captureError;
      }
    } else if (action === "close-open-tab") {
      const closedTabId = Number(button.dataset.openTabId);
      await sendRuntime({ type: "close-open-tab", tabId: closedTabId });
      toast("Closed tab");
      await loadOpenTabs();
    } else if (action === "dedupe-open-window") {
      const result = await sendRuntime({ type: "dedupe-window", windowId: Number(button.dataset.windowId) });
      toast(`Removed ${result.removedTabs || 0} duplicate tab${result.removedTabs === 1 ? "" : "s"}`);
      await loadOpenTabs();
    } else if (action === "create-open-window") {
      const result = await sendRuntime({ type: "create-window" });
      clearOpenTabsSelection();
      selectedOpenWindowId = Number(result.windowId) || null;
      await loadOpenTabs();
    } else if (action === "toggle-open-tabs-select-mode") {
      toggleOpenTabsSelectMode({ restoreFocus: shouldRestoreKeyboardFocus(event) });
    } else if (action === "toggle-open-tab") {
      const tabId = button.dataset.openTabId || "";
      const restoreFocus = shouldRestoreOpenTabSelectionFocus({
        isUserAction: document.activeElement === button && event.isTrusted !== false,
        focusedTabId: document.activeElement?.dataset.openTabId,
        targetTabId: tabId
      });
      toggleOpenTabSelection(tabId, { restoreFocus });
    } else if (action === "clear-open-tabs") {
      clearOpenTabsSelection();
      renderOpenTabsToolbar();
      renderActiveTabsPreservingScroll();
    } else if (action === "filter-open-tab") {
      applyOpenTabFilter(button.dataset.openTabId);
    } else if (action === "clear-open-tab-filter") {
      clearOpenTabFilter();
    } else if (action === "focus-open-tabs-filter") {
      els.openTabsFilterInput?.focus();
    } else if (action === "focus-open-tab-row") {
      focusOpenTabRow(button.dataset.openTabId);
    } else if (action === "refresh-open-tabs") {
      await loadOpenTabs();
    } else if (action === "toggle-sidebar") {
      isSidebarCollapsed = !isSidebarCollapsed;
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed));
      renderSidebarState();
    } else if (action === "toggle-search") {
      toggleSearch();
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
    } else if (action === "switch-workspace") {
      await setActiveWorkspace(button.dataset.workspaceId);
    } else if (action === "create-workspace") {
      await createNewWorkspace();
    } else if (action === "rename-workspace") {
      await renameWorkspace();
    } else if (action === "create-folder") {
      await createNewFolder();
    } else if (action === "filter") {
      setActiveCategory(button.dataset.filter || "all", { restoreFocus: shouldRestoreKeyboardFocus(event) });
    } else if (action === "rename-folder") {
      await renameFolder(button.dataset.folderId);
    } else if (action === "delete-folder") {
      await deleteFolder(button.dataset.folderId);
    } else if (action === "start-selection") {
      startSessionSelection(source, groupId, tabId);
    } else if (action === "toggle-select") {
      const targetRef = keyFor(source, groupId, tabId);
      const focusedRef = document.activeElement === button ? targetRef : "";
      const shouldRestoreFocus = shouldRestoreSavedTabSelectionFocus({
        isUserAction: event.isTrusted !== false,
        focusedRef,
        targetRef
      });
      toggleSelection(source, groupId, tabId);
      if (shouldRestoreFocus) {
        focusSavedTabRef({ source, groupId, tabId }, "input");
      }
    } else if (action === "selection-clear") {
      closeSessionSelection();
      renderGroups();
    } else if (action === "selection-restore") {
      await restoreSelected();
    } else if (action === "selection-copy") {
      await copySelected();
    } else if (action === "selection-delete") {
      await deleteSelected();
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
    if (infoPopoverFocusIntent) {
      requestAnimationFrame(() => restoreInfoPopoverActionFocus(infoPopoverFocusIntent));
    }
    actionMenu?.removeAttribute("open");
    if (contextMenu) {
      closeOpenTabContextMenu({ restoreFocus: true });
    }
  }
}

async function handleChange(event) {
  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }
  if (target.dataset.action === "switch-open-window") {
    selectedOpenWindowId = Number(target.value) || null;
    clearOpenTabsSelection();
    renderActiveTabs();
  }
}

async function handleWebAwesomeSelect(event) {
  const value = String(event.detail?.item?.value ?? event.target?.value ?? "");
  const windowSelection = getOpenWindowSelection(event, els.windowSelect);
  if (windowSelection) {
    selectedOpenWindowId = windowSelection.selectedOpenWindowId;
    if (windowSelection.clearSelection) {
      clearOpenTabsSelection();
    }
    if (windowSelection.render) {
      renderActiveTabs();
    }
    return;
  }
  if (event.target !== els.workspaceMenu) {
    return;
  }
  try {
    if (value.startsWith("workspace:")) {
      await setActiveWorkspace(value.slice("workspace:".length));
    } else if (value === "create-workspace") {
      await createNewWorkspace();
    } else if (value === "rename-workspace") {
      await renameWorkspace();
    }
  } catch (error) {
    toast(error?.message || String(error), true);
  }
}

async function setActiveWorkspace(workspaceId) {
  const nextWorkspaceId = state.workspaces.some((workspace) => workspace.id === workspaceId)
    ? workspaceId
    : DEFAULT_WORKSPACE_ID;
  activeWorkspaceId = nextWorkspaceId;
  localStorage.setItem("ziptab.activeWorkspaceId", activeWorkspaceId);
  await updateState((draft) => ({ ...draft, activeWorkspaceId }));
  activeFilter = CATEGORY_INBOX;
  localStorage.setItem("ziptab.activeFilter", activeFilter);
  selected.clear();
  selectionGroupId = "";
  render();
}

function handleContextMenu(event) {
  const activeTabRow = event.target.closest("[data-drag-kind='open-tab']") || event.target.closest(".active-tab-row.not-storable");
  if (activeTabRow) {
    const tab = findOpenTabById(activeTabRow.dataset.openTabId);
    closeOpenTabContextMenu();
    pendingOpenTabContextFocus = null;
    if (!isStorableOpenTab(tab)) {
      return;
    }
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
    if (!isStorableOpenTab(findOpenTabById(tabId))) {
      event.preventDefault();
      return;
    }
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
  activeDragPayload = payload;
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
  if (drop === "tab-before") {
    dropTarget.classList.add("drag-over");
    updateTabDropLine(event, dropTarget);
    removeGroupInsertMarker();
  } else if (drop === "category-reorder") {
    dropTarget.classList.add("drag-over");
    const rect = dropTarget.getBoundingClientRect();
    const isHorizontal = dropTarget.parentElement?.classList.contains("top-category-list");
    const isAfter = isHorizontal ? event.clientX > rect.left + rect.width / 2 : event.clientY > rect.top + rect.height / 2;
    dropTarget.classList.toggle("category-drop-after", isAfter);
  } else if (drop === "group-body" && ["tab", "tabs", "open-tabs"].includes(activeDragKind)) {
    const zone = getSessionDropZone(groupHorizontalRatio(dropTarget, event));
    if (zone === "add-to-session") {
      dropTarget.classList.add("drag-over");
      removeGroupInsertMarker();
    } else {
      dropTarget.classList.remove("drag-over");
      updateGroupInsertMarker(event, dropTarget);
    }
  } else if (shouldShowGroupInsertMarker(drop)) {
    if (drop === "category-column" && !dropTarget.closest(".category-section")) {
      dropTarget.classList.add("drag-over");
      removeGroupInsertMarker();
    } else {
      updateGroupInsertMarker(event, dropTarget);
    }
  } else {
    dropTarget.classList.add("drag-over");
    removeGroupInsertMarker();
  }
}

function handleDragLeave(event) {
  const dropTarget = closestSupportedDropTarget(event.target);
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
  } else if (payload.kind === "tab" && drop === "group-body" && hadGroupInsertMarker) {
    await moveTabToNewGroup(payload, insertPosition?.categoryFilter || CATEGORY_INBOX, insertPosition);
  } else if (payload.kind === "tabs" && drop === "group-body" && hadGroupInsertMarker) {
    await moveTabsToNewGroup(payload.refs, insertPosition?.categoryFilter || CATEGORY_INBOX, insertPosition);
  } else if (payload.kind === "open-tabs" && drop === "group-body" && hadGroupInsertMarker) {
    await addOpenTabsToNewGroup(payload.tabIds, insertPosition?.categoryFilter || CATEGORY_INBOX, insertPosition);
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
  } else if (payload.kind === "open-tabs" && drop === "category-column") {
    await addOpenTabsToNewGroup(payload.tabIds, dropTarget.dataset.categoryFilter || CATEGORY_INBOX, insertPosition);
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
    const isHorizontal = dropTarget.parentElement?.classList.contains("top-category-list");
    const placement = (isHorizontal ? event.clientX > rect.left + rect.width / 2 : event.clientY > rect.top + rect.height / 2) ? "after" : "before";
    await moveCategory(payload.categoryId, dropTarget.dataset.categoryId, placement);
  }
  activeDragKind = "";
  activeDragPayload = null;
  updateDragUi();
}

function handleDragEnd() {
  activeDragKind = "";
  activeDragPayload = null;
  groupDragSourceRect = null;
  groupDragSourceCategoryFilter = "";
  groupDragSourceId = "";
  clearGroupDragTarget();
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
    const section = fallbackNode.closest(".category-section");
    groupDragSourceRect = copyRectBounds(fallbackNode.getBoundingClientRect());
    groupDragSourceCategoryFilter = section?.dataset.categoryFilter || CATEGORY_INBOX;
    groupDragSourceId = payload.groupId;
    fallbackNode.classList.add("drag-origin");
    setGroupDragImage(event, fallbackNode);
    requestAnimationFrame(() => {
      if (!fallbackNode.isConnected || activeDragPayload?.groupId !== payload.groupId) {
        return;
      }
      seedGroupDragMarker(fallbackNode);
      fallbackNode.classList.add("dragging");
    });
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
  ghost.style.height = `${rect.height}px`;
  ghost.style.minHeight = "0";
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
  document.body.classList.toggle("manager-dragging", Boolean(activeDragKind));
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
  marker.style.minHeight = `${Math.round(sourceCard.getBoundingClientRect().height)}px`;
  grid.insertBefore(marker, sourceCard);
}

function updateGroupInsertMarker(event, dropTarget) {
  const section = dropTarget.closest(".category-section");
  const grid = section?.querySelector(".category-section-grid");
  if (!section || !grid) {
    removeGroupInsertMarker();
    return;
  }
  const categoryFilter = section.dataset.categoryFilter || CATEGORY_INBOX;
  const stickyTarget = activeDragKind === "group" ? resolveStickyGroupCardTarget(grid, event) : null;
  if (!stickyTarget && activeDragKind === "group" && restoreSourceGroupInsertMarker(grid, event, categoryFilter)) {
    return;
  }
  const target =
    stickyTarget ||
    (activeDragKind === "group" ? resolveDirectGroupCardTarget(grid, dropTarget, event) : null) ||
    resolveGroupInsertTarget(grid, event);
  const targetCard = target?.card || null;
  const placement = target?.placement || "end";
  const sourceGroupId = activeDragPayload?.kind === "group" ? activeDragPayload.groupId : "";
  const indicator = getGroupDropIndicator({
    sourceGroupId,
    targetGroupId: targetCard?.dataset.groupId || "",
    edge: targetCard ? placement : "end"
  });
  if (!indicator.showInsertLine) {
    removeGroupInsertMarker();
    return;
  }

  const marker = ensureGroupInsertMarker();
  marker.dataset.categoryFilter = categoryFilter;
  marker.dataset.targetGroupId = targetCard?.dataset.groupId || "";
  marker.dataset.placement = targetCard ? placement : "end";

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
    groupInsertMarker = h("div", { class: "group-insert-marker", "data-drop": "group-insert", "aria-hidden": "true" });
  }
  return groupInsertMarker;
}

function removeGroupInsertMarker() {
  if (!groupInsertMarker) {
    return;
  }
  groupInsertMarker.style.minHeight = "";
  groupInsertMarker.remove();
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
  const section = dropTarget.closest(".category-section");
  const grid = section?.querySelector(".category-section-grid");
  if (!section || !grid) {
    return null;
  }
  const target =
    (activeDragKind === "group" ? resolveDirectGroupCardTarget(grid, dropTarget, event) : null) ||
    resolveGroupInsertTarget(grid, event);
  if (!target?.card) {
    return {
      categoryFilter: section.dataset.categoryFilter || CATEGORY_INBOX,
      targetGroupId: "",
      placement: "end"
    };
  }
  return {
    categoryFilter: section.dataset.categoryFilter || CATEGORY_INBOX,
    targetGroupId: target.card.dataset.groupId || "",
    placement: target.placement
  };
}

function resolveDirectGroupCardTarget(grid, dropTarget, event) {
  const targetCard = dropTarget.closest(".group-card");
  if (!targetCard || targetCard.classList.contains("dragging")) {
    return null;
  }
  const ratio = groupHorizontalRatio(targetCard, event);
  const sourceGroupId = activeDragPayload?.groupId || "";
  const targetGroupId = targetCard.dataset.groupId || "";
  if (targetGroupId !== sourceGroupId && getSessionDropZone(ratio) === "add-to-session") {
    groupDragTargetId = targetGroupId;
    groupDragTargetRect = copyRectBounds(targetCard.getBoundingClientRect());
  } else {
    clearGroupDragTarget();
  }
  const allCards = [...grid.querySelectorAll(".group-card")];
  const sourceIndex = allCards.findIndex((card) => card.dataset.groupId === sourceGroupId);
  const targetIndex = allCards.findIndex((card) => card.dataset.groupId === targetGroupId);
  return {
    card: targetCard,
    placement: getGroupCardDropPlacement(sourceIndex, targetIndex, ratio)
  };
}

function resolveStickyGroupCardTarget(grid, event) {
  const sourceGroupId = activeDragPayload?.groupId || "";
  if (!groupDragTargetId || groupDragTargetId === sourceGroupId || !groupDragTargetRect) {
    return null;
  }
  if (!pointInsideMiddleHalfWithMargin(groupDragTargetRect, event.clientX)) {
    clearGroupDragTarget();
    return null;
  }
  const targetCard = [...grid.querySelectorAll(".group-card")].find((card) => card.dataset.groupId === groupDragTargetId);
  if (!targetCard || targetCard.classList.contains("dragging")) {
    clearGroupDragTarget();
    return null;
  }
  const allCards = [...grid.querySelectorAll(".group-card")];
  const sourceIndex = allCards.findIndex((card) => card.dataset.groupId === sourceGroupId);
  const targetIndex = allCards.findIndex((card) => card.dataset.groupId === groupDragTargetId);
  return {
    card: targetCard,
    placement: getGroupCardDropPlacement(sourceIndex, targetIndex, 0.5)
  };
}

function clearGroupDragTarget() {
  groupDragTargetRect = null;
  groupDragTargetId = "";
}

function resolveGroupInsertTarget(grid, event) {
  const marker = groupInsertMarker?.parentElement === grid ? groupInsertMarker : null;
  marker?.remove();
  const cards = [...grid.querySelectorAll(".group-card:not(.dragging)")];
  if (!cards.length) {
    return null;
  }
  const rects = cards.map((card) => card.getBoundingClientRect());
  const target = getGroupReorderTarget(rects, { x: event.clientX, y: event.clientY }, "x");
  if (!target) {
    return null;
  }
  return {
    card: cards[target.targetIndex] || null,
    placement: target.placement
  };
}

function restoreSourceGroupInsertMarker(grid, event, categoryFilter) {
  const sourceGroupId = groupDragSourceId || activeDragPayload?.groupId || "";
  const sourceCard = [...grid.querySelectorAll(".group-card")].find((card) => card.dataset.groupId === sourceGroupId);
  if (!sourceCard || !groupDragSourceRect) {
    return false;
  }
  if (!pointInsideRect(groupDragSourceRect, event.clientX, event.clientY)) {
    return false;
  }
  const marker = ensureGroupInsertMarker();
  marker.dataset.categoryFilter = groupDragSourceCategoryFilter || categoryFilter;
  marker.dataset.targetGroupId = sourceCard.dataset.groupId || "";
  marker.dataset.placement = "before";
  grid.insertBefore(marker, sourceCard);
  return true;
}

function pointInsideRect(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function copyRectBounds(rect) {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom
  };
}

function horizontalRatioForRect(rect, event) {
  const width = rect.right - rect.left;
  if (!width) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / width));
}

function pointInsideMiddleHalfWithMargin(rect, x) {
  return isPointInMiddleHalfWithMargin(rect, x, GROUP_TARGET_LOCK_RELEASE_MARGIN_PX);
}

function groupHorizontalRatio(card, event) {
  return horizontalRatioForRect(card.getBoundingClientRect(), event);
}

function handleKeyboard(event) {
  const contextMenu = event.target.closest(".open-tab-context-menu");
  if (contextMenu && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    const menuItems = [...contextMenu.querySelectorAll('[role="menuitem"]')];
    const currentItem = event.target.closest('[role="menuitem"]');
    const currentIndex = menuItems.indexOf(currentItem);
    const nextIndex = getMenuItemNavigationIndex(
      currentIndex,
      menuItems.length,
      event.key === "ArrowUp" ? "up" : "down"
    );
    if (nextIndex >= 0) {
      event.preventDefault();
      menuItems[nextIndex].focus();
    }
    return;
  }
  if (contextMenu && event.key === "Escape") {
    event.preventDefault();
    closeOpenTabContextMenu({ restoreFocus: true });
    return;
  }

  const openTabRow = event.target.closest("[data-drag-kind='open-tab']");
  if (openTabRow && isContextMenuKey(event)) {
    event.preventDefault();
    const rect = openTabRow.getBoundingClientRect();
    openOpenTabContextMenu(openTabRow.dataset.openTabId, rect.left, rect.bottom, {
      focusFirst: true,
      trigger: openTabRow
    });
    return;
  }

  const savedTabRow = event.target.closest("[data-drag-kind='tab']");
  if (savedTabRow && isContextMenuKey(event)) {
    event.preventDefault();
    const savedTabTrigger = event.target.closest("a, input, [tabindex]") || savedTabRow;
    const rect = savedTabRow.getBoundingClientRect();
    openSavedTabContextMenu(
      {
        source: savedTabRow.dataset.source,
        groupId: savedTabRow.dataset.groupId,
        tabId: savedTabRow.dataset.tabId
      },
      rect.left,
      rect.bottom,
      { focusFirst: true, trigger: savedTabTrigger }
    );
    return;
  }

  const categoryRow = event.target.closest(".category-row[data-folder-id]");
  if (categoryRow?.dataset.folderId && isContextMenuKey(event)) {
    event.preventDefault();
    const rect = categoryRow.getBoundingClientRect();
    openCategoryContextMenu(categoryRow.dataset.folderId, rect.left, rect.bottom, {
      focusFirst: true,
      trigger: event.target.closest("button, [tabindex]") || categoryRow
    });
    return;
  }

  const renameTitle = event.target.closest("[data-rename-group-id]");
  if (renameTitle && isRenameActivationKey(event.key)) {
    event.preventDefault();
    startInlineGroupRename(renameTitle);
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    expandSearch();
    els.searchInput.focus();
    return;
  }
  if (event.key === "/" && !event.target.closest("input, textarea, wa-input")) {
    event.preventDefault();
    expandSearch();
    els.searchInput.focus();
  }
  if (event.key === "Escape") {
    closeOpenTabContextMenu();
    closeSessionSelection();
    render();
  }
}

function render() {
  renderSidebarState();
  renderWorkspaceSwitcher();
  renderSearchControl();
  renderStats();
  renderHeaderActions();
  renderActiveTabs();
  renderFolders();
  renderGroups();
}

function renderSidebarState() {
  els.appShell.classList.toggle("sidebar-collapsed", isSidebarCollapsed);
  els.sidebarContent.hidden = false;
  els.sidebarToggle.setAttribute("aria-expanded", String(!isSidebarCollapsed));
  const label = isSidebarCollapsed ? "Show sidebar" : "Hide sidebar";
  els.sidebarToggle.setAttribute("aria-label", label);
  els.sidebarToggle.dataset.tooltip = label;
  const icon = isSidebarCollapsed ? "chevrons-right" : "chevrons-left";
  if (els.sidebarToggle.dataset.icon !== icon) {
    els.sidebarToggle.dataset.icon = icon;
    delete els.sidebarToggle.dataset.iconHydrated;
    hydrateIconButtons(els.sidebarToggle.parentElement);
  }
}

function renderSidebarRail() {
  if (!els.sidebarRail) {
    return;
  }
  const model = buildSidebarRailModel({
    windows: openWindows,
    selectedWindowId: selectedOpenWindowId,
    query: openTabsQuery
  });
  const children = [
    model.window
      ? iconOnlyButton("layers", `${model.window.accessibleLabel} quick access`, {
          class: "sidebar-rail-window",
          "data-action": "focus-open-tabs-filter"
        })
      : null,
    ...model.tabs.map((tab) =>
      h(
        "button",
        {
          type: "button",
          class: `sidebar-rail-tab${tab.active ? " active" : ""}${tab.pinned ? " pinned" : ""}${tab.storable ? "" : " not-storable"}`,
          "data-action": "focus-open-tab-row",
          "data-open-tab-id": tab.id,
          "aria-label": `Focus ${tab.title}`,
          "aria-current": tab.active ? "true" : undefined
        },
        renderSidebarRailIcon(tab.icon)
      )
    ),
    iconOnlyButton("search", "Filter open tabs", {
      class: "sidebar-rail-search",
      "data-action": model.searchAction
    })
  ].filter(Boolean);
  els.sidebarRail.replaceChildren(...children);
}

function renderSidebarRailIcon(icon) {
  const slot = h("span", { class: "sidebar-rail-tab-icon", "aria-hidden": "true" });
  const renderFallback = (iconName) => {
    slot.classList.add("fallback");
    slot.replaceChildren(createIcon(iconName));
  };
  if (icon.kind === "image") {
    const image = h("img", { src: icon.src, alt: "" });
    image.addEventListener("error", () => renderFallback(icon.fallbackIcon), { once: true });
    slot.append(image);
  } else {
    renderFallback(icon.icon);
  }
  return slot;
}

function renderStats() {
  const stats = collectStats({ ...state, groups: workspaceGroups() });
  const presentation = buildWorkspaceStatsPresentation({
    savedTabCount: stats.savedTabs,
    groupCount: workspaceGroups().length
  });
  const trigger = els.workspaceMenu?.querySelector("[slot='trigger']");
  if (trigger) {
    trigger.dataset.tooltip = presentation.tooltip;
    trigger.setAttribute("aria-label", `Workspace: ${activeWorkspace()?.name || "Workspace"}. ${presentation.tooltip}`);
  }
  const statsNode = els.workspaceMenu?.querySelector(".workspace-option-stats");
  if (statsNode) {
    statsNode.textContent = presentation.secondaryText;
  }
}

function renderSearchControl() {
  const label = isSearchExpanded ? "Close search" : searchQuery ? "Search (active)" : "Search";
  const icon = isSearchExpanded ? "x" : "search";
  els.searchField.hidden = !isSearchExpanded;
  els.managerTopbar.classList.toggle("search-collapsed", !isSearchExpanded);
  els.searchToggle.setAttribute("aria-expanded", String(isSearchExpanded));
  els.searchToggle.setAttribute("aria-label", label);
  els.searchToggle.dataset.queryActive = searchQuery ? "true" : "false";
  els.searchToggle.dataset.tooltip = label;
  if (els.searchToggle.dataset.icon !== icon) {
    els.searchToggle.dataset.icon = icon;
    delete els.searchToggle.dataset.iconHydrated;
    hydrateIconButtons(els.searchToggle.parentElement);
  }
}

function toggleSearch() {
  isSearchExpanded = !isSearchExpanded;
  renderSearchControl();
  if (isSearchExpanded) {
    els.searchInput.focus();
  }
}

function expandSearch() {
  isSearchExpanded = true;
  renderSearchControl();
}

function renderHeaderActions() {
  els.headerActions.replaceChildren(
    iconTextButton("download", "Import", { "data-action": "import" }),
    iconTextButton("upload", "Export", { "data-action": "export-all" }),
    iconTextButton("trash-2", "Bin", { "data-action": "open-bin" }),
    iconOnlyButton("settings", "Options", { "data-action": "open-options" })
  );
}

function renderWorkspaceSwitcher() {
  const stats = collectStats({ ...state, groups: workspaceGroups() });
  const statsPresentation = buildWorkspaceStatsPresentation({
    savedTabCount: stats.savedTabs,
    groupCount: workspaceGroups().length
  });
  const model = buildWorkspaceMenuModel({
    workspaces: state.workspaces,
    activeWorkspaceId,
    savedTabCount: stats.savedTabs,
    groupCount: workspaceGroups().length
  });
  els.workspaceMenu.replaceChildren(
    iconTextButton("file-text", model.label, {
      slot: "trigger",
      class: "workspace-menu-trigger",
      "aria-label": `Workspace: ${model.label}. ${statsPresentation.tooltip}`,
      "data-tooltip": statsPresentation.tooltip
    }),
    ...model.options.map((workspace) =>
      h(
        "wa-dropdown-item",
        {
          value: `workspace:${workspace.id}`,
          "aria-current": workspace.selected ? "true" : undefined
        },
        h("span", { class: "workspace-option-label" }, workspace.selected ? `✓ ${workspace.label}` : workspace.label),
        workspace.selected
          ? h("small", { class: "workspace-option-stats muted" }, statsPresentation.secondaryText)
          : null
      )
    ),
    h("wa-dropdown-item", { value: "create-workspace" }, "New workspace"),
    h("wa-dropdown-item", { value: "rename-workspace" }, "Rename workspace")
  );
}

function renderActiveTabs() {
  void managerInfoPopover?.hide();
  renderWindowChips();
  renderSidebarRail();
  if (els.openTabsFilterInput && els.openTabsFilterInput.value !== openTabsQuery) {
    els.openTabsFilterInput.value = openTabsQuery;
  }
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

  const windows = buildOpenWindowsModel({ windows: openWindows, selectedWindowId: selectedOpenWindowId });
  const selectedWindow = windows.find((windowInfo) => windowInfo.selected);
  if (!selectedWindow) {
    els.activeTabsPanel.append(h("div", { class: "active-tabs-empty" }, "No open tabs"));
    return;
  }
  selectedOpenWindowId = selectedWindow.id;
  els.activeTabsPanel.append(renderExpandedOpenWindow(selectedWindow));
  restorePendingOpenTabContextFocus();
}

function renderWindowChips() {
  const windows = buildOpenWindowsModel({ windows: openWindows, selectedWindowId: selectedOpenWindowId });
  const selectedWindow = windows.find((windowInfo) => windowInfo.selected);
  const windowIcon = h(
    "span",
    { slot: "start", class: "window-selector-icon", "aria-hidden": "true" },
    createIcon("window")
  );
  els.windowSelect?.replaceChildren(
    windowIcon,
    ...windows.map((windowInfo) =>
      h(
        "wa-option",
        {
          value: windowInfo.id,
          "aria-label": windowInfo.accessibleLabel
        },
        windowInfo.label
      )
    )
  );
  if (els.windowSelect && selectedWindow) {
    els.windowSelect.value = String(selectedWindow.id);
  }
  els.windowSelect?.setAttribute("label", selectedWindow?.accessibleLabel || "Open window");
  renderSelectedWindowActions(selectedWindow);
}

function renderSelectedWindowActions(
  windowInfo = openWindows.find((item) => item.id === selectedOpenWindowId) || openWindows.find((item) => item.focused) || openWindows[0]
) {
  if (!els.windowActions) {
    return;
  }
  if (!windowInfo) {
    els.windowActions.replaceChildren();
    return;
  }
  const selectToggle = iconOnlyButton("square-check", openTabsSelectMode ? "Exit select mode" : "Select tabs", {
    class: `small-button open-tabs-select-toggle${openTabsSelectMode ? " active" : ""}`,
    "data-action": "toggle-open-tabs-select-mode",
    "aria-pressed": String(openTabsSelectMode)
  });
  const actions = openTabsSelectMode
    ? [
        selectToggle,
        h(
          "span",
          { class: "window-selection-count", "aria-live": "polite" },
          h("span", { class: "window-selection-badge", "aria-hidden": "true" }, selectedOpenTabIds.size),
          h("span", { class: "visually-hidden" }, `${selectedOpenTabIds.size} selected`)
        ),
        iconOnlyButton("list-plus", "Create session from selected tabs", {
          class: "small-button create-selected-button",
          "data-action": "capture-selected-open-tabs",
          disabled: isSelectedCapturePending,
          "aria-busy": isSelectedCapturePending ? "true" : undefined
        })
      ]
    : [
        iconOnlyButton("archive", "Save this window", {
          class: "small-button",
          "data-action": "capture-open-window",
          "data-window-id": windowInfo.id
        }),
        selectToggle,
        actionMenu(
          { label: "Window", icon: "more-horizontal", tooltip: "More window actions" },
          iconTextButton("copy", "Deduplicate", {
            "data-action": "dedupe-open-window",
            "data-window-id": windowInfo.id
          })
        )
      ];
  els.windowActions.replaceChildren(...actions);
}

function renderExpandedOpenWindow(windowInfo) {
  const tabs = sortOpenTabs(filterOpenTabs(windowInfo.tabs || [], openTabsQuery));
  const emptyMessage = openTabsQuery ? `No tabs match “${openTabsQuery}”` : "No open tabs";
  return h(
    "section",
    { class: "active-window expanded", "aria-label": "Open tabs" },
    renderOpenTabList(tabs, emptyMessage)
  );
}

function renderOpenTabList(tabs, emptyMessage = "") {
  const list = h("ul", { class: "active-tab-list" });
  for (const tab of tabs) {
    list.append(renderOpenTabRow(tab));
  }
  if (!tabs.length && emptyMessage) {
    list.append(h("li", { class: "active-tabs-empty" }, emptyMessage));
  }
  return list;
}

function renderOpenTabRow(tab) {
  const tabId = String(tab.id);
  const isStorable = isStorableOpenTab(tab);
  const checked = isStorable && selectedOpenTabIds.has(tabId);
  const filtered = isStorable && openTabFilter?.url === tab.url;
  const statusMessage = getOpenTabStatusMessage(tab);
  const actions = buildRowActionModel({ kind: "open", selectionMode: openTabsSelectMode && isStorable });
  const rowAttributes = {
    class: `active-tab-row${tab.active ? " active" : ""}${checked ? " selected" : ""}${filtered ? " filtered" : ""}${isStorable ? "" : " not-storable"}`,
    "data-open-tab-id": tabId,
    ...(isStorable
      ? {
          draggable: "true",
          "data-drag-kind": "open-tab",
          tabindex: "0",
          "aria-haspopup": "menu"
        }
      : {
          tabindex: "0",
          "aria-label": `${tab.title}. ${statusMessage}`
        })
  };
  const infoTriggerAttributes = {
    "data-info-popover": "open",
    "data-open-tab-id": tabId,
    "aria-haspopup": "dialog",
    "aria-expanded": "false",
    tabindex: "0"
  };
  const trailing = h("div", { class: "row-trailing active-tab-actions" });
  for (const action of actions) {
    if (action === "select") {
      trailing.append(h("input", {
        type: "checkbox",
        class: "open-tab-checkbox",
        "data-action": "toggle-open-tab",
        "data-open-tab-id": tabId,
        checked,
        "aria-label": `Select ${tab.title}`
      }));
    } else if (action === "close") {
      trailing.append(iconOnlyButton("x", `Close tab ${tab.title}`, {
        class: "row-reveal-action danger",
        "data-action": "close-open-tab",
        "data-open-tab-id": tabId
      }));
    }
  }
  return h(
    "li",
    rowAttributes,
    h(
      "div",
      { class: "active-tab-leading" },
      renderFaviconSlot(tab),
      tab.pinned
        ? h("span", { class: "active-tab-pinned-badge", role: "img", "aria-label": "Pinned tab" }, "PIN")
        : null
    ),
    h(
      "div",
      { class: "active-tab-content", ...infoTriggerAttributes },
      h("span", { class: "active-tab-title" }, tab.title),
      statusMessage ? h("small", { class: "active-tab-status" }, statusMessage) : null
    ),
    trailing
  );
}

function renderOpenTabsToolbar() {
  if (!els.openTabsToolbar) {
    return;
  }
  const nodes = [];
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
  const windowInfo = openWindows.find((item) => item.id === selectedOpenWindowId) || openWindows.find((item) => item.focused) || openWindows[0];
  return windowInfo?.tabs || [];
}

function selectedOpenTabRecords() {
  return currentWindowOpenTabs().filter((tab) => selectedOpenTabIds.has(String(tab.id)) && isStorableOpenTab(tab));
}

function toggleOpenTabSelection(tabId, { restoreFocus = false } = {}) {
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
  renderActiveTabsPreservingScroll(restoreFocus ? key : "");
}

function clearOpenTabsSelection() {
  selectedOpenTabIds.clear();
  openTabsSelectMode = false;
}

function toggleOpenTabsSelectMode({ restoreFocus = false } = {}) {
  openTabsSelectMode = !openTabsSelectMode;
  if (!openTabsSelectMode) {
    clearOpenTabsSelection();
  }
  renderOpenTabsToolbar();
  renderActiveTabsPreservingScroll();
  if (restoreFocus) {
    els.windowActions?.querySelector('[data-action="toggle-open-tabs-select-mode"]')?.focus();
  }
}

function renderActiveTabsPreservingScroll(focusTabId = "") {
  const scrollTop = els.activeTabsPanel?.scrollTop || 0;
  renderActiveTabs();
  if (els.activeTabsPanel) {
    els.activeTabsPanel.scrollTop = scrollTop;
  }
  if (focusTabId) {
    focusOpenTabSelection(focusTabId);
  }
}

function focusOpenTabSelection(tabId) {
  if (!tabId) {
    return;
  }
  const escapedTabId = CSS.escape(String(tabId));
  const control =
    els.activeTabsPanel?.querySelector(`[data-action="toggle-open-tab"][data-open-tab-id="${escapedTabId}"]`) ||
    els.activeTabsPanel?.querySelector(`[data-drag-kind="open-tab"][data-open-tab-id="${escapedTabId}"]`);
  control?.focus();
}

function captureOpenTabContextFocusIntent() {
  const triggerId = openTabContextMenuTriggerId;
  return {
    triggerId,
    shouldRestore: shouldRestoreOpenTabContextFocus({
      openedByKeyboard: openTabContextMenuOpenedByKeyboard,
      triggerId
    })
  };
}

function focusOpenTabRow(tabId) {
  if (!tabId) {
    return false;
  }
  const row = els.activeTabsPanel?.querySelector(
    `.active-tab-row[data-open-tab-id="${CSS.escape(tabId)}"]`
  );
  if (!row) {
    return false;
  }
  row.focus();
  return true;
}

function restoreInfoPopoverActionFocus(intent) {
  if (!intent) {
    return;
  }
  if (intent.openTabId) {
    if (intent.action !== "close-open-tab" && focusOpenTabRow(intent.openTabId)) {
      return;
    }
    els.activeTabsPanel?.querySelector(".active-tab-row")?.focus();
    return;
  }
  focusSavedTabRef(intent);
}

function restoreOpenTabContextFocus(intent) {
  if (!intent.shouldRestore || !intent.triggerId) {
    return;
  }
  pendingOpenTabContextFocus = null;
  if (!focusOpenTabRow(intent.triggerId)) {
    pendingOpenTabContextFocus = { triggerId: intent.triggerId };
  }
}

function restorePendingOpenTabContextFocus() {
  if (!pendingOpenTabContextFocus || !focusOpenTabRow(pendingOpenTabContextFocus.triggerId)) {
    return;
  }
  if (!openTabsRefreshQueued) {
    pendingOpenTabContextFocus = null;
  }
}

function applyOpenTabFilter(tabId) {
  const tab = findOpenTabById(tabId);
  if (!tab?.url || !isStorableOpenTab(tab)) {
    return;
  }
  const focusIntent = captureOpenTabContextFocusIntent();
  openTabFilter = {
    url: tab.url,
    title: tab.title || tab.url
  };
  closeOpenTabContextMenu();
  renderOpenTabsToolbar();
  renderActiveTabs();
  restoreOpenTabContextFocus(focusIntent);
  renderStats();
  renderGroups();
}

function clearOpenTabFilter() {
  if (!openTabFilter) {
    return;
  }
  const focusIntent = captureOpenTabContextFocusIntent();
  openTabFilter = null;
  closeOpenTabContextMenu();
  renderOpenTabsToolbar();
  renderActiveTabs();
  restoreOpenTabContextFocus(focusIntent);
  renderStats();
  renderGroups();
}

function trimMissingOpenTabSelections() {
  const ids = new Set(filterStorableOpenTabIds(selectedOpenTabIds, currentWindowOpenTabs()));
  for (const tabId of selectedOpenTabIds) {
    if (!ids.has(tabId)) {
      selectedOpenTabIds.delete(tabId);
    }
  }
}

function renderFolders() {
  els.folderList.replaceChildren();
  for (const category of orderedCategoryItems()) {
    els.folderList.append(renderCategoryRow(category));
  }
}

function filterButton(category) {
  const model = buildCategoryItemModel(category);
  const attrs = {
    type: "button",
    class: activeFilter === model.filter ? "folder-button active" : "folder-button",
    "aria-current": activeFilter === model.filter ? "page" : undefined,
    "data-action": "filter",
    "data-filter": model.filter
  };
  if (categoryAcceptsDrop(category)) {
    attrs["data-drop"] = "category-column";
    attrs["data-category-filter"] = model.filter;
    attrs["data-folder-id"] = model.folderId;
  }
  return h(
    "button",
    attrs,
    h("span", { class: "category-label" }, model.label),
    h("strong", { class: "category-count" }, model.count)
  );
}

function renderCategoryRow(category) {
  const model = buildCategoryItemModel(category);
  const row = h("div", {
    class: `folder-row category-row${category.folder ? ` color-${category.folder.color}` : ""}`,
    draggable: "true",
    "data-drag-kind": "category",
    "data-category-id": model.id,
    "data-category-filter": model.filter,
    "data-folder-id": model.folderId,
    "data-drop": "category-reorder",
    "aria-label": `Reorder ${model.label}`
  });
  row.append(filterButton(category));
  if (model.editable) {
    row.append(iconOnlyButton("edit-3", `Edit category ${model.label}`, {
      class: "category-edit-action row-reveal-action",
      draggable: "false",
      "data-action": "rename-folder",
      "data-folder-id": model.folderId
    }));
  }
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
      count: String(groups.filter((group) => getBoardCategoryFilter(group) === CATEGORY_INBOX).length)
    },
    {
      id: CATEGORY_STARRED,
      filter: CATEGORY_STARRED,
      label: "Starred",
      count: String(groups.filter((group) => getBoardCategoryFilter(group) === CATEGORY_STARRED).length)
    },
    ...folders.map((folder) => ({
      id: `folder:${folder.id}`,
      filter: `folder:${folder.id}`,
      label: folder.name,
      count: String(groups.filter((group) => getBoardCategoryFilter(group) === `folder:${folder.id}`).length),
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
  void managerInfoPopover?.hide();
  els.groupsList.replaceChildren();
  els.groupsList.className = "groups-list category-sections single-category-board";
  const groups = visibleGroups();
  const categories = orderedCategoryItems();
  const category = categories.find((item) => item.filter === activeFilter) || categories[0];
  if (!category) {
    return;
  }
  els.groupsList.append(renderCategorySection(category, groups));
}

function renderInspector_DISABLED() {
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

function renderInspectorAction_DISABLED(actionId, group) {
  if (actionId !== "restore") {
    return null;
  }
  return iconOnlyButton("rotate-ccw", "Restore session", {
    class: "primary",
    "data-action": "restore-group",
    "data-group-id": group.id
  });
}

function renderInspectorMenuAction_DISABLED(actionId, group) {
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
  } else {
    body.append(h("div", { class: "category-section-empty" }, categoryEmptyText(category)));
  }
  return h("section", attrs, body);
}

function groupsForCategory(category, groups) {
  return groups.filter((group) => getBoardCategoryFilter(group) === category.filter);
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

function setActiveCategory(filter, { restoreFocus = false } = {}) {
  activeFilter = normalizeCategoryFilter(filter);
  localStorage.setItem("ziptab.activeFilter", activeFilter);
  renderStats();
  renderFolders();
  renderGroups();
  if (restoreFocus) {
    els.folderList?.querySelector(`[data-action="filter"][data-filter="${CSS.escape(activeFilter)}"]`)?.focus();
  }
}

function renderFaviconSlot(tab, { className = "" } = {}) {
  const model = buildFaviconSlotModel(tab);
  const slot = h("span", {
    class: `favicon-slot${className ? ` ${className}` : ""}`,
    "aria-hidden": "true"
  });
  const renderFallback = (iconName) => {
    slot.classList.add("fallback");
    slot.replaceChildren(createIcon(iconName));
  };
  if (model.kind === "image") {
    const image = h("img", { class: "favicon", src: model.src, alt: "" });
    image.addEventListener("error", () => renderFallback(model.fallbackIcon), { once: true });
    slot.append(image);
  } else {
    renderFallback(model.icon);
  }
  return slot;
}

function renderManagerInfoPopoverContent(trigger) {
  const context = trigger.dataset.infoPopover;
  const groupId = trigger.dataset.groupId || "";
  const source = trigger.dataset.source || "group";
  const tab = context === "open"
    ? findOpenTabById(trigger.dataset.openTabId)
    : findTabRef(state, { source, groupId, tabId: trigger.dataset.tabId })?.tab;
  if (!tab) {
    return null;
  }
  const model = buildTabInfoPopoverModel(tab, { context });
  const content = h(
    "section",
    { class: "manager-info-card", "aria-label": `Details for ${model.title}` },
    h(
      "div",
      { class: "manager-info-card-header" },
      renderFaviconSlot(tab),
      h(
        "div",
        { class: "manager-info-card-heading" },
        h("strong", {}, model.title),
        model.domain ? h("span", { class: "muted" }, model.domain) : null
      )
    ),
    model.url ? h("p", { class: "manager-info-card-url" }, model.url) : null,
    model.note ? h("p", { class: "manager-info-card-note" }, model.note) : null,
    model.savedAt ? h("time", { class: "muted", datetime: model.savedAt }, formatSavedTime(model.savedAt)) : null
  );
  const actions = context === "open"
    ? [
        isStorableOpenTab(tab)
          ? iconTextButton("filter", "Filter sessions", {
              "data-action": "filter-open-tab",
              "data-open-tab-id": String(tab.id)
            })
          : null,
        iconTextButton("x", "Close tab", {
          class: "danger",
          "data-action": "close-open-tab",
          "data-open-tab-id": String(tab.id)
        })
      ].filter(Boolean)
    : tabActionItems(tab, { source, groupId, tabId: tab.id });
  content.append(h("div", { class: "manager-info-card-actions" }, ...actions));
  return content;
}

function formatSavedTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `Saved ${date.toLocaleString()}`;
}

function renderGroup(group, contextId = "") {
  const matchingTabs = getVisibleGroupTabs(group, searchQuery);
  const cardView = buildSessionCardView(group);
  const headerModel = buildSessionHeaderModel(group);
  const restorableCount = cardView.restorableCount;
  const card = h("article", {
    class: `group-card${group.starred ? " starred" : ""}${group.locked ? " locked" : ""}`,
    id: contextId ? `group-${group.id}-${safeDomId(contextId)}` : `group-${group.id}`,
    draggable: "true",
    tabindex: "0",
    "data-drag-kind": "group",
    "data-group-id": group.id,
    "data-drop": "group-body"
  });
  const statusDescriptionId = `group-status-${safeDomId(group.id)}`;
  const statusDescription = headerModel.statusLabels.length ? `Status: ${headerModel.statusLabels.join(", ")}` : "";

  const title = h(
    "div",
    { class: "group-title-block" },
    statusDescription
      ? h("span", { class: "visually-hidden", id: statusDescriptionId }, statusDescription)
      : null,
    h(
      "h3",
      {
        class: "group-title-inline",
        role: "button",
        tabindex: "0",
        "data-rename-group-id": group.id,
        "aria-label": `Rename session ${headerModel.title}`,
        "aria-describedby": statusDescription ? statusDescriptionId : undefined
      },
      headerModel.title
    ),
    h(
      "p",
      { class: "muted group-meta" },
      headerModel.metaText,
      headerModel.statusLabels.length
        ? h("span", { class: "group-status-inline", "aria-hidden": "true" }, ...headerModel.statusLabels.map((label) => ` · ${label}`))
        : null
    )
  );

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

  const list = h("ul", { class: "tab-list" });
  for (const tab of matchingTabs) {
    list.append(renderTabRow(tab, { source: "group", groupId: group.id }));
  }
  if (!matchingTabs.length) {
    list.append(h("li", { class: "empty-row", "data-drop": "group-body", "data-group-id": group.id }, "No matches"));
  }
  card.append(list);

  return card;
}

function renderTabRow(tab, { source, groupId }) {
  const selectedKey = keyFor(source, groupId, tab.id);
  const selectionMode = selectionGroupId === groupId;
  const canOpen = isRestorableTab(tab);
  const ref = { source, groupId, tabId: tab.id };
  const row = h("li", {
    class: `tab-row item-${tab.itemType || ITEM_LINK}${selectionMode ? " selecting" : ""}${selected.has(selectedKey) ? " selected" : ""}`,
    tabindex: canOpen ? undefined : "0",
    draggable: "true",
    "data-drag-kind": "tab",
    "data-drop": "tab-before",
    "data-source": source,
    "data-group-id": groupId,
    "data-tab-id": tab.id,
    "aria-haspopup": "menu"
  });

  const subline = canOpen ? tab.url : itemTypeLabel(tab.itemType);
  const infoTriggerAttributes = {
    "data-info-popover": "saved",
    "data-source": source,
    "data-group-id": groupId,
    "data-tab-id": tab.id,
    "aria-haspopup": "dialog",
    "aria-expanded": "false",
    tabindex: canOpen ? undefined : "0"
  };
  const titleNode = canOpen
    ? h("a", { href: tab.url, target: "_blank", rel: "noreferrer", ...infoTriggerAttributes }, tab.title)
    : h("span", { class: "tab-title", ...infoTriggerAttributes }, tab.note || tab.title);
  const trailing = h("div", { class: "row-trailing tab-row-actions" });
  for (const action of buildRowActionModel({ kind: "saved", selectionMode })) {
    if (action === "select") {
      trailing.append(h("input", {
        type: "checkbox",
        class: "tab-select-checkbox",
        "data-action": "toggle-select",
        "data-source": source,
        "data-group-id": groupId,
        "data-tab-id": tab.id,
        checked: selected.has(selectedKey),
        "aria-label": `Select ${tab.title}`
      }));
    } else if (action === "more") {
      trailing.append(actionMenu({ label: "Tab", icon: "more-horizontal", tooltip: `Actions for ${tab.title}` }, ...tabActionItems(tab, ref)));
    }
  }

  row.append(
    h("div", { class: "tab-leading" }, renderFaviconSlot(tab)),
    h(
      "div",
      { class: "tab-main" },
      titleNode,
      h("span", { class: "url-line" }, subline),
      tab.note && canOpen ? h("p", { class: "tab-note" }, tab.note) : ""
    ),
    trailing
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
    if (menu === except) {
      continue;
    }
    menu.removeAttribute("open");
    resetActionMenuPanel(menu);
  }
}

function closeFloatingMenus() {
  closeActionMenus();
  closeOpenTabContextMenu();
}

function openOpenTabContextMenu(tabId, clientX, clientY, { focusFirst = false, trigger = null } = {}) {
  void managerInfoPopover?.hide();
  const tab = findOpenTabById(tabId);
  if (!isStorableOpenTab(tab)) {
    return;
  }
  closeOpenTabContextMenu();
  pendingOpenTabContextFocus = null;
  openTabContextMenuTriggerId = trigger?.dataset.openTabId || "";
  openTabContextMenuOpenedByKeyboard = Boolean(focusFirst && openTabContextMenuTriggerId);
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
  if (focusFirst) {
    menu.querySelector('[role="menuitem"]')?.focus();
  }
}

function openSavedTabContextMenu(
  ref,
  clientX,
  clientY,
  { focusFirst = false, trigger = null } = {}
) {
  void managerInfoPopover?.hide();
  const found = findTabRef(state, ref);
  if (!found?.tab) {
    return;
  }
  closeOpenTabContextMenu();
  savedTabContextMenuTrigger = focusFirst ? trigger : null;
  savedTabContextMenuRef = focusFirst ? { ...ref } : null;
  savedTabContextMenuFocusSelector = trigger?.matches("a")
    ? "a"
    : trigger?.matches("input")
      ? "input"
      : "";
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
  if (focusFirst) {
    menu.querySelector('[role="menuitem"]')?.focus();
  }
}

function openCategoryContextMenu(folderId, clientX, clientY, { focusFirst = false, trigger = null } = {}) {
  const folder = state.folders.find((item) => item.id === folderId);
  if (!folder) {
    return;
  }
  closeOpenTabContextMenu();
  savedTabContextMenuTrigger = trigger;
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
  if (focusFirst) {
    menu.querySelector('[role="menuitem"]')?.focus();
  }
}

function placeContextMenu(menu, clientX, clientY) {
  document.body.append(menu);
  const rect = menu.getBoundingClientRect();
  const left = Math.min(clientX, window.innerWidth - rect.width - 8);
  const top = Math.min(clientY, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
}

function getSavedTabFocusIntent(element) {
  const row = element?.closest?.("[data-drag-kind='tab']");
  if (!row) {
    return null;
  }
  return {
    ref: {
      source: row.dataset.source,
      groupId: row.dataset.groupId,
      tabId: row.dataset.tabId
    },
    focusSelector: element.matches?.("a") ? "a" : element.matches?.("input") ? "input" : ""
  };
}

function getSavedTabContextFocusIntent() {
  return savedTabContextMenuRef
    ? { ref: { ...savedTabContextMenuRef }, focusSelector: savedTabContextMenuFocusSelector }
    : null;
}

function restoreSavedTabFocusIntent(intent) {
  return intent ? focusSavedTabRef(intent.ref, intent.focusSelector) : false;
}

function focusSavedTabRef(ref, focusSelector = "") {
  if (!ref) {
    return false;
  }
  const row = [...document.querySelectorAll("[data-drag-kind='tab']")].find(
    (item) =>
      item.dataset.source === ref.source &&
      item.dataset.groupId === ref.groupId &&
      item.dataset.tabId === ref.tabId
  );
  const groupCard = row
    ? null
    : [...document.querySelectorAll(".group-card")].find((item) => item.dataset.groupId === ref.groupId);
  const target =
    (focusSelector ? row?.querySelector(focusSelector) : null) ||
    row?.querySelector("a, input") ||
    row ||
    groupCard?.querySelector("[data-rename-group-id], a, input, [tabindex]") ||
    els.groupsList;
  target?.focus();
  return Boolean(target);
}

function closeOpenTabContextMenu({ restoreFocus = false } = {}) {
  document.querySelector(".open-tab-context-menu")?.remove();
  const triggerId = openTabContextMenuTriggerId;
  const openedByKeyboard = openTabContextMenuOpenedByKeyboard;
  const savedTabTrigger = savedTabContextMenuTrigger;
  const savedTabRef = savedTabContextMenuRef;
  const savedTabFocusSelector = savedTabContextMenuFocusSelector;
  openTabContextMenuTriggerId = "";
  openTabContextMenuOpenedByKeyboard = false;
  savedTabContextMenuTrigger = null;
  savedTabContextMenuRef = null;
  savedTabContextMenuFocusSelector = "";
  if (restoreFocus && savedTabTrigger?.isConnected) {
    savedTabTrigger.focus();
    return;
  }
  if (restoreFocus && focusSavedTabRef(savedTabRef, savedTabFocusSelector)) {
    return;
  }
  if (restoreFocus) {
    restoreOpenTabContextFocus({
      triggerId,
      shouldRestore: shouldRestoreOpenTabContextFocus({ openedByKeyboard, triggerId })
    });
  }
}

function visibleGroups() {
  return workspaceGroups().filter(
    (group) => getBoardCategoryFilter(group) === activeFilter && groupMatchesQuery(group, searchQuery) && groupMatchesOpenTabFilter(group)
  );
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

function clearScheduledOpenTabsRefresh() {
  if (!openTabsRefreshTimer) {
    return;
  }
  window.clearTimeout(openTabsRefreshTimer);
  openTabsRefreshTimer = 0;
}

function scheduleOpenTabsRefresh() {
  if (document.visibilityState === "hidden") {
    return;
  }
  clearScheduledOpenTabsRefresh();
  openTabsRefreshTimer = window.setTimeout(() => {
    openTabsRefreshTimer = 0;
    void loadOpenTabs();
  }, OPEN_TABS_REFRESH_DELAY_MS);
}

async function loadOpenTabs() {
  clearScheduledOpenTabsRefresh();
  if (openTabsLoading) {
    openTabsRefreshQueued = true;
    return;
  }
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
    if (openTabsRefreshQueued) {
      openTabsRefreshQueued = false;
      void loadOpenTabs();
    }
  }
}


function handleInitialTargetFeedback() {
  if (hasCaptureFeedback(initialCaptureFeedback)) {
    toast(formatCaptureFeedback(initialCaptureFeedback));
  }
  if (!initialTargetGroupId) {
    return;
  }
  requestAnimationFrame(() => revealGroup(initialTargetGroupId));
}

function revealGroup(groupId) {
  const group = state.groups.find((item) => item.id === groupId);
  const categoryFilter = group ? getBoardCategoryFilter(group) : activeFilter;
  if (group && categoryFilter !== activeFilter) {
    setActiveCategory(categoryFilter);
  }
  const card = document.querySelector(`[data-group-id="${CSS.escape(groupId)}"]`);
  if (!card) {
    return false;
  }
  card.scrollIntoView({ block: "center", behavior: "smooth" });
  card.classList.add("target-highlight");
  window.setTimeout(() => card.classList.remove("target-highlight"), 2400);
  return true;
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
  if (!confirm(`Delete "${group.title}"?`)) {
    return;
  }
  await updateState((draft) => {
    pushBinEntry(draft, createBinEntry("group", group, { label: group.title }));
    draft.groups = draft.groups.filter((item) => item.id !== groupId);
    return draft;
  });
}

async function deleteTab(ref) {
  if (!confirm("Delete this saved tab?")) {
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
  if (name === null) {
    return;
  }
  await withCategoryMutationLock(() =>
    updateState((draft) => {
      const validation = validateFolderName(draft.folders, activeWorkspaceId, name);
      if (!validation.valid) {
        throw categoryNameValidationError(validation);
      }
      draft.folders.push(createFolder(validation.name, "slate", activeWorkspaceId));
      return draft;
    })
  );
}

async function renameFolder(folderId) {
  const folder = state.folders.find((item) => item.id === folderId);
  if (!folder) {
    return;
  }
  const name = prompt("Category name", folder.name);
  if (name === null) {
    return;
  }
  await withCategoryMutationLock(() =>
    updateState((draft) => {
      const target = draft.folders.find((item) => item.id === folderId);
      if (!target) {
        return draft;
      }
      const validation = validateFolderName(draft.folders, target.workspaceId, name, folderId);
      if (!validation.valid) {
        throw categoryNameValidationError(validation);
      }
      target.name = validation.name;
      target.updatedAt = nowIso();
      return draft;
    })
  );
}

function withCategoryMutationLock(mutation) {
  const locks = globalThis.navigator?.locks;
  // ponytail: fallback rechecks the latest draft but cannot serialize concurrent storage writers.
  return typeof locks?.request === "function"
    ? locks.request("ziptab-category-mutation", { mode: "exclusive" }, mutation)
    : mutation();
}

function categoryNameValidationError(validation) {
  return new Error(
    validation.reason === "duplicate"
      ? "A category with that name already exists in this workspace."
      : "Category name cannot be empty."
  );
}

async function deleteFolder(folderId) {
  const folder = state.folders.find((item) => item.id === folderId);
  if (!folder) {
    return;
  }
  if (!confirm(`Delete category "${folder.name}"?`)) {
    return;
  }
  let deleted = false;
  await withCategoryMutationLock(() =>
    updateState((draft) => {
      const target = draft.folders.find((item) => item.id === folderId);
      if (!target) {
        return draft;
      }
      deleted = true;
      const workspaceOrder = draft.categoryOrderByWorkspace?.[target.workspaceId];
      return {
        ...draft,
        folders: draft.folders.filter((item) => item.id !== folderId),
        groups: draft.groups.map((group) =>
          group.folderId === folderId ? { ...group, folderId: null } : group
        ),
        categoryOrderByWorkspace: Array.isArray(workspaceOrder)
          ? {
              ...(draft.categoryOrderByWorkspace || {}),
              [target.workspaceId]: removeCategoryIdFromOrder(workspaceOrder, `folder:${folderId}`)
            }
          : draft.categoryOrderByWorkspace
      };
    })
  );
  if (deleted && activeFilter === `folder:${folderId}`) {
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
  if (!confirm(`Delete ${refs.length} saved tabs?`)) {
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
  if (isSelectedCapturePending) {
    return;
  }
  const tabIds = selectedOpenTabRecords().map((tab) => Number(tab.id)).filter(Number.isFinite);
  if (!tabIds.length) {
    toast("Select tabs first", true);
    return;
  }
  const selectionSnapshot = captureOpenTabsSelectionSnapshot({
    selectedTabIds: selectedOpenTabIds,
    selectedWindowId: selectedOpenWindowId,
    selectMode: openTabsSelectMode,
    workspaceId: activeWorkspaceId
  });
  isSelectedCapturePending = true;
  let result = null;
  let isCaptureCommitted = false;
  let isCaptureReconciled = false;
  try {
    renderSelectedWindowActions();
    result = await sendRuntime({
      type: "capture",
      mode: "tab-ids",
      tabIds,
      workspaceId: selectionSnapshot.workspaceId,
      openAfter: false
    });
    isCaptureCommitted = true;
    try {
      const createdGroupId = result.createdGroupIds?.[0];
      if (createdGroupId && activeWorkspaceId === selectionSnapshot.workspaceId) {
        const nextState = normalizeState(await getState());
        if (activeWorkspaceId === selectionSnapshot.workspaceId) {
          state = nextState;
          ensureActiveWorkspace();
          if (activeWorkspaceId === selectionSnapshot.workspaceId) {
            const createdGroup = state.groups.find((group) => group.id === createdGroupId);
            if (openTabFilter) {
              clearOpenTabFilter();
            }
            if (searchQuery && createdGroup && !groupMatchesQuery(createdGroup, searchQuery)) {
              searchQuery = "";
              els.searchInput.value = searchQuery;
              render();
            }
            setActiveCategory("inbox");
            if (!revealGroup(createdGroupId)) {
              throw new Error("Saved session card was not found.");
            }
          }
        }
      }
      isCaptureReconciled = true;
    } catch (error) {
      throw createCaptureReconciliationError(error);
    }
  } finally {
    const currentSelection = captureOpenTabsSelectionSnapshot({
      selectedTabIds: selectedOpenTabIds,
      selectedWindowId: selectedOpenWindowId,
      selectMode: openTabsSelectMode,
      workspaceId: activeWorkspaceId
    });
    const captureOutcome = getCaptureOutcome({
      isCaptureCommitted,
      isCaptureReconciled,
      isSelectionCurrent: isSameOpenTabsSelectionSnapshot(selectionSnapshot, currentSelection)
    });
    if (captureOutcome.shouldClearSelection) {
      clearOpenTabsSelection();
    }
    isSelectedCapturePending = false;
    renderSelectedWindowActions();
    if (result && captureOutcome.shouldShowSuccess) {
      toast(formatCaptureFeedback(result));
    }
  }
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
  await updateState((draft) => ({
    ...draft,
    groups: moveGroupTabs(draft.groups, [ref], targetGroupId, targetTabId, placement)
  }));
}

async function moveTabsToGroup(refs, targetGroupId, targetTabId = "", placement = "before") {
  const normalizedRefs = (refs || []).filter((ref) => ref?.source === "group" && ref.groupId && ref.tabId);
  if (!targetGroupId || !normalizedRefs.length) {
    return;
  }
  await updateState((draft) => ({
    ...draft,
    groups: moveGroupTabs(draft.groups, normalizedRefs, targetGroupId, targetTabId, placement)
  }));
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
    .filter(isStorableOpenTab);
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
  clearOpenTabsSelection();
  renderOpenTabsToolbar();
  renderActiveTabs();
  toast(`Created session with ${tabs.length} tab${tabs.length === 1 ? "" : "s"}`);
}

async function addOpenTabsToGroup(tabIds, targetGroupId, targetTabId = "", placement = "before") {
  const tabs = [...new Set(tabIds || [])]
    .map((tabId) => findOpenTabById(tabId))
    .filter(isStorableOpenTab);
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
  clearOpenTabsSelection();
  renderOpenTabsToolbar();
  renderActiveTabs();
  toast(`Added ${tabs.length} tab${tabs.length === 1 ? "" : "s"} to session`);
}

async function moveCategory(sourceCategoryId, targetCategoryId, placement = "before") {
  if (!sourceCategoryId || !targetCategoryId) {
    return;
  }
  const workspaceId = activeWorkspaceId;
  let moved = false;
  const nextState = await withCategoryMutationLock(() =>
    updateState((draft) => {
      const categoryIds = [
        CATEGORY_INBOX,
        CATEGORY_STARRED,
        ...draft.folders
          .filter((folder) => folder.workspaceId === workspaceId)
          .map((folder) => `folder:${folder.id}`)
      ];
      const savedOrder = (draft.categoryOrderByWorkspace?.[workspaceId] || []).map((id) =>
        id === "all" ? "" : id === "unfiled" ? CATEGORY_INBOX : id
      );
      const currentOrder = buildOrderedCategoryIds(categoryIds, savedOrder);
      const nextOrder = reorderCategoryIds(currentOrder, sourceCategoryId, targetCategoryId, placement);
      if (nextOrder.join("|") === currentOrder.join("|")) {
        return draft;
      }
      moved = true;
      return {
        ...draft,
        categoryOrderByWorkspace: {
          ...(draft.categoryOrderByWorkspace || {}),
          [workspaceId]: nextOrder
        }
      };
    })
  );
  if (!moved) {
    return;
  }
  state = normalizeState(nextState);
  renderFolders();
  renderGroups();
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
    getBoardCategoryFilter(group),
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
      if (getBoardCategoryFilter(group) === filter) {
        lastCategoryIndex = index;
      }
    }
  }
  if (lastCategoryIndex >= 0) {
    return lastCategoryIndex + 1;
  }
  return lastWorkspaceIndex >= 0 ? lastWorkspaceIndex + 1 : groups.length;
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
  if (!confirm("Permanently remove this bin item?")) {
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
  if (!confirm(`Permanently clear ${state.bin.length} bin items?`)) {
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
    activeFilter = getBoardCategoryFilter(found.group);
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

function handleStartupError(stage, error) {
  const detail = error?.message || String(error);
  const message = stage === "state"
    ? "Unable to load saved tabs. Showing the default workspace."
    : stage === "popover"
      ? "Info popovers are unavailable."
      : stage === "open-tabs"
        ? `Unable to load open tabs: ${detail}`
        : stage === "migration"
        ? "Unable to migrate legacy saved tabs. Your saved tabs are still available."
        : stage === "loaded"
          ? "Unable to finish loading saved tabs."
          : stage === "shell"
            ? "Unable to start the manager interface."
            : `Unable to load open tabs: ${detail}`;
  toast(message, true);
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
