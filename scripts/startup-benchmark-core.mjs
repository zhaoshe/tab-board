const TIMESTAMP = '2026-01-01T00:00:00.000Z';
const WORKSPACE_ID = 'workspace_default';

export function createBenchmarkSchedule(selected, runs) {
  const oneRound = selected.flatMap(([scenario, configuration]) =>
    configuration.pages.map((page) => ({
      scenario,
      page,
      configuration,
    })));
  return Array.from({ length: runs }, (_, runIndex) => {
    const offset = oneRound.length ? runIndex % oneRound.length : 0;
    const round = [
      ...oneRound.slice(offset),
      ...oneRound.slice(0, offset),
    ];
    return round.map((entry) => ({ ...entry, runIndex }));
  }).flat();
}

export function createBenchmarkState({
  groupCount,
  tabsPerGroup,
  folderCount,
  archiveAll = false,
}) {
  const folders = Array.from({ length: folderCount }, (_, index) => ({
    id: `folder_${index}`,
    name: `Category ${index}`,
    color: 'slate',
    workspaceId: WORKSPACE_ID,
    collapsed: false,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  }));
  const groups = Array.from({ length: groupCount }, (_, groupIndex) => ({
    id: `group_${groupIndex}`,
    title: `Performance Session ${groupIndex}`,
    note: groupIndex % 5 === 0 ? `Session note ${groupIndex}` : '',
    workspaceId: WORKSPACE_ID,
    folderId: archiveAll
      ? null
      : folderCount > 0 && groupIndex % 4 === 0
        ? folders[groupIndex % folderCount].id
        : null,
    locked: groupIndex % 17 === 0,
    starred: archiveAll ? false : groupIndex % 13 === 0,
    archived: archiveAll ? true : groupIndex % 19 === 0,
    collapsed: false,
    tabs: Array.from({ length: tabsPerGroup }, (_, tabIndex) => ({
      id: `tab_${groupIndex}_${tabIndex}`,
      itemType: 'link',
      title: `Performance Tab ${groupIndex}-${tabIndex}`,
      url: `https://example.com/session/${groupIndex}/tab/${tabIndex}?query=performance`,
      favIconUrl: '',
      note: tabIndex % 7 === 0 ? `Tab note ${tabIndex}` : '',
      pinned: tabIndex === 0,
      incognito: false,
      starred: false,
      taskStatus: 'none',
      browserGroup: null,
      sourceWindowId: null,
      sourceTabId: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    })),
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  }));

  return {
    version: 1,
    mutationRevision: 1,
    workspaces: [{
      id: WORKSPACE_ID,
      name: 'Personal',
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    }],
    activeWorkspaceId: WORKSPACE_ID,
    groups,
    folders,
    categoryOrderByWorkspace: {
      [WORKSPACE_ID]: folders.map(({ id }) => id),
    },
    bin: [],
    dropOperationLedger: [],
    settings: {
      actionClick: 'store',
      closeTabsAfterSave: true,
      dedupeOnSave: true,
      deleteRestoredTabs: true,
      customUrlFilter: '',
      excludePinned: false,
      focusRestoredTabs: true,
      includeChromeUrls: false,
      includeFileUrls: false,
      openManagerAfterSave: true,
      restoreGroupsInNewWindow: false,
      restoreNextToCurrent: true,
      theme: 'system',
      confirmBeforeDestructive: true,
      storageMode: 'browser',
      storageFolderName: '',
    },
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

export function median(values) {
  if (!values.length) {
    throw new Error('median requires at least one sample');
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function summarizeRuns(runs) {
  return {
    runs: runs.length,
    medianUsefulMs: median(runs.map(({ usefulMs }) => usefulMs)),
    medianRootMs: median(runs.map(({ rootMs }) => rootMs)),
    medianStateReadEndMs: median(runs.map(({ stateReadEndMs }) => stateReadEndMs)),
    medianProjectionReadEndMs: median(
      runs.map(({ projectionReadEndMs }) => projectionReadEndMs),
    ),
    medianCards: median(runs.map(({ cards }) => cards)),
    medianShells: median(runs.map(({ shells }) => shells)),
    medianSlots: median(runs.map(({ slots }) => slots)),
    medianRows: median(runs.map(({ rows }) => rows)),
    maxListOpenTabsCalls: Math.max(...runs.map(({ listOpenTabsCalls }) => listOpenTabsCalls)),
    maxLongestTaskMs: Math.max(...runs.map(({ longestTaskMs }) => longestTaskMs)),
  };
}
