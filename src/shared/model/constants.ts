export const STATE_KEY = 'tabboardState';
export const SETTINGS_PROJECTION_KEY = 'tabboardSettingsProjection';
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

// File-storage layout and bootstrap constants
export const FILE_LAYOUT_VERSION = 1;
export const BOOTSTRAP_KEY = 'tabboardStorageConfig';
export const FILE_PING_KEY = 'tabboardFilePing';
export const STORAGE_FALLBACK_KEY = 'tabboardStorageFallback';
export const FILE_STORE_DB = 'tabboard-fs';
export const FILE_STORE_STORE = 'handlers';
export const FILE_STORE_HANDLE_KEY = 'root';

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
  storageMode: 'browser',
  storageFolderName: '',
};
