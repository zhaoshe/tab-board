import {
  DEFAULT_WORKSPACE_ID,
  ITEM_LINK,
  ITEM_NOTE,
  ITEM_TODO,
  TASK_DONE,
  TASK_NONE,
  TASK_OPEN,
  collectStats,
  compactBin,
  coerceUrl,
  createBinEntry,
  createFolder,
  createGroupFromTabRecords,
  createNoteRecord,
  cycleTaskStatus,
  createTabRecord,
  createTodoRecord,
  createWorkspace,
  groupMatchesQuery,
  groupsToText,
  isRestorableTab,
  itemTypeLabel,
  normalizeState,
  nowIso,
  parseImportText,
  parseOneTabText,
  tabMatchesQuery,
  tabsToText
} from "./model.js";
import { getState, updateState } from "./store.js";

const els = {
  activeTabsPanel: document.querySelector("#activeTabsPanel"),
  appShell: document.querySelector(".app-shell"),
  folderList: document.querySelector("#folderList"),
  groupsList: document.querySelector("#groupsList"),
  modal: document.querySelector("#modal"),
  modalActions: document.querySelector("#modalActions"),
  modalBody: document.querySelector("#modalBody"),
  modalTitle: document.querySelector("#modalTitle"),
  quickPanel: document.querySelector("#quickPanel"),
  quickPanelToggle: document.querySelector("#quickPanelToggle"),
  searchInput: document.querySelector("#searchInput"),
  selectionBar: document.querySelector("#selectionBar"),
  statsLine: document.querySelector("#statsLine"),
  toast: document.querySelector("#toast"),
  viewTitle: document.querySelector("#viewTitle"),
  workspaceSelect: document.querySelector("#workspaceSelect")
};

const TAB_PREVIEW_LIMIT = 6;

let state = normalizeState(await getState());
let activeFilter = localStorage.getItem("ziptab.activeFilter") || "all";
let activeWorkspaceId = localStorage.getItem("ziptab.activeWorkspaceId") || state.activeWorkspaceId || DEFAULT_WORKSPACE_ID;
let searchQuery = new URLSearchParams(location.search).get("q") || "";
let openWindows = [];
let openTabsLoading = false;
let quickPanelCollapsed = localStorage.getItem("ziptab.quickPanelCollapsed") === "true";
const selected = new Set();
const expandedGroupIds = new Set();

ensureActiveWorkspace();
els.searchInput.value = searchQuery;
applyTheme();
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
  document.addEventListener("keydown", handleKeyboard);
  els.searchInput.addEventListener("input", () => {
    searchQuery = els.searchInput.value.trim();
    render();
  });
}

function handleMenuDismiss(event) {
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
  const action = button.dataset.action;
  const groupId = button.dataset.groupId || "";
  const tabId = button.dataset.tabId || "";
  const source = button.dataset.source || "group";

  try {
    if (action === "capture-current-window") {
      const result = await sendRuntime({ type: "capture", mode: "current-window", workspaceId: activeWorkspaceId });
      toast(`Saved ${result.storedTabs || 0} tabs`);
      await loadOpenTabs();
    } else if (action === "capture-window-by-id") {
      const result = await sendRuntime({
        type: "capture",
        mode: "window-id",
        windowId: Number(button.dataset.windowId),
        workspaceId: activeWorkspaceId,
        openAfter: false
      });
      toast(`Saved ${result.storedTabs || 0} tabs`);
      await loadOpenTabs();
    } else if (action === "capture-tab-by-id") {
      const result = await sendRuntime({
        type: "capture",
        mode: "tab-id",
        tabId: Number(button.dataset.tabId),
        workspaceId: activeWorkspaceId,
        openAfter: false
      });
      toast(`Saved ${result.storedTabs || 0} tab`);
      await loadOpenTabs();
    } else if (action === "refresh-open-tabs") {
      await loadOpenTabs();
    } else if (action === "toggle-quick-panel") {
      toggleQuickPanel();
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
    } else if (action === "toggle-group-star") {
      await patchGroup(groupId, (group) => {
        group.starred = !group.starred;
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
      await addTextItemToGroup(groupId, ITEM_NOTE);
    } else if (action === "add-todo") {
      await addTextItemToGroup(groupId, ITEM_TODO);
    } else if (action === "toggle-tab-star") {
      await patchTab({ source, groupId, tabId }, (tab) => {
        tab.starred = !tab.starred;
      });
    } else if (action === "toggle-tab-task") {
      await patchTab({ source, groupId, tabId }, (tab) => {
        tab.taskStatus = cycleTaskStatus(tab.taskStatus);
      });
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
    } else if (action === "share-group") {
      const group = state.groups.find((item) => item.id === groupId);
      if (group) {
        openSharePage([group]);
      }
    } else if (action === "export-all") {
      openExportModal(state.groups);
    } else if (action === "export-group") {
      const group = state.groups.find((item) => item.id === groupId);
      openExportModal(group ? [group] : []);
    } else if (action === "import") {
      openImportModal();
    } else if (action === "import-onetab") {
      openOneTabImportModal();
    } else if (action === "create-workspace") {
      await createNewWorkspace();
    } else if (action === "rename-workspace") {
      await renameWorkspace();
    } else if (action === "create-folder") {
      await createNewFolder();
    } else if (action === "filter") {
      activeFilter = button.dataset.filter || "all";
      localStorage.setItem("ziptab.activeFilter", activeFilter);
      render();
    } else if (action === "rename-folder") {
      await renameFolder(button.dataset.folderId);
    } else if (action === "delete-folder") {
      await deleteFolder(button.dataset.folderId);
    } else if (action === "toggle-select") {
      toggleSelection(source, groupId, tabId);
    } else if (action === "selection-clear") {
      selected.clear();
      renderSelectionBar();
      renderGroups();
      renderQuickList();
    } else if (action === "selection-restore") {
      await restoreSelected();
    } else if (action === "selection-delete") {
      await deleteSelected();
    } else if (action === "selection-star") {
      await starSelected();
    } else if (action === "selection-task") {
      await taskSelected();
    } else if (action === "selection-quick") {
      await moveSelectedToQuickList();
    } else if (action === "selection-new-group") {
      await moveSelectedToNewGroup();
    } else if (action === "collapse-all") {
      await setAllCollapsed(true);
    } else if (action === "expand-all") {
      await setAllCollapsed(false);
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
  }
}

async function handleChange(event) {
  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }
  if (target.dataset.action === "move-group-folder") {
    const folderId = target.value || null;
    const folder = state.folders.find((item) => item.id === folderId);
    await patchGroup(target.dataset.groupId, (group) => {
      group.folderId = folderId;
      group.workspaceId = folder?.workspaceId || activeWorkspaceId;
    });
  } else if (target.dataset.action === "switch-workspace") {
    activeWorkspaceId = target.value || DEFAULT_WORKSPACE_ID;
    localStorage.setItem("ziptab.activeWorkspaceId", activeWorkspaceId);
    await updateState((draft) => {
      draft.activeWorkspaceId = activeWorkspaceId;
      return draft;
    });
    activeFilter = "all";
    localStorage.setItem("ziptab.activeFilter", activeFilter);
    selected.clear();
    render();
  }
}

function handleContextMenu(event) {
  const selector = event.target.closest("[data-action='toggle-select']");
  if (!selector) {
    return;
  }
  event.preventDefault();
  const groupId = selector.dataset.groupId;
  if (!groupId) {
    return;
  }
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) {
    return;
  }
  const keys = group.tabs.map((tab) => keyFor("group", group.id, tab.id));
  const allSelected = keys.every((key) => selected.has(key));
  for (const key of keys) {
    if (allSelected) {
      selected.delete(key);
    } else {
      selected.add(key);
    }
  }
  render();
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
  if (event.target.closest("button, input, textarea, select, summary, details, a")) {
    event.preventDefault();
    return;
  }
  const draggable = event.target.closest("[data-drag-kind]");
  if (!draggable) {
    return;
  }
  const payload =
    draggable.dataset.dragKind === "group"
      ? { kind: "group", groupId: draggable.dataset.groupId }
      : {
          kind: "tab",
          source: draggable.dataset.source,
          groupId: draggable.dataset.groupId || "",
          tabId: draggable.dataset.tabId
        };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/json", JSON.stringify(payload));
  draggable.classList.add("dragging");
}

function handleDragOver(event) {
  const dropTarget = event.target.closest("[data-drop]");
  if (!dropTarget) {
    return;
  }
  event.preventDefault();
  dropTarget.classList.add("drag-over");
}

function handleDragLeave(event) {
  const dropTarget = event.target.closest("[data-drop]");
  dropTarget?.classList.remove("drag-over");
}

async function handleDrop(event) {
  const dropTarget = event.target.closest("[data-drop]");
  if (!dropTarget) {
    return;
  }
  event.preventDefault();
  document.querySelectorAll(".drag-over, .dragging").forEach((node) => {
    node.classList.remove("drag-over", "dragging");
  });

  const raw = event.dataTransfer.getData("application/json");
  if (!raw) {
    return;
  }
  const payload = JSON.parse(raw);
  const drop = dropTarget.dataset.drop;

  if (payload.kind === "tab" && drop === "quick") {
    await moveTabToQuick(payload);
  } else if (payload.kind === "tab" && drop === "new-group") {
    await moveTabToNewGroup(payload);
  } else if (payload.kind === "tab" && drop === "group-body") {
    await moveTabToGroup(payload, dropTarget.dataset.groupId);
  } else if (payload.kind === "tab" && drop === "quick-before") {
    await moveTabToQuick(payload, dropTarget.dataset.tabId);
  } else if (payload.kind === "tab" && drop === "tab-before") {
    await moveTabToGroup(payload, dropTarget.dataset.groupId, dropTarget.dataset.tabId);
  } else if (payload.kind === "tab" && drop === "category-column") {
    await moveTabToNewGroup(payload, dropTarget.dataset.folderId || null);
  } else if (payload.kind === "group" && drop === "group-before") {
    await moveGroupBefore(payload.groupId, dropTarget.dataset.groupId);
  } else if (payload.kind === "group" && drop === "group-body") {
    await mergeGroups(payload.groupId, dropTarget.dataset.groupId);
  } else if (payload.kind === "group" && drop === "category-column") {
    await moveGroupToCategory(payload.groupId, dropTarget.dataset.folderId || null);
  }
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
    selected.clear();
    render();
  }
}

function render() {
  renderShellChrome();
  renderWorkspaceSwitcher();
  renderStats();
  renderActiveTabs();
  renderFolders();
  renderSelectionBar();
  renderGroups();
  renderQuickList();
}

function renderShellChrome() {
  els.appShell?.classList.toggle("quick-panel-collapsed", quickPanelCollapsed);
  if (els.quickPanel) {
    els.quickPanel.hidden = quickPanelCollapsed;
    els.quickPanel.setAttribute("aria-hidden", quickPanelCollapsed ? "true" : "false");
  }
  if (els.quickPanelToggle) {
    els.quickPanelToggle.textContent = quickPanelCollapsed ? "Show quick list" : "Hide quick list";
    els.quickPanelToggle.setAttribute("aria-expanded", quickPanelCollapsed ? "false" : "true");
    els.quickPanelToggle.title = quickPanelCollapsed
      ? "Show pinned workflow panel"
      : "Hide pinned workflow panel";
  }
}

function toggleQuickPanel() {
  quickPanelCollapsed = !quickPanelCollapsed;
  localStorage.setItem("ziptab.quickPanelCollapsed", String(quickPanelCollapsed));
  renderShellChrome();
}

function renderStats() {
  const stats = collectStats({ ...state, groups: workspaceGroups(), quickList: state.quickList });
  els.statsLine.textContent = `${stats.savedTabs} saved tabs, ${workspaceGroups().length} groups`;
  els.viewTitle.textContent = viewTitle();
}

function renderWorkspaceSwitcher() {
  els.workspaceSelect.replaceChildren();
  for (const workspace of state.workspaces) {
    els.workspaceSelect.append(
      h("option", { value: workspace.id, selected: workspace.id === activeWorkspaceId }, workspace.name)
    );
  }
}

function renderActiveTabs() {
  if (!els.activeTabsPanel) {
    return;
  }
  els.activeTabsPanel.replaceChildren();
  if (openTabsLoading) {
    els.activeTabsPanel.append(h("div", { class: "active-tabs-empty" }, "Loading open tabs"));
    return;
  }
  if (!openWindows.length) {
    els.activeTabsPanel.append(h("div", { class: "active-tabs-empty" }, "No open tabs"));
    return;
  }

  for (const [windowIndex, windowInfo] of openWindows.entries()) {
    const section = h("section", { class: "active-window" });
    section.append(
      h(
        "header",
        { class: "active-window-header" },
        h("strong", {}, windowInfo.focused ? "Current window" : `Window ${windowIndex + 1}`),
        h(
          "button",
          {
            type: "button",
            class: "small-button",
            "data-action": "capture-window-by-id",
            "data-window-id": windowInfo.id
          },
          "Save"
        )
      )
    );
    const list = h("ul", { class: "active-tab-list" });
    for (const tab of windowInfo.tabs) {
      const favicon =
        state.settings.showFavicons && tab.favIconUrl
          ? h("img", { class: "favicon", src: tab.favIconUrl, alt: "" })
          : h("span", { class: "favicon fallback", "aria-hidden": "true" }, "");
      list.append(
        h(
          "li",
          { class: `active-tab-row${tab.active ? " active" : ""}` },
          favicon,
          h("span", { class: "active-tab-title", title: tab.url }, tab.title),
          h(
            "button",
            {
              type: "button",
              class: "small-button",
              "data-action": "capture-tab-by-id",
              "data-tab-id": tab.id,
              disabled: tab.storable ? false : true
            },
            "Save"
          )
        )
      );
    }
    if (!windowInfo.tabs.length) {
      list.append(h("li", { class: "active-tabs-empty" }, "No storable tabs"));
    }
    section.append(list);
    els.activeTabsPanel.append(section);
  }
}

function renderFolders() {
  els.folderList.replaceChildren();
  const groups = workspaceGroups();
  const folders = workspaceFolders();
  els.folderList.append(
    filterButton("all", "All items", `${groups.length}`),
    filterButton("unfiled", "Unfiled", `${groups.filter((group) => !group.folderId).length}`),
    filterButton(
      "starred",
      "Starred",
      `${groups.filter((group) => group.starred || group.tabs.some((tab) => tab.starred)).length}`
    )
  );

  for (const folder of folders) {
    const row = h("div", { class: `folder-row color-${folder.color}` });
    row.append(
      h(
        "button",
        {
          type: "button",
          class: activeFilter === `folder:${folder.id}` ? "folder-button active" : "folder-button",
          "data-action": "filter",
          "data-filter": `folder:${folder.id}`
        },
        h("span", {}, folder.name),
        h("strong", {}, String(groups.filter((group) => group.folderId === folder.id).length))
      ),
      h(
        "button",
        {
          type: "button",
          class: "icon-button",
          title: "Rename category",
          "data-action": "rename-folder",
          "data-folder-id": folder.id
        },
        "Edit"
      ),
      h(
        "button",
        {
          type: "button",
          class: "icon-button danger-text",
          title: "Delete category",
          "data-action": "delete-folder",
          "data-folder-id": folder.id
        },
        "Del"
      )
    );
    els.folderList.append(row);
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

function renderSelectionBar() {
  const refs = selectedRefs();
  els.selectionBar.hidden = refs.length === 0;
  if (!refs.length) {
    els.selectionBar.replaceChildren();
    return;
  }
  els.selectionBar.replaceChildren(
    h("strong", {}, `${refs.length} selected`),
    h("button", { type: "button", "data-action": "selection-restore" }, "Restore"),
    h("button", { type: "button", "data-action": "selection-quick" }, "Quick list"),
    h("button", { type: "button", "data-action": "selection-new-group" }, "New group"),
    h("button", { type: "button", "data-action": "selection-star" }, "Star"),
    h("button", { type: "button", "data-action": "selection-task" }, "Task"),
    h("button", { type: "button", class: "danger", "data-action": "selection-delete" }, "Delete"),
    h("button", { type: "button", "data-action": "selection-clear" }, "Clear")
  );
}

function renderGroups() {
  els.groupsList.replaceChildren();
  els.groupsList.className = "groups-list";
  const groups = visibleGroups();
  const columns = kanbanColumns(groups);

  if (!groups.length && !workspaceFolders().length) {
    els.groupsList.append(
      h(
        "div",
        { class: "empty-state", "data-drop": "new-group" },
        h("h3", {}, searchQuery ? "No matches" : "No saved tabs")
      )
    );
    return;
  }

  if (!groups.length || !columns.length) {
    els.groupsList.append(
      h(
        "div",
        { class: "empty-state", "data-drop": "new-group" },
        h("h3", {}, "No matches")
      )
    );
    return;
  }

  if (shouldUseSessionGrid(columns)) {
    renderSessionGrid(groups);
    return;
  }

  els.groupsList.classList.add("kanban-board");
  for (const column of columns) {
    els.groupsList.append(renderKanbanColumn(column));
  }
}

function renderSessionGrid(groups) {
  els.groupsList.classList.add("session-grid-board");
  for (const group of groups) {
    els.groupsList.append(renderGroup(group));
  }
}

function shouldUseSessionGrid(columns) {
  const filledColumns = columns.filter((column) => column.groups.length);
  return activeFilter !== "all" || workspaceFolders().length < 2 || filledColumns.length < 2;
}

function renderKanbanColumn(column) {
  const restorableCount = column.groups.reduce(
    (total, group) => total + group.tabs.filter(isRestorableTab).length,
    0
  );
  const attrs = {
    class: "kanban-column",
    "data-column-id": column.id
  };
  if (column.acceptsDrop) {
    attrs["data-drop"] = "category-column";
    attrs["data-folder-id"] = column.folderId || "";
  }
  const lane = h(
    "section",
    attrs,
    h(
      "header",
      { class: "kanban-column-header" },
      h("div", {}, h("h3", {}, column.title), h("p", { class: "muted" }, `${column.groups.length} sessions - ${restorableCount} links`)),
      column.folderId
        ? h("button", {
            type: "button",
            class: "small-button",
            "data-action": "filter",
            "data-filter": `folder:${column.folderId}`
          }, "Focus")
        : ""
    )
  );
  const stack = h("div", { class: "kanban-column-list" });
  for (const group of column.groups) {
    stack.append(
      h("div", {
        class: "group-drop-zone",
        "data-drop": "group-before",
        "data-group-id": group.id
      }),
      renderGroup(group)
    );
  }
  if (!column.groups.length) {
    stack.append(h("div", { class: "kanban-empty" }, column.emptyText || "Drop sessions here"));
  }
  lane.append(stack);
  return lane;
}

function kanbanColumns(groups) {
  if (activeFilter === "all") {
    const folders = workspaceFolders();
    const columns = [
      {
        id: "unfiled",
        title: "Unfiled",
        folderId: "",
        acceptsDrop: true,
        emptyText: "Drop sessions without a category here",
        groups: groups.filter((group) => !group.folderId)
      },
      ...folders.map((folder) => ({
        id: folder.id,
        title: folder.name,
        folderId: folder.id,
        acceptsDrop: true,
        groups: groups.filter((group) => group.folderId === folder.id)
      }))
    ];
    return searchQuery ? columns.filter((column) => column.groups.length) : columns;
  }

  if (activeFilter === "unfiled") {
    return [
      {
        id: "unfiled",
        title: "Unfiled",
        folderId: "",
        acceptsDrop: true,
        groups
      }
    ];
  }

  if (activeFilter.startsWith("folder:")) {
    const folderId = activeFilter.slice("folder:".length);
    const folder = workspaceFolders().find((item) => item.id === folderId);
    return [
      {
        id: folderId,
        title: folder?.name || "Category",
        folderId,
        acceptsDrop: true,
        groups
      }
    ];
  }

  return [
    {
      id: "starred",
      title: "Starred",
      folderId: "",
      acceptsDrop: false,
      groups
    }
  ];
}

function renderGroup(group) {
  const matchingTabs = visibleTabsForGroup(group);
  const restorableCount = group.tabs.filter(isRestorableTab).length;
  const noteCount = group.tabs.filter((tab) => tab.itemType === ITEM_NOTE).length;
  const todoCount = group.tabs.filter((tab) => tab.itemType === ITEM_TODO).length;
  const card = h("article", {
    class: `group-card${group.starred ? " starred" : ""}${group.locked ? " locked" : ""}`,
    id: `group-${group.id}`,
    draggable: "true",
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
    todoCount ? `${todoCount} todos` : "",
    group.locked ? "locked" : "",
    group.starred ? "starred" : ""
  ].filter(Boolean);
  const metaText = metaBits.join(" - ");
  title.append(h("p", { class: "muted" }, metaText));

  const folderSelect = h(
    "select",
    {
      "data-action": "move-group-folder",
      "data-group-id": group.id,
      title: "Category"
    },
    h("option", { value: "" }, "No category")
  );
  for (const folder of workspaceFolders()) {
    folderSelect.append(h("option", { value: folder.id, selected: folder.id === group.folderId }, folder.name));
  }

  const header = h(
    "header",
    { class: "group-header" },
    title,
    h(
      "div",
      { class: "group-actions" },
      restorableCount
        ? h("button", { type: "button", "data-action": "restore-group", "data-group-id": group.id }, "Restore")
        : "",
      actionMenu(
        "Add",
        h("button", { type: "button", "data-action": "add-link", "data-group-id": group.id }, "Link"),
        h("button", { type: "button", "data-action": "add-note", "data-group-id": group.id }, "Note"),
        h("button", { type: "button", "data-action": "add-todo", "data-group-id": group.id }, "Todo")
      ),
      actionMenu(
        "More",
        folderSelect,
        h("button", { type: "button", "data-action": "copy-group", "data-group-id": group.id }, "Copy"),
        h("button", { type: "button", "data-action": "share-group", "data-group-id": group.id }, "Share page"),
        h("button", { type: "button", "data-action": "toggle-group-star", "data-group-id": group.id }, group.starred ? "Unstar" : "Star"),
        h("button", { type: "button", "data-action": "toggle-group-lock", "data-group-id": group.id }, group.locked ? "Unlock" : "Lock"),
        h("button", { type: "button", "data-action": "rename-group", "data-group-id": group.id }, "Rename"),
        h("button", { type: "button", "data-action": "edit-group-note", "data-group-id": group.id }, "Note"),
        h("button", { type: "button", "data-action": "export-group", "data-group-id": group.id }, "Export"),
        h("button", { type: "button", "data-action": "toggle-group-collapse", "data-group-id": group.id }, group.collapsed ? "Show tabs" : "Hide tabs"),
        h("button", { type: "button", class: "danger", "data-action": "delete-group", "data-group-id": group.id }, "Delete")
      )
    )
  );
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

function renderQuickList() {
  const visibleTabs = state.quickList.filter((tab) => tabMatchesQuery(tab, searchQuery));
  els.quickPanel.replaceChildren(
    h(
      "header",
      { class: "quick-header" },
      h("div", {}, h("p", { class: "eyebrow" }, "Pinned workflow"), h("h2", {}, "Quick list")),
      h("strong", {}, String(state.quickList.length))
    )
  );

  const list = h("ul", { class: "quick-list", "data-drop": "quick" });
  for (const tab of visibleTabs) {
    list.append(renderTabRow(tab, { source: "quick", groupId: "" }));
  }
  if (!visibleTabs.length) {
    list.append(h("li", { class: "empty-row" }, "No quick tabs"));
  }
  els.quickPanel.append(list);
}

function renderTabRow(tab, { source, groupId }) {
  const selectedKey = keyFor(source, groupId, tab.id);
  const canOpen = isRestorableTab(tab);
  const isTextItem = tab.itemType === ITEM_NOTE || tab.itemType === ITEM_TODO;
  const row = h("li", {
    class: `tab-row item-${tab.itemType || ITEM_LINK}${selected.has(selectedKey) ? " selected" : ""}${tab.starred ? " starred" : ""}${tab.taskStatus === TASK_DONE ? " done" : ""}`,
    draggable: "true",
    "data-drag-kind": "tab",
    "data-drop": source === "quick" ? "quick-before" : "tab-before",
    "data-source": source,
    "data-group-id": groupId,
    "data-tab-id": tab.id
  });

  const favicon =
    isTextItem
      ? h("span", { class: "favicon item-badge", "aria-hidden": "true" }, tab.itemType === ITEM_TODO ? "T" : "N")
      : state.settings.showFavicons && tab.favIconUrl
      ? h("img", { class: "favicon", src: tab.favIconUrl, alt: "" })
      : h("span", { class: "favicon fallback", "aria-hidden": "true" }, "");
  const titleNode = canOpen
    ? h("a", { href: tab.url, target: "_blank", rel: "noreferrer", title: tab.title }, tab.title)
    : h("span", { class: "tab-title", title: tab.note || tab.title }, tab.note || tab.title);
  const subline = canOpen
    ? tab.url
    : tab.itemType === ITEM_TODO
      ? `${itemTypeLabel(tab.itemType)} - ${taskLabel(tab.taskStatus)}`
      : itemTypeLabel(tab.itemType);
  const copyLabel = canOpen ? "Copy URL" : "Copy text";

  row.append(
    h(
      "button",
      {
        type: "button",
        class: "select-dot",
        "aria-pressed": selected.has(selectedKey) ? "true" : "false",
        "data-action": "toggle-select",
        "data-source": source,
        "data-group-id": groupId,
        "data-tab-id": tab.id,
        title: "Select",
        "aria-label": `Select ${tab.title}`
      },
      ""
    ),
    favicon,
    h(
      "div",
      { class: "tab-main" },
      titleNode,
      h("span", { class: "url-line", title: subline }, subline),
      tab.note && canOpen ? h("p", { class: "tab-note" }, tab.note) : ""
    ),
    h(
      "div",
      { class: "tab-actions" },
      canOpen
        ? h("button", { type: "button", "data-action": "restore-tab", "data-source": source, "data-group-id": groupId, "data-tab-id": tab.id }, "Open")
        : "",
      actionMenu(
        "More",
        h("button", { type: "button", "data-action": "toggle-tab-star", "data-source": source, "data-group-id": groupId, "data-tab-id": tab.id }, tab.starred ? "Unstar" : "Star"),
        h("button", { type: "button", "data-action": "toggle-tab-task", "data-source": source, "data-group-id": groupId, "data-tab-id": tab.id }, taskLabel(tab.taskStatus)),
        h("button", { type: "button", "data-action": "edit-tab-note", "data-source": source, "data-group-id": groupId, "data-tab-id": tab.id }, canOpen ? "Note" : "Edit"),
        h("button", { type: "button", "data-action": "copy-tab", "data-source": source, "data-group-id": groupId, "data-tab-id": tab.id }, copyLabel),
        h("button", { type: "button", class: "danger", "data-action": "delete-tab", "data-source": source, "data-group-id": groupId, "data-tab-id": tab.id }, "Delete")
      )
    )
  );
  return row;
}

function actionMenu(label, ...items) {
  return h(
    "details",
    { class: "action-menu" },
    h("summary", { role: "button", "aria-label": `${label} actions` }, label),
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

function visibleGroups() {
  return workspaceGroups().filter((group) => filterMatches(group) && groupMatchesQuery(group, searchQuery));
}

function visibleTabsForGroup(group) {
  if (!searchQuery || group.title.toLowerCase().includes(searchQuery.toLowerCase())) {
    return group.tabs;
  }
  return group.tabs.filter((tab) => tabMatchesQuery(tab, searchQuery));
}

function filterMatches(group) {
  if (activeFilter === "all") {
    return true;
  }
  if (activeFilter === "unfiled") {
    return !group.folderId;
  }
  if (activeFilter === "starred") {
    return group.starred || group.tabs.some((tab) => tab.starred);
  }
  if (activeFilter.startsWith("folder:")) {
    return group.folderId === activeFilter.slice("folder:".length);
  }
  return true;
}

function viewTitle() {
  const workspace = currentWorkspace();
  if (activeFilter === "unfiled") {
    return `${workspace.name} / Unfiled`;
  }
  if (activeFilter === "starred") {
    return `${workspace.name} / Starred`;
  }
  if (activeFilter.startsWith("folder:")) {
    const folder = state.folders.find((item) => item.id === activeFilter.slice("folder:".length));
    return `${workspace.name} / ${folder?.name || "Category"}`;
  }
  return `${workspace.name} / All items`;
}

function ensureActiveWorkspace() {
  const ids = new Set(state.workspaces.map((workspace) => workspace.id));
  if (!ids.has(activeWorkspaceId)) {
    activeWorkspaceId = state.activeWorkspaceId && ids.has(state.activeWorkspaceId)
      ? state.activeWorkspaceId
      : state.workspaces[0]?.id || DEFAULT_WORKSPACE_ID;
    localStorage.setItem("ziptab.activeWorkspaceId", activeWorkspaceId);
  }
  if (activeFilter.startsWith("folder:")) {
    const folderId = activeFilter.slice("folder:".length);
    const folder = state.folders.find((item) => item.id === folderId);
    if (!folder || folder.workspaceId !== activeWorkspaceId) {
      activeFilter = "all";
      localStorage.setItem("ziptab.activeFilter", activeFilter);
    }
  }
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

function currentFilterFolderId() {
  if (activeFilter.startsWith("folder:")) {
    return activeFilter.slice("folder:".length);
  }
  return null;
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
    renderActiveTabs();
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

async function addTextItemToGroup(groupId, itemType) {
  const label = itemType === ITEM_TODO ? "Todo" : "Note";
  const text = prompt(`${label} text`);
  if (!text) {
    return;
  }
  const record = itemType === ITEM_TODO ? createTodoRecord(text.trim()) : createNoteRecord(text.trim());
  await patchGroup(groupId, (group) => {
    group.tabs.unshift(record);
  });
}

async function editTabNote(ref) {
  const found = findTabRef(state, ref);
  const isTextItem = found?.tab?.itemType === ITEM_NOTE || found?.tab?.itemType === ITEM_TODO;
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
  activeFilter = "all";
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
    activeFilter = "all";
    localStorage.setItem("ziptab.activeFilter", activeFilter);
  }
}

function toggleSelection(source, groupId, tabId) {
  const key = keyFor(source, groupId, tabId);
  if (selected.has(key)) {
    selected.delete(key);
  } else {
    selected.add(key);
  }
  renderSelectionBar();
  renderGroups();
  renderQuickList();
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
  selected.clear();
  toast(`Restored ${result.restoredTabs || 0} tabs`);
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
  selected.clear();
}

async function starSelected() {
  const refs = selectedRefs();
  await updateState((draft) => {
    for (const ref of refs) {
      const found = findTabRef(draft, ref);
      if (found) {
        found.tab.starred = true;
      }
    }
    return draft;
  });
}

async function taskSelected() {
  const refs = selectedRefs();
  await updateState((draft) => {
    for (const ref of refs) {
      const found = findTabRef(draft, ref);
      if (found) {
        found.tab.taskStatus = TASK_OPEN;
      }
    }
    return draft;
  });
}

async function moveSelectedToQuickList() {
  const refs = selectedRefs();
  await updateState((draft) => {
    for (const ref of refs) {
      const tab = removeTabFromDraft(draft, ref);
      if (tab) {
        draft.quickList.unshift(tab);
      }
    }
    return draft;
  });
  selected.clear();
}

async function moveSelectedToNewGroup() {
  const refs = selectedRefs();
  const tabs = [];
  await updateState((draft) => {
    for (const ref of refs) {
      const tab = removeTabFromDraft(draft, ref);
      if (tab) {
        tabs.push(tab);
      }
    }
    if (tabs.length) {
      draft.groups.unshift(
        createGroupFromTabRecords(tabs, {
          workspaceId: activeWorkspaceId,
          folderId: currentFilterFolderId()
        })
      );
    }
    return draft;
  });
  selected.clear();
}

async function moveTabToQuick(ref, beforeTabId = "") {
  if (ref.source === "quick" && ref.tabId === beforeTabId) {
    return;
  }
  await updateState((draft) => {
    const tab = removeTabFromDraft(draft, ref);
    if (tab) {
      const index = beforeTabId ? draft.quickList.findIndex((item) => item.id === beforeTabId) : -1;
      if (index >= 0) {
        draft.quickList.splice(index, 0, tab);
      } else {
        draft.quickList.unshift(tab);
      }
    }
    return draft;
  });
}

async function moveTabToNewGroup(ref, folderId = currentFilterFolderId()) {
  await updateState((draft) => {
    const tab = removeTabFromDraft(draft, ref);
    if (tab) {
      draft.groups.unshift(createGroupFromTabRecords([tab], { workspaceId: activeWorkspaceId, folderId }));
    }
    return draft;
  });
}

async function moveTabToGroup(ref, targetGroupId, beforeTabId = "") {
  if (!targetGroupId) {
    return;
  }
  if (ref.source === "group" && ref.groupId === targetGroupId && ref.tabId === beforeTabId) {
    return;
  }
  await updateState((draft) => {
    const tab = removeTabFromDraft(draft, ref);
    const target = draft.groups.find((group) => group.id === targetGroupId);
    if (tab && target) {
      const index = beforeTabId ? target.tabs.findIndex((item) => item.id === beforeTabId) : -1;
      if (index >= 0) {
        target.tabs.splice(index, 0, tab);
      } else {
        target.tabs.push(tab);
      }
    }
    return draft;
  });
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
    source.folderId = target.folderId || null;
    source.workspaceId = target.workspaceId || activeWorkspaceId;
    const nextTargetIndex = draft.groups.findIndex((group) => group.id === targetGroupId);
    draft.groups.splice(nextTargetIndex, 0, source);
    return draft;
  });
}

async function moveGroupToCategory(groupId, folderId) {
  await updateState((draft) => {
    const group = draft.groups.find((item) => item.id === groupId);
    if (group) {
      group.folderId = folderId || null;
      group.workspaceId = activeWorkspaceId;
      group.updatedAt = nowIso();
    }
    return draft;
  });
}

async function mergeGroups(sourceGroupId, targetGroupId) {
  if (!sourceGroupId || !targetGroupId || sourceGroupId === targetGroupId) {
    return;
  }
  await updateState((draft) => {
    const source = draft.groups.find((group) => group.id === sourceGroupId);
    const target = draft.groups.find((group) => group.id === targetGroupId);
    if (!source || !target) {
      return draft;
    }
    target.tabs.push(...source.tabs);
    if (source.note) {
      target.note = [target.note, source.note].filter(Boolean).join("\n");
    }
    draft.groups = draft.groups.filter((group) => group.id !== sourceGroupId);
    return draft;
  });
}

async function setAllCollapsed(collapsed) {
  await updateState((draft) => {
    for (const group of draft.groups) {
      if (group.workspaceId !== activeWorkspaceId) {
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
  if (ref.source === "quick") {
    const tab = targetState.quickList.find((item) => item.id === ref.tabId);
    return tab ? { source: "quick", tab, group: null } : null;
  }
  const group = targetState.groups.find((item) => item.id === ref.groupId);
  const tab = group?.tabs.find((item) => item.id === ref.tabId);
  return group && tab ? { source: "group", group, tab } : null;
}

function removeTabFromDraft(draft, ref) {
  if (ref.source === "quick") {
    const index = draft.quickList.findIndex((tab) => tab.id === ref.tabId);
    if (index >= 0) {
      return draft.quickList.splice(index, 1)[0];
    }
    return null;
  }

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
  return [...selected].map(parseKey).filter(Boolean);
}

function clearMissingSelections() {
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

function taskLabel(status) {
  if (status === TASK_OPEN) {
    return "Task";
  }
  if (status === TASK_DONE) {
    return "Done";
  }
  return "Todo";
}

function openSearchModal() {
  const input = h("input", {
    type: "search",
    class: "modal-search",
    placeholder: "Search links, notes, todos",
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
              ? h("button", {
                  type: "button",
                  "data-action": "restore-tab",
                  "data-source": hit.source,
                  "data-group-id": hit.groupId,
                  "data-tab-id": tab.id
                }, "Open")
              : "",
            h("button", {
              type: "button",
              "data-action": "reveal-tab",
              "data-source": hit.source,
              "data-group-id": hit.groupId,
              "data-tab-id": tab.id
            }, "Reveal")
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
  for (const tab of state.quickList) {
    if (!normalized || tabMatchesQuery(tab, normalized)) {
      hits.push({ source: "quick", groupId: "", groupTitle: "Quick list", tab });
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
          h("button", { type: "button", "data-action": "restore-bin-item", "data-bin-id": entry.id }, "Restore"),
          h("button", { type: "button", class: "danger", "data-action": "discard-bin-item", "data-bin-id": entry.id }, "Discard")
        )
      )
    );
  }
  openModal(
    "Bin",
    [list],
    state.bin.length ? [h("button", { type: "button", class: "danger", "data-action": "clear-bin" }, "Clear bin")] : []
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
    activeFilter = found.group.folderId ? `folder:${found.group.folderId}` : "all";
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

function openSharePage(groups) {
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify(groups))));
  chrome.tabs.create({ url: chrome.runtime.getURL(`share.html#${payload}`) });
}

function openExportModal(groups) {
  const normalizedGroups = groups.length ? groups : state.groups;
  const text = groupsToText(normalizedGroups);
  const json = JSON.stringify({ exportedAt: nowIso(), groups: normalizedGroups }, null, 2);
  openModal("Export", [
    h("textarea", { rows: "14", readonly: "true" }, text),
    h("p", { class: "muted" }, `${normalizedGroups.length} groups`)
  ], [
    h("button", { type: "button", "data-modal-action": "copy-text" }, "Copy text"),
    h("button", { type: "button", "data-modal-action": "download-text" }, "Download text"),
    h("button", { type: "button", "data-modal-action": "download-json" }, "Download JSON")
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
  const textarea = h("textarea", { rows: "14", placeholder: "Title | https://example.com" });
  openModal("Import", [textarea], [h("button", { type: "button", class: "primary" }, "Import")]);
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

function openOneTabImportModal() {
  const textarea = h("textarea", {
    rows: "14",
    placeholder: "Paste OneTab export text here. Lists separated by blank lines will become separate ZipTab sessions."
  });
  const help = h(
    "div",
    { class: "import-help" },
    h("p", { class: "muted" }, "Chrome does not allow one extension to read another extension's private storage. Export from OneTab, then import the copied text here."),
    h("ol", {},
      h("li", {}, "Open OneTab and choose Export / Import URLs."),
      h("li", {}, "Copy the export text."),
      h("li", {}, "Click Paste & import, or paste it here and click Import.")
    )
  );
  openModal("Import from OneTab", [help, textarea], [
    h("button", { type: "button", "data-modal-action": "open-onetab" }, "Open OneTab"),
    h("button", { type: "button", "data-modal-action": "paste-onetab" }, "Paste & import"),
    h("button", { type: "button", class: "primary", "data-modal-action": "import-onetab-text" }, "Import")
  ]);

  els.modalActions.querySelector("[data-modal-action='open-onetab']").addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome-extension://chphlpgkkbolifaimnlloiipkdnihall/onetab.html" });
  });
  els.modalActions.querySelector("[data-modal-action='paste-onetab']").addEventListener("click", async () => {
    try {
      textarea.value = await navigator.clipboard.readText();
    } catch {
      toast("Clipboard read failed. Paste the OneTab export text manually.", true);
      textarea.focus();
      return;
    }
    await importOneTabText(textarea.value);
  });
  els.modalActions.querySelector("[data-modal-action='import-onetab-text']").addEventListener("click", async () => {
    await importOneTabText(textarea.value);
  });
}

async function importOneTabText(value) {
  const groups = parseOneTabText(value).map((group) => ({
    ...group,
    workspaceId: activeWorkspaceId
  }));
  if (!groups.length) {
    toast("No valid OneTab URLs found", true);
    return;
  }
  await updateState((draft) => {
    draft.groups.unshift(...groups);
    return draft;
  });
  els.modal.close();
  const tabCount = groups.reduce((total, group) => total + group.tabs.length, 0);
  toast(`Imported ${tabCount} tabs from OneTab`);
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
  return parseImportText(text);
}

function openModal(title, bodyNodes, actionNodes) {
  els.modalTitle.textContent = title;
  els.modalBody.replaceChildren(...bodyNodes);
  els.modalActions.replaceChildren(...actionNodes, h("button", { type: "submit" }, "Close"));
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
