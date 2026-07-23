import { describe, it, expect } from 'vitest';
import {
  splitState,
  assembleState,
  serializeJson,
  parseJsonFile,
} from './fileSerialization';
import {
  createEmptyState,
  createGroupFromTabRecords,
  createTabRecord,
  createNoteRecord,
  createWorkspace,
  createFolder,
  createBinEntry,
} from '../model';
import { FILE_LAYOUT_VERSION, SCHEMA_VERSION } from '../model/constants';
import type { FileParts } from './fileSerialization';

function populateState() {
  const state = createEmptyState();
  const workspace2 = createWorkspace('Work');
  state.workspaces.push(workspace2);
  const folder = createFolder('Reading', 'blue', workspace2.id);
  state.folders.push(folder);
  state.categoryOrderByWorkspace[workspace2.id] = ['starred', 'inbox', folder.id];

  const g1 = createGroupFromTabRecords(
    [
      createTabRecord({ title: 'A', url: 'https://a.example' } as chrome.tabs.Tab),
      createNoteRecord('a quick note'),
    ],
    { title: 'Saved today', workspaceId: workspace2.id, folderId: folder.id },
  );
  const g2 = createGroupFromTabRecords(
    [createTabRecord({ title: 'B', url: 'https://b.example' } as chrome.tabs.Tab)],
    { title: 'Starred stuff', starred: true, workspaceId: state.activeWorkspaceId },
  );
  state.groups.push(g1, g2);

  state.bin.push(createBinEntry('tab', g1.tabs[0], { groupId: g1.id }));
  state.dropOperationLedger = [
    { operationId: 'op_1', digest: 'sha256:abc', appliedAt: '2026-01-01T00:00:00.000Z' },
  ];
  state.mutationRevision = 7;
  state.settings = { ...state.settings, theme: 'dark' as const, storageMode: 'file' as const };
  state.updatedAt = '2026-07-23T10:00:00.000Z';
  return { state, g1, g2, workspace2, folder };
}

describe('serializeJson', () => {
  it('produces 2-space pretty JSON', () => {
    const out = serializeJson({ a: 1, b: [2, 3] });
    expect(out).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
  });
});

describe('parseJsonFile', () => {
  it('parses valid JSON', () => {
    const parsed = parseJsonFile<{ a: number }>('{"a":1}', 'x.json');
    expect(parsed).toEqual({ a: 1 });
  });

  it('throws a descriptive error including the filename on bad JSON', () => {
    expect(() => parseJsonFile('{not json', 'meta.json')).toThrow(/meta.json/);
  });
});

describe('splitState', () => {
  it('populates meta with schema/file-layout versions and scalar fields', () => {
    const { state } = populateState();
    const parts = splitState(state);
    expect(parts.meta).toEqual({
      version: SCHEMA_VERSION,
      mutationRevision: state.mutationRevision,
      activeWorkspaceId: state.activeWorkspaceId,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      fileLayoutVersion: FILE_LAYOUT_VERSION,
    });
  });

  it('exposes top-level file-shaped fields (settings, workspaces, folders, categoryOrder, bin, ledger)', () => {
    const { state } = populateState();
    const parts = splitState(state);
    expect(parts.settings).toBe(state.settings);
    expect(parts.workspaces).toBe(state.workspaces);
    expect(parts.folders).toBe(state.folders);
    expect(parts.categoryOrderByWorkspace).toBe(state.categoryOrderByWorkspace);
    expect(parts.bin).toBe(state.bin);
    expect(parts.dropOperationLedger).toBe(state.dropOperationLedger);
  });

  it('splits groups into a sessions map keyed by group id', () => {
    const { state, g1, g2 } = populateState();
    const parts = splitState(state);
    expect(parts.sessions.size).toBe(2);
    expect(parts.sessions.get(g1.id)).toBe(g1);
    expect(parts.sessions.get(g2.id)).toBe(g2);
  });

  it('does not include transient flags writeInProgress/migrationInProgress in meta', () => {
    const state = createEmptyState();
    const parts = splitState(state);
    expect(parts.meta).not.toHaveProperty('writeInProgress');
    expect(parts.meta).not.toHaveProperty('migrationInProgress');
  });
});

describe('splitState <-> assembleState round-trip', () => {
  it('round-trips an empty state through split/assemble', () => {
    const state = createEmptyState();
    const parts = splitState(state);
    const restored = assembleState(parts);
    expect(restored).toEqual(state);
  });

  it('round-trips a populated state (workspaces, folders, sessions, bin, ledger, settings)', () => {
    const { state } = populateState();
    const parts = splitState(state);
    const restored = assembleState(parts);
    expect(restored).toEqual(state);
  });

  it('preserves the sessions map contents individually through the JSON serialize/parse cycle', () => {
    const { state, g1, g2 } = populateState();
    const parts = splitState(state);
    // Simulate the file-write layer serializing and re-parsing each session file.
    const parsedSessions = new Map(
      [...parts.sessions.entries()].map(([id, group]) => [
        id,
        JSON.parse(serializeJson(group)) as typeof group,
      ]),
    );
    const rebuilt: FileParts = { ...parts, sessions: parsedSessions };
    const restored = assembleState(rebuilt);
    expect(restored.groups.find((g) => g.id === g1.id)).toEqual(g1);
    expect(restored.groups.find((g) => g.id === g2.id)).toEqual(g2);
  });
});

describe('assembleState normalization', () => {
  it('runs normalizeState so invalid tabs (link without url) are stripped', () => {
    const parts = splitState(createEmptyState());
    // Inject a group with an invalid link tab (no url): normalizeTab returns null,
    // so that tab is dropped from the assembled state.
    const badGroup = {
      id: 'bad',
      title: 'Has invalid tab',
      note: '',
      workspaceId: parts.meta.activeWorkspaceId,
      folderId: null,
      locked: false,
      starred: false,
      archived: false,
      collapsed: false,
      tabs: [
        {
          id: 'tab_bad',
          itemType: 'link' as const,
          title: 'No URL',
          url: '',
          favIconUrl: '',
          note: '',
          pinned: false,
          incognito: false,
          starred: false,
          taskStatus: 'none',
          browserGroup: null,
          sourceWindowId: null,
          sourceTabId: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    parts.sessions.set('bad', badGroup);
    const restored = assembleState(parts);
    const assembled = restored.groups.find((g) => g.id === 'bad');
    expect(assembled).toBeDefined();
    // Invalid tab was stripped by normalizeState -> normalizeTab returns null for link without url.
    expect(assembled!.tabs).toHaveLength(0);
  });

  it('re-pins version to SCHEMA_VERSION even if meta.version drifts', () => {
    const parts = splitState(createEmptyState());
    const tampered: FileParts = {
      ...parts,
      meta: { ...parts.meta, version: 999 as typeof parts.meta.version },
    };
    const restored = assembleState(tampered);
    expect(restored.version).toBe(SCHEMA_VERSION);
  });
});
