const SESSION_ACTION_MENU_IDS = ["rename", "note", "lock", "copy", "delete"];

/**
 * @param {{ workspaceName?: string, categoryLabel?: string, searchQuery?: string, openTabTitle?: string }} view
 * @returns {{ kind: string, label: string }[]}
 */
export function buildContextStripItems(view = {}) {
  const items = [];
  appendChip(items, "workspace", view.workspaceName);
  appendChip(items, "category", view.categoryLabel);
  appendChip(items, "search", view.searchQuery, "Search");
  appendChip(items, "open-tab", view.openTabTitle, "Filtered by tab");
  return items;
}

/**
 * @param {{ group?: { title?: string, note?: string } | null, categoryLabel?: string, restorableCount?: number }} view
 * @returns {{ state: "empty", title: string, message: string } | { state: "focused", title: string, meta: string, note: string, categoryLabel: string, restorableCount: number }}
 */
export function buildInspectorModel(view = {}) {
  if (!view.group) {
    return {
      state: "empty",
      title: "Pick a session",
      message: "Select a session to inspect, edit, and restore it."
    };
  }

  const categoryLabel = normalizeText(view.categoryLabel) || "Inbox";
  const restorableCount = Number.isFinite(view.restorableCount) ? view.restorableCount : 0;
  const title = normalizeText(view.group.title) || "Untitled session";
  return {
    state: "focused",
    title,
    meta: `${restorableCount} restorable links · ${categoryLabel}`,
    note: normalizeText(view.group.note),
    categoryLabel,
    restorableCount
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

function appendChip(items, kind, value, prefix = "") {
  const label = normalizeText(value);
  if (!label) {
    return;
  }
  items.push({
    kind,
    label: prefix ? `${prefix}: ${label}` : label
  });
}

function normalizeText(value) {
  return String(value || "").trim();
}
