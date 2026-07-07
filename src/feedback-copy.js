export function formatSaveFeedback(count) {
  return `Saved ${count} tab${count === 1 ? "" : "s"}`;
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
