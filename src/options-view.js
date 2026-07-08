export function buildSettingsSections() {
  return {
    basic: [
      { key: "actionClick", card: "toolbar" },
      { key: "closeTabsAfterSave", card: "capture" },
      { key: "openManagerAfterSave", card: "capture" },
      { key: "dedupeOnSave", card: "capture" },
      { key: "deleteRestoredTabs", card: "restore" },
      { key: "restoreGroupsInNewWindow", card: "restore" },
      { key: "restoreNextToCurrent", card: "restore" },
      { key: "focusRestoredTabs", card: "restore" },
      { key: "theme", card: "interface" }
    ],
    advanced: [
      { key: "includePinnedTabs", card: "capture" },
      { key: "excludeUrlPatterns", card: "capture-edge-cases" }
    ],
    capture: [{ key: "dedupeOnSave", card: "capture" }],
    captureEdgeCases: [{ key: "excludeUrlPatterns", card: "capture-edge-cases" }]
  };
}
