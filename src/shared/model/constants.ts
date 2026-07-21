export const STATE_KEY = 'tabboardState';
export const SCHEMA_VERSION = 1;
export const TASK_NONE = 'none';
export const ITEM_LINK = 'link' as const;
export const ITEM_NOTE = 'note' as const;
export const DEFAULT_WORKSPACE_ID = 'workspace_default';
export const BIN_LIMIT = 80;
export const DROP_OPERATION_LEDGER_LIMIT = 128;
export const LEGACY_ITEM_TODO = 'todo';
export const URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
export const SPECIAL_URL_PATTERN = /^(about|chrome|edge|brave|vivaldi|opera|file|ftp):/i;

import type { Settings } from './types';

export const DEFAULT_SETTINGS: Readonly<Settings> = {
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
};
