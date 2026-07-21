import { describe, it, expect } from 'vitest';
import { normalizeState } from './schema';
import { DEFAULT_WORKSPACE_ID } from './constants';

describe('normalizeState quickList migration', () => {
  it('drops the quickList field from normalized state', () => {
    const normalized = normalizeState({ quickList: [{ itemType: 'link', url: 'https://example.com' }] });
    expect('quickList' in normalized).toBe(false);
  });

  it('preserves residual quickList items as a "Former Quick list" session', () => {
    const normalized = normalizeState({
      quickList: [
        { itemType: 'link', title: 'Example', url: 'https://example.com' },
        { itemType: 'link', url: 'https://second.example' },
      ],
    });
    const migrated = normalized.groups.find((group) => group.title === 'Former Quick list');
    expect(migrated).toBeDefined();
    expect(migrated?.workspaceId).toBe(DEFAULT_WORKSPACE_ID);
    expect(migrated?.tabs.map((tab) => tab.url)).toEqual([
      'https://example.com',
      'https://second.example',
    ]);
  });

  it('inserts the migrated session ahead of existing groups', () => {
    const normalized = normalizeState({
      groups: [
        {
          id: 'existing',
          title: 'Existing',
          workspaceId: DEFAULT_WORKSPACE_ID,
          tabs: [{ itemType: 'link', url: 'https://keep.example' }],
        },
      ],
      quickList: [{ itemType: 'link', url: 'https://example.com' }],
    });
    expect(normalized.groups[0].title).toBe('Former Quick list');
    expect(normalized.groups.some((group) => group.id === 'existing')).toBe(true);
  });

  it('does not create an empty session when there is no quickList data', () => {
    const normalized = normalizeState({ groups: [] });
    expect(normalized.groups.some((group) => group.title === 'Former Quick list')).toBe(false);
    expect('quickList' in normalized).toBe(false);
  });

  it('ignores non-array quickList values without throwing', () => {
    const normalized = normalizeState({ quickList: 'not-an-array' });
    expect(normalized.groups.some((group) => group.title === 'Former Quick list')).toBe(false);
  });
});
