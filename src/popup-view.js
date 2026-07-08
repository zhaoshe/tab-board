import { groupMatchesQuery, isRestorableTab } from "./model.js";

const MAX_POPUP_GROUPS = 5;

/**
 * @param {{ groups?: Array<{ id: string, title?: string, workspaceId?: string, folderId?: string | null, tabs?: Array<object> }>, query?: string }} view
 * @returns {{ quickActions: Array<{ id: string, label: string, action: string, icon: string }>, settingsAction: { action: string, icon: string }, emptyMessage: string, groups: Array<{ id: string, title: string, restorableCount: number, previewTabs: Array<{ title: string, url: string, favIconUrl: string }>, actions: string[] }> }}
 */
export function buildPopupViewModel(view = {}) {
  const groups = Array.isArray(view.groups) ? view.groups : [];
  const trimmedQuery = String(view.query || "").trim();
  const visibleGroups = groups
    .filter((group) => groupMatchesQuery(group, trimmedQuery))
    .slice(0, MAX_POPUP_GROUPS)
    .map((group) => {
      const tabs = Array.isArray(group.tabs) ? group.tabs : [];
      const restorableCount = tabs.filter(isRestorableTab).length;
      return {
        id: group.id,
        title: group.title || "Untitled session",
        restorableCount,
        previewTabs: tabs.map((tab) => ({
          title: tab.title || tab.url || "Untitled",
          url: tab.url || "",
          favIconUrl: tab.favIconUrl || ""
        })),
        actions: restorableCount ? ["restore", "delete"] : ["delete"]
      };
    });

  return {
    quickActions: [
      { id: "save", label: "Save", action: "capture-current-window", icon: "archive" },
      { id: "open", label: "Open", action: "open-manager", icon: "external-link" },
      { id: "dedupe", label: "Dedupe", action: "dedupe-current-window", icon: "copy" }
    ],
    settingsAction: { action: "open-options", icon: "settings" },
    emptyMessage: trimmedQuery ? `No sessions match “${trimmedQuery}”` : "No saved sessions yet",
    groups: visibleGroups
  };
}
