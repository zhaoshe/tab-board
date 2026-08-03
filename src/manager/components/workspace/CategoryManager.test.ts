// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  Folder,
  Group,
} from '../../../shared/model';
import type {
  CategoryFilter,
  CategoryStripItem,
} from '../../core/selectors';
import { CategoryManager } from './CategoryManager';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const timestamp = '2026-07-31T00:00:00.000Z';
const workspaceId = 'workspace-a';
const workFolder: Folder = {
  id: 'folder-work',
  workspaceId,
  name: 'Work',
  color: '#40c057',
  collapsed: false,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const lockedFolder: Folder = {
  ...workFolder,
  id: 'folder-locked',
  name: 'Locked',
  color: '#fa5252',
};
const folders = [workFolder, lockedFolder];
const categories: CategoryStripItem[] = [
  { id: 'saved', label: 'Saved', count: 1, kind: 'saved' },
  {
    id: 'folder:folder-work',
    label: 'Work',
    count: 2,
    kind: 'folder',
    folderId: 'folder-work',
  },
  { id: 'inbox', label: 'Inbox', count: 0, kind: 'inbox' },
  {
    id: 'folder:folder-locked',
    label: 'Locked',
    count: 1,
    kind: 'folder',
    folderId: 'folder-locked',
  },
  { id: 'archive', label: 'Archive', count: 0, kind: 'archive' },
];

function group(
  id: string,
  folderId: string | null,
  locked = false,
  groupWorkspaceId = workspaceId,
): Group {
  return {
    id,
    title: id,
    note: '',
    workspaceId: groupWorkspaceId,
    folderId,
    locked,
    starred: false,
    archived: false,
    collapsed: false,
    tabs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const groups = [
  group('work-a', workFolder.id),
  group('work-b', workFolder.id),
  group('locked-a', lockedFolder.id, true),
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function buttonWithText(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

function action(label: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!button) throw new Error(`Missing action: ${label}`);
  return button;
}

function row(categoryId: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    `[data-category-manager-id="${categoryId}"]`,
  );
  if (!element) throw new Error(`Missing category row: ${categoryId}`);
  return element;
}

async function changeInput(
  input: HTMLInputElement,
  value: string,
): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function openManager(): Promise<void> {
  await act(async () => action('Category Options').click());
  await act(async () => buttonWithText('Manage Categories').click());
}

async function mountManager(
  overrides: Partial<Parameters<typeof CategoryManager>[0]> = {},
) {
  container = document.createElement('div');
  container.id = 'manager-main';
  document.body.append(container);
  const props = {
    workspaceId,
    categories,
    folders,
    groups,
    selectedCategory: 'inbox' as const,
    onSelectCategory: vi.fn(),
    onAddFolder: vi.fn(),
    onUpdateFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    onUpdateOrder: vi.fn(),
    ...overrides,
  };
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(
      MantineProvider,
      null,
      createElement(CategoryManager, props),
    ));
  });
  return props;
}

async function rerenderManager(
  props: Parameters<typeof CategoryManager>[0],
): Promise<void> {
  await act(async () => {
    root?.render(createElement(
      MantineProvider,
      null,
      createElement(CategoryManager, props),
    ));
  });
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('CategoryManager unified ordering', () => {
  it('keeps Add in the management header, count context under the title, and Done in the footer', async () => {
    await mountManager();
    await openManager();

    const manager = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
      .find((dialog) => dialog.textContent?.includes('Manage Categories'))!;
    const header = manager.querySelector<HTMLElement>('.mantine-Modal-header')!;
    const add = [...header.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Add Category')!;
    const done = buttonWithText('Done');

    expect(add).not.toBeNull();
    expect(header.contains(add)).toBe(true);
    expect(manager.querySelector('.mantine-Modal-body')?.contains(add)).toBe(false);
    expect(header.textContent).toContain('5 Categories · drag to reorder');
    expect(done.closest('.manager-management-footer')).not.toBeNull();
  });

  it('keeps built-in and custom categories in one canonical dense list', async () => {
    await mountManager();
    await openManager();

    expect([
      ...document.querySelectorAll<HTMLElement>('[data-category-manager-id]'),
    ].map((item) => item.dataset.categoryManagerId)).toEqual(
      categories.map(({ id }) => id),
    );
    expect(document.querySelector('[data-category-drag-handle]')).toBeNull();

    for (const category of categories) {
      const labels = [...row(category.id).querySelectorAll<HTMLButtonElement>('button')]
        .map((button) => button.getAttribute('aria-label'));
      expect(labels).toEqual(category.kind === 'folder'
        ? [
            `Move ${category.label} up`,
            `Move ${category.label} down`,
            `Edit ${category.label}`,
            `Delete ${category.label}`,
          ]
        : [
            `Move ${category.label} up`,
            `Move ${category.label} down`,
          ]);
    }
    expect(row('inbox').classList).toContain(
      'manager-category-manager-row--active',
    );
    expect(row('saved').classList).not.toContain(
      'manager-category-manager-row--active',
    );
    for (const category of categories) {
      const categoryRow = row(category.id);
      expect(categoryRow.getAttribute('role')).toBe('group');
      expect(categoryRow.getAttribute('aria-label')).toBe(
        `${category.label} Category`,
      );
      expect(categoryRow.querySelector(
        '.manager-category-manager-row__name',
      )?.textContent).toBe(category.label);
      expect(categoryRow.querySelector(
        '.manager-category-manager-row__meta',
      )?.textContent).toContain(
        category.kind === 'folder' ? 'Custom' : 'Built-in',
      );
    }
  });

  it('publishes the same complete order from row drag and Move actions', async () => {
    const props = await mountManager();
    await openManager();
    const saved = row('saved');
    const archive = row('archive');
    const setData = vi.fn();
    const dragStart = new Event('dragstart', { bubbles: true });
    Object.defineProperty(dragStart, 'dataTransfer', {
      value: { effectAllowed: '', setData },
    });

    await act(async () => saved.dispatchEvent(dragStart));
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { getData: () => 'saved' },
    });
    Object.defineProperty(drop, 'clientY', { value: 100 });
    Object.defineProperty(archive, 'getBoundingClientRect', {
      value: () => ({
        top: 0,
        bottom: 40,
        height: 40,
        left: 0,
        right: 200,
        width: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    await act(async () => archive.dispatchEvent(drop));

    expect(saved.getAttribute('draggable')).toBe('true');
    expect(setData).toHaveBeenCalledWith(
      'application/x-tabboard-category',
      'saved',
    );
    expect(props.onUpdateOrder).toHaveBeenLastCalledWith(
      [
        'folder:folder-work',
        'inbox',
        'folder:folder-locked',
        'archive',
        'saved',
      ],
      { expectedCategoryOrder: categories.map(({ id }) => id) },
    );

    await act(async () => action('Move Inbox up').click());
    expect(props.onUpdateOrder).toHaveBeenLastCalledWith(
      [
        'saved',
        'inbox',
        'folder:folder-work',
        'folder:folder-locked',
        'archive',
      ],
      { expectedCategoryOrder: categories.map(({ id }) => id) },
    );
  });

  it('suppresses adjacent semantic no-ops from native row drag', async () => {
    const props = await mountManager();
    await openManager();
    const saved = row('saved');
    const work = row('folder:folder-work');
    const dragStart = new Event('dragstart', { bubbles: true });
    Object.defineProperty(dragStart, 'dataTransfer', {
      value: { effectAllowed: '', setData: vi.fn() },
    });
    Object.defineProperty(work, 'getBoundingClientRect', {
      value: () => ({
        top: 0,
        bottom: 40,
        height: 40,
        left: 0,
        right: 200,
        width: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    await act(async () => saved.dispatchEvent(dragStart));
    const beforeNext = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(beforeNext, 'dataTransfer', {
      value: { getData: () => 'saved' },
    });
    Object.defineProperty(beforeNext, 'clientY', { value: 1 });
    await act(async () => work.dispatchEvent(beforeNext));

    await act(async () => work.dispatchEvent(dragStart));
    const afterPrevious = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(afterPrevious, 'dataTransfer', {
      value: { getData: () => 'folder:folder-work' },
    });
    Object.defineProperty(afterPrevious, 'clientY', { value: 39 });
    Object.defineProperty(saved, 'getBoundingClientRect', {
      value: () => ({
        top: 0,
        bottom: 40,
        height: 40,
        left: 0,
        right: 200,
        width: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    await act(async () => saved.dispatchEvent(afterPrevious));

    expect(props.onUpdateOrder).not.toHaveBeenCalled();
  });

  it('submits the rendered order snapshot when authority changed before a Move action', async () => {
    const renderedOrder = categories.map(({ id }) => id);
    const authoritativeOrder = [
      'archive',
      'saved',
      'folder:folder-work',
      'inbox',
      'folder:folder-locked',
    ];
    const onUpdateOrder = vi.fn(async (
      _order: CategoryFilter[],
      options: { expectedCategoryOrder: CategoryFilter[] },
    ) => {
      if (
        options.expectedCategoryOrder.some(
          (id, index) => id !== authoritativeOrder[index],
        )
      ) {
        throw Object.assign(
          new Error('Category order changed before the reorder could be applied.'),
          { code: 'CATEGORY_MUTATION_CONFLICT' },
        );
      }
    });
    await mountManager({ onUpdateOrder });
    await openManager();

    await act(async () => action('Move Inbox up').click());

    expect(onUpdateOrder).toHaveBeenCalledWith(
      [
        'saved',
        'inbox',
        'folder:folder-work',
        'folder:folder-locked',
        'archive',
      ],
      { expectedCategoryOrder: renderedOrder },
    );
    expect(authoritativeOrder).toEqual([
      'archive',
      'saved',
      'folder:folder-work',
      'inbox',
      'folder:folder-locked',
    ]);
    expect(document.body.textContent).toContain(
      'Category order changed before the reorder could be applied.',
    );
  });
});

describe('CategoryManager shared editor', () => {
  it('creates a trimmed NFC name with its chosen color', async () => {
    const props = await mountManager();
    await act(async () => action('Category Options').click());
    await act(async () => buttonWithText('Add Category').click());
    const name = document.querySelector<HTMLInputElement>(
      'input[name="category-name"]',
    );
    if (!name) throw new Error('Missing category name input.');

    await changeInput(name, '  Cafe\u0301  ');
    await act(async () => action('Use Color #7950f2').click());
    await act(async () => buttonWithText('Create Category').click());

    expect(props.onAddFolder).toHaveBeenCalledWith('Café', '#7950f2');
  });

  it('uses the same name and color editor for Edit with prefilled values and self exclusion', async () => {
    const props = await mountManager();
    await openManager();
    await act(async () => action('Edit Work').click());

    const name = document.querySelector<HTMLInputElement>(
      'input[name="category-name"]',
    );
    expect(name?.value).toBe('Work');
    expect(action('Use Color #40c057').getAttribute('aria-pressed')).toBe('true');
    expect(buttonWithText('Save Category').disabled).toBe(false);

    await changeInput(name!, 'Work Plans');
    await act(async () => action('Use Color #fab005').click());
    await act(async () => buttonWithText('Save Category').click());

    expect(props.onUpdateFolder).toHaveBeenCalledWith(
      'folder-work',
      { name: 'Work Plans', color: '#fab005' },
      { name: 'Work', color: '#40c057' },
    );
  });

  it('keeps the edit-open snapshot when a remote folder change rerenders the manager', async () => {
    let authoritativeFolder = workFolder;
    const onUpdateFolder = vi.fn(async (
      _folderId: string,
      _updates: { name: string; color: string },
      expected: { name: string; color: string },
    ) => {
      if (
        expected.name !== authoritativeFolder.name
        || expected.color !== authoritativeFolder.color
      ) {
        throw Object.assign(
          new Error('Category changed before the edit could be applied.'),
          { code: 'CATEGORY_MUTATION_CONFLICT' },
        );
      }
    });
    const props = await mountManager({ onUpdateFolder });
    await openManager();
    await act(async () => action('Edit Work').click());

    authoritativeFolder = {
      ...workFolder,
      name: 'Remote Work',
      color: '#fa5252',
      updatedAt: '2026-07-31T01:00:00.000Z',
    };
    await rerenderManager({
      ...props,
      folders: [authoritativeFolder, lockedFolder],
    });
    const name = document.querySelector<HTMLInputElement>(
      'input[name="category-name"]',
    );
    await changeInput(name!, 'Local Work');
    await act(async () => buttonWithText('Save Category').click());

    expect(onUpdateFolder).toHaveBeenCalledWith(
      'folder-work',
      { name: 'Local Work', color: '#40c057' },
      { name: 'Work', color: '#40c057' },
    );
    expect(authoritativeFolder).toMatchObject({
      name: 'Remote Work',
      color: '#fa5252',
    });
    expect(document.body.textContent).toContain(
      'Category changed before the edit could be applied.',
    );
  });

  it('disables Create and Edit submit for NFC case-insensitive duplicates', async () => {
    await mountManager();
    await act(async () => action('Category Options').click());
    await act(async () => buttonWithText('Add Category').click());
    const name = document.querySelector<HTMLInputElement>(
      'input[name="category-name"]',
    );
    await changeInput(name!, '  WORK  ');

    expect(buttonWithText('Create Category').disabled).toBe(true);
    expect(document.body.textContent).toContain(
      'A category with this name already exists in this workspace.',
    );
  });

  it('shows and preserves an existing legacy named color until changed', async () => {
    const legacyFolder = { ...workFolder, color: 'slate' };
    const props = await mountManager({
      folders: [legacyFolder, lockedFolder],
    });
    await openManager();
    expect(
      row('folder:folder-work')
        .querySelector<HTMLElement>('.manager-category-manager-swatch')
        ?.style.backgroundColor,
    ).toBe('#868e96');
    await act(async () => action('Edit Work').click());

    const legacy = action('Keep Legacy Color slate');
    expect(legacy.getAttribute('aria-pressed')).toBe('true');
    expect(legacy.querySelector('[data-category-color="slate"]')).not.toBeNull();
    await act(async () => buttonWithText('Save Category').click());

    expect(props.onUpdateFolder).toHaveBeenCalledWith(
      'folder-work',
      { name: 'Work', color: 'slate' },
      { name: 'Work', color: 'slate' },
    );
  });
});

describe('CategoryManager delete safety', () => {
  it('disables Delete when any affected Session is locked and explains why', async () => {
    await mountManager();
    await openManager();

    const deleteLocked = action('Delete Locked');
    expect(deleteLocked.disabled).toBe(true);
    expect(deleteLocked.querySelector('.lucide-trash')).not.toBeNull();
    expect(deleteLocked.querySelector('.lucide-trash-2')).toBeNull();
    expect(deleteLocked.getAttribute('aria-description')).toBe(
      'Unlock every Session before deleting this Category',
    );
  });

  it('ignores stale cross-workspace folder references for count and lock safety', async () => {
    await mountManager({
      groups: [
        ...groups,
        group('stale-cross-workspace', workFolder.id, true, 'workspace-b'),
      ],
    });
    await openManager();

    expect(action('Delete Work').disabled).toBe(false);
    await act(async () => action('Delete Work').click());
    const confirmation = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
      .find((dialog) => dialog.textContent?.includes('Delete Category'));
    expect(confirmation?.textContent).toContain('2 Sessions');
    expect(confirmation?.textContent).not.toContain('3 Sessions');
  });

  it('never deletes immediately and confirms the affected Session count and Inbox destination', async () => {
    const props = await mountManager();
    await openManager();
    await act(async () => action('Delete Work').click());

    expect(props.onDeleteFolder).not.toHaveBeenCalled();
    const confirmation = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
      .find((dialog) => dialog.textContent?.includes('Delete Category'));
    expect(confirmation?.textContent).toContain('2 Sessions');
    expect(confirmation?.textContent).toContain('Inbox');

    await act(async () => buttonWithText('Delete Category').click());
    expect(props.onDeleteFolder).toHaveBeenCalledTimes(1);
    expect(props.onDeleteFolder).toHaveBeenCalledWith('folder-work');
  });

  it('returns focus to the exact Delete trigger on cancel', async () => {
    vi.useFakeTimers();
    await mountManager();
    await openManager();
    const deleteTrigger = action('Delete Work');
    await act(async () => deleteTrigger.click());

    await act(async () => buttonWithText('Cancel').click());
    await act(async () => vi.runAllTimers());
    expect(document.activeElement).toBe(deleteTrigger);
  });

  it('locks confirmation controls while delete is pending', async () => {
    let resolveDelete!: () => void;
    const pendingDelete = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    const props = await mountManager({
      onDeleteFolder: vi.fn(() => pendingDelete),
    });
    await openManager();
    await act(async () => action('Delete Work').click());
    const cancel = buttonWithText('Cancel');
    await act(async () => buttonWithText('Delete Category').click());

    expect(props.onDeleteFolder).toHaveBeenCalledTimes(1);
    expect(cancel.disabled).toBe(true);
    expect(action('Deleting Category…').disabled).toBe(true);

    await act(async () => resolveDelete());
    expect(document.querySelector('button[aria-label="Deleting Category…"]'))
      .toBeNull();
  });

  it('keeps rejected delete open, retries, then navigates a selected category to Inbox', async () => {
    const onDeleteFolder = vi.fn()
      .mockRejectedValueOnce(new Error('Category changed before deletion.'))
      .mockResolvedValueOnce(undefined);
    const props = await mountManager({
      selectedCategory: 'folder:folder-work',
      onDeleteFolder,
    });
    await openManager();
    await act(async () => action('Delete Work').click());

    await act(async () => buttonWithText('Delete Category').click());
    expect(onDeleteFolder).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain(
      'Category changed before deletion.',
    );
    expect(props.onSelectCategory).not.toHaveBeenCalled();

    await act(async () => buttonWithText('Delete Category').click());
    expect(onDeleteFolder).toHaveBeenCalledTimes(2);
    expect(props.onSelectCategory).toHaveBeenCalledWith('inbox');
  });
});

describe('CategoryManager focus and nested modal ownership', () => {
  it('returns Manage and direct Add to the visible Category Options trigger', async () => {
    vi.useFakeTimers();
    await mountManager();
    const trigger = action('Category Options');

    await act(async () => trigger.click());
    await act(async () => buttonWithText('Manage Categories').click());
    await act(async () => buttonWithText('Done').click());
    await act(async () => vi.runAllTimers());
    expect(document.activeElement).toBe(trigger);

    await act(async () => trigger.click());
    await act(async () => buttonWithText('Add Category').click());
    await act(async () => buttonWithText('Cancel').click());
    await act(async () => vi.runAllTimers());
    expect(document.activeElement).toBe(trigger);
  });

  it('makes Manage Categories inert while nested Edit is open', async () => {
    vi.useFakeTimers();
    await mountManager();
    await openManager();
    await act(async () => action('Edit Work').click());

    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    expect(dialogs).toHaveLength(2);
    expect(dialogs[0].hasAttribute('inert')).toBe(true);
    expect(dialogs[0].getAttribute('aria-hidden')).toBe('true');

    await act(async () => buttonWithText('Cancel').click());
    await act(async () => vi.runAllTimers());
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('[role="dialog"]')?.hasAttribute('inert'))
      .toBe(false);
  });

  it('returns nested Edit Escape focus to the exact row action', async () => {
    await mountManager();
    await openManager();
    const trigger = action('Edit Work');
    await act(async () => trigger.focus());
    await act(async () => trigger.click());

    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    await act(async () => {
      dialogs[1]?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(trigger.tabIndex).toBe(0);
    expect(trigger.closest('[data-category-manager-id]')?.hasAttribute(
      'data-actions-visible',
    )).toBe(true);
  });
});
