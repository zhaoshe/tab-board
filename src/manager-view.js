const SESSION_ACTION_MENU_IDS = ["rename", "note", "lock", "copy", "delete"];

/**
 * @param {{ windows?: Array<{ id: number, focused?: boolean, tabs?: Array<object> }>, selectedWindowId?: number | null }} view
 * @returns {Array<{ id: number, focused: boolean, expanded: boolean, tabCount: number, tabs: Array<object> }>}
 */
export function buildOpenWindowsModel({ windows = [], selectedWindowId = null } = {}) {
  const hasSelectedWindow = windows.some((window) => window.id === selectedWindowId);
  const fallbackId =
    (hasSelectedWindow ? selectedWindowId : null) ||
    windows.find((window) => window.focused)?.id ||
    windows[0]?.id ||
    null;
  return windows.map((window) => ({
    id: window.id,
    focused: Boolean(window.focused),
    expanded: window.id === fallbackId,
    tabCount: Array.isArray(window.tabs) ? window.tabs.length : 0,
    tabs: Array.isArray(window.tabs) ? window.tabs : []
  }));
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
