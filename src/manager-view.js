import { tabMatchesQuery } from "./model.js";

const SESSION_ACTION_MENU_IDS = ["add", "rename", "note", "lock", "copy", "delete"];

/**
 * @param {string[]} categoryIds
 * @param {string[]} savedOrder
 * @returns {string[]}
 */
export function buildOrderedCategoryIds(categoryIds = [], savedOrder = []) {
  const available = [...new Set(Array.isArray(categoryIds) ? categoryIds : [])];
  const saved = [...new Set(Array.isArray(savedOrder) ? savedOrder : [])].filter((id) => available.includes(id));
  return [...saved, ...available.filter((id) => !saved.includes(id))];
}

/**
 * @param {string[]} categoryIds
 * @param {string} sourceCategoryId
 * @param {string} targetCategoryId
 * @param {"before" | "after"} placement
 * @returns {string[]}
 */
export function reorderCategoryIds(categoryIds = [], sourceCategoryId = "", targetCategoryId = "", placement = "before") {
  const current = [...new Set(Array.isArray(categoryIds) ? categoryIds : [])];
  if (
    !sourceCategoryId ||
    !targetCategoryId ||
    sourceCategoryId === targetCategoryId ||
    !current.includes(sourceCategoryId) ||
    !current.includes(targetCategoryId)
  ) {
    return current;
  }
  const withoutSource = current.filter((id) => id !== sourceCategoryId);
  const targetIndex = withoutSource.indexOf(targetCategoryId);
  if (targetIndex < 0) {
    return current;
  }
  const insertionIndex = placement === "after" ? targetIndex + 1 : targetIndex;
  return [
    ...withoutSource.slice(0, insertionIndex),
    sourceCategoryId,
    ...withoutSource.slice(insertionIndex)
  ];
}

/**
 * @param {string[]} categoryIds
 * @param {string} categoryId
 * @returns {string[]}
 */
export function removeCategoryIdFromOrder(categoryIds = [], categoryId = "") {
  return (Array.isArray(categoryIds) ? categoryIds : []).filter((id) => id !== categoryId);
}

/**
 * @param {{ windows?: Array<{ id: number, focused?: boolean, tabCount?: number, tabs?: Array<object> }>, selectedWindowId?: number | null }} view
 * @returns {Array<{ id: number, focused: boolean, expanded: boolean, selected: boolean, tabCount: number, tabs: Array<object> }>}
 */
export function buildOpenWindowsModel({ windows = [], selectedWindowId = null } = {}) {
  const hasSelectedWindow = windows.some((window) => window.id === selectedWindowId);
  const fallbackId =
    (hasSelectedWindow ? selectedWindowId : null) ||
    windows.find((window) => window.focused)?.id ||
    windows[0]?.id ||
    null;
  return windows.map((window, index) => {
    const tabs = Array.isArray(window.tabs) ? window.tabs : [];
    const hasValidTabCount = Number.isSafeInteger(window.tabCount) && window.tabCount >= tabs.length;
    const tabCount = hasValidTabCount ? window.tabCount : tabs.length;
    const ordinal = index + 1;
    const tabLabel = `${tabCount} tab${tabCount === 1 ? "" : "s"}`;
    return {
      id: window.id,
      focused: Boolean(window.focused),
      expanded: window.id === fallbackId,
      selected: window.id === fallbackId,
      tabCount,
      tabs,
      label: `Window ${ordinal} · ${tabCount}`,
      accessibleLabel: `Window ${ordinal}, ${tabLabel}${window.focused ? ", active browser window" : ""}`
    };
  });
}

/**
 * @param {{ workspaces?: Array<{ id: string, name: string }>, activeWorkspaceId?: string, savedTabCount?: number, groupCount?: number }} view
 * @returns {{ label: string, stats: string, options: Array<{ id: string, label: string, selected: boolean }>, actions: string[] }}
 */
export function buildWorkspaceMenuModel({
  workspaces = [],
  activeWorkspaceId = "",
  savedTabCount = 0,
  groupCount = 0
} = {}) {
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) || workspaces[0];
  const stats = buildWorkspaceStatsPresentation({ savedTabCount, groupCount });
  return {
    label: activeWorkspace?.name || "Workspace",
    stats: stats.tooltip,
    options: workspaces.map((workspace) => ({
      id: workspace.id,
      label: workspace.name,
      selected: workspace.id === activeWorkspace?.id
    })),
    actions: ["create-workspace", "rename-workspace"]
  };
}

/**
 * @param {{ savedTabCount?: number, groupCount?: number }} stats
 * @returns {{ tooltip: string, secondaryText: string }}
 */
export function buildWorkspaceStatsPresentation({ savedTabCount = 0, groupCount = 0 } = {}) {
  const safeSavedTabCount = Number.isFinite(Number(savedTabCount)) ? Number(savedTabCount) : 0;
  const safeGroupCount = Number.isFinite(Number(groupCount)) ? Number(groupCount) : 0;
  const tabLabel = `${safeSavedTabCount} saved tab${safeSavedTabCount === 1 ? "" : "s"}`;
  const sessionLabel = `${safeGroupCount} session${safeGroupCount === 1 ? "" : "s"}`;
  return {
    tooltip: `${tabLabel} · ${sessionLabel}`,
    secondaryText: `${safeSavedTabCount} tab${safeSavedTabCount === 1 ? "" : "s"} · ${sessionLabel}`
  };
}

/**
 * @param {{ itemType?: string, url?: string, favIconUrl?: string }} tab
 * @param {{ hasImageError?: boolean }} options
 * @returns {{ kind: "image", src: string, fallbackIcon: string } | { kind: "icon", icon: string }}
 */
export function buildFaviconSlotModel(tab = {}, { hasImageError = false } = {}) {
  if (tab.itemType === "note") {
    return { kind: "icon", icon: "sticky-note" };
  }
  if (tab.favIconUrl && !hasImageError) {
    return { kind: "image", src: String(tab.favIconUrl), fallbackIcon: "globe-alt" };
  }
  return {
    kind: "icon",
    icon: tab.url ? "globe-alt" : "file-text"
  };
}

/**
 * @param {{ id?: string, filter?: string, label?: string, count?: number, folder?: { id?: string } | null }} category
 * @returns {{ id: string, filter: string, label: string, count: number, folderId: string, builtIn: boolean, editable: boolean }}
 */
export function buildCategoryItemModel(category = {}) {
  const folderId = String(category.folder?.id || "");
  return {
    id: String(category.id || category.filter || ""),
    filter: String(category.filter || "inbox"),
    label: String(category.label || "Category"),
    count: Number.isFinite(Number(category.count)) ? Number(category.count) : 0,
    folderId,
    builtIn: !folderId,
    editable: Boolean(folderId)
  };
}

/**
 * @param {{ windows?: Array<object>, selectedWindowId?: number | null, query?: string }} view
 * @returns {{ window: { id: number, label: string, accessibleLabel: string, tabCount: number } | null, tabs: Array<object>, searchAction: string }}
 */
export function buildSidebarRailModel({ windows = [], selectedWindowId = null, query = "" } = {}) {
  const selectedWindow = buildOpenWindowsModel({ windows, selectedWindowId }).find((windowInfo) => windowInfo.selected);
  if (!selectedWindow) {
    return { window: null, tabs: [], searchAction: "focus-open-tabs-filter" };
  }
  const tabs = sortOpenTabs(filterOpenTabs(selectedWindow.tabs, query)).map((tab) => ({
    id: tab.id,
    title: tab.title || tab.url || "Untitled tab",
    active: Boolean(tab.active),
    pinned: Boolean(tab.pinned),
    storable: isStorableOpenTab(tab),
    icon: buildFaviconSlotModel(tab)
  }));
  return {
    window: {
      id: selectedWindow.id,
      label: selectedWindow.label,
      accessibleLabel: selectedWindow.accessibleLabel,
      tabCount: selectedWindow.tabCount
    },
    tabs,
    searchAction: "focus-open-tabs-filter"
  };
}

/**
 * @param {{ title?: string, tabs?: Array<object>, locked?: boolean }} group
 * @returns {{ title: string, metaText: string, itemCount: number, statusLabels: string[] }}
 */
export function buildSessionHeaderModel(group = {}) {
  const tabs = Array.isArray(group.tabs) ? group.tabs : [];
  const cardView = buildSessionCardView(group);
  return {
    title: String(group.title || "Untitled session"),
    metaText: cardView.metaText,
    itemCount: tabs.length,
    statusLabels: group.locked ? ["Locked"] : []
  };
}

/**
 * @param {{ id?: string | number, itemType?: string, title?: string, url?: string, note?: string, createdAt?: string, favIconUrl?: string }} tab
 * @param {{ context?: string }} options
 * @returns {{ id: string, context: string, title: string, url: string, domain: string, note: string, savedAt: string, icon: object }}
 */
export function buildTabInfoPopoverModel(tab = {}, { context = "saved" } = {}) {
  const url = String(tab.url || "");
  let domain = "";
  if (url) {
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = "";
    }
  }
  return {
    id: String(tab.id || ""),
    context: String(context || "saved"),
    title: String(tab.title || url || "Untitled"),
    url,
    domain,
    note: String(tab.note || ""),
    savedAt: String(tab.createdAt || ""),
    icon: buildFaviconSlotModel(tab)
  };
}

/**
 * @param {{ kind?: string, selectionMode?: boolean }} view
 * @returns {string[]}
 */
export function buildRowActionModel({ kind = "saved", selectionMode = false } = {}) {
  if (selectionMode) {
    return ["select"];
  }
  return kind === "open" ? ["close"] : ["more"];
}

/**
 * @param {{ isUserAction?: boolean, focusedRef?: string, targetRef?: string }} intent
 * @returns {boolean}
 */
export function shouldRestoreSavedTabSelectionFocus({ isUserAction = false, focusedRef = "", targetRef = "" } = {}) {
  return Boolean(isUserAction && focusedRef && focusedRef === targetRef);
}

/**
 * @param {Array<{ index?: number }>} tabs
 * @returns {Array<object>}
 */
export function sortOpenTabs(tabs = []) {
  return [...tabs].sort((left, right) => {
    const leftIndex = Number.isFinite(Number(left.index)) ? Number(left.index) : Number.MAX_SAFE_INTEGER;
    const rightIndex = Number.isFinite(Number(right.index)) ? Number(right.index) : Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}

/**
 * @param {Array<{ title?: string, url?: string }>} tabs
 * @param {string} query
 * @returns {Array<object>}
 */
export function filterOpenTabs(tabs = [], query = "") {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return tabs;
  }
  return tabs.filter((tab) =>
    [tab.title, tab.url]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery))
  );
}

/**
 * @param {{ storable?: boolean } | null | undefined} tab
 * @returns {boolean}
 */
export function isStorableOpenTab(tab) {
  return tab?.storable === true;
}

/**
 * @param {{ storable?: boolean, url?: string } | null | undefined} tab
 * @returns {string}
 */
export function getOpenTabStatusMessage(tab) {
  if (isStorableOpenTab(tab)) {
    return "";
  }
  return tab?.url ? "Cannot save this tab" : "No usable URL";
}

/**
 * @param {{ openedByKeyboard?: boolean, triggerId?: string | number }} intent
 * @returns {boolean}
 */
export function shouldRestoreOpenTabContextFocus({ openedByKeyboard = false, triggerId = "" } = {}) {
  return Boolean(openedByKeyboard && String(triggerId || ""));
}

/**
 * @param {{ isUserAction?: boolean, focusedTabId?: string | number, targetTabId?: string | number }} intent
 * @returns {boolean}
 */
export function shouldRestoreOpenTabSelectionFocus({ isUserAction = false, focusedTabId = "", targetTabId = "" } = {}) {
  return Boolean(isUserAction && String(focusedTabId || "") === String(targetTabId || ""));
}

/**
 * @param {{ detail?: number, isTrusted?: boolean }} event
 * @returns {boolean}
 */
export function shouldRestoreKeyboardFocus({ detail = 1, isTrusted = true } = {}) {
  return detail === 0 && isTrusted !== false;
}

/**
 * @param {{ key?: string, shiftKey?: boolean }} event
 * @returns {boolean}
 */
export function isContextMenuKey(event = {}) {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey === true);
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isRenameActivationKey(key) {
  return key === "Enter" || key === "F2" || key === " ";
}

/**
 * @param {number} currentIndex
 * @param {number} itemCount
 * @param {"up" | "down"} direction
 * @returns {number}
 */
export function getMenuItemNavigationIndex(currentIndex, itemCount, direction) {
  if (!Number.isInteger(itemCount) || itemCount <= 0) {
    return -1;
  }
  const step = direction === "up" ? -1 : 1;
  const start = Number.isInteger(currentIndex) ? currentIndex : step > 0 ? -1 : 0;
  return (start + step + itemCount) % itemCount;
}

/**
 * @param {Iterable<string | number>} selectedIds
 * @param {Array<{ id?: string | number, storable?: boolean }>} tabs
 * @returns {string[]}
 */
export function filterStorableOpenTabIds(selectedIds = [], tabs = []) {
  const storableIds = new Set(tabs.filter(isStorableOpenTab).map((tab) => String(tab.id)));
  return [...selectedIds].filter((id) => storableIds.has(String(id)));
}

/**
 * @param {number} ratio
 * @returns {"insert-before" | "add-to-session" | "insert-after"}
 */
export function getSessionDropZone(ratio) {
  if (ratio < 0.25) {
    return "insert-before";
  }
  if (ratio > 0.75) {
    return "insert-after";
  }
  return "add-to-session";
}

/**
 * @param {Array<{ left: number, top: number, width: number, height: number }>} rects
 * @param {{ x: number, y: number }} point
 * @param {"x" | "y"} axis
 * @returns {{ targetIndex: number, placement: "before" | "after" } | null}
 */
export function getGroupReorderTarget(rects, point, axis = "x") {
  const infos = rects.map((rect, index) => ({
    index,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2
  }));
  if (!infos.length) {
    return null;
  }
  if (axis === "y") {
    const beforeCard = infos.find((info) => point.y < info.centerY);
    if (beforeCard) {
      return { targetIndex: beforeCard.index, placement: "before" };
    }
    return { targetIndex: infos[infos.length - 1].index, placement: "after" };
  }

  const rows = infos.reduce((result, info) => {
    const currentRow = result[result.length - 1];
    if (!currentRow || !isSameGroupRow(currentRow.cards[0], info)) {
      return [...result, createGroupRow(info)];
    }
    return [...result.slice(0, -1), appendGroupRow(currentRow, info)];
  }, []);
  const matchingRow =
    rows.find((row) => point.y >= row.top && point.y <= row.bottom) ||
    rows.reduce((nearest, row) => {
      if (!nearest) {
        return row;
      }
      const nearestDistance = Math.abs(point.y - nearest.centerY);
      const rowDistance = Math.abs(point.y - row.centerY);
      return rowDistance < nearestDistance ? row : nearest;
    }, null);
  const beforeCard = matchingRow.cards.find((info) => point.x < info.centerX);
  if (beforeCard) {
    return { targetIndex: beforeCard.index, placement: "before" };
  }
  return { targetIndex: matchingRow.cards[matchingRow.cards.length - 1].index, placement: "after" };
}

/**
 * @param {number} sourceIndex
 * @param {number} targetIndex
 * @param {number} ratio
 * @returns {"before" | "after"}
 */
export function getGroupCardDropPlacement(sourceIndex, targetIndex, ratio = 0.5) {
  const zone = getSessionDropZone(ratio);
  if (zone === "insert-before") {
    return "before";
  }
  if (zone === "insert-after") {
    return "after";
  }
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
    return "before";
  }
  return sourceIndex < targetIndex ? "after" : "before";
}

/**
 * @param {{ left: number, right: number }} rect
 * @param {number} x
 * @param {number} margin
 * @returns {boolean}
 */
export function isPointInMiddleHalfWithMargin(rect, x, margin = 0) {
  const width = rect.right - rect.left;
  if (!width) {
    return true;
  }
  return x >= rect.left + width * 0.25 - margin && x <= rect.left + width * 0.75 + margin;
}

function createGroupRow(info) {
  return {
    cards: [info],
    top: info.top,
    bottom: info.bottom,
    centerY: info.centerY
  };
}

function appendGroupRow(row, info) {
  const cards = [...row.cards, info];
  return {
    cards,
    top: Math.min(row.top, info.top),
    bottom: Math.max(row.bottom, info.bottom),
    centerY: cards.reduce((total, card) => total + card.centerY, 0) / cards.length
  };
}

function isSameGroupRow(left, right) {
  return Math.abs(left.centerY - right.centerY) < Math.min(left.height, right.height) / 2;
}

/**
 * @param {{ sourceGroupId?: string, targetGroupId?: string, edge?: string }} indicator
 * @returns {{ showInsertLine: boolean, edge: string }}
 */
export function getGroupDropIndicator({ sourceGroupId = "", targetGroupId = "", edge = "" } = {}) {
  const isSameGroup = Boolean(sourceGroupId) && sourceGroupId === targetGroupId;
  return {
    showInsertLine: Boolean(edge) && !isSameGroup,
    edge
  };
}

/**
 * @param {{ top: number, right: number, bottom: number }} anchorRect
 * @param {{ width: number, height: number }} menuRect
 * @param {{ width: number, height: number }} viewport
 * @param {number} gap
 * @param {number} margin
 * @returns {{ top: number, left: number }}
 */
export function getFloatingMenuPosition(anchorRect, menuRect, viewport, gap = 6, margin = 12) {
  const maxLeft = Math.max(margin, viewport.width - menuRect.width - margin);
  const left = Math.min(maxLeft, Math.max(margin, anchorRect.right - menuRect.width));
  const below = anchorRect.bottom + gap;
  const above = anchorRect.top - menuRect.height - gap;
  const preferredTop = below + menuRect.height <= viewport.height - margin ? below : above;
  const maxTop = Math.max(margin, viewport.height - menuRect.height - margin);
  return {
    top: Math.min(maxTop, Math.max(margin, preferredTop)),
    left
  };
}

/**
 * @param {{ starred?: boolean, folderId?: string | null }} group
 * @returns {string}
 */
export function getBoardCategoryFilter(group = {}) {
  if (group.starred) {
    return "starred";
  }
  return group.folderId ? `folder:${group.folderId}` : "inbox";
}

/**
 * @param {{ tabs?: Array<{ itemType?: string, url?: string, favIconUrl?: string }>, locked?: boolean, starred?: boolean }} group
 * @param {{ faviconLimit?: number }} options
 * @returns {{ restorableCount: number, noteCount: number, faviconTabs: Array<{ favIconUrl?: string }>, overflowCount: number, statusLabels: string[], metaText: string }}
 */
export function buildSessionCardView(group = {}, { faviconLimit = 4 } = {}) {
  const tabs = Array.isArray(group.tabs) ? group.tabs : [];
  const restorableTabs = tabs.filter((tab) => tab?.itemType === "link" && Boolean(tab?.url));
  const noteCount = tabs.filter((tab) => tab?.itemType === "note").length;
  const faviconTabs = restorableTabs.filter((tab) => tab.favIconUrl).slice(0, faviconLimit);
  const metaItems = [`${restorableTabs.length} link${restorableTabs.length === 1 ? "" : "s"}`];
  if (noteCount) {
    metaItems.push(`${noteCount} note${noteCount === 1 ? "" : "s"}`);
  }
  return {
    restorableCount: restorableTabs.length,
    noteCount,
    faviconTabs,
    overflowCount: Math.max(0, restorableTabs.length - faviconTabs.length),
    statusLabels: [group.locked ? "Locked" : "", group.starred ? "Starred" : ""].filter(Boolean),
    metaText: metaItems.join(" · ")
  };
}

/**
 * @param {{ title?: string, tabs?: Array<object> }} group
 * @param {string} query
 * @returns {Array<object>}
 */
export function getVisibleGroupTabs(group = {}, query = "") {
  const tabs = Array.isArray(group.tabs) ? group.tabs : [];
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery || String(group.title || "").toLowerCase().includes(normalizedQuery)) {
    return tabs;
  }
  return tabs.filter((tab) => tabMatchesQuery(tab, normalizedQuery));
}

/**
 * @param {number} restorableCount
 * @returns {{ external: string[], menu: string[] }}
 */
export function getSessionActionLayout(restorableCount = 0) {
  return {
    external: restorableCount > 0 ? ["restore"] : [],
    menu: [...SESSION_ACTION_MENU_IDS]
  };
}

/**
 * @param {object} changeInfo
 * @returns {boolean}
 */
export function shouldRefreshOpenTabsForChange(changeInfo = {}) {
  return Boolean(
    changeInfo.status ||
      changeInfo.title ||
      changeInfo.url ||
      changeInfo.pendingUrl ||
      changeInfo.favIconUrl ||
      typeof changeInfo.groupId !== "undefined" ||
      typeof changeInfo.pinned !== "undefined"
  );
}
