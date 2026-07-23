import { FILE_LAYOUT_VERSION, SCHEMA_VERSION } from '../model/constants';
import { normalizeState } from '../model/schema';
import type {
  TabBoardState,
  Settings,
  Workspace,
  Folder,
  BinEntry,
  DropOperationLedgerEntry,
  Group,
} from '../model/types';

export interface FileParts {
  meta: {
    version: number;
    mutationRevision: number;
    activeWorkspaceId: string;
    createdAt: string;
    updatedAt: string;
    fileLayoutVersion: number;
  };
  settings: Settings;
  workspaces: Workspace[];
  folders: Folder[];
  categoryOrderByWorkspace: Record<string, string[]>;
  bin: BinEntry[];
  dropOperationLedger: DropOperationLedgerEntry[];
  sessions: Map<string, Group>;
}

/**
 * Split an in-memory TabBoardState into per-file parts suitable for writing
 * to disk under the file-storage layout.
 *
 * meta.json intentionally excludes transient flags like writeInProgress /
 * migrationInProgress; callers add those themselves before writing.
 */
export function splitState(state: TabBoardState): FileParts {
  const sessions = new Map<string, Group>();
  for (const group of state.groups) {
    sessions.set(group.id, group);
  }
  return {
    meta: {
      version: SCHEMA_VERSION,
      mutationRevision: state.mutationRevision,
      activeWorkspaceId: state.activeWorkspaceId,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      fileLayoutVersion: FILE_LAYOUT_VERSION,
    },
    settings: state.settings,
    workspaces: state.workspaces,
    folders: state.folders,
    categoryOrderByWorkspace: state.categoryOrderByWorkspace,
    bin: state.bin,
    dropOperationLedger: state.dropOperationLedger,
    sessions,
  };
}

/**
 * Assemble a TabBoardState from its per-file parts. Always runs normalizeState
 * on the assembled object so missing fields are filled, invalid tabs/groups
 * are repaired/filtered, and version is pinned to SCHEMA_VERSION.
 */
export function assembleState(parts: FileParts): TabBoardState {
  const groups: Group[] = [...parts.sessions.values()];
  const assembled: TabBoardState = {
    version: parts.meta.version,
    mutationRevision: parts.meta.mutationRevision,
    workspaces: parts.workspaces,
    activeWorkspaceId: parts.meta.activeWorkspaceId,
    groups,
    folders: parts.folders,
    categoryOrderByWorkspace: parts.categoryOrderByWorkspace,
    bin: parts.bin,
    dropOperationLedger: parts.dropOperationLedger,
    settings: parts.settings,
    createdAt: parts.meta.createdAt,
    updatedAt: parts.meta.updatedAt,
  };
  return normalizeState(assembled);
}

/** Consistent 2-space pretty JSON used by every file write. */
export function serializeJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

/** JSON.parse wrapper that includes the filename in thrown errors. */
export function parseJsonFile<T>(text: string, filename: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse JSON file "${filename}": ${message}`);
  }
}
