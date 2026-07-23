import { BIN_LIMIT, compactBin, normalizeState } from '../model';
import type {
  BinEntry,
  DropOperationLedgerEntry,
  Folder,
  Group,
  TabBoardState,
  TabItem,
  Workspace,
} from '../model';

/**
 * Merge two TabBoardStates for storage migration (browser <-> file).
 *
 * Rules (per Task 10 brief):
 *  - Workspaces: union by id; on conflict pick higher updatedAt.
 *  - Folders: union by id; on conflict pick higher updatedAt.
 *  - Groups: union by id; on conflict pick higher updatedAt; tabs within the
 *    winning group are unioned by tab id, with higher updatedAt winning per tab.
 *  - categoryOrderByWorkspace: per workspace concatenate both arrays and dedup
 *    by id preserving order; fileState order wins for shared ids.
 *  - Settings: fileState.settings wins.
 *  - dropOperationLedger: union by operationId, dedup.
 *  - bin: union by entry id; higher deletedAt wins; truncated to BIN_LIMIT.
 *  - activeWorkspaceId: from whichever top-level state has higher updatedAt.
 *  - version/mutationRevision: max; createdAt: min; updatedAt: max.
 *  - normalizeState() is called on the result before returning.
 */
export function mergeStates(
  browserState: TabBoardState,
  fileState: TabBoardState
): TabBoardState {
  const browser = browserState;
  const file = fileState;

  // Workspaces: union by id, higher updatedAt wins.
  const workspaces = mergeEntityById<Workspace>(
    browser.workspaces,
    file.workspaces,
    (a, b) => (a.updatedAt >= b.updatedAt ? a : b),
  );

  // Folders: union by id, higher updatedAt wins.
  const folders = mergeEntityById<Folder>(
    browser.folders,
    file.folders,
    (a, b) => (a.updatedAt >= b.updatedAt ? a : b),
  );

  // Groups: union by id with internal tab merge.
  const groups = mergeGroups(browser.groups, file.groups);

  // categoryOrderByWorkspace: per workspace, file array first then browser, dedup.
  const categoryOrderByWorkspace = mergeCategoryOrder(
    browser.categoryOrderByWorkspace,
    file.categoryOrderByWorkspace,
  );

  // Settings: file wins.
  const settings = { ...file.settings };

  // dropOperationLedger: union by operationId, file wins on tie.
  const dropOperationLedger = mergeLedger(
    browser.dropOperationLedger,
    file.dropOperationLedger,
  );

  // bin: union by entry id, higher deletedAt wins; truncate to BIN_LIMIT.
  const bin = mergeBin(browser.bin, file.bin);

  // activeWorkspaceId: from whichever state has higher top-level updatedAt.
  const activeWorkspaceId =
    file.updatedAt >= browser.updatedAt ? file.activeWorkspaceId : browser.activeWorkspaceId;

  // version / revision / timestamps
  const version = Math.max(browser.version, file.version);
  const mutationRevision = Math.max(browser.mutationRevision, file.mutationRevision);
  const createdAt = minIso(browser.createdAt, file.createdAt);
  const updatedAt = maxIso(browser.updatedAt, file.updatedAt);

  const merged: TabBoardState = {
    version,
    mutationRevision,
    workspaces,
    activeWorkspaceId,
    groups,
    folders,
    categoryOrderByWorkspace,
    bin,
    dropOperationLedger,
    settings,
    createdAt,
    updatedAt,
  };

  return normalizeState(merged);
}

function mergeEntityById<T extends { id: string; updatedAt?: string }>(
  browserItems: readonly T[],
  fileItems: readonly T[],
  pickWinner: (a: T, b: T) => T,
): T[] {
  const map = new Map<string, T>();
  // Browser first so file wins ties via overwriting below.
  for (const item of browserItems) {
    map.set(item.id, item);
  }
  for (const item of fileItems) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else {
      map.set(item.id, pickWinner(existing, item));
    }
  }
  return [...map.values()];
}

function mergeGroups(browserGroups: readonly Group[], fileGroups: readonly Group[]): Group[] {
  const map = new Map<string, Group>();
  for (const g of browserGroups) {
    map.set(g.id, g);
  }
  for (const fg of fileGroups) {
    const existing = map.get(fg.id);
    if (!existing) {
      map.set(fg.id, fg);
      continue;
    }
    // Pick the winner group by updatedAt, then union tabs from both sides (tab id match
    // resolves to the higher updatedAt tab).
    const winner = fg.updatedAt >= existing.updatedAt ? fg : existing;
    const mergedTabs = mergeTabs(existing.tabs, fg.tabs);
    map.set(fg.id, { ...winner, tabs: mergedTabs });
  }
  return [...map.values()];
}

function mergeTabs(browserTabs: readonly TabItem[], fileTabs: readonly TabItem[]): TabItem[] {
  const map = new Map<string, TabItem>();
  for (const t of browserTabs) {
    map.set(t.id, t);
  }
  for (const ft of fileTabs) {
    const existing = map.get(ft.id);
    if (!existing) {
      map.set(ft.id, ft);
    } else {
      map.set(ft.id, ft.updatedAt >= existing.updatedAt ? ft : existing);
    }
  }
  // Preserve order: file order first, then any browser-only tabs appended (browser order).
  const ordered: TabItem[] = [];
  const seen = new Set<string>();
  for (const t of fileTabs) {
    const chosen = map.get(t.id);
    if (chosen && !seen.has(chosen.id)) {
      ordered.push(chosen);
      seen.add(chosen.id);
    }
  }
  for (const t of browserTabs) {
    const chosen = map.get(t.id);
    if (chosen && !seen.has(chosen.id)) {
      ordered.push(chosen);
      seen.add(chosen.id);
    }
  }
  return ordered;
}

function mergeCategoryOrder(
  browserOrder: Record<string, string[]>,
  fileOrder: Record<string, string[]>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const workspaceIds = new Set([...Object.keys(browserOrder), ...Object.keys(fileOrder)]);
  for (const wsId of workspaceIds) {
    const fileArr = fileOrder[wsId] || [];
    const browserArr = browserOrder[wsId] || [];
    // File order first, then browser order after; dedup preserving order.
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const id of fileArr) {
      if (!seen.has(id)) {
        seen.add(id);
        merged.push(id);
      }
    }
    for (const id of browserArr) {
      if (!seen.has(id)) {
        seen.add(id);
        merged.push(id);
      }
    }
    result[wsId] = merged;
  }
  return result;
}

function mergeLedger(
  browserEntries: readonly DropOperationLedgerEntry[],
  fileEntries: readonly DropOperationLedgerEntry[],
): DropOperationLedgerEntry[] {
  const map = new Map<string, DropOperationLedgerEntry>();
  // Browser first, file overwrites by operationId to honor file priority on ties.
  for (const e of browserEntries) {
    map.set(e.operationId, e);
  }
  for (const e of fileEntries) {
    map.set(e.operationId, e);
  }
  return [...map.values()].sort((a, b) => a.appliedAt.localeCompare(b.appliedAt));
}

function mergeBin(browserEntries: readonly BinEntry[], fileEntries: readonly BinEntry[]): BinEntry[] {
  const map = new Map<string, BinEntry>();
  for (const e of browserEntries) {
    map.set(e.id, e);
  }
  for (const e of fileEntries) {
    const existing = map.get(e.id);
    if (!existing) {
      map.set(e.id, e);
    } else {
      map.set(e.id, e.deletedAt >= existing.deletedAt ? e : existing);
    }
  }
  // compactBin sorts by deletedAt desc and slices to BIN_LIMIT.
  return compactBin([...map.values()]);
}

function minIso(a: string, b: string): string {
  return a <= b ? a : b;
}

function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}
