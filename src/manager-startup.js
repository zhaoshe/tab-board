/**
 * Starts the Manager shell before optional integrations and persisted state finish loading.
 * @param {{
 *   initialState: object,
 *   prepareShell?: () => void,
 *   render: (state?: object) => void,
 *   loadOpenTabs: () => Promise<void>,
 *   loadState: () => Promise<object>,
 *   applyState: (state: object) => void,
 *   migrate: () => Promise<void>,
 *   initializePopover: () => void,
 *   onLoaded?: () => void,
 *   getStateRevision?: () => number,
 *   onStartupError: (stage: string, error: unknown) => void
 * }} options
 * @returns {Promise<void>}
 */
/**
 * @param {{ target?: unknown, detail?: { item?: { value?: unknown } } }} event
 * @param {unknown} windowSelect
 * @returns {{ selectedOpenWindowId: number|null, clearSelection: true, render: true }|null}
 */
export function captureOpenTabsSelectionSnapshot({
  selectedTabIds = [],
  selectedWindowId = null,
  selectMode = false,
  workspaceId = null
} = {}) {
  return {
    selectedTabIds: [...(selectedTabIds || [])].map((tabId) => String(tabId)).sort(),
    selectedWindowId: selectedWindowId ?? null,
    selectMode: Boolean(selectMode),
    workspaceId: workspaceId ?? null
  };
}

export function isSameOpenTabsSelectionSnapshot(left, right) {
  const normalizedLeft = captureOpenTabsSelectionSnapshot(left);
  const normalizedRight = captureOpenTabsSelectionSnapshot(right);
  return (
    normalizedLeft.selectedWindowId === normalizedRight.selectedWindowId &&
    normalizedLeft.selectMode === normalizedRight.selectMode &&
    normalizedLeft.workspaceId === normalizedRight.workspaceId &&
    normalizedLeft.selectedTabIds.length === normalizedRight.selectedTabIds.length &&
    normalizedLeft.selectedTabIds.every((tabId, index) => tabId === normalizedRight.selectedTabIds[index])
  );
}

/**
 * @param {{ isCaptureCommitted?: boolean, isCaptureReconciled?: boolean, isSelectionCurrent?: boolean }} outcome
 * @returns {{ isSaved: boolean, shouldClearSelection: boolean, shouldShowSuccess: boolean }}
 */
export function getCaptureOutcome({
  isCaptureCommitted = false,
  isCaptureReconciled = false,
  isSelectionCurrent = false
} = {}) {
  const isSaved = Boolean(isCaptureCommitted);
  return {
    isSaved,
    shouldClearSelection: isSaved && Boolean(isSelectionCurrent),
    shouldShowSuccess: isSaved && Boolean(isCaptureReconciled)
  };
}

/**
 * @param {unknown} cause
 * @returns {Error}
 */
export function createCaptureReconciliationError(cause) {
  const error = new Error("Session was saved, but ZipTab could not locate it.");
  error.cause = cause;
  return error;
}

export function getOpenWindowSelection(event, windowSelect) {
  if (event.target !== windowSelect) {
    return null;
  }
  const value = String(event.detail?.item?.value ?? event.target?.value ?? "");
  return {
    selectedOpenWindowId: Number(value) || null,
    clearSelection: true,
    render: true
  };
}

export async function startManager({
  initialState,
  prepareShell = () => {},
  render,
  loadOpenTabs,
  loadState,
  applyState,
  migrate,
  initializePopover,
  onLoaded = () => {},
  getStateRevision = () => 0,
  onStartupError
}) {
  try {
    prepareShell();
    render(initialState);
  } catch (error) {
    onStartupError("shell", error);
    return;
  }
  try {
    void Promise.resolve(loadOpenTabs()).catch((error) => onStartupError("open-tabs", error));
  } catch (error) {
    onStartupError("open-tabs", error);
  }

  try {
    initializePopover();
  } catch (error) {
    onStartupError("popover", error);
  }

  const loadRevision = getStateRevision();
  let loadedState;
  try {
    loadedState = await loadState();
  } catch (error) {
    onStartupError("state", error);
    return;
  }

  if (getStateRevision() === loadRevision) {
    try {
      applyState(loadedState);
    } catch (error) {
      onStartupError("loaded", error);
    }
  }

  if (getStateRevision() === loadRevision) {
    try {
      await migrate();
    } catch (error) {
      onStartupError("migration", error);
    }
  }

  try {
    render();
  } catch (error) {
    onStartupError("loaded", error);
    return;
  }

  try {
    onLoaded();
  } catch (error) {
    onStartupError("loaded", error);
  }
}
