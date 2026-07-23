import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deriveSelectedStorableRecords,
  deriveSelectedStorableTabIds,
  filterOpenTabs,
  getSelectableOpenTabIds,
  getOpenTabDragData,
  resolveSelectedWindow,
  sameOpenTabSelection,
} from './open-tabs';
import {
  getCaptureCandidateReason,
  isStorableCaptureCandidate,
} from '../../shared/model/capture-policy';
import type { Settings } from '../../shared/model';
import type { OpenTabInfo, OpenWindowInfo } from './open-tabs';

const settings: Settings = {
  actionClick: 'store',
  closeTabsAfterSave: false,
  dedupeOnSave: true,
  deleteRestoredTabs: true,
  customUrlFilter: '',
  excludePinned: false,
  focusRestoredTabs: true,
  includeChromeUrls: false,
  includeFileUrls: false,
  openManagerAfterSave: false,
  restoreGroupsInNewWindow: false,
  restoreNextToCurrent: false,
  confirmBeforeDestructive: true,
  theme: 'system',
};

function windowInfo(id: number, focused = false, tabs: OpenTabInfo[] = []): OpenWindowInfo {
  return { id, focused, incognito: false, tabCount: tabs.length, tabs };
}

function tab(id: number, title: string, url: string, storable = true): OpenTabInfo {
  return {
    id,
    windowId: 1,
    title,
    url,
    favIconUrl: '',
    active: false,
    pinned: false,
    index: id,
    browserGroup: null,
    storable,
    reason: storable ? null : 'Matches custom filter rule' as const,
  };
}

describe('open tabs core', () => {
  it('uses valid selection, then focused, then first without mutating windows', () => {
    const windows = [windowInfo(1), windowInfo(2, true), windowInfo(3)];
    const before = structuredClone(windows);

    expect(resolveSelectedWindow(windows, 3)?.id).toBe(3);
    expect(resolveSelectedWindow(windows, 99)?.id).toBe(2);
    expect(resolveSelectedWindow(windows, null)?.id).toBe(2);
    expect(resolveSelectedWindow([windowInfo(1), windowInfo(2)], 99)?.id).toBe(1);
    expect(resolveSelectedWindow([], 1)).toBeNull();
    expect(windows).toEqual(before);
  });

  it('ignores incognito windows before applying selection fallback', () => {
    const windows = [
      { ...windowInfo(1, true), incognito: true },
      windowInfo(2),
      { ...windowInfo(3), incognito: true },
    ];

    expect(resolveSelectedWindow(windows, 3)?.id).toBe(2);
    expect(resolveSelectedWindow(windows, 1)?.id).toBe(2);
    expect(resolveSelectedWindow(windows, null)?.id).toBe(2);
    expect(resolveSelectedWindow([{ ...windowInfo(1), incognito: true }], null)).toBeNull();
  });

  it('filters title and URL independently while retaining non-storable rows', () => {
    const tabs = [
      tab(1, 'Readable title', 'https://example.test'),
      tab(2, 'Blocked', 'chrome://settings', false),
      tab(3, 'Other', 'https://needle.test/path', false),
      tab(4, 'alpha', 'https://beta.test'),
    ];

    expect(filterOpenTabs(tabs, 'READABLE')).toEqual([tabs[0]]);
    expect(filterOpenTabs(tabs, 'NEEDLE')).toEqual([tabs[2]]);
    expect(filterOpenTabs(tabs, 'alpha beta')).toEqual([]);
    expect(filterOpenTabs(tabs, '')).toEqual(tabs);
  });

  it('uses locale-independent lowercase matching', () => {
    const tabs = [tab(1, 'İstanbul', 'https://example.test')];

    expect(filterOpenTabs(tabs, 'i̇stanbul')).toEqual(tabs);
  });

  it('compares selections as sorted numeric multisets without mutating input', () => {
    const left = [7, 2, 4];
    const right = [4, 7, 2];

    expect(sameOpenTabSelection(left, right)).toBe(true);
    expect(sameOpenTabSelection(left, [2, 4])).toBe(false);
    expect(sameOpenTabSelection(left, [2, 4, 7, 7])).toBe(false);
    expect(sameOpenTabSelection(left, [2, 4, Number.NaN])).toBe(false);
    expect(left).toEqual([7, 2, 4]);
    expect(right).toEqual([4, 7, 2]);
  });
});

describe('Open Tabs selection and drag data', () => {
  it('builds a single selected drag payload without scanning rows', () => {
    const first = tab(11, 'First', 'https://first.test');
    const second = tab(12, 'Second', 'https://second.test');
    const selectedTabIdSet = new Set<number>([first.id as number]);
    const selectedStorableRecords = deriveSelectedStorableRecords(
      windowInfo(1, false, [first, second]),
      selectedTabIdSet,
    );
    const selectedStorableTabIds = deriveSelectedStorableTabIds(selectedStorableRecords);

    expect(getOpenTabDragData(first, selectedTabIdSet.has(first.id as number), selectedStorableRecords, selectedStorableTabIds)).toEqual({
      records: [first],
      tabIds: [11],
    });
    expect(getOpenTabDragData(second, selectedTabIdSet.has(second.id as number), selectedStorableRecords, selectedStorableTabIds)).toEqual({
      records: [second],
      tabIds: [12],
    });
  });

  it('builds an ordered multi-selected payload and excludes non-storable tabs', () => {
    const first = tab(21, 'First', 'https://first.test');
    const blocked = tab(22, 'Blocked', 'chrome://settings', false);
    const third = tab(23, 'Third', 'https://third.test');
    const selectedTabIdSet = new Set<number>([third.id as number, blocked.id as number, first.id as number]);
    const selectedStorableRecords = deriveSelectedStorableRecords(
      windowInfo(1, false, [first, blocked, third]),
      selectedTabIdSet,
    );
    const selectedStorableTabIds = deriveSelectedStorableTabIds(selectedStorableRecords);

    expect(selectedStorableRecords).toEqual([first, third]);
    expect(selectedStorableTabIds).toEqual([21, 23]);
    expect(getOpenTabDragData(third, selectedTabIdSet.has(third.id as number), selectedStorableRecords, selectedStorableTabIds)).toEqual({
      records: [first, third],
      tabIds: [21, 23],
    });
  });

  it('preserves close loading semantics through a shared closing ID set', () => {
    const closing = tab(31, 'Closing', 'https://closing.test');
    const open = tab(32, 'Open', 'https://open.test');
    const invalid = { ...open, id: undefined };
    const closingTabIdSet = new Set<number>([closing.id as number]);

    expect(Number.isSafeInteger(closing.id) && closingTabIdSet.has(closing.id as number)).toBe(true);
    expect(Number.isSafeInteger(open.id) && closingTabIdSet.has(open.id as number)).toBe(false);
    expect(Number.isSafeInteger(invalid.id)).toBe(false);
  });

  it('excludes pinned storable tabs from selected drag records', () => {
    const regular = tab(41, 'Regular', 'https://regular.test');
    const pinned = { ...tab(42, 'Pinned', 'https://pinned.test'), pinned: true };
    const selectedTabIdSet = new Set<number>([regular.id as number, pinned.id as number]);
    const selectedStorableRecords = deriveSelectedStorableRecords(
      windowInfo(1, false, [regular, pinned]),
      selectedTabIdSet,
    );
    const selectedStorableTabIds = deriveSelectedStorableTabIds(selectedStorableRecords);

    expect(selectedStorableRecords).toEqual([regular]);
    expect(selectedStorableTabIds).toEqual([41]);
    expect(getOpenTabDragData(regular, true, selectedStorableRecords, selectedStorableTabIds)).toEqual({
      records: [regular],
      tabIds: [41],
    });
  });

  it('returns only unpinned storable IDs for selection actions', () => {
    const regular = tab(51, 'Regular', 'https://regular.test');
    const pinned = { ...tab(52, 'Pinned', 'https://pinned.test'), pinned: true };
    const blocked = tab(53, 'Blocked', 'https://blocked.test', false);

    expect(getSelectableOpenTabIds(windowInfo(1, false, [regular, pinned, blocked]))).toEqual([51]);
  });
});

describe('capture policy', () => {
  const extensionBaseUrl = 'chrome-extension://test/';
  const candidate = { id: 1, url: 'https://example.test', pinned: false };

  it('returns stable reasons for missing ids and URLs', () => {
    expect(getCaptureCandidateReason({ url: candidate.url }, settings, extensionBaseUrl)).toBe('No usable tab ID');
    expect(getCaptureCandidateReason({ id: 0, url: candidate.url }, settings, extensionBaseUrl)).toBe('No usable tab ID');
    expect(getCaptureCandidateReason({ id: 1, url: '   ' }, settings, extensionBaseUrl)).toBe('No usable URL');
    expect(getCaptureCandidateReason({ id: 1, url: undefined }, settings, extensionBaseUrl)).toBe('No usable URL');
  });

  it('returns stable reasons for extension-owned URLs and custom filtering', () => {
    expect(getCaptureCandidateReason({ id: 1, url: `${extensionBaseUrl}manager.html` }, settings, extensionBaseUrl)).toBe('Cannot save this extension tab');
    expect(getCaptureCandidateReason({ id: 1, url: 'CHROME-EXTENSION://TEST/manager.html' }, settings, extensionBaseUrl)).toBe('Cannot save this extension tab');
    expect(getCaptureCandidateReason({ ...candidate, pinned: true }, settings, extensionBaseUrl)).toBeNull();
    expect(getCaptureCandidateReason(candidate, { ...settings, customUrlFilter: 'example.test' }, extensionBaseUrl)).toBe('Matches custom filter rule');
  });

  it('allows browser and file URLs unless a custom filter matches', () => {
    expect(getCaptureCandidateReason({ id: 1, url: 'chrome://settings' }, settings, extensionBaseUrl)).toBeNull();
    expect(getCaptureCandidateReason({ id: 1, url: 'file:///tmp/example.txt' }, settings, extensionBaseUrl)).toBeNull();
    expect(getCaptureCandidateReason(candidate, settings, extensionBaseUrl)).toBeNull();
    expect(isStorableCaptureCandidate(candidate, settings, extensionBaseUrl)).toBe(true);
  });
});

describe('Task107 source contracts', () => {
  it('defers long-list filtering while preserving CSS-contained rows', () => {
    const runtime = readFileSync(resolve(process.cwd(), 'src/manager/hooks/useOpenTabsRuntime.ts'), 'utf8');
    const css = readFileSync(resolve(process.cwd(), 'src/manager/styles/manager.css'), 'utf8');
    const rowStart = css.indexOf('.manager-open-tab-row {');
    const rowEnd = css.indexOf('}', rowStart);
    const row = css.slice(rowStart, rowEnd + 1);

    expect(runtime).toContain('useDeferredValue');
    expect(runtime).toContain('const deferredQuery = useDeferredValue(query)');
    expect(runtime).toContain('filterOpenTabs(selectedWindow?.tabs ?? [], deferredQuery)');
    expect(row).toContain('content-visibility: auto');
    expect(row).toContain('contain-intrinsic-size:');
  });

  it('structurally shares direct selected-capture reconciliation before publishing it', () => {
    const runtime = readFileSync(resolve(process.cwd(), 'src/manager/hooks/useOpenTabsRuntime.ts'), 'utf8');

    expect(runtime).toContain("import { structurallyShareState } from '../../shared/store/stateStructuralSharing';");
    expect(runtime).toContain('useTabBoardStore.setState(structurallyShareState(currentState, stateToApply))');
  });

  const root = resolve(process.cwd(), 'src');
  const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

  it('keeps OpenTabsPanel presentational and wires runtime concerns into the hook', () => {
    const panel = read('manager/components/sidebar/OpenTabsPanel.tsx');
    const hook = read('manager/hooks/useOpenTabsRuntime.ts');
    const core = read('manager/core/open-tabs.ts');
    const policy = read('shared/model/capture-policy.ts');

    expect(core).toContain('.toLowerCase()');
    expect(core).not.toContain('toLocaleLowerCase');
    expect(policy).toContain('.toLowerCase()');
    expect(policy).not.toContain('url.startsWith(extensionBaseUrl)');
    expect(panel).not.toContain('chrome.');
    expect(panel).not.toContain("sendMessage");
    expect(panel).not.toContain('role="button"');
    expect(panel).toContain('UnstyledButton');
    expect(panel).toContain('visibleWindows');
    expect(panel).toContain('manager-refresh-icon--loading');
    expect(panel).toContain('aria-busy={loading || undefined}');
    expect(panel).not.toContain('Loading open tabs…');
    expect(hook).toContain('closingTabIds');
    expect(panel).toContain('No selected browser window');
    expect(hook).toContain("list-open-tabs");
    expect(hook).toContain('onActivated');
    expect(hook).toContain('onReplaced');
    expect(hook).toContain('onCreated');
    expect(hook).toContain('onRemoved');
    expect(hook).toContain('onUpdated');
    expect(hook).toContain('saveSelectedTabs');
    expect(hook).toContain('close-open-tab');
    expect(hook).toContain('pin-open-tab');
    expect(hook).toContain('pin-open-tabs');
    expect(hook).toContain('close-open-tabs');
    expect(hook).toContain('focus-open-tab');
    expect(hook).toContain('sameOpenTabSelection');
    expect(hook).toContain('refreshQueued.current');
    expect(hook).toContain('return refreshQueued.current');
    expect(hook).toMatch(/catch \(error: unknown\)/);
  });

  it('keeps selected capture scoped to the selected window and storable tabs', () => {
    const hook = read('manager/hooks/useOpenTabsRuntime.ts');
    expect(hook).toContain('selectedWindow?.tabs');
    expect(hook).toContain('tab.storable === true');
    expect(hook).toContain('.sort((left, right) => left - right)');
    expect(hook).toContain('sameOpenTabSelection');
  });

  it('keeps selection actions aligned with pinned drag constraints', () => {
    const hook = read('manager/hooks/useOpenTabsRuntime.ts');

    expect(hook).toContain('getSelectableOpenTabIds(selectedWindow)');
    expect(hook).toContain('getSelectableOpenTabIds(nextSelectedWindow)');
    expect(hook).toContain('tab.storable === true && !tab.pinned');
    expect(hook).toContain('tab.storable && !tab.pinned');
  });

  it('uses pure capture policy at the service-worker boundary and preserves response contracts', () => {
    const worker = read('background/service-worker.ts');
    expect(worker).toContain("getCaptureCandidateReason");
    expect(worker).toContain('resolveTabUrl(tab)');
    expect(worker).toContain("chrome.runtime.getURL('')");
    expect(worker).toContain("case 'list-open-tabs'");
    expect(worker).toContain('storable');
    expect(worker).toContain('reason');
    expect(worker).toContain('selectedWindowId');
    expect(worker).toContain('normal');
    expect(worker).toContain("case 'close-open-tab'");
    expect(worker).toContain("case 'pin-open-tab'");
    expect(worker).toContain("case 'pin-open-tabs'");
    expect(worker).toContain("case 'close-open-tabs'");
    expect(worker).toContain("A valid tab ID is required");
    expect(worker).toContain('storedTabs');
    expect(worker).toContain('storedGroups');
    expect(worker).toContain('cleanedDuplicates');
    expect(worker).toContain('createdGroupIds');
    expect(worker).toContain('CAPTURE_MODES');
    expect(worker).toContain('tabSnapshots');
    expect(worker).toContain('pendingUrl');
    expect(worker).toContain('focus-open-tab');
  });

  it('keeps core tests independent from the UI component boundary', () => {
    const testSource = read('manager/core/open-tabs.test.ts');

    expect(testSource).not.toMatch(/from ['"]\.\.\/components\/sidebar\/OpenTabsPanel/);
    expect(testSource).not.toMatch(/from ['"]@mantine\/core/);
    expect(testSource).not.toMatch(/from ['"]@dnd-kit\/core/);
  });

  it('derives selection data once at panel scope instead of scanning each row', () => {
    const panel = read('manager/components/sidebar/OpenTabsPanel.tsx');
    const triggerStart = panel.indexOf('function OpenTabContentTrigger');
    const triggerEnd = panel.indexOf('export function OpenTabsPanel', triggerStart);
    const triggerSource = panel.slice(triggerStart, triggerEnd);

    expect(panel).toContain('useMemo(() => new Set(selectedTabIds)');
    expect(panel).toContain('selectedStorableRecords');
    expect(panel).toContain('selectedStorableTabIds');
    expect(panel).toContain('closingTabIdSet');
    expect(panel).toContain('const isClosing = isValidTabId(tab.id) && closingTabIdSet.has(tab.id);');
    expect(panel).toContain('disabled={!isValidTabId(tab.id) || isClosing}');
    expect(triggerSource).toContain('selectedTabIdSet.has');
    expect(triggerSource).not.toContain('selectedTabIds.includes');
    expect(triggerSource).not.toContain('availableTabs.filter');
    expect(triggerSource).not.toContain('new Set(');
  });
});
