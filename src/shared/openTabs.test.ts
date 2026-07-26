import { describe, expect, it } from 'vitest';
import {
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
  active: true,
  pinned: false,
  index: 0,
  browserGroup: null,
  storable: true,
  reason: null,
};

describe('Open Tabs shared protocol', () => {
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
