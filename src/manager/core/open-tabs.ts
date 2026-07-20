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
