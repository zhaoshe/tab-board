import { describe, expect, it } from 'vitest';
import { createEmptyState, type Folder, type Group, type TabBoardState, type TabItem, type Workspace } from '../../shared/model';
import type { OpenTabInfo } from './open-tabs';
import { executeDropIntent } from './commands';
import {
  clearDragState,
  getDragPlaceholderStyle,
  getTabDropPlacement,
  isDragSourceStillRendered,
  lockDropTarget,
  resolveDrop,
  IDLE_DRAG_STATE,
  type DragPayload,
  type DragUiState,
  type DropIntent,
  type DropTarget,
} from './dnd';

const timestamp = '2026-01-01T00:00:00.000Z';

describe('drag placeholder geometry', () => {
  it('keeps drag-start dimensions after sortable remeasurement', () => {
    const sourceRect = { left: 10, top: 20, width: 320, height: 240 };
    const initialStyle = getDragPlaceholderStyle(sourceRect);
    const remeasuredRect = { ...sourceRect, width: 360, height: 280 };

    expect(initialStyle).toEqual({ width: 320, height: 240 });
    expect(getDragPlaceholderStyle(sourceRect)).toEqual(initialStyle);
    expect(getDragPlaceholderStyle(remeasuredRect)).toEqual({ width: 360, height: 280 });
  });
});

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

function tab(id: string, title = id): TabItem {
  return {
    id,
    itemType: 'link',
    title,
    url: `https://${id}.test`,
    favIconUrl: '',
    note: '',
    pinned: false,
    incognito: false,
    starred: false,
    taskStatus: '',
    browserGroup: null,
    sourceWindowId: 7,
    sourceTabId: Number(id.replace(/\D/g, '')) || null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function group(
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
    collapsed: false,
    tabs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function fixtureState(): TabBoardState {
  const sourceTabs = ['a', 'b', 'c', 'd'].map((id) => tab(id));
  return {
    ...createEmptyState(),
    workspaces: [workspace('workspace-a'), workspace('workspace-b')],
    activeWorkspaceId: 'workspace-a',
    folders: [folder('folder-a', 'workspace-a'), folder('folder-b', 'workspace-b')],
    categoryOrderByWorkspace: {
      'workspace-a': ['inbox', 'starred', 'folder:folder-a'],
    },
    groups: [
      group('source', 'workspace-a', { tabs: sourceTabs }),
      group('target', 'workspace-a', { tabs: [tab('target-1'), tab('target-2')] }),
      group('folder-group', 'workspace-a', { folderId: 'folder-a', tabs: [tab('folder-tab')] }),
      group('other-workspace', 'workspace-b', { tabs: [tab('other-tab')] }),
    ],
  };
}

function payload(kind: DragPayload['kind']): DragPayload;
function payload(kind: 'group'): Extract<DragPayload, { kind: 'group' }>;
function payload(kind: 'category'): Extract<DragPayload, { kind: 'category' }>;
function payload(kind: 'tab'): Extract<DragPayload, { kind: 'tab' }>;
function payload(kind: 'tabs'): Extract<DragPayload, { kind: 'tabs' }>;
function payload(kind: 'open-tabs'): Extract<DragPayload, { kind: 'open-tabs' }>;
function payload(kind: DragPayload['kind']): DragPayload {
  switch (kind) {
    case 'group':
      return { kind, groupId: 'source', workspaceId: 'workspace-a' };
    case 'category':
      return { kind, categoryId: 'folder:folder-a', workspaceId: 'workspace-a' };
    case 'tab':
      return { kind, groupId: 'source', tabId: 'b', workspaceId: 'workspace-a' };
    case 'tabs':
      return {
        kind,
        refs: [{ groupId: 'source', tabId: 'b' }, { groupId: 'source', tabId: 'c' }],
        workspaceId: 'workspace-a',
      };
    case 'open-tabs':
      return { kind, tabIds: [101, 102], windowId: 7, workspaceId: 'workspace-a' };
  }
}

function target(kind: DropTarget['kind']): DropTarget;
function target(kind: 'group-body'): Extract<DropTarget, { kind: 'group-body' }>;
function target(kind: 'tab-before'): Extract<DropTarget, { kind: 'tab-before' }>;
function target(kind: 'new-group'): Extract<DropTarget, { kind: 'new-group' }>;
function target(kind: 'group-insert'): Extract<DropTarget, { kind: 'group-insert' }>;
function target(kind: 'category-column'): Extract<DropTarget, { kind: 'category-column' }>;
function target(kind: 'category-reorder'): Extract<DropTarget, { kind: 'category-reorder' }>;
function target(kind: DropTarget['kind']): DropTarget {
  switch (kind) {
    case 'group-body':
      return { kind, groupId: 'target', workspaceId: 'workspace-a' };
    case 'tab-before':
      return { kind, groupId: 'target', tabId: 'target-2', index: 1, workspaceId: 'workspace-a' };
    case 'new-group':
      return { kind, category: 'folder:folder-a', index: 1, workspaceId: 'workspace-a' };
    case 'group-insert':
      return { kind, category: 'folder:folder-a', index: 1, workspaceId: 'workspace-a' };
    case 'category-column':
      return { kind, category: 'starred', workspaceId: 'workspace-a' };
    case 'category-reorder':
      return { kind, categoryId: 'starred', placement: 'before', workspaceId: 'workspace-a' };
  }
}

function openTab(id: number, title = `Open ${id}`): OpenTabInfo {
  return {
    id,
    windowId: 7,
    title,
    url: `https://open-${id}.test`,
    favIconUrl: '',
    active: false,
    pinned: false,
    index: id,
    browserGroup: null,
    storable: true,
    reason: null,
  };
}

describe('resolveDrop', () => {
  it('rejects Open Tabs without the captured records required for validation', () => {
    const state = fixtureState();
    const openTabs = [openTab(101), openTab(102)];
    const input = {
      payload: payload('open-tabs'),
      target: target('new-group'),
      state,
      openTabs,
    };

    expect(resolveDrop({ ...input, openTabs: [] })).toBeNull();
    expect(resolveDrop(input)).not.toBeNull();
    expect(resolveDrop({
      ...input,
      openTabs: [{ ...openTabs[0], storable: false }],
    })).toBeNull();
    expect(resolveDrop({
      ...input,
      openTabs: openTabs.map((tab) => ({ ...tab, windowId: 8 })),
    })).toBeNull();
  });

  it('rejects forged storable Open Tabs records hidden by custom filter rules', () => {
    const state = {
      ...fixtureState(),
      settings: { ...fixtureState().settings, customUrlFilter: 'open-101.test' },
    };
    const forged = [{ ...openTab(101), pinned: true, storable: true }];

    expect(resolveDrop({
      payload: { ...payload('open-tabs'), tabIds: [101] },
      target: target('new-group'),
      state,
      openTabs: forged,
    })).toBeNull();
  });

  it('preserves an explicit after placement for lower tab edges', () => {
    const result = resolveDrop({
      payload: payload('tabs'),
      target: {
        kind: 'tab-before',
        groupId: 'target',
        tabId: 'target-1',
        index: 0,
        placement: 'after',
        workspaceId: 'workspace-a',
      },
      state: fixtureState(),
    });

    expect(result).toMatchObject({ kind: 'move-tabs', targetGroupId: 'target', targetIndex: 1 });
  });

  it('recognizes when a saved drag source disappears from the rendered list', () => {
    const source = group('source', 'workspace-a', { tabs: [tab('source-tab')] });
    const dragPayload = { kind: 'tab' as const, groupId: source.id, tabId: 'source-tab', workspaceId: source.workspaceId };

    expect(isDragSourceStillRendered(dragPayload, [source])).toBe(true);
    expect(isDragSourceStillRendered(dragPayload, [])).toBe(false);
    expect(isDragSourceStillRendered(dragPayload, [group(source.id, source.workspaceId)])).toBe(false);
  });

  it.each([
    ['group', 'group-insert', 'move-session'],
    ['group', 'category-column', 'move-session'],
    ['category', 'category-reorder', 'reorder-category'],
    ['tab', 'group-body', 'move-tabs'],
    ['tabs', 'tab-before', 'move-tabs'],
    ['open-tabs', 'group-body', 'copy-open-tabs'],
    ['open-tabs', 'new-group', 'create-session'],
  ] as const)('resolves %s onto %s as %s', (sourceKind, targetKind, intentKind) => {
    const result = resolveDrop({
      payload: payload(sourceKind),
      target: target(targetKind),
      state: fixtureState(),
      openTabs: sourceKind === 'open-tabs' ? [openTab(101), openTab(102)] : undefined,
    });

    expect(result?.kind).toBe(intentKind);
  });

  it.each([
    ['tab', 'new-group'],
    ['tabs', 'new-group'],
    ['tab', 'group-insert'],
    ['tabs', 'group-insert'],
    ['tab', 'category-column'],
    ['tabs', 'category-column'],
    ['open-tabs', 'tab-before'],
    ['open-tabs', 'group-insert'],
    ['open-tabs', 'category-column'],
  ] as const)('accepts %s onto %s', (sourceKind, targetKind) => {
    expect(resolveDrop({
      payload: payload(sourceKind),
      target: target(targetKind),
      state: fixtureState(),
      openTabs: sourceKind === 'open-tabs' ? [openTab(101), openTab(102)] : undefined,
    })).not.toBeNull();
  });

  it('rejects a session onto a session body instead of merging sessions', () => {
    expect(resolveDrop({
      payload: payload('group'),
      target: target('group-body'),
      state: fixtureState(),
    })).toBeNull();
  });

  it('rejects cross-workspace and inactive-workspace drops', () => {
    const state = fixtureState();
    expect(resolveDrop({
      payload: { ...payload('tab'), workspaceId: 'workspace-b' },
      target: target('group-body'),
      state,
    })).toBeNull();
    expect(resolveDrop({
      payload: payload('tab'),
      target: { ...target('group-body'), workspaceId: 'workspace-b' },
      state,
    })).toBeNull();
    expect(resolveDrop({
      payload: { ...payload('tab'), workspaceId: 'workspace-b' },
      target: { ...target('group-body'), groupId: 'other-workspace', workspaceId: 'workspace-b' },
      state: { ...state, activeWorkspaceId: 'workspace-b' },
    })).toBeNull();
  });

  it('rejects missing ownership, invalid category, and invalid indexes', () => {
    const state = fixtureState();
    expect(resolveDrop({
      payload: { ...payload('tab'), groupId: 'missing' },
      target: target('group-body'),
      state,
    })).toBeNull();
    expect(resolveDrop({
      payload: payload('tab'),
      target: { ...target('tab-before'), tabId: 'missing' },
      state,
    })).toBeNull();
    expect(resolveDrop({
      payload: payload('group'),
      target: { ...target('group-insert'), category: 'folder:missing' },
      state,
    })).toBeNull();
    expect(resolveDrop({
      payload: payload('tab'),
      target: { ...target('new-group'), index: -1 },
      state,
    })).toBeNull();
    expect(resolveDrop({
      payload: payload('tab'),
      target: { ...target('tab-before'), index: 99 },
      state,
    })).toBeNull();
  });

  it('rejects empty, unsafe, and duplicate Open Tabs payloads', () => {
    const state = fixtureState();
    const base = payload('open-tabs');
    expect(resolveDrop({ payload: { ...base, tabIds: [] }, target: target('new-group'), state })).toBeNull();
    expect(resolveDrop({ payload: { ...base, tabIds: [101, 101] }, target: target('new-group'), state })).toBeNull();
    expect(resolveDrop({ payload: { ...base, tabIds: [101, Number.MAX_SAFE_INTEGER + 1] }, target: target('new-group'), state })).toBeNull();
    expect(resolveDrop({ payload: { ...base, windowId: Number.NaN }, target: target('new-group'), state })).toBeNull();
  });

  it('returns null for malformed runtime payload boundaries', () => {
    const state = fixtureState();
    const groupTarget = target('group-body');
    expect(resolveDrop({
      payload: { kind: 'tabs', refs: undefined, workspaceId: 'workspace-a' } as unknown as DragPayload,
      target: groupTarget,
      state,
    })).toBeNull();
    expect(resolveDrop({
      payload: { kind: 'open-tabs', tabIds: undefined, windowId: 7, workspaceId: 'workspace-a' } as unknown as DragPayload,
      target: groupTarget,
      state,
    })).toBeNull();
    expect(resolveDrop({
      payload: { kind: 'category', categoryId: 42, workspaceId: 'workspace-a' } as unknown as DragPayload,
      target: { kind: 'category-reorder', categoryId: 'starred', placement: 'before', workspaceId: 'workspace-a' },
      state,
    })).toBeNull();
  });

  it('rejects unknown kinds, malformed categories, invalid placement, and mismatched tab indexes', () => {
    const state = fixtureState();
    expect(resolveDrop({
      payload: { kind: 'unknown', tabIds: [101], windowId: 7, workspaceId: 'workspace-a' } as unknown as DragPayload,
      target: target('group-body'),
      state,
    })).toBeNull();
    expect(resolveDrop({
      payload: payload('group'),
      target: { kind: 'group-insert', category: 42, index: 0, workspaceId: 'workspace-a' } as unknown as DropTarget,
      state,
    })).toBeNull();
    expect(resolveDrop({
      payload: payload('tab'),
      target: { kind: 'category-column', category: 42, workspaceId: 'workspace-a' } as unknown as DropTarget,
      state,
    })).toBeNull();
    expect(resolveDrop({
      payload: payload('category'),
      target: { kind: 'category-reorder', categoryId: 'starred', placement: 'sideways', workspaceId: 'workspace-a' } as unknown as DropTarget,
      state,
    })).toBeNull();
    expect(resolveDrop({
      payload: payload('tab'),
      target: { kind: 'tab-before', groupId: 'target', tabId: 'target-2', index: 0, workspaceId: 'workspace-a' },
      state,
    })).toBeNull();
    expect(resolveDrop({
      payload: payload('open-tabs'),
      target: { kind: 'tab-before', groupId: 'target', tabId: 'target-2', index: 0, workspaceId: 'workspace-a' },
      state,
    })).toBeNull();
  });

  it('rejects duplicate refs, missing refs, and a saved tab self-drop', () => {
    const state = fixtureState();
    const duplicateRefs = {
      kind: 'tabs' as const,
      refs: [{ groupId: 'source', tabId: 'b' }, { groupId: 'source', tabId: 'b' }],
      workspaceId: 'workspace-a',
    };
    expect(resolveDrop({ payload: duplicateRefs, target: target('group-body'), state })).toBeNull();
    expect(resolveDrop({
      payload: { ...payload('tabs'), refs: [{ groupId: 'source', tabId: 'missing' }] },
      target: target('group-body'),
      state,
    })).toBeNull();
    expect(resolveDrop({
      payload: payload('tab'),
      target: { kind: 'tab-before', groupId: 'source', tabId: 'b', index: 1, workspaceId: 'workspace-a' },
      state,
    })).toBeNull();
  });

  it('corrects same-session downward insertion after removing one source tab', () => {
    const result = resolveDrop({
      payload: payload('tab'),
      target: { kind: 'tab-before', groupId: 'source', tabId: 'd', index: 3, workspaceId: 'workspace-a' },
      state: fixtureState(),
    });

    expect(result).toMatchObject({ kind: 'move-tabs', targetGroupId: 'source', targetIndex: 2 });
  });

  it('corrects same-session downward insertion for multiple and mixed-source tabs', () => {
    const state = fixtureState();
    const multi = resolveDrop({
      payload: {
        kind: 'tabs',
        refs: [{ groupId: 'source', tabId: 'a' }, { groupId: 'source', tabId: 'b' }],
        workspaceId: 'workspace-a',
      },
      target: { kind: 'tab-before', groupId: 'source', tabId: 'd', index: 3, workspaceId: 'workspace-a' },
      state,
    });
    const mixed = resolveDrop({
      payload: {
        kind: 'tabs',
        refs: [{ groupId: 'source', tabId: 'b' }, { groupId: 'folder-group', tabId: 'folder-tab' }],
        workspaceId: 'workspace-a',
      },
      target: { kind: 'tab-before', groupId: 'source', tabId: 'd', index: 3, workspaceId: 'workspace-a' },
      state,
    });

    expect(multi).toMatchObject({ kind: 'move-tabs', targetIndex: 1 });
    expect(mixed).toMatchObject({ kind: 'move-tabs', targetIndex: 2 });
  });

  it('does not adjust an upward insertion or return a same-position no-op', () => {
    const state = fixtureState();
    const upward = resolveDrop({
      payload: payload('tab'),
      target: { kind: 'tab-before', groupId: 'source', tabId: 'a', index: 0, workspaceId: 'workspace-a' },
      state,
    });
    const noOp = resolveDrop({
      payload: {
        kind: 'tabs',
        refs: [{ groupId: 'source', tabId: 'c' }, { groupId: 'source', tabId: 'd' }],
        workspaceId: 'workspace-a',
      },
      target: { kind: 'tab-before', groupId: 'source', tabId: 'd', index: 3, workspaceId: 'workspace-a' },
      state,
    });

    expect(upward).toMatchObject({ kind: 'move-tabs', targetIndex: 0 });
    expect(noOp).toBeNull();
  });

  it('returns null for a self/no-op group and category reorder', () => {
    const state = fixtureState();
    expect(resolveDrop({
      payload: payload('group'),
      target: { kind: 'group-insert', category: 'inbox', index: 0, workspaceId: 'workspace-a' },
      state,
    })).toBeNull();
    expect(resolveDrop({
      payload: payload('category'),
      target: { kind: 'category-reorder', categoryId: 'folder:folder-a', placement: 'after', workspaceId: 'workspace-a' },
      state,
    })).toBeNull();
  });

  it('rejects category reorder no-ops and resolves real before/after reorders', () => {
    const state = {
      ...fixtureState(),
      categoryOrderByWorkspace: { 'workspace-a': ['inbox', 'starred'] },
    };
    const beforeNoOp = resolveDrop({
      payload: { kind: 'category', categoryId: 'inbox', workspaceId: 'workspace-a' },
      target: { kind: 'category-reorder', categoryId: 'starred', placement: 'before', workspaceId: 'workspace-a' },
      state,
    });
    const afterNoOp = resolveDrop({
      payload: { kind: 'category', categoryId: 'starred', workspaceId: 'workspace-a' },
      target: { kind: 'category-reorder', categoryId: 'inbox', placement: 'after', workspaceId: 'workspace-a' },
      state,
    });
    const beforeReorder = resolveDrop({
      payload: { kind: 'category', categoryId: 'starred', workspaceId: 'workspace-a' },
      target: { kind: 'category-reorder', categoryId: 'inbox', placement: 'before', workspaceId: 'workspace-a' },
      state,
    });
    const afterReorder = resolveDrop({
      payload: { kind: 'category', categoryId: 'inbox', workspaceId: 'workspace-a' },
      target: { kind: 'category-reorder', categoryId: 'starred', placement: 'after', workspaceId: 'workspace-a' },
      state,
    });

    expect(beforeNoOp).toBeNull();
    expect(afterNoOp).toBeNull();
    expect(beforeReorder).toMatchObject({ kind: 'reorder-category', placement: 'before' });
    expect(afterReorder).toMatchObject({ kind: 'reorder-category', placement: 'after' });
  });

  it('preserves raw folder category order while resolving a reorder', () => {
    const state = {
      ...fixtureState(),
      categoryOrderByWorkspace: { 'workspace-a': ['folder-a', 'starred', 'inbox'] },
    };
    const result = resolveDrop({
      payload: { kind: 'category', categoryId: 'starred', workspaceId: 'workspace-a' },
      target: { kind: 'category-reorder', categoryId: 'folder:folder-a', placement: 'before', workspaceId: 'workspace-a' },
      state,
    });

    expect(result).toMatchObject({ kind: 'reorder-category', categoryId: 'starred' });
    expect(executeDropIntent(state, result! ).categoryOrderByWorkspace['workspace-a']).toEqual([
      'starred', 'folder:folder-a', 'inbox',
    ]);
  });
});

describe('executeDropIntent', () => {
  it('preserves saved-session insertion position when source groups are removed', () => {
    const source = group('single-tab-source', 'workspace-a', { tabs: [tab('only')] });
    const anchor = group('anchor', 'workspace-a', { tabs: [tab('anchor-tab')] });
    const before = {
      ...fixtureState(),
      groups: [source, anchor, group('other-workspace', 'workspace-b', { tabs: [tab('other-tab')] })],
    };
    const intent = {
      kind: 'create-session' as const,
      source: { kind: 'saved-tabs' as const, refs: [{ groupId: source.id, tabId: 'only' }] },
      category: 'inbox' as const,
      index: 1,
      workspaceId: 'workspace-a',
    };

    const next = executeDropIntent(before, intent);
    const createdId = next.groups.find((item) => !['anchor', 'other-workspace'].includes(item.id))?.id;

    expect(createdId).toBeDefined();
    expect(next.groups.map(({ id }) => id)).toEqual([createdId, 'anchor', 'other-workspace']);

    const emptyWorkspaceBefore = {
      ...fixtureState(),
      groups: [source, group('other-workspace', 'workspace-b', { tabs: [tab('other-tab')] })],
    };
    const emptyWorkspaceNext = executeDropIntent(emptyWorkspaceBefore, { ...intent, index: 0 });
    const emptyWorkspaceCreatedId = emptyWorkspaceNext.groups.find((item) => item.id !== 'other-workspace')?.id;

    expect(emptyWorkspaceNext.groups.map(({ id }) => id)).toEqual([emptyWorkspaceCreatedId, 'other-workspace']);
  });

  it('rejects partial saved-tab sessions but accepts all-valid refs', () => {
    const before = fixtureState();
    const missingRef = {
      kind: 'create-session' as const,
      source: { kind: 'saved-tabs' as const, refs: [
        { groupId: 'source', tabId: 'b' },
        { groupId: 'source', tabId: 'missing' },
      ] },
      category: 'inbox' as const,
      index: 0,
      workspaceId: 'workspace-a',
    };
    const duplicateRef = {
      ...missingRef,
      source: { kind: 'saved-tabs' as const, refs: [
        { groupId: 'source', tabId: 'b' },
        { groupId: 'source', tabId: 'b' },
      ] },
    };
    const valid = {
      ...missingRef,
      source: { kind: 'saved-tabs' as const, refs: [
        { groupId: 'source', tabId: 'b' },
        { groupId: 'source', tabId: 'c' },
      ] },
    };

    expect(executeDropIntent(before, missingRef)).toBe(before);
    expect(executeDropIntent(before, duplicateRef)).toBe(before);
    expect(executeDropIntent(before, valid)).not.toBe(before);
  });

  it('rejects partial Open Tabs records for copy and session creation', () => {
    const before = fixtureState();
    const openTabs = [openTab(101)];
    const copyIntent = {
      kind: 'copy-open-tabs' as const,
      tabIds: [101, 102],
      windowId: 7,
      targetGroupId: 'target',
      targetIndex: 0,
      workspaceId: 'workspace-a',
    };
    const createIntent = {
      kind: 'create-session' as const,
      source: { kind: 'open-tabs' as const, tabIds: [101, 102], windowId: 7 },
      category: 'inbox' as const,
      index: 0,
      workspaceId: 'workspace-a',
    };

    expect(executeDropIntent(before, copyIntent, openTabs)).toBe(before);
    expect(executeDropIntent(before, createIntent, openTabs)).toBe(before);
  });

  it('rejects forged intents outside the active workspace without mutation', () => {
    const before = fixtureState();
    const forgedIntents: DropIntent[] = [
      {
        kind: 'move-tabs',
        refs: [{ groupId: 'other-workspace', tabId: 'other-tab' }],
        targetGroupId: 'target',
        targetIndex: 0,
        workspaceId: 'workspace-a',
      },
      {
        kind: 'create-session',
        source: { kind: 'saved-tabs', refs: [{ groupId: 'other-workspace', tabId: 'other-tab' }] },
        category: 'folder:folder-a',
        index: 0,
        workspaceId: 'workspace-a',
      },
      {
        kind: 'move-session',
        groupId: 'source',
        category: 'inbox',
        index: 0,
        workspaceId: 'workspace-b',
      },
      {
        kind: 'reorder-category',
        categoryId: 'inbox',
        targetCategoryId: 'starred',
        placement: 'before',
        workspaceId: 'workspace-b',
      },
      {
        kind: 'copy-open-tabs',
        tabIds: [101],
        windowId: 7,
        targetGroupId: 'target',
        targetIndex: 0,
        workspaceId: 'workspace-b',
      },
      {
        kind: 'create-session',
        source: { kind: 'open-tabs', tabIds: [101], windowId: 7 },
        category: 'inbox',
        index: 0,
        workspaceId: 'workspace-b',
      },
    ];

    for (const intent of forgedIntents) {
      expect(executeDropIntent(before, intent, [openTab(101)])).toBe(before);
    }
  });

  it('executes session, category, saved-tab, Open Tabs, and new-session intents immutably', () => {
    const before = fixtureState();
    const moveSession = resolveDrop({ payload: payload('group'), target: target('group-insert'), state: before });
    const reorderCategory = resolveDrop({ payload: payload('category'), target: target('category-reorder'), state: before });
    const moveSavedTabs = resolveDrop({
      payload: payload('tabs'),
      target: { kind: 'tab-before', groupId: 'target', tabId: 'target-2', index: 1, workspaceId: 'workspace-a' },
      state: before,
    });
    const openTabRecords = [openTab(101), openTab(102)];
    const copyOpenTabs = resolveDrop({ payload: payload('open-tabs'), target: target('group-body'), state: before, openTabs: openTabRecords });
    const createOpenSession = resolveDrop({ payload: payload('open-tabs'), target: target('new-group'), state: before, openTabs: openTabRecords });
    const createSavedSession = resolveDrop({ payload: payload('tab'), target: target('new-group'), state: before });
    if (!moveSession || !reorderCategory || !moveSavedTabs || !copyOpenTabs || !createOpenSession || !createSavedSession) {
      throw new Error('Expected all command intents to resolve.');
    }

    const movedSession = executeDropIntent(before, moveSession);
    const reordered = executeDropIntent(before, reorderCategory);
    const movedTabs = executeDropIntent(before, moveSavedTabs);
    const copied = executeDropIntent(before, copyOpenTabs, [openTab(101), openTab(102)]);
    const openSession = executeDropIntent(before, createOpenSession, [openTab(101), openTab(102)]);
    const savedSession = executeDropIntent(before, createSavedSession);

    expect(movedSession).not.toBe(before);
    expect(movedSession.groups.find((item) => item.id === 'source')).toMatchObject({ folderId: 'folder-a' });
    expect(reordered.categoryOrderByWorkspace['workspace-a']).toEqual(['inbox', 'folder:folder-a', 'starred']);
    expect(movedTabs.groups.find((item) => item.id === 'target')?.tabs.map((item) => item.id)).toEqual([
      'target-1', 'b', 'c', 'target-2',
    ]);
    expect(copied.groups.find((item) => item.id === 'target')?.tabs).toHaveLength(4);
    expect(openSession.groups.find((item) => item.id !== 'folder-group' && item.folderId === 'folder-a')?.tabs).toHaveLength(2);
    expect(savedSession.groups.some((item) => item.id !== 'source' && item.tabs.some((item) => item.id === 'b'))).toBe(true);
    expect(savedSession.groups.find((item) => item.id === 'source')?.updatedAt).not.toBe(timestamp);
    expect(before.groups.find((item) => item.id === 'source')?.tabs.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('drag UI geometry and cleanup', () => {
  it('keeps a locked target until pointer leaves release margin', () => {
    const previousTarget: DropTarget = {
      kind: 'group-body',
      groupId: 'target',
      workspaceId: 'workspace-a',
    };
    const candidateTarget: DropTarget = {
      kind: 'tab-before',
      groupId: 'target',
      tabId: 'target-2',
      index: 1,
      workspaceId: 'workspace-a',
    };

    expect(lockDropTarget(previousTarget, candidateTarget, { distance: 6, releaseMargin: 12 }))
      .toEqual(previousTarget);
  });

  it('switches to a candidate after leaving the release margin', () => {
    const previousTarget: DropTarget = {
      kind: 'group-body',
      groupId: 'target',
      workspaceId: 'workspace-a',
    };
    const candidateTarget: DropTarget = {
      kind: 'tab-before',
      groupId: 'target',
      tabId: 'target-2',
      index: 1,
      workspaceId: 'workspace-a',
    };

    expect(lockDropTarget(previousTarget, candidateTarget, { distance: 13, releaseMargin: 12 }))
      .toEqual(candidateTarget);
    expect(lockDropTarget(previousTarget, null, { distance: 13, releaseMargin: 12 })).toBeNull();
  });

  it('clears payload, target, marker, and source rect on cancel', () => {
    const activeDragState: DragUiState = {
      payload: { kind: 'group', groupId: 'source', workspaceId: 'workspace-a' },
      target: { kind: 'group-insert', category: 'inbox', index: 0, workspaceId: 'workspace-a' },
      sourceRect: { width: 100, height: 60, top: 10, left: 20 },
      marker: { kind: 'group', index: 0 },
    };

    expect(clearDragState(activeDragState)).toEqual(IDLE_DRAG_STATE);
    expect(activeDragState.payload).not.toBeNull();
  });

  it.each([
    [0, 'before'],
    [4, 'before'],
    [5, 'body'],
    [15, 'body'],
    [16, 'after'],
    [20, 'after'],
  ] as const)('returns %s placement at rect boundary', (offset, placement) => {
    const rect = { top: 100, height: 20 } as DOMRect;
    expect(getTabDropPlacement(rect, 100 + offset)).toBe(placement);
  });
});
