import type { BrowserGroup, CaptureCandidateReason } from '../../shared/model';

export interface OpenTabInfo {
  id: number | undefined;
  windowId: number | undefined;
  title: string;
  url: string;
  favIconUrl: string;
  active: boolean;
  pinned: boolean;
  index: number;
  browserGroup: BrowserGroup | null;
  storable: boolean;
  reason: CaptureCandidateReason | null;
}

export interface OpenWindowInfo {
  id: number | undefined;
  focused: boolean;
  incognito: boolean;
  tabCount: number;
  tabs: OpenTabInfo[];
}

const NEWTAB_URL_PATTERN = /^(chrome|edge|brave|firefox|about):\/\/newtab\/?$|^about:newtab$/i;

export function isNewTabUrl(url: string): boolean {
  return NEWTAB_URL_PATTERN.test(url);
}

function isValidOpenTabId(id: number | undefined): id is number {
  return Number.isSafeInteger(id);
}

export function getSelectableOpenTabIds(selectedWindow: OpenWindowInfo | null): number[] {
  return selectedWindow?.tabs.flatMap((tab) => (
    tab.storable === true && isValidOpenTabId(tab.id) ? [tab.id] : []
  )) ?? [];
}

export function deriveSelectedStorableRecords(
  selectedWindow: OpenWindowInfo | null,
  selectedTabIdSet: ReadonlySet<number>,
): OpenTabInfo[] {
  return selectedWindow?.tabs.filter((record) =>
    record.storable === true && isValidOpenTabId(record.id) && selectedTabIdSet.has(record.id),
  ) ?? [];
}

export function deriveSelectedStorableTabIds(records: readonly OpenTabInfo[]): number[] {
  return records.flatMap((record) => isValidOpenTabId(record.id) ? [record.id] : []);
}

export interface OpenTabDragData {
  records: OpenTabInfo[];
  tabIds: number[];
}

export function getOpenTabDragData(
  tab: OpenTabInfo,
  isSelectedDrag: boolean,
  selectedStorableRecords: OpenTabInfo[],
  selectedStorableTabIds: number[],
): OpenTabDragData {
  if (isSelectedDrag && selectedStorableRecords.length > 0) {
    return { records: selectedStorableRecords, tabIds: selectedStorableTabIds };
  }
  return {
    records: [tab],
    tabIds: isValidOpenTabId(tab.id) ? [tab.id] : [],
  };
}

export function resolveSelectedWindow(
  windows: OpenWindowInfo[],
  selectedWindowId: number | null,
): OpenWindowInfo | null {
  const normalWindows = windows.filter((window) => !window.incognito);
  return normalWindows.find((window) => window.id === selectedWindowId)
    ?? normalWindows.find((window) => window.focused)
    ?? normalWindows[0]
    ?? null;
}

export function filterOpenTabs(
  tabs: OpenTabInfo[],
  query: string,
): OpenTabInfo[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [...tabs];
  return tabs.filter((tab) =>
    tab.title.toLowerCase().includes(normalizedQuery)
    || tab.url.toLowerCase().includes(normalizedQuery),
  );
}

export function sameOpenTabSelection(
  left: readonly number[],
  right: readonly number[],
): boolean {
  if (left.some((id) => !Number.isSafeInteger(id)) || right.some((id) => !Number.isSafeInteger(id))) {
    return false;
  }
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.length === sortedRight.length
    && sortedLeft.every((id, index) => id === sortedRight[index]);
}
