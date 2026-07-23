import { describe, expect, it } from 'vitest';
import {
  createEmptyState,
  type Folder,
  type Group,
  type TabBoardState,
  type TabItem,
  type Workspace,
} from '../model';
import { structurallyShareState } from './stateStructuralSharing';

const timestamp = '2026-01-01T00:00:00.000Z';

function workspace(id: string): Workspace {
  return { id, name: id, createdAt: timestamp, updatedAt: timestamp };
}

function folder(id: string, workspaceId: string): Folder {
  return {
    id,
    name: id,
    color: 'slate',
    workspaceId,
    collapsed: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function tab(id: string): TabItem {
  return {
    id,
    itemType: 'link',
    title: id,
    url: `https://${id}.test`,
    favIconUrl: '',
    note: '',
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

function group(id: string, workspaceId: string, tabs: TabItem[] = []): Group {
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
    tabs,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function state(): TabBoardState {
  return {
    ...createEmptyState(),
    workspaces: [workspace('workspace-a'), workspace('workspace-b')],
    activeWorkspaceId: 'workspace-a',
    folders: [folder('folder-a', 'workspace-a'), folder('folder-b', 'workspace-b')],
    groups: [
      group('group-a', 'workspace-a', [tab('tab-a')]),
      group('group-b', 'workspace-b', [tab('tab-b')]),
    ],
    categoryOrderByWorkspace: {
      'workspace-a': ['inbox', 'saved'],
      'workspace-b': ['archive', 'inbox'],
    },
  };
}

describe('authoritative state structural sharing', () => {
  it('reuses unchanged entities and collections after normalization clones them', () => {
    const previous = state();
    const next = structuredClone(previous);
    next.mutationRevision += 1;
    next.updatedAt = '2026-01-02T00:00:00.000Z';

    const shared = structurallyShareState(previous, next);

    expect(shared.groups).toBe(previous.groups);
    expect(shared.groups[0]).toBe(previous.groups[0]);
    expect(shared.groups[0].tabs).toBe(previous.groups[0].tabs);
    expect(shared.groups[0].tabs[0]).toBe(previous.groups[0].tabs[0]);
    expect(shared.folders).toBe(previous.folders);
    expect(shared.workspaces).toBe(previous.workspaces);
    expect(shared.settings).toBe(previous.settings);
    expect(shared.categoryOrderByWorkspace).toBe(previous.categoryOrderByWorkspace);
  });

  it('replaces a changed group while preserving its unchanged nested tabs and unrelated entities', () => {
    const previous = state();
    const next = structuredClone(previous);
    next.groups[1] = { ...next.groups[1], title: 'Changed in workspace B' };

    const shared = structurallyShareState(previous, next);

    expect(shared.groups).not.toBe(previous.groups);
    expect(shared.groups[0]).toBe(previous.groups[0]);
    expect(shared.groups[1]).not.toBe(previous.groups[1]);
    expect(shared.groups[1].tabs).toBe(previous.groups[1].tabs);
    expect(shared.groups[1].tabs[0]).toBe(previous.groups[1].tabs[0]);
    expect(shared.folders).toBe(previous.folders);
  });

  it('preserves entity references when collections are reordered or extended', () => {
    const previous = state();
    const next = structuredClone(previous);
    next.groups = [group('group-new', 'workspace-b'), next.groups[1], next.groups[0]];

    const shared = structurallyShareState(previous, next);

    expect(shared.groups).not.toBe(previous.groups);
    expect(shared.groups[1]).toBe(previous.groups[1]);
    expect(shared.groups[2]).toBe(previous.groups[0]);
  });

  it('only replaces changed settings and category-order branches', () => {
    const previous = state();
    const next = structuredClone(previous);
    next.settings = { ...next.settings, theme: 'dark' };
    next.categoryOrderByWorkspace = {
      ...next.categoryOrderByWorkspace,
      'workspace-b': ['inbox', 'archive'],
    };

    const shared = structurallyShareState(previous, next);

    expect(shared.settings).not.toBe(previous.settings);
    expect(shared.categoryOrderByWorkspace).not.toBe(previous.categoryOrderByWorkspace);
    expect(shared.categoryOrderByWorkspace['workspace-a']).toBe(previous.categoryOrderByWorkspace['workspace-a']);
    expect(shared.categoryOrderByWorkspace['workspace-b']).not.toBe(previous.categoryOrderByWorkspace['workspace-b']);
  });
});
