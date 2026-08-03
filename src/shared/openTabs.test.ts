import { describe, expect, it } from 'vitest';
import {
  isOpenTabInfo,
  parseOpenTabsCaptureResult,
  parseOpenTabsListResult,
  parseRuntimeResponse,
} from './openTabs';

const validTab = {
  id: 7,
  windowId: 3,
  title: 'Example',
  url: 'https://example.test',
  favIconUrl: 'https://example.test/favicon.ico',
  pinned: false,
  index: 0,
  browserGroup: null,
  storable: true,
  reason: null,
};

describe('Open Tabs shared protocol', () => {
  it('accepts a complete OpenTabInfo record without active', () => {
    expect(isOpenTabInfo(validTab)).toBe(true);
  });

  it('parses canonical list, capture, and runtime response payloads', () => {
    const list = parseOpenTabsListResult({
      windows: [{
        id: 3,
        focused: true,
        incognito: false,
        tabCount: 1,
        tabs: [validTab],
      }],
    });
    const capture = parseOpenTabsCaptureResult({
      storedTabs: 1,
      storedGroups: 1,
      cleanedDuplicates: 0,
      createdGroupIds: ['group-1'],
    });
    const response = parseRuntimeResponse({ ok: true, result: list });

    expect(list.windows[0]?.tabs[0]).toEqual(validTab);
    expect(capture.createdGroupIds).toEqual(['group-1']);
    expect(response).toEqual({ ok: true, result: list });
  });

  it('reconstructs legacy runtime rows as fresh canonical objects', () => {
    const legacyBrowserGroup = {
      sourceGroupId: 4,
      title: 'Research',
      color: 'blue',
      collapsed: false,
      legacyGroupExtra: 'strip me',
    };
    const legacyTab = {
      ...validTab,
      active: true,
      legacyTabExtra: 'strip me',
      browserGroup: legacyBrowserGroup,
    };
    const legacyWindow = {
      id: 3,
      focused: true,
      incognito: false,
      tabCount: 1,
      tabs: [legacyTab],
      legacyWindowExtra: 'strip me',
    };
    const legacyWindows = [legacyWindow];

    const parsed = parseOpenTabsListResult({ windows: legacyWindows });

    expect(parsed).toEqual({
      windows: [{
        id: 3,
        focused: true,
        incognito: false,
        tabCount: 1,
        tabs: [{
          ...validTab,
          browserGroup: {
            sourceGroupId: 4,
            title: 'Research',
            color: 'blue',
            collapsed: false,
          },
        }],
      }],
    });
    expect(parsed.windows).not.toBe(legacyWindows);
    expect(parsed.windows[0]).not.toBe(legacyWindow);
    expect(parsed.windows[0].tabs[0]).not.toBe(legacyTab);
    expect(parsed.windows[0].tabs[0].browserGroup).not.toBe(legacyBrowserGroup);
  });

  it('rejects malformed nested tabs, windows, capture counts, and responses', () => {
    expect(() => parseOpenTabsListResult({
      windows: [{
        id: 3,
        focused: true,
        incognito: false,
        tabCount: 1,
        tabs: [{ ...validTab, storable: 'yes' }],
      }],
    })).toThrow('Invalid Open Tabs list result');
    expect(() => parseOpenTabsListResult({
      windows: [{
        id: 3,
        focused: true,
        incognito: false,
        tabCount: 2,
        tabs: [validTab],
      }],
    })).toThrow('Invalid Open Tabs list result');
    expect(() => parseOpenTabsCaptureResult({
      storedTabs: -1,
      storedGroups: 1,
      cleanedDuplicates: 0,
      createdGroupIds: ['group-1'],
    })).toThrow('Invalid Open Tabs capture result');
    expect(() => parseRuntimeResponse({ ok: 'yes', result: {} }))
      .toThrow('Invalid runtime response');
  });
});
