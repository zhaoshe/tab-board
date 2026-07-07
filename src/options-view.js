export function buildSettingsSections() {
  return {
    basic: [
      { key: "actionClick", card: "toolbar" },
      { key: "closeTabsAfterSave", card: "capture" },
      { key: "openManagerAfterSave", card: "capture" },
      { key: "deleteRestoredTabs", card: "restore" },
      { key: "restoreGroupsInNewWindow", card: "restore" },
      { key: "restoreNextToCurrent", card: "restore" },
      { key: "focusRestoredTabs", card: "restore" },
      { key: "theme", card: "interface" }
    ],
    advanced: [
      { key: "includePinnedTabs", card: "capture" },
      { key: "includeChromeUrls", card: "capture" },
      { key: "includeFileUrls", card: "capture" },
      { key: "dedupeOnSave", card: "capture" },
      { key: "confirmDestructive", card: "interface" },
      { key: "showFavicons", card: "interface" },
      { key: "sessionToolbar", card: "interface" }
    ]
  };
}
