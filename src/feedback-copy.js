export function formatSaveFeedback(count) {
  return `Saved ${count} tab${count === 1 ? "" : "s"}`;
}

export function formatCaptureFeedback({ storedTabs = 0, cleanedDuplicates = 0 } = {}) {
  const parts = [`Saved ${storedTabs} tab${storedTabs === 1 ? "" : "s"}`];
  if (cleanedDuplicates) {
    parts.push(`cleaned ${cleanedDuplicates} duplicate${cleanedDuplicates === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

export function hasCaptureFeedback({ storedTabs = 0, cleanedDuplicates = 0 } = {}) {
  return storedTabs > 0 || cleanedDuplicates > 0;
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
