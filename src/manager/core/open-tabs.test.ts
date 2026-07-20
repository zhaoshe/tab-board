import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterOpenTabs, resolveSelectedWindow, sameOpenTabSelection } from './open-tabs';
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
});
