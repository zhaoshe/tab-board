import { describe, expect, it } from 'vitest';
import { createEmptyState, type Folder, type Group, type TabBoardState, type TabItem, type Workspace } from '../../shared/model';
import type { OpenTabInfo } from './open-tabs';
import { executeDropIntent } from '../../shared/model/drop-operations';
import * as dndCore from './dnd';
import {
  clearDragState,
  createDragPreviewGeometry,
  createDragPreviewItems,
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

describe('readable drag preview geometry', () => {
  const sourceRect = { left: 10, top: 20, width: 314, height: 48 };
  const desktopBounds = { width: 960, height: 560 };
  const expectFiniteMinimumCells = (
    geometry: ReturnType<typeof createDragPreviewGeometry>,
    minimum: { width: number; height: number },
  ) => {
    expect(Number.isFinite(geometry.previewRect.width)).toBe(true);
    expect(Number.isFinite(geometry.previewRect.height)).toBe(true);
    expect(Number.isFinite(geometry.previewLayout.columns)).toBe(true);
    expect(Number.isFinite(geometry.previewLayout.rows)).toBe(true);
    expect(geometry.previewRect.width / geometry.previewLayout.columns)
      .toBeGreaterThanOrEqual(minimum.width);
    expect(geometry.previewRect.height / geometry.previewLayout.rows)
      .toBeGreaterThanOrEqual(minimum.height);
  };

  it('keeps one item at source size and expands five items to readable rows', () => {
    expect(createDragPreviewGeometry(sourceRect, 1, desktopBounds)).toEqual({
      previewRect: sourceRect,
      previewLayout: { columns: 1, mode: 'details', rows: 1 },
    });
    expect(createDragPreviewGeometry(sourceRect, 5, desktopBounds)).toEqual({
      previewRect: { ...sourceRect, height: 140 },
      previewLayout: { columns: 1, mode: 'details', rows: 5 },
    });
  });

  it('fits all 128 legal items in a finite readable desktop envelope', () => {
    expect(createDragPreviewGeometry(sourceRect, 128, desktopBounds)).toEqual({
      previewRect: { ...sourceRect, width: 952, height: 532 },
      previewLayout: { columns: 7, mode: 'details', rows: 19 },
    });
  });

  it('uses finite identity tiles when full title/domain rows cannot fit', () => {
    const geometry = createDragPreviewGeometry(
      sourceRect,
      128,
      { width: 314, height: 240 },
    );
    expect(geometry).toEqual({
      previewRect: { ...sourceRect, height: 240 },
      previewLayout: { columns: 9, mode: 'identity', rows: 15 },
    });
    expectFiniteMinimumCells(geometry, { width: 34, height: 16 });
  });

  it('overflows only as needed while preserving identity minima at 288x36', () => {
    const first = createDragPreviewGeometry(
      sourceRect,
      128,
      { width: 288, height: 36 },
    );
    const second = createDragPreviewGeometry(
      sourceRect,
      128,
      { width: 288, height: 36 },
    );

    expect(first).toEqual({
      previewRect: { ...sourceRect, width: 272, height: 256 },
      previewLayout: { columns: 8, mode: 'identity', rows: 16 },
    });
    expect(second).toEqual(first);
    expectFiniteMinimumCells(first, { width: 34, height: 16 });
  });

  it('keeps finite minimum identity cells for 1x1 source and bounds', () => {
    const geometry = createDragPreviewGeometry(
      { left: 0, top: 0, width: 1, height: 1 },
      128,
      { width: 1, height: 1 },
    );

    expect(geometry).toEqual({
      previewRect: {
        left: 0,
        top: 0,
        width: 272,
        height: 256,
      },
      previewLayout: { columns: 8, mode: 'identity', rows: 16 },
    });
    expectFiniteMinimumCells(geometry, { width: 34, height: 16 });
  });

  it('does not label a sub-cell single item as detail mode', () => {
    const geometry = createDragPreviewGeometry(
      { left: 0, top: 0, width: 1, height: 1 },
      1,
      { width: 1, height: 1 },
    );

    expect(geometry).toEqual({
      previewRect: {
        left: 0,
        top: 0,
        width: 34,
        height: 16,
      },
      previewLayout: { columns: 1, mode: 'identity', rows: 1 },
    });
    expectFiniteMinimumCells(geometry, { width: 34, height: 16 });
  });
});

function workspace(id: string): Workspace {
  return { id, name: id, emoji: '🗂️', createdAt: timestamp, updatedAt: timestamp };
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

function note(id: string, title: string, noteText = ''): TabItem {
  return {
    ...tab(id, title),
    itemType: 'note',
    url: '',
    note: noteText,
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
    archived: false,
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
      'workspace-a': ['inbox', 'saved', 'folder:folder-a'],
    },
    groups: [
      group('source', 'workspace-a', { tabs: sourceTabs }),
      group('target', 'workspace-a', { tabs: [tab('target-1'), tab('target-2')] }),
      group('folder-group', 'workspace-a', { folderId: 'folder-a', tabs: [tab('folder-tab')] }),
      group('other-workspace', 'workspace-b', { tabs: [tab('other-tab')] }),
    ],
  };
}

function testIsAllSourceTabs(
  dragPayload: Extract<DragPayload, { kind: 'tabs' }>,
  groups: readonly Group[],
): boolean {
  return (
    dndCore as typeof dndCore & {
      isAllSourceTabs?: (
        payload: Extract<DragPayload, { kind: 'tabs' }>,
        groups: readonly Group[],
      ) => boolean;
    }
  ).isAllSourceTabs?.(dragPayload, groups) ?? false;
}

describe('Saved All Source Tabs detection', () => {
  const exactPayload: Extract<DragPayload, { kind: 'tabs' }> = {
    kind: 'tabs',
    refs: [
      { groupId: 'source', tabId: 'a' },
      { groupId: 'source', tabId: 'b' },
      { groupId: 'source', tabId: 'c' },
      { groupId: 'source', tabId: 'd' },
    ],
    workspaceId: 'workspace-a',
  };

  it('accepts one unique valid ref for every canonical tab in one source Session', () => {
    expect(testIsAllSourceTabs(exactPayload, fixtureState().groups)).toBe(true);
  });

  it('rejects partial and multiple-source selections', () => {
    const groups = fixtureState().groups;

    expect(testIsAllSourceTabs({
      ...exactPayload,
      refs: exactPayload.refs.slice(0, 3),
    }, groups)).toBe(false);
    expect(testIsAllSourceTabs({
      ...exactPayload,
      refs: [
        { groupId: 'source', tabId: 'a' },
        { groupId: 'target', tabId: 'target-1' },
      ],
    }, groups)).toBe(false);
  });

  it('rejects duplicate, stale, and missing source refs', () => {
    const groups = fixtureState().groups;

    expect(testIsAllSourceTabs({
      ...exactPayload,
      refs: [
        { groupId: 'source', tabId: 'a' },
        { groupId: 'source', tabId: 'b' },
        { groupId: 'source', tabId: 'c' },
        { groupId: 'source', tabId: 'c' },
      ],
    }, groups)).toBe(false);
    expect(testIsAllSourceTabs({
      ...exactPayload,
      refs: [
        { groupId: 'source', tabId: 'a' },
        { groupId: 'source', tabId: 'b' },
        { groupId: 'source', tabId: 'c' },
        { groupId: 'source', tabId: 'stale' },
      ],
    }, groups)).toBe(false);
    expect(testIsAllSourceTabs({
      ...exactPayload,
      refs: exactPayload.refs.map((ref) => ({
        ...ref,
        groupId: 'missing-source',
      })),
    }, groups)).toBe(false);
  });

  it('rejects a source Session outside the payload workspace', () => {
    expect(testIsAllSourceTabs({
      ...exactPayload,
      refs: [{ groupId: 'other-workspace', tabId: 'other-tab' }],
    }, fixtureState().groups)).toBe(false);
  });
});

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
function target(kind: 'new-session-insert'): Extract<DropTarget, { kind: 'new-session-insert' }>;
function target(kind: 'group-insert'): Extract<DropTarget, { kind: 'group-insert' }>;
function target(kind: 'category-column'): Extract<DropTarget, { kind: 'category-column' }>;
function target(kind: 'category-reorder'): Extract<DropTarget, { kind: 'category-reorder' }>;
function target(kind: DropTarget['kind']): DropTarget {
  switch (kind) {
    case 'group-body':
      return { kind, groupId: 'target', workspaceId: 'workspace-a' };
    case 'tab-before':
      return { kind, groupId: 'target', tabId: 'target-2', index: 1, workspaceId: 'workspace-a' };
    case 'new-session-insert':
      return { kind, category: 'folder:folder-a', index: 1, workspaceId: 'workspace-a' };
    case 'group-insert':
      return { kind, category: 'folder:folder-a', index: 1, workspaceId: 'workspace-a' };
    case 'category-column':
      return { kind, category: 'saved', workspaceId: 'workspace-a' };
    case 'category-reorder':
      return { kind, categoryId: 'saved', placement: 'before', workspaceId: 'workspace-a' };
  }
}

function openTab(id: number, title = `Open ${id}`): OpenTabInfo {
  return {
    id,
    windowId: 7,
    title,
    url: `https://open-${id}.test`,
    favIconUrl: '',
    pinned: false,
    index: id,
    browserGroup: null,
    storable: true,
    reason: null,
  };
}

describe('drag preview snapshots', () => {
  it('copies canonical saved rows in payload order with saved link and note copy', () => {
    const state = fixtureState();
    state.groups[0] = group('source', 'workspace-a', {
      tabs: [
        tab('link', 'Saved Link'),
        note('note-with-body', 'Note title', 'Saved note body'),
        note('note-title-only', 'Fallback note title'),
      ],
    });
    const payload: Extract<DragPayload, { kind: 'tabs' }> = {
      kind: 'tabs',
      refs: [
        { groupId: 'source', tabId: 'note-with-body' },
        { groupId: 'missing', tabId: 'missing' },
        { groupId: 'source', tabId: 'link' },
        { groupId: 'source', tabId: 'note-title-only' },
        { groupId: 'source', tabId: 'link' },
      ],
      workspaceId: 'workspace-a',
    };

    expect(createDragPreviewItems(payload, state.groups, [])).toEqual([
      {
        id: 'note-with-body',
        title: 'Saved note body',
        itemType: 'note',
      },
      {
        id: 'link',
        title: 'Saved Link',
        domain: 'link.test',
        itemType: 'link',
      },
      {
        id: 'note-title-only',
        title: 'Fallback note title',
        itemType: 'note',
      },
      {
        id: 'link',
        title: 'Saved Link',
        domain: 'link.test',
        itemType: 'link',
      },
    ]);
  });

  it('copies one canonical saved row for a single-tab payload and parses bad URLs safely', () => {
    const state = fixtureState();
    state.groups[0] = group('source', 'workspace-a', {
      tabs: [{ ...tab('b', 'Broken Link'), url: 'not a URL' }],
    });

    expect(createDragPreviewItems(payload('tab'), state.groups, [])).toEqual([
      {
        id: 'b',
        title: 'Broken Link',
        itemType: 'link',
      },
    ]);
  });

  it('orders real Open Tabs records by payload IDs and uses the row title fallback', () => {
    const source = payload('open-tabs');
    source.tabIds = [102, 999, 101, 102];
    const records = [
      { ...openTab(101), title: '' },
      { ...openTab(102, 'Open Two'), url: 'https://docs.example.test/two' },
    ];

    expect(createDragPreviewItems(source, [], records)).toEqual([
      {
        id: '102',
        title: 'Open Two',
        domain: 'docs.example.test',
        itemType: 'link',
      },
      {
        id: '101',
        title: 'Untitled',
        domain: 'open-101.test',
        itemType: 'link',
      },
      {
        id: '102',
        title: 'Open Two',
        domain: 'docs.example.test',
        itemType: 'link',
      },
    ]);
  });
});

describe('resolveDrop', () => {
  it('moves a session to the end of its current category using the pre-removal boundary', () => {
    const state = fixtureState();
    const intent = resolveDrop({
      payload: payload('group'),
      target: {
        kind: 'group-insert',
        category: 'inbox',
        index: 2,
        workspaceId: 'workspace-a',
      },
      state,
    });

    expect(intent).toEqual({
      kind: 'move-session',
      groupId: 'source',
      category: 'inbox',
      index: 1,
      workspaceId: 'workspace-a',
    });
  });

  it('rejects Open Tabs without the captured records required for validation', () => {
    const state = fixtureState();
    const openTabs = [openTab(101), openTab(102)];
    const input = {
      payload: payload('open-tabs'),
      target: target('new-session-insert'),
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
      target: target('new-session-insert'),
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
    ['tab', 'tab-before', 'move-tabs'],
    ['tab', 'new-session-insert', 'create-session'],
    ['tabs', 'group-body', 'move-tabs'],
    ['tabs', 'tab-before', 'move-tabs'],
    ['tabs', 'new-session-insert', 'create-session'],
    ['open-tabs', 'group-body', 'copy-open-tabs'],
    ['open-tabs', 'tab-before', 'copy-open-tabs'],
    ['open-tabs', 'new-session-insert', 'create-session'],
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
    ['tab', 'group-insert'],
    ['tabs', 'group-insert'],
    ['tab', 'category-column'],
    ['tabs', 'category-column'],
    ['open-tabs', 'group-insert'],
    ['open-tabs', 'category-column'],
  ] as const)('rejects %s onto session-only %s', (sourceKind, targetKind) => {
    expect(resolveDrop({
      payload: payload(sourceKind),
      target: target(targetKind),
      state: fixtureState(),
      openTabs: sourceKind === 'open-tabs' ? [openTab(101), openTab(102)] : undefined,
    })).toBeNull();
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
      target: { ...target('new-session-insert'), index: -1 },
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
    expect(resolveDrop({ payload: { ...base, tabIds: [] }, target: target('new-session-insert'), state })).toBeNull();
    expect(resolveDrop({ payload: { ...base, tabIds: [101, 101] }, target: target('new-session-insert'), state })).toBeNull();
    expect(resolveDrop({ payload: { ...base, tabIds: [101, Number.MAX_SAFE_INTEGER + 1] }, target: target('new-session-insert'), state })).toBeNull();
    expect(resolveDrop({ payload: { ...base, windowId: Number.NaN }, target: target('new-session-insert'), state })).toBeNull();
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
      target: { kind: 'category-reorder', categoryId: 'saved', placement: 'before', workspaceId: 'workspace-a' },
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
      target: { kind: 'new-session-insert', category: 42, index: 0, workspaceId: 'workspace-a' } as unknown as DropTarget,
      state,
    })).toBeNull();
    expect(resolveDrop({
      payload: payload('category'),
      target: { kind: 'category-reorder', categoryId: 'saved', placement: 'sideways', workspaceId: 'workspace-a' } as unknown as DropTarget,
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
      categoryOrderByWorkspace: { 'workspace-a': ['inbox', 'saved'] },
    };
    const beforeNoOp = resolveDrop({
      payload: { kind: 'category', categoryId: 'inbox', workspaceId: 'workspace-a' },
      target: { kind: 'category-reorder', categoryId: 'saved', placement: 'before', workspaceId: 'workspace-a' },
      state,
    });
    const afterNoOp = resolveDrop({
      payload: { kind: 'category', categoryId: 'saved', workspaceId: 'workspace-a' },
      target: { kind: 'category-reorder', categoryId: 'inbox', placement: 'after', workspaceId: 'workspace-a' },
      state,
    });
    const beforeReorder = resolveDrop({
      payload: { kind: 'category', categoryId: 'saved', workspaceId: 'workspace-a' },
      target: { kind: 'category-reorder', categoryId: 'inbox', placement: 'before', workspaceId: 'workspace-a' },
      state,
    });
    const afterReorder = resolveDrop({
      payload: { kind: 'category', categoryId: 'inbox', workspaceId: 'workspace-a' },
      target: { kind: 'category-reorder', categoryId: 'saved', placement: 'after', workspaceId: 'workspace-a' },
      state,
    });

    expect(beforeNoOp).toBeNull();
    expect(afterNoOp).toBeNull();
    expect(beforeReorder).toMatchObject({
      kind: 'reorder-category',
      placement: 'before',
      expectedCategoryOrder: [
        'inbox',
        'saved',
        'archive',
        'folder:folder-a',
      ],
    });
    expect(afterReorder).toMatchObject({
      kind: 'reorder-category',
      placement: 'after',
      expectedCategoryOrder: [
        'inbox',
        'saved',
        'archive',
        'folder:folder-a',
      ],
    });
  });

  it('preserves raw folder category order while resolving a reorder', () => {
    const state = {
      ...fixtureState(),
      categoryOrderByWorkspace: { 'workspace-a': ['folder-a', 'saved', 'inbox'] },
    };
    const result = resolveDrop({
      payload: { kind: 'category', categoryId: 'saved', workspaceId: 'workspace-a' },
      target: { kind: 'category-reorder', categoryId: 'folder:folder-a', placement: 'before', workspaceId: 'workspace-a' },
      state,
    });

    expect(result).toMatchObject({ kind: 'reorder-category', categoryId: 'saved' });
    expect(executeDropIntent(state, result! ).categoryOrderByWorkspace['workspace-a']).toEqual([
      'saved', 'folder:folder-a', 'inbox', 'archive',
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
        targetCategoryId: 'saved',
        placement: 'before',
        workspaceId: 'workspace-b',
        expectedCategoryOrder: ['inbox', 'saved', 'archive'],
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
    const createOpenSession = resolveDrop({ payload: payload('open-tabs'), target: target('new-session-insert'), state: before, openTabs: openTabRecords });
    const createSavedSession = resolveDrop({ payload: payload('tab'), target: target('new-session-insert'), state: before });
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
    expect(reordered.categoryOrderByWorkspace['workspace-a']).toEqual(['inbox', 'folder:folder-a', 'saved', 'archive']);
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
      previewRect: { width: 320, height: 280, top: 10, left: 20 },
      previewLayout: { columns: 2, mode: 'details', rows: 2 },
      marker: { kind: 'group', index: 0 },
      previewItems: [{
        id: 'b',
        title: 'Saved Link',
        domain: 'b.test',
        itemType: 'link',
      }],
    };

    const first = clearDragState(activeDragState);
    const second = clearDragState(activeDragState);

    expect(first).toEqual(IDLE_DRAG_STATE);
    expect(first.previewItems).toEqual([]);
    expect(first.previewRect).toBeNull();
    expect(first.previewLayout).toBeNull();
    expect(Object.isFrozen(first.previewItems)).toBe(true);
    expect(first.previewItems).not.toBe(second.previewItems);
    expect(Object.keys(first)).toContain('previewItems');
    expect(Object.getOwnPropertyDescriptor(first, 'previewItems')).toMatchObject({
      configurable: true,
      enumerable: true,
      writable: true,
    });
    expect(activeDragState.payload).not.toBeNull();
    expect(activeDragState.previewItems).toHaveLength(1);
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
