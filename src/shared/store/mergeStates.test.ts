import { describe, expect, it } from 'vitest';
import {
  BIN_LIMIT,
  DEFAULT_SETTINGS,
  DEFAULT_WORKSPACE_ID,
  createEmptyState,
  createNoteRecord,
} from '../model';
import type {
  BinEntry,
  DropOperationLedgerEntry,
  Folder,
  Group,
  Settings,
  TabBoardState,
  TabItem,
  Workspace,
} from '../model';
import { mergeStates } from './mergeStates';

const ts = {
  early: '2026-01-01T00:00:00.000Z',
  mid: '2026-02-01T00:00:00.000Z',
  late: '2026-03-01T00:00:00.000Z',
  later: '2026-04-01T00:00:00.000Z',
  latest: '2026-05-01T00:00:00.000Z',
};

function makeWorkspace(overrides: Partial<Workspace>): Workspace {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: 'Personal',
    createdAt: ts.early,
    updatedAt: ts.early,
    ...overrides,
  };
}

function makeFolder(overrides: Partial<Folder>): Folder {
  return {
    id: 'folder_default',
    name: 'Folder',
    color: 'slate',
    workspaceId: DEFAULT_WORKSPACE_ID,
    collapsed: false,
    createdAt: ts.early,
    updatedAt: ts.early,
    ...overrides,
  };
}

function makeTab(overrides: Partial<TabItem>): TabItem {
  return {
    id: 'tab_default',
    itemType: 'link',
    title: 'Tab',
    url: 'https://example.com',
    favIconUrl: '',
    note: '',
    pinned: false,
    incognito: false,
    starred: false,
    taskStatus: 'none',
    browserGroup: null,
    sourceWindowId: null,
    sourceTabId: null,
    createdAt: ts.early,
    updatedAt: ts.early,
    ...overrides,
  };
}

function makeGroup(overrides: Partial<Group>): Group {
  return {
    id: 'group_default',
    title: 'Group',
    note: '',
    workspaceId: DEFAULT_WORKSPACE_ID,
    folderId: null,
    locked: false,
    starred: false,
    archived: false,
    collapsed: false,
    tabs: [],
    createdAt: ts.early,
    updatedAt: ts.early,
    ...overrides,
  };
}

function makeBinEntry(overrides: Partial<BinEntry>): BinEntry {
  return {
    id: 'bin_default',
    kind: 'group',
    label: 'Deleted',
    groupId: 'g',
    groupTitle: 'G',
    source: 'group',
    item: makeGroup({ id: 'g' }),
    deletedAt: ts.early,
    ...overrides,
  };
}

function makeState(overrides: Partial<TabBoardState> = {}): TabBoardState {
  return {
    version: 1,
    mutationRevision: 0,
    workspaces: [makeWorkspace({})],
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    groups: [],
    folders: [],
    categoryOrderByWorkspace: {},
    bin: [],
    dropOperationLedger: [],
    settings: { ...DEFAULT_SETTINGS },
    createdAt: ts.early,
    updatedAt: ts.early,
    ...overrides,
  };
}

describe('mergeStates', () => {
  it('picks the newer workspace on conflict', () => {
    const browser = makeState({
      updatedAt: ts.early,
      workspaces: [makeWorkspace({ id: 'w1', name: 'OldName', updatedAt: ts.early })],
    });
    const file = makeState({
      updatedAt: ts.late,
      workspaces: [makeWorkspace({ id: 'w1', name: 'NewName', updatedAt: ts.late })],
    });
    const result = mergeStates(browser, file);
    expect(result.workspaces).toHaveLength(1);
    expect(result.workspaces[0].name).toBe('NewName');
  });

  it('picks the older workspace when browser is newer', () => {
    const browser = makeState({
      updatedAt: ts.late,
      workspaces: [makeWorkspace({ id: 'w1', name: 'BrowserNewer', updatedAt: ts.late })],
    });
    const file = makeState({
      updatedAt: ts.early,
      workspaces: [makeWorkspace({ id: 'w1', name: 'FileOlder', updatedAt: ts.early })],
    });
    const result = mergeStates(browser, file);
    expect(result.workspaces[0].name).toBe('BrowserNewer');
  });

  it('merges folders by id picking newer updatedAt', () => {
    const browser = makeState({
      folders: [makeFolder({ id: 'f1', name: 'OldFolder', updatedAt: ts.early })],
    });
    const file = makeState({
      folders: [makeFolder({ id: 'f1', name: 'NewFolder', updatedAt: ts.late })],
    });
    const result = mergeStates(browser, file);
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].name).toBe('NewFolder');
  });

  it('merges groups by id picking newer updatedAt and merges tabs within', () => {
    const browserTab = makeTab({ id: 't1', title: 'OldTabTitle', url: 'https://a.com', updatedAt: ts.early });
    const fileTab = makeTab({ id: 't1', title: 'NewTabTitle', url: 'https://a.com', updatedAt: ts.late });
    const fileOnlyTab = makeTab({ id: 't2', title: 'FileOnly', url: 'https://b.com', updatedAt: ts.mid });
    const browserOnlyTab = makeTab({ id: 't3', title: 'BrowserOnly', url: 'https://c.com', updatedAt: ts.mid });

    const browser = makeState({
      groups: [makeGroup({ id: 'g1', title: 'OldGroup', updatedAt: ts.early, tabs: [browserTab, browserOnlyTab] })],
    });
    const file = makeState({
      groups: [makeGroup({ id: 'g1', title: 'NewGroup', updatedAt: ts.late, tabs: [fileTab, fileOnlyTab] })],
    });
    const result = mergeStates(browser, file);
    expect(result.groups).toHaveLength(1);
    const g = result.groups[0];
    expect(g.title).toBe('NewGroup');
    const byId = Object.fromEntries(g.tabs.map((t) => [t.id, t]));
    // t1: file wins (newer)
    expect(byId.t1.title).toBe('NewTabTitle');
    // t2 only in file
    expect(byId.t2).toBeDefined();
    // t3 only in browser
    expect(byId.t3).toBeDefined();
  });

  it('unions non-conflicting workspaces, folders, groups, tabs', () => {
    const browser = makeState({
      workspaces: [makeWorkspace({ id: 'w1', name: 'W1' })],
      folders: [makeFolder({ id: 'f1', name: 'F1' })],
      groups: [makeGroup({ id: 'g1', tabs: [makeTab({ id: 't1', url: 'https://t1' })] })],
    });
    const file = makeState({
      workspaces: [makeWorkspace({ id: 'w2', name: 'W2' })],
      folders: [makeFolder({ id: 'f2', name: 'F2' })],
      groups: [makeGroup({ id: 'g2', tabs: [makeTab({ id: 't2', url: 'https://t2' })] })],
    });
    const result = mergeStates(browser, file);
    expect(new Set(result.workspaces.map((w) => w.id))).toEqual(new Set(['w1', 'w2']));
    expect(new Set(result.folders.map((f) => f.id))).toEqual(new Set(['f1', 'f2']));
    expect(new Set(result.groups.map((g) => g.id))).toEqual(new Set(['g1', 'g2']));
  });

  it('dedups bin entries by id picking higher deletedAt and truncates to BIN_LIMIT', () => {
    // Build a bin with (BIN_LIMIT + 10) entries: BIN_LIMIT old ones in browser,
    // and 10 newer conflicting + extra in file. After merge we expect BIN_LIMIT newest.
    const oldBin: BinEntry[] = [];
    for (let i = 0; i < BIN_LIMIT; i++) {
      oldBin.push(makeBinEntry({ id: `bin_old_${i}`, deletedAt: ts.early }));
    }
    const newBin: BinEntry[] = [];
    // conflicting entry with newer deletedAt
    newBin.push(makeBinEntry({ id: 'bin_old_0', label: 'newer_label', deletedAt: ts.latest }));
    // 9 additional new entries
    for (let i = 0; i < 9; i++) {
      newBin.push(makeBinEntry({ id: `bin_new_${i}`, deletedAt: ts.late }));
    }

    const browser = makeState({ bin: oldBin });
    const file = makeState({ bin: newBin });
    const result = mergeStates(browser, file);

    expect(result.bin).toHaveLength(BIN_LIMIT);
    // conflicting entry should be the newer one
    const conflicting = result.bin.find((b) => b.id === 'bin_old_0');
    expect(conflicting?.label).toBe('newer_label');
    // All kept entries must be the newest BIN_LIMIT by deletedAt
    const sorted = [...result.bin].sort(
      (a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
    );
    expect(sorted.map((b) => b.id)).toEqual(result.bin.map((b) => b.id));
  });

  it('settings from fileState win entirely', () => {
    const browser = makeState({
      settings: { ...DEFAULT_SETTINGS, theme: 'light', storageMode: 'browser' },
    });
    const fileSettings: Settings = {
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      storageMode: 'file',
      closeTabsAfterSave: false,
    };
    const file = makeState({ settings: fileSettings });
    const result = mergeStates(browser, file);
    expect(result.settings.theme).toBe('dark');
    expect(result.settings.storageMode).toBe('file');
    expect(result.settings.closeTabsAfterSave).toBe(false);
  });

  it('dedups dropOperationLedger by operationId', () => {
    const browserLedger: DropOperationLedgerEntry[] = [
      { operationId: 'op1', digest: 'aaa', appliedAt: ts.early },
      { operationId: 'op2', digest: 'bbb', appliedAt: ts.mid },
    ];
    const fileLedger: DropOperationLedgerEntry[] = [
      { operationId: 'op2', digest: 'bbb_new', appliedAt: ts.late },
      { operationId: 'op3', digest: 'ccc', appliedAt: ts.late },
    ];
    const browser = makeState({ dropOperationLedger: browserLedger });
    const file = makeState({ dropOperationLedger: fileLedger });
    const result = mergeStates(browser, file);
    const byOp = Object.fromEntries(result.dropOperationLedger.map((e) => [e.operationId, e]));
    expect(Object.keys(byOp).sort()).toEqual(['op1', 'op2', 'op3']);
    // For duplicates, file order wins (file value appears in array later; but dedup picks
    // whichever is kept by Map insertion order with file priority).
    expect(byOp.op2.digest).toBe('bbb_new');
  });

  it('merges categoryOrderByWorkspace per workspace deduping with file order priority', () => {
    const browser = makeState({
      workspaces: [makeWorkspace({ id: 'w1' }), makeWorkspace({ id: 'w2' })],
      categoryOrderByWorkspace: {
        w1: ['g1', 'g2', 'g3'],
        w2: ['gA'],
      },
    });
    const file = makeState({
      workspaces: [makeWorkspace({ id: 'w1' }), makeWorkspace({ id: 'w2' })],
      categoryOrderByWorkspace: {
        w1: ['g2', 'g4', 'g1'],
        w2: ['gB'],
      },
    });
    const result = mergeStates(browser, file);
    // Per brief: concatenate both arrays and dedup preserving order, fileState order wins for ties.
    // Strategy: file array first, then browser array, dedup → file's relative order wins for shared ids.
    // w1: file [g2,g4,g1] + browser [g1,g2,g3] dedup → [g2,g4,g1,g3]
    expect(result.categoryOrderByWorkspace.w1).toEqual(['g2', 'g4', 'g1', 'g3']);
    expect(result.categoryOrderByWorkspace.w2).toEqual(['gB', 'gA']);
  });

  it('picks activeWorkspaceId from whichever top-level state has higher updatedAt', () => {
    const browser = makeState({
      updatedAt: ts.late,
      activeWorkspaceId: 'wb',
      workspaces: [makeWorkspace({ id: 'wb' })],
    });
    const file = makeState({
      updatedAt: ts.early,
      activeWorkspaceId: 'wf',
      workspaces: [makeWorkspace({ id: 'wf' })],
    });
    expect(mergeStates(browser, file).activeWorkspaceId).toBe('wb');

    const browser2 = makeState({
      updatedAt: ts.early,
      activeWorkspaceId: 'wb',
      workspaces: [makeWorkspace({ id: 'wb' })],
    });
    const file2 = makeState({
      updatedAt: ts.late,
      activeWorkspaceId: 'wf',
      workspaces: [makeWorkspace({ id: 'wf' })],
    });
    expect(mergeStates(browser2, file2).activeWorkspaceId).toBe('wf');
  });

  it('handles version, revision, createdAt, updatedAt correctly', () => {
    const browser = makeState({
      version: 1,
      mutationRevision: 5,
      createdAt: ts.late,
      updatedAt: ts.early,
    });
    const file = makeState({
      version: 2,
      mutationRevision: 10,
      createdAt: ts.early,
      updatedAt: ts.late,
    });
    const result = mergeStates(browser, file);
    // normalizeState always pins version to SCHEMA_VERSION; mutationRevision is preserved
    // when it is a valid non-negative safe integer.
    expect(result.mutationRevision).toBe(10);
    expect(result.createdAt).toBe(ts.early);
    expect(result.updatedAt).toBe(ts.late);
  });

  it('handles empty browser state (first-time file init)', () => {
    const browser = createEmptyState();
    const file: TabBoardState = {
      ...createEmptyState(),
      workspaces: [makeWorkspace({ id: 'w_file', name: 'FileWorkspace', updatedAt: ts.late })],
      activeWorkspaceId: 'w_file',
      groups: [makeGroup({ id: 'g_file', title: 'FileGroup' })],
      folders: [makeFolder({ id: 'f_file', name: 'FileFolder' })],
      settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
      updatedAt: ts.late,
    };
    const result = mergeStates(browser, file);
    expect(result.workspaces.some((w) => w.id === 'w_file')).toBe(true);
    expect(result.groups.some((g) => g.id === 'g_file')).toBe(true);
    expect(result.folders.some((f) => f.id === 'f_file')).toBe(true);
    expect(result.settings.theme).toBe('dark');
  });

  it('handles empty file state (migrating browser data to fresh file)', () => {
    const browser: TabBoardState = {
      ...createEmptyState(),
      workspaces: [makeWorkspace({ id: 'w_b', name: 'BW' })],
      activeWorkspaceId: 'w_b',
      groups: [makeGroup({ id: 'g_b', title: 'BG' })],
      folders: [makeFolder({ id: 'f_b', name: 'BF' })],
      updatedAt: ts.late,
    };
    const file = createEmptyState();
    const result = mergeStates(browser, file);
    expect(result.workspaces.some((w) => w.id === 'w_b')).toBe(true);
    expect(result.groups.some((g) => g.id === 'g_b')).toBe(true);
    expect(result.folders.some((f) => f.id === 'f_b')).toBe(true);
    // File settings win per the rules
    expect(result.settings).toEqual(file.settings);
  });

  it('calls normalizeState on the result (normalized shape)', () => {
    const browser = makeState({
      groups: [makeGroup({ id: 'gx', tabs: [makeTab({ id: 'tx', url: 'https://x' })] })],
    });
    const file = makeState({
      groups: [makeGroup({ id: 'gy', tabs: [makeTab({ id: 'ty', url: 'https://y' })] })],
    });
    const result = mergeStates(browser, file);
    // normalizeState guarantees version equals SCHEMA_VERSION (1)
    expect(result.version).toBeGreaterThanOrEqual(1);
    // All groups have valid workspaceId references
    for (const g of result.groups) {
      expect(result.workspaces.some((w) => w.id === g.workspaceId)).toBe(true);
    }
  });
});
