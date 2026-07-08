const SESSION_ACTION_MENU_IDS = ["rename", "note", "lock", "copy", "delete"];

/**
 * @param {{ windows?: Array<{ id: number, focused?: boolean, tabs?: Array<object> }>, selectedWindowId?: number | null }} view
 * @returns {Array<{ id: number, focused: boolean, expanded: boolean, tabCount: number, tabs: Array<object> }>}
 */
export function buildOpenWindowsModel({ windows = [], selectedWindowId = null } = {}) {
  const fallbackId = selectedWindowId || windows.find((window) => window.focused)?.id || windows[0]?.id || null;
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
 * @param {{ sourceGroupId?: string, targetGroupId?: string, edge?: string }} indicator
 * @returns {{ showInsertLine: boolean, edge: string }}
 */
export function getGroupDropIndicator({ sourceGroupId = "", targetGroupId = "", edge = "" } = {}) {
  return {
    showInsertLine: Boolean(edge) && sourceGroupId !== targetGroupId,
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
