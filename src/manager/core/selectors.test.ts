import { describe, expect, it } from 'vitest';
import {
  getActiveWorkspaceState,
  getCategoryStrip,
  getVisibleGroups,
} from './selectors';
import {
  normalizeState,
  validateFolderName,
} from '../../shared/model';
import type {
  Folder,
  Group,
  TabBoardState,
  TabItem,
  Workspace,
} from '../../shared/model';

const timestamp = '2026-01-01T00:00:00.000Z';

function makeWorkspace(id: string): Workspace {
  return { id, name: id, createdAt: timestamp, updatedAt: timestamp };
}

function makeFolder(id: string, workspaceId: string, name = id): Folder {
  return {
    id,
    name,
    color: 'slate',
    workspaceId,
    collapsed: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function makeTab(
  id: string,
  title: string,
  overrides: Partial<Pick<TabItem, 'url' | 'note'>> = {},
): TabItem {
  return {
    id,
    itemType: 'link',
    title,
    url: overrides.url ?? `https://${id}.test`,
    favIconUrl: '',
    note: overrides.note ?? '',
    pinned: false,
    incognito: false,
    starred: false,
    taskStatus: 'none',
    browserGroup: null,
    sourceWindowId: null,
    sourceTabId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function makeGroup(
  id: string,
  workspaceId: string,
  overrides: Partial<Group> = {},
): Group {
  return {
    id,
    title: id,
    note: '',
    workspaceId,
    folderId: null,
    locked: false,
    starred: false,
    archived: false,
    collapsed: false,
    tabs: [makeTab(`${id}-tab`, id)],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function makeState(overrides: Partial<TabBoardState> = {}): TabBoardState {
  const workspaces = overrides.workspaces ?? [makeWorkspace('workspace-1')];
  return {
    version: 1,
    mutationRevision: overrides.mutationRevision ?? 0,
    workspaces,
    activeWorkspaceId: overrides.activeWorkspaceId ?? workspaces[0].id,
    groups: overrides.groups ?? [],
    folders: overrides.folders ?? [],
    categoryOrderByWorkspace: {},
    bin: [],
    dropOperationLedger: [],
    settings: {
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
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe('getVisibleGroups', () => {
  it('returns no groups for an empty group collection', () => {
    expect(getVisibleGroups(makeState(), 'inbox', '')).toEqual([]);
  });

  it('falls back to the first workspace without mutating state, groups, folders, or tabs', () => {
    const groups = [
      makeGroup('first-workspace', 'workspace-1'),
      makeGroup('other-workspace', 'workspace-2'),
    ];
    const state = makeState({
      activeWorkspaceId: 'missing-workspace',
      workspaces: [makeWorkspace('workspace-1'), makeWorkspace('workspace-2')],
      groups,
      folders: [
        makeFolder('folder-1', 'workspace-1'),
        makeFolder('folder-2', 'workspace-2'),
      ],
    });
    const before = JSON.parse(JSON.stringify(state));

    expect(getActiveWorkspaceState(state)).toEqual({
      workspaceId: 'workspace-1',
      folders: [state.folders[0]],
    });
    expect(getVisibleGroups(state, 'inbox', '')).toEqual([groups[0]]);
    expect(state).toEqual(before);
  });

  it('only considers groups from the active workspace', () => {
    const groups = [
      makeGroup('active', 'workspace-1'),
      makeGroup('other-workspace', 'workspace-2'),
    ];

    expect(getVisibleGroups(makeState({ groups }), 'inbox', '')).toEqual([groups[0]]);
  });

  it('puts invalid and cross-workspace folder references in Inbox', () => {
    const groups = [
      makeGroup('missing-folder', 'workspace-1', { folderId: 'missing-folder-id' }),
      makeGroup('cross-workspace-folder', 'workspace-1', { folderId: 'folder-2' }),
      makeGroup('valid-folder', 'workspace-1', { folderId: 'folder-1' }),
    ];
    const state = makeState({
      groups,
      folders: [makeFolder('folder-1', 'workspace-1'), makeFolder('folder-2', 'workspace-2')],
    });

    expect(getVisibleGroups(state, 'inbox', '')).toEqual([groups[0], groups[1]]);
  });

  it('projects Saved groups and excludes their folders', () => {
    const groups = [
      makeGroup('saved', 'workspace-1', { starred: true, folderId: null }),
      makeGroup('foldered', 'workspace-1', { folderId: 'folder-1' }),
      makeGroup('other-workspace-saved', 'workspace-2', { starred: true }),
    ];

    expect(getVisibleGroups(
      makeState({ groups, folders: [makeFolder('folder-1', 'workspace-1')] }),
      'saved',
      '',
    )).toEqual([groups[0]]);
  });

  it('projects only unstarred groups for a folder filter', () => {
    const groups = [
      makeGroup('foldered', 'workspace-1', { folderId: 'folder-1' }),
      makeGroup('starred-in-folder', 'workspace-1', { starred: true, folderId: 'folder-1' }),
    ];

    expect(getVisibleGroups(
      makeState({ groups, folders: [makeFolder('folder-1', 'workspace-1')] }),
      'folder:folder-1',
      '',
    )).toEqual([groups[0]]);
  });

  it('returns no groups for missing or cross-workspace folders', () => {
    const groups = [
      makeGroup('valid-folder', 'workspace-1', { folderId: 'folder-1' }),
      makeGroup('missing-folder', 'workspace-1', { folderId: 'missing-folder' }),
      makeGroup('cross-workspace-folder', 'workspace-1', { folderId: 'folder-2' }),
      makeGroup('starred-folder', 'workspace-1', { starred: true, folderId: 'folder-1' }),
      makeGroup('other-workspace', 'workspace-2', { folderId: 'folder-1' }),
    ];
    const state = makeState({
      groups,
      folders: [makeFolder('folder-1', 'workspace-1'), makeFolder('folder-2', 'workspace-2')],
    });

    expect(getVisibleGroups(state, 'folder:missing-folder', '')).toEqual([]);
    expect(getVisibleGroups(state, 'folder:folder-2', '')).toEqual([]);
    expect(getVisibleGroups(state, 'folder:folder-1', '')).toEqual([groups[0]]);
  });

  it('searches tab titles and URLs only after category and workspace projection', () => {
    const groups = [
      makeGroup('title-match', 'workspace-1', {
        tabs: [makeTab('title-tab', 'Title needle', { url: 'https://title.test' })],
      }),
      makeGroup('url-match', 'workspace-1', {
        folderId: 'folder-1',
        tabs: [makeTab('url-tab', 'Unrelated title', { url: 'https://url-needle.test' })],
      }),
      makeGroup('other-workspace', 'workspace-2', {
        tabs: [makeTab('other-tab', 'Title needle', { url: 'https://url-needle.test' })],
      }),
      makeGroup('other-category', 'workspace-1', {
        starred: true,
        tabs: [makeTab('starred-tab', 'Unrelated title', { url: 'https://url-needle.test' })],
      }),
    ];
    const state = makeState({
      groups,
      folders: [makeFolder('folder-1', 'workspace-1')],
    });

    expect(getVisibleGroups(state, 'inbox', 'title needle')).toEqual([groups[0]]);
    expect(getVisibleGroups(state, 'folder:folder-1', 'url-needle')).toEqual([groups[1]]);
  });

  it('searches tab notes when other searchable fields do not match', () => {
    const group = makeGroup('note-only-group', 'workspace-1', {
      title: 'Unrelated group title',
      note: 'Unrelated group note',
      tabs: [makeTab('note-only-tab', 'Unrelated tab title', {
        url: 'https://unrelated.test',
        note: 'note-only needle',
      })],
    });

    expect(getVisibleGroups(makeState({ groups: [group] }), 'inbox', 'note-only needle')).toEqual([
      group,
    ]);
  });

  it('applies normalized search after category projection', () => {
    const groups = [
      makeGroup('inbox-match', 'workspace-1', {
        note: 'Need the needle',
        tabs: [makeTab('first', 'Unrelated', { url: 'https://example.test/path', note: 'needle in note' })],
      }),
      makeGroup('starred-match', 'workspace-1', { starred: true, title: 'Needle title' }),
      makeGroup('inbox-no-match', 'workspace-1', { title: 'Needle but starred', starred: true }),
    ];

    expect(getVisibleGroups(makeState({ groups }), 'inbox', '  NEEDLE  ')).toEqual([groups[0]]);
    expect(getVisibleGroups(makeState({ groups }), 'saved', 'needle')).toEqual([
      groups[1],
      groups[2],
    ]);
  });
});

describe('getCategoryStrip', () => {
  it('orders Inbox, Saved, Archive, then active-workspace custom folders', () => {
    const state = makeState({
      folders: [
        makeFolder('folder-a', 'workspace-1', 'Alpha'),
        makeFolder('folder-b', 'workspace-1', 'Beta'),
        makeFolder('folder-c', 'workspace-1', 'Gamma'),
        makeFolder('other-folder', 'workspace-2', 'Other'),
      ],
      categoryOrderByWorkspace: {
        'workspace-1': ['folder:folder-b', 'folder-b', 'missing', 'folder:other-folder', 'folder-a'],
      },
      groups: [
        makeGroup('inbox', 'workspace-1'),
        makeGroup('orphan', 'workspace-1', { folderId: 'missing' }),
        makeGroup('cross-workspace', 'workspace-1', { folderId: 'other-folder' }),
        makeGroup('alpha-one', 'workspace-1', { folderId: 'folder-a' }),
        makeGroup('alpha-two', 'workspace-1', { folderId: 'folder-a' }),
        makeGroup('beta-one', 'workspace-1', { folderId: 'folder-b' }),
        makeGroup('beta-two', 'workspace-1', { folderId: 'folder-b' }),
        makeGroup('beta-three', 'workspace-1', { folderId: 'folder-b' }),
        makeGroup('saved-one', 'workspace-1', { starred: true }),
        makeGroup('saved-two', 'workspace-1', { starred: true, folderId: 'folder-a' }),
        makeGroup('archived-one', 'workspace-1', { archived: true }),
        makeGroup('other-workspace', 'workspace-2', { folderId: 'folder-b' }),
      ],
    });

    expect(getCategoryStrip(state)).toEqual([
      { id: 'inbox', label: 'Inbox', count: 3, kind: 'inbox' },
      { id: 'saved', label: 'Saved', count: 2, kind: 'saved' },
      { id: 'archive', label: 'Archive', count: 1, kind: 'archive' },
      { id: 'folder:folder-b', label: 'Beta', count: 3, kind: 'folder', folderId: 'folder-b' },
      { id: 'folder:folder-a', label: 'Alpha', count: 2, kind: 'folder', folderId: 'folder-a' },
      { id: 'folder:folder-c', label: 'Gamma', count: 0, kind: 'folder', folderId: 'folder-c' },
    ]);
  });

  it('accepts raw order ids, ignores invalid ids, and fills omitted folders', () => {
    const state = makeState({
      folders: [makeFolder('folder-a', 'workspace-1'), makeFolder('folder-b', 'workspace-1')],
      categoryOrderByWorkspace: { 'workspace-1': ['folder-b', 'folder-b', 'folder:missing'] },
    });

    expect(getCategoryStrip(state).map((item) => item.id)).toEqual([
      'inbox',
      'saved',
      'archive',
      'folder:folder-b',
      'folder:folder-a',
    ]);
  });

  it('does not mutate state while building the category strip', () => {
    const state = makeState({
      folders: [makeFolder('folder-a', 'workspace-1'), makeFolder('folder-b', 'workspace-1')],
      categoryOrderByWorkspace: { 'workspace-1': ['folder:folder-b', 'folder-a'] },
      groups: [
        makeGroup('inbox', 'workspace-1', { folderId: 'missing-folder' }),
        makeGroup('foldered', 'workspace-1', { folderId: 'folder-a' }),
        makeGroup('saved', 'workspace-1', { starred: true, folderId: 'folder-b' }),
      ],
    });
    const before = JSON.stringify(state);

    getCategoryStrip(state);

    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('validateFolderName', () => {
  const folders = [
    makeFolder('folder-a', 'workspace-1', 'Café'),
    makeFolder('folder-b', 'workspace-2', 'Work'),
  ];

  it('rejects empty names and returns the normalized value for valid names', () => {
    expect(validateFolderName(folders, 'workspace-1', '   ')).toEqual({
      ok: false,
      reason: 'empty',
    });
    expect(validateFolderName(folders, 'workspace-1', '  New Folder  ')).toEqual({
      ok: true,
      value: 'New Folder',
    });
  });

  it('rejects NFC-trimmed case-insensitive duplicates in the same workspace', () => {
    expect(validateFolderName(folders, 'workspace-1', '  café ')).toEqual({
      ok: false,
      reason: 'duplicate',
    });
  });

  it('allows duplicate names across workspaces and self rename', () => {
    expect(validateFolderName(folders, 'workspace-1', ' work ')).toEqual({
      ok: true,
      value: 'work',
    });
    expect(validateFolderName(folders, 'workspace-1', ' café ', 'folder-a')).toEqual({
      ok: true,
      value: 'café',
    });
  });

  it('does not remove or merge historic duplicate folders during normalization', () => {
    const raw = makeState({
      folders: [
        makeFolder('folder-a', 'workspace-1', ' Work '),
        makeFolder('folder-b', 'workspace-1', 'work'),
      ],
    });
    const before = JSON.stringify(raw);
    const normalized = normalizeState(raw);

    expect(JSON.stringify(raw)).toBe(before);
    expect(normalized.folders.map((folder) => [folder.id, folder.name])).toEqual([
      ['folder-a', ' Work '],
      ['folder-b', 'work'],
    ]);
  });
});

describe('normalizeState settings validation', () => {
  it('rejects malformed settings without mutating raw input', () => {
    const raw: unknown = {
      ...makeState(),
      settings: {
        ...makeState().settings,
        includeChromeUrls: 'false',
        dedupeOnSave: 1,
        theme: 7,
        actionClick: false,
      },
    };
    const before = JSON.stringify(raw);
    const normalized = normalizeState(raw);

    expect(normalized.settings.includeChromeUrls).toBe(false);
    expect(normalized.settings.dedupeOnSave).toBe(true);
    expect(normalized.settings.theme).toBe('system');
    expect(normalized.settings.actionClick).toBe('store');
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('preserves valid stored settings', () => {
    const raw = makeState({
      settings: {
        ...makeState().settings,
        includeChromeUrls: true,
        dedupeOnSave: false,
        theme: 'dark',
        actionClick: 'popup',
      },
    });

    expect(normalizeState(raw).settings).toMatchObject({
      includeChromeUrls: true,
      dedupeOnSave: false,
      theme: 'dark',
      actionClick: 'popup',
    });
  });
});

describe('normalizeState group invariants', () => {
  it('clears starred folders, rejects cross-workspace folders, and infers fallback workspace after folder normalization', () => {
    const raw = makeState({
      workspaces: [makeWorkspace('workspace-1'), makeWorkspace('workspace-2')],
      folders: [
        makeFolder('folder-1', 'workspace-1'),
        makeFolder('folder-2', 'workspace-2'),
      ],
      groups: [
        makeGroup('saved', 'workspace-1', { starred: true, folderId: 'folder-1' }),
        makeGroup('cross-folder', 'workspace-1', { folderId: 'folder-2' }),
        makeGroup('missing-folder', 'workspace-1', { folderId: 'missing-folder' }),
        makeGroup('fallback', 'missing-workspace', { folderId: 'folder-2' }),
      ],
    });
    const before = JSON.stringify(raw);
    const normalized = normalizeState(raw);

    expect(JSON.stringify(raw)).toBe(before);
    expect(normalized.groups.map(({ id, workspaceId, folderId }) => ({ id, workspaceId, folderId }))).toEqual([
      { id: 'saved', workspaceId: 'workspace-1', folderId: null },
      { id: 'cross-folder', workspaceId: 'workspace-1', folderId: null },
      { id: 'missing-folder', workspaceId: 'workspace-1', folderId: null },
      { id: 'fallback', workspaceId: 'workspace-2', folderId: 'folder-2' },
    ]);
  });
});
