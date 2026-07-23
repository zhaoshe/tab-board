import type {
  BinEntry,
  BrowserGroup,
  DropOperationLedgerEntry,
  Folder,
  Group,
  Settings,
  TabBoardState,
  TabItem,
  Workspace,
} from '../model';

type KeyedEntity = { id: string };

function shallowEqualObjects(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  ignoredKeys: ReadonlySet<string> = new Set(),
): boolean {
  const previousKeys = Object.keys(previous).filter((key) => !ignoredKeys.has(key));
  const nextKeys = Object.keys(next).filter((key) => !ignoredKeys.has(key));
  return previousKeys.length === nextKeys.length
    && nextKeys.every((key) => previous[key] === next[key]);
}

function sharePlainObject<T extends object>(previous: T, next: T): T {
  return shallowEqualObjects(
    previous as Record<string, unknown>,
    next as Record<string, unknown>,
  ) ? previous : next;
}

function shareBrowserGroup(
  previous: BrowserGroup | null,
  next: BrowserGroup | null,
): BrowserGroup | null {
  if (!previous || !next) return previous === next ? previous : next;
  return sharePlainObject(previous, next);
}

function shareTab(previous: TabItem | undefined, next: TabItem): TabItem {
  if (!previous) return next;
  const browserGroup = shareBrowserGroup(previous.browserGroup, next.browserGroup);
  const candidate = browserGroup === next.browserGroup ? next : { ...next, browserGroup };
  return shallowEqualObjects(
    previous as unknown as Record<string, unknown>,
    candidate as unknown as Record<string, unknown>,
  ) ? previous : candidate;
}

function shareKeyedArray<T extends KeyedEntity>(
  previous: readonly T[],
  next: readonly T[],
  shareEntity: (previous: T | undefined, next: T) => T,
): T[] {
  const previousById = new Map(previous.map((entity) => [entity.id, entity]));
  let changed = previous.length !== next.length;
  const shared = next.map((entity, index) => {
    const result = shareEntity(previousById.get(entity.id), entity);
    if (result !== previous[index]) changed = true;
    return result;
  });
  return changed ? shared : previous as T[];
}

function shareGroup(previous: Group | undefined, next: Group): Group {
  if (!previous) return next;
  const tabs = shareKeyedArray(previous.tabs, next.tabs, shareTab);
  const candidate = tabs === next.tabs ? next : { ...next, tabs };
  return previous.tabs === tabs && shallowEqualObjects(
    previous as unknown as Record<string, unknown>,
    candidate as unknown as Record<string, unknown>,
    new Set(['tabs']),
  ) ? previous : candidate;
}

function shareBinEntry(previous: BinEntry | undefined, next: BinEntry): BinEntry {
  if (!previous) return next;
  const item = next.kind === 'group'
    ? shareGroup(previous.kind === 'group' ? previous.item as Group : undefined, next.item as Group)
    : shareTab(previous.kind === 'tab' ? previous.item as TabItem : undefined, next.item as TabItem);
  const candidate = item === next.item ? next : { ...next, item };
  return previous.item === item && shallowEqualObjects(
    previous as unknown as Record<string, unknown>,
    candidate as unknown as Record<string, unknown>,
    new Set(['item']),
  ) ? previous : candidate;
}

function shareLedger(
  previous: readonly DropOperationLedgerEntry[],
  next: readonly DropOperationLedgerEntry[],
): DropOperationLedgerEntry[] {
  const previousByOperationId = new Map(previous.map((entry) => [entry.operationId, entry]));
  let changed = previous.length !== next.length;
  const shared = next.map((entry, index) => {
    const previousEntry = previousByOperationId.get(entry.operationId);
    const result = previousEntry ? sharePlainObject(previousEntry, entry) : entry;
    if (result !== previous[index]) changed = true;
    return result;
  });
  return changed ? shared : previous as DropOperationLedgerEntry[];
}

function shareCategoryOrder(
  previous: Record<string, string[]>,
  next: Record<string, string[]>,
): Record<string, string[]> {
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  let changed = previousKeys.length !== nextKeys.length;
  const shared: Record<string, string[]> = {};
  for (const workspaceId of nextKeys) {
    const previousOrder = previous[workspaceId];
    const nextOrder = next[workspaceId];
    const order = previousOrder
      && previousOrder.length === nextOrder.length
      && previousOrder.every((category, index) => category === nextOrder[index])
      ? previousOrder
      : nextOrder;
    shared[workspaceId] = order;
    if (order !== previousOrder) changed = true;
  }
  return changed ? shared : previous;
}

export function structurallyShareState(
  previous: TabBoardState,
  next: TabBoardState,
): TabBoardState {
  const workspaces = shareKeyedArray<Workspace>(
    previous.workspaces,
    next.workspaces,
    (previousWorkspace, nextWorkspace) => previousWorkspace
      ? sharePlainObject(previousWorkspace, nextWorkspace)
      : nextWorkspace,
  );
  const folders = shareKeyedArray<Folder>(
    previous.folders,
    next.folders,
    (previousFolder, nextFolder) => previousFolder
      ? sharePlainObject(previousFolder, nextFolder)
      : nextFolder,
  );
  const groups = shareKeyedArray(previous.groups, next.groups, shareGroup);
  const bin = shareKeyedArray(previous.bin, next.bin, shareBinEntry);
  const dropOperationLedger = shareLedger(previous.dropOperationLedger, next.dropOperationLedger);
  const categoryOrderByWorkspace = shareCategoryOrder(
    previous.categoryOrderByWorkspace,
    next.categoryOrderByWorkspace,
  );
  const settings = sharePlainObject<Settings>(previous.settings, next.settings);

  return {
    ...next,
    workspaces,
    folders,
    groups,
    categoryOrderByWorkspace,
    bin,
    dropOperationLedger,
    settings,
  };
}
