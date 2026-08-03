// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TabItem } from '../../../shared/model';
import { managerTheme } from '../../../shared/styles/theme';
import { SessionSelectionToolbar } from './SessionSelectionToolbar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const timestamp = '2026-08-01T00:00:00.000Z';

function item(
  id: string,
  itemType: TabItem['itemType'],
): TabItem {
  return {
    id,
    itemType,
    title: id,
    url: itemType === 'link' ? `https://${id}.example/` : '',
    favIconUrl: '',
    note: itemType === 'note' ? `${id} note` : '',
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

const linkA = item('link-a', 'link');
const linkB = item('link-b', 'link');
const noteA = item('note-a', 'note');

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function createProps(
  overrides: Partial<ComponentProps<typeof SessionSelectionToolbar>> = {},
) {
  return {
    groupId: 'source-session',
    locked: false,
    selectedItems: [linkA, noteA],
    selectedTabIds: new Set([linkA.id, noteA.id]),
    visibleTabIds: [linkA.id, noteA.id],
    onChangeVisibleSelection: vi.fn(),
    onRestore: vi.fn(async () => []),
    onCopy: vi.fn(async () => undefined),
    onMove: vi.fn(),
    onDelete: vi.fn(async () => undefined),
    onRemoveSelection: vi.fn(),
    onClearSelection: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
}

async function mountToolbar(
  overrides: Partial<ComponentProps<typeof SessionSelectionToolbar>> = {},
) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const props = createProps(overrides);
  await act(async () => {
    root?.render(createElement(
      MantineProvider,
      { theme: managerTheme },
      createElement(SessionSelectionToolbar, props),
    ));
  });
  return props;
}

function action(label: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!button) throw new Error(`Missing toolbar action: ${label}`);
  return button;
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
});

describe('SessionSelectionToolbar action matrix', () => {
  it('uses the confirmed Restore and Trash glyphs for batch actions', async () => {
    await mountToolbar();

    const restore = action('Restore Selected Links');
    const remove = action('Delete Selected Items');
    expect(restore.querySelector('.lucide-square-arrow-out-up-right')).not.toBeNull();
    expect(restore.querySelector('.lucide-rotate-ccw')).toBeNull();
    expect(remove.querySelector('.lucide-trash')).not.toBeNull();
    expect(remove.querySelector('.lucide-trash-2')).toBeNull();
  });

  it.each([
    {
      label: 'empty',
      selectedItems: [],
      locked: false,
      enabled: { restore: false, copy: false, move: false, delete: false },
    },
    {
      label: 'links',
      selectedItems: [linkA, linkB],
      locked: false,
      enabled: { restore: true, copy: true, move: true, delete: true },
    },
    {
      label: 'notes',
      selectedItems: [noteA],
      locked: false,
      enabled: { restore: false, copy: false, move: true, delete: true },
    },
    {
      label: 'mixed',
      selectedItems: [linkA, noteA],
      locked: false,
      enabled: { restore: true, copy: true, move: true, delete: true },
    },
    {
      label: 'locked mixed',
      selectedItems: [linkA, noteA],
      locked: true,
      enabled: { restore: false, copy: true, move: false, delete: false },
    },
  ])('enforces the $label availability contract', async ({
    selectedItems,
    locked,
    enabled,
  }) => {
    await mountToolbar({
      locked,
      selectedItems,
      selectedTabIds: new Set(selectedItems.map(({ id }) => id)),
    });

    expect(document.querySelector('.session-selection-toolbar')?.textContent)
      .toContain(`${selectedItems.length} Selected`);
    expect(action('Restore Selected Links').disabled).toBe(!enabled.restore);
    expect(action('Copy Selected URLs').disabled).toBe(!enabled.copy);
    expect(action('Move Selected Items').disabled).toBe(!enabled.move);
    expect(action('Delete Selected Items').disabled).toBe(!enabled.delete);
    expect(action('Exit Session Selection Mode').disabled).toBe(false);
  });

  it('selects or unselects visible IDs only while preserving hidden selection', async () => {
    const selectProps = await mountToolbar({
      selectedItems: [linkA],
      selectedTabIds: new Set([linkA.id, 'hidden-selected']),
      visibleTabIds: [linkA.id, linkB.id, noteA.id],
    });

    await act(async () => action('Select All Visible Items').click());
    expect(selectProps.onChangeVisibleSelection).toHaveBeenCalledWith(
      [linkA.id, linkB.id, noteA.id],
      true,
    );

    await act(async () => root?.unmount());
    root = null;
    document.body.innerHTML = '';

    const unselectProps = await mountToolbar({
      selectedItems: [linkA, linkB, noteA],
      selectedTabIds: new Set([
        linkA.id,
        linkB.id,
        noteA.id,
        'hidden-selected',
      ]),
      visibleTabIds: [linkA.id, linkB.id, noteA.id],
    });
    await act(async () => action('Unselect All Visible Items').click());
    expect(unselectProps.onChangeVisibleSelection).toHaveBeenCalledWith(
      [linkA.id, linkB.id, noteA.id],
      false,
    );
  });
});

describe('SessionSelectionToolbar async lifecycle', () => {
  it('restores selected links in one action and clears only after success', async () => {
    let resolveRestore!: (restoredTabIds: readonly string[]) => void;
    const onRestore = vi.fn(() => new Promise<readonly string[]>((resolve) => {
      resolveRestore = resolve;
    }));
    const props = await mountToolbar({
      onRestore,
      onRemoveSelection: vi.fn(),
    });

    await act(async () => action('Restore Selected Links').click());
    expect(onRestore).toHaveBeenCalledWith([
      { groupId: 'source-session', tabId: linkA.id },
    ]);
    expect(props.onClearSelection).not.toHaveBeenCalled();

    await act(async () => resolveRestore([linkA.id]));
    expect(props.onRemoveSelection).toHaveBeenCalledWith([linkA.id]);
    expect(props.onClearSelection).not.toHaveBeenCalled();
    expect(props.onExit).not.toHaveBeenCalled();
  });

  it('removes only restored link IDs and retains failed links in active mode', async () => {
    const onRestore = vi.fn(async () => [linkA.id]);
    const props = await mountToolbar({
      selectedItems: [linkA, linkB],
      selectedTabIds: new Set([linkA.id, linkB.id]),
      visibleTabIds: [linkA.id, linkB.id],
      onRestore,
      onRemoveSelection: vi.fn(),
    });

    await act(async () => action('Restore Selected Links').click());

    expect(props.onRemoveSelection).toHaveBeenCalledWith([linkA.id]);
    expect(props.onClearSelection).not.toHaveBeenCalled();
    expect(props.onExit).not.toHaveBeenCalled();
  });

  it('reports every selected link ID when the whole restore batch succeeds', async () => {
    const props = await mountToolbar({
      selectedItems: [linkA, linkB],
      selectedTabIds: new Set([linkA.id, linkB.id]),
      visibleTabIds: [linkA.id, linkB.id],
      onRestore: vi.fn(async () => [linkA.id, linkB.id]),
      onRemoveSelection: vi.fn(),
    });

    await act(async () => action('Restore Selected Links').click());

    expect(props.onRemoveSelection).toHaveBeenCalledWith([
      linkA.id,
      linkB.id,
    ]);
    expect(props.onClearSelection).not.toHaveBeenCalled();
    expect(props.onExit).not.toHaveBeenCalled();
  });

  it('removes no selected IDs when the whole restore batch fails', async () => {
    const props = await mountToolbar({
      selectedItems: [linkA, linkB],
      selectedTabIds: new Set([linkA.id, linkB.id]),
      visibleTabIds: [linkA.id, linkB.id],
      onRestore: vi.fn(async () => []),
      onRemoveSelection: vi.fn(),
    });

    await act(async () => action('Restore Selected Links').click());

    expect(props.onRemoveSelection).toHaveBeenCalledWith([]);
    expect(props.onClearSelection).not.toHaveBeenCalled();
    expect(props.onExit).not.toHaveBeenCalled();
  });

  it('preserves IDs and mode when restore or delete rejects', async () => {
    const props = await mountToolbar({
      onRestore: vi.fn(async () => {
        throw new Error('restore rejected');
      }),
      onDelete: vi.fn(async () => {
        throw new Error('delete rejected');
      }),
    });

    await act(async () => action('Restore Selected Links').click());
    await act(async () => action('Delete Selected Items').click());

    expect(props.onClearSelection).not.toHaveBeenCalled();
    expect(props.onExit).not.toHaveBeenCalled();
  });

  it('copies selected link URLs once and preserves the current selection', async () => {
    const props = await mountToolbar();

    await act(async () => action('Copy Selected URLs').click());

    expect(props.onCopy).toHaveBeenCalledTimes(1);
    expect(props.onCopy).toHaveBeenCalledWith([linkA.url]);
    expect(props.onClearSelection).not.toHaveBeenCalled();
    expect(props.onExit).not.toHaveBeenCalled();
  });

  it('clears selected IDs after one authoritative delete succeeds but keeps mode', async () => {
    const props = await mountToolbar();

    await act(async () => action('Delete Selected Items').click());

    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(props.onDelete).toHaveBeenCalledWith([
      { groupId: 'source-session', tabId: linkA.id },
      { groupId: 'source-session', tabId: noteA.id },
    ]);
    expect(props.onClearSelection).toHaveBeenCalledTimes(1);
    expect(props.onExit).not.toHaveBeenCalled();
  });

  it('retains an over-limit delete selection so the user can reduce and retry', async () => {
    const selectedItems = Array.from(
      { length: 81 },
      (_, index) => item(`limit-${index}`, 'link'),
    );
    const onDelete = vi.fn(async () => {
      throw new Error('Delete up to 80 selected items at a time.');
    });
    const props = await mountToolbar({
      selectedItems,
      selectedTabIds: new Set(selectedItems.map(({ id }) => id)),
      visibleTabIds: selectedItems.map(({ id }) => id),
      onDelete,
    });

    await act(async () => action('Delete Selected Items').click());

    expect(onDelete).toHaveBeenCalledWith(selectedItems.map(({ id }) => ({
      groupId: 'source-session',
      tabId: id,
    })));
    expect(props.onClearSelection).not.toHaveBeenCalled();
    expect(props.onExit).not.toHaveBeenCalled();
    expect(document.querySelector('.session-selection-toolbar')?.textContent)
      .toContain('81 Selected');
  });

  it('passes the Move trigger without clearing selection and exits explicitly', async () => {
    const props = await mountToolbar();
    const move = action('Move Selected Items');

    await act(async () => move.click());
    expect(props.onMove).toHaveBeenCalledWith(move);
    expect(props.onClearSelection).not.toHaveBeenCalled();

    await act(async () => action('Exit Session Selection Mode').click());
    expect(props.onExit).toHaveBeenCalledTimes(1);
  });
});
