import { describe, expect, it } from 'vitest';
import {
  parseRestoreRefs,
  parseRestoreRefsResult,
  restoreRefKey,
  type RestoreRef,
} from './restore-refs';

describe('restore refs protocol', () => {
  it('keeps colon-bearing group and tab IDs unambiguous through outcomes', () => {
    const refs: RestoreRef[] = [
      { source: 'group', groupId: 'a:b', tabId: 'c' },
      { source: 'group', groupId: 'a', tabId: 'b:c' },
    ];

    const parsed = parseRestoreRefs(refs);
    const keys = parsed.map(restoreRefKey);

    expect(keys).toEqual([
      '["a:b","c"]',
      '["a","b:c"]',
    ]);
    expect(new Set(keys).size).toBe(2);
    expect(parseRestoreRefsResult({
      restoredTabs: 1,
      outcomes: [
        {
          key: keys[0],
          groupId: refs[0].groupId,
          tabId: refs[0].tabId,
          status: 'restored',
        },
        {
          key: keys[1],
          groupId: refs[1].groupId,
          tabId: refs[1].tabId,
          status: 'failed',
          error: 'missing',
        },
      ],
    }, parsed)).toEqual({
      restoredTabs: 1,
      outcomes: [
        {
          key: '["a:b","c"]',
          groupId: 'a:b',
          tabId: 'c',
          status: 'restored',
        },
        {
          key: '["a","b:c"]',
          groupId: 'a',
          tabId: 'b:c',
          status: 'failed',
          error: 'missing',
        },
      ],
    });
  });
});
