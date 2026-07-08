export function formatSaveFeedback(count) {
  return `Saved ${count} tab${count === 1 ? "" : "s"}`;
}

export function formatCaptureFeedback({ storedTabs = 0, cleanedDuplicates = 0, closedBlankTabs = 0 } = {}) {
  const parts = [`Saved ${storedTabs} tab${storedTabs === 1 ? "" : "s"}`];
  if (cleanedDuplicates) {
    parts.push(`cleaned ${cleanedDuplicates} duplicate${cleanedDuplicates === 1 ? "" : "s"}`);
  }
  if (closedBlankTabs) {
    parts.push(`closed ${closedBlankTabs} blank`);
  }
  return parts.join(" · ");
}

export function formatRestoreFeedback({ restored, failed = 0 }) {
  if (!failed) {
    return `Restored ${restored} tab${restored === 1 ? "" : "s"}`;
  }
  return `Restored ${restored} tabs · ${failed} failed and stayed saved`;
}

export function formatSettingsSavedMessage() {
  return "Settings saved";
}
