export function getSessionRestoreTooltip({
  deleteRestoredTabs,
  locked,
  readOnly,
}: {
  deleteRestoredTabs: boolean;
  locked: boolean;
  readOnly: boolean;
}): string {
  if (readOnly) return 'Open without removing bookmarks';
  if (locked || !deleteRestoredTabs) return 'Open and keep saved links';
  return 'Open and remove saved links';
}

export function getSavedLinkRestoreTooltip({
  deleteRestoredTabs,
  locked,
  readOnly,
}: {
  deleteRestoredTabs: boolean;
  locked: boolean;
  readOnly: boolean;
}): string {
  if (readOnly) return 'Open without removing bookmark';
  if (locked || !deleteRestoredTabs) return 'Open and keep saved link';
  return 'Open and remove saved link';
}
