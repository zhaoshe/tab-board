import { describe, it, expect } from 'vitest';
import { normalizeState } from './schema';
import { DEFAULT_WORKSPACE_ID, DEFAULT_SETTINGS, FILE_LAYOUT_VERSION, BOOTSTRAP_KEY, FILE_PING_KEY, FILE_STORE_DB, FILE_STORE_STORE, FILE_STORE_HANDLE_KEY } from './constants';

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

describe('storage settings defaults', () => {
  it('DEFAULT_SETTINGS includes storageMode and storageFolderName', () => {
    expect(DEFAULT_SETTINGS.storageMode).toBe('browser');
    expect(DEFAULT_SETTINGS.storageFolderName).toBe('');
  });

  it('normalizeState fills storageMode and storageFolderName for states missing them', () => {
    const normalized = normalizeState({ settings: {} });
    expect(normalized.settings.storageMode).toBe('browser');
    expect(normalized.settings.storageFolderName).toBe('');
  });

  it('normalizeState fills storage defaults when settings is missing entirely', () => {
    const normalized = normalizeState({});
    expect(normalized.settings.storageMode).toBe('browser');
    expect(normalized.settings.storageFolderName).toBe('');
  });

  it('normalizeState preserves valid storageMode/file when present', () => {
    const normalized = normalizeState({ settings: { storageMode: 'file', storageFolderName: 'MyTabBoard' } });
    expect(normalized.settings.storageMode).toBe('file');
    expect(normalized.settings.storageFolderName).toBe('MyTabBoard');
  });

  it('normalizeState falls back to browser for invalid storageMode', () => {
    const normalized = normalizeState({ settings: { storageMode: 'cloud' } });
    expect(normalized.settings.storageMode).toBe('browser');
  });

  it('normalizeState falls back to empty string for non-string storageFolderName', () => {
    const normalized = normalizeState({ settings: { storageFolderName: 123 } });
    expect(normalized.settings.storageFolderName).toBe('');
  });
});

describe('file-storage constants', () => {
  it('exports the expected file-layout and bootstrap constants', () => {
    expect(FILE_LAYOUT_VERSION).toBe(1);
    expect(BOOTSTRAP_KEY).toBe('tabboardStorageConfig');
    expect(FILE_PING_KEY).toBe('tabboardFilePing');
    expect(FILE_STORE_DB).toBe('tabboard-fs');
    expect(FILE_STORE_STORE).toBe('handlers');
    expect(FILE_STORE_HANDLE_KEY).toBe('root');
  });
});
