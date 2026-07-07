import { groupMatchesQuery, isRestorableTab } from "./model.js";

const MAX_POPUP_GROUPS = 5;

/**
 * @param {{ groups?: Array<{ id: string, title?: string, tabs?: Array<object> }>, query?: string }} view
 * @returns {{ primaryActionLabel: string, secondaryActionLabel: string, emptyMessage: string, groups: Array<{ id: string, title: string, restorableCount: number }> }}
 */
export function buildPopupViewModel(view = {}) {
  const groups = Array.isArray(view.groups) ? view.groups : [];
  const trimmedQuery = String(view.query || "").trim();
  const visibleGroups = groups
    .filter((group) => groupMatchesQuery(group, trimmedQuery))
    .slice(0, MAX_POPUP_GROUPS)
    .map((group) => ({
      id: group.id,
      title: group.title || "Untitled session",
      restorableCount: Array.isArray(group.tabs) ? group.tabs.filter(isRestorableTab).length : 0
    }));

  return {
    primaryActionLabel: "Save window",
    secondaryActionLabel: "Open workspace",
    emptyMessage: trimmedQuery ? `No sessions match “${trimmedQuery}”` : "No saved sessions yet",
    groups: visibleGroups
  };
}
