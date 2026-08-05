import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applicationFeedbackChannel } from '../../shared/applicationFeedback';
import {
  createEmptyState,
  createNoteRecord,
  DEFAULT_WORKSPACE_EMOJI,
  exportToJson,
  exportToText,
  normalizeState,
  type Folder,
  type Group,
  type TabBoardState,
  type Workspace,
} from '../../shared/model';
import { useTabBoardStore } from '../../shared/store/useTabBoardStore';
import {
  importText,
  parseImportedText,
} from '../../shared/model/session-operations';

const timestamp = '2026-01-01T00:00:00.000Z';

function workspace(id: string): Workspace {
  return {
    id,
    name: id,
    emoji: DEFAULT_WORKSPACE_EMOJI,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
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

function state(overrides: Partial<TabBoardState> = {}): TabBoardState {
  return {
    ...createEmptyState(),
    workspaces: [workspace('workspace-a'), workspace('workspace-b')],
    activeWorkspaceId: 'workspace-a',
    folders: [folder('folder-a', 'workspace-a'), folder('folder-b', 'workspace-b')],
    ...overrides,
  };
}

function link(id: string, title: string, url: string) {
  return {
    id,
    itemType: 'link' as const,
    title,
    url,
    favIconUrl: '',
    note: '',
    pinned: false,
    incognito: false,
    starred: false,
    taskStatus: '',
    browserGroup: null,
    sourceWindowId: null,
    sourceTabId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function group(id: string, overrides: Partial<Group> = {}): Group {
  return {
    id,
    title: id,
    note: '',
    workspaceId: 'workspace-a',
    folderId: null,
    locked: false,
    starred: false,
    archived: false,
    collapsed: false,
    tabs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  useTabBoardStore.setState({ ...createEmptyState(), hydrated: false, persistenceError: null });
});

describe('import commands', () => {
  it('preserves workspace emoji through the TabBoard JSON round trip', () => {
    const before = state({
      workspaces: [{ ...workspace('workspace-a'), emoji: '🧪' }],
    });

    const imported = normalizeState(JSON.parse(exportToJson(before)));

    expect(imported.workspaces[0].emoji).toBe('🧪');
  });

  it('uses the OneTab parser for markdown blocks and preserves expected titles', () => {
    const groups = parseImportedText(
      '# Project links\n[Alpha docs](https://alpha.example)\n[Beta docs](https://beta.example)\n\n# Reading\n[Article](https://article.example)',
    );

    expect(groups.map(({ title }) => title)).toEqual(['Project links', 'Reading']);
    expect(groups[0].tabs.map(({ title }) => title)).toEqual(['Alpha docs', 'Beta docs']);
  });

  it('parses OneTab markdown list markers without creating generic notes', () => {
    const groups = parseImportedText('# Project links\n- [Alpha docs](https://alpha.example)');

    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe('Project links');
    expect(groups[0].tabs).toMatchObject([
      { itemType: 'link', title: 'Alpha docs', url: 'https://alpha.example' },
    ]);
    expect(parseImportedText('- [Bare link](https://bare.example)')[0].tabs).toMatchObject([
      { itemType: 'link', title: 'Bare link', url: 'https://bare.example' },
    ]);
  });

  it('round-trips an Inbox group through the Uncategorized export bucket', () => {
    const before = state({
      workspaces: [workspace('workspace-a')],
      groups: [group('inbox-session', {
        title: 'Inbox session',
        tabs: [link('tab-a', 'Inbox docs', 'https://inbox.example')],
      })],
    });

    const text = exportToText(before);
    const imported = parseImportedText(text);

    expect(text).toContain('--- Uncategorized ---');
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({ title: 'Inbox session', starred: false, folderId: null });
  });

  it('preserves consecutive exported note lines in a TabBoard group', () => {
    const before = state({
      workspaces: [workspace('workspace-a')],
      folders: [folder('folder-a', 'workspace-a')],
      groups: [group('notes', {
        title: 'Session with notes',
        folderId: 'folder-a',
        tabs: [
          link('tab-a', 'Docs title', 'https://docs.example'),
          createNoteRecord('First note', { title: 'First note' }),
          createNoteRecord('[Markdown note](https://note.example)', { title: '[Markdown note](https://note.example)' }),
        ],
      })],
    });

    const imported = parseImportedText(exportToText(before));

    expect(imported[0].tabs.map(({ itemType, note }) => [itemType, note])).toEqual([
      ['link', ''],
      ['note', 'First note'],
      ['note', '[Markdown note](https://note.example)'],
    ]);
  });

  it('round-trips TabBoard text group and tab titles without turning headers into note tabs', () => {
    const before = state({
      workspaces: [workspace('workspace-a')],
      folders: [folder('folder-a', 'workspace-a')],
      groups: [group('source', {
        title: 'Session title',
        folderId: 'folder-a',
        tabs: [link('tab-a', 'Docs title', 'https://docs.example')],
      })],
    });

    const imported = parseImportedText(exportToText(before));

    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({ title: 'Session title', folderId: null, starred: false });
    expect(imported[0].tabs).toHaveLength(1);
    expect(imported[0].tabs[0]).toMatchObject({ itemType: 'link', title: 'Docs title', url: 'https://docs.example' });
    expect(imported[0].tabs.some(({ itemType }) => itemType === 'note')).toBe(false);
  });

  it('imports every group into the requested workspace and folder as unstarred', () => {
    const before = state({
      groups: [group('existing', { starred: true })],
    });

    const after = importText(before, '# One\nhttps://one.example\n\n# Two\nhttps://two.example', {
      workspaceId: 'workspace-a',
      folderId: 'folder-a',
    });

    const imported = after.groups.filter(({ id }) => id !== 'existing');
    expect(imported).toHaveLength(2);
    expect(imported.every(({ workspaceId, folderId, starred }) =>
      workspaceId === 'workspace-a' && folderId === 'folder-a' && !starred)).toBe(true);
    expect(before.groups).toEqual([group('existing', { starred: true })]);
  });

  it('rejects a missing workspace or cross-workspace folder without changing state', () => {
    const before = state();
    const snapshot = structuredClone(before);

    expect(() => importText(before, 'https://example.com', {
      workspaceId: 'missing',
      folderId: null,
    })).toThrow('Workspace not found.');
    expect(() => importText(before, 'https://example.com', {
      workspaceId: 'workspace-a',
      folderId: 'folder-b',
    })).toThrow('Folder does not belong to the requested workspace.');
    expect(before).toEqual(snapshot);
  });

  it('emits an observable store error for invalid import targets', () => {
    const errorEvents: unknown[] = [];
    const unsubscribe = applicationFeedbackChannel.subscribe(
      (feedback) => errorEvents.push(feedback),
    );
    useTabBoardStore.setState({ ...state(), hydrated: true });

    expect(() => useTabBoardStore.getState().importGroups('https://example.com', {
      workspaceId: 'missing',
      folderId: null,
    })).toThrow('Workspace not found.');

    unsubscribe();
    expect(errorEvents).toContainEqual({
      kind: 'operation-failed',
      source: 'import',
      message: 'Workspace not found.',
    });
  });

  it('keeps workspace and category command paths reachable from the current shell', () => {
    const header = [
      'WorkspaceHeader.tsx',
      'WorkspaceMenu.tsx',
      'CategoryManager.tsx',
    ].map((file) => readFileSync(
      new URL(`../components/workspace/${file}`, import.meta.url),
      'utf8',
    )).join('\n');
    const editor = readFileSync(
      new URL('../components/workspace/WorkspaceEditorModal.tsx', import.meta.url),
      'utf8',
    );
    const manager = readFileSync(
      new URL('../components/workspace/WorkspaceManagerModal.tsx', import.meta.url),
      'utf8',
    );
    const sidebar = readFileSync(new URL('../components/sidebar/Sidebar.tsx', import.meta.url), 'utf8');

    expect(header).toContain('const workspaceId = state.addWorkspace(name, emoji)');
    expect(header).toContain('onSelectWorkspace(workspaceId)');
    expect(header).toContain('onUpdateWorkspace={state.updateWorkspace}');
    expect(header).toContain('onUpdateWorkspaceOrder={state.updateWorkspaceOrder}');
    expect(header).toContain('onDeleteWorkspace={state.deleteWorkspace}');
    expect(header).toContain('<WorkspaceEditorModal');
    expect(header).toContain('<WorkspaceManagerModal');
    expect(editor).toContain('await onSubmit({');
    expect(manager).toContain('await onDeleteWorkspace(deletedWorkspaceId)');
    expect(header).toContain('onUpdateOrder={(order, { expectedCategoryOrder }) =>');
    expect(header).toContain('{ expectedCategoryOrder }');
    expect(header).toContain('Manage Categories');
    expect(header).toContain('runValidatedCategoryMutation');
    expect(header).toContain('state.addFolder(workspace.id');
    expect(header).toContain('editingFolderExpected');
    expect(header).toContain('onUpdateFolder(');
    expect(header).toContain('{ name: value, color: selectedColor },');
    expect(header).toContain('runCategoryMutation');
    expect(header).toContain('onDeleteFolder(folderId)');
    expect(sidebar).not.toContain('addFolder');
    expect(sidebar).not.toContain('renameFolder');
    expect(sidebar).not.toContain('deleteFolder');
  });

  it('keeps ExportModal exports on the persisted snapshot contract', () => {
    const exportModal = readFileSync(new URL('../components/import-export/ExportModal.tsx', import.meta.url), 'utf8');

    expect(exportModal).toContain('const snapshot = useTabBoardStore(persistedSnapshot);');
    expect(exportModal).toContain('exportToText(snapshot)');
    expect(exportModal).not.toContain('useTabBoardStore((state) => state)');
  });
});
